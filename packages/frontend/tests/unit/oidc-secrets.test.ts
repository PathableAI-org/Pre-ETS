import { afterEach, describe, expect, it, vi } from "vitest"
let { OidcSecretsConfigError, resolveOidcClientSecret } = await import("../../src/lib/oidc/secrets.ts")

describe("OIDC_CLIENT_SECRETS_JSON", () => {
  afterEach(async () => {
    await reloadModules()
    vi.unstubAllEnvs()
  })

  it("lazily parses an object map and allows public without a secret", async () => {
    vi.stubEnv("OIDC_CLIENT_SECRETS_JSON", undefined)
    expect(resolveOidcClientSecret("springfield", "public")).toEqual({ kind: "none" })

    vi.stubEnv("OIDC_CLIENT_SECRETS_JSON", "{}")
    await reloadModules()
    expect(resolveOidcClientSecret("springfield", "public")).toEqual({ kind: "none" })
  })

  it("treats nonempty public secrets-map entries as valid and unused", () => {
    vi.stubEnv("OIDC_CLIENT_SECRETS_JSON", JSON.stringify({ springfield: "unused-secret" }))
    expect(resolveOidcClientSecret("springfield", "public")).toEqual({ kind: "unused" })
  })

  it("requires a nonempty confidential secret for the slug", async () => {
    vi.stubEnv("OIDC_CLIENT_SECRETS_JSON", JSON.stringify({ springfield: "server-secret" }))
    expect(resolveOidcClientSecret("springfield", "confidential")).toEqual({
      kind: "secret",
      secret: "server-secret"
    })

    await reloadModules()
    vi.stubEnv("OIDC_CLIENT_SECRETS_JSON", JSON.stringify({ springfield: "   " }))
    expect(resolveOidcClientSecret("springfield", "confidential")).toEqual({
      kind: "config-refusal"
    })

    await reloadModules()
    vi.stubEnv("OIDC_CLIENT_SECRETS_JSON", "{}")
    expect(resolveOidcClientSecret("springfield", "confidential")).toEqual({
      kind: "config-refusal"
    })
  })

  it("fails closed on malformed secrets maps without logging secret values", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.stubEnv("OIDC_CLIENT_SECRETS_JSON", "{not-json")
    expect(() => resolveOidcClientSecret("springfield", "public")).toThrow(OidcSecretsConfigError)
    expect(JSON.stringify(error.mock.calls)).not.toContain("server-secret")

    await reloadModules()
    vi.stubEnv("OIDC_CLIENT_SECRETS_JSON", JSON.stringify(["springfield"]))
    expect(() => resolveOidcClientSecret("springfield", "public")).toThrow(OidcSecretsConfigError)
  })
})

async function reloadModules(): Promise<void> {
  vi.resetModules()
  ;({ OidcSecretsConfigError, resolveOidcClientSecret } = await import("../../src/lib/oidc/secrets.ts"))
}
