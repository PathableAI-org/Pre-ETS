import { OtelTracer, Resource } from "@effect/opentelemetry"
import { NodeServices } from "@effect/platform-node"
import { registerOTel } from "@vercel/otel"
import { ConfigProvider, Effect, Layer, ManagedRuntime, Result } from "effect"

import { ServerConfig } from "./config/index.ts"
import { appLoggerLayer } from "./observability.ts"
import { TenantReadError } from "./tenant/schema.ts"
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
      Effect.tapError(() => Effect.logError("Invalid server configuration")),
      Effect.result
    )

    const tenantLayer = Result.match(config, {
      onFailure: (cause) => {
        const failure = new TenantReadError({
          cause: new Error(cause.message),
          message: "Invalid server configuration"
        })
        return Layer.succeed(
          TenantConfigService,
          TenantConfigService.of({
            getAlias: () => Result.fail(failure),
            getConfigFromAlias: () => Effect.fail(failure),
            getConfigFromHost: () => Effect.fail(failure)
          })
        )
      },
      onSuccess: TenantConfigService.layer
    })

    const runtime = ManagedRuntime.make(
      Layer.mergeAll(
        tenantLayer,
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
  await boot()
