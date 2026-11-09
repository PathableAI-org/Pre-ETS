import { Effect } from "effect"

import { type TenantAlias, type TenantConfig, TenantConfigService, type TenantFailure } from "../tenant.js"

/** Whether Fetch Metadata marks the request as a top-level navigation. Absent metadata is `unknown`. */
export type NavigationStatus = "navigation" | "non-navigation" | "unknown"

/**
 * Reads Fetch Metadata only: Next strips Flight headers (`rsc`, prefetch) before the proxy runs.
 * `sec-fetch-mode` decides when present, otherwise `sec-fetch-dest`.
 */
export const navigationStatus = (headers: Headers): NavigationStatus => {
  const mode = headers.get("sec-fetch-mode")
  if (mode !== null) return mode === "navigate" ? "navigation" : "non-navigation"
  const destination = headers.get("sec-fetch-dest")
  if (destination !== null) return destination === "document" ? "navigation" : "non-navigation"
  return "unknown"
}

/** The request tenant: the alias resolved from the Host, then that alias's configuration. */
export const resolveRequestTenant = Effect.fnUntraced(function*(
  host: string
): Effect.fn.Return<
  { readonly alias: TenantAlias; readonly config: TenantConfig },
  TenantFailure,
  TenantConfigService
> {
  const tenant = yield* TenantConfigService
  const alias = yield* Effect.fromResult(tenant.getAlias(host))
  const config = yield* tenant.getConfigFromAlias(alias)
  return { alias, config }
})
