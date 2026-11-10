import { Context, Effect, Layer, Schema } from "effect"
import * as Redis from "effect/persistence/Redis"
import { createHash } from "node:crypto"

/**
 * Store-level existence outcomes kept deliberately coarse: the parent owns the
 * public session vocabulary and never exposes a key or encoded payload here.
 */
type CreateOutcome =
  | { readonly _tag: "Created"; readonly observedAtEpochMilliseconds: number }
  | { readonly _tag: "Exists" }

type InvalidateOutcome = "expired" | "missing" | "removed"

/** `observedAtEpochMilliseconds` is the Redis `TIME` read inside the atomic transition that returned the payload. */
type ReadOutcome =
  | { readonly _tag: "Current"; readonly observedAtEpochMilliseconds: number; readonly payload: string }
  | { readonly _tag: "Expired" }
  | { readonly _tag: "Missing" }

interface RefreshStoreInput {
  readonly activity: "excluded" | "qualifying"
  readonly idleTimeoutMilliseconds: number
  readonly receivedAt: number
  readonly reference: string
  readonly tenantAlias: string
  readonly warningLeadMinutes: number
}

/** Opaque reference already validated by the session parent. */
interface SessionStoreAddress {
  readonly reference: string
}

type StoreTransition =
  | { readonly _tag: "Current"; readonly observedAtEpochMilliseconds: number; readonly payload: string }
  | { readonly _tag: "Expired" }
  | { readonly _tag: "Mismatch" }
  | { readonly _tag: "Missing" }
  | { readonly _tag: "Renewed"; readonly observedAtEpochMilliseconds: number; readonly payload: string }

class SessionStoreUnavailable extends Schema.TaggedError<SessionStoreUnavailable>()(
  "SessionStoreUnavailable",
  {}
) {}

const keyFor = (prefix: string, reference: string): string => {
  const digest = createHash("sha256").update(reference).digest("base64url")
  return `${prefix}:${digest}`
}

/**
 * The session script's replies. "malformed" and "rejected" are deliberately absent: they decode as unavailable,
 * like any reply the script should never produce.
 */
const TransitionReply = Schema.Union([
  Schema.Tuple([Schema.Literals(["expired", "mismatch", "missing"])]),
  Schema.Tuple([Schema.Literals(["current", "renewed"]), Schema.String, Schema.NumberFromString])
])

const decodeTransitionReply = Schema.decodeUnknownEffect(TransitionReply)

const transitionTags = {
  current: "Current",
  expired: "Expired",
  mismatch: "Mismatch",
  missing: "Missing",
  renewed: "Renewed"
} as const

const toTransition = (reply: typeof TransitionReply.Type): StoreTransition =>
  reply.length === 1 ?
    { _tag: transitionTags[reply[0]] } :
    { _tag: transitionTags[reply[0]], observedAtEpochMilliseconds: reply[2] / 1_000, payload: reply[1] }

/**
 * One key. Validate the stored record, admit the tenant, and build the reply
 * before the single final DEL or SET. Redis script rollback is not a safety net.
 *
 * `valid` repeats the record checks of `decodeStoredSession` on purpose. The script
 * must refuse a malformed record before it extends or deletes it, and it cannot call
 * the TypeScript schema. The parent still decodes the returned payload with that
 * schema before exposing a session, so the two stay belt and braces, not a
 * replacement for each other. Change both together.
 */
const sessionTransitionLua = `
local key = KEYS[1]
local mode = ARGV[1]
local received_at = tonumber(ARGV[2])
local tenant = ARGV[3]
local activity = ARGV[4]
local timeout_ms = tonumber(ARGV[5])
local warning = tonumber(ARGV[6])

local function nonempty(value)
  return type(value) == "string" and #value > 0
end

local function integral(value)
  local max_safe = 9007199254740991
  return type(value) == "number" and value == math.floor(value) and value >= -max_safe and value <= max_safe
end

local function is_uuid(value)
  if type(value) ~= "string" then return false end
  if value == "00000000-0000-0000-0000-000000000000" then return true end
  if string.lower(value) == "ffffffff-ffff-ffff-ffff-ffffffffffff" then return true end
  return string.match(value, "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-[1-8]%x%x%x%-[89abAB]%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$") ~= nil
end

-- Redis TIME inside this transition, in whole microseconds (exact below 2^53), as a decimal string: Redis would
-- truncate a fractional Lua number. Microseconds keep a read and a concurrent renewal from tying within a millisecond.
local function observed_at()
  local now = redis.call("TIME")
  return string.format("%.0f", tonumber(now[1]) * 1000000 + tonumber(now[2]))
end

local function is_alias(value)
  return nonempty(value) and string.match(value, "^[%l%-]+$") ~= nil
end

local allowed = {
  idleDeadlineEpochMilliseconds = true,
  issuer = true,
  revision = true,
  subject = true,
  telemetryId = true,
  tenantAlias = true,
  version = true,
  warningLeadMinutes = true
}

local function valid(record)
  if type(record) ~= "table" then return false end
  local count = 0
  for field, _ in pairs(record) do
    if allowed[field] ~= true then return false end
    count = count + 1
  end
  -- Version 1 has seven fields; version 2 adds a positive integral revision (research D6, R16).
  local versioned = (record.version == 1 and count == 7)
    or (record.version == 2 and count == 8 and integral(record.revision) and record.revision > 0)
  return versioned
    and nonempty(record.issuer)
    and nonempty(record.subject)
    and is_uuid(record.telemetryId)
    and is_alias(record.tenantAlias)
    and integral(record.idleDeadlineEpochMilliseconds)
    and record.idleDeadlineEpochMilliseconds > 0
    and integral(record.warningLeadMinutes)
    and record.warningLeadMinutes >= 0
end

if mode ~= "read" and mode ~= "refresh" then return {"rejected"} end
if not integral(received_at) then return {"rejected"} end

local raw = redis.call("GET", key)
if not raw then return {"missing"} end

local ok, decoded = pcall(cjson.decode, raw)
if not ok or not valid(decoded) then return {"malformed"} end

if mode == "refresh" and decoded.tenantAlias ~= tenant then
  return {"mismatch"}
end

if decoded.idleDeadlineEpochMilliseconds <= received_at then
  redis.call("DEL", key)
  return {"expired"}
end

if mode == "read" or activity == "excluded" then
  return {"current", raw, observed_at()}
end

if activity ~= "qualifying" or not integral(timeout_ms) or timeout_ms <= 0 or not integral(warning) or warning < 0 then
  return {"rejected"}
end

local new_deadline = received_at + timeout_ms
-- Every write increments the revision; a version-1 record counts as revision 0 and is rewritten as version 2.
local encoded_ok, replacement = pcall(cjson.encode, {
  idleDeadlineEpochMilliseconds = new_deadline,
  issuer = decoded.issuer,
  revision = (decoded.revision or 0) + 1,
  subject = decoded.subject,
  telemetryId = decoded.telemetryId,
  tenantAlias = decoded.tenantAlias,
  version = 2,
  warningLeadMinutes = warning
})
if not encoded_ok or type(replacement) ~= "string" or new_deadline <= received_at then
  return {"rejected"}
end

redis.call("SET", key, replacement, "PX", new_deadline - received_at)
return {"renewed", replacement, observed_at()}
`

/**
 * Deletes the record only while Redis `TIME` is at or before the cutoff, in one atomic step, so an attempt admitted
 * before the cutoff cannot delete after it (research D8, R27). Times are compared in whole microseconds.
 */
const cutoffInvalidationLua = `
local cutoff_ms = tonumber(ARGV[1])
if cutoff_ms == nil then return "rejected" end
local now = redis.call("TIME")
local now_us = tonumber(now[1]) * 1000000 + tonumber(now[2])
if now_us > math.floor(cutoff_ms * 1000) then return "expired" end
if redis.call("DEL", KEYS[1]) == 1 then return "removed" end
return "missing"
`

const cutoffInvalidation = Redis.script(
  (key: string, cutoffMilliseconds: string) => [key, cutoffMilliseconds],
  { lua: cutoffInvalidationLua, numberOfKeys: 1 }
).withReturnType<unknown>()

interface TransitionInput {
  readonly activity: string
  readonly idleTimeoutMilliseconds: number
  readonly mode: "read" | "refresh"
  readonly receivedAt: number
  readonly reference: string
  readonly tenantAlias: string
  readonly warningLeadMinutes: number
}

const sessionTransition = Redis.script(
  (
    key: string,
    mode: string,
    receivedAt: string,
    tenantAlias: string,
    activity: string,
    idleTimeoutMilliseconds: string,
    warningLeadMinutes: string
  ) => [key, mode, receivedAt, tenantAlias, activity, idleTimeoutMilliseconds, warningLeadMinutes],
  { lua: sessionTransitionLua, numberOfKeys: 1 }
).withReturnType<unknown>()

const unavailable = () => new SessionStoreUnavailable({})

/** Maps a raw mutation reply to its outcome; any other reply is unavailable and is never retried. */
const expectedReply = <const A>(
  reply: unknown,
  outcomes: readonly (readonly [unknown, A])[]
): Effect.Effect<A, SessionStoreUnavailable> => {
  const match = outcomes.find(([expected]) => expected === reply)
  return match === undefined ? Effect.fail(unavailable()) : Effect.succeed(match[1])
}

/** Redis `TIME` as `[seconds, microseconds]`. */
const TimeReply = Schema.Tuple([Schema.NumberFromString, Schema.NumberFromString])
const decodeTimeReply = Schema.decodeUnknownEffect(TimeReply)

/**
 * Read before the `SET NX`, so the establishment observation orders before every later transition of the record.
 * Establishment happens once per reference, so the extra round trip is not on a hot path.
 */
const observeTime = (redis: Redis.Redis["Service"]) =>
  redis.send("TIME").pipe(
    Effect.flatMap(decodeTimeReply),
    Effect.map(([seconds, microseconds]) => seconds * 1_000 + microseconds / 1_000),
    Effect.mapError(unavailable)
  )

const makeCreate = (redis: Redis.Redis["Service"], prefix: string) =>
  Effect.fnUntraced(function*(address: SessionStoreAddress, payload: string, ttlMilliseconds: number) {
    const observedAtEpochMilliseconds = yield* observeTime(redis)
    const reply = yield* redis.send(
      "SET",
      keyFor(prefix, address.reference),
      payload,
      "NX",
      "PX",
      String(ttlMilliseconds)
    ).pipe(Effect.mapError(unavailable))
    const outcome = yield* expectedReply(reply, [["OK", "created"], [null, "exists"]])
    return outcome === "created" ?
      { _tag: "Created" as const, observedAtEpochMilliseconds } :
      { _tag: "Exists" as const }
  })

const makeInvalidate = (redis: Redis.Redis["Service"], prefix: string) =>
  Effect.fnUntraced(function*(address: SessionStoreAddress, cutoffMilliseconds?: number) {
    const key = keyFor(prefix, address.reference)
    if (cutoffMilliseconds === undefined) {
      const reply = yield* redis.send("DEL", key).pipe(Effect.mapError(unavailable))
      return yield* expectedReply(reply, [[0, "missing"], [1, "removed"]])
    }
    const reply = yield* redis.eval(cutoffInvalidation)(key, String(cutoffMilliseconds)).pipe(
      Effect.mapError(unavailable)
    )
    return yield* expectedReply(reply, [["expired", "expired"], ["missing", "missing"], ["removed", "removed"]])
  })

const makeTransition = (redis: Redis.Redis["Service"], prefix: string) =>
  Effect.fnUntraced(function*(input: TransitionInput) {
    const reply = yield* redis.eval(sessionTransition)(
      keyFor(prefix, input.reference),
      input.mode,
      String(input.receivedAt),
      input.tenantAlias,
      input.activity,
      String(input.idleTimeoutMilliseconds),
      String(input.warningLeadMinutes)
    ).pipe(Effect.mapError(unavailable))
    return yield* decodeTransitionReply(reply).pipe(Effect.map(toTransition), Effect.mapError(unavailable))
  })

const makeRead = (
  transition: (input: TransitionInput) => Effect.Effect<StoreTransition, SessionStoreUnavailable>
) =>
  Effect.fnUntraced(function*(input: { readonly receivedAt: number; readonly reference: string }) {
    const outcome = yield* transition({
      activity: "excluded",
      idleTimeoutMilliseconds: 0,
      mode: "read",
      receivedAt: input.receivedAt,
      reference: input.reference,
      tenantAlias: "",
      warningLeadMinutes: 0
    })
    if (outcome._tag === "Current" || outcome._tag === "Expired" || outcome._tag === "Missing") return outcome
    return yield* unavailable()
  })

const makeRefresh = (
  transition: (input: TransitionInput) => Effect.Effect<StoreTransition, SessionStoreUnavailable>
) =>
  Effect.fnUntraced(function*(input: RefreshStoreInput) {
    return yield* transition({
      activity: input.activity,
      idleTimeoutMilliseconds: input.idleTimeoutMilliseconds,
      mode: "refresh",
      receivedAt: input.receivedAt,
      reference: input.reference,
      tenantAlias: input.tenantAlias,
      warningLeadMinutes: input.warningLeadMinutes
    })
  })

export class SessionStore extends Context.Service<SessionStore, {
  readonly create: (
    address: SessionStoreAddress,
    payload: string,
    ttlMilliseconds: number
  ) => Effect.Effect<CreateOutcome, SessionStoreUnavailable>
  readonly invalidate: (
    address: SessionStoreAddress,
    cutoffMilliseconds?: number
  ) => Effect.Effect<InvalidateOutcome, SessionStoreUnavailable>
  readonly read: (
    input: { readonly receivedAt: number; readonly reference: string }
  ) => Effect.Effect<ReadOutcome, SessionStoreUnavailable>
  readonly refresh: (
    input: RefreshStoreInput
  ) => Effect.Effect<StoreTransition, SessionStoreUnavailable>
}>()("SessionStore") {
  static readonly layer = (prefix: string) =>
    Layer.effect(
      SessionStore,
      Effect.gen(function*() {
        const redis = yield* Redis.Redis
        const transition = makeTransition(redis, prefix)
        return SessionStore.of({
          create: makeCreate(redis, prefix),
          invalidate: makeInvalidate(redis, prefix),
          read: makeRead(transition),
          refresh: makeRefresh(transition)
        })
      })
    )
}
