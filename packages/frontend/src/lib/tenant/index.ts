import { Effect, Schema } from "effect"
import "server-only"

import { Runtime } from "../runtime.ts"
import { TenantAlias, type TenantConfig } from "./schema.ts"
import { TenantConfigService } from "./service.ts"

export * from "./alias.ts"
export * from "./config.ts"

export const getTenantResolutionMode = Effect.fnUntraced(
  function*() {
    const service = yield* TenantConfigService
    return service.getTenantResolutionMode()
  }
)

export interface TenantRecord {
  readonly config: TenantConfig
  readonly slug: string
}

/**  Working on refactor */
export function createEnvTenantOperations(
  _env: NodeJS.ProcessEnv = process.env,
  _production?: boolean
): {
  readonly resolve: (
    input: { readonly host: string | undefined }
  ) => Promise<
    | {
      readonly config: TenantConfig
      readonly kind: "ok"
      readonly origin: "host-associated"
      readonly tenantId: string
    }
    | { readonly kind: "config-error"; readonly message: string }
    | { readonly kind: "unknown" }
  >
} {
  const resolve: (
    input: { readonly host: string | undefined }
  ) => Promise<
    | {
      readonly config: TenantConfig
      readonly kind: "ok"
      readonly origin: "host-associated"
      readonly tenantId: string
    }
    | { readonly kind: "config-error"; readonly message: string }
    | { readonly kind: "unknown" }
  > = async (
    input
  ) => {
    const { host } = input
    if (host === undefined) {
      return { kind: "unknown" }
    }

    return await Runtime.runPromise(
      Effect.gen(function*() {
        const service = yield* TenantConfigService
        const alias = yield* service.getAlias(host).pipe(Effect.fromResult)
        const config = yield* service.getConfigFromAlias(alias)

        return { config, kind: "ok", origin: "host-associated", tenantId: alias }
      })
    )
  }

  return { resolve }
}

/**  Working on refactor */
export function getCurrentTenantConfig(tenant: string): Promise<TenantConfig> {
  return Runtime.runPromise(
    Effect.gen(function*() {
      const service = yield* TenantConfigService
      const alias = yield* Schema.decodeEffect(TenantAlias)(tenant)
      return yield* service.getConfigFromAlias(alias)
    })
  )
}

export * from "./schema.ts"
