import "server-only"
import { loadTenantConfig } from "@pathableai/pre-ets-frontend-services"
import { headers } from "next/headers"
import { cache } from "react"

export const requireTenantConfig = cache(async () => {
  const host = (await headers()).get("host") ?? ""
  return loadTenantConfig(host)
})
