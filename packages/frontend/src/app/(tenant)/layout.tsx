import type { ReactNode } from "react"

import { getCurrentTenant, getCurrentTenantConfig } from "../../lib/tenant/index.ts"

export default async function TenantLayout({ children }: { children: ReactNode }) {
  const tenant = await getCurrentTenant()
  await getCurrentTenantConfig(tenant)
  return children
}
