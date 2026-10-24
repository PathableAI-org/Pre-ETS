import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer, Result, Schema } from "effect"
import { TestClock } from "effect/testing"
import { vi } from "vitest"

import {
  type EffectiveSessionPolicy,
  type EstablishSessionInput,
  type NoUsableSession,
  type SessionIdentity,
  SessionService,
  SessionServiceUnavailable
} from "../../src/lib/session.ts"
import { TenantAlias } from "../../src/lib/tenant.ts"
import { makeSessionMemoryRedis } from "../helpers/session.ts"

const alias = Schema.decodeSync(TenantAlias)("alpha")
const noUsableSession: NoUsableSession = { _tag: "NoUsableSession" }

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

  it.effect("keeps hasSession() false for the no-input root consumer", () =>
    scenario(() =>
      Effect.gen(function*() {
        const service = yield* SessionService
        expect(yield* service.hasSession()).toBe(false)
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
