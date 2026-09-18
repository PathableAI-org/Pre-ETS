import { randomBytes } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SessionConfig, SessionRecord } from "../../src/lib/session/types.ts"

import { OidcTxConfigError } from "../../src/lib/oidc/types.ts"
import { signSessionCookie } from "../../src/lib/session/cookie.ts"
import {
  applyLoginAgainCookies,
  isLoginAgainConfigError,
  loadLoginAgainRuntime
} from "../../src/lib/session/login-again-runtime.ts"
import { loginAgain, mapInitiationToLoginAgain } from "../../src/lib/session/login-again.ts"
import { type SessionStore, SessionStoreError } from "../../src/lib/session/store.ts"
import { SessionConfigError } from "../../src/lib/session/types.ts"
import { config as proxyConfig } from "../../src/proxy.ts"
import { springfieldRecord } from "./tenant-fixtures.ts"

function fixedSessionId(seed = 21): string {
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

function testConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    keyPrefix: "test:login-again:",
    redisUrl: "redis://127.0.0.1:6379",
    signingSecret: new Uint8Array(randomBytes(32)),
    storeTimeoutMs: 200,
    ttlSeconds: 86_400,
    ...overrides
  }
}

describe("loginAgain rotation", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("mints a new sessionId, leaves the old Redis key untouched, and initiates OIDC on the new sid", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const oldSessionId = fixedSessionId(11)
    const newSessionId = fixedSessionId(12)
    const tombstone: SessionRecord = {
      accessEndedCause: "inactivity",
      expiresAt: now + 86_400,
      sessionEndGeneration: 3,
      tenantId: "springfield"
    }
    const create = vi.fn().mockResolvedValue({ kind: "created" })
    const store = mockStore({
      create,
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: false,
        record: tombstone
      })
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
      expect(result.location).toBe("https://idp.example/authorize")
    }
    expect(create).toHaveBeenCalledWith(
      newSessionId,
      expect.objectContaining({
        expiresAt: now + 86_400,
        tenantId: "springfield"
      })
    )
    expect(create).not.toHaveBeenCalledWith(oldSessionId, expect.anything())
    expect(initiate).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: newSessionId,
        setupOutcome: "create",
        tenantId: "springfield"
      }),
      expect.anything()
    )
  })

  it("returns unavailable when the session cookie is missing", async () => {
    const result = await loginAgain(
      {
        cookieValue: undefined,
        nowSeconds: 1_700_000_000,
        origin: "https://springfield.localhost",
        tenantId: "springfield",
        tenantRecord: springfieldRecord
      },
      {
        initiateDeps: {
          store: { consume: vi.fn(), create: vi.fn() }
        },
        store: mockStore()
      }
    )
    expect(result).toEqual({ kind: "unavailable" })
  })

  it("returns unavailable when cookie tenant does not match the resolved tenant", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const cookieValue = await signSessionCookie(
      { exp: now + 86_400, sid: fixedSessionId(1), tenant: "springfield" },
      config
    )
    const result = await loginAgain(
      {
        cookieValue,
        nowSeconds: now,
        origin: "https://shelbyville.localhost",
        tenantId: "shelbyville",
        tenantRecord: {
          ...springfieldRecord,
          slug: "shelbyville"
        }
      },
      {
        config,
        initiateDeps: {
          store: { consume: vi.fn(), create: vi.fn() }
        },
        store: mockStore()
      }
    )
    expect(result).toEqual({ kind: "unavailable" })
  })

  it("retries once on Redis create collision then succeeds", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const firstId = fixedSessionId(20)
    const secondId = fixedSessionId(21)
    const create = vi.fn()
      .mockResolvedValueOnce({ kind: "collision" })
      .mockResolvedValueOnce({ kind: "created" })
    const createId = vi.fn()
      .mockReturnValueOnce(firstId)
      .mockReturnValueOnce(secondId)
    const cookieValue = await signSessionCookie(
      { exp: now + 86_400, sid: fixedSessionId(19), tenant: "springfield" },
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
        createId,
        initiate,
        initiateDeps: {
          store: { consume: vi.fn(), create: vi.fn() }
        },
        store: mockStore({ create })
      }
    )

    expect(result.kind).toBe("redirect")
    if (result.kind === "redirect") {
      expect(result.sessionId).toBe(secondId)
    }
    expect(create).toHaveBeenCalledTimes(2)
  })

  it("returns unavailable when the session store throws SessionStoreError", async () => {
    const config = testConfig()
    const now = 1_700_000_000
    const cookieValue = await signSessionCookie(
      { exp: now + 86_400, sid: fixedSessionId(30), tenant: "springfield" },
      config
    )
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
        createId: () => fixedSessionId(31),
        initiateDeps: {
          store: { consume: vi.fn(), create: vi.fn() }
        },
        store: mockStore({
          create: vi.fn().mockRejectedValue(new SessionStoreError("down"))
        })
      }
    )
    expect(result).toEqual({ kind: "unavailable" })
  })

  it("maps initiation outcomes without carrying tombstone fields", () => {
    expect(
      mapInitiationToLoginAgain(
        {
          expiresAt: 100,
          kind: "redirect",
          location: "https://idp.example",
          oidcCookieValue: "oidc",
          outcomeClass: "redirect"
        },
        "session-cookie",
        200,
        "new-sid"
      )
    ).toEqual({
      expiresAt: 100,
      kind: "redirect",
      location: "https://idp.example",
      oidcCookieValue: "oidc",
      sessionCookieValue: "session-cookie",
      sessionExpiresAt: 200,
      sessionId: "new-sid"
    })
    expect(
      mapInitiationToLoginAgain(
        { kind: "login-unavailable", outcomeClass: "login-unavailable" },
        "c",
        1,
        "sid"
      )
    ).toEqual({ kind: "login-unavailable" })
    expect(
      mapInitiationToLoginAgain(
        { kind: "config-refusal", outcomeClass: "403-config" },
        "c",
        1,
        "sid"
      )
    ).toEqual({ kind: "config-refusal" })
  })

  it("keeps Proxy matcher on document and callback routes (no SSR inactivity shell)", () => {
    expect(proxyConfig.matcher).toEqual(["/", "/auth/callback"])
  })

  it("classifies recoverable config errors for login-again runtime", () => {
    expect(isLoginAgainConfigError(new SessionConfigError("missing"))).toBe(true)
    expect(isLoginAgainConfigError(new OidcTxConfigError("missing"))).toBe(true)
    expect(isLoginAgainConfigError(new Error("other"))).toBe(false)
  })

  it("returns undefined from loadLoginAgainRuntime when session config throws", async () => {
    const types = await import("../../src/lib/session/types.ts")
    const spy = vi.spyOn(types, "getSessionConfig").mockImplementation(() => {
      throw new SessionConfigError("missing session config")
    })
    try {
      expect(loadLoginAgainRuntime({ oidcStore: undefined, sessionStore: undefined })).toBeUndefined()
    } finally {
      spy.mockRestore()
    }
  })

  it("applies rotated session and oidc cookies on redirect", () => {
    const set = vi.fn()
    applyLoginAgainCookies(
      { set },
      {
        expiresAt: 10,
        kind: "redirect",
        location: "https://idp.example",
        oidcCookieValue: "oidc",
        sessionCookieValue: "session",
        sessionExpiresAt: 20,
        sessionId: "sid"
      },
      {
        cookieAttributes: (exp, secure) => ({
          expires: new Date(exp * 1000),
          httpOnly: true,
          path: "/",
          sameSite: "lax",
          secure
        }),
        development: true,
        oidcCookieAttributes: (exp, secure) => ({
          expires: new Date(exp * 1000),
          httpOnly: true,
          path: "/",
          sameSite: "lax",
          secure
        }),
        oidcCookieName: "pathable-oidc",
        sessionCookieName: "pathable-session"
      }
    )
    expect(set).toHaveBeenCalledTimes(2)
    expect(set).toHaveBeenCalledWith(
      "pathable-session",
      "session",
      expect.objectContaining({ httpOnly: true, path: "/", sameSite: "lax", secure: false })
    )
    expect(set).toHaveBeenCalledWith(
      "pathable-oidc",
      "oidc",
      expect.objectContaining({ httpOnly: true, path: "/", sameSite: "lax", secure: false })
    )
  })
})
