import { afterEach, describe, expect, it, vi } from "vitest"

import { parseTenantConfig, parseTenantRecord } from "../../src/lib/tenant/types.ts"

const validOidc = {
  clientAuth: "public",
  clientId: "springfield-web",
  connection: "springfield-idp",
  issuer: "https://identity.example/realms/pre-ets"
} as const

const validConfig = {
  displayName: "Springfield Demo",
  oidc: validOidc
}

describe("shared TenantConfig OIDC parser", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("keeps required displayName and requires nested oidc with clientAuth", () => {
    expect(parseTenantConfig(validConfig)).toEqual(validConfig)
    expect(parseTenantConfig({ displayName: "Springfield Demo" })).toBeUndefined()
    expect(
      parseTenantConfig({
        displayName: "Springfield Demo",
        oidc: {
          clientId: "springfield-web",
          issuer: "https://identity.example/realms/pre-ets"
        }
      })
    ).toBeUndefined()
  })

  it("accepts closed-set clientAuth values and rejects others", () => {
    expect(
      parseTenantConfig({
        displayName: "Springfield Demo",
        oidc: { ...validOidc, clientAuth: "public" }
      })?.oidc.clientAuth
    ).toBe("public")
    expect(
      parseTenantConfig({
        displayName: "Springfield Demo",
        oidc: {
          clientAuth: "confidential",
          clientId: "springfield-web",
          issuer: "https://identity.example/realms/pre-ets"
        }
      })
    ).toMatchObject({
      oidc: { clientAuth: "confidential", clientId: "springfield-web" }
    })
    expect(
      parseTenantConfig({
        displayName: "Springfield Demo",
        oidc: { ...validOidc, clientAuth: "private_key_jwt" }
      })
    ).toBeUndefined()
  })

  it("requires absolute issuer URLs with https outside development", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(
      parseTenantConfig({
        displayName: "Springfield Demo",
        oidc: { ...validOidc, issuer: "https://identity.example/realms/pre-ets" }
      })
    ).toBeDefined()
    expect(
      parseTenantConfig({
        displayName: "Springfield Demo",
        oidc: { ...validOidc, issuer: "http://127.0.0.1:8080/realms/pre-ets" }
      })
    ).toBeUndefined()
    expect(
      parseTenantConfig({
        displayName: "Springfield Demo",
        oidc: { ...validOidc, issuer: "identity.example/realms/pre-ets" }
      })
    ).toBeUndefined()
    expect(
      parseTenantConfig({
        displayName: "Springfield Demo",
        oidc: { ...validOidc, issuer: "ftp://identity.example/realms/pre-ets" }
      })
    ).toBeUndefined()
  })

  it("allows loopback http issuers only in development", () => {
    vi.stubEnv("NODE_ENV", "development")
    expect(
      parseTenantConfig({
        displayName: "Springfield Demo",
        oidc: { ...validOidc, issuer: "http://127.0.0.1:8080/realms/pre-ets" }
      })
    ).toBeDefined()
    expect(
      parseTenantConfig({
        displayName: "Springfield Demo",
        oidc: { ...validOidc, issuer: "http://localhost:8080/realms/pre-ets" }
      })
    ).toBeDefined()
    expect(
      parseTenantConfig({
        displayName: "Springfield Demo",
        oidc: { ...validOidc, issuer: "http://keycloak.internal:8080/realms/pre-ets" }
      })
    ).toBeUndefined()
  })

  it("requires nonempty clientId and optional nonempty connection", () => {
    expect(
      parseTenantConfig({
        displayName: "Springfield Demo",
        oidc: { ...validOidc, clientId: "   " }
      })
    ).toBeUndefined()
    expect(
      parseTenantConfig({
        displayName: "Springfield Demo",
        oidc: {
          clientAuth: "public",
          clientId: "springfield-web",
          issuer: "https://identity.example/realms/pre-ets"
        }
      })
    ).toEqual({
      displayName: "Springfield Demo",
      oidc: {
        clientAuth: "public",
        clientId: "springfield-web",
        issuer: "https://identity.example/realms/pre-ets"
      }
    })
    expect(
      parseTenantConfig({
        displayName: "Springfield Demo",
        oidc: { ...validOidc, connection: "   " }
      })
    ).toBeUndefined()
  })

  it("rejects unknown keys at config and oidc levels", () => {
    expect(
      parseTenantConfig({
        displayName: "Springfield Demo",
        extra: true,
        oidc: validOidc
      })
    ).toBeUndefined()
    expect(
      parseTenantConfig({
        displayName: "Springfield Demo",
        oidc: { ...validOidc, extra: true }
      })
    ).toBeUndefined()
  })

  it("makes Display Name-only records unusable through parseTenantRecord", () => {
    expect(
      parseTenantRecord({
        config: { displayName: "Springfield Demo" },
        slug: "springfield"
      })
    ).toBeUndefined()
    expect(
      parseTenantRecord({
        config: validConfig,
        slug: "springfield"
      })
    ).toEqual({
      config: validConfig,
      slug: "springfield"
    })
  })
})
