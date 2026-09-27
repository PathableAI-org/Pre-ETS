export interface ServerConfig {
  readonly tenant: TenantConfig
}

export type TenantConfig = TenantHostConfig | TenantStaticConfig

export interface TenantHostConfig extends TenantBaseConfig {
  readonly resolution: "host"
}

export interface TenantStaticConfig extends TenantBaseConfig {
  readonly resolution: "static"
  readonly staticAlias: string
}

interface TenantBaseConfig {
  readonly configDir: string
}
