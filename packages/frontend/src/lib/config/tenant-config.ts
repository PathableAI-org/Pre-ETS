import { Config, Option, Schema, SchemaIssue, type Types } from "effect"

const _RawTenantConfig = Config.all({
  baseHostname: Config.NonEmptyString("BASE_HOSTNAME").pipe(
    Config.option
  ),
  configDir: Config.NonEmptyString("TENANT_CONFIG_DIR"),
  resolution: Config.Literals(["host", "static"], "TENANT_RESOLUTION"),
  staticAlias: Config.String("TENANT_STATIC_ALIAS").pipe(
    Config.option
  )
})

export interface HostTenantConfig extends BaseTenantConfig {
  readonly baseHostname: string
  readonly resolution: "host"
}

export interface StaticTenantConfig extends BaseTenantConfig {
  readonly resolution: "static"
  readonly staticAlias: string
}

export type TenantConfig = HostTenantConfig | StaticTenantConfig

interface BaseTenantConfig {
  readonly configDir: string
}

const missingKey = (key: string, messageMissingKey: string): Config.Config<TenantConfig> => {
  const issue = new SchemaIssue.MissingKey({
    key,
    messageMissingKey
  })
  return Config.fail(new Schema.SchemaError(issue))
}

const validateTenantConfig = (config: Config.Success<typeof _RawTenantConfig>): Config.Config<TenantConfig> => {
  if (config.resolution === "host") {
    if (Option.isNone(config.baseHostname)) {
      return missingKey("baseHostname", "BASE_HOSTNAME is required when resolution is host")
    }
    return Config.succeed<HostTenantConfig>({
      baseHostname: config.baseHostname.value,
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
    return missingKey("staticAlias", "TENANT_STATIC_ALIAS is required when resolution is static")
  }
}

export const TenantConfig: Config.Config<Types.Simplify<TenantConfig>> = Config.flatMap(
  _RawTenantConfig,
  validateTenantConfig
)
