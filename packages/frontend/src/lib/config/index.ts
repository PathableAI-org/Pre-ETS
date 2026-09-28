import { Config, ConfigProvider, Context, Effect, Layer } from "effect"

export type TenantConfig = TenantHostConfig | TenantStaticConfig

export interface TenantHostConfig extends TenantBaseConfig {
  readonly resolution: "host"
}

export interface TenantStaticConfig extends TenantBaseConfig {
  readonly resolution: "static"
  readonly staticAlias: string
}

interface TenantBaseConfig {
  readonly configDir: string
}

const tenantConfigurationUnavailable = new ConfigProvider.SourceError({
  message: "Tenant configuration is unavailable."
})

const tenantConfigDir = Config.String("TENANT_CONFIG_DIR").pipe(
  Config.map((value) => value.trim()),
  Config.orElse(() => Config.succeed("")),
  Config.mapEffect((value) =>
    value === ""
      ? Effect.fail(new Config.ConfigError(tenantConfigurationUnavailable))
      : Effect.succeed(value)
  )
)

const nodeEnv = Config.String("NODE_ENV").pipe(Config.withDefault("development"))

const tenantStaticAlias = Config.String("TENANT_STATIC_ALIAS").pipe(Config.withDefault(""))

export class ServerConfig extends Context.Service<ServerConfig, {
  readonly tenant: TenantConfig
}>()("@pathableai/pre-ets-frontend/ServerConfig") {
  static readonly layer = Layer.effect(
    ServerConfig,
    Effect.gen(function*() {
      // The default ConfigProvider reference snapshots process.env once per process.
      // Parse a fresh provider so each layer build reads the environment at construction.
      const provider = ConfigProvider.fromEnv()
      const configDir = yield* tenantConfigDir.parse(provider)
      const env = yield* nodeEnv.parse(provider)

      if (env === "production") {
        return ServerConfig.of({
          tenant: {
            configDir,
            resolution: "host"
          }
        })
      }

      const staticAlias = yield* tenantStaticAlias.parse(provider)
      return ServerConfig.of({
        tenant: {
          configDir,
          resolution: "static",
          staticAlias
        }
      })
    })
  )
}
