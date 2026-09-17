import { afterEach, describe, expect, it, vi } from "vitest"

import {
  OidcSecretsConfigError,
  resetOidcSecretsCacheForTests,
  resolveOidcClientSecret
} from "../../src/lib/oidc/secrets.ts"

describe("OIDC_CLIENT_SECRETS_JSON", () => {
  afterEach(() => {
    resetOidcSecretsCacheForTests()
    vi.unstubAllEnvs()
  })

  it("lazily parses an object map and allows public without a secret", () => {
    vi.stubEnv("OIDC_CLIENT_SECRETS_JSON", undefined)
    expect(resolveOidcClientSecret("springfield", "public")).toEqual({ kind: "none" })

    vi.stubEnv("OIDC_CLIENT_SECRETS_JSON", "{}")
    resetOidcSecretsCacheForTests()
    expect(resolveOidcClientSecret("springfield", "public")).toEqual({ kind: "none" })
  })

  it("treats nonempty public secrets-map entries as valid and unused", () => {
    vi.stubEnv("OIDC_CLIENT_SECRETS_JSON", JSON.stringify({ springfield: "unused-secret" }))
    expect(resolveOidcClientSecret("springfield", "public")).toEqual({ kind: "unused" })
  })

  it("requires a nonempty confidential secret for the slug", () => {
    vi.stubEnv("OIDC_CLIENT_SECRETS_JSON", JSON.stringify({ springfield: "server-secret" }))
    expect(resolveOidcClientSecret("springfield", "confidential")).toEqual({
      kind: "secret",
      secret: "server-secret"
    })

    resetOidcSecretsCacheForTests()
    vi.stubEnv("OIDC_CLIENT_SECRETS_JSON", JSON.stringify({ springfield: "   " }))
    expect(resolveOidcClientSecret("springfield", "confidential")).toEqual({
      kind: "config-refusal"
    })

    resetOidcSecretsCacheForTests()
    vi.stubEnv("OIDC_CLIENT_SECRETS_JSON", "{}")
    expect(resolveOidcClientSecret("springfield", "confidential")).toEqual({
      kind: "config-refusal"
    })
  })

  it("fails closed on malformed secrets maps without logging secret values", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.stubEnv("OIDC_CLIENT_SECRETS_JSON", "{not-json")
    expect(() => resolveOidcClientSecret("springfield", "public")).toThrow(OidcSecretsConfigError)
    expect(JSON.stringify(error.mock.calls)).not.toContain("server-secret")

    resetOidcSecretsCacheForTests()
    vi.stubEnv("OIDC_CLIENT_SECRETS_JSON", JSON.stringify(["springfield"]))
    expect(() => resolveOidcClientSecret("springfield", "public")).toThrow(OidcSecretsConfigError)
  })
})
