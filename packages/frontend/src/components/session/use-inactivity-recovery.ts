"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { confirmSessionAction } from "../../app/(app)/session/confirm.ts"
import {
  canRunConfirm,
  type ConfirmTimerStateKind,
  executeConfirmPass,
  nextConfirmDelayMs
} from "../../lib/session/confirm-pass.ts"
import { broadcastInactivityConfirmed } from "../../lib/session/inactivity-channel.ts"
import { markTemporaryWorkCleared } from "./unsent-practice-note-fixture.tsx"
import { useInactivityBroadcast } from "./use-inactivity-broadcast.ts"

export type RecoveryState =
  | { readonly kind: "active" }
  | {
    readonly kind: "inactivity"
    readonly sessionEndGeneration: number
    readonly sessionId: string
  }
  | { readonly kind: "unavailable" }

export function useInactivityRecovery(input: {
  readonly expiresAt: number
  readonly idleExpiresAt: number
  readonly sessionId: string
}): {
  readonly modalOpen: boolean
  readonly runConfirm: () => void
  readonly state: RecoveryState
} {
  const { expiresAt, idleExpiresAt, sessionId } = input
  const [state, setState] = useState<RecoveryState>({ kind: "active" })
  const [deadlines, setDeadlines] = useState({ expiresAt, idleExpiresAt })
  const [modalOpen, setModalOpen] = useState(false)
  const heldGeneration = useRef<number | undefined>(undefined)
  const confirming = useRef(false)
  const stateKindRef = useRef<ConfirmTimerStateKind>(state.kind)

  useEffect(() => {
    stateKindRef.current = state.kind
  }, [state.kind])

  const applyInactivity = useCallback((
    endedSessionId: string,
    sessionEndGeneration: number,
    broadcast: boolean
  ) => {
    markTemporaryWorkCleared()
    heldGeneration.current = sessionEndGeneration
    setState({
      kind: "inactivity",
      sessionEndGeneration,
      sessionId: endedSessionId
    })
    setModalOpen(true)
    if (broadcast) {
      broadcastInactivityConfirmed(endedSessionId, sessionEndGeneration)
    }
  }, [])

  const runConfirm = useCallback(async () => {
    if (!canRunConfirm(confirming.current, stateKindRef.current)) {
      return
    }
    confirming.current = true
    try {
      await executeConfirmPass({
        applyInactivity: (endedSessionId, sessionEndGeneration) => {
          applyInactivity(endedSessionId, sessionEndGeneration, true)
        },
        confirm: async (payload) => await confirmSessionAction(payload),
        heldGeneration: heldGeneration.current,
        onTransportFailure: () => {
          // Fail closed without inactivity claim; setUnavailable handles UI.
        },
        sessionId,
        setActive: (cookieSessionId) => {
          // Sibling after login-again: cookie sid differs from this mount — reload
          // so layout/island pick up the new authenticated session id.
          if (cookieSessionId !== sessionId) {
            window.location.assign("/")
            return
          }
          setModalOpen(false)
          setState({ kind: "active" })
        },
        setDeadlines,
        setUnavailable: () => {
          setState({ kind: "unavailable" })
          setModalOpen(false)
        }
      })
    } finally {
      confirming.current = false
    }
  }, [applyInactivity, sessionId])

  useEffect(() => {
    if (state.kind !== "active") {
      return
    }

    const delay = nextConfirmDelayMs(
      deadlines.idleExpiresAt,
      deadlines.expiresAt,
      Date.now()
    )
    const timer = window.setTimeout(() => {
      void runConfirm()
    }, delay)

    return () => {
      window.clearTimeout(timer)
    }
  }, [deadlines.expiresAt, deadlines.idleExpiresAt, runConfirm, state.kind])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void runConfirm()
      }
    }
    const onFocus = () => {
      void runConfirm()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onFocus)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onFocus)
    }
  }, [runConfirm])

  const onChannelInactivity = useCallback((
    endedSessionId: string,
    sessionEndGeneration: number
  ) => {
    applyInactivity(endedSessionId, sessionEndGeneration, false)
  }, [applyInactivity])

  useInactivityBroadcast(sessionId, onChannelInactivity)

  return {
    modalOpen,
    runConfirm: () => {
      void runConfirm()
    },
    state
  }
}
