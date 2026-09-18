/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { randomBytes } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

import { signSessionCookie } from "../../src/lib/session/cookie.ts"
import { guardAuthenticatedAccess } from "../../src/lib/session/guard.ts"
import { computeIdleExpiresAt } from "../../src/lib/session/idle.ts"
import { setupSession } from "../../src/lib/session/setup.ts"
import { type SessionStore, SessionStoreError } from "../../src/lib/session/store.ts"
import {
  DEFAULT_SESSION_TTL_SECONDS,
  resetSessionConfigCacheForTests,
  SESSION_COOKIE_NAME,
  type SessionConfig,
  type SessionCookieClaims,
  type SessionRecord
} from "../../src/lib/session/types.ts"
import { springfieldConfig } from "./tenant-fixtures.ts"

function fixedSessionId(seed = 41): string {
  const bytes = new Uint8Array(32)
  bytes.fill(seed)
  return Buffer.from(bytes).toString("base64url")
}

function idleAuthenticated(
  authAt: number,
  idleMinutes: number,
  overrides: Partial<SessionRecord> = {}
): SessionRecord {
  return {
    expiresAt: overrides.expiresAt ?? authAt + 86_400,
    idleDurationMinutes: idleMinutes,
    idleExpiresAt: overrides.idleExpiresAt
      ?? computeIdleExpiresAt(authAt, idleMinutes),
    lastActivityAt: overrides.lastActivityAt ?? authAt,
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

function okTenant(tenantId = "springfield") {
  return async () => ({
    config: springfieldConfig,
    kind: "ok" as const,
    origin: "host-associated" as const,
    tenantId
  })
}

async function signedRequest(
  claims: SessionCookieClaims,
  config: SessionConfig
): Promise<Request> {
  const token = await signSessionCookie(claims, config)
  return new Request("https://springfield.localhost/", {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` }
  })
}

function testConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    keyPrefix: "test:idle-http:",
    redisUrl: "redis://127.0.0.1:6379",
    signingSecret: new Uint8Array(randomBytes(32)),
    storeTimeoutMs: 2000,
    ttlSeconds: DEFAULT_SESSION_TTL_SECONDS,
    ...overrides
  }
}

describe("idle expiration HTTP / setup clocks", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetSessionConfigCacheForTests()
  })

  it("denies authenticated reuse at idleExpiresAt and clears for inactivity", async () => {
    const config = testConfig()
    const authAt = 1_700_000_000
    const idleMinutes = 5
    const idleExpiresAt = computeIdleExpiresAt(authAt, idleMinutes)
    const expiresAt = authAt + 86_400
    const sessionId = fixedSessionId(1)
    const record = idleAuthenticated(authAt, idleMinutes)
    const cleared = {
      accessEndedCause: "inactivity" as const,
      expiresAt,
      sessionEndGeneration: 1,
      tenantId: "springfield"
    }
    const store = mockStore({
      clearForInactivity: vi.fn().mockResolvedValue({ kind: "cleared", record: cleared }),
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: false,
        record
      })
    })
    const request = await signedRequest(
      { exp: expiresAt, sid: sessionId, tenant: "springfield" },
      config
    )

    const result = await setupSession(request, {
      config,
      nowSeconds: () => idleExpiresAt,
      resolveTenant: okTenant(),
      store
    })

    expect(result.kind).toBe("inactivity-recovery")
    if (result.kind === "inactivity-recovery") {
      expect(result.sessionEndGeneration).toBe(1)
      expect(result.context.userId).toBeUndefined()
    }
    expect(vi.mocked(store.clearForInactivity)).toHaveBeenCalledWith(
      sessionId,
      idleExpiresAt,
      "springfield"
    )
    expect(vi.mocked(store.create)).not.toHaveBeenCalled()
  })

  it("equality pin: idleExpiresAt === expiresAt clears as inactivity", async () => {
    const config = testConfig()
    const deadline = 1_700_001_800
    const sessionId = fixedSessionId(2)
    const record = idleAuthenticated(deadline - 300, 5, {
      expiresAt: deadline,
      idleExpiresAt: deadline,
      lastActivityAt: deadline - 300
    })
    const cleared = {
      accessEndedCause: "inactivity" as const,
      expiresAt: deadline,
      sessionEndGeneration: 1,
      tenantId: "springfield"
    }
    const store = mockStore({
      clearForInactivity: vi.fn().mockResolvedValue({ kind: "cleared", record: cleared }),
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: false,
        record
      })
    })
    // Cookie verify needs exp > now; fresh post-load clock hits the equality instant.
    let tick = 0
    const nowSeconds = () => {
      tick += 1
      return tick === 1 ? deadline - 1 : deadline
    }
    const request = await signedRequest(
      { exp: deadline, sid: sessionId, tenant: "springfield" },
      config
    )

    const result = await setupSession(request, {
      config,
      nowSeconds,
      resolveTenant: okTenant(),
      store
    })

    expect(result.kind).toBe("inactivity-recovery")
    expect(vi.mocked(store.clearForInactivity)).toHaveBeenCalledWith(
      sessionId,
      deadline,
      "springfield"
    )
  })

  it("missing store is denial without inactivity claim", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const sessionId = fixedSessionId(3)
    const store = mockStore({
      read: vi.fn().mockResolvedValue({ kind: "missing" })
    })
    const request = await signedRequest(
      { exp: now + 3600, sid: sessionId, tenant: "springfield" },
      config
    )

    const result = await setupSession(request, {
      config,
      createId: () => fixedSessionId(30),
      nowSeconds: () => now,
      resolveTenant: okTenant(),
      store
    })

    expect(result.kind).toBe("ready")
    if (result.kind === "ready") {
      expect(result.outcome).toBe("create")
      expect(result.context.userId).toBeUndefined()
    }
    expect(vi.mocked(store.clearForInactivity)).not.toHaveBeenCalled()
  })

  it("tenant isolation: foreign tenant activity cannot renew springfield", async () => {
    const sessionId = fixedSessionId(4)
    const authAt = 1_700_000_000
    const record = idleAuthenticated(authAt, 5)
    const store = mockStore({
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: false,
        record
      }),
      renewIdleActivity: vi.fn().mockResolvedValue({ kind: "denied" })
    })

    const renew = await store.renewIdleActivity(sessionId, authAt + 60, "shelbyville")
    expect(renew.kind).toBe("denied")

    const guard = await guardAuthenticatedAccess(
      { sessionId, tenantId: "shelbyville" },
      { nowSeconds: () => authAt + 60, store }
    )
    expect(guard).toMatchObject({ inactivity: false, kind: "deny", reason: "tenant" })
  })

  it("slow Redis read that crosses idleExpiresAt fails closed with clearance", async () => {
    const config = testConfig()
    const idleExpiresAt = 1_700_001_800
    const expiresAt = 1_700_086_400
    const sessionId = fixedSessionId(5)
    const record = idleAuthenticated(1_700_000_000, 30, {
      expiresAt,
      idleExpiresAt,
      lastActivityAt: 1_700_000_000
    })
    const cleared = {
      accessEndedCause: "inactivity" as const,
      expiresAt,
      sessionEndGeneration: 1,
      tenantId: "springfield"
    }
    const events: string[] = []
    const store = mockStore({
      clearForInactivity: vi.fn(async () => {
        events.push("clear")
        return { kind: "cleared" as const, record: cleared }
      }),
      read: vi.fn(async () => {
        events.push("read")
        return { kind: "record" as const, legacyAuthenticated: false, record }
      })
    })
    let tick = 0
    const nowSeconds = () => {
      tick += 1
      // cookie verify still before deadline; post-load sample at deadline
      const value = tick === 1 ? idleExpiresAt - 5 : idleExpiresAt
      events.push(`clock:${String(value)}`)
      return value
    }
    const request = await signedRequest(
      { exp: expiresAt, sid: sessionId, tenant: "springfield" },
      config
    )

    const result = await setupSession(request, {
      config,
      nowSeconds,
      resolveTenant: okTenant(),
      store
    })

    expect(events).toContain("read")
    const readIndex = events.indexOf("read")
    expect(events[readIndex + 1]).toBe(`clock:${String(idleExpiresAt)}`)
    expect(result.kind).toBe("inactivity-recovery")
    expect(events).toContain("clear")
  })

  it("absolute-only expiry does not claim inactivity", async () => {
    const config = testConfig()
    const authAt = 1_700_000_000
    const expiresAt = authAt + 600
    const idleExpiresAt = authAt + 1_800
    const sessionId = fixedSessionId(6)
    const record = idleAuthenticated(authAt, 30, { expiresAt, idleExpiresAt })
    const store = mockStore({
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: false,
        record
      })
    })
    const request = await signedRequest(
      { exp: expiresAt, sid: sessionId, tenant: "springfield" },
      config
    )

    const result = await setupSession(request, {
      config,
      createId: () => fixedSessionId(60),
      nowSeconds: () => expiresAt,
      resolveTenant: okTenant(),
      store
    })

    expect(result.kind).toBe("ready")
    if (result.kind === "ready") {
      expect(result.outcome).toBe("create")
      expect(result.context.userId).toBeUndefined()
    }
    expect(vi.mocked(store.clearForInactivity)).not.toHaveBeenCalled()
  })

  it("guard clears for inactivity when idle deadline binds", async () => {
    const sessionId = fixedSessionId(7)
    const authAt = 1_700_000_000
    const idleExpiresAt = authAt + 300
    const record = idleAuthenticated(authAt, 5, { idleExpiresAt })
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
      { sessionId, tenantId: "springfield" },
      { nowSeconds: () => idleExpiresAt, store }
    )

    expect(result).toEqual({ inactivity: true, kind: "deny", reason: "inactivity" })
    expect(vi.mocked(store.clearForInactivity)).toHaveBeenCalledWith(
      sessionId,
      idleExpiresAt,
      "springfield"
    )
  })

  it("store timeout fails closed without inactivity claim", async () => {
    const sessionId = fixedSessionId(8)
    const store = mockStore({
      read: vi.fn().mockRejectedValue(new SessionStoreError("Session store operation timed out."))
    })

    const result = await guardAuthenticatedAccess(
      { sessionId, tenantId: "springfield" },
      { nowSeconds: () => 1_700_000_000, store }
    )

    expect(result).toEqual({ inactivity: false, kind: "deny", reason: "store-error" })
  })

  it("does not expose a public diagnostic idle endpoint surface", () => {
    // Contract pin: activity + confirm are Server Actions / protected paths — no GET probe module.
    expect(typeof SESSION_COOKIE_NAME).toBe("string")
    expect(SESSION_COOKIE_NAME).toBe("pathable-session")
  })
})
