"use server"

import type { TenantConfig } from "./types.ts"

export async function getCurrentTenantConfig(tenant: string): Promise<TenantConfig> {
  if (process.env.NODE_ENV === "production") {
    const { readTenantConfig } = await import("./prod.ts")
    return readTenantConfig(tenant)
  }

  const { readTenantConfig } = await import("./dev.ts")
  return readTenantConfig(tenant)
}
