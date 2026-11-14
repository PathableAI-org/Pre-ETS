import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Result, Schema, type Scope } from "effect"
import { TestClock } from "effect/testing"
import { vi } from "vitest"

import {
  type EstablishSessionInput,
  type ExcludedSessionActivity,
  type NoUsableSession,
  type QualifyingSessionActivity,
  type ReadSessionForTenantInput,
  type RefreshSessionForTenantInput,
  type SessionIdentity,
  SessionService,
  SessionServiceUnavailable,
  SessionTenantMismatch
} from "../../src/session.ts"
import { type SessionPolicy, TenantAlias } from "../../src/tenant.ts"
import { SessionRedis, sessionState, sessionWorld, type StoredSessionRecord } from "../helpers/session.ts"

const alias = Schema.decodeSync(TenantAlias)("alpha")
const otherAlias = Schema.decodeSync(TenantAlias)("beta")
const noUsableSession: NoUsableSession = { _tag: "NoUsableSession" }
/** The store returned the record past its deadline, before eviction (#157 research D2). */
const expiredSession: NoUsableSession = { _tag: "NoUsableSession", expired: true }

const publicDiagnostic = (value: unknown): string => {
  const seen = new Set<unknown>()
  const parts: string[] = []
  const visit = (current: unknown): void => {
    if (typeof current === "string") {
      parts.push(current)
      return
    }
    if (typeof current !== "object" || current === null || seen.has(current)) return
    seen.add(current)
    if (current instanceof Error) parts.push(current.message)
    for (const key of Object.getOwnPropertyNames(current)) {
      visit((current as Record<string, unknown>)[key])
    }
  }
  visit(value)
  return parts.join("\n")
}

const BASE_TIME = 1_800_000_000_000

const policyOf = (idleTimeoutMinutes: number, warningLeadMinutes: number): SessionPolicy => ({
  idleTimeoutMinutes,
  warningLeadMinutes
})

const scenario = <A, E>(program: Effect.Effect<A, E, Scope.Scope | SessionRedis | SessionService>) =>
  program.pipe(Effect.provide(sessionWorld))

const commandsNamed = Effect.fnUntraced(function*(command: string) {
  const redis = yield* SessionRedis
  return (yield* redis.commands).filter((sent) => sent === command)
})

const recordCount = SessionRedis.use((redis) => redis.records).pipe(Effect.map((records) => records.size))

/** Neither bytes nor TTL were rewritten: the TTL only ran down in wall-clock time. */
const expectUnchanged = (
  before: ReadonlyMap<string, StoredSessionRecord>,
  after: ReadonlyMap<string, StoredSessionRecord>
) => {
  expect([...after.keys()]).toStrictEqual([...before.keys()])
  for (const [key, record] of before) {
    const current = after.get(key)
    expect(current?.payload).toBe(record.payload)
    expect(current?.ttlMilliseconds).toBeLessThanOrEqual(record.ttlMilliseconds)
    expect(current?.ttlMilliseconds).toBeGreaterThan(record.ttlMilliseconds - 5_000)
  }
}

const unchangedSince = Effect.fnUntraced(function*(before: ReadonlyMap<string, StoredSessionRecord>) {
  const redis = yield* SessionRedis
  expectUnchanged(before, yield* redis.records)
})

const establish = (
  service: SessionService["Service"],
  idleTimeoutMinutes: number,
  warningLeadMinutes: number
) => {
  const identity: SessionIdentity = { issuer: "https://provider.test/", subject: "subject-1" }
  const input: EstablishSessionInput = {
    identity,
    policy: policyOf(idleTimeoutMinutes, warningLeadMinutes),
    tenantAlias: alias
  }
  return service.establish(input)
}

describe("SessionService establishment [PREETS-SESSION-003, PREETS-SESSION-008]", () => {
  it.effect("establishes a tenant-bound session with the effective deadline and warning policy", () =>
    scenario(
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const result = yield* establish(service, 30, 5)
        expect(result.reference).toMatch(/^[A-Za-z0-9_-]{43}$/)
        expect(result.reference).not.toContain("subject-1")
        expect(result.reference).not.toContain("alpha")
        expect(sessionState(result.session)).toStrictEqual({
          _tag: "UsableSession",
          identity: { issuer: "https://provider.test/", subject: "subject-1" },
          idleDeadlineEpochMilliseconds: BASE_TIME + 30 * 60_000,
          revision: 1,
          tenantAlias: alias,
          warningLeadMinutes: 5
        })
      })
    ))

  it.effect("preserves a disabled warning policy", () =>
    scenario(
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const result = yield* establish(service, 5, 0)
        expect(result.session.warningLeadMinutes).toBe(0)
        expect(result.session.idleDeadlineEpochMilliseconds).toBe(BASE_TIME + 5 * 60_000)
      })
    ))

  it.effect("returns a readable usable session with identical public fields", () =>
    scenario(
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const { reference } = yield* establish(service, 7, 3)
        const read = yield* service.read({ reference })
        expect(sessionState(read)).toStrictEqual({
          _tag: "UsableSession",
          identity: { issuer: "https://provider.test/", subject: "subject-1" },
          idleDeadlineEpochMilliseconds: BASE_TIME + 7 * 60_000,
          revision: 1,
          tenantAlias: alias,
          warningLeadMinutes: 3
        })
      })
    ))
})

describe("SessionService invalidation [PREETS-SESSION-013]", () => {
  it.effect.each([undefined, "not-a-valid-reference"])(
    "returns NoUsableSession for %s input without a Redis command",
    (reference) =>
      scenario(
        Effect.gen(function*() {
          const redis = yield* SessionRedis
          const service = yield* SessionService
          const result = yield* service.invalidate({ reference })
          expect(result).toStrictEqual(noUsableSession)
          expect(yield* redis.commands).toStrictEqual([])
          expect(Object.keys(result)).toStrictEqual(["_tag"])
        })
      )
  )

  it.effect.each(["current", "expired", "malformed", "unknown-version"] as const)(
    "removes %s addressed state without exposing its prior contents",
    (state) =>
      scenario(
        Effect.gen(function*() {
          const redis = yield* SessionRedis
          yield* TestClock.setTime(BASE_TIME)
          const service = yield* SessionService
          const established = yield* establish(service, 30, 5)
          const commandCountBeforeInvalidation = (yield* redis.commands).length
          if (state === "expired") yield* TestClock.adjust("30 minutes")
          if (state === "malformed") {
            yield* redis.rewriteAll(() => "not-json")
          }
          if (state === "unknown-version") {
            yield* redis.rewriteAll((payload) => JSON.stringify({ ...JSON.parse(payload), version: 3 }))
          }

          const result = yield* service.invalidate({ reference: established.reference })

          expect(result).toStrictEqual(noUsableSession)
          expect(Object.keys(result)).toStrictEqual(["_tag"])
          expect(yield* recordCount).toBe(0)
          expect((yield* redis.commands).slice(commandCountBeforeInvalidation)).toStrictEqual(["DEL"])
          expect(yield* commandsNamed("DEL")).toHaveLength(1)
        })
      )
  )

  it.effect("returns the same terminal outcome for missing and already invalidated state", () =>
    scenario(
      Effect.gen(function*() {
        const redis = yield* SessionRedis
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const established = yield* establish(service, 30, 5)
        yield* redis.removeAll

        const missing = yield* service.invalidate({ reference: established.reference })
        const alreadyInvalidated = yield* service.invalidate({ reference: established.reference })

        expect(missing).toStrictEqual(noUsableSession)
        expect(alreadyInvalidated).toStrictEqual(noUsableSession)
        expect(yield* commandsNamed("DEL")).toHaveLength(2)
      })
    ))

  it.effect.each([2, -1, "1", null])(
    "fails closed for the unexpected DEL reply %#",
    (reply) =>
      scenario(
        Effect.gen(function*() {
          const redis = yield* SessionRedis
          yield* TestClock.setTime(BASE_TIME)
          const service = yield* SessionService
          const established = yield* establish(service, 30, 5)
          yield* redis.injectNext("DEL", { _tag: "Reply", value: reply })

          const result = yield* service.invalidate({ reference: established.reference }).pipe(Effect.result)

          expect(Result.isFailure(result)).toBe(true)
          if (Result.isFailure(result)) {
            expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
            expect(Object.keys(result.failure)).toStrictEqual(["_tag"])
            expect(publicDiagnostic(result.failure)).not.toContain(established.reference)
            expect(publicDiagnostic(result.failure)).not.toContain("subject-1")
            expect(publicDiagnostic(result.failure)).not.toContain("https://provider.test/")
            expect(publicDiagnostic(result.failure)).not.toContain("test:session")
          }
        })
      )
  )

  it.effect("returns a fieldless service failure when DEL cannot be dispatched", () =>
    scenario(
      Effect.gen(function*() {
        const redis = yield* SessionRedis
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const established = yield* establish(service, 30, 5)
        yield* redis.injectNext("DEL", { _tag: "Fail", cause: new Error("private Redis diagnostic") })

        const result = yield* service.invalidate({ reference: established.reference }).pipe(Effect.result)

        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
          expect(result.failure.cause).toBeUndefined()
          const diagnostic = publicDiagnostic(result.failure)
          expect(diagnostic).not.toContain("private Redis diagnostic")
          expect(diagnostic).not.toContain(established.reference)
          expect(diagnostic).not.toContain("subject-1")
        }
      })
    ))

  it.effect("does not retry or claim success when DEL applies before its reply fails", () =>
    scenario(
      Effect.gen(function*() {
        const redis = yield* SessionRedis
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const established = yield* establish(service, 30, 5)
        yield* redis.injectNext("DEL", { _tag: "FailAfterApply" })

        const indeterminate = yield* service.invalidate({ reference: established.reference }).pipe(Effect.result)

        expect(Result.isFailure(indeterminate)).toBe(true)
        if (Result.isFailure(indeterminate)) {
          expect(indeterminate.failure).toBeInstanceOf(SessionServiceUnavailable)
        }
        expect(yield* commandsNamed("DEL")).toHaveLength(1)
        expect(yield* recordCount).toBe(0)
        expect(yield* service.read({ reference: established.reference })).toStrictEqual(noUsableSession)
        expect(yield* service.invalidate({ reference: established.reference })).toStrictEqual(noUsableSession)
        expect(yield* commandsNamed("DEL")).toHaveLength(2)
      })
    ))
})

describe("SessionService read outcomes [PREETS-SESSION-008]", () => {
  it.effect("returns NoUsableSession for an absent reference without a Redis lookup", () =>
    scenario(
      Effect.gen(function*() {
        const service = yield* SessionService
        const result = yield* service.read({})
        expect(result).toStrictEqual(noUsableSession)
        expect(yield* recordCount).toBe(0)
      })
    ))

  it.effect("returns NoUsableSession for a malformed reference without a Redis lookup", () =>
    scenario(
      Effect.gen(function*() {
        const service = yield* SessionService
        const result = yield* service.read({ reference: "not-a-valid-reference" })
        expect(result).toStrictEqual(noUsableSession)
        expect(yield* recordCount).toBe(0)
      })
    ))

  it.effect("returns NoUsableSession for a missing record", () =>
    scenario(
      Effect.gen(function*() {
        const redis = yield* SessionRedis
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const { reference } = yield* establish(service, 30, 5)
        yield* redis.removeAll
        const result = yield* service.read({ reference })
        expect(result).toStrictEqual(noUsableSession)
      })
    ))

  it.effect("flags a record read at its deadline as expired, and the evicted reference after it as missing [#157 V-004]", () =>
    scenario(
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const { reference } = yield* establish(service, 30, 5)
        yield* TestClock.adjust("30 minutes")
        expect(yield* service.read({ reference })).toStrictEqual(expiredSession)
        expect(yield* recordCount).toBe(0)
        yield* TestClock.adjust("1 minute")
        expect(yield* service.read({ reference })).toStrictEqual(noUsableSession)
        expect(yield* recordCount).toBe(0)
      })
    ))

  it.effect("returns SessionServiceUnavailable for a corrupted stored record", () =>
    scenario(
      Effect.gen(function*() {
        const redis = yield* SessionRedis
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const { reference } = yield* establish(service, 30, 5)
        yield* redis.rewriteAll(() => "not-json")
        const result = yield* service.read({ reference }).pipe(Effect.result)
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
      })
    ))

  it.effect("returns SessionServiceUnavailable for an unknown record version", () =>
    scenario(
      Effect.gen(function*() {
        const redis = yield* SessionRedis
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const { reference } = yield* establish(service, 30, 5)
        yield* redis.rewriteAll((payload) => JSON.stringify({ ...JSON.parse(payload), version: 3 }))
        const result = yield* service.read({ reference }).pipe(Effect.result)
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
          expect(result.failure.cause).toBeUndefined()
          expect(publicDiagnostic(result.failure)).not.toContain("subject-1")
          expect(publicDiagnostic(result.failure)).not.toContain("https://provider.test/")
        }
      })
    ))

  it.effect("returns SessionServiceUnavailable after three exhausted creation collisions", () =>
    scenario(
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const fixedBytes = new Uint8Array(32)
        fixedBytes[0] = 1
        yield* Effect.acquireRelease(
          Effect.sync(() =>
            vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
              const target = array as Uint8Array
              target.set(fixedBytes)
              return target
            })
          ),
          (spy) =>
            Effect.sync(() => {
              spy.mockRestore()
            })
        )
        yield* establish(service, 30, 5)
        const result = yield* establish(service, 30, 5).pipe(Effect.result)
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
      })
    ))

  it.effect("fails closed on a Redis read failure", () =>
    scenario(
      Effect.gen(function*() {
        const redis = yield* SessionRedis
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const { reference } = yield* establish(service, 30, 5)
        yield* redis.injectNext("EVALSHA", { _tag: "Fail", cause: new Error("controlled EVALSHA failure") })
        const result = yield* service.read({ reference }).pipe(Effect.result)
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
      })
    ))

  it.effect.each(["QUEUED", 1, "ok", ["OK"]])(
    "fails closed without retrying creation for the unexpected SET reply %#",
    (reply) =>
      scenario(
        Effect.gen(function*() {
          const redis = yield* SessionRedis
          yield* TestClock.setTime(BASE_TIME)
          const service = yield* SessionService
          yield* redis.injectNext("SET", { _tag: "Reply", value: reply })

          const result = yield* establish(service, 30, 5).pipe(Effect.result)

          expect(Result.isFailure(result)).toBe(true)
          if (Result.isFailure(result)) {
            expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
            expect(Object.keys(result.failure)).toStrictEqual(["_tag"])
          }
          expect(yield* commandsNamed("SET")).toHaveLength(1)
        })
      )
  )

  it.effect("returns SessionServiceUnavailable when establishment cannot persist", () =>
    scenario(
      Effect.gen(function*() {
        const redis = yield* SessionRedis
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        yield* redis.injectNext("SET", { _tag: "Fail", cause: new Error("controlled SET failure") })
        const result = yield* establish(service, 30, 5).pipe(Effect.result)
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
          expect(result.failure.cause).toBeUndefined()
          expect(publicDiagnostic(result.failure)).not.toContain("subject-1")
        }
      })
    ))
})

describe("SessionService tenant admission [PREETS-SESSION-005]", () => {
  it.effect("returns the usable session read for the same branded alias", () =>
    scenario(
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const { reference } = yield* establish(service, 7, 3)
        const read = yield* service.read({ reference })
        const admittedInput: ReadSessionForTenantInput = { reference, tenantAlias: alias }
        const admitted = yield* service.readForTenant(admittedInput)
        expect(sessionState(admitted)).toStrictEqual(sessionState(read))
        if (read._tag === "UsableSession" && admitted._tag === "UsableSession") {
          expect(admitted.identity).toStrictEqual(read.identity)
          expect(admitted.tenantAlias).toBe(read.tenantAlias)
          expect(admitted.idleDeadlineEpochMilliseconds).toBe(read.idleDeadlineEpochMilliseconds)
          expect(admitted.warningLeadMinutes).toBe(read.warningLeadMinutes)
        }
      })
    ))

  it.effect("fails with a fieldless tenant mismatch and no identity or tenant diagnostic", () =>
    scenario(
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const { reference } = yield* establish(service, 30, 5)
        const result = yield* service.readForTenant({ reference, tenantAlias: otherAlias }).pipe(Effect.result)
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(SessionTenantMismatch)
          expect(result.failure._tag).toBe("SessionTenantMismatch")
          expect(result.failure).not.toHaveProperty("identity")
          expect(result.failure).not.toHaveProperty("issuer")
          expect(result.failure).not.toHaveProperty("subject")
          expect(result.failure).not.toHaveProperty("tenantAlias")
          const diagnostic = publicDiagnostic(result.failure)
          expect(diagnostic).not.toContain("subject-1")
          expect(diagnostic).not.toContain("https://provider.test/")
          expect(diagnostic).not.toContain("alpha")
          expect(diagnostic).not.toContain("beta")
        }
      })
    ))

  it.effect("passes absent and malformed references through as NoUsableSession", () =>
    scenario(
      Effect.gen(function*() {
        const service = yield* SessionService
        const absent = yield* service.readForTenant({ tenantAlias: alias }).pipe(Effect.result)
        const malformed = yield* service.readForTenant({
          reference: "not-a-valid-reference",
          tenantAlias: alias
        }).pipe(Effect.result)
        expect(Result.isSuccess(absent)).toBe(true)
        expect(Result.isSuccess(malformed)).toBe(true)
        if (Result.isSuccess(absent)) expect(absent.success).toStrictEqual(noUsableSession)
        if (Result.isSuccess(malformed)) expect(malformed.success).toStrictEqual(noUsableSession)
        expect(absent).not.toBeInstanceOf(SessionTenantMismatch)
        expect(malformed).not.toBeInstanceOf(SessionServiceUnavailable)
        expect(yield* recordCount).toBe(0)
      })
    ))

  it.effect("keeps a Redis read failure distinct from absence and mismatch", () =>
    scenario(
      Effect.gen(function*() {
        const redis = yield* SessionRedis
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const { reference } = yield* establish(service, 30, 5)
        yield* redis.injectNext("EVALSHA", { _tag: "Fail", cause: new Error("controlled EVALSHA failure") })
        const result = yield* service.readForTenant({ reference, tenantAlias: alias }).pipe(Effect.result)
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
          expect(result.failure).not.toBeInstanceOf(SessionTenantMismatch)
        }
      })
    ))

  it.effect.prop(
    "admits a stored session only when the request alias is branded-equal",
    [TenantAlias, TenantAlias],
    ([storedAlias, requestAlias]) =>
      scenario(
        Effect.gen(function*() {
          const service = yield* SessionService
          const established = yield* service.establish({
            identity: { issuer: "https://provider.test/", subject: "subject-1" },
            policy: policyOf(30, 5),
            tenantAlias: storedAlias
          })
          const read = yield* service.read({ reference: established.reference })
          const admitted = yield* service.readForTenant({
            reference: established.reference,
            tenantAlias: requestAlias
          }).pipe(Effect.result)
          if (storedAlias === requestAlias) {
            expect(Result.isSuccess(admitted)).toBe(true)
            if (Result.isSuccess(admitted)) expect(sessionState(admitted.success)).toStrictEqual(sessionState(read))
            return
          }
          expect(Result.isFailure(admitted)).toBe(true)
          if (Result.isFailure(admitted)) expect(admitted.failure).toBeInstanceOf(SessionTenantMismatch)
        })
      )
  )
})

const qualifyingActivities = [
  "deliberate-page-request",
  "deliberate-form-submission",
  "intentional-control-activation",
  "keyboard-interaction",
  "text-entry",
  "touch-interaction",
  "user-driven-meaningful-input-focus",
  "continue-session"
] as const satisfies readonly QualifyingSessionActivity[]

const excludedActivities = [
  "automatic-polling",
  "unrelated-background-traffic",
  "raw-pointer-movement",
  "programmatic-focus"
] as const satisfies readonly ExcludedSessionActivity[]

interface ExcludedCarryingPolicy {
  readonly activity: ExcludedSessionActivity
  readonly policy: SessionPolicy
  readonly reference?: string | undefined
  readonly tenantAlias: TenantAlias
}
type MissingExcluded = Exclude<ExcludedSessionActivity, (typeof excludedActivities)[number]>
type MissingQualifying = Exclude<QualifyingSessionActivity, (typeof qualifyingActivities)[number]>

const qualifyingListIsClosed: [MissingQualifying] extends [never] ? true : false = true
const excludedListIsClosed: [MissingExcluded] extends [never] ? true : false = true
const excludedActivityRejectsPolicy: ExcludedCarryingPolicy extends RefreshSessionForTenantInput ? false : true = true

const minutesBetween = (minimum: number, maximum: number) =>
  Schema.Int.pipe(Schema.check(Schema.isBetween({ maximum, minimum })))

/** Any accepted tenant policy: a 5-30 minute timeout with a warning lead below it. */
const ValidPolicy = Schema.Struct({
  idleTimeoutMinutes: minutesBetween(5, 30),
  warningLeadMinutes: minutesBetween(0, 29)
}).pipe(Schema.check(Schema.makeFilter((policy) => policy.warningLeadMinutes < policy.idleTimeoutMinutes)))

describe("SessionService.refreshForTenant renewal [PREETS-SESSION-008, PREETS-SESSION-009, PREETS-SESSION-011]", () => {
  it("rejects excluded activity that carries policy and keeps the activity lists closed", () => {
    expect(qualifyingListIsClosed).toBe(true)
    expect(excludedListIsClosed).toBe(true)
    expect(excludedActivityRejectsPolicy).toBe(true)
  })

  it.effect.each(qualifyingActivities)(
    "renews a still-usable session for %s from one effective policy",
    (activity) =>
      scenario(
        Effect.gen(function*() {
          yield* TestClock.setTime(BASE_TIME)
          const service = yield* SessionService
          const established = yield* establish(service, 30, 5)
          const receivedAt = BASE_TIME + 60_000
          yield* TestClock.setTime(receivedAt)
          const renewed = yield* service.refreshForTenant({
            activity,
            policy: policyOf(12, 4),
            reference: established.reference,
            tenantAlias: alias
          })
          expect(sessionState(renewed)).toStrictEqual({
            _tag: "UsableSession",
            identity: established.session.identity,
            idleDeadlineEpochMilliseconds: receivedAt + 12 * 60_000,
            revision: 2,
            tenantAlias: alias,
            warningLeadMinutes: 4
          })
          expect(sessionState(yield* service.read({ reference: established.reference }))).toStrictEqual(
            sessionState(renewed)
          )
        })
      )
  )

  it.effect("adopts a changed timeout and warning together, including a disabled warning", () =>
    scenario(
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const enabled = yield* establish(service, 30, 5)
        const disabled = yield* service.establish({
          identity: { issuer: "https://provider.test/", subject: "subject-2" },
          policy: policyOf(5, 0),
          tenantAlias: alias
        })
        const receivedAt = BASE_TIME + 30_000
        yield* TestClock.setTime(receivedAt)
        const toDisabled = yield* service.refreshForTenant({
          activity: "continue-session",
          policy: policyOf(5, 0),
          reference: enabled.reference,
          tenantAlias: alias
        })
        const toEnabled = yield* service.refreshForTenant({
          activity: "text-entry",
          policy: policyOf(30, 5),
          reference: disabled.reference,
          tenantAlias: alias
        })
        expect(toDisabled).toMatchObject({
          idleDeadlineEpochMilliseconds: receivedAt + 5 * 60_000,
          warningLeadMinutes: 0
        })
        expect(toEnabled).toMatchObject({
          idleDeadlineEpochMilliseconds: receivedAt + 30 * 60_000,
          warningLeadMinutes: 5
        })
      })
    ))

  it.effect("leaves an unrefreshed session on the policy from its own establishment", () =>
    scenario(
      Effect.gen(function*() {
        const redis = yield* SessionRedis
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const first = yield* establish(service, 30, 5)
        const second = yield* service.establish({
          identity: { issuer: "https://provider.test/", subject: "subject-2" },
          policy: policyOf(20, 3),
          tenantAlias: alias
        })
        const before = yield* redis.records
        const receivedAt = BASE_TIME + 15_000
        yield* TestClock.setTime(receivedAt)
        const renewed = yield* service.refreshForTenant({
          activity: "keyboard-interaction",
          policy: policyOf(18, 0),
          reference: first.reference,
          tenantAlias: alias
        })
        expect(renewed).toMatchObject({
          idleDeadlineEpochMilliseconds: receivedAt + 18 * 60_000,
          warningLeadMinutes: 0
        })
        expect(sessionState(yield* service.read({ reference: second.reference }))).toStrictEqual(
          sessionState(second.session)
        )
        const secondRecords = [...before].filter(([, record]) => record.payload.includes("\"subject-2\""))
        expect(secondRecords).toHaveLength(1)
        const after = yield* redis.records
        expectUnchanged(
          new Map(secondRecords),
          new Map([...after].filter(([key]) => secondRecords.some(([owned]) => owned === key)))
        )
      })
    ))

  it.effect("returns NoUsableSession for an absent or invalid reference without a Redis lookup", () =>
    scenario(
      Effect.gen(function*() {
        const redis = yield* SessionRedis
        const service = yield* SessionService
        const absent = yield* service.refreshForTenant({
          activity: "continue-session",
          policy: policyOf(30, 5),
          tenantAlias: alias
        })
        const invalid = yield* service.refreshForTenant({
          activity: "continue-session",
          policy: policyOf(30, 5),
          reference: "not-a-valid-reference",
          tenantAlias: alias
        })
        expect(absent).toStrictEqual(noUsableSession)
        expect(invalid).toStrictEqual(noUsableSession)
        expect(yield* redis.commands).toStrictEqual([])
      })
    ))

  it.effect("returns fieldless SessionTenantMismatch and leaves bytes and TTL unchanged", () =>
    scenario(
      Effect.gen(function*() {
        const redis = yield* SessionRedis
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const established = yield* establish(service, 30, 5)
        const before = yield* redis.records
        const mismatched = yield* service.refreshForTenant({
          activity: "deliberate-page-request",
          policy: policyOf(10, 1),
          reference: established.reference,
          tenantAlias: otherAlias
        }).pipe(Effect.result)
        expect(Result.isFailure(mismatched)).toBe(true)
        if (Result.isFailure(mismatched)) {
          expect(mismatched.failure).toBeInstanceOf(SessionTenantMismatch)
          expect(mismatched.failure).not.toHaveProperty("identity")
          expect(mismatched.failure).not.toHaveProperty("tenantAlias")
          const diagnostic = publicDiagnostic(mismatched.failure)
          expect(diagnostic).not.toContain("subject-1")
          expect(diagnostic).not.toContain("alpha")
          expect(diagnostic).not.toContain("beta")
        }
        yield* unchangedSince(before)
        expect(sessionState(yield* service.read({ reference: established.reference }))).toStrictEqual(
          sessionState(established.session)
        )
      })
    ))

  it.effect("keeps mismatch ahead of an already expired deadline without mutation", () =>
    scenario(
      Effect.gen(function*() {
        const redis = yield* SessionRedis
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const established = yield* establish(service, 30, 5)
        const before = yield* redis.records
        yield* TestClock.adjust("30 minutes")
        const mismatched = yield* service.refreshForTenant({
          activity: "continue-session",
          policy: policyOf(30, 5),
          reference: established.reference,
          tenantAlias: otherAlias
        }).pipe(Effect.result)
        expect(Result.isFailure(mismatched)).toBe(true)
        if (Result.isFailure(mismatched)) expect(mismatched.failure).toBeInstanceOf(SessionTenantMismatch)
        yield* unchangedSince(before)
        expect(yield* recordCount).toBe(1)
      })
    ))
})

describe("SessionService.refreshForTenant policy properties [PREETS-SESSION-008]", () => {
  it.effect.prop(
    "renewed deadline and warning come from the same refresh policy",
    [ValidPolicy, ValidPolicy, minutesBetween(0, 299_999)],
    ([establishedPolicy, refreshPolicy, offset]) =>
      scenario(
        Effect.gen(function*() {
          const receivedAt = BASE_TIME + offset
          yield* TestClock.setTime(BASE_TIME)
          const service = yield* SessionService
          const established = yield* service.establish({
            identity: { issuer: "https://provider.test/", subject: "subject-1" },
            policy: establishedPolicy,
            tenantAlias: alias
          })
          yield* TestClock.setTime(receivedAt)
          const renewed = yield* service.refreshForTenant({
            activity: "continue-session",
            policy: refreshPolicy,
            reference: established.reference,
            tenantAlias: alias
          })
          expect(renewed).toMatchObject({
            _tag: "UsableSession",
            idleDeadlineEpochMilliseconds: receivedAt + refreshPolicy.idleTimeoutMinutes * 60_000,
            warningLeadMinutes: refreshPolicy.warningLeadMinutes
          })
        })
      ),
    { arbitrary: { runs: 40 } }
  )
})

describe("SessionService.refreshForTenant expiration [PREETS-SESSION-008, PREETS-SESSION-009]", () => {
  it.effect.each(excludedActivities)(
    "returns the current session for %s without writing",
    (activity) =>
      scenario(
        Effect.gen(function*() {
          const redis = yield* SessionRedis
          yield* TestClock.setTime(BASE_TIME)
          const service = yield* SessionService
          const established = yield* establish(service, 30, 5)
          const before = yield* redis.records
          const observed = yield* service.refreshForTenant({
            activity,
            reference: established.reference,
            tenantAlias: alias
          })
          expect(sessionState(observed)).toStrictEqual(sessionState(established.session))
          yield* unchangedSince(before)
        })
      )
  )

  it.effect.each(qualifyingActivities)(
    "returns NoUsableSession for %s at the stored deadline and deletes the record",
    (activity) =>
      scenario(
        Effect.gen(function*() {
          yield* TestClock.setTime(BASE_TIME)
          const service = yield* SessionService
          const established = yield* establish(service, 30, 5)
          yield* TestClock.setTime(established.session.idleDeadlineEpochMilliseconds)
          const result = yield* service.refreshForTenant({
            activity,
            policy: policyOf(30, 5),
            reference: established.reference,
            tenantAlias: alias
          })
          expect(result).toStrictEqual(expiredSession)
          expect(yield* recordCount).toBe(0)
          expect(yield* service.read({ reference: established.reference })).toStrictEqual(noUsableSession)
        })
      )
  )

  it.effect("does not revive an expired session when the timeout later increases", () =>
    scenario(
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const established = yield* establish(service, 10, 2)
        yield* TestClock.adjust("11 minutes")
        const revived = yield* service.refreshForTenant({
          activity: "continue-session",
          policy: policyOf(30, 5),
          reference: established.reference,
          tenantAlias: alias
        })
        expect(revived).toStrictEqual(expiredSession)
        expect(yield* recordCount).toBe(0)
        expect(yield* service.read({ reference: established.reference })).toStrictEqual(noUsableSession)
      })
    ))

  it.effect("returns NoUsableSession for an expired record before tenant admission on read", () =>
    scenario(
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const established = yield* establish(service, 30, 5)
        yield* TestClock.setTime(established.session.idleDeadlineEpochMilliseconds)
        const result = yield* service.readForTenant({
          reference: established.reference,
          tenantAlias: otherAlias
        })
        expect(result).toStrictEqual(expiredSession)
        expect(yield* recordCount).toBe(0)
      })
    ))

  it.effect("returns NoUsableSession when a usable read completes after its deadline", () =>
    scenario(
      Effect.gen(function*() {
        const redis = yield* SessionRedis
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const established = yield* establish(service, 30, 5)
        const started = yield* Deferred.make<undefined>()
        const release = yield* Deferred.make<undefined>()
        yield* redis.injectNext("EVALSHA", { _tag: "Hold", release, started })
        const fiber = yield* Effect.forkChild(service.read({ reference: established.reference }))
        yield* Deferred.await(started)
        yield* TestClock.setTime(established.session.idleDeadlineEpochMilliseconds)
        yield* Deferred.succeed(release, undefined)
        expect(yield* Fiber.join(fiber)).toStrictEqual(expiredSession)
        expect(yield* recordCount).toBe(1)
      })
    ))
})

describe("SessionService storage failures", () => {
  it.effect("returns NoUsableSession for missing and deleted state without a tombstone", () =>
    scenario(
      Effect.gen(function*() {
        const redis = yield* SessionRedis
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const established = yield* establish(service, 30, 5)
        yield* redis.removeAll
        expect(yield* service.read({ reference: established.reference })).toStrictEqual(noUsableSession)
        const expired = yield* establish(service, 5, 0)
        yield* TestClock.setTime(expired.session.idleDeadlineEpochMilliseconds)
        expect(yield* service.read({ reference: expired.reference })).toStrictEqual(expiredSession)
        expect(yield* recordCount).toBe(0)
      })
    ))

  it.effect("does not renew or delete a record with an unsafe integer warning", () =>
    scenario(
      Effect.gen(function*() {
        const redis = yield* SessionRedis
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const established = yield* establish(service, 30, 5)
        yield* redis.rewriteAll((payload) =>
          JSON.stringify({ ...JSON.parse(payload), warningLeadMinutes: 9_007_199_254_740_992 })
        )
        const before = yield* redis.records
        const refreshed = yield* service.refreshForTenant({
          activity: "continue-session",
          policy: policyOf(12, 1),
          reference: established.reference,
          tenantAlias: alias
        }).pipe(Effect.result)
        expect(Result.isFailure(refreshed)).toBe(true)
        if (Result.isFailure(refreshed)) expect(refreshed.failure).toBeInstanceOf(SessionServiceUnavailable)
        yield* TestClock.setTime(established.session.idleDeadlineEpochMilliseconds)
        const expired = yield* service.read({ reference: established.reference }).pipe(Effect.result)
        expect(Result.isFailure(expired)).toBe(true)
        if (Result.isFailure(expired)) expect(expired.failure).toBeInstanceOf(SessionServiceUnavailable)
        yield* unchangedSince(before)
      })
    ))

  it.effect("returns SessionServiceUnavailable when refresh cannot evaluate or decode", () =>
    scenario(
      Effect.gen(function*() {
        const redis = yield* SessionRedis
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const established = yield* establish(service, 30, 5)
        const before = yield* redis.records
        yield* redis.injectNext("EVALSHA", { _tag: "Fail", cause: new Error("controlled EVALSHA failure") })
        const transport = yield* service.refreshForTenant({
          activity: "text-entry",
          policy: policyOf(12, 1),
          reference: established.reference,
          tenantAlias: alias
        }).pipe(Effect.result)
        expect(Result.isFailure(transport)).toBe(true)
        if (Result.isFailure(transport)) {
          expect(transport.failure).toBeInstanceOf(SessionServiceUnavailable)
          expect(transport.failure).not.toBeInstanceOf(SessionTenantMismatch)
          const diagnostic = publicDiagnostic(transport.failure)
          expect(diagnostic).not.toContain(established.reference)
          expect(diagnostic).not.toContain("subject-1")
          expect(diagnostic).not.toContain("test:session")
        }
        yield* unchangedSince(before)
        yield* redis.injectNext("EVALSHA", { _tag: "Reply", value: ["unrecognized"] })
        const decoded = yield* service.refreshForTenant({
          activity: "text-entry",
          policy: policyOf(12, 1),
          reference: established.reference,
          tenantAlias: alias
        }).pipe(Effect.result)
        expect(Result.isFailure(decoded)).toBe(true)
        if (Result.isFailure(decoded)) expect(decoded.failure).toBeInstanceOf(SessionServiceUnavailable)
        yield* unchangedSince(before)
      })
    ))

  it.effect.each([
    ["current"],
    ["current", 1],
    ["expired", "extra"],
    ["renewed", "payload", "extra"],
    ["malformed"],
    ["rejected"],
    "current",
    null
  ])("fails closed for the unexpected script reply %j", (reply) =>
    scenario(
      Effect.gen(function*() {
        const redis = yield* SessionRedis
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const established = yield* establish(service, 30, 5)
        yield* redis.injectNext("EVALSHA", { _tag: "Reply", value: reply })
        const result = yield* service.read({ reference: established.reference }).pipe(Effect.result)
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
      })
    ))

  it.effect.each(
    [
      ["not-json", () => "not-json"],
      ["version", (payload: string) => JSON.stringify({ ...JSON.parse(payload), version: 3 })],
      ["missing-subject", (payload: string) => {
        const record = JSON.parse(payload) as Record<string, unknown>
        delete record.subject
        return JSON.stringify(record)
      }],
      ["excess", (payload: string) => JSON.stringify({ ...JSON.parse(payload), extra: true })]
    ] as const
  )(
    "leaves a %s record unchanged when refresh fails closed",
    ([_name, corrupt]) =>
      scenario(
        Effect.gen(function*() {
          const redis = yield* SessionRedis
          yield* TestClock.setTime(BASE_TIME)
          const service = yield* SessionService
          const established = yield* establish(service, 30, 5)
          yield* redis.rewriteAll(corrupt)
          const before = yield* redis.records
          const result = yield* service.refreshForTenant({
            activity: "continue-session",
            policy: policyOf(20, 4),
            reference: established.reference,
            tenantAlias: alias
          }).pipe(Effect.result)
          expect(Result.isFailure(result)).toBe(true)
          if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
          yield* unchangedSince(before)
        })
      )
  )

  it.effect("does not retry a refresh after the final write's result fails", () =>
    scenario(
      Effect.gen(function*() {
        const redis = yield* SessionRedis
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const established = yield* establish(service, 30, 5)
        const receivedAt = BASE_TIME + 5_000
        yield* TestClock.setTime(receivedAt)
        const evaluationsBefore = (yield* commandsNamed("EVALSHA")).length
        yield* redis.injectNext("EVALSHA", { _tag: "FailAfterApply" })
        const failed = yield* service.refreshForTenant({
          activity: "continue-session",
          policy: policyOf(11, 2),
          reference: established.reference,
          tenantAlias: alias
        }).pipe(Effect.result)
        expect(Result.isFailure(failed)).toBe(true)
        if (Result.isFailure(failed)) expect(failed.failure).toBeInstanceOf(SessionServiceUnavailable)
        expect(yield* commandsNamed("EVALSHA")).toHaveLength(evaluationsBefore + 1)
        expect(yield* service.read({ reference: established.reference })).toMatchObject({
          _tag: "UsableSession",
          idleDeadlineEpochMilliseconds: receivedAt + 11 * 60_000,
          warningLeadMinutes: 2
        })
      })
    ))
})

describe("SessionService shared reads", () => {
  it.effect("repeated reads preserve identical public state", () =>
    scenario(
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const { reference, session } = yield* establish(service, 30, 5)
        for (let i = 0; i < 3; i++) {
          const read = yield* service.read({ reference })
          expect(sessionState(read)).toStrictEqual(sessionState(session))
        }
      })
    ))
})
