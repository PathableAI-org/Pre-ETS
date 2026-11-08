import { Config, Option, Schema, SchemaIssue, type Types } from "effect"

const RawTenantResolution = Config.all({
  baseHostname: Config.NonEmptyString("BASE_HOSTNAME").pipe(
    Config.option
  ),
  configDir: Config.NonEmptyString("TENANT_CONFIG_DIR"),
  resolution: Config.Literals(["host", "static"], "TENANT_RESOLUTION"),
  staticAlias: Config.String("TENANT_STATIC_ALIAS").pipe(
    Config.option
  )
})

export interface BaseTenantResolution {
  readonly configDir: string
}

export interface HostTenantResolution extends BaseTenantResolution {
  readonly baseHostname: string
  readonly resolution: "host"
}

export interface StaticTenantResolution extends BaseTenantResolution {
  readonly resolution: "static"
  readonly staticAlias: string
}

export type TenantResolutionSettings = HostTenantResolution | StaticTenantResolution

const missingKey = (key: string, messageMissingKey: string): Config.Config<TenantResolutionSettings> => {
  const issue = new SchemaIssue.MissingKey({
    key,
    messageMissingKey
  })
  return Config.fail(new Schema.SchemaError(issue))
}

const validateTenantResolution = (
  config: Config.Success<typeof RawTenantResolution>
): Config.Config<TenantResolutionSettings> => {
  if (config.resolution === "host") {
    if (Option.isNone(config.baseHostname)) {
      return missingKey("baseHostname", "BASE_HOSTNAME is required when resolution is host")
    }
    return Config.succeed<HostTenantResolution>({
      baseHostname: config.baseHostname.value,
      configDir: config.configDir,
      resolution: "host"
    })
  } else if (Option.isSome(config.staticAlias)) {
    return Config.succeed<StaticTenantResolution>({
      configDir: config.configDir,
      resolution: "static",
      staticAlias: config.staticAlias.value
    })
  } else {
    return missingKey("staticAlias", "TENANT_STATIC_ALIAS is required when resolution is static")
  }
}

export const TenantResolutionConfig: Config.Config<Types.Simplify<TenantResolutionSettings>> = Config.flatMap(
  RawTenantResolution,
  validateTenantResolution
)
