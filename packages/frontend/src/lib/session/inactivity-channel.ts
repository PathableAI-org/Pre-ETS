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

/**
 * Best-effort broadcast after first server inactivity confirmation in this tab.
 * Channel failure must not block local Modal; latch/confirm covers siblings.
 */
export function broadcastInactivityConfirmed(
  sessionId: string,
  sessionEndGeneration: number
): void {
  if (typeof BroadcastChannel === "undefined") {
    return
  }
  try {
    const channel = new BroadcastChannel(INACTIVITY_BROADCAST_CHANNEL)
    try {
      channel.postMessage(
        inactivityConfirmedMessage(sessionId, sessionEndGeneration)
      )
    } finally {
      channel.close()
    }
  } catch {
    // Best-effort only.
  }
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

/**
 * Receivers MUST ignore foreign session ids (origin-wide channel). Matching
 * generation alone is insufficient binding.
 */
export function shouldApplyInactivityBroadcast(
  message: InactivityConfirmedMessage,
  mountedSessionId: string
): boolean {
  return message.sessionId === mountedSessionId
}
