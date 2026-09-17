import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"

import { computeIdleExpiresAt, DEFAULT_IDLE_DURATION_MINUTES } from "../../src/lib/session/idle.ts"
import { IDLE_ACTIVITY_COALESCE_SECONDS, RedisSessionStore, SessionStoreError } from "../../src/lib/session/store.ts"
import { serializeSessionRecord, type SessionConfig, type SessionRecord } from "../../src/lib/session/types.ts"
import { MemoryRedis } from "./helpers/memory-redis.ts"

function fixedSessionId(seed = 9): string {
  const bytes = new Uint8Array(32)
  bytes.fill(seed)
  return Buffer.from(bytes).toString("base64url")
}

// fallow-ignore-next-line complexity -- test fixture with optional latch/cause overrides
function idleRecord(now: number, overrides: Partial<SessionRecord> = {}): SessionRecord {
  const idleDurationMinutes = overrides.idleDurationMinutes ?? DEFAULT_IDLE_DURATION_MINUTES
  const lastActivityAt = overrides.lastActivityAt ?? now
  const idleExpiresAt = overrides.idleExpiresAt
    ?? computeIdleExpiresAt(lastActivityAt, idleDurationMinutes)

  return {
    expiresAt: overrides.expiresAt ?? now + 86_400,
    idleDurationMinutes,
    idleExpiresAt,
    lastActivityAt,
    tenantId: overrides.tenantId ?? "springfield",
    userId: overrides.userId ?? "user-1",
    userName: overrides.userName ?? "Demo User",
    ...("accessEndedCause" in overrides
      ? { accessEndedCause: overrides.accessEndedCause }
      : {}),
    ...("sessionEndGeneration" in overrides
      ? { sessionEndGeneration: overrides.sessionEndGeneration }
      : {})
  }
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
      expiration: { type: "PX" }
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

    const next = await store.renewIdleActivity(
      sessionId,
      now + IDLE_ACTIVITY_COALESCE_SECONDS,
      "springfield"
    )
    expect(next.kind).toBe("renewed")
  })

  it("CAS refuses blind SET when expected serialized value no longer matches", async () => {
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

    // loadRawRecord GET #1; compareAndSet GET #2 — flip before CAS predicate.
    let sessionGets = 0
    memory.beforeGet = async (key) => {
      if (key !== sessionKey) {
        return
      }
      sessionGets += 1
      if (sessionGets === 2) {
        await memory.set(sessionKey, serializeSessionRecord(cleared), {
          expiration: { type: "EXAT", value: cleared.expiresAt }
        })
      }
    }

    const store = new RedisSessionStore(testConfig(), {
      clientFactory: () => memory,
      clock: () => now + 30
    })

    const result = await store.renewIdleActivity(sessionId, now + 30, "springfield")
    expect(result.kind).toBe("denied")

    const sessionWrites = memory.set.mock.calls.filter(
      (call) =>
        call[0] === sessionKey
        && call[2]?.condition === "XX"
        && typeof call[1] === "string"
        && call[1].includes("lastActivityAt")
    )
    expect(sessionWrites).toHaveLength(0)

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

    let sessionGets = 0
    memory.beforeGet = async (key) => {
      if (key !== sessionKey) {
        return
      }
      sessionGets += 1
      if (sessionGets === 2) {
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

    const clearanceWrites = memory.set.mock.calls.filter(
      (call) =>
        call[0] === sessionKey
        && typeof call[1] === "string"
        && call[1].includes("accessEndedCause")
    )
    expect(clearanceWrites).toHaveLength(0)

    const raw = await memory.get(sessionKey)
    expect(raw).not.toBeNull()
    if (raw === null) {
      throw new Error("expected renewed session payload")
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    expect(parsed.userId).toBe("user-1")
    expect(parsed.lastActivityAt).toBe(now + 60)
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
})
