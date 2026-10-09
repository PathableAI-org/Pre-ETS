import type { ConfirmSessionActionResult } from "./confirm-action.ts"

/**
 * Apply confirm action outcome to recovery-island handlers.
 * Only `ended-inactivity` may open the inactivity Modal / broadcast path.
 */
export function applyConfirmResult(
  result: ConfirmSessionActionResult,
  handlers: {
    readonly applyInactivity: (
      endedSessionId: string,
      sessionEndGeneration: number
    ) => void
    /**
     * Clear fail-closed / inactivity lock when server re-confirms authenticated
     * access. `sessionId` is the cookie-bound sid (may differ after login-again).
     */
    readonly setActive: (sessionId: string) => void
    readonly setDeadlines: (deadlines: {
      readonly expiresAt: number
      readonly idleExpiresAt: number
    }) => void
    readonly setUnavailable: () => void
  }
): void {
  if (result.status === "authenticated") {
    handlers.setActive(result.sessionId)
    handlers.setDeadlines({
      expiresAt: result.expiresAt,
      idleExpiresAt: result.idleExpiresAt
    })
    return
  }

  if (result.status === "ended-inactivity") {
    handlers.applyInactivity(result.sessionId, result.sessionEndGeneration)
    return
  }

  // unavailable / ended-other / mismatch — fail closed, no inactivity claim.
  handlers.setUnavailable()
}
