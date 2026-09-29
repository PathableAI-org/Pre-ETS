import { NodeServices } from "@effect/platform-node"
import { type Config, ConfigProvider, Effect, Exit, Layer, Logger, ManagedRuntime } from "effect"

import { ServerConfig } from "./config/index.ts"
import { TenantConfigService } from "./tenant/service.ts"

const appLayer = (config: Config.Success<typeof ServerConfig>) =>
  Layer.mergeAll(
    TenantConfigService.layer(config)
  ).pipe(
    Layer.provide(NodeServices.layer)
  )

const bootRuntime = Effect.gen(function*() {
  yield* Effect.logInfo("Loading server config")
  const config = yield* ServerConfig
  yield* Effect.logInfo("Loaded server config")
  const runtime = ManagedRuntime.make(appLayer(config))
  const built = runtime.runSyncExit(Effect.void)
  if (Exit.isFailure(built)) {
    return yield* Effect.failCause(built.cause)
  }
  return runtime
}).pipe(
  Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv())),
  Effect.tapCause((cause) => Effect.logError(cause)),
  Effect.provide(Logger.layer([Logger.consolePretty()]))
)

const exit = Effect.runSyncExit(bootRuntime)
if (Exit.isFailure(exit)) {
  process.exit(1)
}

export const Runtime = exit.value
