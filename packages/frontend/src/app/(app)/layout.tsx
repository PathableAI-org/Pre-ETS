import type { ReactNode } from "react"

import { redirect } from "next/navigation"

import { SessionCoordinator } from "../../features/session-coordination.ts"
import { readRequestSession } from "./session-request.ts"

export const dynamic = "force-dynamic"

/** Every protected page coordinates its session with the other tabs sharing it. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { coordination } = await readRequestSession()
  if (coordination === undefined) redirect("/auth/login")
  return <SessionCoordinator snapshot={coordination}>{children}</SessionCoordinator>
}
