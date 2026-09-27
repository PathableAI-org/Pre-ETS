import { NodeServices } from "@effect/platform-node"
import { Layer, ManagedRuntime } from "effect"

import type { ServerConfig } from "./config"

import { TenantConfigService } from "./tenant/service.ts"

const configDir = process.env.TENANT_CONFIG_DIR ?? ""
const serverConfig: ServerConfig = process.env.NODE_ENV === "production"
  ? {
    tenant: {
      configDir,
      resolution: "host"
    }
  }
  : {
    tenant: {
      configDir,
      resolution: "static",
      staticAlias: process.env.TENANT_STATIC_ALIAS ?? ""
    }
  }

export const Runtime = ManagedRuntime.make(
  TenantConfigService.layer(serverConfig).pipe(
    Layer.provide(NodeServices.layer)
  )
)
