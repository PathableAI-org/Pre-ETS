import { NodeRedis } from "@effect/platform-node"
import { ConfigProvider, Effect, Layer, ManagedRuntime, Result, Schema } from "effect"
import * as Redis from "effect/persistence/Redis"
import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"

import { SessionService, SessionServiceUnavailable } from "../../src/lib/session.ts"
import { TenantAlias } from "../../src/lib/tenant.ts"

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
const sessionPrefix = `test:session:${randomUUID()}:`
const alias = Schema.decodeSync(TenantAlias)("alpha")

const redisLayer = () =>
  NodeRedis.layer({
    disableOfflineQueue: true,
    pingInterval: 1_000,
    socket: { socketTimeout: 5_000 },
    url: redisUrl
  })

const sessionLayer = (prefix: string) =>
  SessionService.layer.pipe(
    Layer.provide(redisLayer()),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ SESSION_KEY_PREFIX: prefix })))
  )

const identity = { issuer: "https://provider.test/", subject: "subject-redis" }

const establish = (
  runtime: ManagedRuntime.ManagedRuntime<SessionService, unknown>,
  idleTimeoutMinutes: number
) =>
  runtime.runPromise(
    Effect.gen(function*() {
      const service = yield* SessionService
      return yield* service.establish({
        identity,
        policy: { idleTimeoutMinutes, warningLeadMinutes: 5 },
        tenantAlias: alias
      })
    })
  )

const read = (runtime: ManagedRuntime.ManagedRuntime<SessionService, unknown>, reference: string) =>
  runtime.runPromise(
    Effect.gen(function*() {
      const service = yield* SessionService
      return yield* service.read({ reference })
    })
  )

describe("SessionService with independently scoped NodeRedis clients", () => {
  it("establishes on A and reads identical public state on B and a recreated B", async () => {
    const runtimeA = ManagedRuntime.make(sessionLayer(sessionPrefix))
    const runtimeB = ManagedRuntime.make(sessionLayer(sessionPrefix))
    try {
      const established = await establish(runtimeA, 30)
      const fromB = await read(runtimeB, established.reference)
      expect(fromB).toStrictEqual(established.session)

      await runtimeB.dispose()
      const runtimeB2 = ManagedRuntime.make(sessionLayer(sessionPrefix))
      try {
        const fromB2 = await read(runtimeB2, established.reference)
        expect(fromB2).toStrictEqual(established.session)
      } finally {
        await runtimeB2.dispose()
      }
    } finally {
      await runtimeA.dispose()
      await runtimeB.dispose().catch(() => undefined)
    }
  })

  it("returns NoUsableSession for a missing record", async () => {
    const runtime = ManagedRuntime.make(sessionLayer(sessionPrefix))
    try {
      const bytes = new Uint8Array(32)
      bytes[0] = 7
      const absentReference = Buffer.from(bytes).toString("base64url")
      const result = await read(runtime, absentReference)
      expect(result).toStrictEqual({ _tag: "NoUsableSession" })
    } finally {
      await runtime.dispose()
    }
  })

  it("translates a store outage into SessionServiceUnavailable for establishment", async () => {
    // A controlled outage at the Redis command boundary proves the real store
    // adapter and SessionService translate transport failure without leaking
    // the underlying cause into the public error.
    const unavailableRedis = Redis.make({
      send: () => Effect.fail(new Redis.RedisError({ cause: new Error("controlled outage") })),
      subscribe: () => Effect.succeed(Effect.never)
    })
    const unavailable = SessionService.layer.pipe(
      Layer.provide(Layer.effect(Redis.Redis, unavailableRedis)),
      Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ SESSION_KEY_PREFIX: sessionPrefix })))
    )
    const runtime = ManagedRuntime.make(unavailable)
    try {
      const result = await runtime.runPromise(
        Effect.gen(function*() {
          const service = yield* SessionService
          return yield* service.establish({
            identity,
            policy: { idleTimeoutMinutes: 30, warningLeadMinutes: 5 },
            tenantAlias: alias
          }).pipe(Effect.result)
        })
      )
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
    } finally {
      await runtime.dispose()
    }
  })
})
