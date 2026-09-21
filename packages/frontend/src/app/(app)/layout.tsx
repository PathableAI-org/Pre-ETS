import type { ReactNode } from "react"

import { IdleActivityIsland } from "../../components/session/idle-activity-island.tsx"
import { getRequestSession } from "../../lib/session/index.ts"

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getRequestSession()
  const authenticated = session.context.userId !== undefined
  const idleExpiresAt = session.context.idleExpiresAt

  if (authenticated && idleExpiresAt !== undefined) {
    return (
      <>
        <IdleActivityIsland />
        {children}
      </>
    )
  }

  return children
}
