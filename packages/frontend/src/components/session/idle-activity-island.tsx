"use client"

import { useEffect, useRef } from "react"

import { recordActivityAction } from "../../app/(app)/session/activity.ts"

const DEBOUNCE_MS = 1_000

/**
 * Reports deliberate user-originated DOM activity (`event.isTrusted === true`) to the
 * server. Does not renew on bare scroll, untrusted/scripted events, polling, or prefetch.
 * Client debounce must not create grace past the server idle deadline.
 */
export function IdleActivityIsland() {
  const lastSentAt = useRef(0)
  const inFlight = useRef(false)

  useEffect(() => {
    const report = () => {
      const now = Date.now()
      if (inFlight.current || now - lastSentAt.current < DEBOUNCE_MS) {
        return
      }
      inFlight.current = true
      lastSentAt.current = now
      void recordActivityAction().finally(() => {
        inFlight.current = false
      })
    }

    const onTrusted = (event: Event) => {
      if (!event.isTrusted) {
        return
      }
      report()
    }

    // Qualifying: keydown, pointerdown, touchstart, trusted wheel (scroll driven by user).
    // MUST NOT listen to bare `scroll` alone.
    const windowTargets: (keyof WindowEventMap)[] = [
      "keydown",
      "pointerdown",
      "touchstart",
      "wheel"
    ]

    for (const type of windowTargets) {
      window.addEventListener(type, onTrusted, { capture: true, passive: true })
    }

    return () => {
      for (const type of windowTargets) {
        window.removeEventListener(type, onTrusted, { capture: true })
      }
    }
  }, [])

  return null
}
