import { Config, Option, type Types } from "effect"

import { type HostTenantConfig, TenantConfig } from "./tenant-config.ts"

export type {
  HostTenantConfig,
  StaticTenantConfig,
  TenantConfig,
  StaticTenantConfig as TenantStaticConfig
} from "./tenant-config.ts"

export const DEFAULT_OTEL_SERVICE_NAME = "pre-ets-frontend"

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
    return Config.succeed({
      ...config,
      tenant: {
        configDir: config.tenant.configDir,
        resolution: "host"
      }
    } as Types.Simplify<WithValidatedTenant<T>>)
  }
  return Config.succeed(config as Types.Simplify<WithValidatedTenant<T>>)
}

/** Blank/whitespace-only values count as absent (presence gate only). */
const presentOtlpEndpoint = Config.String("OTEL_EXPORTER_OTLP_ENDPOINT").pipe(
  Config.option,
  Config.map((endpoint) => {
    if (Option.isNone(endpoint)) {
      return Option.none<string>()
    }
    const trimmed = endpoint.value.trim()
    return trimmed === "" ? Option.none() : Option.some(trimmed)
  })
)

export const ServerConfig = Config.all({
  env: Config.Literals(["development", "production", "test"], "NODE_ENV").pipe(
    Config.withDefault("development")
  ),
  otel: Config.all({
    exporterOtlpEndpoint: presentOtlpEndpoint,
    serviceName: Config.String("OTEL_SERVICE_NAME").pipe(
      Config.withDefault(DEFAULT_OTEL_SERVICE_NAME)
    )
  }),
  tenant: TenantConfig
}).pipe(
  Config.flatMap(validateEnvWithTenantConfig)
)
