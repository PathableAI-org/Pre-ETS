/** True when Proxy must pass through without setupSession or initiation. */
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
