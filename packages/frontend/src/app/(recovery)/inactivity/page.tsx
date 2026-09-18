import { headers } from "next/headers"

import { InactivityEndedModal } from "../../../components/session/inactivity-ended-modal.tsx"
import { parseInactivityRecoveryLatch } from "../../../lib/session/inactivity-recovery.ts"
import { SESSION_CONTEXT_HEADER, SESSION_END_GENERATION_HEADER } from "../../../lib/session/types.ts"

export const dynamic = "force-dynamic"

/**
 * Cause-bearing SSR recovery shell OUTSIDE `(app)` — no getRequestSession auth layout.
 * Proxy forwards inactivity-recovery here with session context + generation headers.
 */
export default async function InactivityRecoveryPage() {
  const headerStore = await headers()
  const latch = parseInactivityRecoveryLatch(
    headerStore.get(SESSION_CONTEXT_HEADER),
    headerStore.get(SESSION_END_GENERATION_HEADER)
  )

  if (latch === undefined) {
    return <UnavailableRecovery />
  }

  // Server owns cause presentation; Modal is the justified client boundary.
  return (
    <main data-session-end-generation={latch.generation} data-session-id={latch.sessionId}>
      <InactivityEndedModal open />
    </main>
  )
}

function UnavailableRecovery() {
  return (
    <main>
      <p>Session recovery is unavailable.</p>
    </main>
  )
}
