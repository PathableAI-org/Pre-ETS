import type { ConfirmSessionAccessResult } from "./confirm.ts"

export type ConfirmSessionActionResult =
  | {
    readonly cookieSessionId: string
    readonly status: "mismatch"
  }
  | {
    readonly expiresAt: number
    readonly idleExpiresAt: number
    readonly sessionId: string
    readonly status: "authenticated"
  }
  | {
    readonly mismatch?: true
    readonly sessionEndGeneration: number
    readonly sessionId: string
    readonly status: "ended-inactivity"
  }
  | {
    readonly mismatch?: true
    readonly sessionId?: string
    readonly status: "ended-other"
  }
  | {
    readonly status: "unavailable"
  }

export function confirmSessionActionInputFrom(
  cookieValue: string | undefined,
  input: {
    readonly mountedSessionId?: string
    readonly sessionEndGeneration?: number
  }
): {
  readonly cookieValue: string | undefined
  readonly mountedSessionId?: string
  readonly sessionEndGeneration?: number
} {
  const payload: {
    cookieValue: string | undefined
    mountedSessionId?: string
    sessionEndGeneration?: number
  } = { cookieValue }

  if (input.mountedSessionId !== undefined) {
    payload.mountedSessionId = input.mountedSessionId
  }
  if (input.sessionEndGeneration !== undefined) {
    payload.sessionEndGeneration = input.sessionEndGeneration
  }
  return payload
}

/**
 * Map confirm lib result → server-action DTO (lookup-style, no nested switch).
 */
export function toConfirmSessionActionResult(
  result: ConfirmSessionAccessResult
): ConfirmSessionActionResult {
  if (result.kind === "authenticated") {
    return {
      expiresAt: result.expiresAt,
      idleExpiresAt: result.idleExpiresAt,
      sessionId: result.sessionId,
      status: "authenticated"
    }
  }
  if (result.kind === "mismatch") {
    return {
      cookieSessionId: result.cookieSessionId,
      status: "mismatch"
    }
  }
  if (result.kind === "unavailable") {
    return { status: "unavailable" }
  }
  if (result.kind === "ended-inactivity") {
    return endedInactivityAction(result)
  }
  return endedOtherAction(result)
}

function endedInactivityAction(
  result: Extract<ConfirmSessionAccessResult, { kind: "ended-inactivity" }>
): ConfirmSessionActionResult {
  const base = {
    sessionEndGeneration: result.sessionEndGeneration,
    sessionId: result.sessionId,
    status: "ended-inactivity" as const
  }
  if (result.mismatch === true) {
    return { ...base, mismatch: true }
  }
  return base
}

function endedOtherAction(
  result: Extract<ConfirmSessionAccessResult, { kind: "ended-other" }>
): ConfirmSessionActionResult {
  const base = { status: "ended-other" as const }
  if (result.mismatch === true && result.sessionId !== undefined) {
    return { ...base, mismatch: true, sessionId: result.sessionId }
  }
  if (result.mismatch === true) {
    return { ...base, mismatch: true }
  }
  if (result.sessionId !== undefined) {
    return { ...base, sessionId: result.sessionId }
  }
  return base
}
