import { Context, Effect, FileSystem, flow, Layer, Path, type Result } from "effect"

import type { TenantAlias, TenantConfig, TenantConfigError } from "./schema.ts"

import { ServerConfig } from "../config/index.ts"
import { tenantAliasFromServerConfig } from "./alias.ts"
import { tenantConfigFromAlias } from "./config.ts"

export class TenantConfigService extends Context.Service<TenantConfigService, {
  readonly getAlias: (host: string) => Result.Result<TenantAlias, TenantConfigError>
  readonly getConfigFromAlias: (alias: TenantAlias) => Effect.Effect<TenantConfig, TenantConfigError>
  readonly getConfigFromHost: (host: string) => Effect.Effect<TenantConfig, TenantConfigError>
}>()("@pathableai/pre-ets-frontend/TenantConfigService") {
  static readonly layer = Layer.effect(
    TenantConfigService,
    Effect.gen(function*() {
      const config = yield* ServerConfig
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
