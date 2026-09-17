/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { randomBytes } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SessionConfig, SessionRecord } from "../../src/lib/session/types.ts"

import { confirmSessionAccess } from "../../src/lib/session/confirm.ts"
import { signSessionCookie } from "../../src/lib/session/cookie.ts"
import { computeIdleExpiresAt, DEFAULT_IDLE_DURATION_MINUTES } from "../../src/lib/session/idle.ts"
import {
  INACTIVITY_BROADCAST_CHANNEL,
  INACTIVITY_CONFIRMED_TYPE,
  inactivityConfirmedMessage,
  isInactivityConfirmedMessage
} from "../../src/lib/session/inactivity-channel.ts"
import { loginAgain } from "../../src/lib/session/login-again.ts"
import { type SessionStore, SessionStoreError } from "../../src/lib/session/store.ts"
import { config as proxyConfig } from "../../src/proxy.ts"
import { springfieldRecord } from "./tenant-fixtures.ts"

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
    keyPrefix: "test:recovery:",
    redisUrl: "redis://127.0.0.1:6379",
    signingSecret: new Uint8Array(randomBytes(32)),
    storeTimeoutMs: 200,
    ttlSeconds: 86_400,
    ...overrides
  }
}

describe("session recovery (confirm / latch / BroadcastChannel / login-again)", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("confirmSessionAccess", () => {
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
      const store = mockStore({
        clearForInactivity: vi.fn().mockResolvedValue({ kind: "cleared", record: cleared }),
        read: vi.fn().mockResolvedValue({
          kind: "record",
          legacyAuthenticated: false,
          record: prior
        }),
        update: vi.fn().mockResolvedValue({ kind: "updated" })
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
      expect(vi.mocked(store.update)).toHaveBeenCalledWith(sessionId, {
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
      // Cookie exp must be > now for verify; use a live cookie against an absolute-expired record.
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
        read: vi.fn().mockImplementation(async (id: string) => {
          if (id === oldSessionId) {
            return { kind: "record", legacyAuthenticated: false, record: tombstone }
          }
          return { kind: "missing" }
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
    })
  })

  describe("BroadcastChannel payload", () => {
    it("shapes inactivity-confirmed with sessionId and sessionEndGeneration", () => {
      const sessionId = fixedSessionId(10)
      const message = inactivityConfirmedMessage(sessionId, 2)
      expect(message).toEqual({
        sessionEndGeneration: 2,
        sessionId,
        type: INACTIVITY_CONFIRMED_TYPE
      })
      expect(isInactivityConfirmedMessage(message)).toBe(true)
      expect(isInactivityConfirmedMessage({ type: "other" })).toBe(false)
      expect(INACTIVITY_BROADCAST_CHANNEL).toBe("pathable-inactivity")
    })
  })

  describe("loginAgain rotation", () => {
    it("mints a new sessionId and leaves the old Redis key untouched", async () => {
      const config = testConfig()
      const now = 1_700_000_000
      const oldSessionId = fixedSessionId(11)
      const newSessionId = fixedSessionId(12)
      const store = mockStore({
        create: vi.fn().mockResolvedValue({ kind: "created" })
      })
      const cookieValue = await signSessionCookie(
        { exp: now + 86_400, sid: oldSessionId, tenant: "springfield" },
        config
      )
      const initiate = vi.fn().mockResolvedValue({
        expiresAt: now + 600,
        kind: "redirect",
        location: "https://idp.example/authorize",
        oidcCookieValue: "oidc-cookie",
        outcomeClass: "redirect"
      })

      const result = await loginAgain(
        {
          cookieValue,
          nowSeconds: now,
          origin: "https://springfield.localhost",
          tenantId: "springfield",
          tenantRecord: springfieldRecord
        },
        {
          config,
          createId: () => newSessionId,
          initiate,
          initiateDeps: {
            store: {
              consume: vi.fn(),
              create: vi.fn()
            }
          },
          store
        }
      )

      expect(result.kind).toBe("redirect")
      if (result.kind === "redirect") {
        expect(result.sessionId).toBe(newSessionId)
      }
      expect(vi.mocked(store.create)).toHaveBeenCalledWith(
        newSessionId,
        expect.objectContaining({ tenantId: "springfield" })
      )
      expect(vi.mocked(store.create)).not.toHaveBeenCalledWith(oldSessionId, expect.anything())
      expect(initiate).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: newSessionId, setupOutcome: "create" }),
        expect.anything()
      )
    })
  })

  describe("SSR recovery signal vs generic OIDC", () => {
    it("includes /inactivity in the Proxy matcher for the recovery shell", () => {
      expect(proxyConfig.matcher).toEqual(["/", "/inactivity", "/auth/callback"])
    })
  })
})
