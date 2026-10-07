import { OtelTracer, Resource } from "@effect/opentelemetry"
import { NodeServices } from "@effect/platform-node"
import { registerOTel } from "@vercel/otel"
import { Config, ConfigProvider, Effect, Layer, Logger, ManagedRuntime, References } from "effect"

import { ServerConfig } from "./config/index.ts"
import { TenantConfigService } from "./tenant/service.ts"

const OTEL_SERVICE_NAME = "pre-ets-frontend"

const MinimumLogLevelLayer = Layer.effect(
  References.MinimumLogLevel,
  Config.LogLevel("LOG_LEVEL").pipe(
    Config.withDefault("Info")
  )
)

const LoggerLayer = Layer.mergeAll(
  Logger.layer([Logger.consolePretty()]),
  MinimumLogLevelLayer
)

const ObservabilityLayer = Layer.unwrap(
  Effect.sync(() => {
    registerOTel({
      serviceName: OTEL_SERVICE_NAME,
      traceSampler: "always_on"
    })
    return OtelTracer.layerGlobal.pipe(
      Layer.provide(Resource.layer({ serviceName: OTEL_SERVICE_NAME }))
    )
  })
)

const boot = () => {
  // ConfigProvider.fromEnv() snapshots process.env at construction time. Build a
  // fresh provider per boot so Vitest env stubs / TENANT_CONFIG_DIR resets apply.
  const configProviderLayer = ConfigProvider.layer(ConfigProvider.fromEnv())

  return Effect.gen(function*() {
    const config = yield* ServerConfig.pipe(
      Effect.tap((config) => Effect.logDebug("Loaded server config", { config })),
      Effect.tapError((error) => Effect.logError(error.message))
    )

    const runtime = ManagedRuntime.make(
      Layer.mergeAll(
        TenantConfigService.layer(config),
        LoggerLayer,
        ObservabilityLayer
      ).pipe(
        Layer.provide(NodeServices.layer),
        Layer.provide(configProviderLayer)
      )
    )

    // Running this effect also makes sure that the layers get resolved
    runtime.runSync(Effect.logDebug("Runtime started"))

    return runtime
  }).pipe(
    Effect.provide(LoggerLayer),
    Effect.provide(configProviderLayer),
    Effect.runPromise
  )
}

const fakeBoot = new Proxy({} as Awaited<ReturnType<typeof boot>>, {
  get(_target, property) {
    throw new Error(
      `Server runtime (${String(property)}) is not available in the build environment`
    )
  }
})

export const Runtime = process.env.NEXT_PHASE === "phase-production-build" ?
  fakeBoot :
  await boot().catch((_: unknown) => {
    process.exit(1)
  })
