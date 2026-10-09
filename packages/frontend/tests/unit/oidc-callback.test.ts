import type { Configuration } from "openid-client"

import { randomBytes } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { CompleteLoginDeps } from "../../src/lib/oidc/callback.ts"
import type { OidcTransactionStore } from "../../src/lib/oidc/transaction.ts"
import type { SessionStore } from "../../src/lib/session/store.ts"
let { completeLogin } = await import("../../src/lib/oidc/callback.ts")

let { signOidcCorrelationCookie } = await import("../../src/lib/oidc/cookie.ts")

import type { OidcTransactionRecord, OidcTxConfig } from "../../src/lib/oidc/types.ts"

let { SessionStoreError } = await import("../../src/lib/session/store.ts")

import { shelbyvilleRecord, springfieldRecord } from "./tenant-fixtures.ts"

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
    clearForInactivity: vi.fn().mockResolvedValue({ kind: "denied" }),
    create: vi.fn().mockResolvedValue({ kind: "created" }),
    read: vi.fn().mockResolvedValue({
      kind: "record",
      legacyAuthenticated: false,
      record: { expiresAt: NOW + 86_400, tenantId: "springfield" }
    }),
    renewIdleActivity: vi.fn().mockResolvedValue({ kind: "denied" }),
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
    ttlSeconds: 600,
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
  afterEach(async () => {
    vi.restoreAllMocks()
    await reloadModules()
  })

  it.each([
    { claims: { name: "Demo User", preferred_username: "demo", sub: "user-sub" }, userName: "Demo User" },
    { claims: { name: " ", preferred_username: "demo", sub: "user-sub" }, userName: "demo" },
    { claims: { preferred_username: " ", sub: "user-sub" }, userName: "user-sub" }
  ])("authenticates with display name $userName and redirects home", async ({ claims, userName }) => {
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
            claims: () => claims,
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
      idleDurationMinutes: 30,
      idleExpiresAt: NOW + 30 * 60,
      lastActivityAt: NOW,
      tenantId: "springfield",
      userId: "user-sub",
      userName
    })
  })

  it("stamps idle duration from tenant effective policy without extending absolute expiry", async () => {
    const txConfig = testTxConfig()
    const cookie = await signOidcCorrelationCookie(
      { exp: NOW + 600, state: STATE, tenant: "springfield" },
      txConfig
    )
    const update = vi.fn().mockResolvedValue({ kind: "updated" })
    const absoluteExpiresAt = NOW + 12_000
    const sessionStore = mockSessionStore({
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: false,
        record: { expiresAt: absoluteExpiresAt, tenantId: "springfield" }
      }),
      update
    })

    await completeLogin(
      {
        nowSeconds: NOW,
        request: documentCallback(
          `https://springfield.localhost/auth/callback?code=auth-code&state=${STATE}`,
          `pathable-oidc=${cookie}`
        ),
        tenantId: "springfield",
        tenantRecord: {
          config: {
            displayName: "Springfield Demo",
            idleTimeoutMinutes: 7,
            oidc: springfieldRecord.config.oidc
          },
          slug: "springfield"
        }
      },
      {
        authorizationCodeGrant: (() =>
          Promise.resolve({
            access_token: "access",
            claims: () => ({ name: "Demo User", sub: "user-sub" }),
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
        store: mockTxStore({
          consume: vi.fn().mockResolvedValue({ kind: "record", record: txRecord() })
        }),
        txConfig
      }
    )

    expect(update).toHaveBeenCalledWith(SESSION_ID, {
      expiresAt: absoluteExpiresAt,
      idleDurationMinutes: 7,
      idleExpiresAt: NOW + 7 * 60,
      lastActivityAt: NOW,
      tenantId: "springfield",
      userId: "user-sub",
      userName: "Demo User"
    })
  })

  it("isolates Springfield vs Shelbyville idle policy at auth stamp", async () => {
    const txConfig = testTxConfig()
    const cookie = await signOidcCorrelationCookie(
      { exp: NOW + 600, state: STATE, tenant: "shelbyville" },
      txConfig
    )
    const update = vi.fn().mockResolvedValue({ kind: "updated" })
    const sessionStore = mockSessionStore({
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: false,
        record: { expiresAt: NOW + 86_400, tenantId: "shelbyville" }
      }),
      update
    })

    await completeLogin(
      {
        nowSeconds: NOW,
        request: documentCallback(
          `https://shelbyville.localhost/auth/callback?code=auth-code&state=${STATE}`,
          `pathable-oidc=${cookie}`
        ),
        tenantId: "shelbyville",
        tenantRecord: {
          config: {
            displayName: "Shelbyville Demo",
            idleTimeoutMinutes: 20,
            oidc: shelbyvilleRecord.config.oidc
          },
          slug: "shelbyville"
        }
      },
      {
        authorizationCodeGrant: (() =>
          Promise.resolve({
            access_token: "access",
            claims: () => ({ name: "Shelby User", sub: "shelby-sub" }),
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
        store: mockTxStore({
          consume: vi.fn().mockResolvedValue({
            kind: "record",
            record: txRecord({
              clientId: "shelbyville-web",
              connection: "shelbyville-idp",
              redirectUri: "https://shelbyville.localhost/auth/callback",
              tenantId: "shelbyville"
            })
          })
        }),
        txConfig
      }
    )

    expect(update).toHaveBeenCalledWith(SESSION_ID, {
      expiresAt: NOW + 86_400,
      idleDurationMinutes: 20,
      idleExpiresAt: NOW + 20 * 60,
      lastActivityAt: NOW,
      tenantId: "shelbyville",
      userId: "shelby-sub",
      userName: "Shelby User"
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

async function reloadModules(): Promise<void> {
  vi.resetModules()
  ;({ completeLogin } = await import("../../src/lib/oidc/callback.ts"))
  ;({ signOidcCorrelationCookie } = await import("../../src/lib/oidc/cookie.ts"))
  ;({ SessionStoreError } = await import("../../src/lib/session/store.ts"))
}
