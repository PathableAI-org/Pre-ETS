import type { ReactNode } from "react"

import { requireTenantConfig } from "./tenant-context"

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireTenantConfig()
  return children
}
