/**
 * Process settings. Startup decodes `StartupConfig` once from the environment and passes the plain values to layer
 * factories; no other module reads `Config` or `ConfigProvider`.
 */
import { Config, Redacted, Schema } from "effect"

import { authenticationConfig } from "./config/authentication.js"
import { otelConfig } from "./config/otel.js"
import { TenantResolutionConfig } from "./config/tenant-resolution.js"

export { type AuthenticationSettings, permittedUrl, type TransactionStoreSettings } from "./config/authentication.js"
export type { BrowserTracingSettings, OtelEnabled, OtelSettings } from "./config/otel.js"

/**
 * Decodes a setting whose supplied value must never appear in an error: a secret, or a setting whose contract
 * forbids echoing it. Decoding goes through `Schema.Redacted`, as `Config.Redacted` does, so a failure names the
 * setting and never quotes the input; the decoded value is then unwrapped. A setting that must stay hidden after
 * startup decodes to `Redacted` itself (`Schema.RedactedFromValue`). This is the config module's one redacting
 * helper; the child recipes receive it as an argument.
 */
const withoutEcho = <A>(name: string, codec: Schema.Codec<A, string>): Config.Config<A> =>
  Config.schema(Schema.Redacted(codec), name).pipe(Config.map(Redacted.value))
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
  authentication: authenticationConfig(withoutEcho),
  env: AppEnv,
  logLevel: Config.LogLevel("LOG_LEVEL").pipe(Config.withDefault("Info")),
  otel: otelConfig(withoutEcho),
  /** An absent value uses the local compose instance. */
  redisUrl: Config.String("REDIS_URL").pipe(Config.withDefault("redis://127.0.0.1:6379")),
  session: Config.all({
    keyPrefix: Config.String("SESSION_KEY_PREFIX").pipe(Config.withDefault("preets:session:v1"))
  }),
  tenant: TenantResolutionConfig
})

export type StartupSettings = Config.Success<typeof StartupConfig>
