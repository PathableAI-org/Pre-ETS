import "server-only"
import { forbidden } from "next/navigation"

import type { TenantSource } from "./source.ts"

import { bindHost } from "./host.ts"
import { CONFIG_UNAVAILABLE, type HostSuffix, isCanonicalTenantSlug, type TenantConfig } from "./types.ts"

export async function loadHostBoundTenantConfig(
  source: TenantSource,
  tenant: string
): Promise<TenantConfig> {
  if (!isCanonicalTenantSlug(tenant)) {
    forbidden()
  }

  const record = await source.readTenantRecord(tenant)
  if (record === undefined) {
    forbidden()
  }

  if (record.slug !== tenant) {
    throw new Error(CONFIG_UNAVAILABLE)
  }

  return record.config
}

export function requireHostTenantSlug(
  host: string | undefined,
  suffix: HostSuffix
): string {
  const slug = bindHost(host, suffix)
  if (slug === undefined) {
    forbidden()
  }

  return slug
}

export function requireProcessTenantSource(
  processSource: TenantSource | undefined,
  processSourceError: Error | undefined,
  onCachedError: (error: Error) => Error = (error) => error
): TenantSource {
  if (processSourceError !== undefined) {
    throw onCachedError(processSourceError)
  }

  if (processSource === undefined) {
    throw new Error(CONFIG_UNAVAILABLE)
  }

  return processSource
}
