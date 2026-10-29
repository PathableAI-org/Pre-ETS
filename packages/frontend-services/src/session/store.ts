import { Context, Effect, Layer, Schema } from "effect"
import * as Redis from "effect/persistence/Redis"
import { createHash } from "node:crypto"

import { SessionKeyPrefix } from "../config/index.js"

/**
 * Store-level existence outcomes kept deliberately coarse: the parent owns the
 * public session vocabulary and never exposes a key or encoded payload here.
 */
type CreateOutcome = "created" | "exists"

type ReadOutcome =
  | { readonly _tag: "Current"; readonly payload: string }
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
  | { readonly _tag: "Current"; readonly payload: string }
  | { readonly _tag: "Expired" }
  | { readonly _tag: "Mismatch" }
  | { readonly _tag: "Missing" }
  | { readonly _tag: "Renewed"; readonly payload: string }

class SessionStoreUnavailable extends Schema.TaggedError<SessionStoreUnavailable>()(
  "SessionStoreUnavailable",
  {}
) {}

const keyFor = (prefix: string, reference: string): string => {
  const digest = createHash("sha256").update(reference).digest("base64url")
  return `${prefix}:${digest}`
}

const terminalTag = (status: string): "Expired" | "Mismatch" | "Missing" | undefined => {
  if (status === "expired") return "Expired"
  if (status === "mismatch") return "Mismatch"
  if (status === "missing") return "Missing"
  return undefined
}

const payloadTag = (status: string): "Current" | "Renewed" | undefined => {
  if (status === "current") return "Current"
  if (status === "renewed") return "Renewed"
  return undefined
}

const decodeTerminal = (status: string): StoreTransition | undefined => {
  if (status === "malformed" || status === "rejected") return undefined
  const tag = terminalTag(status)
  return tag === undefined ? undefined : { _tag: tag }
}

const decodePayload = (status: string, payload: unknown): StoreTransition | undefined => {
  const tag = payloadTag(status)
  if (tag === undefined || typeof payload !== "string") return undefined
  return { _tag: tag, payload }
}

const decodeReply = (value: unknown): StoreTransition | undefined => {
  if (!Array.isArray(value) || typeof value[0] !== "string") return undefined
  if (value.length === 1) return decodeTerminal(value[0])
  if (value.length !== 2) return undefined
  return decodePayload(value[0], value[1])
}

/**
 * One key. Validate the stored record, admit the tenant, and build the reply
 * before the single final DEL or SET. Redis script rollback is not a safety net.
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
  return type(value) == "number" and value == math.floor(value) and value > -math.huge and value < math.huge
end

local function is_uuid(value)
  if type(value) ~= "string" then return false end
  if value == "00000000-0000-0000-0000-000000000000" then return true end
  if string.lower(value) == "ffffffff-ffff-ffff-ffff-ffffffffffff" then return true end
  return string.match(value, "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-[1-8]%x%x%x%-[89abAB]%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$") ~= nil
end

local function is_alias(value)
  return nonempty(value) and string.match(value, "^[%l%-]+$") ~= nil
end

local allowed = {
  idleDeadlineEpochMilliseconds = true,
  issuer = true,
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
  if count ~= 7 then return false end
  return record.version == 1
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
  return {"current", raw}
end

if activity ~= "qualifying" or not integral(timeout_ms) or timeout_ms <= 0 or not integral(warning) or warning < 0 then
  return {"rejected"}
end

local new_deadline = received_at + timeout_ms
local encoded_ok, replacement = pcall(cjson.encode, {
  idleDeadlineEpochMilliseconds = new_deadline,
  issuer = decoded.issuer,
  subject = decoded.subject,
  telemetryId = decoded.telemetryId,
  tenantAlias = decoded.tenantAlias,
  version = 1,
  warningLeadMinutes = warning
})
if not encoded_ok or type(replacement) ~= "string" or new_deadline <= received_at then
  return {"rejected"}
end

redis.call("SET", key, replacement, "PX", new_deadline - received_at)
return {"renewed", replacement}
`

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

const makeCreate = (redis: Redis.Redis["Service"], prefix: string) =>
  Effect.fnUntraced(function*(address: SessionStoreAddress, payload: string, ttlMilliseconds: number) {
    const result = yield* redis.send<null | string>(
      "SET",
      keyFor(prefix, address.reference),
      payload,
      "NX",
      "PX",
      String(ttlMilliseconds)
    ).pipe(Effect.mapError(unavailable))
    return result === "OK" ? "created" : "exists"
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
    const decoded = decodeReply(reply)
    if (decoded === undefined) return yield* unavailable()
    return decoded
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
  readonly read: (
    input: { readonly receivedAt: number; readonly reference: string }
  ) => Effect.Effect<ReadOutcome, SessionStoreUnavailable>
  readonly refresh: (
    input: RefreshStoreInput
  ) => Effect.Effect<StoreTransition, SessionStoreUnavailable>
}>()("@pathableai/pre-ets-frontend/SessionStore") {
  static readonly layer = Layer.effect(
    SessionStore,
    Effect.gen(function*() {
      const redis = yield* Redis.Redis
      const prefix = yield* SessionKeyPrefix
      const transition = makeTransition(redis, prefix)
      return SessionStore.of({
        create: makeCreate(redis, prefix),
        read: makeRead(transition),
        refresh: makeRefresh(transition)
      })
    })
  )
}
