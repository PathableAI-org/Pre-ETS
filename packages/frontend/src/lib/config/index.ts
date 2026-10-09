import { Config, type Types } from "effect"

import { AppEnv } from "./env.ts"
import { type HostTenantConfig, TenantConfig } from "./tenant-config.ts"

export type {
  HostTenantConfig,
  StaticTenantConfig,
  TenantConfig,
  StaticTenantConfig as TenantStaticConfig
} from "./tenant-config.ts"

interface RawEnvironmentWithTenantConfig {
  readonly env: AppEnv
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
    return Config.NonEmptyString("BASE_HOSTNAME").pipe(
      Config.map((baseHostname) =>
        ({
          ...config,
          tenant: {
            baseHostname,
            configDir: config.tenant.configDir,
            resolution: "host"
          }
        }) as Types.Simplify<WithValidatedTenant<T>>
      )
    )
  }
  return Config.succeed(config as Types.Simplify<WithValidatedTenant<T>>)
}

export const ServerConfig = Config.all({
  env: AppEnv,
  tenant: TenantConfig
}).pipe(
  Config.flatMap(validateEnvWithTenantConfig)
)
