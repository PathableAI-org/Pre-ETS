import { hostnameOf } from "../tenant/host.ts"

/**
 * Build the approved application origin for `redirect_uri` from the same Host
 * header used for tenant resolution, with an enforced scheme. Never use
 * `nextUrl.origin` alone — forwarded Host/proto can diverge from the binder.
 *
 * Scheme: request protocol when http/https; reject non-loopback `http:` outside
 * development (research §7 / FR-006 approved return destination).
 * Static tenant mode additionally requires a loopback Host.
 */
export function approvedApplicationOrigin(
  hostHeader: string | undefined,
  requestUrl: URL,
  options: {
    readonly development?: boolean
    readonly tenantOrigin?: "host-associated" | "local-static"
  } = {}
): string | undefined {
  if (hostHeader === undefined || hostHeader.trim() === "") {
    return undefined
  }

  if (/[\s,/\\?#@]/.test(hostHeader) || hostHeader.includes("://")) {
    return undefined
  }

  const hostname = hostnameOf(hostHeader)
  if (hostname === undefined) {
    return undefined
  }

  if (options.tenantOrigin === "local-static" && !isLoopbackHostname(hostname)) {
    return undefined
  }

  const protocol = requestUrl.protocol
  if (protocol !== "http:" && protocol !== "https:") {
    return undefined
  }

  const development = options.development ?? process.env.NODE_ENV === "development"
  if (protocol === "http:" && !isLoopbackHostname(hostname) && !development) {
    return undefined
  }

  return `${protocol}//${hostHeader}`
}

/** True when Proxy must complete login instead of initiating. */
export function isAuthCallbackPath(pathname: string): boolean {
  return pathname === "/auth/callback"
}

/**
 * Session cookie is attached only on successful document IdP redirect after a
 * setup `create` that produced a cookie value. Failures and reuse never set it
 * on the initiation response.
 */
export function sessionCookieForRedirect(
  setupOutcome: "create" | "reuse",
  cookieValue: string | undefined
): string | undefined {
  return setupOutcome === "create" ? cookieValue : undefined
}

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]"
}
