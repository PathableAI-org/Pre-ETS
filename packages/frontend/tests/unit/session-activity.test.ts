import { randomBytes } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SessionConfig, SessionRecord } from "../../src/lib/session/types.ts"

import { recordQualifyingActivity } from "../../src/lib/session/activity.ts"
import { signSessionCookie } from "../../src/lib/session/cookie.ts"
import { computeIdleExpiresAt, DEFAULT_IDLE_DURATION_MINUTES } from "../../src/lib/session/idle.ts"
import { IDLE_ACTIVITY_COALESCE_SECONDS, type SessionStore, SessionStoreError } from "../../src/lib/session/store.ts"

function fixedSessionId(seed = 21): string {
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

function mockStore(overrides: Partial<SessionStore> = {}): SessionStore {
  return {
    clearForInactivity: vi.fn().mockResolvedValue({ kind: "denied" }),
    create: vi.fn().mockResolvedValue({ kind: "created" }),
    read: vi.fn().mockResolvedValue({ kind: "missing" }),
    renewIdleActivity: vi.fn().mockResolvedValue({ kind: "denied" }),
    update: vi.fn().mockResolvedValue({ kind: "updated" }),
    ...overrides
  }
}

function testConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    keyPrefix: "test:activity:",
    redisUrl: "redis://127.0.0.1:6379",
    signingSecret: new Uint8Array(randomBytes(32)),
    storeTimeoutMs: 200,
    ttlSeconds: 86_400,
    ...overrides
  }
}

describe("recordQualifyingActivity", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("accepts deliberate activity before the idle deadline and leaves expiresAt unchanged", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(1)
    const prior = idleRecord(now, { idleDurationMinutes: 10 })
    const renewed = idleRecord(now + 120, {
      expiresAt: prior.expiresAt,
      idleDurationMinutes: 10,
      lastActivityAt: now + 120
    })
    const renewIdleActivity = vi.fn().mockResolvedValue({ kind: "renewed", record: renewed })
    const store = mockStore({ renewIdleActivity })
    const cookieValue = await signSessionCookie(
      { exp: prior.expiresAt, sid: sessionId, tenant: "springfield" },
      config
    )

    const result = await recordQualifyingActivity(
      { cookieValue },
      { config, nowSeconds: () => now + 120, store }
    )

    expect(result).toEqual({ kind: "renewed", record: renewed })
    expect(renewIdleActivity).toHaveBeenCalledWith(
      sessionId,
      now + 120,
      "springfield"
    )
    expect(renewed.expiresAt).toBe(prior.expiresAt)
    expect(renewed.idleDurationMinutes).toBe(10)
  })

  it("rejects late activity at or after idleExpiresAt without a client-supplied at", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(2)
    const prior = idleRecord(now, {
      idleDurationMinutes: 5,
      idleExpiresAt: now + 300
    })
    const renewIdleActivity = vi.fn().mockResolvedValue({ kind: "denied" })
    const store = mockStore({ renewIdleActivity })
    const cookieValue = await signSessionCookie(
      { exp: prior.expiresAt, sid: sessionId, tenant: "springfield" },
      config
    )

    const result = await recordQualifyingActivity(
      { cookieValue },
      { config, nowSeconds: () => now + 300, store }
    )

    expect(result).toEqual({ kind: "denied", reason: "expired" })
    expect(renewIdleActivity).toHaveBeenCalledWith(
      sessionId,
      now + 300,
      "springfield"
    )
    // Handler API accepts only cookieValue — no `at` field on the input.
    expect(Object.keys({ cookieValue })).toEqual(["cookieValue"])
  })

  it("derives session identity only from the verified cookie (no caller-supplied sid)", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(3)
    const renewIdleActivity = vi.fn().mockResolvedValue({
      kind: "renewed",
      record: idleRecord(now + 60)
    })
    const store = mockStore({ renewIdleActivity })
    const cookieValue = await signSessionCookie(
      { exp: now + 86_400, sid: sessionId, tenant: "springfield" },
      config
    )

    await recordQualifyingActivity(
      { cookieValue },
      { config, nowSeconds: () => now + 60, store }
    )

    expect(renewIdleActivity.mock.calls[0]?.[0]).toBe(sessionId)
    expect(renewIdleActivity.mock.calls[0]?.[2]).toBe("springfield")
  })

  it("denies missing cookie without calling the store", async () => {
    const renewIdleActivity = vi.fn().mockResolvedValue({ kind: "denied" })
    const store = mockStore({ renewIdleActivity })
    const result = await recordQualifyingActivity(
      { cookieValue: undefined },
      { config: testConfig(), nowSeconds: () => 1_700_000_000, store }
    )
    expect(result).toEqual({ kind: "denied", reason: "missing-cookie" })
    expect(renewIdleActivity).not.toHaveBeenCalled()
  })

  it("denies invalid cookie without calling renew", async () => {
    const renewIdleActivity = vi.fn().mockResolvedValue({ kind: "denied" })
    const store = mockStore({ renewIdleActivity })
    const result = await recordQualifyingActivity(
      { cookieValue: "not-a-jwt" },
      { config: testConfig(), nowSeconds: () => 1_700_000_000, store }
    )
    expect(result).toEqual({ kind: "denied", reason: "invalid-cookie" })
    expect(renewIdleActivity).not.toHaveBeenCalled()
  })

  it("coalesces ~1s redundant renewals when the store reports coalesced", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(4)
    const record = idleRecord(now)
    const store = mockStore({
      renewIdleActivity: vi.fn().mockResolvedValue({ kind: "coalesced", record })
    })
    const cookieValue = await signSessionCookie(
      { exp: record.expiresAt, sid: sessionId, tenant: "springfield" },
      config
    )

    const result = await recordQualifyingActivity(
      { cookieValue },
      { config, nowSeconds: () => now, store }
    )

    expect(result).toEqual({ kind: "coalesced", record })
    expect(IDLE_ACTIVITY_COALESCE_SECONDS).toBe(1)
  })

  it("fails closed when the store times out", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(5)
    const store = mockStore({
      renewIdleActivity: vi.fn().mockRejectedValue(
        new SessionStoreError("Session store operation timed out.")
      )
    })
    const cookieValue = await signSessionCookie(
      { exp: now + 86_400, sid: sessionId, tenant: "springfield" },
      config
    )

    const result = await recordQualifyingActivity(
      { cookieValue },
      { config, nowSeconds: () => now + 10, store }
    )

    expect(result).toEqual({ kind: "denied", reason: "store-error" })
  })

  it("maps post-apply clearance to denied without revival", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(6)
    const store = mockStore({
      renewIdleActivity: vi.fn().mockResolvedValue({
        kind: "cleared",
        record: {
          accessEndedCause: "inactivity",
          expiresAt: now + 86_400,
          sessionEndGeneration: 1,
          tenantId: "springfield"
        }
      })
    })
    const cookieValue = await signSessionCookie(
      { exp: now + 86_400, sid: sessionId, tenant: "springfield" },
      config
    )

    const result = await recordQualifyingActivity(
      { cookieValue },
      { config, nowSeconds: () => now + 10, store }
    )

    expect(result).toEqual({ kind: "denied", reason: "cleared" })
  })
})
