import { NodeRedis } from "@effect/platform-node"
import { ConfigProvider, Effect, Layer, ManagedRuntime, Result, Schema } from "effect"
import * as Redis from "effect/persistence/Redis"
import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { afterAll, describe, expect, it } from "vitest"

import { type NoUsableSession, SessionService, SessionServiceUnavailable } from "../../src/lib/session.ts"
import { TenantAlias } from "../../src/lib/tenant.ts"

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
const sessionPrefix = `test:session:${randomUUID()}:`
const alias = Schema.decodeSync(TenantAlias)("alpha")
const noUsableSession: NoUsableSession = { _tag: "NoUsableSession" }
const ownedSessionPrefix = /^test:session:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:$/

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

const disconnectedLayer = (prefix: string) => {
  const redis = NodeRedis.layer({
    disableOfflineQueue: true,
    pingInterval: 1_000,
    socket: {
      reconnectStrategy: () => false,
      socketTimeout: 1_000
    },
    url: redisUrl
  })
  return SessionService.layer.pipe(
    Layer.provideMerge(redis),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ SESSION_KEY_PREFIX: prefix })))
  )
}

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

const deleteOwnedPrefix = async (prefix: string) => {
  if (!ownedSessionPrefix.test(prefix)) {
    throw new Error("Refusing to clean an unvalidated session prefix")
  }
  const runtime = ManagedRuntime.make(redisLayer())
  try {
    await runtime.runPromise(Effect.gen(function*() {
      const redis = yield* Redis.Redis
      let cursor = "0"
      do {
        const page = yield* redis.send<readonly [string, readonly string[]]>(
          "SCAN",
          cursor,
          "MATCH",
          `${prefix}*`,
          "COUNT",
          "100"
        )
        const keys = page[1].filter((key) => key.startsWith(prefix))
        if (keys.length > 0) yield* redis.send("DEL", ...keys)
        cursor = page[0]
      } while (cursor !== "0")
    }))
  } finally {
    await runtime.dispose()
  }
}

const ownedKeyMetadata = async (prefix: string) => {
  if (!ownedSessionPrefix.test(prefix)) {
    throw new Error("Refusing to inspect an unvalidated session prefix")
  }
  const runtime = ManagedRuntime.make(redisLayer())
  try {
    return await runtime.runPromise(Effect.gen(function*() {
      const redis = yield* Redis.Redis
      let cursor = "0"
      let count = 0
      let ttlMilliseconds = -2
      do {
        const page = yield* redis.send<readonly [string, readonly string[]]>(
          "SCAN",
          cursor,
          "MATCH",
          `${prefix}*`,
          "COUNT",
          "100"
        )
        const keys = page[1].filter((key) => key.startsWith(prefix))
        for (const key of keys) {
          const ttl = yield* redis.send<number>("PTTL", key)
          if (ttl === -2) continue
          count += 1
          ttlMilliseconds = Math.max(ttlMilliseconds, ttl)
        }
        cursor = page[0]
      } while (cursor !== "0")
      return { count, ttlMilliseconds }
    }))
  } finally {
    await runtime.dispose()
  }
}

const destroyClient = Effect.gen(function*() {
  const node = yield* NodeRedis.NodeRedis
  node.client.destroy()
})

describe("SessionService with independently scoped NodeRedis clients", () => {
  afterAll(async () => {
    await deleteOwnedPrefix(sessionPrefix)
  })

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
      expect(result).toStrictEqual(noUsableSession)
    } finally {
      await runtime.dispose()
    }
  })

  it("returns NoUsableSession after the owned record is deleted", async () => {
    const runtime = ManagedRuntime.make(sessionLayer(sessionPrefix))
    try {
      const established = await establish(runtime, 30)
      await deleteOwnedPrefix(sessionPrefix)
      const result = await read(runtime, established.reference)
      expect(result).toStrictEqual(noUsableSession)
    } finally {
      await runtime.dispose()
    }
  })

  it("returns NoUsableSession after Redis evicts the owned record", async () => {
    const prefix = `test:session:${randomUUID()}:`
    const runtime = ManagedRuntime.make(sessionLayer(prefix))
    try {
      const established = await establish(runtime, 2 / 60)
      const stored = await ownedKeyMetadata(prefix)
      expect(stored.count).toBe(1)
      expect(stored.ttlMilliseconds).toBeGreaterThan(0)
      expect(stored.ttlMilliseconds).toBeLessThanOrEqual(2_000)
      await delay(2_500)
      const evicted = await ownedKeyMetadata(prefix)
      expect(evicted.count).toBe(0)
      expect(evicted.ttlMilliseconds).toBe(-2)
      const result = await read(runtime, established.reference)
      expect(result).toStrictEqual(noUsableSession)
    } finally {
      await runtime.dispose()
      await deleteOwnedPrefix(prefix)
    }
  }, 10_000)

  it("translates a disconnected NodeRedis client into SessionServiceUnavailable for establishment", async () => {
    const runtime = ManagedRuntime.make(disconnectedLayer(sessionPrefix))
    try {
      await runtime.runPromise(destroyClient)
      const result = await runtime.runPromise(Effect.gen(function*() {
        const service = yield* SessionService
        return yield* service.establish({
          identity,
          policy: { idleTimeoutMinutes: 30, warningLeadMinutes: 5 },
          tenantAlias: alias
        }).pipe(Effect.result)
      }))
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
        expect(result.failure.cause).toBeUndefined()
        expect(String(result.failure)).not.toContain("subject-redis")
      }
    } finally {
      await runtime.dispose()
    }

    const recovered = ManagedRuntime.make(sessionLayer(sessionPrefix))
    try {
      const established = await establish(recovered, 30)
      expect(await read(recovered, established.reference)).toStrictEqual(established.session)
    } finally {
      await recovered.dispose()
    }
  })

  it("translates a disconnected NodeRedis client into SessionServiceUnavailable for a read", async () => {
    const healthy = ManagedRuntime.make(sessionLayer(sessionPrefix))
    const outage = ManagedRuntime.make(disconnectedLayer(sessionPrefix))
    try {
      const established = await establish(healthy, 30)
      await outage.runPromise(destroyClient)
      const result = await outage.runPromise(Effect.gen(function*() {
        const service = yield* SessionService
        return yield* service.read({ reference: established.reference }).pipe(Effect.result)
      }))
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
        expect(result.failure.cause).toBeUndefined()
        expect(String(result.failure)).not.toContain("subject-redis")
      }
      expect(await read(healthy, established.reference)).toStrictEqual(established.session)
    } finally {
      await healthy.dispose()
      await outage.dispose()
    }
  })
})
