import "server-only"
import { headers } from "next/headers"
import { forbidden } from "next/navigation"

import { loadHostBoundTenantConfig, requireHostTenantSlug, requireProcessTenantSource } from "./runtime-shared.ts"
import { createFilesystemTenantSource, type TenantSource } from "./source.ts"
import {
  CONFIG_UNAVAILABLE,
  LOCAL_CONFIG_ERROR,
  resolveTenantConfigDir,
  resolveTenantStaticAlias,
  selectTenantMode,
  type TenantConfig
} from "./types.ts"

const selection = selectTenantMode(process.env.TENANT_RESOLUTION)
if ("diagnostic" in selection) {
  try {
    console.error(JSON.stringify(selection.diagnostic))
  } catch {
    // Logging failure must not change tenant selection.
  }
}

const staticMode = selection.mode === "static"

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

export async function getCurrentTenant(): Promise<string> {
  if (staticMode) {
    return staticAlias()
  }

  const host = (await headers()).get("host") ?? undefined
  return requireHostTenantSlug(host, "localhost")
}

export async function getCurrentTenantConfig(tenant: string): Promise<TenantConfig> {
  const source = requireSource()
  if (!staticMode) {
    return await loadHostBoundTenantConfig(source, tenant)
  }

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
