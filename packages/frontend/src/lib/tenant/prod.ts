import "server-only"
import { headers } from "next/headers"

import { loadHostBoundTenantConfig, requireHostTenantSlug, requireProcessTenantSource } from "./runtime-shared.ts"
import { createFilesystemTenantSource, type TenantSource } from "./source.ts"
import { CONFIG_UNAVAILABLE, resolveTenantConfigDir, type TenantConfig } from "./types.ts"

let processSource: TenantSource | undefined
let processSourceError: Error | undefined
try {
  processSource = createFilesystemTenantSource(
    resolveTenantConfigDir(process.env.TENANT_CONFIG_DIR),
    {
      allowLoopbackHttp: process.env.BDD_ALLOW_LOOPBACK_HTTP === "1"
    }
  )
} catch (error) {
  processSourceError = error instanceof Error ? error : new Error(CONFIG_UNAVAILABLE)
}

export async function getCurrentTenant(): Promise<string> {
  const host = (await headers()).get("host") ?? undefined
  return requireHostTenantSlug(host, "pathable.com")
}

export async function getCurrentTenantConfig(tenant: string): Promise<TenantConfig> {
  return await loadHostBoundTenantConfig(requireSource(), tenant)
}

function requireSource(): TenantSource {
  return requireProcessTenantSource(processSource, processSourceError)
}
