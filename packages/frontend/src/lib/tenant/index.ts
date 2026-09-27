import { Context, Effect, FileSystem, flow, Layer, Path, type Result } from "effect"
import "server-only"

import type { ServerConfig } from "../config/index.ts"
import type { TenantAlias, TenantConfig, TenantConfigError } from "./schema.ts"

import { tenantAliasFromServerConfig } from "./alias.ts"
import { tenantConfigFromAlias } from "./config.ts"
import * as operations from "./operations.ts"

const tenantRuntime = process.env.NODE_ENV === "development"
  ? await import("./dev.ts")
  : await import("./prod.ts")

export const getCurrentTenant = tenantRuntime.getCurrentTenant

export * from "./alias.ts"
export * from "./config.ts"

export class TenantConfigService extends Context.Service<TenantConfigService, {
  readonly getAlias: (host: string) => Result.Result<TenantAlias, TenantConfigError>
  readonly getConfigFromAlias: (alias: TenantAlias) => Effect.Effect<TenantConfig, TenantConfigError>
  readonly getConfigFromHost: (host: string) => Effect.Effect<TenantConfig, TenantConfigError>
}>()("@pathableai/pre-ets-frontend/TenantConfigService") {
  static readonly layer = (
    config: ServerConfig
  ) =>
    Layer.effect(
      TenantConfigService,
      Effect.gen(function*() {
        const path = yield* Path.Path
        const fs = yield* FileSystem.FileSystem

        const getAlias = tenantAliasFromServerConfig(config.tenant)
        const getConfigFromAlias = tenantConfigFromAlias(config.tenant, path, fs)
        const getConfigFromHost = flow(
          getAlias,
          Effect.fromResult,
          Effect.flatMap((alias) => getConfigFromAlias(alias))
        )

        return TenantConfigService.of({
          getAlias,
          getConfigFromAlias,
          getConfigFromHost
        })
      })
    )
}

/**  Use the idleTimeoutMinutes property of the TenantConfig object instead. */
export function effectiveIdleTimeoutMinutes(config: TenantConfig): number {
  return config.idleTimeoutMinutes
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

/**  Working on refactor */
export const getCurrentTenantConfig = tenantRuntime.getCurrentTenantConfig

/**  Working on refactor */
export const createEnvTenantOperations = operations.createEnvTenantOperations

export * from "./schema.ts"
