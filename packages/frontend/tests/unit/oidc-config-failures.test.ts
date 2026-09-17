import { afterEach, describe, expect, it, vi } from "vitest"

import type { OidcTransactionStore } from "../../src/lib/oidc/transaction.ts"

import { initiateLogin } from "../../src/lib/oidc/initiate.ts"
import {
  OidcSecretsConfigError,
  resetOidcSecretsCacheForTests,
  resolveOidcClientSecret
} from "../../src/lib/oidc/secrets.ts"
import { springfieldConfig, springfieldRecord } from "./tenant-fixtures.ts"

const SESSION_ID = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

function mockStore(): OidcTransactionStore {
  return {
    create: vi.fn().mockResolvedValue({ kind: "unavailable" })
  }
}

describe("OIDC config failure taxonomy", () => {
  afterEach(() => {
    resetOidcSecretsCacheForTests()
    vi.unstubAllEnvs()
  })

  it("refuses confidential tenants without a nonempty secret via 403-config", async () => {
    vi.stubEnv("OIDC_CLIENT_SECRETS_JSON", "{}")
    expect(resolveOidcClientSecret("springfield", "confidential")).toEqual({
      kind: "config-refusal"
    })

    const outcome = await initiateLogin(
      {
        nowSeconds: 1_700_000_000,
        origin: "https://springfield.pathable.com",
        sessionId: SESSION_ID,
        setupOutcome: "create",
        tenantId: "springfield",
        tenantRecord: {
          config: {
            displayName: "Springfield Demo",
            oidc: { ...springfieldConfig.oidc, clientAuth: "confidential" }
          },
          slug: "springfield"
        }
      },
      { store: mockStore() }
    )
    expect(outcome).toEqual({ kind: "config-refusal", outcomeClass: "403-config" })
  })

  it("allows public tenants without a secret and treats unused secrets as unused", () => {
    vi.stubEnv("OIDC_CLIENT_SECRETS_JSON", "{}")
    expect(resolveOidcClientSecret("springfield", "public")).toEqual({ kind: "none" })

    resetOidcSecretsCacheForTests()
    vi.stubEnv("OIDC_CLIENT_SECRETS_JSON", JSON.stringify({ springfield: "unused" }))
    expect(resolveOidcClientSecret("springfield", "public")).toEqual({ kind: "unused" })
  })

  it("maps malformed secrets JSON to process-config without logging values", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.stubEnv("OIDC_CLIENT_SECRETS_JSON", "{bad")
    expect(() => resolveOidcClientSecret("springfield", "public")).toThrow(OidcSecretsConfigError)

    const outcome = await initiateLogin(
      {
        nowSeconds: 1_700_000_000,
        origin: "https://springfield.pathable.com",
        sessionId: SESSION_ID,
        setupOutcome: "create",
        tenantId: "springfield",
        tenantRecord: springfieldRecord
      },
      {
        resolveSecret: () => {
          throw new OidcSecretsConfigError("OIDC_CLIENT_SECRETS_JSON must be valid JSON.")
        },
        store: mockStore()
      }
    )
    expect(outcome).toEqual({ kind: "process-config", outcomeClass: "process-config" })
    expect(JSON.stringify(error.mock.calls)).not.toContain("unused")
  })
})
