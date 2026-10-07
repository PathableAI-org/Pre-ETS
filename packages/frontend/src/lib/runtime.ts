import { OtelTracer, Resource } from "@effect/opentelemetry"
import { NodeServices } from "@effect/platform-node"
import { registerOTel } from "@vercel/otel"
import { ConfigProvider, Effect, Layer, ManagedRuntime } from "effect"

import { ServerConfig } from "./config/index.ts"
import { appLoggerLayer } from "./observability.ts"
import { TenantConfigService } from "./tenant/service.ts"

const OTEL_SERVICE_NAME = "pre-ets-frontend"

const LoggerLayer = appLoggerLayer()

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
      Effect.tap(() => Effect.logDebug("Loaded server config")),
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
    Effect.provide(
      Layer.mergeAll(LoggerLayer, configProviderLayer, ObservabilityLayer)
    ),
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
  await boot().catch(async (error: unknown) => {
    // Prefer Effect diagnostics from appLoggerLayer; fall back to stderr when boot
    // fails before any logger is available. Avoid dumping configuration payloads.
    const detail = error instanceof Error && error.message.trim() !== "" ?
      error.message :
      "startup failed before diagnostics were available"

    await Effect.logError(`pre-ets-frontend: ManagedRuntime boot failed (${detail})`).pipe(
      Effect.provide(LoggerLayer),
      Effect.runPromise
    )

    process.exit(1)
  })
