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
    handlers.applyInactivity(result.sessionId, result.sessionEndGeneration)
    return
  }

  // unavailable / ended-other / mismatch — fail closed, no inactivity claim.
  handlers.setUnavailable()
}

/** Harness Label A summary — never invents inactivity from client schedule alone. */
export function confirmOutcomeHarnessLabel(
  result: ConfirmSessionActionResult
): string {
  if (result.status === "authenticated") {
    return `valid (idleExpiresAt=${String(result.idleExpiresAt)}, expiresAt=${String(result.expiresAt)})`
  }
  if (result.status === "ended-inactivity") {
    return `inactivity (generation=${String(result.sessionEndGeneration)})`
  }
  if (result.status === "ended-other") {
    return "other"
  }
  if (result.status === "mismatch") {
    return "other (mismatch)"
  }
  return "error (unavailable)"
}
