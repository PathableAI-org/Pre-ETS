"use client"

import type { ReactNode } from "react"

import { IdleConfirmHarnessProvider } from "./idle-confirm-harness-context.tsx"
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
 */
export function InactivityRecoveryIsland({
  children,
  expiresAt,
  idleExpiresAt,
  sessionId
}: InactivityRecoveryIslandProps) {
  const recovery = useInactivityRecovery({ expiresAt, idleExpiresAt, sessionId })

  if (recovery.state.kind === "inactivity") {
    return (
      <InactivityClearedView
        lastOutcomeLabel={recovery.lastOutcomeLabel}
        modalOpen={recovery.modalOpen}
        onModalClose={() => {
          // Stub until PR6: close UI only — does not rotate sid or start OIDC.
          recovery.setModalOpen(false)
        }}
      />
    )
  }

  if (recovery.state.kind === "unavailable") {
    return (
      <AuthUnavailableLockView
        lastOutcomeLabel={recovery.lastOutcomeLabel}
        onRetry={recovery.runConfirm}
      />
    )
  }

  return (
    <IdleConfirmHarnessProvider value={recovery.harnessValue}>
      {children}
    </IdleConfirmHarnessProvider>
  )
}
