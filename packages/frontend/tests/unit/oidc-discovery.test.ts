/* eslint-disable @typescript-eslint/require-await */
import { afterEach, describe, expect, it, vi } from "vitest"

import { discoverOidcIssuer, resetOidcDiscoveryCacheForTests } from "../../src/lib/oidc/discovery.ts"

describe("discoverOidcIssuer cache", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetOidcDiscoveryCacheForTests()
  })

  it("does not reuse a public client configuration for a confidential client on the same issuer", async () => {
    const discovery = vi.fn(async (_issuer: URL, clientId: string) => {
      return {
        serverMetadata: () => ({
          authorization_endpoint: `https://idp.example/auth/${clientId}`
        })
      }
    })

    const publicClient = await discoverOidcIssuer("https://idp.example/", "public-app", {
      discovery: discovery as never
    })
    const confidentialClient = await discoverOidcIssuer("https://idp.example/", "confidential-app", {
      clientSecret: "server-only-secret",
      discovery: discovery as never
    })

    expect(discovery).toHaveBeenCalledTimes(2)
    expect(publicClient.authorizationEndpoint).toBe("https://idp.example/auth/public-app")
    expect(confidentialClient.authorizationEndpoint).toBe(
      "https://idp.example/auth/confidential-app"
    )
  })

  it("reuses cache entries that share issuer, client id, and auth mode", async () => {
    const discovery = vi.fn(async () => {
      return {
        serverMetadata: () => ({
          authorization_endpoint: "https://idp.example/auth"
        })
      }
    })

    await discoverOidcIssuer("https://idp.example/", "shared-app", {
      discovery: discovery as never
    })
    await discoverOidcIssuer("https://idp.example/", "shared-app", {
      discovery: discovery as never
    })

    expect(discovery).toHaveBeenCalledTimes(1)
  })
})
