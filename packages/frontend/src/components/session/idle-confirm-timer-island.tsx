"use client"

import { Alert, Container, Page, Stack, Text } from "@pathableai/react"
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"

import { confirmSessionAction } from "../../app/(app)/session/confirm.ts"
import { canRunConfirm, executeConfirmPass, nextConfirmDelayMs } from "../../lib/session/confirm-pass.ts"
import { confirmOutcomeHarnessLabel } from "../../lib/session/confirm-result.ts"
import { IdleConfirmHarnessProvider, type IdleConfirmHarnessSnapshot } from "./idle-confirm-harness-context.tsx"

export interface IdleConfirmTimerIslandProps {
  readonly children: ReactNode
  readonly expiresAt: number
  readonly idleExpiresAt: number
  readonly sessionId: string
}

type TimerState =
  | { readonly kind: "active" }
  | {
    readonly kind: "inactivity"
    readonly sessionEndGeneration: number
    readonly sessionId: string
  }
  | { readonly kind: "unavailable" }

/**
 * Deadline-aligned revalidation at min(idleExpiresAt, expiresAt). On confirmed
 * inactivity or fail-closed outcomes: clear/lock protected UI. Modal + BroadcastChannel
 * are intentionally deferred to PR5.
 */
export function IdleConfirmTimerIsland({
  children,
  expiresAt,
  idleExpiresAt,
  sessionId
}: IdleConfirmTimerIslandProps) {
  const [state, setState] = useState<TimerState>({ kind: "active" })
  const [deadlines, setDeadlines] = useState({ expiresAt, idleExpiresAt })
  const [lastOutcomeLabel, setLastOutcomeLabel] = useState("pending")
  const heldGeneration = useRef<number | undefined>(undefined)
  const confirming = useRef(false)
  const stateKindRef = useRef(state.kind)

  useEffect(() => {
    stateKindRef.current = state.kind
  }, [state.kind])

  const runConfirm = useCallback(async () => {
    if (!canRunConfirm(confirming.current, stateKindRef.current)) {
      return
    }
    confirming.current = true
    try {
      await executeConfirmPass({
        applyInactivity: (endedSessionId, sessionEndGeneration) => {
          heldGeneration.current = sessionEndGeneration
          setState({
            kind: "inactivity",
            sessionEndGeneration,
            sessionId: endedSessionId
          })
        },
        confirm: async (payload) => {
          const result = await confirmSessionAction(payload)
          setLastOutcomeLabel(confirmOutcomeHarnessLabel(result))
          return result
        },
        heldGeneration: heldGeneration.current,
        onTransportFailure: () => {
          setLastOutcomeLabel("error (unavailable)")
        },
        sessionId,
        setDeadlines,
        setUnavailable: () => {
          setState({ kind: "unavailable" })
        }
      })
    } finally {
      confirming.current = false
    }
  }, [sessionId])

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

  const nextTimerFireAtMs = state.kind === "active"
    ? Math.min(deadlines.idleExpiresAt, deadlines.expiresAt) * 1000
    : null

  const harnessValue: IdleConfirmHarnessSnapshot = {
    lastOutcomeLabel,
    nextTimerFireAtMs,
    runConfirmNow: () => {
      void runConfirm()
    }
  }

  if (state.kind === "inactivity") {
    return (
      <Page>
        <Container>
          <Stack gap="md">
            {/* TEMP lock shell — PR5 opens PathAble Modal instead of this alone. */}
            <div data-testid="temp-confirm-lock-inactivity">
              <Alert heading="Session ended due to inactivity" status="warning">
                Protected content is locked. The inactivity modal opens in a later change.
              </Alert>
            </div>
            <Text data-testid="temp-confirm-outcome">
              {`Confirm: ${lastOutcomeLabel}`}
            </Text>
          </Stack>
        </Container>
      </Page>
    )
  }

  if (state.kind === "unavailable") {
    return (
      <Page>
        <Container>
          <Stack gap="md">
            <div data-testid="temp-confirm-lock-unavailable">
              <Alert heading="Authorization unavailable" status="warning">
                We could not verify your session. Protected content is locked until access is confirmed.
              </Alert>
            </div>
            <Text data-testid="temp-confirm-outcome">
              {`Confirm: ${lastOutcomeLabel}`}
            </Text>
            <Text>Try refreshing the page or signing in again.</Text>
          </Stack>
        </Container>
      </Page>
    )
  }

  return (
    <IdleConfirmHarnessProvider value={harnessValue}>
      {children}
    </IdleConfirmHarnessProvider>
  )
}
