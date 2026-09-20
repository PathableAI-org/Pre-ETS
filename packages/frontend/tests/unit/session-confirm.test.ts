import { randomBytes } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SessionConfig, SessionRecord } from "../../src/lib/session/types.ts"

import { toConfirmSessionActionResult } from "../../src/lib/session/confirm-action.ts"
import { canRunConfirm, executeConfirmPass, nextConfirmDelayMs } from "../../src/lib/session/confirm-pass.ts"
import {
  applyConfirmResult,
  confirmOutcomeHarnessLabel,
  formatHarnessClockTime
} from "../../src/lib/session/confirm-result.ts"
import { confirmSessionAccess } from "../../src/lib/session/confirm.ts"
import { signSessionCookie } from "../../src/lib/session/cookie.ts"
import { computeIdleExpiresAt, DEFAULT_IDLE_DURATION_MINUTES } from "../../src/lib/session/idle.ts"
import { type SessionStore, SessionStoreError } from "../../src/lib/session/store.ts"

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
    userName: overrides.userName ?? "Demo User",
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

function testConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    keyPrefix: "test:confirm:",
    redisUrl: "redis://127.0.0.1:6379",
    signingSecret: new Uint8Array(randomBytes(32)),
    storeTimeoutMs: 200,
    ttlSeconds: 86_400,
    ...overrides
  }
}

describe("confirmSessionAccess", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns authenticated-still-valid with cookie-bound deadlines", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(1)
    const record = idleRecord(now, { idleDurationMinutes: 15 })
    const store = mockStore({
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: false,
        record
      })
    })
    const cookieValue = await signSessionCookie(
      { exp: record.expiresAt, sid: sessionId, tenant: "springfield" },
      config
    )

    const result = await confirmSessionAccess(
      { cookieValue },
      { config, nowSeconds: () => now + 60, store }
    )

    expect(result).toEqual({
      expiresAt: record.expiresAt,
      idleExpiresAt: record.idleExpiresAt,
      kind: "authenticated",
      sessionId
    })
  })

  it("returns ended-inactivity with sessionEndGeneration and consumes string cause once", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(2)
    const prior = idleRecord(now - 2_000, {
      idleDurationMinutes: 10,
      idleExpiresAt: now - 10,
      lastActivityAt: now - 2_000
    })
    const cleared: SessionRecord = {
      accessEndedCause: "inactivity",
      expiresAt: prior.expiresAt,
      sessionEndGeneration: 3,
      tenantId: "springfield"
    }
    const update = vi.fn().mockResolvedValue({ kind: "updated" })
    const store = mockStore({
      clearForInactivity: vi.fn().mockResolvedValue({ kind: "cleared", record: cleared }),
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: false,
        record: prior
      }),
      update
    })
    const cookieValue = await signSessionCookie(
      { exp: prior.expiresAt, sid: sessionId, tenant: "springfield" },
      config
    )

    const result = await confirmSessionAccess(
      { cookieValue },
      { config, nowSeconds: () => now, store }
    )

    expect(result).toEqual({
      kind: "ended-inactivity",
      sessionEndGeneration: 3,
      sessionId
    })
    expect(update).toHaveBeenCalledWith(sessionId, {
      expiresAt: prior.expiresAt,
      sessionEndGeneration: 3,
      tenantId: "springfield"
    })
  })

  it("retains latch after cause consume so a sibling can still confirm inactivity", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(3)
    const latchOnly: SessionRecord = {
      expiresAt: now + 3_600,
      sessionEndGeneration: 4,
      tenantId: "springfield"
    }
    const store = mockStore({
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: false,
        record: latchOnly
      }),
      update: vi.fn().mockResolvedValue({ kind: "updated" })
    })
    const cookieValue = await signSessionCookie(
      { exp: latchOnly.expiresAt, sid: sessionId, tenant: "springfield" },
      config
    )

    const result = await confirmSessionAccess(
      { cookieValue },
      { config, nowSeconds: () => now, store }
    )

    expect(result).toEqual({
      kind: "ended-inactivity",
      sessionEndGeneration: 4,
      sessionId
    })
  })

  it("treats latch-consume SessionStoreError as best-effort", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(12)
    const latchOnly: SessionRecord = {
      accessEndedCause: "inactivity",
      expiresAt: now + 3_600,
      sessionEndGeneration: 5,
      tenantId: "springfield"
    }
    const store = mockStore({
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: false,
        record: latchOnly
      }),
      update: vi.fn().mockRejectedValue(new SessionStoreError("Session store unavailable."))
    })
    const cookieValue = await signSessionCookie(
      { exp: latchOnly.expiresAt, sid: sessionId, tenant: "springfield" },
      config
    )

    const result = await confirmSessionAccess(
      { cookieValue },
      { config, nowSeconds: () => now, store }
    )

    expect(result).toEqual({
      kind: "ended-inactivity",
      sessionEndGeneration: 5,
      sessionId
    })
  })

  it("rethrows unexpected errors from latch consume", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(13)
    const latchOnly: SessionRecord = {
      accessEndedCause: "inactivity",
      expiresAt: now + 3_600,
      sessionEndGeneration: 6,
      tenantId: "springfield"
    }
    const store = mockStore({
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: false,
        record: latchOnly
      }),
      update: vi.fn().mockRejectedValue(new TypeError("unexpected"))
    })
    const cookieValue = await signSessionCookie(
      { exp: latchOnly.expiresAt, sid: sessionId, tenant: "springfield" },
      config
    )

    await expect(
      confirmSessionAccess(
        { cookieValue },
        { config, nowSeconds: () => now, store }
      )
    ).rejects.toBeInstanceOf(TypeError)
  })

  it("returns ended-other without inactivity claim for absolute-only expiry", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(4)
    const record = idleRecord(now - 100, {
      expiresAt: now - 10,
      idleDurationMinutes: 30,
      idleExpiresAt: now + 1_000,
      lastActivityAt: now - 100
    })
    const store = mockStore({
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: false,
        record
      })
    })
    const liveCookie = await signSessionCookie(
      { exp: now + 86_400, sid: sessionId, tenant: "springfield" },
      config
    )

    const result = await confirmSessionAccess(
      { cookieValue: liveCookie },
      { config, nowSeconds: () => now, store }
    )

    expect(result).toEqual({
      kind: "ended-other",
      sessionId
    })
    expect(confirmOutcomeHarnessLabel(toConfirmSessionActionResult(result))).toBe("other")
  })

  it("performs tombstone handoff on session mismatch after cookie rotation", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const oldSessionId = fixedSessionId(5)
    const newSessionId = fixedSessionId(6)
    const tombstone: SessionRecord = {
      accessEndedCause: "inactivity",
      expiresAt: now + 3_600,
      sessionEndGeneration: 9,
      tenantId: "springfield"
    }
    const store = mockStore({
      read: vi.fn((id: string) => {
        if (id === oldSessionId) {
          return Promise.resolve({
            kind: "record" as const,
            legacyAuthenticated: false,
            record: tombstone
          })
        }
        return Promise.resolve({ kind: "missing" as const })
      }),
      update: vi.fn().mockResolvedValue({ kind: "updated" })
    })
    const cookieValue = await signSessionCookie(
      { exp: now + 86_400, sid: newSessionId, tenant: "springfield" },
      config
    )

    const result = await confirmSessionAccess(
      {
        cookieValue,
        mountedSessionId: oldSessionId,
        sessionEndGeneration: 9
      },
      { config, nowSeconds: () => now, store }
    )

    expect(result).toEqual({
      kind: "ended-inactivity",
      mismatch: true,
      sessionEndGeneration: 9,
      sessionId: oldSessionId
    })
  })

  it("returns mismatch without inactivity when tombstone is absent", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const oldSessionId = fixedSessionId(7)
    const newSessionId = fixedSessionId(8)
    const store = mockStore({
      read: vi.fn().mockResolvedValue({ kind: "missing" })
    })
    const cookieValue = await signSessionCookie(
      { exp: now + 86_400, sid: newSessionId, tenant: "springfield" },
      config
    )

    const result = await confirmSessionAccess(
      { cookieValue, mountedSessionId: oldSessionId },
      { config, nowSeconds: () => now, store }
    )

    expect(result).toEqual({
      cookieSessionId: newSessionId,
      kind: "mismatch"
    })
  })

  it("adopts a replacement authenticated cookie session on mismatch after login-again", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const oldSessionId = fixedSessionId(12)
    const newSessionId = fixedSessionId(13)
    const replacement = idleRecord(now, { idleDurationMinutes: 7 })
    const tombstone: SessionRecord = {
      accessEndedCause: "inactivity",
      expiresAt: now + 3_600,
      sessionEndGeneration: 4,
      tenantId: "springfield"
    }
    const store = mockStore({
      read: vi.fn((id: string) => {
        if (id === newSessionId) {
          return Promise.resolve({
            kind: "record" as const,
            legacyAuthenticated: false,
            record: replacement
          })
        }
        if (id === oldSessionId) {
          return Promise.resolve({
            kind: "record" as const,
            legacyAuthenticated: false,
            record: tombstone
          })
        }
        return Promise.resolve({ kind: "missing" as const })
      })
    })
    const cookieValue = await signSessionCookie(
      { exp: replacement.expiresAt, sid: newSessionId, tenant: "springfield" },
      config
    )

    const result = await confirmSessionAccess(
      {
        cookieValue,
        mountedSessionId: oldSessionId,
        sessionEndGeneration: 4
      },
      { config, nowSeconds: () => now + 60, store }
    )

    expect(result).toEqual({
      expiresAt: replacement.expiresAt,
      idleExpiresAt: replacement.idleExpiresAt,
      kind: "authenticated",
      sessionId: newSessionId
    })
  })

  it("returns unavailable on store failure (not an inactivity claim)", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(9)
    const store = mockStore({
      read: vi.fn().mockRejectedValue(new SessionStoreError("timeout"))
    })
    const cookieValue = await signSessionCookie(
      { exp: now + 86_400, sid: sessionId, tenant: "springfield" },
      config
    )

    const result = await confirmSessionAccess(
      { cookieValue },
      { config, nowSeconds: () => now, store }
    )

    expect(result).toEqual({ kind: "unavailable" })
    expect(confirmOutcomeHarnessLabel(toConfirmSessionActionResult(result))).toBe(
      "error (unavailable)"
    )
  })
})

describe("applyConfirmResult / executeConfirmPass", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("reschedules deadlines on authenticated and locks inactivity without claiming on 5xx", () => {
    const setDeadlines = vi.fn()
    const setActive = vi.fn()
    const applyInactivity = vi.fn()
    const setUnavailable = vi.fn()

    applyConfirmResult(
      {
        expiresAt: 200,
        idleExpiresAt: 100,
        sessionId: fixedSessionId(1),
        status: "authenticated"
      },
      { applyInactivity, setActive, setDeadlines, setUnavailable }
    )
    expect(setActive).toHaveBeenCalledWith(fixedSessionId(1))
    expect(setDeadlines).toHaveBeenCalledWith({ expiresAt: 200, idleExpiresAt: 100 })
    expect(applyInactivity).not.toHaveBeenCalled()

    applyConfirmResult(
      {
        sessionEndGeneration: 2,
        sessionId: fixedSessionId(2),
        status: "ended-inactivity"
      },
      { applyInactivity, setActive, setDeadlines, setUnavailable }
    )
    expect(applyInactivity).toHaveBeenCalledWith(fixedSessionId(2), 2)

    applyConfirmResult(
      { status: "unavailable" },
      { applyInactivity, setActive, setDeadlines, setUnavailable }
    )
    expect(setUnavailable).toHaveBeenCalled()
  })

  it("maps transport throw to unavailable via executeConfirmPass", async () => {
    const setUnavailable = vi.fn()
    const onTransportFailure = vi.fn()

    await executeConfirmPass({
      applyInactivity: vi.fn(),
      confirm: () => Promise.reject(new Error("network down")),
      heldGeneration: undefined,
      onTransportFailure,
      sessionId: fixedSessionId(10),
      setActive: vi.fn(),
      setDeadlines: vi.fn(),
      setUnavailable
    })

    expect(onTransportFailure).toHaveBeenCalled()
    expect(setUnavailable).toHaveBeenCalled()
  })

  it("allows confirm while active, unavailable, or inactivity; blocks in-flight", () => {
    expect(canRunConfirm(true, "active")).toBe(false)
    expect(canRunConfirm(false, "unavailable")).toBe(true)
    expect(canRunConfirm(false, "inactivity")).toBe(true)
    expect(canRunConfirm(false, "active")).toBe(true)
  })

  it("restores active via setActive on authenticated after unavailable", async () => {
    const setActive = vi.fn()
    const setDeadlines = vi.fn()
    const setUnavailable = vi.fn()

    await executeConfirmPass({
      applyInactivity: vi.fn(),
      confirm: () =>
        Promise.resolve({
          expiresAt: 300,
          idleExpiresAt: 200,
          sessionId: fixedSessionId(11),
          status: "authenticated" as const
        }),
      heldGeneration: undefined,
      sessionId: fixedSessionId(11),
      setActive,
      setDeadlines,
      setUnavailable
    })

    expect(setActive).toHaveBeenCalledWith(fixedSessionId(11))
    expect(setDeadlines).toHaveBeenCalledWith({ expiresAt: 300, idleExpiresAt: 200 })
    expect(setUnavailable).not.toHaveBeenCalled()
  })
})

describe("nextConfirmDelayMs (deadline-aligned schedule)", () => {
  it("schedules at min(idleExpiresAt, expiresAt) from now", () => {
    const nowMs = 1_700_000_000_000
    // idle at +100s, absolute at +500s → delay 100_000ms
    expect(nextConfirmDelayMs(1_700_000_100, 1_700_000_500, nowMs)).toBe(100_000)
    // absolute binds first
    expect(nextConfirmDelayMs(1_700_000_500, 1_700_000_050, nowMs)).toBe(50_000)
    // already past → 0
    expect(nextConfirmDelayMs(1_699_999_000, 1_700_000_500, nowMs)).toBe(0)
  })

  it("does not invent inactivity from schedule alone", () => {
    // Label B / delay is schedule visibility only — outcome requires confirm DTO.
    const delay = nextConfirmDelayMs(100, 200, 0)
    expect(delay).toBe(100_000)
    expect(confirmOutcomeHarnessLabel({ status: "unavailable" })).not.toMatch(/inactivity/i)
  })
})

describe("formatHarnessClockTime", () => {
  it("formats unix seconds as locale HH:MM:SS, not raw epoch", () => {
    const label = formatHarnessClockTime(1_700_000_000)
    expect(label).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    expect(label).not.toBe("1700000000")
    expect(
      confirmOutcomeHarnessLabel({
        expiresAt: 1_700_000_100,
        idleExpiresAt: 1_700_000_000,
        sessionId: fixedSessionId(1),
        status: "authenticated"
      })
    ).toBe(
      `valid (idleExpiresAt=${formatHarnessClockTime(1_700_000_000)}, expiresAt=${
        formatHarnessClockTime(1_700_000_100)
      })`
    )
  })
})
