/**
 * Process settings. Startup decodes `StartupConfig` once from the environment and passes the plain values to layer
 * factories; no other module reads `Config` or `ConfigProvider`.
 */
import { Config } from "effect"

import { AuthenticationConfig } from "./config/authentication.js"
import { OtelConfig } from "./config/otel.js"
import { TenantResolutionConfig } from "./config/tenant-resolution.js"

export { type AuthenticationSettings, permittedUrl, type TransactionStoreSettings } from "./config/authentication.js"
export type { OtelEnabled, OtelSettings } from "./config/otel.js"
export type { StaticTenantResolution, TenantResolutionSettings } from "./config/tenant-resolution.js"

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
  tenant: TenantResolutionConfig
})

export type StartupSettings = Config.Success<typeof StartupConfig>
