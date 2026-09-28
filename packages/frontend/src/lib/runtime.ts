import { NodeServices } from "@effect/platform-node"
import { Effect, Layer, ManagedRuntime } from "effect"

import { ServerConfig } from "./config/index.ts"
import { TenantConfigService } from "./tenant/service.ts"

const appLayer = TenantConfigService.layer.pipe(
  Layer.provide(ServerConfig.layer),
  Layer.provide(NodeServices.layer)
)

// `next build` evaluates this module while collecting page data, before the
// process that serves the app has TENANT_CONFIG_DIR. `next start` evaluates it again.
if (process.env.NEXT_PHASE !== "phase-production-build") {
  Effect.runSync(
    Effect.gen(function*() {
      yield* ServerConfig
    }).pipe(Effect.provide(ServerConfig.layer))
  )
}

export const Runtime = ManagedRuntime.make(appLayer)
