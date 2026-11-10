import type { ReactNode } from "react"

import { redirect } from "next/navigation"

import { SessionCoordinator } from "../../features/session-coordination.ts"
import { readRequestSession } from "./session-request.ts"

export const dynamic = "force-dynamic"

/**
 * Every protected page coordinates its session with the other tabs sharing it. Keyed by session tag, so a new session
 * remounts the coordinator's state and content instead of inheriting an ended view.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { coordination } = await readRequestSession()
  if (coordination === undefined) redirect("/auth/login")
  return (
    <SessionCoordinator key={coordination.coordinationTag} snapshot={coordination}>
      {children}
    </SessionCoordinator>
  )
}
