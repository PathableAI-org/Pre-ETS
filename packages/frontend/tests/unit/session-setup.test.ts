import { randomBytes } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

import { signSessionCookie } from "../../src/lib/session/cookie.ts"
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

function fixedSessionId(seed = 3): string {
  const bytes = new Uint8Array(32)
  bytes.fill(seed)
  return Buffer.from(bytes).toString("base64url")
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
  return () =>
    Promise.resolve({
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

function signingSecretBytes(): Uint8Array {
  return new Uint8Array(randomBytes(32))
}

function testConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    keyPrefix: "test:setup:",
    redisUrl: "redis://127.0.0.1:6379",
    signingSecret: signingSecretBytes(),
    storeTimeoutMs: 2000,
    ttlSeconds: DEFAULT_SESSION_TTL_SECONDS,
    ...overrides
  }
}

describe("setupSession", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetSessionConfigCacheForTests()
  })

  describe("ordering", () => {
    it("inspects and verifies the cookie before tenant resolution", async () => {
      const config = testConfig()
      const now = 1_700_000_000
      const events: string[] = []
      const read = vi.fn((): Promise<{ kind: "missing" }> => {
        events.push("store.read")
        return Promise.resolve({ kind: "missing" })
      })
      const store = mockStore({ read })

      await setupSession(new Request("https://springfield.localhost/"), {
        config,
        nowSeconds: () => now,
        readCookie: () => {
          events.push("readCookie")
          return undefined
        },
        resolveTenant: () => {
          events.push("resolveTenant")
          return Promise.resolve({
            config: springfieldConfig,
            kind: "ok" as const,
            origin: "host-associated" as const,
            tenantId: "springfield"
          })
        },
        store,
        verifyCookie: () => {
          events.push("verifyCookie")
          return Promise.resolve(undefined)
        }
      })

      expect(events.indexOf("readCookie")).toBeLessThan(events.indexOf("resolveTenant"))
      expect(events.indexOf("verifyCookie")).toBeLessThan(events.indexOf("resolveTenant"))
      expect(read).not.toHaveBeenCalled()
    })

    it("skips Redis read for invalid or absent cookies", async () => {
      const config = testConfig()
      const read = vi.fn().mockResolvedValue({ kind: "missing" })
      const store = mockStore({ read })
      const now = 1_700_000_000

      await setupSession(new Request("https://springfield.localhost/"), {
        config,
        nowSeconds: () => now,
        readCookie: () => "bad-token",
        resolveTenant: okTenant(),
        store,
        verifyCookie: () => Promise.resolve(undefined)
      })

      expect(read).not.toHaveBeenCalled()
    })

    it("returns a cookie only when persistence succeeds on create", async () => {
      const config = testConfig({ ttlSeconds: 3600 })
      const now = 1_700_000_000
      const create = vi.fn().mockResolvedValue({ kind: "created" })
      const store = mockStore({ create })

      const result = await setupSession(new Request("https://springfield.localhost/"), {
        config,
        createId: () => fixedSessionId(20),
        nowSeconds: () => now,
        resolveTenant: okTenant(),
        store
      })

      expect(create).toHaveBeenCalledTimes(1)
      expect(result.kind).toBe("ready")
      if (result.kind === "ready") {
        expect(result.outcome).toBe("create")
        expect(result.cookieValue).toBeTypeOf("string")
        expect(result.context.expiresAt).toBe(now + 3600)
      }
    })

    it("does not issue a cookie when persistence fails", async () => {
      const store = mockStore({
        create: vi.fn().mockRejectedValue(new SessionStoreError("Session store unavailable."))
      })

      const result = await setupSession(new Request("https://springfield.localhost/"), {
        config: testConfig(),
        createId: () => fixedSessionId(21),
        nowSeconds: () => 1_700_000_000,
        resolveTenant: okTenant(),
        store
      })

      expect(result.kind).toBe("terminal")
      expect(result).not.toHaveProperty("cookieValue")
    })
  })

  describe("reuse and create", () => {
    it("reuses a matching live session without issuing a new cookie", async () => {
      const config = testConfig()
      const now = 1_700_000_000
      const expiresAt = now + 3600
      const sessionId = fixedSessionId(30)
      const create = vi.fn().mockResolvedValue({ kind: "created" })
      const store = mockStore({
        create,
        read: vi.fn().mockResolvedValue({
          kind: "record",
          legacyAuthenticated: false,
          record: { expiresAt, tenantId: "springfield" }
        })
      })
      const request = await signedRequest({ exp: expiresAt, sid: sessionId, tenant: "springfield" }, config)

      const result = await setupSession(request, {
        config,
        nowSeconds: () => now,
        resolveTenant: okTenant(),
        store
      })

      expect(result).toEqual({
        config: springfieldConfig,
        context: { expiresAt, sessionId, tenantId: "springfield" },
        kind: "ready",
        origin: "host-associated",
        outcome: "reuse"
      })
      expect(create).not.toHaveBeenCalled()
    })

    it("forwards authenticated idle fields when reusing an idle-shaped session", async () => {
      const config = testConfig()
      const now = 1_700_000_000
      const expiresAt = now + 3600
      const idleExpiresAt = now + 1800
      const sessionId = fixedSessionId(31)
      const store = mockStore({
        read: vi.fn().mockResolvedValue({
          kind: "record",
          legacyAuthenticated: false,
          record: {
            expiresAt,
            idleDurationMinutes: 30,
            idleExpiresAt,
            lastActivityAt: now,
            tenantId: "springfield",
            userId: "user-sub",
            userName: "Demo User"
          }
        })
      })
      const request = await signedRequest({ exp: expiresAt, sid: sessionId, tenant: "springfield" }, config)

      const result = await setupSession(request, {
        config,
        nowSeconds: () => now,
        resolveTenant: okTenant(),
        store
      })

      expect(result).toEqual({
        config: springfieldConfig,
        context: {
          expiresAt,
          idleExpiresAt,
          sessionId,
          tenantId: "springfield",
          userId: "user-sub",
          userName: "Demo User"
        },
        kind: "ready",
        origin: "host-associated",
        outcome: "reuse"
      })
    })

    it("rejects legacy four-key authenticated records (Phase A dual-read)", async () => {
      const config = testConfig()
      const now = 1_700_000_000
      const expiresAt = now + 3600
      const sessionId = fixedSessionId(32)
      const createId = vi.fn(() => fixedSessionId(33))
      const store = mockStore({
        read: vi.fn().mockResolvedValue({
          kind: "record",
          legacyAuthenticated: true,
          record: {
            expiresAt,
            tenantId: "springfield",
            userId: "user-sub",
            userName: "Demo User"
          }
        })
      })
      const request = await signedRequest({ exp: expiresAt, sid: sessionId, tenant: "springfield" }, config)

      const result = await setupSession(request, {
        config,
        createId,
        nowSeconds: () => now,
        resolveTenant: okTenant(),
        store
      })

      expect(result.kind).toBe("ready")
      if (result.kind === "ready") {
        expect(result.outcome).toBe("create")
        expect(result.context.userId).toBeUndefined()
      }
      expect(createId).toHaveBeenCalled()
    })

    it("rejects authenticated records missing idle fields even when not marked legacy", async () => {
      const config = testConfig()
      const now = 1_700_000_000
      const expiresAt = now + 3600
      const sessionId = fixedSessionId(36)
      const createId = vi.fn(() => fixedSessionId(37))
      const store = mockStore({
        read: vi.fn().mockResolvedValue({
          kind: "record",
          // Parser would set legacyAuthenticated for true four-key JSON; defend the reuse path.
          legacyAuthenticated: false,
          record: {
            expiresAt,
            tenantId: "springfield",
            userId: "user-sub",
            userName: "Demo User"
          }
        })
      })
      const request = await signedRequest({ exp: expiresAt, sid: sessionId, tenant: "springfield" }, config)

      const result = await setupSession(request, {
        config,
        createId,
        nowSeconds: () => now,
        resolveTenant: okTenant(),
        store
      })

      expect(result.kind).toBe("ready")
      if (result.kind === "ready") {
        expect(result.outcome).toBe("create")
        expect(result.context.userId).toBeUndefined()
      }
      expect(createId).toHaveBeenCalled()
    })

    it("samples a fresh clock after Redis load before authenticated reuse", async () => {
      const config = testConfig()
      const idleExpiresAt = 1_700_001_800
      const expiresAt = 1_700_086_400
      const sessionId = fixedSessionId(35)
      const record = {
        expiresAt,
        idleDurationMinutes: 30,
        idleExpiresAt,
        lastActivityAt: 1_700_000_000,
        tenantId: "springfield",
        userId: "user-sub",
        userName: "Demo User"
      }
      const events: string[] = []
      const clearForInactivity = vi.fn().mockResolvedValue({ kind: "denied" })
      const create = vi.fn().mockResolvedValue({ kind: "created" })
      const store = mockStore({
        clearForInactivity,
        create,
        read: vi.fn(() => {
          events.push("store.read")
          return Promise.resolve({ kind: "record" as const, legacyAuthenticated: false, record })
        })
      })
      let tick = 0
      const nowSeconds = () => {
        tick += 1
        // tick 1: cookie verify (still before idle)
        // tick 2: fresh post-load sample for authenticated check (at idle → force create)
        // later ticks: createFreshSession absolute expiry
        const value = tick === 1 ? idleExpiresAt - 10 : idleExpiresAt
        events.push(`clock:${String(value)}`)
        return value
      }
      const request = await signedRequest(
        { exp: expiresAt, sid: sessionId, tenant: "springfield" },
        config
      )

      const result = await setupSession(request, {
        config,
        createId: () => fixedSessionId(38),
        nowSeconds,
        resolveTenant: okTenant(),
        store
      })

      expect(events[0]).toBe("clock:1700001790")
      expect(events).toContain("store.read")
      const readIndex = events.indexOf("store.read")
      expect(events[readIndex + 1]).toBe("clock:1700001800")
      expect(result.kind).toBe("ready")
      if (result.kind === "ready") {
        expect(result.outcome).toBe("create")
        expect(result.context.sessionId).toBe(fixedSessionId(38))
      }
      // Phase B: idle clearance writes inactivity tombstone, then forces fresh create.
      expect(clearForInactivity).toHaveBeenCalledWith(
        sessionId,
        idleExpiresAt,
        "springfield"
      )
      expect(create).toHaveBeenCalledWith(
        fixedSessionId(38),
        expect.objectContaining({ tenantId: "springfield" })
      )
    })

    it("creates once per request with clock-controlled TTL alignment", async () => {
      const config = testConfig({ ttlSeconds: 7200 })
      const now = 1_700_000_000
      const createId = vi.fn(() => fixedSessionId(40))
      const create = vi.fn().mockResolvedValue({ kind: "created" })
      const store = mockStore({ create })

      const result = await setupSession(new Request("https://springfield.localhost/"), {
        config,
        createId,
        nowSeconds: () => now,
        resolveTenant: okTenant(),
        store
      })

      expect(createId).toHaveBeenCalledTimes(1)
      expect(create).toHaveBeenCalledTimes(1)
      expect(create).toHaveBeenCalledWith(fixedSessionId(40), {
        expiresAt: now + 7200,
        tenantId: "springfield"
      })
      expect(result.kind).toBe("ready")
      if (result.kind === "ready") {
        expect(result.outcome).toBe("create")
        expect(result.context.expiresAt).toBe(now + 7200)
        expect(result.cookieValue).toBeTypeOf("string")
      }
    })

    it("retries once on create collision then succeeds", async () => {
      const config = testConfig()
      const now = 1_700_000_000
      const createId = vi.fn()
        .mockReturnValueOnce(fixedSessionId(50))
        .mockReturnValueOnce(fixedSessionId(51))
      const create = vi.fn()
        .mockResolvedValueOnce({ kind: "collision" })
        .mockResolvedValueOnce({ kind: "created" })
      const store = mockStore({ create })

      const result = await setupSession(new Request("https://springfield.localhost/"), {
        config,
        createId,
        nowSeconds: () => now,
        resolveTenant: okTenant(),
        store
      })

      expect(createId).toHaveBeenCalledTimes(2)
      expect(create).toHaveBeenCalledTimes(2)
      expect(result.kind).toBe("ready")
      if (result.kind === "ready") {
        expect(result.context.sessionId).toBe(fixedSessionId(51))
      }
    })
  })

  describe("recovery and isolation", () => {
    const now = 1_700_000_000

    it.each([
      ["missing cookie", undefined],
      ["invalid cookie", "not-a-jwt"],
      ["expired cookie", "expired"],
      ["missing record", "missing-record"],
      ["expired record", "expired-record"],
      ["tenant mismatch", "tenant-mismatch"]
    ])("recovers from unusable reference: %s", async (_label, scenario) => {
      const config = testConfig()
      const foreignRecord: SessionRecord = {
        expiresAt: now + 7200,
        tenantId: "shelbyville"
      }
      const foreignId = fixedSessionId(60)
      const create = vi.fn().mockResolvedValue({ kind: "created" })
      const read = vi.fn().mockImplementation((id: string) => {
        if (scenario === "missing-record") {
          return Promise.resolve({ kind: "missing" })
        }
        if (id === foreignId) {
          return Promise.resolve({
            kind: "record",
            legacyAuthenticated: false,
            record: foreignRecord
          })
        }
        return Promise.resolve({ kind: "missing" })
      })
      const store = mockStore({ create, read })

      let request: Request
      if (scenario === undefined) {
        request = new Request("https://springfield.localhost/")
      } else if (scenario === "not-a-jwt") {
        request = new Request("https://springfield.localhost/", {
          headers: { cookie: `${SESSION_COOKIE_NAME}=not-a-jwt` }
        })
      } else if (scenario === "expired") {
        request = await signedRequest({
          exp: now - 1,
          sid: foreignId,
          tenant: "springfield"
        }, config)
      } else if (scenario === "missing-record") {
        request = await signedRequest({
          exp: now + 3600,
          sid: fixedSessionId(61),
          tenant: "springfield"
        }, config)
      } else if (scenario === "expired-record") {
        request = await signedRequest({
          exp: now + 3600,
          sid: foreignId,
          tenant: "springfield"
        }, config)
        store.read = vi.fn().mockResolvedValue({
          kind: "record",
          legacyAuthenticated: false,
          record: { expiresAt: now - 1, tenantId: "springfield" }
        })
      } else {
        request = await signedRequest({
          exp: now + 3600,
          sid: foreignId,
          tenant: "springfield"
        }, config)
      }

      const result = await setupSession(request, {
        config,
        createId: () => fixedSessionId(62),
        nowSeconds: () => now,
        resolveTenant: okTenant("springfield"),
        store
      })

      expect(result.kind).toBe("ready")
      if (result.kind === "ready") {
        expect(result.outcome).toBe("create")
        expect(result.context.tenantId).toBe("springfield")
      }
      expect(create).toHaveBeenCalledWith(fixedSessionId(62), {
        expiresAt: now + DEFAULT_SESSION_TTL_SECONDS,
        tenantId: "springfield"
      })
      expect(create).not.toHaveBeenCalledWith(foreignId, expect.anything())
    })

    it("returns 403 for unknown tenants without writing or issuing cookies", async () => {
      const read = vi.fn().mockResolvedValue({ kind: "missing" })
      const create = vi.fn().mockResolvedValue({ kind: "created" })
      const store = mockStore({ create, read })
      const result = await setupSession(new Request("https://unknown.localhost/"), {
        config: testConfig(),
        nowSeconds: () => now,
        resolveTenant: () => Promise.resolve({ kind: "unknown" as const }),
        store
      })

      expect(result).toEqual({
        kind: "terminal",
        message: "Access denied.",
        outcome: "403",
        status: 403
      })
      expect(read).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    })
  })

  describe("terminal failures", () => {
    const now = 1_700_000_000

    it("returns 503 when store read fails", async () => {
      const config = testConfig()
      const sessionId = fixedSessionId(70)
      const store = mockStore({
        read: vi.fn().mockRejectedValue(new SessionStoreError("Session store unavailable."))
      })
      const request = await signedRequest({
        exp: now + 3600,
        sid: sessionId,
        tenant: "springfield"
      }, config)

      const result = await setupSession(request, {
        config,
        nowSeconds: () => now,
        resolveTenant: okTenant(),
        store
      })

      expect(result).toEqual({
        kind: "terminal",
        message: "Service unavailable.",
        outcome: "503",
        status: 503
      })
    })

    it("returns 503 when store create fails", async () => {
      const store = mockStore({
        create: vi.fn().mockRejectedValue(new SessionStoreError("Session store unavailable."))
      })

      const result = await setupSession(new Request("https://springfield.localhost/"), {
        config: testConfig(),
        createId: () => fixedSessionId(71),
        nowSeconds: () => now,
        resolveTenant: okTenant(),
        store
      })

      expect(result).toMatchObject({ kind: "terminal", outcome: "503", status: 503 })
    })

    it("returns 503 after two create collisions", async () => {
      const store = mockStore({
        create: vi.fn().mockResolvedValue({ kind: "collision" })
      })

      const result = await setupSession(new Request("https://springfield.localhost/"), {
        config: testConfig(),
        createId: vi.fn()
          .mockReturnValueOnce(fixedSessionId(72))
          .mockReturnValueOnce(fixedSessionId(73)),
        nowSeconds: () => now,
        resolveTenant: okTenant(),
        store
      })

      expect(result).toMatchObject({
        kind: "terminal",
        message: "Service unavailable.",
        outcome: "503",
        status: 503
      })
    })

    it("returns 500 without a cookie when runtime config is missing", async () => {
      resetSessionConfigCacheForTests()
      vi.stubEnv("REDIS_URL", "")
      vi.stubEnv("SESSION_SIGNING_SECRET", "")

      const result = await setupSession(new Request("https://springfield.localhost/"), {
        resolveTenant: okTenant(),
        store: mockStore()
      })

      expect(result).toEqual({
        kind: "terminal",
        outcome: "500",
        status: 500
      })
      expect(result.kind === "terminal" && result).not.toHaveProperty("cookieValue")
    })

    it("returns 500 without a cookie when injected config is invalid at expiry", async () => {
      const result = await setupSession(new Request("https://springfield.localhost/"), {
        config: testConfig({ ttlSeconds: Number.MAX_SAFE_INTEGER }),
        nowSeconds: () => Number.MAX_SAFE_INTEGER - 1,
        resolveTenant: okTenant(),
        store: mockStore()
      })

      expect(result).toEqual({
        kind: "terminal",
        outcome: "500",
        status: 500
      })
    })
  })
})
