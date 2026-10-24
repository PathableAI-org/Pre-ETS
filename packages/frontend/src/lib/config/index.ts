import { Config } from "effect"

import { AppEnv } from "./env.ts"
import { OtelConfig } from "./otel.ts"
import { RedisUrl } from "./redis.ts"
import { SessionKeyPrefix } from "./session.ts"
import { TenantConfig } from "./tenant-config.ts"

export { OtelConfig }
export type { OtelSettings } from "./otel.ts"
export { SessionKeyPrefix } from "./session.ts"
export type { TenantConfig, StaticTenantConfig as TenantStaticConfig } from "./tenant-config.ts"

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
