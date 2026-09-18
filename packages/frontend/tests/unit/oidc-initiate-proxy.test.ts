/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import type { Configuration } from "openid-client"

import { randomBytes } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { OidcTransactionStore } from "../../src/lib/oidc/transaction.ts"

import { isDocumentNavigation } from "../../src/lib/oidc/document-navigation.ts"
import { extendedForbiddenBody } from "../../src/lib/oidc/forbidden-body.ts"
import { initiateLogin } from "../../src/lib/oidc/initiate.ts"
import {
  approvedApplicationOrigin,
  isAuthCallbackPath,
  sessionCookieForRedirect
} from "../../src/lib/oidc/initiation-http.ts"
import { OidcSecretsConfigError } from "../../src/lib/oidc/secrets.ts"
import {
  DEFAULT_OIDC_TX_TTL_SECONDS,
  type OidcTxConfig,
  resetOidcTxConfigCacheForTests
} from "../../src/lib/oidc/types.ts"
import { config as proxyConfig } from "../../src/proxy.ts"
import { springfieldConfig, springfieldRecord } from "./tenant-fixtures.ts"

const NOW = 1_700_000_000
const SESSION_ID = Buffer.from(new Uint8Array(32).fill(9)).toString("base64url")
const VERIFIER = "pkce-verifier-must-never-appear-in-location"

function documentRequest(url = "https://springfield.localhost/"): Request {
  return new Request(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "sec-fetch-dest": "document"
    }
  })
}

function mockTxStore(
  overrides: Partial<OidcTransactionStore> = {}
): OidcTransactionStore {
  return {
    consume: vi.fn().mockResolvedValue({ kind: "missing" }),
    create: vi.fn().mockResolvedValue({
      kind: "created",
      state: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM"
    }),
    ...overrides
  }
}

function signingSecretBytes(): Uint8Array {
  return new Uint8Array(randomBytes(32))
}

function testTxConfig(overrides: Partial<OidcTxConfig> = {}): OidcTxConfig {
  return {
    keyPrefix: "test:oidc-tx:",
    signingSecret: signingSecretBytes(),
    storeTimeoutMs: 2000,
    ttlSeconds: DEFAULT_OIDC_TX_TTL_SECONDS,
    ...overrides
  }
}

describe("OIDC initiate / proxy contracts", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetOidcTxConfigCacheForTests()
  })

  describe("matcher and callback exclusion", () => {
    it("matches / and /auth/callback", () => {
      expect(proxyConfig.matcher).toEqual(["/", "/auth/callback"])
    })

    it("identifies /auth/callback for Proxy completion (not initiation)", () => {
      expect(isAuthCallbackPath("/auth/callback")).toBe(true)
      expect(isAuthCallbackPath("/")).toBe(false)
      expect(isAuthCallbackPath("/login-unavailable")).toBe(false)
    })
  })

  describe("approvedApplicationOrigin", () => {
    it("builds origin from Host header and request scheme", () => {
      expect(
        approvedApplicationOrigin(
          "springfield.localhost:3000",
          new URL("https://springfield.localhost:3000/"),
          { development: false }
        )
      ).toBe("https://springfield.localhost:3000")
    })

    it("ignores a divergent nextUrl host when Host is trusted", () => {
      expect(
        approvedApplicationOrigin(
          "springfield.pathable.com",
          new URL("https://attacker.example/"),
          { development: false }
        )
      ).toBe("https://springfield.pathable.com")
    })

    it("rejects non-loopback http outside development", () => {
      expect(
        approvedApplicationOrigin(
          "springfield.pathable.com",
          new URL("http://springfield.pathable.com/"),
          { development: false }
        )
      ).toBeUndefined()
    })

    it("allows loopback http", () => {
      expect(
        approvedApplicationOrigin(
          "localhost:3000",
          new URL("http://localhost:3000/"),
          { development: false }
        )
      ).toBe("http://localhost:3000")
    })

    it("rejects non-loopback hosts in static tenant mode", () => {
      expect(
        approvedApplicationOrigin(
          "springfield.localhost:3000",
          new URL("https://springfield.localhost:3000/"),
          { development: true, tenantOrigin: "local-static" }
        )
      ).toBeUndefined()
      expect(
        approvedApplicationOrigin(
          "localhost:3000",
          new URL("http://localhost:3000/"),
          { development: true, tenantOrigin: "local-static" }
        )
      ).toBe("http://localhost:3000")
    })
  })

  describe("authenticated short-circuit predicate", () => {
    it("treats userId on session context as the sole initiation skip signal", () => {
      const anonymous = {
        expiresAt: NOW + 3600,
        sessionId: SESSION_ID,
        tenantId: "springfield",
        userId: undefined as string | undefined
      }
      const authenticated = {
        ...anonymous,
        userId: "user-sub",
        userName: "Demo User"
      }

      expect(authenticated.userId).toBeDefined()
      expect(anonymous.userId).toBeUndefined()
    })
  })

  describe("isDocumentNavigation (E4)", () => {
    it("treats Sec-Fetch-Dest document as document navigation", () => {
      expect(
        isDocumentNavigation(
          new Request("https://springfield.localhost/", {
            headers: { "sec-fetch-dest": "document" }
          })
        )
      ).toBe(true)
    })

    it("treats Accept text/html without RSC/router headers as document", () => {
      expect(
        isDocumentNavigation(
          new Request("https://springfield.localhost/", {
            headers: { accept: "text/html" }
          })
        )
      ).toBe(true)
    })

    it("rejects RSC and router prefetch signals", () => {
      expect(
        isDocumentNavigation(
          new Request("https://springfield.localhost/", {
            headers: { accept: "text/html", rsc: "1" }
          })
        )
      ).toBe(false)
      expect(
        isDocumentNavigation(
          new Request("https://springfield.localhost/", {
            headers: { accept: "text/html", "next-router-prefetch": "1" }
          })
        )
      ).toBe(false)
    })
  })

  describe("session cookie mapping", () => {
    it("sets pathable-session only for successful create redirects", () => {
      expect(sessionCookieForRedirect("create", "session-jwt")).toBe("session-jwt")
      expect(sessionCookieForRedirect("create", undefined)).toBeUndefined()
      expect(sessionCookieForRedirect("reuse", "session-jwt")).toBeUndefined()
      expect(sessionCookieForRedirect("reuse", undefined)).toBeUndefined()
    })
  })

  describe("extended forbidden body", () => {
    it("explains login cannot start with a next action and no secrets", () => {
      const body = extendedForbiddenBody()
      expect(body).toContain("Login cannot start")
      expect(body).toContain("Contact your administrator")
      expect(body).toContain("href=\"/\"")
      expect(body).not.toContain("Access denied.")
      expect(body).not.toContain("client_secret")
      expect(body).not.toContain("code_verifier")
    })
  })

  describe("initiateLogin", () => {
    it("redirects with authorization URL omitting PKCE verifier and secrets", async () => {
      const location = "https://identity.example/realms/pre-ets/protocol/openid-connect/auth"
        + "?client_id=springfield-web"
        + "&code_challenge=challenge"
        + "&code_challenge_method=S256"
        + "&nonce=nonce-value"
        + "&redirect_uri=https%3A%2F%2Fspringfield.localhost%2Fauth%2Fcallback"
        + "&response_type=code"
        + "&scope=openid"
        + "&state=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM"
        + "&kc_idp_hint=springfield-idp"

      const store = mockTxStore()
      const result = await initiateLogin(
        {
          nowSeconds: NOW,
          origin: "https://springfield.localhost",
          sessionId: SESSION_ID,
          setupOutcome: "create",
          tenantId: "springfield",
          tenantRecord: springfieldRecord
        },
        {
          buildAuthorizationUrl: () => new URL(location),
          calculatePKCECodeChallenge: async () => "challenge",
          discover: async () => ({
            authorizationEndpoint: "https://identity.example/auth",
            configuration: {} as Configuration
          }),
          randomNonce: () => "nonce-value",
          randomPKCECodeVerifier: () => VERIFIER,
          resolveSecret: () => ({ kind: "none" }),
          signCookie: async () => "oidc-cookie",
          store,
          txConfig: testTxConfig()
        }
      )

      expect(result.kind).toBe("redirect")
      if (result.kind === "redirect") {
        expect(result.location).toBe(location)
        expect(result.location).not.toContain(VERIFIER)
        expect(result.location).not.toContain("code_verifier")
        expect(result.oidcCookieValue).toBe("oidc-cookie")
        expect(result.expiresAt).toBe(NOW + DEFAULT_OIDC_TX_TTL_SECONDS)
      }

      expect(vi.mocked(store.create)).toHaveBeenCalledTimes(1)
      const record = vi.mocked(store.create).mock.calls[0]?.[1]
      expect(record?.codeVerifier).toBe(VERIFIER)
      expect(record?.redirectUri).toBe("https://springfield.localhost/auth/callback")
    })

    it("ignores caller query overrides for issuer/client/connection/return host", async () => {
      const request = documentRequest(
        "https://springfield.localhost/?issuer=https://evil.example&client_id=other&connection=other&return=https://evil.example"
      )

      const result = await initiateLogin(
        {
          nowSeconds: NOW,
          origin: "https://springfield.localhost",
          sessionId: SESSION_ID,
          setupOutcome: "reuse",
          tenantId: "springfield",
          tenantRecord: springfieldRecord
        },
        {
          buildAuthorizationUrl: (_cfg, params) => {
            const url = new URL("https://identity.example/auth")
            const entries = params instanceof URLSearchParams
              ? [...params.entries()]
              : Object.entries(params)
            for (const [key, value] of entries) {
              url.searchParams.set(key, value)
            }
            return url
          },
          calculatePKCECodeChallenge: async () => "c",
          discover: async (issuer, clientId) => {
            expect(issuer).toBe(springfieldConfig.oidc.issuer)
            expect(clientId).toBe(springfieldConfig.oidc.clientId)
            expect(request.url).toContain("evil.example")
            return {
              authorizationEndpoint: "https://identity.example/auth",
              configuration: {} as Configuration
            }
          },
          randomNonce: () => "n",
          randomPKCECodeVerifier: () => VERIFIER,
          resolveSecret: () => ({ kind: "none" }),
          signCookie: async () => "oidc-cookie",
          store: mockTxStore(),
          txConfig: testTxConfig()
        }
      )

      expect(result.kind).toBe("redirect")
      if (result.kind === "redirect") {
        const url = new URL(result.location)
        expect(url.searchParams.get("redirect_uri")).toBe(
          "https://springfield.localhost/auth/callback"
        )
        expect(url.searchParams.get("kc_idp_hint")).toBe("springfield-idp")
        expect(url.searchParams.get("code_challenge_method")).toBe("S256")
        expect(url.href).not.toContain("evil.example")
        expect(result.location).not.toContain(VERIFIER)
      }
    })

    it("returns config-refusal without redirect when confidential secret is missing", async () => {
      const result = await initiateLogin(
        {
          nowSeconds: NOW,
          origin: "https://springfield.localhost",
          sessionId: SESSION_ID,
          setupOutcome: "create",
          tenantId: "springfield",
          tenantRecord: {
            config: {
              displayName: "Springfield Demo",
              oidc: {
                ...springfieldConfig.oidc,
                clientAuth: "confidential"
              }
            },
            slug: "springfield"
          }
        },
        {
          resolveSecret: () => ({ kind: "config-refusal" }),
          store: mockTxStore()
        }
      )

      expect(result).toEqual({ kind: "config-refusal", outcomeClass: "403-config" })
    })

    it("maps malformed secrets to process-config", async () => {
      const result = await initiateLogin(
        {
          nowSeconds: NOW,
          origin: "https://springfield.localhost",
          sessionId: SESSION_ID,
          setupOutcome: "create",
          tenantId: "springfield",
          tenantRecord: springfieldRecord
        },
        {
          resolveSecret: () => {
            throw new OidcSecretsConfigError("OIDC_CLIENT_SECRETS_JSON must be valid JSON.")
          },
          store: mockTxStore()
        }
      )

      expect(result).toEqual({ kind: "process-config", outcomeClass: "process-config" })
    })

    it("maps discovery and transaction failures to login-unavailable", async () => {
      const discoveryFailure = await initiateLogin(
        {
          nowSeconds: NOW,
          origin: "https://springfield.localhost",
          sessionId: SESSION_ID,
          setupOutcome: "reuse",
          tenantId: "springfield",
          tenantRecord: springfieldRecord
        },
        {
          discover: async () => {
            throw new Error("discovery failed")
          },
          resolveSecret: () => ({ kind: "none" }),
          store: mockTxStore()
        }
      )
      expect(discoveryFailure).toEqual({
        kind: "login-unavailable",
        outcomeClass: "login-unavailable"
      })

      const txFailure = await initiateLogin(
        {
          nowSeconds: NOW,
          origin: "https://springfield.localhost",
          sessionId: SESSION_ID,
          setupOutcome: "create",
          tenantId: "springfield",
          tenantRecord: springfieldRecord
        },
        {
          calculatePKCECodeChallenge: async () => "challenge",
          discover: async () => ({
            authorizationEndpoint: "https://identity.example/auth",
            configuration: {} as Configuration
          }),
          randomNonce: () => "nonce",
          randomPKCECodeVerifier: () => VERIFIER,
          resolveSecret: () => ({ kind: "none" }),
          store: mockTxStore({
            create: vi.fn().mockResolvedValue({ kind: "unavailable" })
          }),
          txConfig: testTxConfig()
        }
      )
      expect(txFailure).toEqual({
        kind: "login-unavailable",
        outcomeClass: "login-unavailable"
      })
    })
  })
})
