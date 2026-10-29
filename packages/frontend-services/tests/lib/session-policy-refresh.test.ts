import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, FileSystem, Layer, Logger, Path, Result } from "effect"
import { TestClock } from "effect/testing"

import { SessionService, SessionServiceUnavailable, SessionTenantMismatch } from "../../src/session.ts"
import { TenantConfigService } from "../../src/tenant.ts"
import { makeSessionMemoryRedis } from "../helpers/session.ts"

const baseDocument = {
  displayName: "Synthetic policy",
  oidc: {
    clientAuth: "public" as const,
    clientId: "policy-client",
    issuer: "https://provider.test"
  }
}

const tenantDocument = (policy: Record<string, unknown>) => ({ ...baseDocument, ...policy })

const invalidPolicies = [
  ["fractional", { idleTimeoutMinutes: 5.5 }],
  ["nonnumeric", { idleTimeoutMinutes: "15" }],
  ["below-range", { idleTimeoutMinutes: 4 }],
  ["above-range", { idleTimeoutMinutes: 31 }],
  ["warning-equal", { idleTimeoutMinutes: 10, warningLeadMinutes: 10 }],
  ["warning-greater", { idleTimeoutMinutes: 10, warningLeadMinutes: 11 }]
] as const

const BASE_TIME = 1_800_000_000_000

const selectedPolicy = Effect.fnUntraced(function*(host: string) {
  const tenant = yield* TenantConfigService
  const config = yield* tenant.getConfigFromHost(host)
  const alias = tenant.getAlias(host)
  if (Result.isFailure(alias)) return yield* alias.failure
  return { alias: alias.success, policy: tenant.effectiveSessionPolicy(config) }
})

const establishFromHost = Effect.fnUntraced(function*(host: string, subject: string) {
  const selected = yield* selectedPolicy(host)
  const session = yield* SessionService
  return yield* session.establish({
    identity: { issuer: "https://provider.test/", subject },
    policy: selected.policy,
    tenantAlias: selected.alias
  })
})

const refreshFromHost = Effect.fnUntraced(function*(host: string, reference: string) {
  const selected = yield* selectedPolicy(host)
  const session = yield* SessionService
  return yield* session.refreshForTenant({
    activity: "continue-session",
    policy: selected.policy,
    reference,
    tenantAlias: selected.alias
  })
})

const world = (
  redis: ReturnType<typeof makeSessionMemoryRedis>,
  documents: ReadonlyMap<string, ReturnType<typeof tenantDocument>>
) =>
  Layer.mergeAll(
    SessionService.layer.pipe(
      Layer.provide(redis.layer),
      Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ SESSION_KEY_PREFIX: "test:session" })))
    ),
    TenantConfigService.layer({
      env: "test",
      tenant: { baseHostname: "example.test", configDir: "/tenant-config", resolution: "host" }
    })
  ).pipe(
    Layer.provide(FileSystem.layerNoop({
      readDirectory: () => Effect.succeed([...documents.keys()]),
      readFileString: (path) => {
        const name = path.slice(path.lastIndexOf("/") + 1)
        const document = documents.get(name)
        return document === undefined
          ? Effect.die(`Missing synthetic tenant file ${name}`)
          : Effect.succeed(JSON.stringify(document))
      }
    })),
    Layer.provide(Path.layer),
    Layer.provide(Logger.layer([]))
  )

describe("selected tenant policy and session refresh", () => {
  it.effect.each(invalidPolicies)(
    "rejects a %s tenant policy before establish or refresh",
    ([name, policy]) => {
      const redis = makeSessionMemoryRedis()
      const documents = new Map([[`${name}.json`, tenantDocument(policy)]])
      const host = `${name}.example.test`
      return Effect.gen(function*() {
        const established = yield* establishFromHost(host, "subject-policy").pipe(Effect.result)
        const refreshed = yield* refreshFromHost(host, "not-a-reference").pipe(Effect.result)
        expect(Result.isFailure(established)).toBe(true)
        expect(Result.isFailure(refreshed)).toBe(true)
        if (Result.isFailure(established)) {
          expect(established.failure).toHaveProperty("status", 404)
          expect(established.failure).not.toBeInstanceOf(SessionServiceUnavailable)
          expect(established.failure).not.toBeInstanceOf(SessionTenantMismatch)
        }
        if (Result.isFailure(refreshed)) expect(refreshed.failure).toHaveProperty("status", 404)
        expect(redis.commands).toEqual([])
      }).pipe(Effect.provide(world(redis, documents)))
    }
  )

  it.effect("adopts the selected policy only on that session's qualifying refresh", () => {
    const documents = new Map<string, ReturnType<typeof tenantDocument>>([
      ["renewal.json", tenantDocument({ idleTimeoutMinutes: 30, warningLeadMinutes: 5 })]
    ])
    const redis = makeSessionMemoryRedis()
    return Effect.gen(function*() {
      yield* TestClock.setTime(BASE_TIME)
      const session = yield* SessionService
      const first = yield* establishFromHost("renewal.example.test", "subject-a")
      documents.set("renewal.json", tenantDocument({ idleTimeoutMinutes: 5, warningLeadMinutes: 0 }))
      const second = yield* establishFromHost("renewal.example.test", "subject-b")
      expect(first.session).toMatchObject({
        idleDeadlineEpochMilliseconds: BASE_TIME + 30 * 60_000,
        warningLeadMinutes: 5
      })
      expect(second.session).toMatchObject({
        idleDeadlineEpochMilliseconds: BASE_TIME + 5 * 60_000,
        warningLeadMinutes: 0
      })
      expect(yield* session.read({ reference: first.reference })).toStrictEqual(first.session)
      const receivedAt = BASE_TIME + 20_000
      yield* TestClock.setTime(receivedAt)
      const renewed = yield* refreshFromHost("renewal.example.test", first.reference)
      expect(renewed).toMatchObject({
        idleDeadlineEpochMilliseconds: receivedAt + 5 * 60_000,
        warningLeadMinutes: 0
      })
      expect(yield* session.read({ reference: second.reference })).toStrictEqual(second.session)
      documents.set("renewal.json", tenantDocument({ idleTimeoutMinutes: 30, warningLeadMinutes: 5 }))
      const later = receivedAt + 10_000
      yield* TestClock.setTime(later)
      const restored = yield* refreshFromHost("renewal.example.test", second.reference)
      expect(restored).toMatchObject({
        idleDeadlineEpochMilliseconds: later + 30 * 60_000,
        warningLeadMinutes: 5
      })
      expect(yield* session.read({ reference: first.reference })).toStrictEqual(renewed)
    }).pipe(
      Effect.provide(world(redis, documents)),
      Effect.provide(TestClock.layer())
    )
  })
})
