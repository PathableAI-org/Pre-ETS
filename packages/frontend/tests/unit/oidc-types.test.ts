import { afterEach, describe, expect, it, vi } from "vitest"

import {
  DEFAULT_OIDC_TX_KEY_PREFIX,
  DEFAULT_OIDC_TX_TTL_SECONDS,
  getOidcTxConfig,
  parseOidcCorrelationClaims,
  parseOidcTransactionRecord,
  resetOidcTxConfigCacheForTests
} from "../../src/lib/oidc/types.ts"

const validRecord = {
  clientId: "springfield-web",
  codeVerifier: "verifier",
  connection: "springfield-idp",
  expiresAt: 1_700_000_600,
  issuer: "https://identity.example/realms/pre-ets",
  nonce: "nonce-value",
  redirectUri: "https://springfield.pathable.com/auth/callback",
  sessionId: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  tenantId: "springfield"
}

describe("OIDC transaction types", () => {
  afterEach(() => {
    resetOidcTxConfigCacheForTests()
    vi.unstubAllEnvs()
  })

  it("parses the exact transaction record shape", () => {
    expect(parseOidcTransactionRecord(validRecord)).toEqual(validRecord)
    expect(
      parseOidcTransactionRecord({
        clientId: "springfield-web",
        codeVerifier: "verifier",
        expiresAt: 1_700_000_600,
        issuer: "https://identity.example/realms/pre-ets",
        nonce: "nonce-value",
        redirectUri: "https://springfield.pathable.com/auth/callback",
        sessionId: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        tenantId: "springfield"
      })
    ).toMatchObject({ tenantId: "springfield" })
    expect(parseOidcTransactionRecord({ ...validRecord, extra: true })).toBeUndefined()
    expect(parseOidcTransactionRecord({ ...validRecord, sessionId: "short" })).toBeUndefined()
  })

  it("defaults OIDC_TX_TTL_SECONDS to 600 and key prefix to pre-ets:oidc-tx:", () => {
    vi.stubEnv("SESSION_SIGNING_SECRET", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379")
    const config = getOidcTxConfig()
    expect(config.ttlSeconds).toBe(DEFAULT_OIDC_TX_TTL_SECONDS)
    expect(config.keyPrefix).toBe(DEFAULT_OIDC_TX_KEY_PREFIX)
    expect(config.ttlSeconds).toBe(600)
    expect(config.keyPrefix).toBe("pre-ets:oidc-tx:")
  })

  it("parses correlation cookie claims with tenant (not tenantId)", () => {
    expect(
      parseOidcCorrelationClaims({
        exp: 1_700_000_600,
        state: "state-value",
        tenant: "springfield"
      })
    ).toEqual({
      exp: 1_700_000_600,
      state: "state-value",
      tenant: "springfield"
    })
    expect(
      parseOidcCorrelationClaims({
        exp: 1_700_000_600,
        state: "state-value",
        tenantId: "springfield"
      })
    ).toBeUndefined()
  })
})
