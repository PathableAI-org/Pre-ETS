import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"

import { computeIdleExpiresAt, DEFAULT_IDLE_DURATION_MINUTES } from "../../src/lib/session/idle.ts"
import {
  RELEASE_IDLE_LOCK_SCRIPT,
  SESSION_CAS_UNDER_LOCK_SCRIPT,
  SESSION_SET_UNDER_LOCK_SCRIPT
} from "../../src/lib/session/redis-scripts.ts"
import {
  IDLE_ACTIVITY_COALESCE_SECONDS,
  IDLE_LOCK_TTL_TIMEOUT_MULTIPLIER,
  RedisSessionStore,
  SessionStoreError
} from "../../src/lib/session/store.ts"
import { serializeSessionRecord, type SessionConfig, type SessionRecord } from "../../src/lib/session/types.ts"
import { MemoryRedis } from "./helpers/memory-redis.ts"

function fixedSessionId(seed = 9): string {
  const bytes = new Uint8Array(32)
  bytes.fill(seed)
  return Buffer.from(bytes).toString("base64url")
}

function idleRecord(now: number, overrides: Partial<SessionRecord> = {}): SessionRecord {
  const lastActivityAt = overrides.lastActivityAt ?? now
  const idleDurationMinutes = overrides.idleDurationMinutes ?? DEFAULT_IDLE_DURATION_MINUTES
  return Object.assign(
    {
      expiresAt: now + 86_400,
      idleDurationMinutes,
      idleExpiresAt: computeIdleExpiresAt(lastActivityAt, idleDurationMinutes),
      lastActivityAt,
      tenantId: "springfield",
      userId: "user-1",
      userName: "Demo User"
    } satisfies SessionRecord,
    overrides
  )
}

function testConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    keyPrefix: "test:idle-cas:",
    redisUrl: "redis://127.0.0.1:6379",
    signingSecret: new Uint8Array(randomBytes(32)),
    storeTimeoutMs: 200,
    ttlSeconds: 86_400,
    ...overrides
  }
}

describe("session store idle CAS", () => {
  it("renews idle activity under a per-session SET NX PX lock without extending expiresAt", async () => {
    const memory = new MemoryRedis()
    const now = 1_700_000_000
    const sessionId = fixedSessionId()
    const record = idleRecord(now, { idleDurationMinutes: 10 })
    const sessionKey = `test:idle-cas:${sessionId}`
    const lockKey = `test:idle-cas:idle-lock:${sessionId}`
    await memory.set(sessionKey, serializeSessionRecord(record), {
      expiration: { type: "EXAT", value: record.expiresAt }
    })

    const store = new RedisSessionStore(testConfig(), {
      clientFactory: () => memory,
      clock: () => now + 30
    })

    const result = await store.renewIdleActivity(sessionId, now + 30, "springfield")
    expect(result.kind).toBe("renewed")
    if (result.kind !== "renewed") {
      return
    }
    expect(result.record.expiresAt).toBe(record.expiresAt)
    expect(result.record.lastActivityAt).toBe(now + 30)
    expect(result.record.idleExpiresAt).toBe(computeIdleExpiresAt(now + 30, 10))
    expect(result.record.idleDurationMinutes).toBe(10)

    const lockSets = memory.set.mock.calls.filter((call) => call[0] === lockKey)
    expect(lockSets.length).toBeGreaterThanOrEqual(1)
    expect(lockSets[0]?.[2]).toMatchObject({
      condition: "NX",
      expiration: {
        type: "PX",
        value: Math.max(
          testConfig().storeTimeoutMs * IDLE_LOCK_TTL_TIMEOUT_MULTIPLIER,
          1_000
        )
      }
    })
  })

  it("coalesces redundant renewals within ~1s when idleExpiresAt is unchanged", async () => {
    const memory = new MemoryRedis()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(2)
    const sessionKey = `test:idle-cas:${sessionId}`
    const record = idleRecord(now, {
      idleDurationMinutes: 10,
      idleExpiresAt: now + 600,
      lastActivityAt: now
    })
    await memory.set(sessionKey, serializeSessionRecord(record), {
      expiration: { type: "EXAT", value: record.expiresAt }
    })

    const store = new RedisSessionStore(testConfig(), {
      clientFactory: () => memory,
      clock: () => now
    })

    const result = await store.renewIdleActivity(sessionId, now, "springfield")
    expect(result.kind).toBe("coalesced")
    expect(IDLE_ACTIVITY_COALESCE_SECONDS).toBe(1)

    const sessionWrites = memory.set.mock.calls.filter(
      (call) => call[0] === sessionKey && call[2]?.condition === "XX"
    )
    expect(sessionWrites).toHaveLength(0)
    expect(
      memory.eval.mock.calls.filter((call) => call[0] === SESSION_CAS_UNDER_LOCK_SCRIPT)
    ).toHaveLength(0)

    const next = await store.renewIdleActivity(
      sessionId,
      now + IDLE_ACTIVITY_COALESCE_SECONDS,
      "springfield"
    )
    expect(next.kind).toBe("renewed")
  })

  it("CAS refuses write when expected serialized value no longer matches", async () => {
    const memory = new MemoryRedis()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(3)
    const sessionKey = `test:idle-cas:${sessionId}`
    const record = idleRecord(now)
    const cleared: SessionRecord = {
      accessEndedCause: "inactivity",
      expiresAt: record.expiresAt,
      sessionEndGeneration: 1,
      tenantId: "springfield"
    }
    await memory.set(sessionKey, serializeSessionRecord(record), {
      expiration: { type: "EXAT", value: record.expiresAt }
    })

    // Flip under the load→CAS window so Lua sees a mismatch.
    memory.beforeEval = async (script, options) => {
      if (script !== SESSION_CAS_UNDER_LOCK_SCRIPT) {
        return
      }
      if (options.keys?.[0] !== sessionKey) {
        return
      }
      await memory.set(sessionKey, serializeSessionRecord(cleared), {
        expiration: { type: "EXAT", value: cleared.expiresAt }
      })
    }

    const store = new RedisSessionStore(testConfig(), {
      clientFactory: () => memory,
      clock: () => now + 30
    })

    const result = await store.renewIdleActivity(sessionId, now + 30, "springfield")
    expect(result.kind).toBe("denied")

    const casCalls = memory.eval.mock.calls.filter(
      (call) => call[0] === SESSION_CAS_UNDER_LOCK_SCRIPT
    )
    expect(casCalls.length).toBeGreaterThanOrEqual(1)

    const raw = await memory.get(sessionKey)
    expect(raw).toBe(serializeSessionRecord(cleared))
  })

  it("denies renewal when tenant does not match (no mutation)", async () => {
    const memory = new MemoryRedis()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(4)
    const record = idleRecord(now)
    await memory.set(`test:idle-cas:${sessionId}`, serializeSessionRecord(record), {
      expiration: { type: "EXAT", value: record.expiresAt }
    })

    const store = new RedisSessionStore(testConfig(), {
      clientFactory: () => memory,
      clock: () => now + 10
    })

    const result = await store.renewIdleActivity(sessionId, now + 10, "shelbyville")
    expect(result.kind).toBe("denied")
    const raw = await memory.get(`test:idle-cas:${sessionId}`)
    expect(raw).toBe(serializeSessionRecord(record))
  })

  it("post-apply re-check clears for inactivity when now1 crosses the prior idle deadline", async () => {
    const memory = new MemoryRedis()
    const now0 = 1_700_000_000
    const idleExpiresAt = now0 + 300
    const sessionId = fixedSessionId(5)
    const record = idleRecord(now0, {
      idleDurationMinutes: 5,
      idleExpiresAt,
      lastActivityAt: now0
    })
    await memory.set(`test:idle-cas:${sessionId}`, serializeSessionRecord(record), {
      expiration: { type: "EXAT", value: record.expiresAt }
    })

    // now0 stamp is before deadline; post-apply clock jumps past prior idleExpiresAt.
    const store = new RedisSessionStore(testConfig(), {
      clientFactory: () => memory,
      clock: () => idleExpiresAt
    })

    const result = await store.renewIdleActivity(sessionId, now0 + 10, "springfield")
    expect(result.kind).toBe("cleared")
    if (result.kind !== "cleared") {
      return
    }
    expect(result.record.accessEndedCause).toBe("inactivity")
    expect(result.record.userId).toBeUndefined()
    expect(result.record.sessionEndGeneration).toBe(1)
  })

  it("clearForInactivity writes anonymous cause + latch without draft-key cleanup ops", async () => {
    const memory = new MemoryRedis()
    const now = 1_700_001_800
    const sessionId = fixedSessionId(6)
    const sessionKey = `test:idle-cas:${sessionId}`
    const draftKey = `test:idle-cas:draft:${sessionId}`
    const record = idleRecord(1_700_000_000, {
      idleDurationMinutes: 30,
      idleExpiresAt: now,
      lastActivityAt: 1_700_000_000
    })
    await memory.set(sessionKey, serializeSessionRecord(record), {
      expiration: { type: "EXAT", value: record.expiresAt }
    })
    await memory.set(draftKey, JSON.stringify({ dirty: true }))

    const store = new RedisSessionStore(testConfig(), {
      clientFactory: () => memory,
      clock: () => now
    })

    const result = await store.clearForInactivity(sessionId, now, "springfield")
    expect(result.kind).toBe("cleared")
    if (result.kind !== "cleared") {
      return
    }
    expect(result.record).toEqual({
      accessEndedCause: "inactivity",
      expiresAt: record.expiresAt,
      sessionEndGeneration: 1,
      tenantId: "springfield"
    })

    // Draft fixture remains untouched (this slice has no draft-key cleanup).
    expect(await memory.get(draftKey)).toBe(JSON.stringify({ dirty: true }))
    expect(memory.keys()).toContain(draftKey)
    const sessionRaw = await memory.get(sessionKey)
    expect(sessionRaw).toContain("\"accessEndedCause\":\"inactivity\"")
    expect(sessionRaw).not.toContain("draft")
  })

  it("concurrent renew vs clearance: clearance wins; renew does not overwrite anonymous", async () => {
    const memory = new MemoryRedis()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(7)
    const sessionKey = `test:idle-cas:${sessionId}`
    const authenticated = idleRecord(now, {
      idleDurationMinutes: 15,
      idleExpiresAt: now + 900,
      lastActivityAt: now
    })
    await memory.set(sessionKey, serializeSessionRecord(authenticated), {
      expiration: { type: "EXAT", value: authenticated.expiresAt }
    })

    const store = new RedisSessionStore(testConfig(), {
      clientFactory: () => memory,
      clock: () => now + 10
    })

    const clearResult = await store.clearForInactivity(sessionId, now + 900, "springfield")
    expect(clearResult.kind).toBe("cleared")

    const renew = await store.renewIdleActivity(sessionId, now + 10, "springfield")
    expect(renew.kind).toBe("denied")

    const raw = await memory.get(sessionKey)
    expect(raw).not.toBeNull()
    if (raw === null) {
      throw new Error("expected cleared session payload")
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    expect(parsed).toMatchObject({
      accessEndedCause: "inactivity",
      sessionEndGeneration: 1
    })
    expect(parsed.userId).toBeUndefined()
  })

  it("lost CAS vs anonymous clearance does not overwrite the cleared record", async () => {
    const memory = new MemoryRedis()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(8)
    const authenticated = idleRecord(now)
    const cleared: SessionRecord = {
      accessEndedCause: "inactivity",
      expiresAt: authenticated.expiresAt,
      sessionEndGeneration: 1,
      tenantId: "springfield"
    }
    await memory.set(`test:idle-cas:${sessionId}`, serializeSessionRecord(cleared), {
      expiration: { type: "EXAT", value: cleared.expiresAt }
    })

    const store = new RedisSessionStore(testConfig(), {
      clientFactory: () => memory,
      clock: () => now + 10
    })

    const renew = await store.renewIdleActivity(sessionId, now + 10, "springfield")
    expect(renew.kind).toBe("denied")
    const raw = await memory.get(`test:idle-cas:${sessionId}`)
    expect(raw).toBe(serializeSessionRecord(cleared))
  })

  it("fails closed when the idle lock cannot be acquired within the store timeout", async () => {
    const memory = new MemoryRedis()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(9)
    const record = idleRecord(now)
    await memory.set(`test:idle-cas:${sessionId}`, serializeSessionRecord(record), {
      expiration: { type: "EXAT", value: record.expiresAt }
    })
    await memory.set(`test:idle-cas:idle-lock:${sessionId}`, "held", {
      condition: "NX",
      expiration: { type: "PX", value: 60_000 }
    })

    const store = new RedisSessionStore(
      testConfig({ storeTimeoutMs: 30 }),
      {
        clientFactory: () => memory,
        clock: () => now + 10,
        timeoutMs: 30
      }
    )

    await expect(store.renewIdleActivity(sessionId, now + 10, "springfield")).rejects.toThrow(
      SessionStoreError
    )
  })

  it("store timeout during session load fails closed without writing", async () => {
    const memory = new MemoryRedis()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(10)
    const sessionKey = `test:idle-cas:${sessionId}`
    const record = idleRecord(now)
    await memory.set(sessionKey, serializeSessionRecord(record), {
      expiration: { type: "EXAT", value: record.expiresAt }
    })

    memory.beforeGet = async (key) => {
      if (key === sessionKey) {
        await new Promise(() => undefined)
      }
    }

    const store = new RedisSessionStore(testConfig({ storeTimeoutMs: 40 }), {
      clientFactory: () => memory,
      clock: () => now + 10,
      timeoutMs: 40
    })

    await expect(store.renewIdleActivity(sessionId, now + 10, "springfield")).rejects.toMatchObject({
      message: "Session store operation timed out."
    })

    memory.beforeGet = undefined
    const raw = await memory.get(sessionKey)
    expect(raw).toBe(serializeSessionRecord(record))
  })

  it("CAS mismatch (WATCH-abort equivalent) fails closed on clearance", async () => {
    const memory = new MemoryRedis()
    const now = 1_700_000_000
    const idleExpiresAt = now + 100
    const sessionId = fixedSessionId(11)
    const sessionKey = `test:idle-cas:${sessionId}`
    const record = idleRecord(now, {
      idleDurationMinutes: 15,
      idleExpiresAt,
      lastActivityAt: now
    })
    const newer = idleRecord(now + 60, {
      expiresAt: record.expiresAt,
      idleDurationMinutes: 15
    })
    await memory.set(sessionKey, serializeSessionRecord(record), {
      expiration: { type: "EXAT", value: record.expiresAt }
    })

    let casEvals = 0
    memory.beforeEval = async (script, options) => {
      if (script !== SESSION_CAS_UNDER_LOCK_SCRIPT) {
        return
      }
      if (options.keys?.[0] !== sessionKey) {
        return
      }
      casEvals += 1
      if (casEvals === 1) {
        await memory.set(sessionKey, serializeSessionRecord(newer), {
          expiration: { type: "EXAT", value: newer.expiresAt }
        })
      }
    }

    const store = new RedisSessionStore(testConfig(), {
      clientFactory: () => memory,
      clock: () => idleExpiresAt
    })

    const result = await store.clearForInactivity(sessionId, idleExpiresAt, "springfield")
    expect(result.kind).toBe("denied")

    const raw = await memory.get(sessionKey)
    expect(raw).not.toBeNull()
    if (raw === null) {
      throw new Error("expected renewed session payload")
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    expect(parsed.userId).toBe("user-1")
    expect(parsed.lastActivityAt).toBe(now + 60)
    expect(parsed.accessEndedCause).toBeUndefined()
  })

  it("stamps activity from nowSeconds (application clock), not Redis TIME", async () => {
    const memory = new MemoryRedis()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(12)
    const record = idleRecord(now, { idleDurationMinutes: 10 })
    await memory.set(`test:idle-cas:${sessionId}`, serializeSessionRecord(record), {
      expiration: { type: "EXAT", value: record.expiresAt }
    })

    const stamp = now + 45
    const store = new RedisSessionStore(testConfig(), {
      clientFactory: () => memory,
      clock: () => stamp
    })

    const result = await store.renewIdleActivity(sessionId, stamp, "springfield")
    expect(result.kind).toBe("renewed")
    if (result.kind === "renewed") {
      expect(result.record.lastActivityAt).toBe(stamp)
    }
    expect("time" in memory).toBe(false)
  })

  it("serializes concurrent renewals on the per-session idle lock", async () => {
    const memory = new MemoryRedis()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(13)
    const sessionKey = `test:idle-cas:${sessionId}`
    const record = idleRecord(now, { idleDurationMinutes: 10 })
    await memory.set(sessionKey, serializeSessionRecord(record), {
      expiration: { type: "EXAT", value: record.expiresAt }
    })

    let inCritical = 0
    let maxInCritical = 0
    memory.beforeGet = async (key) => {
      if (key !== sessionKey) {
        return
      }
      inCritical += 1
      maxInCritical = Math.max(maxInCritical, inCritical)
      await new Promise((resolve) => setTimeout(resolve, 25))
      inCritical -= 1
    }

    const store = new RedisSessionStore(testConfig({ storeTimeoutMs: 2_000 }), {
      clientFactory: () => memory,
      clock: () => now + 50,
      timeoutMs: 2_000
    })

    const [a, b] = await Promise.all([
      store.renewIdleActivity(sessionId, now + 20, "springfield"),
      store.renewIdleActivity(sessionId, now + 40, "springfield")
    ])

    expect(maxInCritical).toBe(1)
    expect([a.kind, b.kind].every((k) => k === "renewed" || k === "coalesced" || k === "denied")).toBe(true)
    expect([a.kind, b.kind].some((k) => k === "renewed" || k === "coalesced")).toBe(true)
  })

  it("releaseIdleLock does not delete another owner's token", async () => {
    const memory = new MemoryRedis()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(14)
    const lockKey = `test:idle-cas:idle-lock:${sessionId}`
    const record = idleRecord(now)
    await memory.set(`test:idle-cas:${sessionId}`, serializeSessionRecord(record), {
      expiration: { type: "EXAT", value: record.expiresAt }
    })

    const store = new RedisSessionStore(testConfig(), {
      clientFactory: () => memory,
      clock: () => now + 30
    })

    await store.renewIdleActivity(sessionId, now + 30, "springfield")
    expect(await memory.get(lockKey)).toBeNull()

    await memory.set(lockKey, "foreign-owner", {
      condition: "NX",
      expiration: { type: "PX", value: 60_000 }
    })

    const deleted = await memory.eval(RELEASE_IDLE_LOCK_SCRIPT, {
      arguments: ["stale-owner-token"],
      keys: [lockKey]
    })
    expect(deleted).toBe(0)
    expect(await memory.get(lockKey)).toBe("foreign-owner")
  })

  it("refuses CAS when the idle lock token was stolen before the write", async () => {
    const memory = new MemoryRedis()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(15)
    const sessionKey = `test:idle-cas:${sessionId}`
    const record = idleRecord(now)
    await memory.set(sessionKey, serializeSessionRecord(record), {
      expiration: { type: "EXAT", value: record.expiresAt }
    })

    memory.beforeEval = async (script, options) => {
      if (script !== SESSION_CAS_UNDER_LOCK_SCRIPT) {
        return
      }
      const lock = options.keys?.[1]
      if (lock === undefined) {
        return
      }
      // Overwrite lease mid-CAS: late write must not apply.
      await memory.set(lock, "thief", {
        expiration: { type: "PX", value: 60_000 }
      })
    }

    const store = new RedisSessionStore(testConfig(), {
      clientFactory: () => memory,
      clock: () => now + 30
    })

    const result = await store.renewIdleActivity(sessionId, now + 30, "springfield")
    expect(result.kind).toBe("denied")
    expect(await memory.get(sessionKey)).toBe(serializeSessionRecord(record))
  })

  it("update serializes under the idle lock and refuses when the lock is stolen", async () => {
    const memory = new MemoryRedis()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(16)
    const sessionKey = `test:idle-cas:${sessionId}`
    const record = idleRecord(now)
    await memory.set(sessionKey, serializeSessionRecord(record), {
      expiration: { type: "EXAT", value: record.expiresAt }
    })

    memory.beforeEval = async (script, options) => {
      if (script !== SESSION_SET_UNDER_LOCK_SCRIPT) {
        return
      }
      const lock = options.keys?.[1]
      if (lock === undefined) {
        return
      }
      await memory.set(lock, "thief", {
        expiration: { type: "PX", value: 60_000 }
      })
    }

    const store = new RedisSessionStore(testConfig(), {
      clientFactory: () => memory,
      clock: () => now
    })

    const stamped = idleRecord(now + 10, {
      expiresAt: record.expiresAt,
      idleDurationMinutes: 10
    })
    const result = await store.update(sessionId, stamped)
    expect(result.kind).toBe("missing")
    expect(await memory.get(sessionKey)).toBe(serializeSessionRecord(record))
  })
})
