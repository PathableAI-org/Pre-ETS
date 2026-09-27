import { Effect, Schema } from "effect"
import "server-only"

import { Runtime } from "../runtime.ts"
import { TenantAlias, type TenantConfig } from "./schema.ts"
import { TenantConfigService } from "./service.ts"

export * from "./alias.ts"
export * from "./config.ts"

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

/**  Use the idleTimeoutMinutes property of the TenantConfig object instead. */
export function effectiveIdleTimeoutMinutes(config: TenantConfig): number {
  return config.idleTimeoutMinutes
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

/**  Working on refactor */
export function hostnameOf(rawHost: string): string | undefined {
  const separator = rawHost.lastIndexOf(":")
  if (separator === -1) {
    return rawHost
  }

  if (rawHost.indexOf(":") !== separator) {
    return undefined
  }

  const hostname = rawHost.slice(0, separator)
  const portText = rawHost.slice(separator + 1)
  if (hostname === "" || !/^[1-9]\d{0,4}$/.test(portText)) {
    return undefined
  }

  const port = Number(portText)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return undefined
  }

  return hostname
}

export * from "./schema.ts"
