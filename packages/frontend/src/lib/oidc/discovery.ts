import * as client from "openid-client"

/**
 * Discovers OIDC issuer metadata and caches Configuration by issuer URL for the
 * process lifetime. Restart the frontend after Keycloak recreate/reprovision.
 * Discovery must not override trusted tenant `clientAuth`.
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
  const cached = cache.get(issuer)
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
  cache.set(issuer, discovered)
  return discovered
}

export function resetOidcDiscoveryCacheForTests(): void {
  cache.clear()
}

/** openid-client defaults to HTTPS-only; local Keycloak/BDD mocks use loopback HTTP. */
function loopbackHttpDiscoveryOptions(
  issuerUrl: URL
): client.DiscoveryRequestOptions | undefined {
  if (issuerUrl.protocol !== "http:") {
    return undefined
  }

  const host = issuerUrl.hostname.toLowerCase()
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1" && host !== "[::1]") {
    return undefined
  }

  // Local Keycloak (and BDD issuer mocks) speak HTTP on loopback. openid-client marks
  // allowInsecureRequests deprecated to discourage production use; it remains the
  // supported escape hatch for non-TLS discovery in development.
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- loopback HTTP IdP only
  return { execute: [client.allowInsecureRequests] }
}
