/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { SignJWT } from "jose"
import { randomBytes } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SessionStore } from "../../src/lib/session/store.ts"

import { signSessionCookie, verifySessionCookie } from "../../src/lib/session/cookie.ts"
import { setupSession } from "../../src/lib/session/setup.ts"
import {
  cookieAttributes,
  SESSION_CONTEXT_HEADER,
  SESSION_COOKIE_NAME,
  type SessionConfig,
  type SessionCookieClaims,
  TENANT_ORIGIN_HEADER,
  TENANT_SLUG_HEADER
} from "../../src/lib/session/types.ts"
import { springfieldConfig } from "./tenant-fixtures.ts"

function fixedSessionId(seed = 2): string {
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

function signingSecretBytes(): Uint8Array {
  return new Uint8Array(randomBytes(32))
}

function testConfig(secret = signingSecretBytes()): SessionConfig {
  return {
    keyPrefix: "test:response:",
    redisUrl: "redis://127.0.0.1:6379",
    signingSecret: secret,
    storeTimeoutMs: 2000,
    ttlSeconds: 86_400
  }
}

describe("session response helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("cookieAttributes", () => {
    it("derives Expires from exp and omits Domain", () => {
      const expiresAt = 1_700_000_000
      const devAttributes = cookieAttributes(expiresAt, false)
      const prodAttributes = cookieAttributes(expiresAt, true)

      expect(devAttributes.secure).toBe(false)
      expect(prodAttributes.secure).toBe(true)
      expect(devAttributes.expires.getTime()).toBe(expiresAt * 1000)
      expect(Object.keys(devAttributes)).not.toContain("domain")
    })
  })

  describe("signSessionCookie / verifySessionCookie", () => {
    it("round-trips sid, tenant, and future exp claims", async () => {
      const secret = signingSecretBytes()
      const config = testConfig(secret)
      const now = 1_700_000_000
      const claims: SessionCookieClaims = {
        exp: now + 3600,
        sid: fixedSessionId(),
        tenant: "springfield"
      }

      const token = await signSessionCookie(claims, config)
      const verified = await verifySessionCookie(token, config, now)

      expect(verified).toEqual(claims)
    })

    it("rejects expired tokens at exp equality with zero clock tolerance", async () => {
      const secret = signingSecretBytes()
      const config = testConfig(secret)
      const exp = 1_700_000_000
      const token = await signSessionCookie({
        exp,
        sid: fixedSessionId(),
        tenant: "springfield"
      }, config)

      expect(await verifySessionCookie(token, config, exp)).toBeUndefined()
      expect(await verifySessionCookie(token, config, exp + 1)).toBeUndefined()
    })

    it("rejects unexpected application claims", async () => {
      const secret = signingSecretBytes()
      const config = testConfig(secret)
      const now = 1_700_000_000
      const token = await new SignJWT({
        admin: true,
        sid: fixedSessionId(),
        tenant: "springfield"
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setExpirationTime(now + 3600)
        .sign(secret)

      expect(await verifySessionCookie(token, config, now)).toBeUndefined()
    })

    it("rejects wrong claim types and invalid session ids", async () => {
      const secret = signingSecretBytes()
      const config = testConfig(secret)
      const now = 1_700_000_000

      const badSid = await new SignJWT({ sid: "too-short", tenant: "springfield" })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setExpirationTime(now + 3600)
        .sign(secret)
      expect(await verifySessionCookie(badSid, config, now)).toBeUndefined()

      const badTenant = await new SignJWT({ sid: fixedSessionId(), tenant: "  " })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setExpirationTime(now + 3600)
        .sign(secret)
      expect(await verifySessionCookie(badTenant, config, now)).toBeUndefined()
    })

    it("rejects invalid signatures and unsupported algorithms", async () => {
      const secret = signingSecretBytes()
      const config = testConfig(secret)
      const now = 1_700_000_000
      const otherSecret = signingSecretBytes()

      const token = await signSessionCookie({
        exp: now + 3600,
        sid: fixedSessionId(),
        tenant: "springfield"
      }, config)

      expect(await verifySessionCookie(`${token}x`, config, now)).toBeUndefined()
      expect(await verifySessionCookie(token, { signingSecret: otherSecret }, now)).toBeUndefined()

      const noneAlg = await new SignJWT({ sid: fixedSessionId(), tenant: "springfield" })
        .setProtectedHeader({ alg: "HS384", typ: "JWT" })
        .setExpirationTime(now + 3600)
        .sign(secret)
      expect(await verifySessionCookie(noneAlg, config, now)).toBeUndefined()
    })
  })

  describe("setupSession response isolation", () => {
    const now = 1_700_000_000

    it("ignores forged session context and tenant headers", async () => {
      const store = mockStore()
      const request = new Request("https://springfield.localhost/", {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=not-a-valid-token`,
          [SESSION_CONTEXT_HEADER]: JSON.stringify({
            expiresAt: now + 999_999,
            sessionId: fixedSessionId(99),
            tenantId: "forged-tenant"
          }),
          [TENANT_ORIGIN_HEADER]: "host-associated",
          [TENANT_SLUG_HEADER]: "forged-tenant"
        }
      })

      const result = await setupSession(request, {
        config: testConfig(),
        createId: () => fixedSessionId(10),
        nowSeconds: () => now,
        resolveTenant: async () => ({
          config: springfieldConfig,
          kind: "ok",
          origin: "host-associated",
          tenantId: "springfield"
        }),
        store
      })

      expect(result.kind).toBe("ready")
      if (result.kind === "ready") {
        expect(result.context.tenantId).toBe("springfield")
        expect(result.context.sessionId).toBe(fixedSessionId(10))
      }
    })

    it("treats duplicate cookie names as absent", async () => {
      const store = mockStore()
      const secret = signingSecretBytes()
      const config = testConfig(secret)
      const validToken = await signSessionCookie({
        exp: now + 3600,
        sid: fixedSessionId(),
        tenant: "springfield"
      }, config)

      const request = new Request("https://springfield.localhost/", {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${validToken}; ${SESSION_COOKIE_NAME}=duplicate`
        }
      })

      const result = await setupSession(request, {
        config,
        createId: () => fixedSessionId(11),
        nowSeconds: () => now,
        resolveTenant: async () => ({
          config: springfieldConfig,
          kind: "ok",
          origin: "host-associated",
          tenantId: "springfield"
        }),
        store
      })

      expect(vi.mocked(store.read)).not.toHaveBeenCalled()
      expect(result.kind).toBe("ready")
      if (result.kind === "ready") {
        expect(result.outcome).toBe("create")
      }
    })

    it("returns terminal outcomes without cookie values", async () => {
      for (
        const outcome of [
          {
            resolveTenant: async () => ({ kind: "unknown" as const }),
            status: 403 as const
          },
          {
            resolveTenant: async () => ({
              kind: "config-error" as const,
              message: "Tenant config unavailable."
            }),
            status: 500 as const
          }
        ]
      ) {
        const result = await setupSession(new Request("https://springfield.localhost/"), {
          config: testConfig(),
          nowSeconds: () => now,
          resolveTenant: outcome.resolveTenant,
          store: mockStore()
        })

        expect(result).toMatchObject({
          kind: "terminal",
          outcome: String(outcome.status),
          status: outcome.status
        })
        expect(result.kind === "terminal" && result).not.toHaveProperty("cookieValue")
      }
    })
  })
})
