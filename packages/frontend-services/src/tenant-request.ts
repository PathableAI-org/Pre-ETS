import { Effect, Result } from "effect"
import { NextResponse } from "next/server"

import { tenantFailureJson, tenantFailurePage } from "./error.js"
import { Runtime } from "./runtime.js"
import { type TenantConfig, TenantConfigService } from "./tenant.js"

const noStore = { "Cache-Control": "private, no-store" }

const readTenantConfig = (host: string) =>
  Runtime.runPromise(TenantConfigService.use((service) => service.getConfigFromHost(host)).pipe(Effect.result))

export const loadTenantConfig = async (host: string): Promise<TenantConfig> => {
  const result = await readTenantConfig(host)
  if (Result.isFailure(result)) tenantFailurePage(result.failure)
  return result.success
}

export const tenantConfigResponse = async (host: string): Promise<NextResponse> => {
  const result = await readTenantConfig(host)
  if (Result.isFailure(result)) return tenantFailureJson(result.failure, noStore)
  return NextResponse.json(result.success, {
    headers: noStore,
    status: 200
  })
}
