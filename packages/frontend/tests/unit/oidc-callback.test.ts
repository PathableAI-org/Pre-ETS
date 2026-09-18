import type { Configuration } from "openid-client"

import { randomBytes } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { CompleteLoginDeps } from "../../src/lib/oidc/callback.ts"
import type { OidcTransactionStore } from "../../src/lib/oidc/transaction.ts"
import type { SessionStore } from "../../src/lib/session/store.ts"

import { completeLogin, extractDisplayName } from "../../src/lib/oidc/callback.ts"
import { signOidcCorrelationCookie } from "../../src/lib/oidc/cookie.ts"
import { resetOidcDiscoveryCacheForTests } from "../../src/lib/oidc/discovery.ts"
import {
  DEFAULT_OIDC_TX_TTL_SECONDS,
  type OidcTransactionRecord,
  type OidcTxConfig,
  resetOidcTxConfigCacheForTests
} from "../../src/lib/oidc/types.ts"
import { SessionStoreError } from "../../src/lib/session/store.ts"
import { springfieldRecord } from "./tenant-fixtures.ts"

const NOW = 1_700_000_000
const SESSION_ID = Buffer.from(new Uint8Array(32).fill(9)).toString("base64url")
const STATE = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM"

function documentCallback(url: string, cookie?: string): Request {
  const parsed = new URL(url)
  const headers: Record<string, string> = {
    accept: "text/html",
    host: parsed.host,
    "sec-fetch-dest": "document"
  }
  if (cookie !== undefined) {
    headers.cookie = cookie
  }

  return new Request(url, { headers })
}

function mockSessionStore(overrides: Partial<SessionStore> = {}): SessionStore {
  return {
    create: vi.fn().mockResolvedValue({ kind: "created" }),
    read: vi.fn().mockResolvedValue({
      kind: "record",
      record: { expiresAt: NOW + 86_400, tenantId: "springfield" }
    }),
    update: vi.fn().mockResolvedValue({ kind: "updated" }),
    ...overrides
  }
}

function mockTxStore(overrides: Partial<OidcTransactionStore> = {}): OidcTransactionStore {
  return {
    consume: vi.fn().mockResolvedValue({ kind: "missing" }),
    create: vi.fn().mockResolvedValue({ kind: "unavailable" }),
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

function txRecord(overrides: Partial<OidcTransactionRecord> = {}): OidcTransactionRecord {
  return {
    clientId: "springfield-web",
    codeVerifier: "pkce-verifier-value",
    connection: "springfield-idp",
    expiresAt: NOW + 600,
    issuer: "https://identity.example/realms/pre-ets",
    nonce: "nonce-value",
    redirectUri: "https://springfield.localhost/auth/callback",
    sessionId: SESSION_ID,
    tenantId: "springfield",
    ...overrides
  }
}

describe("completeLogin", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetOidcTxConfigCacheForTests()
    resetOidcDiscoveryCacheForTests()
  })

  describe("extractDisplayName", () => {
    it("prefers name, then preferred_username, then sub", () => {
      expect(extractDisplayName({ name: "Ada", preferred_username: "ada", sub: "1" })).toBe("Ada")
      expect(extractDisplayName({ preferred_username: "ada", sub: "1" })).toBe("ada")
      expect(extractDisplayName({ sub: "1" })).toBe("1")
      expect(extractDisplayName({})).toBeUndefined()
    })
  })

  it("authenticates the session on happy path and redirects home", async () => {
    const txConfig = testTxConfig()
    const cookie = await signOidcCorrelationCookie(
      { exp: NOW + 600, state: STATE, tenant: "springfield" },
      txConfig
    )
    const update = vi.fn().mockResolvedValue({ kind: "updated" })
    const sessionStore = mockSessionStore({ update })
    const consume = vi.fn().mockResolvedValue({ kind: "record", record: txRecord() })
    const store = mockTxStore({ consume })

    const result = await completeLogin(
      {
        nowSeconds: NOW,
        request: documentCallback(
          `https://springfield.localhost/auth/callback?code=auth-code&state=${STATE}`,
          `pathable-oidc=${cookie}`
        ),
        tenantId: "springfield",
        tenantRecord: springfieldRecord
      },
      {
        authorizationCodeGrant: (() =>
          Promise.resolve({
            access_token: "access",
            claims: () => ({
              name: "Demo User",
              sub: "user-sub"
            }),
            expiresIn: () => 3600,
            token_type: "bearer"
          })) as unknown as NonNullable<CompleteLoginDeps["authorizationCodeGrant"]>,
        discover: () =>
          Promise.resolve({
            authorizationEndpoint: "https://identity.example/auth",
            configuration: {} as Configuration
          }),
        resolveSecret: () => ({ kind: "none" }),
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
    expect(consume).toHaveBeenCalledWith(STATE)
    expect(update).toHaveBeenCalledWith(SESSION_ID, {
      expiresAt: NOW + 86_400,
      tenantId: "springfield",
      userId: "user-sub",
      userName: "Demo User"
    })
  })

  it("fails closed when correlation cookie is missing", async () => {
    const result = await completeLogin(
      {
        nowSeconds: NOW,
        request: documentCallback(
          `https://springfield.localhost/auth/callback?code=auth-code&state=${STATE}`
        ),
        tenantId: "springfield",
        tenantRecord: springfieldRecord
      },
      {
        sessionStore: mockSessionStore(),
        store: mockTxStore(),
        txConfig: testTxConfig()
      }
    )

    expect(result).toEqual({
      kind: "login-unavailable",
      outcomeClass: "login-unavailable"
    })
  })

  it("fails closed on state mismatch between cookie and query", async () => {
    const txConfig = testTxConfig()
    const cookie = await signOidcCorrelationCookie(
      { exp: NOW + 600, state: STATE, tenant: "springfield" },
      txConfig
    )

    const result = await completeLogin(
      {
        nowSeconds: NOW,
        request: documentCallback(
          "https://springfield.localhost/auth/callback?code=auth-code&state=differentstatevalue012345678901234",
          `pathable-oidc=${cookie}`
        ),
        tenantId: "springfield",
        tenantRecord: springfieldRecord
      },
      {
        sessionStore: mockSessionStore(),
        store: mockTxStore({
          consume: vi.fn().mockResolvedValue({ kind: "record", record: txRecord() })
        }),
        txConfig
      }
    )

    expect(result).toEqual({
      kind: "login-unavailable",
      outcomeClass: "login-unavailable"
    })
  })

  it("fails closed when Host-derived callback URI does not match tx.redirectUri", async () => {
    const txConfig = testTxConfig()
    const cookie = await signOidcCorrelationCookie(
      { exp: NOW + 600, state: STATE, tenant: "springfield" },
      txConfig
    )
    const grant = vi.fn()

    const result = await completeLogin(
      {
        nowSeconds: NOW,
        request: documentCallback(
          `https://attacker.example/auth/callback?code=auth-code&state=${STATE}`,
          `pathable-oidc=${cookie}`
        ),
        tenantId: "springfield",
        tenantRecord: springfieldRecord
      },
      {
        authorizationCodeGrant: grant,
        discover: () =>
          Promise.resolve({
            authorizationEndpoint: "https://identity.example/auth",
            configuration: {} as Configuration
          }),
        resolveSecret: () => ({ kind: "none" }),
        sessionStore: mockSessionStore(),
        store: mockTxStore({
          consume: vi.fn().mockResolvedValue({ kind: "record", record: txRecord() })
        }),
        txConfig
      }
    )

    expect(result).toEqual({
      kind: "login-unavailable",
      outcomeClass: "login-unavailable"
    })
    expect(grant).not.toHaveBeenCalled()
  })

  it("fails closed on bad nonce from token exchange", async () => {
    const txConfig = testTxConfig()
    const cookie = await signOidcCorrelationCookie(
      { exp: NOW + 600, state: STATE, tenant: "springfield" },
      txConfig
    )

    const result = await completeLogin(
      {
        nowSeconds: NOW,
        request: documentCallback(
          `https://springfield.localhost/auth/callback?code=auth-code&state=${STATE}`,
          `pathable-oidc=${cookie}`
        ),
        tenantId: "springfield",
        tenantRecord: springfieldRecord
      },
      {
        authorizationCodeGrant: () => Promise.reject(new Error("nonce mismatch")),
        discover: () =>
          Promise.resolve({
            authorizationEndpoint: "https://identity.example/auth",
            configuration: {} as Configuration
          }),
        resolveSecret: () => ({ kind: "none" }),
        sessionStore: mockSessionStore(),
        store: mockTxStore({
          consume: vi.fn().mockResolvedValue({ kind: "record", record: txRecord() })
        }),
        txConfig
      }
    )

    expect(result).toEqual({
      kind: "login-unavailable",
      outcomeClass: "login-unavailable"
    })
  })

  it("refuses tenant mismatch between resolved tenant and transaction", async () => {
    const txConfig = testTxConfig()
    const cookie = await signOidcCorrelationCookie(
      { exp: NOW + 600, state: STATE, tenant: "springfield" },
      txConfig
    )

    const result = await completeLogin(
      {
        nowSeconds: NOW,
        request: documentCallback(
          `https://springfield.localhost/auth/callback?code=auth-code&state=${STATE}`,
          `pathable-oidc=${cookie}`
        ),
        tenantId: "springfield",
        tenantRecord: springfieldRecord
      },
      {
        sessionStore: mockSessionStore(),
        store: mockTxStore({
          consume: vi.fn().mockResolvedValue({
            kind: "record",
            record: txRecord({ tenantId: "shelbyville" })
          })
        }),
        txConfig
      }
    )

    expect(result).toEqual({
      kind: "login-unavailable",
      outcomeClass: "login-unavailable"
    })
  })

  it("fails closed when session store update throws", async () => {
    const txConfig = testTxConfig()
    const cookie = await signOidcCorrelationCookie(
      { exp: NOW + 600, state: STATE, tenant: "springfield" },
      txConfig
    )

    const result = await completeLogin(
      {
        nowSeconds: NOW,
        request: documentCallback(
          `https://springfield.localhost/auth/callback?code=auth-code&state=${STATE}`,
          `pathable-oidc=${cookie}`
        ),
        tenantId: "springfield",
        tenantRecord: springfieldRecord
      },
      {
        authorizationCodeGrant: (() =>
          Promise.resolve({
            access_token: "access",
            claims: () => ({ sub: "user-sub" }),
            expiresIn: () => 3600,
            token_type: "bearer"
          })) as unknown as NonNullable<CompleteLoginDeps["authorizationCodeGrant"]>,
        discover: () =>
          Promise.resolve({
            authorizationEndpoint: "https://identity.example/auth",
            configuration: {} as Configuration
          }),
        resolveSecret: () => ({ kind: "none" }),
        sessionStore: mockSessionStore({
          update: vi.fn().mockRejectedValue(new SessionStoreError("Session store unavailable."))
        }),
        store: mockTxStore({
          consume: vi.fn().mockResolvedValue({ kind: "record", record: txRecord() })
        }),
        txConfig
      }
    )

    expect(result).toEqual({
      kind: "login-unavailable",
      outcomeClass: "login-unavailable"
    })
  })
})
