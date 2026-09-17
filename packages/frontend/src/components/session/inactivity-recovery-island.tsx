"use client"

import { Alert, Container, Page, Stack, Text } from "@pathableai/react"
import { type ReactNode, useEffect, useEffectEvent, useRef, useState } from "react"

import { confirmSessionAction } from "../../app/(app)/session/confirm.ts"
import {
  INACTIVITY_BROADCAST_CHANNEL,
  inactivityConfirmedMessage,
  isInactivityConfirmedMessage
} from "../../lib/session/inactivity-channel.ts"
import { InactivityEndedModal } from "./inactivity-ended-modal.tsx"

export interface InactivityRecoveryIslandProps {
  readonly children: ReactNode
  readonly expiresAt: number
  readonly idleExpiresAt: number
  readonly sessionId: string
}

type RecoveryState =
  | { readonly kind: "active" }
  | {
    readonly kind: "inactivity"
    readonly sessionEndGeneration: number
    readonly sessionId: string
  }
  | { readonly kind: "unavailable" }

/**
 * Deadline-aligned revalidation at min(idleExpiresAt, expiresAt). On confirmed
 * inactivity: remove protected content, open Modal, broadcast to siblings.
 * Confirm/5xx fails closed with generic auth-unavailable (no inactivity claim).
 */
export function InactivityRecoveryIsland({
  children,
  expiresAt,
  idleExpiresAt,
  sessionId
}: InactivityRecoveryIslandProps) {
  const [state, setState] = useState<RecoveryState>({ kind: "active" })
  const [deadlines, setDeadlines] = useState({ expiresAt, idleExpiresAt })
  const heldGeneration = useRef<number | undefined>(undefined)
  const confirming = useRef(false)

  const applyInactivity = useEffectEvent((
    endedSessionId: string,
    sessionEndGeneration: number,
    broadcast: boolean
  ) => {
    heldGeneration.current = sessionEndGeneration
    setState({
      kind: "inactivity",
      sessionEndGeneration,
      sessionId: endedSessionId
    })
    if (broadcast && typeof BroadcastChannel !== "undefined") {
      try {
        const channel = new BroadcastChannel(INACTIVITY_BROADCAST_CHANNEL)
        channel.postMessage(
          inactivityConfirmedMessage(endedSessionId, sessionEndGeneration)
        )
        channel.close()
      } catch {
        // Broadcast is best-effort; latch/confirm covers missed siblings.
      }
    }
  })

  // fallow-ignore-next-line complexity -- confirm outcome: refresh / inactivity / mismatch / fail-closed
  const runConfirm = useEffectEvent(async (_reason: "deadline" | "supplemental") => {
    if (confirming.current || state.kind !== "active") {
      return
    }
    confirming.current = true
    try {
      const result = await confirmSessionAction({
        mountedSessionId: sessionId,
        ...(heldGeneration.current !== undefined
          ? { sessionEndGeneration: heldGeneration.current }
          : {})
      })

      if (result.status === "authenticated") {
        setDeadlines({
          expiresAt: result.expiresAt,
          idleExpiresAt: result.idleExpiresAt
        })
        return
      }

      if (result.status === "ended-inactivity") {
        applyInactivity(result.sessionId, result.sessionEndGeneration, true)
        return
      }

      if (result.status === "unavailable") {
        // Fail closed for visible protected UI — no inactivity claim.
        setState({ kind: "unavailable" })
        return
      }

      // ended-other / mismatch without tombstone — generic unavailable.
      setState({ kind: "unavailable" })
    } catch {
      setState({ kind: "unavailable" })
    } finally {
      confirming.current = false
    }
  })

  useEffect(() => {
    if (state.kind !== "active") {
      return
    }

    const deadlineMs = Math.min(deadlines.idleExpiresAt, deadlines.expiresAt) * 1000
    const delay = Math.max(0, deadlineMs - Date.now())
    const timer = window.setTimeout(() => {
      void runConfirm("deadline")
    }, delay)

    return () => {
      window.clearTimeout(timer)
    }
  }, [deadlines.expiresAt, deadlines.idleExpiresAt, state.kind])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void runConfirm("supplemental")
      }
    }
    const onFocus = () => {
      void runConfirm("supplemental")
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onFocus)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onFocus)
    }
  }, [])

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
      // Receivers MUST ignore foreign session ids.
      if (event.data.sessionId !== sessionId) {
        return
      }
      applyInactivity(event.data.sessionId, event.data.sessionEndGeneration, false)
    }

    return () => {
      channel.close()
    }
  }, [sessionId])

  if (state.kind === "inactivity") {
    return (
      <>
        <InactivityEndedModal open />
      </>
    )
  }

  if (state.kind === "unavailable") {
    return (
      <Page>
        <Container>
          <Stack gap="md">
            <Alert heading="Authorization unavailable" status="warning">
              We could not verify your session. Protected content is locked until access is confirmed.
            </Alert>
            <Text>Try refreshing the page or signing in again.</Text>
          </Stack>
        </Container>
      </Page>
    )
  }

  return <>{children}</>
}
