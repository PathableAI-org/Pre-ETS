import "server-only"
import { Effect } from "effect"
import { headers } from "next/headers"
import { cache } from "react"

import { Runtime } from "../../lib/runtime"
import { TenantConfigService } from "../../lib/tenant"

export const requireTenantConfig = cache(async () => {
  const host = (await headers()).get("host") ?? ""
  return Effect.gen(function*() {
    const service = yield* TenantConfigService
    return yield* service.getConfigFromHost(host)
  }).pipe(Runtime.runPromise)
})
