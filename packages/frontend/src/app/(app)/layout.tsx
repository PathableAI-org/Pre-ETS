import type { ReactNode } from "react"

import { getRequestSession } from "../../lib/session/index.ts"

export default async function AppLayout({ children }: { children: ReactNode }) {
  await getRequestSession()
  return children
}
