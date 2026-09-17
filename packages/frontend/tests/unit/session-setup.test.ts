/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/unbound-method */
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
    create: vi.fn().mockResolvedValue({ kind: "created" }),
    read: vi.fn().mockResolvedValue({ kind: "missing" }),
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
      const store = mockStore({
        read: vi.fn(async (): Promise<{ kind: "missing" }> => {
          events.push("store.read")
          return { kind: "missing" }
        })
      })

      await setupSession(new Request("https://springfield.localhost/"), {
        config,
        nowSeconds: () => now,
        readCookie: () => {
          events.push("readCookie")
          return undefined
        },
        resolveTenant: async () => {
          events.push("resolveTenant")
          return {
            config: springfieldConfig,
            kind: "ok",
            origin: "host-associated",
            tenantId: "springfield"
          }
        },
        store,
        verifyCookie: async () => {
          events.push("verifyCookie")
          return undefined
        }
      })

      expect(events.indexOf("readCookie")).toBeLessThan(events.indexOf("resolveTenant"))
      expect(events.indexOf("verifyCookie")).toBeLessThan(events.indexOf("resolveTenant"))
      expect(vi.mocked(store.read)).not.toHaveBeenCalled()
    })

    it("skips Redis read for invalid or absent cookies", async () => {
      const config = testConfig()
      const store = mockStore()
      const now = 1_700_000_000

      await setupSession(new Request("https://springfield.localhost/"), {
        config,
        nowSeconds: () => now,
        readCookie: () => "bad-token",
        resolveTenant: okTenant(),
        store,
        verifyCookie: async () => undefined
      })

      expect(vi.mocked(store.read)).not.toHaveBeenCalled()
    })

    it("returns a cookie only when persistence succeeds on create", async () => {
      const config = testConfig({ ttlSeconds: 3600 })
      const now = 1_700_000_000
      const store = mockStore()

      const result = await setupSession(new Request("https://springfield.localhost/"), {
        config,
        createId: () => fixedSessionId(20),
        nowSeconds: () => now,
        resolveTenant: okTenant(),
        store
      })

      expect(vi.mocked(store.create)).toHaveBeenCalledTimes(1)
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
      const store = mockStore({
        read: vi.fn().mockResolvedValue({
          kind: "record",
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
      expect(vi.mocked(store.create)).not.toHaveBeenCalled()
    })

    it("creates once per request with clock-controlled TTL alignment", async () => {
      const config = testConfig({ ttlSeconds: 7200 })
      const now = 1_700_000_000
      const createId = vi.fn(() => fixedSessionId(40))
      const store = mockStore()

      const result = await setupSession(new Request("https://springfield.localhost/"), {
        config,
        createId,
        nowSeconds: () => now,
        resolveTenant: okTenant(),
        store
      })

      expect(createId).toHaveBeenCalledTimes(1)
      expect(vi.mocked(store.create)).toHaveBeenCalledTimes(1)
      expect(vi.mocked(store.create)).toHaveBeenCalledWith(fixedSessionId(40), {
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
      const store = mockStore({
        create: vi.fn()
          .mockResolvedValueOnce({ kind: "collision" })
          .mockResolvedValueOnce({ kind: "created" })
      })

      const result = await setupSession(new Request("https://springfield.localhost/"), {
        config,
        createId,
        nowSeconds: () => now,
        resolveTenant: okTenant(),
        store
      })

      expect(createId).toHaveBeenCalledTimes(2)
      expect(vi.mocked(store.create)).toHaveBeenCalledTimes(2)
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
      const store = mockStore({
        create: vi.fn().mockResolvedValue({ kind: "created" }),
        read: vi.fn().mockImplementation(async (id: string) => {
          if (scenario === "missing-record") {
            return { kind: "missing" }
          }
          if (id === foreignId) {
            return { kind: "record", record: foreignRecord }
          }
          return { kind: "missing" }
        })
      })

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
      expect(vi.mocked(store.create)).toHaveBeenCalledWith(fixedSessionId(62), {
        expiresAt: now + DEFAULT_SESSION_TTL_SECONDS,
        tenantId: "springfield"
      })
      expect(vi.mocked(store.create)).not.toHaveBeenCalledWith(foreignId, expect.anything())
    })

    it("returns 403 for unknown tenants without writing or issuing cookies", async () => {
      const store = mockStore()
      const result = await setupSession(new Request("https://unknown.localhost/"), {
        config: testConfig(),
        nowSeconds: () => now,
        resolveTenant: async () => ({ kind: "unknown" }),
        store
      })

      expect(result).toEqual({
        kind: "terminal",
        message: "Access denied.",
        outcome: "403",
        status: 403
      })
      expect(vi.mocked(store.read)).not.toHaveBeenCalled()
      expect(vi.mocked(store.create)).not.toHaveBeenCalled()
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
