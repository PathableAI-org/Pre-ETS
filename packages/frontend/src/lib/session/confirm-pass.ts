import type { ConfirmSessionActionResult } from "./confirm-action.ts"

import { applyConfirmResult } from "./confirm-result.ts"

/** Timer-island lock machine kinds that gate confirm retries. */
export type ConfirmTimerStateKind = "active" | "inactivity" | "unavailable"

const CONFIRMABLE_STATE_KINDS: ReadonlySet<ConfirmTimerStateKind> = new Set([
  "active",
  "inactivity",
  "unavailable"
])

/**
 * Confirm may run while active, fail-closed unavailable (recovery retry), or
 * inactivity (post–login-again cookie-rotation mismatch handshake).
 */
export function canRunConfirm(
  confirming: boolean,
  stateKind: ConfirmTimerStateKind
): boolean {
  return !confirming && CONFIRMABLE_STATE_KINDS.has(stateKind)
}

export function confirmActionInput(
  sessionId: string,
  heldGeneration: number | undefined
): {
  readonly mountedSessionId: string
  readonly sessionEndGeneration?: number
} {
  if (heldGeneration === undefined) {
    return { mountedSessionId: sessionId }
  }
  return { mountedSessionId: sessionId, sessionEndGeneration: heldGeneration }
}

/**
 * One confirm pass for the deadline-aligned timer island.
 */
export async function executeConfirmPass(input: {
  readonly applyInactivity: (
    endedSessionId: string,
    sessionEndGeneration: number
  ) => void
  readonly confirm: (
    payload: {
      readonly mountedSessionId: string
      readonly sessionEndGeneration?: number
    }
  ) => Promise<ConfirmSessionActionResult>
  readonly heldGeneration: number | undefined
  /** Called on thrown transport errors before fail-closed lock (never inactivity). */
  readonly onTransportFailure?: () => void
  readonly sessionId: string
  /**
   * Restore active UI after a successful authenticated confirm (e.g. from
   * unavailable, or sibling adopt after login-again). Receives cookie-bound sid.
   */
  readonly setActive: (sessionId: string) => void
  readonly setDeadlines: (deadlines: {
    readonly expiresAt: number
    readonly idleExpiresAt: number
  }) => void
  readonly setUnavailable: () => void
}): Promise<void> {
  try {
    const result = await input.confirm(
      confirmActionInput(input.sessionId, input.heldGeneration)
    )
    applyConfirmResult(result, {
      applyInactivity: input.applyInactivity,
      setActive: input.setActive,
      setDeadlines: input.setDeadlines,
      setUnavailable: input.setUnavailable
    })
  } catch {
    input.onTransportFailure?.()
    input.setUnavailable()
  }
}

/**
 * Delay until `min(idleExpiresAt, expiresAt)` in milliseconds (client schedule only).
 */
export function nextConfirmDelayMs(
  idleExpiresAt: number,
  expiresAt: number,
  nowMs: number
): number {
  const deadlineMs = Math.min(idleExpiresAt, expiresAt) * 1000
  return Math.max(0, deadlineMs - nowMs)
}
