/**
 * Same-origin BroadcastChannel contract for multi-tab inactivity recovery.
 * Payload must include sessionId + sessionEndGeneration; receivers ignore foreign sids.
 */

export const INACTIVITY_BROADCAST_CHANNEL = "pathable-inactivity"

export const INACTIVITY_CONFIRMED_TYPE = "inactivity-confirmed" as const

export interface InactivityConfirmedMessage {
  readonly sessionEndGeneration: number
  readonly sessionId: string
  readonly type: typeof INACTIVITY_CONFIRMED_TYPE
}

export function inactivityConfirmedMessage(
  sessionId: string,
  sessionEndGeneration: number
): InactivityConfirmedMessage {
  return {
    sessionEndGeneration,
    sessionId,
    type: INACTIVITY_CONFIRMED_TYPE
  }
}

export function isInactivityConfirmedMessage(
  value: unknown
): value is InactivityConfirmedMessage {
  if (value === null || typeof value !== "object") {
    return false
  }
  const record = value as Record<string, unknown>
  return record.type === INACTIVITY_CONFIRMED_TYPE
    && typeof record.sessionId === "string"
    && record.sessionId.length > 0
    && typeof record.sessionEndGeneration === "number"
    && Number.isSafeInteger(record.sessionEndGeneration)
    && record.sessionEndGeneration >= 1
}
