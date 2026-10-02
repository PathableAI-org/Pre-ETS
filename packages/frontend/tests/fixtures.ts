import { fileURLToPath } from "node:url"

import type * as ServerConfig from "../src/lib/config/index.ts"

const configDir = fileURLToPath(new URL("../fixtures/tenant-config", import.meta.url))

const BaseServerConfig: ServerConfig.ServerConfig = {
  baseHostname: "localhost",
  env: "test",
  tenant: {
    configDir,
    resolution: "host"
  }
}

export interface ServerConfigOverride {
  readonly baseHostname?: string
  readonly env?: ServerConfig.ServerConfig["env"]
  readonly tenant?: TenantOverride
}

type TenantOverride = {
  readonly configDir?: string
  readonly resolution: "static"
  readonly staticAlias: string
} | {
  readonly configDir?: string
  readonly resolution?: "host"
}

export const buildServerConfig = (overrides: ServerConfigOverride = {}): ServerConfig.ServerConfig => {
  const env = overrides.env ?? BaseServerConfig.env
  const baseHostname = overrides.baseHostname ?? BaseServerConfig.baseHostname
  const configDir = overrides.tenant?.configDir ?? BaseServerConfig.tenant.configDir

  if (env === "production") {
    return {
      baseHostname,
      env,
      tenant: {
        configDir,
        resolution: "host"
      }
    }
  }

  if (overrides.tenant?.resolution === "static") {
    return {
      baseHostname,
      env,
      tenant: {
        configDir,
        resolution: "static",
        staticAlias: overrides.tenant.staticAlias
      }
    }
  }

  return {
    baseHostname,
    env,
    tenant: {
      configDir,
      resolution: "host"
    }
  }
}
