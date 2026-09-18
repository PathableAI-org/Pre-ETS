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

describe("discoverOidcIssuer loopback HTTP options", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetOidcDiscoveryCacheForTests()
  })

  type DiscoveryCall = [
    issuer: URL,
    clientId: string,
    metadata: unknown,
    clientAuth: unknown,
    options: undefined | { readonly execute?: readonly unknown[] }
  ]

  function mockDiscovery() {
    return vi.fn(async (..._args: DiscoveryCall) => {
      return {
        serverMetadata: () => ({
          authorization_endpoint: "http://127.0.0.1/auth"
        })
      }
    })
  }

  function discoveryOptionsFromCall(
    discovery: ReturnType<typeof mockDiscovery>
  ): undefined | { readonly execute?: readonly unknown[] } {
    const call = discovery.mock.calls[0]
    expect(call).toBeDefined()
    return call?.[4]
  }

  it.each([
    "http://127.0.0.1:8080/realms/pre-ets",
    "http://localhost:8080/realms/pre-ets",
    "http://[::1]:8080/realms/pre-ets"
  ])("passes insecure execute options for loopback HTTP issuer %s", async (issuer) => {
    const discovery = mockDiscovery()

    await discoverOidcIssuer(issuer, "loopback-app", {
      discovery: discovery as never
    })

    const options = discoveryOptionsFromCall(discovery)
    expect(options?.execute).toHaveLength(1)
  })

  it("does not pass insecure execute options for HTTPS issuers", async () => {
    const discovery = mockDiscovery()

    await discoverOidcIssuer("https://idp.example/", "https-app", {
      discovery: discovery as never
    })

    expect(discoveryOptionsFromCall(discovery)).toBeUndefined()
  })

  it("does not pass insecure execute options for non-loopback HTTP issuers", async () => {
    const discovery = mockDiscovery()

    await discoverOidcIssuer("http://example.com/realms/pre-ets", "remote-http-app", {
      discovery: discovery as never
    })

    expect(discoveryOptionsFromCall(discovery)).toBeUndefined()
  })
})
