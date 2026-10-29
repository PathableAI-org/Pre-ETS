import { NodeRedis } from "@effect/platform-node"
import { Clock, ConfigProvider, Deferred, Effect, Layer, ManagedRuntime, Result, Schema } from "effect"
import * as Redis from "effect/persistence/Redis"
import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { afterAll, describe, expect, it } from "vitest"

import {
  type NoUsableSession,
  SessionService,
  SessionServiceUnavailable,
  SessionTenantMismatch,
  type UsableSession
} from "../../src/session.ts"
import { TenantAlias } from "../../src/tenant.ts"

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
const sessionPrefix = `test:session:${randomUUID()}:`
const alias = Schema.decodeSync(TenantAlias)("alpha")
const otherAlias = Schema.decodeSync(TenantAlias)("beta")
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
  idleTimeoutMinutes: number,
  warningLeadMinutes = 5
) =>
  runtime.runPromise(
    Effect.gen(function*() {
      const service = yield* SessionService
      return yield* service.establish({
        identity,
        policy: { idleTimeoutMinutes, warningLeadMinutes },
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

const shortenOwnedTtl = async (prefix: string, ttlMilliseconds: number) => {
  if (!ownedSessionPrefix.test(prefix)) {
    throw new Error("Refusing to expire an unvalidated session prefix")
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
        for (const key of keys) yield* redis.send("PEXPIRE", key, String(ttlMilliseconds))
        cursor = page[0]
      } while (cursor !== "0")
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
      const established = await establish(runtime, 5, 0)
      const stored = await ownedKeyMetadata(prefix)
      expect(stored.count).toBe(1)
      expect(stored.ttlMilliseconds).toBeGreaterThan(290_000)
      expect(stored.ttlMilliseconds).toBeLessThanOrEqual(300_000)
      await shortenOwnedTtl(prefix, 1_000)
      await delay(1_500)
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

  it("admits the matching alias from an independently scoped client and rejects a different alias", async () => {
    const runtimeA = ManagedRuntime.make(sessionLayer(sessionPrefix))
    const runtimeB = ManagedRuntime.make(sessionLayer(sessionPrefix))
    try {
      const established = await establish(runtimeA, 30, 4)
      const matching = await runtimeB.runPromise(Effect.gen(function*() {
        const service = yield* SessionService
        return yield* service.readForTenant({ reference: established.reference, tenantAlias: alias })
      }))
      expect(matching).toStrictEqual(established.session)
      if (matching._tag === "UsableSession") {
        expect(matching.identity).toStrictEqual(established.session.identity)
        expect(matching.tenantAlias).toBe(established.session.tenantAlias)
        expect(matching.idleDeadlineEpochMilliseconds).toBe(established.session.idleDeadlineEpochMilliseconds)
        expect(matching.warningLeadMinutes).toBe(established.session.warningLeadMinutes)
      }
      const mismatched = await runtimeB.runPromise(Effect.gen(function*() {
        const service = yield* SessionService
        return yield* service.readForTenant({ reference: established.reference, tenantAlias: otherAlias }).pipe(
          Effect.result
        )
      }))
      expect(Result.isFailure(mismatched)).toBe(true)
      if (Result.isFailure(mismatched)) expect(mismatched.failure).toBeInstanceOf(SessionTenantMismatch)
    } finally {
      await runtimeA.dispose()
      await runtimeB.dispose()
    }
  })

  it("translates a disconnected client into SessionServiceUnavailable for tenant admission", async () => {
    const healthy = ManagedRuntime.make(sessionLayer(sessionPrefix))
    const outage = ManagedRuntime.make(disconnectedLayer(sessionPrefix))
    try {
      const established = await establish(healthy, 30)
      await outage.runPromise(destroyClient)
      const result = await outage.runPromise(Effect.gen(function*() {
        const service = yield* SessionService
        return yield* service.readForTenant({ reference: established.reference, tenantAlias: alias }).pipe(
          Effect.result
        )
      }))
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
        expect(result.failure).not.toBeInstanceOf(SessionTenantMismatch)
        expect(result.failure.cause).toBeUndefined()
        expect(String(result.failure)).not.toContain("subject-redis")
      }
      expect(await read(healthy, established.reference)).toStrictEqual(established.session)
    } finally {
      await healthy.dispose()
      await outage.dispose()
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

const clockAt = (millis: number): Clock.Clock => ({
  currentTimeMillis: Effect.succeed(millis),
  currentTimeMillisUnsafe: () => millis,
  currentTimeNanos: Effect.succeed(BigInt(millis) * 1_000_000n),
  currentTimeNanosUnsafe: () => BigInt(millis) * 1_000_000n,
  monotonicTimeNanos: Effect.succeed(BigInt(millis) * 1_000_000n),
  monotonicTimeNanosUnsafe: () => BigInt(millis) * 1_000_000n,
  sleep: () => Effect.void
})

const changedPolicy = { idleTimeoutMinutes: 15, warningLeadMinutes: 2 }

const refreshAt = (
  runtime: ManagedRuntime.ManagedRuntime<SessionService, unknown>,
  reference: string,
  receivedAt: number,
  policy: { readonly idleTimeoutMinutes: number; readonly warningLeadMinutes: number }
) =>
  runtime.runPromise(
    Effect.gen(function*() {
      const service = yield* SessionService
      return yield* service.refreshForTenant({
        activity: "continue-session",
        policy,
        reference,
        tenantAlias: alias
      })
    }).pipe(Effect.provideService(Clock.Clock, clockAt(receivedAt)))
  )

const readAt = (
  runtime: ManagedRuntime.ManagedRuntime<SessionService, unknown>,
  reference: string,
  receivedAt: number
) =>
  runtime.runPromise(
    Effect.gen(function*() {
      const service = yield* SessionService
      return yield* service.read({ reference })
    }).pipe(Effect.provideService(Clock.Clock, clockAt(receivedAt)))
  )

const withClients = async (
  use: (
    runtimeA: ManagedRuntime.ManagedRuntime<SessionService, unknown>,
    runtimeB: ManagedRuntime.ManagedRuntime<SessionService, unknown>,
    prefix: string
  ) => Promise<void>
) => {
  const prefix = `test:session:${randomUUID()}:`
  const runtimeA = ManagedRuntime.make(sessionLayer(prefix))
  const runtimeB = ManagedRuntime.make(sessionLayer(prefix))
  try {
    await use(runtimeA, runtimeB, prefix)
  } finally {
    await runtimeA.dispose()
    await runtimeB.dispose()
    await deleteOwnedPrefix(prefix)
  }
}

const corruptSinglePayload = async (prefix: string, corrupt: (payload: string) => string) => {
  if (!ownedSessionPrefix.test(prefix)) throw new Error("Refusing to edit an unvalidated session prefix")
  const runtime = ManagedRuntime.make(redisLayer())
  try {
    return await runtime.runPromise(Effect.gen(function*() {
      const redis = yield* Redis.Redis
      let cursor = "0"
      let key: string | undefined
      let payload = ""
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
        const keys = page[1].filter((candidate) => candidate.startsWith(prefix))
        const found = keys[0]
        if (found !== undefined) {
          key = found
          payload = yield* redis.send<string>("GET", found)
          ttlMilliseconds = yield* redis.send<number>("PTTL", found)
        }
        cursor = page[0]
      } while (cursor !== "0" && key === undefined)
      if (key === undefined) throw new Error("Expected one owned session record")
      const next = corrupt(payload)
      yield* redis.send("SET", key, next, "KEEPTTL")
      return { payload: next, ttlMilliseconds }
    }))
  } finally {
    await runtime.dispose()
  }
}

const renewedDeadline = (receivedAt: number) => receivedAt + changedPolicy.idleTimeoutMinutes * 60_000

const expectRenewed = (value: NoUsableSession | UsableSession, receivedAt: number) => {
  expect(value).toMatchObject({
    _tag: "UsableSession",
    idleDeadlineEpochMilliseconds: renewedDeadline(receivedAt),
    warningLeadMinutes: changedPolicy.warningLeadMinutes
  })
}

describe("SessionService renewal and expiration on real Redis", () => {
  it("adopts one client's refresh on the other client and leaves a sibling unchanged", async () => {
    await withClients(async (runtimeA, runtimeB) => {
      const first = await establish(runtimeA, 30, 5)
      const second = await runtimeA.runPromise(Effect.gen(function*() {
        const service = yield* SessionService
        return yield* service.establish({
          identity: { issuer: "https://provider.test/", subject: "subject-sibling" },
          policy: { idleTimeoutMinutes: 20, warningLeadMinutes: 4 },
          tenantAlias: alias
        })
      }))
      const renewed = await runtimeB.runPromise(Effect.gen(function*() {
        const service = yield* SessionService
        return yield* service.refreshForTenant({
          activity: "continue-session",
          policy: changedPolicy,
          reference: first.reference,
          tenantAlias: alias
        })
      }))
      expect(renewed).toMatchObject({ _tag: "UsableSession", warningLeadMinutes: 2 })
      expect(await read(runtimeA, first.reference)).toStrictEqual(renewed)
      expect(await read(runtimeB, second.reference)).toStrictEqual(second.session)
    })
  })

  it("observes renewal before a later expiration attempt", async () => {
    await withClients(async (runtimeA, runtimeB) => {
      const established = await establish(runtimeA, 30, 5)
      const deadline = established.session.idleDeadlineEpochMilliseconds
      const receivedAt = deadline - 60_000
      const renewed = await refreshAt(runtimeB, established.reference, receivedAt, changedPolicy)
      expectRenewed(renewed, receivedAt)
      const expiration = await readAt(runtimeA, established.reference, deadline)
      expect(expiration).toStrictEqual(renewed)
      expect(await readAt(runtimeA, established.reference, receivedAt)).toStrictEqual(renewed)
      expect(await readAt(runtimeB, established.reference, receivedAt)).toStrictEqual(renewed)
    })
  })

  it("does not recreate a session after expiration wins", async () => {
    await withClients(async (runtimeA, runtimeB, prefix) => {
      const established = await establish(runtimeA, 30, 5)
      const deadline = established.session.idleDeadlineEpochMilliseconds
      const expired = await readAt(runtimeA, established.reference, deadline)
      const stale = await refreshAt(runtimeB, established.reference, deadline - 60_000, changedPolicy)
      expect(expired).toStrictEqual(noUsableSession)
      expect(stale).toStrictEqual(noUsableSession)
      expect(await read(runtimeA, established.reference)).toStrictEqual(noUsableSession)
      expect(await read(runtimeB, established.reference)).toStrictEqual(noUsableSession)
      expect((await ownedKeyMetadata(prefix)).count).toBe(0)
    })
  })

  it("accepts either winner when renewal and expiration overlap", async () => {
    await withClients(async (runtimeA, runtimeB, prefix) => {
      const established = await establish(runtimeA, 30, 5)
      const deadline = established.session.idleDeadlineEpochMilliseconds
      const receivedAt = deadline - 60_000
      const start = Deferred.makeUnsafe<undefined>()
      const renewalReady = Deferred.makeUnsafe<undefined>()
      const expirationReady = Deferred.makeUnsafe<undefined>()
      const renewalPromise = runtimeB.runPromise(
        Effect.gen(function*() {
          yield* Deferred.succeed(renewalReady, undefined)
          yield* Deferred.await(start)
          const service = yield* SessionService
          return yield* service.refreshForTenant({
            activity: "keyboard-interaction",
            policy: changedPolicy,
            reference: established.reference,
            tenantAlias: alias
          })
        }).pipe(Effect.provideService(Clock.Clock, clockAt(receivedAt)))
      )
      const expirationPromise = runtimeA.runPromise(
        Effect.gen(function*() {
          yield* Deferred.succeed(expirationReady, undefined)
          yield* Deferred.await(start)
          const service = yield* SessionService
          return yield* service.read({ reference: established.reference })
        }).pipe(Effect.provideService(Clock.Clock, clockAt(deadline)))
      )
      await Effect.runPromise(Deferred.await(renewalReady))
      await Effect.runPromise(Deferred.await(expirationReady))
      await Effect.runPromise(Deferred.succeed(start, undefined))
      const [renewal, expiration] = await Promise.all([renewalPromise, expirationPromise])
      const laterA = await readAt(runtimeA, established.reference, receivedAt)
      const laterB = await readAt(runtimeB, established.reference, receivedAt)
      if (renewal._tag === "UsableSession") {
        expectRenewed(renewal, receivedAt)
        expect(expiration).toStrictEqual(renewal)
        expect(laterA).toStrictEqual(renewal)
        expect(laterB).toStrictEqual(renewal)
        return
      }
      expect(renewal).toStrictEqual(noUsableSession)
      expect(expiration).toStrictEqual(noUsableSession)
      expect(laterA).toStrictEqual(noUsableSession)
      expect(laterB).toStrictEqual(noUsableSession)
      expect((await ownedKeyMetadata(prefix)).count).toBe(0)
    })
  })

  it("rejects an unsafe integer warning without renewing or deleting the record", async () => {
    const prefix = `test:session:${randomUUID()}:`
    const runtime = ManagedRuntime.make(sessionLayer(prefix))
    try {
      const established = await establish(runtime, 30, 4)
      await shortenOwnedTtl(prefix, 90_000)
      const stored = await corruptSinglePayload(prefix, (payload) => {
        const record = JSON.parse(payload) as Record<string, unknown>
        record.warningLeadMinutes = 9_007_199_254_740_992
        return JSON.stringify(record)
      })
      const refreshed = await runtime.runPromise(Effect.gen(function*() {
        const service = yield* SessionService
        return yield* service.refreshForTenant({
          activity: "continue-session",
          policy: changedPolicy,
          reference: established.reference,
          tenantAlias: alias
        }).pipe(Effect.result)
      }))
      expect(Result.isFailure(refreshed)).toBe(true)
      if (Result.isFailure(refreshed)) {
        expect(refreshed.failure).toBeInstanceOf(SessionServiceUnavailable)
        expect(String(refreshed.failure)).not.toContain("subject-redis")
      }
      const expired = await runtime.runPromise(
        Effect.gen(function*() {
          const service = yield* SessionService
          return yield* service.read({ reference: established.reference }).pipe(Effect.result)
        }).pipe(Effect.provideService(Clock.Clock, clockAt(established.session.idleDeadlineEpochMilliseconds)))
      )
      expect(Result.isFailure(expired)).toBe(true)
      if (Result.isFailure(expired)) expect(expired.failure).toBeInstanceOf(SessionServiceUnavailable)
      const after = await corruptSinglePayload(prefix, (payload) => payload)
      expect(after.payload).toBe(stored.payload)
      expect(after.ttlMilliseconds).toBeLessThanOrEqual(stored.ttlMilliseconds)
      expect(after.ttlMilliseconds).toBeGreaterThan(0)
      expect(after.ttlMilliseconds).toBeLessThan(120_000)
    } finally {
      await runtime.dispose()
      await deleteOwnedPrefix(prefix)
    }
  })

  it("rejects a future record with a missing identity field without resetting TTL", async () => {
    const prefix = `test:session:${randomUUID()}:`
    const runtime = ManagedRuntime.make(sessionLayer(prefix))
    try {
      const established = await establish(runtime, 30, 4)
      await shortenOwnedTtl(prefix, 90_000)
      const stored = await corruptSinglePayload(prefix, (payload) => {
        const record = JSON.parse(payload) as Record<string, unknown>
        delete record.subject
        return JSON.stringify(record)
      })
      const result = await runtime.runPromise(Effect.gen(function*() {
        const service = yield* SessionService
        return yield* service.refreshForTenant({
          activity: "continue-session",
          policy: changedPolicy,
          reference: established.reference,
          tenantAlias: alias
        }).pipe(Effect.result)
      }))
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(SessionServiceUnavailable)
        expect(String(result.failure)).not.toContain("subject-redis")
      }
      const after = await corruptSinglePayload(prefix, (payload) => payload)
      expect(after.payload).toBe(stored.payload)
      expect(after.ttlMilliseconds).toBeLessThanOrEqual(stored.ttlMilliseconds)
      expect(after.ttlMilliseconds).toBeGreaterThan(0)
      expect(after.ttlMilliseconds).toBeLessThan(120_000)
    } finally {
      await runtime.dispose()
      await deleteOwnedPrefix(prefix)
    }
  })
})
