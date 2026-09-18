import type { ConfirmSessionActionResult } from "./confirm-action.ts"

/**
 * Apply confirm action outcome to inactivity recovery island handlers.
 */
export function applyConfirmResult(
  result: ConfirmSessionActionResult,
  handlers: {
    readonly applyInactivity: (
      endedSessionId: string,
      sessionEndGeneration: number,
      broadcast: boolean
    ) => void
    readonly setDeadlines: (deadlines: {
      readonly expiresAt: number
      readonly idleExpiresAt: number
    }) => void
    readonly setUnavailable: () => void
  }
): void {
  if (result.status === "authenticated") {
    handlers.setDeadlines({
      expiresAt: result.expiresAt,
      idleExpiresAt: result.idleExpiresAt
    })
    return
  }

  if (result.status === "ended-inactivity") {
    handlers.applyInactivity(result.sessionId, result.sessionEndGeneration, true)
    return
  }

  // unavailable / ended-other / mismatch — fail closed, no inactivity claim.
  handlers.setUnavailable()
}
