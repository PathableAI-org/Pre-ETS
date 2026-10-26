import { describe, expect, it } from "@effect/vitest"
import { fc, test } from "@fast-check/vitest"
import { ConfigProvider, Effect, Layer, Result, Schema } from "effect"
import { TestClock } from "effect/testing"
import { vi } from "vitest"

import {
  type EffectiveSessionPolicy,
  type EstablishSessionInput,
  type NoUsableSession,
  type ReadSessionForTenantInput,
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
        expect(redis.entries.size).toBe(1)
        yield* TestClock.adjust("1 minute")
        expect(yield* service.read({ reference })).toStrictEqual(noUsableSession)
        expect(redis.entries.size).toBe(1)
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
        redis.failNextCommand("GET")
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
        redis.failNextCommand("GET")
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
