import * as client from "openid-client"

import { loopbackHttpDiscoveryOptions } from "./insecure-loopback-discovery.ts"

/**
 * Discovers OIDC issuer metadata and caches Configuration by issuer + client
 * identity + authentication mode for the process lifetime. Restart the frontend
 * after Keycloak recreate/reprovision. Discovery must not override trusted
 * tenant `clientAuth`.
 */

export interface DiscoveredOidcClient {
  readonly authorizationEndpoint: string
  readonly configuration: client.Configuration
}

type DiscoveryFn = typeof client.discovery

const cache = new Map<string, DiscoveredOidcClient>()

export async function discoverOidcIssuer(
  issuer: string,
  clientId: string,
  options: {
    readonly clientSecret?: string
    readonly discovery?: DiscoveryFn
  } = {}
): Promise<DiscoveredOidcClient> {
  const key = discoveryCacheKey(issuer, clientId, options.clientSecret)
  const cached = cache.get(key)
  if (cached !== undefined) {
    return cached
  }

  const discovery = options.discovery ?? client.discovery
  const issuerUrl = new URL(issuer)
  const discoveryOptions = loopbackHttpDiscoveryOptions(issuerUrl)
  const configuration = options.clientSecret === undefined
    ? await discovery(issuerUrl, clientId, undefined, undefined, discoveryOptions)
    : await discovery(
      issuerUrl,
      clientId,
      undefined,
      client.ClientSecretPost(options.clientSecret),
      discoveryOptions
    )

  const server = configuration.serverMetadata()
  const authorizationEndpoint = server.authorization_endpoint
  if (typeof authorizationEndpoint !== "string" || authorizationEndpoint.trim() === "") {
    throw new Error("OIDC discovery did not return an authorization endpoint.")
  }

  const discovered: DiscoveredOidcClient = {
    authorizationEndpoint,
    configuration
  }
  cache.set(key, discovered)
  return discovered
}

export function resetOidcDiscoveryCacheForTests(): void {
  cache.clear()
}

function discoveryCacheKey(
  issuer: string,
  clientId: string,
  clientSecret: string | undefined
): string {
  const authMode = clientSecret === undefined ? "public" : "confidential"
  return `${issuer}\0${clientId}\0${authMode}`
}
