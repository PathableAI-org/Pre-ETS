import type { ApplicationRuntime, TenantFailureReason, TenantMode } from "./model.ts"

export const CACHE_CONTROL = "private, no-store"
export const ACCESS_DENIED = "Access denied."
export const CONFIG_UNAVAILABLE = "Tenant configuration is unavailable."
export const CONFIG_TEMPORARILY_UNAVAILABLE = "Tenant configuration is temporarily unavailable."
export const LOCAL_CONFIG_ERROR =
  "Supply a valid TENANT_LOCAL_CONFIG_JSON record with slug and Display Name, then restart."

export interface MappedTenantResponse {
  readonly body: string
  readonly headers: {
    readonly "Cache-Control": typeof CACHE_CONTROL
    readonly "Content-Type": "text/plain; charset=utf-8"
  }
  readonly status: 403 | 500 | 503
}

export function mapTenantFailureToResponse(
  reason: TenantFailureReason,
  options: {
    readonly mode: TenantMode
    readonly runtime: ApplicationRuntime
  }
): MappedTenantResponse {
  const headers = {
    "Cache-Control": CACHE_CONTROL,
    "Content-Type": "text/plain; charset=utf-8"
  } as const

  if (reason === "invalid-host" || reason === "unknown-tenant") {
    return { body: ACCESS_DENIED, headers, status: 403 }
  }

  if (reason === "config-unavailable") {
    return { body: CONFIG_TEMPORARILY_UNAVAILABLE, headers, status: 503 }
  }

  if (options.runtime === "development" && options.mode === "static") {
    return { body: LOCAL_CONFIG_ERROR, headers, status: 500 }
  }

  return { body: CONFIG_UNAVAILABLE, headers, status: 500 }
}
