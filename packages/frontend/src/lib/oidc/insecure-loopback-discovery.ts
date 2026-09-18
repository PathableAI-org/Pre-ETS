import { allowInsecureRequests, type DiscoveryRequestOptions } from "openid-client"

/**
 * openid-client defaults to HTTPS-only. Local Keycloak and BDD issuer mocks speak
 * HTTP on loopback; allowInsecureRequests is marked deprecated to discourage
 * production use but remains the supported escape hatch for non-TLS discovery.
 * Keep that reference here so discovery.ts stays free of deprecated API usage.
 */
export function loopbackHttpDiscoveryOptions(
  issuerUrl: URL
): DiscoveryRequestOptions | undefined {
  if (issuerUrl.protocol !== "http:") {
    return undefined
  }

  const host = issuerUrl.hostname.toLowerCase()
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1" && host !== "[::1]") {
    return undefined
  }

  return { execute: [allowInsecureRequests] }
}
