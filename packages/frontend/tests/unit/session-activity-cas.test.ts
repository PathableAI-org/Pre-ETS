import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"

import { computeIdleExpiresAt, DEFAULT_IDLE_DURATION_MINUTES } from "../../src/lib/session/idle.ts"
import { RedisSessionStore } from "../../src/lib/session/store.ts"
import { serializeSessionRecord, type SessionConfig, type SessionRecord } from "../../src/lib/session/types.ts"
import { MemoryRedis } from "./helpers/memory-redis.ts"

function fixedSessionId(seed = 55): string {
  const bytes = new Uint8Array(32)
  bytes.fill(seed)
  return Buffer.from(bytes).toString("base64url")
}

function idleRecord(now: number, overrides: Partial<SessionRecord> = {}): SessionRecord {
  const idleDurationMinutes = overrides.idleDurationMinutes ?? DEFAULT_IDLE_DURATION_MINUTES
  const lastActivityAt = overrides.lastActivityAt ?? now
  return {
    expiresAt: overrides.expiresAt ?? now + 86_400,
    idleDurationMinutes,
    idleExpiresAt: overrides.idleExpiresAt
      ?? computeIdleExpiresAt(lastActivityAt, idleDurationMinutes),
    lastActivityAt,
    tenantId: overrides.tenantId ?? "springfield",
    userId: overrides.userId ?? "user-1",
    userName: overrides.userName ?? "Demo User"
  }
}

function testConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    keyPrefix: "test:activity-cas:",
    redisUrl: "redis://127.0.0.1:6379",
    signingSecret: new Uint8Array(randomBytes(32)),
    storeTimeoutMs: 500,
    ttlSeconds: 86_400,
    ...overrides
  }
}

describe("session activity CAS races", () => {
  it("post-apply re-check prevents chaining renewals on a not-yet-validated write", async () => {
    const memory = new MemoryRedis()
    const now0 = 1_700_000_000
    const preRenewalIdleExpiresAt = now0 + 300
    const sessionId = fixedSessionId(1)
    const sessionKey = `test:activity-cas:${sessionId}`
    const record = idleRecord(now0, {
      idleDurationMinutes: 5,
      idleExpiresAt: preRenewalIdleExpiresAt,
      lastActivityAt: now0
    })
    await memory.set(sessionKey, serializeSessionRecord(record), {
      expiration: { type: "EXAT", value: record.expiresAt }
    })

    // Stamp before deadline; post-apply clock jumps past prior idleExpiresAt → clear.
    const store = new RedisSessionStore(testConfig(), {
      clientFactory: () => memory,
      clock: () => preRenewalIdleExpiresAt
    })

    const first = await store.renewIdleActivity(sessionId, now0 + 10, "springfield")
    expect(first.kind).toBe("cleared")

    // A concurrent-style follow-up must not observe an extended authenticated deadline.
    const second = await store.renewIdleActivity(sessionId, now0 + 20, "springfield")
    expect(second.kind).toBe("denied")

    const raw = await memory.get(sessionKey)
    expect(raw).not.toBeNull()
    if (raw === null) {
      throw new Error("expected cleared session payload")
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    expect(parsed.userId).toBeUndefined()
    expect(parsed.accessEndedCause).toBe("inactivity")
  })

  it("renew under lock lost to anonymous clearance does not overwrite", async () => {
    const memory = new MemoryRedis()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(2)
    const sessionKey = `test:activity-cas:${sessionId}`
    const authenticated = idleRecord(now)
    const cleared: SessionRecord = {
      accessEndedCause: "inactivity",
      expiresAt: authenticated.expiresAt,
      sessionEndGeneration: 1,
      tenantId: "springfield"
    }
    await memory.set(sessionKey, serializeSessionRecord(authenticated), {
      expiration: { type: "EXAT", value: authenticated.expiresAt }
    })

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
    expect(await memory.get(sessionKey)).toBe(serializeSessionRecord(cleared))
  })

  it("serialized renew then clear: clearance wins; later renew denied", async () => {
    const memory = new MemoryRedis()
    const now = 1_700_000_000
    const idleExpiresAt = now + 900
    const sessionId = fixedSessionId(3)
    const sessionKey = `test:activity-cas:${sessionId}`
    const record = idleRecord(now, {
      idleDurationMinutes: 15,
      idleExpiresAt,
      lastActivityAt: now
    })
    await memory.set(sessionKey, serializeSessionRecord(record), {
      expiration: { type: "EXAT", value: record.expiresAt }
    })

    const store = new RedisSessionStore(testConfig(), {
      clientFactory: () => memory,
      clock: () => now + 40
    })

    const renewed = await store.renewIdleActivity(sessionId, now + 40, "springfield")
    expect(renewed.kind).toBe("renewed")

    const cleared = await store.clearForInactivity(sessionId, idleExpiresAt + 40, "springfield")
    expect(cleared.kind).toBe("cleared")

    const late = await store.renewIdleActivity(sessionId, idleExpiresAt + 50, "springfield")
    expect(late.kind).toBe("denied")
  })
})
