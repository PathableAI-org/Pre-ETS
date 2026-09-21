"use client"

import type { ReactNode } from "react"

import { AuthUnavailableLockView, InactivityClearedView } from "./inactivity-recovery-views.tsx"
import { useInactivityRecovery } from "./use-inactivity-recovery.ts"

export interface InactivityRecoveryIslandProps {
  readonly children: ReactNode
  readonly expiresAt: number
  readonly idleExpiresAt: number
  readonly sessionId: string
}

/**
 * Deadline-aligned revalidation at min(idleExpiresAt, expiresAt). On confirmed
 * inactivity (server confirm or matching BroadcastChannel): clear protected UI,
 * open PathAble Modal, and broadcast once from the confirming tab.
 * Timers alone never invent inactivity. 5xx / absolute / unknown → generic lock.
 * After login-again cookie rotation, focus/visibility confirm runs the session-mismatch
 * handshake so siblings can adopt a new authenticated cookie or finish latch handoff.
 */
export function InactivityRecoveryIsland({
  children,
  expiresAt,
  idleExpiresAt,
  sessionId
}: InactivityRecoveryIslandProps) {
  const recovery = useInactivityRecovery({ expiresAt, idleExpiresAt, sessionId })

  if (recovery.state.kind === "inactivity") {
    return <InactivityClearedView modalOpen={recovery.modalOpen} />
  }

  if (recovery.state.kind === "unavailable") {
    return <AuthUnavailableLockView onRetry={recovery.runConfirm} />
  }

  return children
}
