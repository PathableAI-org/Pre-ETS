import { randomBytes } from "node:crypto"
import { connect } from "node:net"
import { createClient } from "redis"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { RedisSessionStore, SessionStoreError } from "../../src/lib/session/store.ts"
import {
  DEFAULT_SESSION_STORE_TIMEOUT_MS,
  serializeSessionRecord,
  type SessionConfig,
  type SessionRecord
} from "../../src/lib/session/types.ts"

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
const KEY_PREFIX = `test:session:${String(Date.now())}:`

async function cleanupKeys(prefix: string): Promise<void> {
  const client = createClient({ disableOfflineQueue: true, url: REDIS_URL })
  await client.connect()
  try {
    const keys = await client.keys(`${prefix}*`)
    if (keys.length > 0) {
      await client.del(keys)
    }
  } finally {
    await client.quit()
  }
}

function fixedSessionId(seed: number): string {
  const bytes = new Uint8Array(32)
  bytes.fill(seed)
  return Buffer.from(bytes).toString("base64url")
}

function probeRedis(url: string, timeoutMs = 300): Promise<boolean> {
  const { host, port } = redisEndpoint(url)
  return new Promise((resolve) => {
    const socket = connect({ host, port })
    const finish = (reachable: boolean) => {
      socket.destroy()
      resolve(reachable)
    }

    socket.setTimeout(timeoutMs)
    socket.once("connect", () => {
      finish(true)
    })
    socket.once("timeout", () => {
      finish(false)
    })
    socket.once("error", () => {
      finish(false)
    })
  })
}

function redisEndpoint(url: string): { host: string; port: number } {
  const parsed = new URL(url)
  const host = parsed.hostname.replace(/^\[(.*)\]$/, "$1")
  return {
    host,
    port: parsed.port === "" ? 6379 : Number(parsed.port)
  }
}

function signingSecret(): Uint8Array {
  return new Uint8Array(randomBytes(32))
}

function testConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    keyPrefix: KEY_PREFIX,
    redisUrl: REDIS_URL,
    signingSecret: signingSecret(),
    storeTimeoutMs: DEFAULT_SESSION_STORE_TIMEOUT_MS,
    ttlSeconds: 86_400,
    ...overrides
  }
}

describe("RedisSessionStore", () => {
  describe("unit behavior", () => {
    it("resets failed initialization so a later call can reconnect", async () => {
      let attempts = 0
      const clientFactory = vi.fn(() => {
        attempts += 1
        if (attempts === 1) {
          return {
            connect: vi.fn().mockRejectedValue(new Error("connect failed")),
            isOpen: false
          }
        }

        return {
          connect: vi.fn().mockResolvedValue(undefined),
          get: vi.fn().mockResolvedValue(null),
          isOpen: true
        }
      })

      const store = new RedisSessionStore(testConfig(), { clientFactory: clientFactory as never })
      const id = fixedSessionId(7)

      await expect(store.read(id)).rejects.toBeInstanceOf(SessionStoreError)
      await expect(store.read(id)).resolves.toEqual({ kind: "missing" })
      expect(clientFactory).toHaveBeenCalledTimes(2)
    })

    it("passes disableOfflineQueue through the default client factory", async () => {
      const redisModule = await import("redis")
      const createClientSpy = vi.spyOn(redisModule, "createClient")
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null),
        isOpen: true,
        on: vi.fn().mockReturnThis()
      }
      createClientSpy.mockReturnValueOnce(mockClient as never)

      const store = new RedisSessionStore(testConfig())
      await store.read(fixedSessionId(8))

      expect(createClientSpy).toHaveBeenCalledWith({
        disableOfflineQueue: true,
        url: REDIS_URL
      })

      createClientSpy.mockRestore()
    })

    it("times out slow operations using SESSION_STORE_TIMEOUT_MS", async () => {
      const clientFactory = vi.fn(() => {
        const client = {
          connect: vi.fn().mockResolvedValue(undefined),
          get: vi.fn(() => new Promise<null | string>(() => undefined)),
          isOpen: true
        }
        return client
      })

      const store = new RedisSessionStore(testConfig({ storeTimeoutMs: 50 }), {
        clientFactory: clientFactory as never,
        timeoutMs: 50
      })

      await expect(store.read(fixedSessionId(9))).rejects.toMatchObject({
        message: "Session store operation timed out."
      })
    })

    it("does not treat a timed-out create as created", async () => {
      const id = fixedSessionId(10)
      const record: SessionRecord = {
        expiresAt: 1_700_300_000,
        tenantId: "springfield"
      }
      const setMock = vi.fn(() => new Promise<null | string>(() => undefined))
      const getMock = vi.fn().mockResolvedValue(null)
      const clientFactory = vi.fn(() => {
        const client = {
          connect: vi.fn().mockResolvedValue(undefined),
          eval: vi.fn(),
          get: getMock,
          isOpen: true,
          set: setMock
        }
        return client
      })

      const store = new RedisSessionStore(testConfig({ storeTimeoutMs: 50 }), {
        clientFactory,
        timeoutMs: 50
      })

      await expect(store.create(id, record)).rejects.toBeInstanceOf(SessionStoreError)
      expect(setMock).toHaveBeenCalledOnce()
      await expect(store.read(id)).resolves.toEqual({ kind: "missing" })
    })

    it("wraps transport failures as SessionStoreError", async () => {
      const clientFactory = vi.fn(() => {
        const client = {
          connect: vi.fn().mockResolvedValue(undefined),
          get: vi.fn().mockRejectedValue(new Error("connection reset")),
          isOpen: true
        }
        return client
      })

      const store = new RedisSessionStore(testConfig(), { clientFactory: clientFactory as never })
      await expect(store.read(fixedSessionId(11))).rejects.toMatchObject({
        message: "Session store unavailable."
      })
    })

    it("wraps concurrent connect failures as SessionStoreError", async () => {
      const clientFactory = vi.fn(() => ({
        connect: vi.fn().mockRejectedValue(new Error("connect failed")),
        isOpen: false
      }))

      const store = new RedisSessionStore(testConfig(), { clientFactory: clientFactory as never })
      const id = fixedSessionId(12)

      const results = await Promise.allSettled([store.read(id), store.read(id)])

      expect(results).toHaveLength(2)
      for (const result of results) {
        expect(result.status).toBe("rejected")
        if (result.status === "rejected") {
          expect(result.reason).toBeInstanceOf(SessionStoreError)
        }
      }
      expect(clientFactory).toHaveBeenCalledTimes(1)
    })

    it("returns missing for invalid session ids without Redis I/O", async () => {
      const clientFactory = vi.fn(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null),
        isOpen: true
      }))

      const store = new RedisSessionStore(testConfig(), { clientFactory: clientFactory as never })

      await expect(store.read("not-a-valid-session-id")).resolves.toEqual({ kind: "missing" })
      expect(clientFactory).not.toHaveBeenCalled()
    })

    it("rejects create for invalid session ids without Redis I/O", async () => {
      const clientFactory = vi.fn(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        isOpen: true,
        set: vi.fn().mockResolvedValue("OK")
      }))

      const store = new RedisSessionStore(testConfig(), { clientFactory: clientFactory as never })
      const record: SessionRecord = {
        expiresAt: 1_700_300_000,
        tenantId: "springfield"
      }

      await expect(store.create("not-a-valid-session-id", record)).rejects.toMatchObject({
        message: "Invalid session id."
      })
      expect(clientFactory).not.toHaveBeenCalled()
    })

    it("uses SET NX EXAT with redis@6 condition syntax", async () => {
      const setMock = vi.fn().mockResolvedValue("OK")
      const clientFactory = vi.fn(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        eval: vi.fn(),
        get: vi.fn().mockResolvedValue(null),
        isOpen: true,
        set: setMock
      }))

      const store = new RedisSessionStore(testConfig(), { clientFactory })
      const id = fixedSessionId(13)
      const record: SessionRecord = {
        expiresAt: 1_700_300_000,
        tenantId: "springfield"
      }

      await expect(store.create(id, record)).resolves.toEqual({ kind: "created" })
      expect(setMock).toHaveBeenCalledWith(`${KEY_PREFIX}${id}`, serializeSessionRecord(record), {
        condition: "NX",
        expiration: {
          type: "EXAT",
          value: record.expiresAt
        }
      })
    })

    it("updates existing records under the idle lock and reports missing when absent", async () => {
      const { MemoryRedis } = await import("./helpers/memory-redis.ts")
      const { SESSION_SET_UNDER_LOCK_SCRIPT } = await import(
        "../../src/lib/session/redis-scripts.ts"
      )
      const memory = new MemoryRedis()
      const store = new RedisSessionStore(testConfig(), {
        clientFactory: () => memory,
        keyPrefix: KEY_PREFIX
      })
      const id = fixedSessionId(16)
      const existing: SessionRecord = {
        expiresAt: 1_700_300_000,
        tenantId: "springfield"
      }
      const record: SessionRecord = {
        expiresAt: 1_700_300_000,
        tenantId: "springfield",
        userId: "user-1",
        userName: "Demo User"
      }

      await memory.set(`${KEY_PREFIX}${id}`, serializeSessionRecord(existing), {
        expiration: { type: "EXAT", value: existing.expiresAt }
      })

      await expect(store.update(id, record)).resolves.toEqual({ kind: "updated" })
      expect(
        memory.eval.mock.calls.some((call) => call[0] === SESSION_SET_UNDER_LOCK_SCRIPT)
      ).toBe(true)
      expect(await memory.get(`${KEY_PREFIX}${id}`)).toBe(serializeSessionRecord(record))

      await memory.del(`${KEY_PREFIX}${id}`)
      await expect(store.update(id, record)).resolves.toEqual({ kind: "missing" })
    })

    it("reports collision when SET NX returns null", async () => {
      const setMock = vi.fn().mockResolvedValue(null)
      const clientFactory = vi.fn(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        isOpen: true,
        set: setMock
      }))

      const store = new RedisSessionStore(testConfig(), { clientFactory: clientFactory as never })
      const id = fixedSessionId(14)
      const record: SessionRecord = {
        expiresAt: 1_700_300_000,
        tenantId: "springfield"
      }

      await expect(store.create(id, record)).resolves.toEqual({ kind: "collision" })
    })

    it("attaches a no-op error listener in the default client factory", async () => {
      const redisModule = await import("redis")
      const createClientSpy = vi.spyOn(redisModule, "createClient")
      const onMock = vi.fn().mockReturnThis()
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null),
        isOpen: true,
        on: onMock
      }
      createClientSpy.mockReturnValueOnce(mockClient as never)

      const store = new RedisSessionStore(testConfig())
      await store.read(fixedSessionId(15))

      expect(onMock).toHaveBeenCalledWith("error", expect.any(Function))

      createClientSpy.mockRestore()
    })

    it("shares one in-flight connect promise across concurrent reads", async () => {
      let connectCount = 0
      const mockClient = {
        connect: vi.fn(async () => {
          connectCount += 1
          await new Promise((resolve) => setTimeout(resolve, 10))
          mockClient.isOpen = true
        }),
        get: vi.fn().mockResolvedValue(null),
        isOpen: false
      }
      const clientFactory = vi.fn(() => mockClient)

      const store = new RedisSessionStore(testConfig(), { clientFactory: clientFactory as never })
      const id = fixedSessionId(6)

      await Promise.all([store.read(id), store.read(id)])

      expect(clientFactory).toHaveBeenCalledTimes(1)
      expect(connectCount).toBe(1)
    })
  })

  describe("integration", () => {
    let redisReachable = false
    let skipIntegration = true

    beforeAll(async () => {
      redisReachable = await probeRedis(REDIS_URL)
      skipIntegration = !redisReachable
      if (!redisReachable && process.env.CI) {
        throw new Error(`Redis is required in CI but unreachable at ${REDIS_URL}`)
      }
      if (skipIntegration) {
        console.warn(`Skipping RedisSessionStore integration tests: Redis unreachable at ${REDIS_URL}`)
      }
    })

    beforeEach((context) => {
      if (skipIntegration) {
        context.skip()
      }
    })

    afterAll(async () => {
      if (redisReachable) {
        await cleanupKeys(KEY_PREFIX)
      }
    })

    afterEach(async () => {
      if (redisReachable) {
        await cleanupKeys(KEY_PREFIX)
      }
    })

    it("returns missing for absent keys and unusable JSON payloads", async () => {
      const store = new RedisSessionStore(testConfig())
      const id = fixedSessionId(1)

      await expect(store.read(id)).resolves.toEqual({ kind: "missing" })

      const client = createClient({ disableOfflineQueue: true, url: REDIS_URL })
      await client.connect()
      await client.set(`${KEY_PREFIX}${fixedSessionId(2)}`, "{not-json")
      await client.set(`${KEY_PREFIX}${fixedSessionId(3)}`, JSON.stringify({ extra: true, tenantId: "x" }))
      await client.quit()

      await expect(store.read(fixedSessionId(2))).resolves.toEqual({ kind: "missing" })
      await expect(store.read(fixedSessionId(3))).resolves.toEqual({ kind: "missing" })
    })

    it("creates records with SET NX EXAT using application-clock expiry", async () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3_600
      const record: SessionRecord = { expiresAt, tenantId: "springfield" }
      const id = fixedSessionId(4)
      const store = new RedisSessionStore(testConfig())

      await expect(store.create(id, record)).resolves.toEqual({ kind: "created" })

      const client = createClient({ disableOfflineQueue: true, url: REDIS_URL })
      await client.connect()
      const raw = await client.get(`${KEY_PREFIX}${id}`)
      const ttl = await client.ttl(`${KEY_PREFIX}${id}`)
      await client.quit()

      expect(raw).toBe(serializeSessionRecord(record))
      expect(ttl).toBeGreaterThan(0)
      expect(ttl).toBeLessThanOrEqual(3_600 + 1)
    })

    it("reports collision when the key already exists", async () => {
      const record: SessionRecord = {
        expiresAt: Math.floor(Date.now() / 1000) + 3_600,
        tenantId: "springfield"
      }
      const id = fixedSessionId(5)
      const store = new RedisSessionStore(testConfig())

      expect(await store.create(id, record)).toEqual({ kind: "created" })
      expect(await store.create(id, record)).toEqual({ kind: "collision" })
    })
  })
})
