import { Config } from "effect"

import { AppEnv } from "./env.ts"
import { RedisUrl } from "./redis.ts"
import { SessionKeyPrefix } from "./session.ts"
import { TenantConfig } from "./tenant-config.ts"

export { OtelConfig } from "./otel.ts"
export { SessionKeyPrefix } from "./session.ts"
export type { TenantConfig, StaticTenantConfig as TenantStaticConfig } from "./tenant-config.ts"

export const ServerConfig = Config.all({
  env: AppEnv,
  redis: Config.all({ url: RedisUrl }),
  session: Config.all({ keyPrefix: SessionKeyPrefix }),
  tenant: TenantConfig
})
