import { afterEach, describe, expect, it, vi } from "vitest"

import type { SessionStore } from "../../src/lib/session/store.ts"

import { computeIdleExpiresAt, DEFAULT_IDLE_DURATION_MINUTES } from "../../src/lib/session/idle.ts"
import { resolveRequestSession } from "../../src/lib/session/request-session.ts"
import { serializeSessionContext, type SessionContext, type SessionRecord } from "../../src/lib/session/types.ts"
import { RedirectError, UnauthorizedError } from "./next-navigation-stub.ts"

const { springfieldConfig } = vi.hoisted(() => ({
  springfieldConfig: {
    displayName: "Springfield Demo",
    oidc: {
      clientAuth: "public" as const,
      clientId: "springfield-web",
      connection: "springfield-idp",
      issuer: "https://identity.example/realms/pre-ets"
    }
  }
}))

vi.mock("../../src/lib/tenant/index.ts", () => ({
  getCurrentTenantConfig: vi.fn().mockResolvedValue(springfieldConfig)
}))

function fixedSessionId(seed = 1): string {
  const bytes = new Uint8Array(32)
  bytes.fill(seed)
  return Buffer.from(bytes).toString("base64url")
}

function idleRecord(): SessionRecord & {
  readonly idleExpiresAt: number
} {
  const lastActivityAt = 1_700_000_000
  const idleExpiresAt = computeIdleExpiresAt(lastActivityAt, DEFAULT_IDLE_DURATION_MINUTES)
  return {
    expiresAt: lastActivityAt + 86_400,
    idleDurationMinutes: DEFAULT_IDLE_DURATION_MINUTES,
    idleExpiresAt,
    lastActivityAt,
    tenantId: "springfield",
    userId: "user-1",
    userName: "Demo User"
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

describe("resolveRequestSession", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("allows idle-shaped authenticated header after Redis re-read", async () => {
    const record = idleRecord()
    const sessionId = fixedSessionId(1)
    const context: SessionContext = {
      expiresAt: record.expiresAt,
      idleExpiresAt: record.idleExpiresAt,
      sessionId,
      tenantId: "springfield",
      userId: "stale",
      userName: "Stale"
    }
    const store = mockStore({
      read: vi.fn().mockResolvedValue({
        kind: "record",
        legacyAuthenticated: false,
        record
      })
    })

    const resolved = await resolveRequestSession(serializeSessionContext(context), {
      defaultStore: () => store,
      nowSeconds: () => 1_700_000_060,
      store
    })

    expect(resolved.context.userId).toBe("user-1")
    expect(resolved.tenantConfig.displayName).toBe("Springfield Demo")
  })

  it("fail-closes with unauthorized when cookie header is auth but Redis misses", async () => {
    const record = idleRecord()
    const context: SessionContext = {
      expiresAt: record.expiresAt,
      idleExpiresAt: record.idleExpiresAt,
      sessionId: fixedSessionId(2),
      tenantId: "springfield",
      userId: "user-1",
      userName: "Demo User"
    }

    await expect(
      resolveRequestSession(serializeSessionContext(context), {
        defaultStore: () => mockStore(),
        store: mockStore()
      })
    ).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it("redirects home so Proxy can start login when guard clears for idle", async () => {
    const lastActivityAt = 1_700_000_000
    const idleExpiresAt = lastActivityAt + 300
    const record: SessionRecord = {
      expiresAt: lastActivityAt + 86_400,
      idleDurationMinutes: 5,
      idleExpiresAt,
      lastActivityAt,
      tenantId: "springfield",
      userId: "user-1",
      userName: "Demo User"
    }
    const context: SessionContext = {
      expiresAt: record.expiresAt,
      idleExpiresAt,
      sessionId: fixedSessionId(3),
      tenantId: "springfield",
      userId: "user-1",
      userName: "Demo User"
    }
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

    await expect(
      resolveRequestSession(serializeSessionContext(context), {
        defaultStore: () => store,
        nowSeconds: () => idleExpiresAt,
        store
      })
    ).rejects.toSatisfy((error: unknown) => error instanceof RedirectError && error.url === "/")
  })
})
