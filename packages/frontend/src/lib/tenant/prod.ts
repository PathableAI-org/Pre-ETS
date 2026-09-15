import "server-only"
import { headers } from "next/headers"
import { forbidden } from "next/navigation"

import { bindHost } from "./host.ts"
import { parseRecordsJson, type TenantSource } from "./source.ts"
import { CONFIG_UNAVAILABLE, isCanonicalTenantSlug, type TenantConfig } from "./types.ts"

let cachedSource: TenantSource | undefined

export async function getCurrentTenant(): Promise<string> {
  const host = (await headers()).get("host") ?? undefined
  const slug = bindHost(host, "pathable.com")
  if (slug === undefined) {
    forbidden()
  }

  return slug
}

export async function getCurrentTenantConfig(tenant: string): Promise<TenantConfig> {
  if (!isCanonicalTenantSlug(tenant)) {
    forbidden()
  }

  const record = await processSource().readTenantRecord(tenant)
  if (record === undefined) {
    forbidden()
  }

  if (record.slug !== tenant) {
    throw new Error(CONFIG_UNAVAILABLE)
  }

  return record.config
}

function processSource(): TenantSource {
  cachedSource ??= parseRecordsJson(process.env.TENANT_CONFIG_RECORDS_JSON ?? "[]")
  return cachedSource
}
