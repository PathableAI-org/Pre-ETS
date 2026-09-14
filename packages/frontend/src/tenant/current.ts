import "server-only"
import { headers } from "next/headers"
import { cache } from "react"

import { decodeTenantHandoff } from "./handoff.ts"
import { type CurrentTenantContext, fail, type TenantConfig, type TenantResult } from "./model.ts"
import { readBoundTenant } from "./resolve.ts"
import { getProcessTenantSettings } from "./settings.ts"

export const getCurrentTenant = cache(async (): Promise<CurrentTenantContext> => {
  const result = await readCurrentTenant()
  if (!result.ok) {
    throw new Error(`Tenant context failed: ${result.reason}`)
  }

  return result.value
})

export async function getCurrentTenantConfig(): Promise<TenantConfig> {
  const tenant = await getCurrentTenant()
  return tenant.config
}

async function readCurrentTenant(): Promise<TenantResult<CurrentTenantContext>> {
  const settings = getProcessTenantSettings()
  if (!settings.ok) {
    return fail(settings.reason)
  }

  const requestHeaders = await headers()
  const bound = decodeTenantHandoff(requestHeaders, settings.value.mode)
  if (!bound.ok) {
    return bound
  }

  return readBoundTenant({
    origin: bound.value.origin,
    slug: bound.value.slug,
    source: settings.value.source
  })
}
