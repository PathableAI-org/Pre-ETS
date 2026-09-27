import "server-only"
import { forbidden } from "next/navigation"

import { requireProcessTenantSource } from "./runtime-shared.ts"
import { createFilesystemTenantSource, type TenantSource } from "./source.ts"
import {
  CONFIG_UNAVAILABLE,
  LOCAL_CONFIG_ERROR,
  resolveTenantConfigDir,
  resolveTenantStaticAlias,
  type TenantConfig
} from "./types.ts"

const selection = { mode: "static" } as const
if ("diagnostic" in selection) {
  try {
    console.error(JSON.stringify(selection.diagnostic))
  } catch {
    // Logging failure must not change tenant selection.
  }
}

let processSource: TenantSource | undefined
let processSourceError: Error | undefined
try {
  processSource = createFilesystemTenantSource(
    resolveTenantConfigDir(process.env.TENANT_CONFIG_DIR),
    { allowLoopbackHttp: true }
  )
} catch (error) {
  processSourceError = error instanceof Error ? error : new Error(CONFIG_UNAVAILABLE)
}

let cachedStaticAlias: string | undefined

export function getCurrentTenant(): Promise<string> {
  return Promise.resolve(staticAlias())
}

export async function getCurrentTenantConfig(tenant: string): Promise<TenantConfig> {
  const source = requireSource()
  return await loadStaticTenantConfig(source, tenant)
}

async function loadStaticTenantConfig(
  source: TenantSource,
  tenant: string
): Promise<TenantConfig> {
  const alias = staticAlias()
  if (alias !== tenant) {
    forbidden()
  }

  try {
    const record = await source.readTenantRecord(alias)
    if (record?.slug !== alias) {
      throw new Error(LOCAL_CONFIG_ERROR)
    }

    return record.config
  } catch (error) {
    if (error instanceof Error && error.message === LOCAL_CONFIG_ERROR) {
      throw error
    }

    throw new Error(LOCAL_CONFIG_ERROR, { cause: error })
  }
}

function requireSource(): TenantSource {
  return requireProcessTenantSource(
    processSource,
    processSourceError,
    () => new Error(LOCAL_CONFIG_ERROR)
  )
}

function staticAlias(): string {
  cachedStaticAlias ??= resolveTenantStaticAlias(process.env.TENANT_STATIC_ALIAS)
  return cachedStaticAlias
}
