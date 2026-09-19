import type { ConfirmSessionActionResult } from "./confirm-action.ts"

import { applyConfirmResult } from "./confirm-result.ts"

export function canRunConfirm(
  confirming: boolean,
  stateKind: string
): boolean {
  return !confirming && stateKind === "active"
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
