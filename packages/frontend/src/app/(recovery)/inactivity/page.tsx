import { headers } from "next/headers"

import { InactivityEndedModal } from "../../../components/session/inactivity-ended-modal.tsx"
import {
  parseSessionContextJson,
  SESSION_CONTEXT_HEADER,
  SESSION_END_GENERATION_HEADER
} from "../../../lib/session/types.ts"

export const dynamic = "force-dynamic"

/**
 * Cause-bearing SSR recovery shell OUTSIDE `(app)` — no getRequestSession auth layout.
 * Proxy forwards inactivity-recovery here with session context + generation headers.
 */
// fallow-ignore-next-line complexity -- header latch parse + unavailable vs modal shell
export default async function InactivityRecoveryPage() {
  const headerStore = await headers()
  const rawContext = headerStore.get(SESSION_CONTEXT_HEADER)
  const rawGeneration = headerStore.get(SESSION_END_GENERATION_HEADER)

  const context = rawContext === null || rawContext === ""
    ? undefined
    : parseSessionContextJson(rawContext)
  const generation = rawGeneration === null || rawGeneration === ""
    ? undefined
    : Number(rawGeneration)

  const hasLatch = context !== undefined
    && context.userId === undefined
    && generation !== undefined
    && Number.isSafeInteger(generation)
    && generation >= 1

  if (!hasLatch) {
    return (
      <main>
        <p>Session recovery is unavailable.</p>
      </main>
    )
  }

  // Server owns cause presentation; Modal is the justified client boundary.
  return (
    <main data-session-end-generation={generation} data-session-id={context.sessionId}>
      <InactivityEndedModal open />
    </main>
  )
}
