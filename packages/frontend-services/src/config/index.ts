import { Config } from "effect"

import { AppEnv } from "./env.js"
import { OtelConfig } from "./otel.js"
import { RedisUrl } from "./redis.js"
import { SessionKeyPrefix } from "./session.js"
import { TenantConfig } from "./tenant-config.js"

export { OtelConfig }
export type { OtelSettings } from "./otel.js"
export { SessionKeyPrefix } from "./session.js"
export type { TenantConfig, StaticTenantConfig as TenantStaticConfig } from "./tenant-config.js"

export const ServerConfig = Config.all({
  env: AppEnv,
  redis: Config.all({ url: RedisUrl }),
  session: Config.all({ keyPrefix: SessionKeyPrefix }),
  tenant: TenantConfig
})

/** Process startup settings. URL and protocol selection happen after this decode. */
export const StartupConfig = Config.all({
  logLevel: Config.LogLevel("LOG_LEVEL").pipe(Config.withDefault("Info")),
  otel: OtelConfig,
  server: ServerConfig
})
