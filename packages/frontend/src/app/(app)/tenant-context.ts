import "server-only"
import { Effect, Result } from "effect"
import { headers } from "next/headers"
import { cache } from "react"

import { httpErrorPage } from "../../lib/error.ts"
import { Runtime } from "../../lib/runtime"
import { TenantConfigService } from "../../lib/tenant"

export const requireTenantConfig = cache(async () => {
  const host = (await headers()).get("host") ?? ""
  const result = await Effect.gen(function*() {
    const service = yield* TenantConfigService
    return yield* service.getConfigFromHost(host)
  }).pipe(Effect.result, Runtime.runPromise)

  if (Result.isFailure(result)) httpErrorPage(result.failure)
  return result.success
})
