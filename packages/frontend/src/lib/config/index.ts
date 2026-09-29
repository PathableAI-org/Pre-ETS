import { Config, ConfigProvider, Effect } from "effect"

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

const _tenantConfigDir = Config.String("TENANT_CONFIG_DIR").pipe(
  Config.map((value) => value.trim()),
  Config.orElse(() => Config.succeed("")),
  Config.mapEffect((value) =>
    value === ""
      ? Effect.fail(new Config.ConfigError(tenantConfigurationUnavailable))
      : Effect.succeed(value)
  )
)

const _nodeEnv = Config.String("NODE_ENV").pipe(Config.withDefault("development"))

const _tenantStaticAlias = Config.String("TENANT_STATIC_ALIAS").pipe(Config.withDefault(""))

const _tenantConfig = Config.all({
  configDir: Config.String("CONFIG_DIR")
})

export const ServerConfig = Config.all({
  // tenant: Config.nested(_tenantConfig, "TENANT"),
  env: Config.Literals(["development", "production", "test"], "NODE_ENV").pipe(
    Config.withDefault("development")
  )
})
