import "server-only"
import { headers } from "next/headers"
import { forbidden } from "next/navigation"

import { bindHost } from "./host.ts"
import { parseRecordsJson, type TenantSource } from "./source.ts"
import {
  CONFIG_UNAVAILABLE,
  isCanonicalTenantSlug,
  parseLocalConfigJson,
  selectTenantMode,
  type TenantConfig,
  type TenantRecord
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

let cachedHostSource: TenantSource | undefined
let cachedStaticRecord: TenantRecord | undefined

export async function getCurrentTenant(): Promise<string> {
  if (staticMode) {
    return staticRecord().slug
  }

  const host = (await headers()).get("host") ?? undefined
  const slug = bindHost(host, "localhost")
  if (slug === undefined) {
    forbidden()
  }

  return slug
}

export async function getCurrentTenantConfig(tenant: string): Promise<TenantConfig> {
  if (!isCanonicalTenantSlug(tenant)) {
    forbidden()
  }

  if (staticMode) {
    const record = staticRecord()
    if (record.slug !== tenant) {
      forbidden()
    }

    return record.config
  }

  const record = await hostSource().readTenantRecord(tenant)
  if (record === undefined) {
    forbidden()
  }

  if (record.slug !== tenant) {
    throw new Error(CONFIG_UNAVAILABLE)
  }

  return record.config
}

function hostSource(): TenantSource {
  cachedHostSource ??= parseRecordsJson(process.env.TENANT_CONFIG_RECORDS_JSON ?? "[]")
  return cachedHostSource
}

function staticRecord(): TenantRecord {
  cachedStaticRecord ??= parseLocalConfigJson(process.env.TENANT_LOCAL_CONFIG_JSON)
  return cachedStaticRecord
}
