import { Deferred, Effect, Layer } from "effect"
import * as Redis from "effect/persistence/Redis"
import { createHash } from "node:crypto"

import { makeRedis } from "./redis.ts"

export interface EvaluationHold {
  readonly release: Deferred.Deferred<undefined>
  readonly started: Deferred.Deferred<undefined>
}

export interface SessionMemoryRedis {
  readonly commands: string[]
  readonly entries: Map<string, string>
  readonly failNextCommand: (command: "EVALSHA" | "GET" | "SCRIPT" | "SET", cause?: unknown) => void
  readonly failNextEvaluationAfterMutation: () => void
  readonly holdNextEvaluation: (hold: EvaluationHold) => void
  readonly layer: Layer.Layer<Redis.Redis>
  readonly returnNextEvaluation: (value: unknown) => void
  readonly ttls: Map<string, number>
}

interface MemoryState {
  readonly entries: Map<string, string>
  readonly ttls: Map<string, number>
}

type ScriptReply = readonly [string, string] | readonly [string]

interface StoredFields {
  readonly idleDeadlineEpochMilliseconds: number
  readonly issuer: string
  readonly subject: string
  readonly telemetryId: string
  readonly tenantAlias: string
  readonly version: 1
  readonly warningLeadMinutes: number
}

const allowedFields = new Set([
  "idleDeadlineEpochMilliseconds",
  "issuer",
  "subject",
  "telemetryId",
  "tenantAlias",
  "version",
  "warningLeadMinutes"
])

const uuidPattern =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$/

const failableCommands = new Set(["EVALSHA", "GET", "SCRIPT", "SET"])

const isInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value)

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0

const isExactRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.length === allowedFields.size && keys.every((key) => allowedFields.has(key))
}

const identityValid = (record: Record<string, unknown>): boolean =>
  isNonEmptyString(record.issuer) &&
  isNonEmptyString(record.subject) &&
  isNonEmptyString(record.telemetryId) &&
  uuidPattern.test(record.telemetryId)

const boundsValid = (record: Record<string, unknown>): boolean => {
  const deadline = record.idleDeadlineEpochMilliseconds
  const warning = record.warningLeadMinutes
  const tenant = record.tenantAlias
  return isInteger(deadline) && deadline > 0 && isInteger(warning) && warning >= 0 &&
    isNonEmptyString(tenant) && /^[a-z-]+$/.test(tenant)
}

const parsePayload = (payload: string): unknown => {
  try {
    return JSON.parse(payload)
  } catch {
    return undefined
  }
}

const storedFields = (parsed: Record<string, unknown>): StoredFields | undefined => {
  if (!isNonEmptyString(parsed.issuer) || !isNonEmptyString(parsed.subject)) return undefined
  if (!isNonEmptyString(parsed.telemetryId) || !isNonEmptyString(parsed.tenantAlias)) return undefined
  if (!isInteger(parsed.idleDeadlineEpochMilliseconds) || !isInteger(parsed.warningLeadMinutes)) return undefined
  return {
    idleDeadlineEpochMilliseconds: parsed.idleDeadlineEpochMilliseconds,
    issuer: parsed.issuer,
    subject: parsed.subject,
    telemetryId: parsed.telemetryId,
    tenantAlias: parsed.tenantAlias,
    version: 1,
    warningLeadMinutes: parsed.warningLeadMinutes
  }
}

const readStored = (payload: string): StoredFields | undefined => {
  const parsed = parsePayload(payload)
  if (!isExactRecord(parsed) || parsed.version !== 1 || !identityValid(parsed) || !boundsValid(parsed)) {
    return undefined
  }
  return storedFields(parsed)
}

const replacementPayload = (record: StoredFields, deadline: number, warning: number): string =>
  JSON.stringify({
    idleDeadlineEpochMilliseconds: deadline,
    issuer: record.issuer,
    subject: record.subject,
    telemetryId: record.telemetryId,
    tenantAlias: record.tenantAlias,
    version: 1,
    warningLeadMinutes: warning
  })

const renewRecord = (
  state: MemoryState,
  key: string,
  record: StoredFields,
  receivedAt: number,
  timeoutText: string | undefined,
  warningText: string | undefined
): ScriptReply => {
  const timeout = Number(timeoutText)
  const warning = Number(warningText)
  if (!isInteger(receivedAt) || !isInteger(timeout) || timeout <= 0 || !isInteger(warning) || warning < 0) {
    return ["rejected"]
  }
  const deadline = receivedAt + timeout
  const payload = replacementPayload(record, deadline, warning)
  state.entries.set(key, payload)
  state.ttls.set(key, deadline - receivedAt)
  return ["renewed", payload]
}

const expireRecord = (state: MemoryState, key: string): ScriptReply => {
  state.entries.delete(key)
  state.ttls.delete(key)
  return ["expired"]
}

interface LoadedRecord {
  readonly _tag: "Loaded"
  readonly raw: string
  readonly record: StoredFields
}

const loadRecord = (state: MemoryState, key: string): LoadedRecord | ScriptReply => {
  const raw = state.entries.get(key)
  if (raw === undefined) return ["missing"]
  const record = readStored(raw)
  if (record === undefined) return ["malformed"]
  return { _tag: "Loaded", raw, record }
}

const isLoadedRecord = (value: LoadedRecord | ScriptReply): value is LoadedRecord => !Array.isArray(value)

const finishUsable = (
  state: MemoryState,
  key: string,
  loaded: LoadedRecord,
  mode: string | undefined,
  tenant: string | undefined,
  activity: string | undefined,
  receivedAt: number,
  timeoutText: string | undefined,
  warningText: string | undefined
): ScriptReply => {
  if (mode === "refresh" && loaded.record.tenantAlias !== tenant) return ["mismatch"]
  if (loaded.record.idleDeadlineEpochMilliseconds <= receivedAt) return expireRecord(state, key)
  if (mode === "read" || activity === "excluded") return ["current", loaded.raw]
  return renewRecord(state, key, loaded.record, receivedAt, timeoutText, warningText)
}

const applyTransition = (state: MemoryState, key: string, args: readonly string[]): ScriptReply => {
  const [mode, receivedAtText, tenant, activity, timeoutText, warningText] = args
  const receivedAt = Number(receivedAtText)
  if ((mode !== "read" && mode !== "refresh") || !isInteger(receivedAt)) return ["rejected"]
  const loaded = loadRecord(state, key)
  if (!isLoadedRecord(loaded)) return loaded
  return finishUsable(state, key, loaded, mode, tenant, activity, receivedAt, timeoutText, warningText)
}

const createEntry = (state: MemoryState, args: readonly string[]): null | string => {
  const [key, payload, nx, px, ttl] = args
  const expectedShape = key !== undefined && payload !== undefined && nx === "NX" && px === "PX" && ttl !== undefined
  if (!expectedShape) throw new Error("Unexpected SET shape")
  if (state.entries.has(key)) return null
  state.entries.set(key, payload)
  state.ttls.set(key, Number(ttl))
  return "OK"
}

const readEntry = (state: MemoryState, args: readonly string[]): null | string => {
  const key = args[0]
  if (key === undefined) throw new Error("Missing GET key")
  return state.entries.get(key) ?? null
}

const loadScript = (scripts: Map<string, string>, args: readonly string[]): string => {
  const [subcommand, source] = args
  if (subcommand !== "LOAD" || source === undefined) throw new Error("Unexpected SCRIPT")
  const sha = createHash("sha1").update(source).digest("hex")
  scripts.set(sha, source)
  return sha
}

const redisFailure = (cause: unknown) => new Redis.RedisError({ cause })

interface EvaluationControls {
  failAfterMutation: boolean
  readonly holds: EvaluationHold[]
  injected: unknown
}

const commandFailure = (
  failures: Map<"EVALSHA" | "GET" | "SCRIPT" | "SET", unknown>,
  command: string
): unknown => {
  if (!failableCommands.has(command)) return undefined
  const typed = command as "EVALSHA" | "GET" | "SCRIPT" | "SET"
  const cause = failures.get(typed)
  failures.delete(typed)
  return cause
}

const makeEvaluateSha = (
  state: MemoryState,
  scripts: Map<string, string>,
  controls: EvaluationControls
) =>
  Effect.fnUntraced(function*(args: readonly string[]) {
    const [sha, keyCount, key, ...rest] = args
    if (sha === undefined || keyCount !== "1" || key === undefined) throw new Error("Unexpected EVALSHA")
    if (!scripts.has(sha)) return yield* redisFailure(new Error("NOSCRIPT No matching script"))
    const hold = controls.holds.shift()
    if (hold !== undefined) {
      yield* Deferred.succeed(hold.started, undefined)
      yield* Deferred.await(hold.release)
    }
    if (controls.injected !== undefined) {
      const value = controls.injected
      controls.injected = undefined
      return value
    }
    const reply = applyTransition(state, key, rest)
    if (!controls.failAfterMutation) return reply
    controls.failAfterMutation = false
    return yield* redisFailure(new Error("controlled post-mutation failure"))
  })

const makeSend = (
  state: MemoryState,
  scripts: Map<string, string>,
  commands: string[],
  failures: Map<"EVALSHA" | "GET" | "SCRIPT" | "SET", unknown>,
  evaluateSha: (args: readonly string[]) => Effect.Effect<unknown, Redis.RedisError>
) =>
<A>(command: string, ...args: readonly string[]) =>
  Effect.gen(function*() {
    commands.push(command)
    const cause = commandFailure(failures, command)
    if (cause !== undefined) return yield* redisFailure(cause)
    if (command === "SCRIPT") return loadScript(scripts, args) as A
    if (command === "EVALSHA") return (yield* evaluateSha(args)) as A
    if (command === "GET") return readEntry(state, args) as A
    if (command === "SET") return createEntry(state, args) as A
    return yield* redisFailure(new Error(`Unexpected Redis command: ${command}`))
  })

export const makeSessionMemoryRedis = (): SessionMemoryRedis => {
  const entries = new Map<string, string>()
  const ttls = new Map<string, number>()
  const scripts = new Map<string, string>()
  const commands: string[] = []
  const failures = new Map<"EVALSHA" | "GET" | "SCRIPT" | "SET", unknown>()
  const controls: EvaluationControls = { failAfterMutation: false, holds: [], injected: undefined }
  const state = { entries, ttls }
  const evaluateSha = makeEvaluateSha(state, scripts, controls)
  const send = makeSend(state, scripts, commands, failures, evaluateSha)
  const service = makeRedis(send)
  return {
    commands,
    entries,
    failNextCommand: (command, cause) => {
      failures.set(command, cause ?? new Error(`controlled ${command} failure`))
    },
    failNextEvaluationAfterMutation: () => {
      controls.failAfterMutation = true
    },
    holdNextEvaluation: (hold) => {
      controls.holds.push(hold)
    },
    layer: Layer.effect(Redis.Redis, service),
    returnNextEvaluation: (value) => {
      controls.injected = value
    },
    ttls
  }
}
