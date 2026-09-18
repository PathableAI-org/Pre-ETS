"use client"

import { useEffect } from "react"

import {
  INACTIVITY_BROADCAST_CHANNEL,
  isInactivityConfirmedMessage,
  shouldApplyInactivityBroadcast
} from "../../lib/session/inactivity-channel.ts"

/**
 * Subscribe to same-origin inactivity-confirmed messages for the mounted session.
 * Matching siblings apply without rebroadcast; foreign sids are ignored.
 */
export function useInactivityBroadcast(
  sessionId: string,
  onMatchingInactivity: (
    endedSessionId: string,
    sessionEndGeneration: number
  ) => void
): void {
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") {
      return
    }

    let channel: BroadcastChannel
    try {
      channel = new BroadcastChannel(INACTIVITY_BROADCAST_CHANNEL)
    } catch {
      return
    }

    channel.onmessage = (event: MessageEvent) => {
      if (!isInactivityConfirmedMessage(event.data)) {
        return
      }
      if (!shouldApplyInactivityBroadcast(event.data, sessionId)) {
        return
      }
      onMatchingInactivity(
        event.data.sessionId,
        event.data.sessionEndGeneration
      )
    }

    return () => {
      channel.close()
    }
  }, [onMatchingInactivity, sessionId])
}
