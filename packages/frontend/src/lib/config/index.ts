import { Config } from "effect"

import { AppEnv } from "./env.ts"
import { TenantConfig } from "./tenant-config.ts"

export type { TenantConfig, StaticTenantConfig as TenantStaticConfig } from "./tenant-config.ts"

export const ServerConfig = Config.all({
  env: AppEnv,
  tenant: TenantConfig
})
