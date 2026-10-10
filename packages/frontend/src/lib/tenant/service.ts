import { type Config, Context, Effect, FileSystem, Layer, Path, type Result } from "effect"

import type { ServerConfig } from "../config/index.ts"
import type { TenantAlias, TenantConfig, TenantFailure } from "./schema.ts"

import { tenantAliasFromServerConfig } from "./alias.ts"
import { tenantConfigFromAlias } from "./config.ts"

export class TenantConfigService extends Context.Service<TenantConfigService, {
  readonly getAlias: (host: string) => Result.Result<TenantAlias, TenantFailure>
  readonly getConfigFromAlias: (alias: TenantAlias) => Effect.Effect<TenantConfig, TenantFailure>
  readonly getConfigFromHost: (host: string) => Effect.Effect<TenantConfig, TenantFailure>
}>()("@pathableai/pre-ets-frontend/TenantConfigService") {
  static readonly layer = (config: Config.Success<typeof ServerConfig>) =>
    Layer.effect(
      TenantConfigService,
      Effect.gen(function*() {
        const path = yield* Path.Path
        const fs = yield* FileSystem.FileSystem

        const getAlias = tenantAliasFromServerConfig(config.tenant)
        const getConfigFromAlias = tenantConfigFromAlias(config.tenant, path, fs)
        const getConfigFromHost = Effect.fn(function*(host: string) {
          const alias = yield* Effect.fromResult(getAlias(host))
          yield* Effect.annotateCurrentSpan("tenant.alias", alias)
          return yield* getConfigFromAlias(alias)
        })

        return TenantConfigService.of({
          getAlias,
          getConfigFromAlias,
          getConfigFromHost
        })
      })
    )
}
