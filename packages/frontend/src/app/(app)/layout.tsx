import type { ReactNode } from "react"

import { IdleActivityIsland } from "../../components/session/idle-activity-island.tsx"
import { IdleConfirmTimerIsland } from "../../components/session/idle-confirm-timer-island.tsx"
import { getRequestSession } from "../../lib/session/index.ts"

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getRequestSession()
  const authenticated = session.context.userId !== undefined
  const idleExpiresAt = session.context.idleExpiresAt

  if (authenticated && idleExpiresAt !== undefined) {
    return (
      <IdleConfirmTimerIsland
        expiresAt={session.context.expiresAt}
        idleExpiresAt={idleExpiresAt}
        sessionId={session.context.sessionId}
      >
        <IdleActivityIsland />
        {children}
      </IdleConfirmTimerIsland>
    )
  }

  return children
}
