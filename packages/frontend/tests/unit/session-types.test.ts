import { randomBytes } from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"

import {
  absoluteExpirySeconds,
  cookieAttributes,
  DEFAULT_SESSION_KEY_PREFIX,
  DEFAULT_SESSION_STORE_TIMEOUT_MS,
  DEFAULT_SESSION_TTL_SECONDS,
  generateSessionId,
  getSessionConfig,
  isSafeUnixSeconds,
  isSessionId,
  NODE_TIMER_MAX_MS,
  parseSessionConfig,
  parseSessionContextJson,
  parseSessionRecord,
  resetSessionConfigCacheForTests,
  serializeSessionContext,
  serializeSessionRecord,
  SESSION_ID_BYTE_LENGTH,
  SESSION_ID_LENGTH,
  SessionConfigError
} from "../../src/lib/session/types.ts"

function baseEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    REDIS_URL: "redis://127.0.0.1:6379",
    SESSION_SIGNING_SECRET: signingSecret(),
    ...overrides
  }
}

function fixedSessionId(seed = 1): string {
  const bytes = new Uint8Array(SESSION_ID_BYTE_LENGTH)
  bytes.fill(seed)
  return Buffer.from(bytes).toString("base64url")
}

function signingSecret(): string {
  return randomBytes(32).toString("base64url")
}

describe("session types", () => {
  afterEach(() => {
    resetSessionConfigCacheForTests()
  })

  describe("session id", () => {
    it("generates 32 random bytes as unpadded base64url (43 characters)", () => {
      const bytes = new Uint8Array(SESSION_ID_BYTE_LENGTH)
      bytes.fill(0xab)
      const id = generateSessionId(() => bytes)

      expect(id).toHaveLength(SESSION_ID_LENGTH)
      expect(id).toBe(Buffer.from(bytes).toString("base64url"))
      expect(isSessionId(id)).toBe(true)
    })

    it("rejects entropy that is not exactly 32 bytes", () => {
      expect(() => generateSessionId(() => new Uint8Array(31))).toThrow(
        "Session id entropy must be exactly 32 bytes."
      )
    })

    it("validates the base64url session id pattern", () => {
      expect(isSessionId(fixedSessionId())).toBe(true)
      expect(isSessionId("")).toBe(false)
      expect(isSessionId("a".repeat(42))).toBe(false)
      expect(isSessionId("a".repeat(44))).toBe(false)
      expect(isSessionId("invalid+chars/are=rejected!!")).toBe(false)
    })
  })

  describe("session record", () => {
    const now = 1_700_000_000

    it("accepts exact { tenantId, expiresAt } JSON only", () => {
      const record = { expiresAt: now + 3600, tenantId: "springfield" }
      expect(parseSessionRecord(record)).toEqual(record)
      expect(serializeSessionRecord(record)).toBe(JSON.stringify(record))
    })

    it("rejects extra keys, missing keys, wrong types, and empty tenantId", () => {
      expect(parseSessionRecord({ expiresAt: now, extra: 1, tenantId: "springfield" })).toBeUndefined()
      expect(parseSessionRecord({ tenantId: "springfield" })).toBeUndefined()
      expect(parseSessionRecord({ expiresAt: now })).toBeUndefined()
      expect(parseSessionRecord(null)).toBeUndefined()
      expect(parseSessionRecord([])).toBeUndefined()
      expect(parseSessionRecord({ expiresAt: "not-a-number", tenantId: "springfield" })).toBeUndefined()
      expect(parseSessionRecord({ expiresAt: now, tenantId: "" })).toBeUndefined()
      expect(parseSessionRecord({ expiresAt: now, tenantId: "   " })).toBeUndefined()
      expect(parseSessionRecord({ expiresAt: 0, tenantId: "springfield" })).toBeUndefined()
    })
  })

  describe("session context", () => {
    const now = 1_700_000_000

    it("round-trips compact session context JSON", () => {
      const context = {
        expiresAt: now + 3600,
        sessionId: fixedSessionId(),
        tenantId: "springfield"
      }
      expect(parseSessionContextJson(serializeSessionContext(context))).toEqual(context)
    })

    it("rejects malformed or extended session context JSON", () => {
      expect(parseSessionContextJson("{")).toBeUndefined()
      expect(parseSessionContextJson(JSON.stringify({
        expiresAt: now,
        extra: true,
        sessionId: fixedSessionId(),
        tenantId: "springfield"
      }))).toBeUndefined()
      expect(parseSessionContextJson(JSON.stringify({
        expiresAt: now,
        sessionId: "not-valid",
        tenantId: "springfield"
      }))).toBeUndefined()
    })
  })

  describe("absolute expiry", () => {
    it("computes future Unix seconds from clock and TTL", () => {
      const now = 1_700_000_000
      expect(absoluteExpirySeconds(now, 86_400)).toBe(now + 86_400)
    })

    it("rejects non-positive or non-representable TTL values", () => {
      expect(() => absoluteExpirySeconds(0, 86_400)).toThrow(SessionConfigError)
      expect(() => absoluteExpirySeconds(1_700_000_000, 0)).toThrow(SessionConfigError)
      expect(() => absoluteExpirySeconds(1_700_000_000, -1)).toThrow(SessionConfigError)
      expect(() => absoluteExpirySeconds(Number.MAX_SAFE_INTEGER, 1)).toThrow(SessionConfigError)
    })
  })

  describe("cookie attributes", () => {
    it("maps exp to Expires and sets HttpOnly, Path=/, SameSite=Lax", () => {
      const expiresAt = 1_700_000_000
      const attributes = cookieAttributes(expiresAt, true)

      expect(attributes.httpOnly).toBe(true)
      expect(attributes.path).toBe("/")
      expect(attributes.sameSite).toBe("lax")
      expect(attributes.secure).toBe(true)
      expect(attributes.expires).toEqual(new Date(expiresAt * 1000))
    })
  })

  describe("isSafeUnixSeconds", () => {
    it("accepts positive safe integers only", () => {
      expect(isSafeUnixSeconds(1)).toBe(true)
      expect(isSafeUnixSeconds(0)).toBe(false)
      expect(isSafeUnixSeconds(-1)).toBe(false)
      expect(isSafeUnixSeconds(1.5)).toBe(false)
      expect(isSafeUnixSeconds("1")).toBe(false)
    })
  })

  describe("parseSessionConfig", () => {
    it("parses defaults for optional settings", () => {
      const config = parseSessionConfig(baseEnv())
      expect(config.redisUrl).toBe("redis://127.0.0.1:6379")
      expect(config.ttlSeconds).toBe(DEFAULT_SESSION_TTL_SECONDS)
      expect(config.storeTimeoutMs).toBe(DEFAULT_SESSION_STORE_TIMEOUT_MS)
      expect(config.keyPrefix).toBe(DEFAULT_SESSION_KEY_PREFIX)
      expect(config.signingSecret.byteLength).toBeGreaterThanOrEqual(SESSION_ID_BYTE_LENGTH)
    })

    it("accepts custom TTL, timeout, and key prefix", () => {
      const config = parseSessionConfig(baseEnv({
        SESSION_KEY_PREFIX: "test:session:",
        SESSION_STORE_TIMEOUT_MS: "5000",
        SESSION_TTL_SECONDS: "7200"
      }))
      expect(config.keyPrefix).toBe("test:session:")
      expect(config.storeTimeoutMs).toBe(5000)
      expect(config.ttlSeconds).toBe(7200)
    })

    it("rejects missing REDIS_URL or SESSION_SIGNING_SECRET", () => {
      expect(() => parseSessionConfig({ SESSION_SIGNING_SECRET: signingSecret() }))
        .toThrow(SessionConfigError)
      expect(() => parseSessionConfig({ REDIS_URL: "redis://127.0.0.1:6379" }))
        .toThrow(SessionConfigError)
      expect(() => parseSessionConfig(baseEnv({ REDIS_URL: "   " })))
        .toThrow(/REDIS_URL is required/)
      expect(() => parseSessionConfig(baseEnv({ SESSION_SIGNING_SECRET: "" })))
        .toThrow(/SESSION_SIGNING_SECRET is required/)
    })

    it("rejects invalid or short SESSION_SIGNING_SECRET", () => {
      expect(() => parseSessionConfig(baseEnv({ SESSION_SIGNING_SECRET: "not-base64url!!!" })))
        .toThrow(/base64url/)
      expect(() => parseSessionConfig(baseEnv({ SESSION_SIGNING_SECRET: "YWJj" })))
        .toThrow(/at least 32 bytes/)
    })

    it("rejects non-loopback cleartext REDIS_URL", () => {
      expect(() => parseSessionConfig(baseEnv({ REDIS_URL: "redis://192.168.1.10:6379" })))
        .toThrow(/loopback/)
      expect(() => parseSessionConfig(baseEnv({ REDIS_URL: "redis://redis.example.com:6379" })))
        .toThrow(/loopback/)
    })

    it("allows loopback cleartext REDIS_URL hosts", () => {
      for (
        const url of [
          "redis://127.0.0.1:6379",
          "redis://localhost:6379",
          "redis://[::1]:6379"
        ]
      ) {
        expect(parseSessionConfig(baseEnv({ REDIS_URL: url })).redisUrl).toBe(url)
      }
    })

    it("rejects TLS REDIS_URL without authentication", () => {
      expect(() => parseSessionConfig(baseEnv({ REDIS_URL: "rediss://redis.example.com:6379" })))
        .toThrow(/TLS and authentication/)
    })

    it("accepts TLS REDIS_URL with password auth", () => {
      const password = "x".repeat(16)
      expect(
        parseSessionConfig(baseEnv({
          REDIS_URL: `rediss://:${password}@redis.example.com:6379`
        })).redisUrl
      ).toContain("rediss://")
    })

    it("rejects TLS REDIS_URL with only mTLS query params", () => {
      expect(() =>
        parseSessionConfig(baseEnv({
          REDIS_URL: "rediss://redis.example.com:6379?cert=a&key=b"
        }))
      ).toThrow(/TLS and authentication/)
    })

    it("rejects unsupported REDIS_URL protocols", () => {
      expect(() => parseSessionConfig(baseEnv({ REDIS_URL: "http://127.0.0.1:6379" })))
        .toThrow(/protocol is unsupported/)
    })

    it("rejects invalid SESSION_STORE_TIMEOUT_MS values", () => {
      expect(() => parseSessionConfig(baseEnv({ SESSION_STORE_TIMEOUT_MS: "0" })))
        .toThrow(/positive integer/)
      expect(() => parseSessionConfig(baseEnv({ SESSION_STORE_TIMEOUT_MS: "-1" })))
        .toThrow(/positive integer/)
      expect(() => parseSessionConfig(baseEnv({ SESSION_STORE_TIMEOUT_MS: "abc" })))
        .toThrow(/positive integer/)
      expect(() =>
        parseSessionConfig(baseEnv({
          SESSION_STORE_TIMEOUT_MS: String(NODE_TIMER_MAX_MS + 1)
        }))
      ).toThrow(/timer-safe range/)
    })

    it("rejects invalid SESSION_TTL_SECONDS values", () => {
      expect(() => parseSessionConfig(baseEnv({ SESSION_TTL_SECONDS: "0" })))
        .toThrow(/positive integer/)
      expect(() => parseSessionConfig(baseEnv({ SESSION_TTL_SECONDS: "not-a-number" })))
        .toThrow(/positive integer/)
    })
  })

  describe("getSessionConfig", () => {
    it("caches successful config and repeated config errors", () => {
      const env = baseEnv()
      const first = getSessionConfig(env)
      expect(getSessionConfig(env)).toBe(first)

      resetSessionConfigCacheForTests()
      expect(() => getSessionConfig({})).toThrow(SessionConfigError)
      expect(() => getSessionConfig({})).toThrow(SessionConfigError)
    })

    it("reloads when forceReload is requested", () => {
      const env = baseEnv()
      const first = getSessionConfig(env)
      env.SESSION_TTL_SECONDS = "7200"
      expect(getSessionConfig(env)).toBe(first)
      expect(getSessionConfig(env, { forceReload: true }).ttlSeconds).toBe(7200)
    })
  })
})
