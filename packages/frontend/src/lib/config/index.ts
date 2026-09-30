import { Config, Schema, SchemaIssue, type Types } from "effect"

import { type HostTenantConfig, TenantConfig } from "./tenant-config.ts"

export type {
  HostTenantConfig,
  StaticTenantConfig,
  TenantConfig,
  StaticTenantConfig as TenantStaticConfig
} from "./tenant-config.ts"

interface RawEnvironmentWithTenantConfig {
  readonly env: "development" | "production" | "test"
  readonly tenant: Config.Success<typeof TenantConfig>
}

type WithValidatedTenant<T extends RawEnvironmentWithTenantConfig> =
  | (Omit<T, "env" | "tenant"> & {
    readonly env: "production"
    readonly tenant: HostTenantConfig
  })
  | (Omit<T, "env" | "tenant"> & {
    readonly env: Exclude<T["env"], "production">
    readonly tenant: T["tenant"]
  })

const validateEnvWithTenantConfig = <T extends RawEnvironmentWithTenantConfig>(
  config: T
): Config.Config<Types.Simplify<WithValidatedTenant<T>>> => {
  if (config.env === "production" && config.tenant.resolution === "static") {
    return Config.fail(
      new Schema.SchemaError(
        new SchemaIssue.InvalidValue({
          message: "TENANT_RESOLUTION must be host when env is production"
        })
      )
    )
  }
  return Config.succeed(config as Types.Simplify<WithValidatedTenant<T>>)
}

export const ServerConfig = Config.all({
  env: Config.Literals(["development", "production", "test"], "NODE_ENV").pipe(
    Config.withDefault("development")
  ),
  tenant: TenantConfig
}).pipe(
  Config.flatMap(validateEnvWithTenantConfig)
)
