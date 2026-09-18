/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SessionContext, SessionRecord } from "../../src/lib/session/types.ts"

import { assertGuardedSession, guardAuthenticatedAccess } from "../../src/lib/session/guard.ts"
import { computeIdleExpiresAt, DEFAULT_IDLE_DURATION_MINUTES } from "../../src/lib/session/idle.ts"
import { type SessionStore, SessionStoreError } from "../../src/lib/session/store.ts"

function fixedSessionId(seed = 1): string {
  const bytes = new Uint8Array(32)
  bytes.fill(seed)
  return Buffer.from(bytes).toString("base64url")
}

function idleAuthenticatedRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const lastActivityAt = 1_700_000_000
  const idleDurationMinutes = DEFAULT_IDLE_DURATION_MINUTES
  return {
    expiresAt: lastActivityAt + 86_400,
    idleDurationMinutes,
    idleExpiresAt: computeIdleExpiresAt(lastActivityAt, idleDurationMinutes),
    lastActivityAt,
    tenantId: "springfield",
    userId: "user-1",
    userName: "Demo User",
    ...overrides
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

describe("guardAuthenticatedAccess", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("allows when Redis re-read is idle-shaped, tenant-bound, and both deadlines are live", async () => {
    const sessionId = fixedSessionId(1)
    const record = idleAuthenticatedRecord()
    const store = mockStore({
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: false,
        record
      })
    })
    const lastActivityAt = record.lastActivityAt ?? 0
    const now = lastActivityAt + 60

    const result = await guardAuthenticatedAccess(
      { sessionId, tenantId: "springfield" },
      { nowSeconds: () => now, store }
    )

    expect(result).toEqual({
      context: {
        expiresAt: record.expiresAt,
        idleExpiresAt: record.idleExpiresAt,
        sessionId,
        tenantId: "springfield",
        userId: "user-1",
        userName: "Demo User"
      },
      kind: "allow",
      record
    })
    expect(vi.mocked(store.read)).toHaveBeenCalledWith(sessionId)
  })

  it("samples a fresh clock after Redis load before success", async () => {
    const sessionId = fixedSessionId(2)
    const idleExpiresAt = 1_700_001_800
    const record = idleAuthenticatedRecord({
      expiresAt: 1_700_086_400,
      idleExpiresAt,
      lastActivityAt: 1_700_000_000
    })
    const events: string[] = []
    const store = mockStore({
      clearForInactivity: vi.fn().mockResolvedValue({
        kind: "cleared",
        record: {
          accessEndedCause: "inactivity",
          expiresAt: 1_700_086_400,
          sessionEndGeneration: 1,
          tenantId: "springfield"
        }
      }),
      read: vi.fn(async () => {
        events.push("read")
        return { kind: "record" as const, legacyAuthenticated: false, record }
      })
    })

    const result = await guardAuthenticatedAccess(
      { sessionId, tenantId: "springfield" },
      {
        nowSeconds: () => {
          events.push("now")
          return idleExpiresAt
        },
        store
      }
    )

    expect(events).toEqual(["read", "now"])
    expect(result).toEqual({
      inactivity: true,
      kind: "deny",
      reason: "inactivity"
    })
    expect(vi.mocked(store.clearForInactivity)).toHaveBeenCalled()
  })

  it("denies with inactivity when idle deadline elapsed and clears for inactivity", async () => {
    const record = idleAuthenticatedRecord({
      idleExpiresAt: 1_700_001_800
    })
    const store = mockStore({
      clearForInactivity: vi.fn().mockResolvedValue({
        kind: "cleared",
        record: {
          accessEndedCause: "inactivity",
          expiresAt: record.expiresAt,
          sessionEndGeneration: 1,
          tenantId: "springfield"
        }
      }),
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: false,
        record
      })
    })

    const result = await guardAuthenticatedAccess(
      { sessionId: fixedSessionId(3), tenantId: "springfield" },
      { nowSeconds: () => 1_700_001_800, store }
    )

    expect(result).toEqual({
      inactivity: true,
      kind: "deny",
      reason: "inactivity"
    })
    expect(vi.mocked(store.clearForInactivity)).toHaveBeenCalledWith(
      fixedSessionId(3),
      1_700_001_800,
      "springfield"
    )
  })

  it("denies without inactivity when absolute deadline elapsed first", async () => {
    const record = idleAuthenticatedRecord({
      expiresAt: 1_700_000_500,
      idleExpiresAt: 1_700_001_800
    })
    const store = mockStore({
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: false,
        record
      })
    })

    const result = await guardAuthenticatedAccess(
      { sessionId: fixedSessionId(4), tenantId: "springfield" },
      { nowSeconds: () => 1_700_000_500, store }
    )

    expect(result).toEqual({
      inactivity: false,
      kind: "deny",
      reason: "absolute"
    })
  })

  it("denies without inactivity on missing store record", async () => {
    const store = mockStore({
      read: vi.fn().mockResolvedValue({ kind: "missing" })
    })

    const result = await guardAuthenticatedAccess(
      { sessionId: fixedSessionId(5), tenantId: "springfield" },
      { nowSeconds: () => 1_700_000_000, store }
    )

    expect(result).toEqual({
      inactivity: false,
      kind: "deny",
      reason: "missing"
    })
  })

  it("denies without inactivity on store error / 503", async () => {
    const store = mockStore({
      read: vi.fn().mockRejectedValue(new SessionStoreError("Session store unavailable."))
    })

    const result = await guardAuthenticatedAccess(
      { sessionId: fixedSessionId(6), tenantId: "springfield" },
      { nowSeconds: () => 1_700_000_000, store }
    )

    expect(result).toEqual({
      inactivity: false,
      kind: "deny",
      reason: "store-error"
    })
  })

  it("denies without inactivity on tenant bind mismatch", async () => {
    const store = mockStore({
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: false,
        record: idleAuthenticatedRecord({ tenantId: "shelbyville" })
      })
    })

    const result = await guardAuthenticatedAccess(
      { sessionId: fixedSessionId(7), tenantId: "springfield" },
      { nowSeconds: () => 1_700_000_000, store }
    )

    expect(result).toEqual({
      inactivity: false,
      kind: "deny",
      reason: "tenant"
    })
  })

  it("denies without inactivity for legacy four-key authenticated records", async () => {
    const store = mockStore({
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: true,
        record: {
          expiresAt: 1_700_086_400,
          tenantId: "springfield",
          userId: "user-1",
          userName: "Demo User"
        }
      })
    })

    const result = await guardAuthenticatedAccess(
      { sessionId: fixedSessionId(8), tenantId: "springfield" },
      { nowSeconds: () => 1_700_000_000, store }
    )

    expect(result).toEqual({
      inactivity: false,
      kind: "deny",
      reason: "legacy"
    })
  })

  it("denies without inactivity when record is not idle-shaped authenticated", async () => {
    const store = mockStore({
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: false,
        record: { expiresAt: 1_700_086_400, tenantId: "springfield" }
      })
    })

    const result = await guardAuthenticatedAccess(
      { sessionId: fixedSessionId(9), tenantId: "springfield" },
      { nowSeconds: () => 1_700_000_000, store }
    )

    expect(result).toEqual({
      inactivity: false,
      kind: "deny",
      reason: "not-authenticated"
    })
  })
})

describe("assertGuardedSession", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("passes anonymous context through without Redis", async () => {
    const store = mockStore()
    const context: SessionContext = {
      expiresAt: 1_700_086_400,
      sessionId: fixedSessionId(10),
      tenantId: "springfield"
    }

    await expect(assertGuardedSession(context, { store })).resolves.toEqual(context)
    expect(vi.mocked(store.read)).not.toHaveBeenCalled()
  })

  it("re-reads via guard when context carries userId", async () => {
    const sessionId = fixedSessionId(11)
    const record = idleAuthenticatedRecord()
    const idleExpiresAt = record.idleExpiresAt ?? 0
    const lastActivityAt = record.lastActivityAt ?? 0
    const store = mockStore({
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: false,
        record
      })
    })
    const context: SessionContext = {
      expiresAt: record.expiresAt,
      idleExpiresAt,
      sessionId,
      tenantId: "springfield",
      userId: "stale-user",
      userName: "Stale Name"
    }

    const guarded = await assertGuardedSession(context, {
      nowSeconds: () => lastActivityAt + 10,
      store
    })

    expect(guarded.userId).toBe("user-1")
    expect(guarded.userName).toBe("Demo User")
    expect(vi.mocked(store.read)).toHaveBeenCalledWith(sessionId)
  })

  it("throws when authenticated guard denies", async () => {
    const store = mockStore({
      read: vi.fn().mockResolvedValue({ kind: "missing" })
    })
    const context: SessionContext = {
      expiresAt: 1_700_086_400,
      idleExpiresAt: 1_700_001_800,
      sessionId: fixedSessionId(12),
      tenantId: "springfield",
      userId: "user-1",
      userName: "Demo User"
    }

    await expect(assertGuardedSession(context, { store })).rejects.toThrow(
      "Authenticated session access denied."
    )
  })
})
