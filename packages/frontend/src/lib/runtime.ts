import type { OtelTracer } from "@effect/opentelemetry"

import { NodeServices } from "@effect/platform-node"
import { type Config, ConfigProvider, Effect, Exit, Layer, Logger, ManagedRuntime } from "effect"

import { ServerConfig } from "./config/index.ts"
import { effectObservabilityBridgeLayer, isNextProductionBuildPhase } from "./observability/register.ts"
import { TenantConfigService } from "./tenant/service.ts"

type ObservabilityLayer =
  | Layer.Layer<never>
  | Layer.Layer<OtelTracer.OtelTracer>

const appLayer = (
  config: Config.Success<typeof ServerConfig>,
  observabilityLayer: ObservabilityLayer
) =>
  Layer.mergeAll(
    TenantConfigService.layer(config)
  ).pipe(
    Layer.provide(NodeServices.layer),
    Layer.provideMerge(observabilityLayer)
  )

const bootRuntime = Effect.gen(function*() {
  yield* Effect.logInfo("Loading server config")
  const config = yield* ServerConfig
  yield* Effect.logInfo("Loaded server config")

  const observabilityLayer: ObservabilityLayer = isNextProductionBuildPhase()
    ? Layer.empty
    : effectObservabilityBridgeLayer()

  const runtime = ManagedRuntime.make(appLayer(config, observabilityLayer))
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

const nextProductionBuildPhase = "phase-production-build"

const startServerRuntime = () => {
  const exit = Effect.runSyncExit(bootRuntime)
  if (Exit.isFailure(exit)) {
    process.exit(1)
  }
  return exit.value
}

type ServerRuntime = ReturnType<typeof startServerRuntime>

const unavailableDuringNextBuild: ServerRuntime = new Proxy({} as ServerRuntime, {
  get(_target, property) {
    throw new Error(
      `Server runtime (${String(property)}) is not loaded during the Next.js production build.`
    )
  }
})

// Next loads this module while collecting page data. NEXT_PHASE is set before those
// workers start, and a missing tenant directory must not stop the build.
export const Runtime = process.env.NEXT_PHASE === nextProductionBuildPhase
  ? unavailableDuringNextBuild
  : startServerRuntime()
