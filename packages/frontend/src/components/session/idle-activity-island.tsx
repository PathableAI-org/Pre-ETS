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
  const stopped = useRef(false)

  useEffect(() => {
    // Qualifying: keydown, pointerdown, touchstart, trusted wheel (scroll driven by user).
    // MUST NOT listen to bare `scroll` alone.
    const windowTargets: (keyof WindowEventMap)[] = [
      "keydown",
      "pointerdown",
      "touchstart",
      "wheel"
    ]

    let attached = true

    const detach = () => {
      if (!attached) {
        return
      }
      attached = false
      for (const type of windowTargets) {
        window.removeEventListener(type, onTrusted, { capture: true })
      }
    }

    const report = () => {
      if (stopped.current || inFlight.current) {
        return
      }
      const now = Date.now()
      if (now - lastSentAt.current < DEBOUNCE_MS) {
        return
      }
      inFlight.current = true
      lastSentAt.current = now
      void recordActivityAction()
        .then((result) => {
          if (!result.ok) {
            // Expired / cleared / cookie / store denial — do not keep renewing.
            stopped.current = true
            detach()
          }
        })
        .catch(() => {
          // Swallow transport/config failures so the browser does not see an
          // unhandled rejection; leave listeners attached for a later retry.
        })
        .finally(() => {
          inFlight.current = false
        })
    }

    function onTrusted(event: Event) {
      if (!event.isTrusted) {
        return
      }
      report()
    }

    for (const type of windowTargets) {
      window.addEventListener(type, onTrusted, { capture: true, passive: true })
    }

    return detach
  }, [])

  return null
}
