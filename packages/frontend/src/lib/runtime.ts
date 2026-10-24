import { NodeRedis, NodeServices } from "@effect/platform-node"
import { ConfigProvider, Effect, Layer, ManagedRuntime } from "effect"

import { makeAuthenticationTestHarness } from "./authentication.ts"
import { ServerConfig } from "./config/index.ts"
import { appLoggerLayer, observabilityLayer } from "./observability.ts"
import { SessionService } from "./session.ts"
import { TenantConfigService } from "./tenant.ts"

const LoggerLayer = appLoggerLayer()

const boot = () => {
  // ConfigProvider.fromEnv() snapshots process.env at construction time. Build a
  // fresh provider per boot so Vitest env stubs / TENANT_CONFIG_DIR resets apply.
  const configProviderLayer = ConfigProvider.layer(ConfigProvider.fromEnv())

  return Effect.gen(function*() {
    const config = yield* ServerConfig.pipe(
      Effect.tap(() => Effect.logDebug("Loaded server config")),
      Effect.tapError(() => Effect.logError("Invalid server configuration"))
    )

    // One shared Redis layer value serves authentication transactions and
    // session state; the host acquires and disposes the resource exactly once.
    const redisLayer = NodeRedis.layer({
      disableOfflineQueue: true,
      pingInterval: 1_000,
      socket: { socketTimeout: 5_000 },
      url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
    })

    const runtime = ManagedRuntime.make(
      Layer.mergeAll(
        makeAuthenticationTestHarness({ redis: redisLayer }).layer.pipe(
          Layer.provideMerge(TenantConfigService.layer(config))
        ),
        SessionService.layer,
        LoggerLayer,
        observabilityLayer
      ).pipe(
        Layer.provide(redisLayer),
        Layer.provide(NodeServices.layer),
        Layer.provide(configProviderLayer)
      )
    )

    // Awaiting this probe eagerly acquires asynchronous layers, including Redis,
    // before instrumentation declares the process ready.
    yield* Effect.tryPromise({
      catch: (cause) => cause,
      try: () => runtime.runPromise(Effect.logDebug("Runtime started"))
    }).pipe(
      Effect.tapError(() => Effect.promise(() => runtime.dispose()))
    )

    return runtime
  }).pipe(
    Effect.provide(
      Layer.mergeAll(LoggerLayer, configProviderLayer)
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
