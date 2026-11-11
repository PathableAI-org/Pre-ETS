import type { ReactNode } from "react"

import { readBrowserTracing } from "@pathableai/pre-ets-frontend-services"
import { redirect } from "next/navigation"

import { SessionCoordinator } from "../../features/session-coordination.ts"
import { BrowserTracingMeta } from "../../shared/browser-tracing.ts"
import { readRequestSession } from "./session-request.ts"

export const dynamic = "force-dynamic"

/**
 * Every protected page coordinates its session with the other tabs sharing it. Keyed by session tag, so a new session
 * remounts the coordinator's state and content instead of inheriting an ended view. When browser tracing is on, the
 * document also carries the browser configuration and the trace context of the server's handling of this request.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  // Started first, so it captures the request's trace context before any await.
  const browserTracing = readBrowserTracing()
  const { coordination } = await readRequestSession()
  const document = await browserTracing
  if (coordination === undefined) redirect("/auth/login")
  return (
    <>
      <BrowserTracingMeta document={document} />
      <SessionCoordinator key={coordination.coordinationTag} snapshot={coordination}>
        {children}
      </SessionCoordinator>
    </>
  )
}
