import { Config, Option, Schema, SchemaIssue, type Types } from "effect"

const _RawTenantConfig = Config.all({
  configDir: Config.NonEmptyString("TENANT_CONFIG_DIR"),
  resolution: Config.Literals(["host", "static"], "TENANT_RESOLUTION"),
  staticAlias: Config.String("TENANT_STATIC_ALIAS").pipe(
    Config.option
  )
})

export interface HostTenantConfig extends BaseTenantConfig {
  readonly resolution: "host"
}

export interface StaticTenantConfig extends BaseTenantConfig {
  readonly resolution: "static"
  readonly staticAlias: string
}

interface BaseTenantConfig {
  readonly configDir: string
}

type TenantConfig = HostTenantConfig | StaticTenantConfig

const validateTenantConfig = (config: Config.Success<typeof _RawTenantConfig>): Config.Config<TenantConfig> => {
  if (config.resolution === "host") {
    return Config.succeed<HostTenantConfig>({
      configDir: config.configDir,
      resolution: "host"
    })
  } else if (Option.isSome(config.staticAlias)) {
    return Config.succeed<StaticTenantConfig>({
      configDir: config.configDir,
      resolution: "static",
      staticAlias: config.staticAlias.value
    })
  } else {
    const issue = new SchemaIssue.MissingKey({
      key: "staticAlias",
      messageMissingKey: "TENANT_STATIC_ALIAS is required when resolution is static"
    })
    return Config.fail(new Schema.SchemaError(issue))
  }
}

export const TenantConfig: Config.Config<Types.Simplify<TenantConfig>> = Config.flatMap(
  _RawTenantConfig,
  validateTenantConfig
)
