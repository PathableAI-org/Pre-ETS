/* eslint-disable @typescript-eslint/unbound-method */
import type { AddressInfo } from "node:net"

import { exportJWK, generateKeyPair, type JWK, SignJWT } from "jose"
import { randomBytes } from "node:crypto"
import http from "node:http"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { OidcTransactionStore } from "../../src/lib/oidc/transaction.ts"
import type { SessionStore } from "../../src/lib/session/store.ts"
import type { TenantRecord } from "../../src/lib/tenant/types.ts"

import { completeLogin } from "../../src/lib/oidc/callback.ts"
import { signOidcCorrelationCookie } from "../../src/lib/oidc/cookie.ts"
import { resetOidcDiscoveryCacheForTests } from "../../src/lib/oidc/discovery.ts"
import {
  DEFAULT_OIDC_TX_TTL_SECONDS,
  type OidcTransactionRecord,
  type OidcTxConfig,
  resetOidcTxConfigCacheForTests
} from "../../src/lib/oidc/types.ts"

const NOW = Math.floor(Date.now() / 1000)
const SESSION_ID = Buffer.from(new Uint8Array(32).fill(11)).toString("base64url")
const STATE = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM"
const NONCE = "callback-http-nonce-value-001"
const CODE_VERIFIER = "pkce-code-verifier-for-http-callback-test"

interface MockIdp {
  readonly close: () => Promise<void>
  readonly issuer: string
  readonly privateKey: CryptoKey
  readonly publicJwk: JWK
}

describe("completeLogin HTTP callback with mock IdP", () => {
  let mockIdp: MockIdp | undefined

  beforeEach(() => {
    resetOidcDiscoveryCacheForTests()
    resetOidcTxConfigCacheForTests()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    resetOidcDiscoveryCacheForTests()
    resetOidcTxConfigCacheForTests()
    if (mockIdp !== undefined) {
      await mockIdp.close()
      mockIdp = undefined
    }
  })

  it("exchanges authorization code against a mock IdP and authenticates the session", async () => {
    mockIdp = await startMockIdp()
    const tenantRecord = springfieldTenant(mockIdp.issuer)
    const txConfig = testTxConfig()
    const cookie = await signOidcCorrelationCookie(
      { exp: NOW + 600, state: STATE, tenant: "springfield" },
      txConfig
    )
    const sessionStore = mockSessionStore()
    const store = mockTxStore({
      consume: vi.fn().mockResolvedValue({
        kind: "record",
        record: txRecord(mockIdp.issuer)
      })
    })

    const callbackUrl = `https://springfield.localhost/auth/callback?code=mock-auth-code&state=${STATE}`
    const result = await completeLogin(
      {
        nowSeconds: NOW,
        request: new Request(callbackUrl, {
          headers: {
            accept: "text/html",
            cookie: `pathable-oidc=${cookie}`,
            "sec-fetch-dest": "document"
          }
        }),
        tenantId: "springfield",
        tenantRecord
      },
      {
        sessionStore,
        store,
        txConfig
      }
    )

    expect(result).toEqual({
      kind: "redirect",
      location: "https://springfield.localhost/",
      outcomeClass: "callback-success"
    })
    expect(vi.mocked(store.consume)).toHaveBeenCalledWith(STATE)
    expect(vi.mocked(sessionStore.update)).toHaveBeenCalledWith(SESSION_ID, {
      expiresAt: NOW + 86_400,
      tenantId: "springfield",
      userId: "mock-user-sub",
      userName: "Mock Demo User"
    })
  })
})

function mockSessionStore(): SessionStore {
  return {
    create: vi.fn().mockResolvedValue({ kind: "created" }),
    read: vi.fn().mockResolvedValue({
      kind: "record",
      record: { expiresAt: NOW + 86_400, tenantId: "springfield" }
    }),
    update: vi.fn().mockResolvedValue({ kind: "updated" })
  }
}

function mockTxStore(overrides: Partial<OidcTransactionStore> = {}): OidcTransactionStore {
  return {
    consume: vi.fn().mockResolvedValue({ kind: "missing" }),
    create: vi.fn().mockResolvedValue({ kind: "unavailable" }),
    ...overrides
  }
}

function springfieldTenant(issuer: string): TenantRecord {
  return {
    config: {
      displayName: "Springfield Demo",
      oidc: {
        clientAuth: "public",
        clientId: "springfield-web",
        connection: "springfield-idp",
        issuer
      }
    },
    slug: "springfield"
  }
}

async function startMockIdp(): Promise<MockIdp> {
  const { privateKey, publicKey } = await generateKeyPair("RS256")
  const publicJwk = await exportJWK(publicKey)
  publicJwk.alg = "RS256"
  publicJwk.kid = "mock-callback-key"
  publicJwk.use = "sig"

  const state: { issuer: string } = { issuer: "" }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")

    if (url.pathname.endsWith("/.well-known/openid-configuration")) {
      const body = JSON.stringify({
        authorization_endpoint: `${state.issuer}/protocol/openid-connect/auth`,
        code_challenge_methods_supported: ["S256"],
        id_token_signing_alg_values_supported: ["RS256"],
        issuer: state.issuer,
        jwks_uri: `${state.issuer}/protocol/openid-connect/certs`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        token_endpoint: `${state.issuer}/protocol/openid-connect/token`
      })
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(body)
      return
    }

    if (url.pathname.endsWith("/protocol/openid-connect/certs")) {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ keys: [publicJwk] }))
      return
    }

    if (url.pathname.endsWith("/protocol/openid-connect/token") && req.method === "POST") {
      void (async () => {
        const chunks: Uint8Array[] = []
        for await (const chunk of req) {
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : new Uint8Array(chunk))
        }
        const body = Buffer.concat(chunks).toString("utf8")
        const params = new URLSearchParams(body)
        if (params.get("code") !== "mock-auth-code") {
          res.writeHead(400, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: "invalid_grant" }))
          return
        }

        if (params.get("code_verifier") !== CODE_VERIFIER) {
          res.writeHead(400, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: "invalid_grant" }))
          return
        }

        const idToken = await new SignJWT({
          name: "Mock Demo User",
          nonce: NONCE,
          preferred_username: "mockdemo",
          sub: "mock-user-sub"
        })
          .setProtectedHeader({ alg: "RS256", kid: "mock-callback-key", typ: "JWT" })
          .setIssuer(state.issuer)
          .setAudience("springfield-web")
          .setIssuedAt(NOW)
          .setExpirationTime(NOW + 3600)
          .sign(privateKey)

        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({
          access_token: "mock-access-token",
          expires_in: 3600,
          id_token: idToken,
          token_type: "Bearer"
        }))
      })()
      return
    }

    res.writeHead(404)
    res.end("not found")
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      resolve()
    })
  })

  const address = server.address() as AddressInfo
  state.issuer = `http://127.0.0.1:${String(address.port)}/realms/pre-ets`

  return {
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        })
      })
    },
    issuer: state.issuer,
    privateKey,
    publicJwk
  }
}

function testTxConfig(): OidcTxConfig {
  return {
    keyPrefix: "test:oidc-tx-http:",
    signingSecret: new Uint8Array(randomBytes(32)),
    storeTimeoutMs: 2000,
    ttlSeconds: DEFAULT_OIDC_TX_TTL_SECONDS
  }
}

function txRecord(issuer: string): OidcTransactionRecord {
  return {
    clientId: "springfield-web",
    codeVerifier: CODE_VERIFIER,
    connection: "springfield-idp",
    expiresAt: NOW + 600,
    issuer,
    nonce: NONCE,
    redirectUri: "https://springfield.localhost/auth/callback",
    sessionId: SESSION_ID,
    tenantId: "springfield"
  }
}
