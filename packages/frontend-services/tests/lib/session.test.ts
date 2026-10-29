import { describe, expect, it } from "@effect/vitest"
import { fc, test } from "@fast-check/vitest"
import { ConfigProvider, Deferred, Effect, Fiber, Layer, Result, Schema } from "effect"
import { TestClock } from "effect/testing"
import { vi } from "vitest"

import {
  type EffectiveSessionPolicy,
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
import { TenantAlias } from "../../src/tenant.ts"
import { makeSessionMemoryRedis } from "../helpers/session.ts"

const alias = Schema.decodeSync(TenantAlias)("alpha")
const otherAlias = Schema.decodeSync(TenantAlias)("beta")
const noUsableSession: NoUsableSession = { _tag: "NoUsableSession" }
const aliasCharacter = fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz-".split(""))
const aliasArb = fc.array(aliasCharacter, { maxLength: 12, minLength: 1 }).map((characters) => characters.join(""))

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

const policyOf = (idleTimeoutMinutes: number, warningLeadMinutes: number): EffectiveSessionPolicy => ({
  idleTimeoutMinutes,
  warningLeadMinutes
})

const redisWorld = (redis: ReturnType<typeof makeSessionMemoryRedis>) =>
  SessionService.layer.pipe(
    Layer.provide(redis.layer),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ SESSION_KEY_PREFIX: "test:session" })))
  )

const scenario = <A, E>(
  program: (redis: ReturnType<typeof makeSessionMemoryRedis>) => Effect.Effect<A, E, SessionService>
) => {
  const redis = makeSessionMemoryRedis()
  return program(redis).pipe(Effect.provide(redisWorld(redis)))
}

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

describe("SessionService establishment", () => {
  it.effect("establishes a tenant-bound session with the effective deadline and warning policy", () =>
    scenario(() =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const result = yield* establish(service, 30, 5)
        expect(result.reference).toMatch(/^[A-Za-z0-9_-]{43}$/)
        expect(result.reference).not.toContain("subject-1")
        expect(result.reference).not.toContain("alpha")
        expect(result.session).toStrictEqual({
          _tag: "UsableSession",
          identity: { issuer: "https://provider.test/", subject: "subject-1" },
          idleDeadlineEpochMilliseconds: BASE_TIME + 30 * 60_000,
          tenantAlias: alias,
          warningLeadMinutes: 5
        })
      })
    ))

  it.effect("preserves a disabled warning policy", () =>
    scenario(() =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const result = yield* establish(service, 5, 0)
        expect(result.session.warningLeadMinutes).toBe(0)
        expect(result.session.idleDeadlineEpochMilliseconds).toBe(BASE_TIME + 5 * 60_000)
      })
    ))

  it.effect("returns a readable usable session with identical public fields", () =>
    scenario(() =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const { reference } = yield* establish(service, 7, 3)
        const read = yield* service.read({ reference })
        expect(read).toStrictEqual({
          _tag: "UsableSession",
          identity: { issuer: "https://provider.test/", subject: "subject-1" },
          idleDeadlineEpochMilliseconds: BASE_TIME + 7 * 60_000,
          tenantAlias: alias,
          warningLeadMinutes: 3
        })
      })
    ))
})

describe("SessionService read outcomes", () => {
  it.effect("returns NoUsableSession for an absent reference without a Redis lookup", () =>
    scenario((redis) =>
      Effect.gen(function*() {
        const service = yield* SessionService
        const result = yield* service.read({})
        expect(result).toStrictEqual(noUsableSession)
        expect(redis.entries.size).toBe(0)
      })
    ))

  it.effect("returns NoUsableSession for a malformed reference without a Redis lookup", () =>
    scenario((redis) =>
      Effect.gen(function*() {
        const service = yield* SessionService
        const result = yield* service.read({ reference: "not-a-valid-reference" })
        expect(result).toStrictEqual(noUsableSession)
        expect(redis.entries.size).toBe(0)
      })
    ))

  it.effect("returns NoUsableSession for a missing record", () =>
    scenario((redis) =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const { reference } = yield* establish(service, 30, 5)
        redis.entries.clear()
        const result = yield* service.read({ reference })
        expect(result).toStrictEqual(noUsableSession)
      })
    ))

  it.effect("returns NoUsableSession at and after the stored deadline", () =>
    scenario((redis) =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const { reference } = yield* establish(service, 30, 5)
        yield* TestClock.adjust("30 minutes")
        expect(yield* service.read({ reference })).toStrictEqual(noUsableSession)
        expect(redis.entries.size).toBe(0)
        yield* TestClock.adjust("1 minute")
        expect(yield* service.read({ reference })).toStrictEqual(noUsableSession)
        expect(redis.entries.size).toBe(0)
      })
    ))

  it.effect("returns SessionServiceUnavailable for a corrupted stored record", () =>
    scenario((redis) =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const { reference } = yield* establish(service, 30, 5)
        for (const key of redis.entries.keys()) redis.entries.set(key, "not-json")
        const result = yield* service.read({ reference }).pipe(Effect.result)
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
      })
    ))

  it.effect("returns SessionServiceUnavailable for an unknown record version", () =>
    scenario((redis) =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const { reference } = yield* establish(service, 30, 5)
        for (const [key, payload] of redis.entries) {
          const record = JSON.parse(payload) as Record<string, unknown>
          redis.entries.set(key, JSON.stringify({ ...record, version: 2 }))
        }
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
    scenario(() =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const fixedBytes = new Uint8Array(32)
        fixedBytes[0] = 1
        const spy = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
          const target = array as Uint8Array
          target.set(fixedBytes)
          return target
        })
        try {
          yield* establish(service, 30, 5)
          const result = yield* establish(service, 30, 5).pipe(Effect.result)
          expect(Result.isFailure(result)).toBe(true)
          if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
        } finally {
          spy.mockRestore()
        }
      })
    ))

  it.effect("fails closed on a Redis read failure", () =>
    scenario((redis) =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const { reference } = yield* establish(service, 30, 5)
        redis.failNextCommand("EVALSHA")
        const result = yield* service.read({ reference }).pipe(Effect.result)
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
      })
    ))

  it.effect("returns SessionServiceUnavailable when establishment cannot persist", () =>
    scenario((redis) =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        redis.failNextCommand("SET")
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

describe("SessionService tenant admission", () => {
  it.effect("returns the usable session read for the same branded alias", () =>
    scenario(() =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const { reference } = yield* establish(service, 7, 3)
        const read = yield* service.read({ reference })
        const admittedInput: ReadSessionForTenantInput = { reference, tenantAlias: alias }
        const admitted = yield* service.readForTenant(admittedInput)
        expect(admitted).toStrictEqual(read)
        if (read._tag === "UsableSession" && admitted._tag === "UsableSession") {
          expect(admitted.identity).toStrictEqual(read.identity)
          expect(admitted.tenantAlias).toBe(read.tenantAlias)
          expect(admitted.idleDeadlineEpochMilliseconds).toBe(read.idleDeadlineEpochMilliseconds)
          expect(admitted.warningLeadMinutes).toBe(read.warningLeadMinutes)
        }
      })
    ))

  it.effect("fails with a fieldless tenant mismatch and no identity or tenant diagnostic", () =>
    scenario(() =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const { reference } = yield* establish(service, 30, 5)
        const result = yield* service.readForTenant({ reference, tenantAlias: otherAlias }).pipe(Effect.result)
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(SessionTenantMismatch)
          expect(result.failure._tag).toBe(SessionTenantMismatch.tag)
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
    scenario((redis) =>
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
        expect(redis.entries.size).toBe(0)
      })
    ))

  it.effect("keeps a Redis read failure distinct from absence and mismatch", () =>
    scenario((redis) =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const { reference } = yield* establish(service, 30, 5)
        redis.failNextCommand("EVALSHA")
        const result = yield* service.readForTenant({ reference, tenantAlias: alias }).pipe(Effect.result)
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
          expect(result.failure).not.toBeInstanceOf(SessionTenantMismatch)
        }
      })
    ))

  test.prop([aliasArb, aliasArb])(
    "admits a stored session only when the request alias is branded-equal",
    async (storedText, requestText) => {
      const storedAlias = Schema.decodeSync(TenantAlias)(storedText)
      const requestAlias = Schema.decodeSync(TenantAlias)(requestText)
      const redis = makeSessionMemoryRedis()
      const outcome = await Effect.runPromise(
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
          return { admitted, read }
        }).pipe(Effect.provide(redisWorld(redis)))
      )
      if (storedAlias === requestAlias) {
        expect(Result.isSuccess(outcome.admitted)).toBe(true)
        if (Result.isSuccess(outcome.admitted)) expect(outcome.admitted.success).toStrictEqual(outcome.read)
        return
      }
      expect(Result.isFailure(outcome.admitted)).toBe(true)
      if (Result.isFailure(outcome.admitted)) {
        expect(outcome.admitted.failure).toBeInstanceOf(SessionTenantMismatch)
      }
    }
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
  readonly policy: EffectiveSessionPolicy
  readonly reference?: string
  readonly tenantAlias: TenantAlias
}
type MissingExcluded = Exclude<ExcludedSessionActivity, (typeof excludedActivities)[number]>
type MissingQualifying = Exclude<QualifyingSessionActivity, (typeof qualifyingActivities)[number]>

const qualifyingListIsClosed: [MissingQualifying] extends [never] ? true : false = true
const excludedListIsClosed: [MissingExcluded] extends [never] ? true : false = true
const excludedActivityRejectsPolicy: ExcludedCarryingPolicy extends RefreshSessionForTenantInput ? false : true = true

const storedSnapshot = (redis: ReturnType<typeof makeSessionMemoryRedis>) => ({
  entries: new Map(redis.entries),
  ttls: new Map(redis.ttls)
})

const validPolicyArb = fc.integer({ max: 30, min: 5 }).chain((idleTimeoutMinutes) =>
  fc.integer({ max: idleTimeoutMinutes - 1, min: 0 }).map((warningLeadMinutes) => ({
    idleTimeoutMinutes,
    warningLeadMinutes
  }))
)

describe("SessionService.refreshForTenant renewal", () => {
  it("rejects excluded activity that carries policy and keeps the activity lists closed", () => {
    expect(qualifyingListIsClosed).toBe(true)
    expect(excludedListIsClosed).toBe(true)
    expect(excludedActivityRejectsPolicy).toBe(true)
  })

  it.effect.each(qualifyingActivities)(
    "renews a still-usable session for %s from one effective policy",
    (activity) =>
      scenario(() =>
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
          expect(renewed).toStrictEqual({
            _tag: "UsableSession",
            identity: established.session.identity,
            idleDeadlineEpochMilliseconds: receivedAt + 12 * 60_000,
            tenantAlias: alias,
            warningLeadMinutes: 4
          })
          expect(yield* service.read({ reference: established.reference })).toStrictEqual(renewed)
        })
      )
  )

  it.effect("adopts a changed timeout and warning together, including a disabled warning", () =>
    scenario(() =>
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
    scenario((redis) =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const first = yield* establish(service, 30, 5)
        const second = yield* service.establish({
          identity: { issuer: "https://provider.test/", subject: "subject-2" },
          policy: policyOf(20, 3),
          tenantAlias: alias
        })
        const before = storedSnapshot(redis)
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
        expect(yield* service.read({ reference: second.reference })).toStrictEqual(second.session)
        const secondKey = [...before.entries.keys()].find((key) => before.entries.get(key)?.includes("\"subject-2\""))
        expect(secondKey).toEqual(expect.any(String))
        if (secondKey !== undefined) {
          expect(redis.entries.get(secondKey)).toBe(before.entries.get(secondKey))
          expect(redis.ttls.get(secondKey)).toBe(before.ttls.get(secondKey))
        }
      })
    ))

  it.effect("returns NoUsableSession for an absent or invalid reference without a Redis lookup", () =>
    scenario((redis) =>
      Effect.gen(function*() {
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
        expect(redis.entries.size).toBe(0)
        expect(redis.commands).not.toContain("EVALSHA")
        expect(redis.commands).not.toContain("GET")
        expect(redis.commands).not.toContain("SET")
      })
    ))

  it.effect("returns fieldless SessionTenantMismatch and leaves bytes and TTL unchanged", () =>
    scenario((redis) =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const established = yield* establish(service, 30, 5)
        const before = storedSnapshot(redis)
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
        expect(storedSnapshot(redis)).toEqual(before)
        expect(yield* service.read({ reference: established.reference })).toStrictEqual(established.session)
      })
    ))

  it.effect("keeps mismatch ahead of an already expired deadline without mutation", () =>
    scenario((redis) =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const established = yield* establish(service, 30, 5)
        const before = storedSnapshot(redis)
        yield* TestClock.adjust("30 minutes")
        const mismatched = yield* service.refreshForTenant({
          activity: "continue-session",
          policy: policyOf(30, 5),
          reference: established.reference,
          tenantAlias: otherAlias
        }).pipe(Effect.result)
        expect(Result.isFailure(mismatched)).toBe(true)
        if (Result.isFailure(mismatched)) expect(mismatched.failure).toBeInstanceOf(SessionTenantMismatch)
        expect(storedSnapshot(redis)).toEqual(before)
        expect(redis.entries.size).toBe(1)
      })
    ))
})

describe("SessionService.refreshForTenant policy properties", () => {
  test.prop([validPolicyArb, validPolicyArb, fc.integer({ max: 299_999, min: 0 })], { numRuns: 40 })(
    "renewed deadline and warning come from the same refresh policy",
    async (establishedPolicy, refreshPolicy, offset) => {
      const redis = makeSessionMemoryRedis()
      const receivedAt = BASE_TIME + offset
      const renewed = await Effect.runPromise(
        Effect.gen(function*() {
          yield* TestClock.setTime(BASE_TIME)
          const service = yield* SessionService
          const established = yield* service.establish({
            identity: { issuer: "https://provider.test/", subject: "subject-1" },
            policy: establishedPolicy,
            tenantAlias: alias
          })
          yield* TestClock.setTime(receivedAt)
          return yield* service.refreshForTenant({
            activity: "continue-session",
            policy: refreshPolicy,
            reference: established.reference,
            tenantAlias: alias
          })
        }).pipe(
          Effect.provide(redisWorld(redis)),
          Effect.provide(TestClock.layer())
        )
      )
      expect(renewed).toMatchObject({
        _tag: "UsableSession",
        idleDeadlineEpochMilliseconds: receivedAt + refreshPolicy.idleTimeoutMinutes * 60_000,
        warningLeadMinutes: refreshPolicy.warningLeadMinutes
      })
    }
  )
})

describe("SessionService.refreshForTenant expiration", () => {
  it.effect.each(excludedActivities)(
    "returns the current session for %s without writing",
    (activity) =>
      scenario((redis) =>
        Effect.gen(function*() {
          yield* TestClock.setTime(BASE_TIME)
          const service = yield* SessionService
          const established = yield* establish(service, 30, 5)
          const before = storedSnapshot(redis)
          const observed = yield* service.refreshForTenant({
            activity,
            reference: established.reference,
            tenantAlias: alias
          })
          expect(observed).toStrictEqual(established.session)
          expect(storedSnapshot(redis)).toEqual(before)
        })
      )
  )

  it.effect.each(qualifyingActivities)(
    "returns NoUsableSession for %s at the stored deadline and deletes the record",
    (activity) =>
      scenario((redis) =>
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
          expect(result).toStrictEqual(noUsableSession)
          expect(redis.entries.size).toBe(0)
          expect(yield* service.read({ reference: established.reference })).toStrictEqual(noUsableSession)
        })
      )
  )

  it.effect("does not revive an expired session when the timeout later increases", () =>
    scenario((redis) =>
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
        expect(revived).toStrictEqual(noUsableSession)
        expect(redis.entries.size).toBe(0)
        expect(yield* service.read({ reference: established.reference })).toStrictEqual(noUsableSession)
      })
    ))

  it.effect("returns NoUsableSession for an expired record before tenant admission on read", () =>
    scenario((redis) =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const established = yield* establish(service, 30, 5)
        yield* TestClock.setTime(established.session.idleDeadlineEpochMilliseconds)
        const result = yield* service.readForTenant({
          reference: established.reference,
          tenantAlias: otherAlias
        })
        expect(result).toStrictEqual(noUsableSession)
        expect(redis.entries.size).toBe(0)
      })
    ))

  it.effect("returns NoUsableSession when a usable read completes after its deadline", () =>
    scenario((redis) =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const established = yield* establish(service, 30, 5)
        const started = yield* Deferred.make<undefined>()
        const release = yield* Deferred.make<undefined>()
        redis.holdNextEvaluation({ release, started })
        const fiber = yield* Effect.forkChild(service.read({ reference: established.reference }))
        yield* Deferred.await(started)
        yield* TestClock.setTime(established.session.idleDeadlineEpochMilliseconds)
        yield* Deferred.succeed(release, undefined)
        expect(yield* Fiber.join(fiber)).toStrictEqual(noUsableSession)
        expect(redis.entries.size).toBe(1)
      })
    ))
})

describe("SessionService storage failures", () => {
  it.effect("returns NoUsableSession for missing and deleted state without a tombstone", () =>
    scenario((redis) =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const established = yield* establish(service, 30, 5)
        redis.entries.clear()
        expect(yield* service.read({ reference: established.reference })).toStrictEqual(noUsableSession)
        const expired = yield* establish(service, 5, 0)
        yield* TestClock.setTime(expired.session.idleDeadlineEpochMilliseconds)
        expect(yield* service.read({ reference: expired.reference })).toStrictEqual(noUsableSession)
        expect(redis.entries.size).toBe(0)
        expect([...redis.entries.values()].join("\n")).not.toContain("tombstone")
      })
    ))

  it.effect("returns SessionServiceUnavailable when refresh cannot evaluate or decode", () =>
    scenario((redis) =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const established = yield* establish(service, 30, 5)
        const before = storedSnapshot(redis)
        redis.failNextCommand("EVALSHA")
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
        expect(storedSnapshot(redis)).toEqual(before)
        redis.returnNextEvaluation(["unrecognized"])
        const decoded = yield* service.refreshForTenant({
          activity: "text-entry",
          policy: policyOf(12, 1),
          reference: established.reference,
          tenantAlias: alias
        }).pipe(Effect.result)
        expect(Result.isFailure(decoded)).toBe(true)
        if (Result.isFailure(decoded)) expect(decoded.failure).toBeInstanceOf(SessionServiceUnavailable)
        expect(storedSnapshot(redis)).toEqual(before)
      })
    ))

  it.effect.each(
    [
      ["not-json", () => "not-json"],
      ["version", (payload: string) => JSON.stringify({ ...JSON.parse(payload), version: 2 })],
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
      scenario((redis) =>
        Effect.gen(function*() {
          yield* TestClock.setTime(BASE_TIME)
          const service = yield* SessionService
          const established = yield* establish(service, 30, 5)
          const key = [...redis.entries.keys()][0]
          expect(key).toEqual(expect.any(String))
          if (key === undefined) return
          redis.entries.set(key, corrupt(redis.entries.get(key) ?? ""))
          const before = storedSnapshot(redis)
          const result = yield* service.refreshForTenant({
            activity: "continue-session",
            policy: policyOf(20, 4),
            reference: established.reference,
            tenantAlias: alias
          }).pipe(Effect.result)
          expect(Result.isFailure(result)).toBe(true)
          if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
          expect(storedSnapshot(redis)).toEqual(before)
        })
      )
  )

  it.effect("does not retry a refresh after the final write's result fails", () =>
    scenario((redis) =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const established = yield* establish(service, 30, 5)
        const receivedAt = BASE_TIME + 5_000
        yield* TestClock.setTime(receivedAt)
        const evaluationsBefore = redis.commands.filter((command) => command === "EVALSHA").length
        redis.failNextEvaluationAfterMutation()
        const failed = yield* service.refreshForTenant({
          activity: "continue-session",
          policy: policyOf(11, 2),
          reference: established.reference,
          tenantAlias: alias
        }).pipe(Effect.result)
        expect(Result.isFailure(failed)).toBe(true)
        if (Result.isFailure(failed)) expect(failed.failure).toBeInstanceOf(SessionServiceUnavailable)
        expect(redis.commands.filter((command) => command === "EVALSHA").length).toBe(evaluationsBefore + 1)
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
    scenario(() =>
      Effect.gen(function*() {
        yield* TestClock.setTime(BASE_TIME)
        const service = yield* SessionService
        const { reference, session } = yield* establish(service, 30, 5)
        for (let i = 0; i < 3; i++) {
          const read = yield* service.read({ reference })
          expect(read).toStrictEqual(session)
        }
      })
    ))
})
