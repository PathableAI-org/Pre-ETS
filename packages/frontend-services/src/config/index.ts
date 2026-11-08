/**
 * Process settings. Startup decodes `StartupConfig` once from the environment and passes the plain values to layer
 * factories; no other module reads `Config` or `ConfigProvider`.
 */
import { Config } from "effect"

import { AuthenticationConfig } from "./authentication.js"
import { OtelConfig } from "./otel.js"
import { TenantConfig } from "./tenant-config.js"

export { type AuthenticationSettings, permittedUrl, type TransactionStoreSettings } from "./authentication.js"
export type { OtelSettings } from "./otel.js"
export type { TenantConfig, StaticTenantConfig as TenantStaticConfig } from "./tenant-config.js"

/** NODE_ENV. Absent means development; any other unsupported value fails startup. */
const AppEnv = Config.Literals(["development", "production", "test"], "NODE_ENV").pipe(
  Config.withDefault("development")
)

export type AppEnv = Config.Success<typeof AppEnv>

export interface SessionSettings {
  /** Versioned prefix for frontend-owned session keys. Tests supply an owned prefix. */
  readonly keyPrefix: string
}

export const StartupConfig = Config.all({
  authentication: AuthenticationConfig,
  env: AppEnv,
  logLevel: Config.LogLevel("LOG_LEVEL").pipe(Config.withDefault("Info")),
  otel: OtelConfig,
  /** An absent value uses the local compose instance. */
  redisUrl: Config.String("REDIS_URL").pipe(Config.withDefault("redis://127.0.0.1:6379")),
  session: Config.all({
    keyPrefix: Config.String("SESSION_KEY_PREFIX").pipe(Config.withDefault("preets:session:v1"))
  }),
  tenant: TenantConfig
})

export type StartupSettings = Config.Success<typeof StartupConfig>
