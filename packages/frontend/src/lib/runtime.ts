import type { NodeServices } from "@effect/platform-node"
import type * as Redis from "effect/persistence/Redis"

import { type Config, ConfigProvider, Effect, Layer, type ManagedRuntime, Schema } from "effect"

import { AuthenticationProcessConfig, AuthenticationService } from "./authentication.ts"
import { type OtelConfig, type ServerConfig, StartupConfig } from "./config/index.ts"
import { type ObservabilityInitializationError, observabilityLayer } from "./observability.ts"
import { SessionService } from "./session.ts"
import { TenantConfigService } from "./tenant.ts"

const startupFailureTag = "@pathableai/pre-ets-frontend/StartupFailure"
const startupNotReadyTag = "@pathableai/pre-ets-frontend/StartupNotReady"

export type ApplicationServices = AuthenticationService | SessionService | TenantConfigService

export interface ProcessStartup {
  readonly authentication: Config.Success<typeof AuthenticationProcessConfig>
  readonly configProvider: ConfigProvider.ConfigProvider
  readonly logLevel: Config.Success<typeof StartupConfig>["logLevel"]
  readonly otel: Config.Success<typeof OtelConfig>
  readonly server: Config.Success<typeof ServerConfig>
}

export class StartupFailure extends Schema.TaggedError<StartupFailure>()(
  startupFailureTag,
  {
    reason: Schema.Literals(["acquisition", "config", "defect", "observability-initialization"]),
    stage: Schema.Literals(["application-acquisition", "configuration", "observability"])
  }
) {}
export class StartupNotReady extends Schema.TaggedError<StartupNotReady>()(startupNotReadyTag, {}) {}

export const loadProcessStartup: Effect.Effect<ProcessStartup, Config.ConfigError> = Effect.gen(function*() {
  const env: Record<string, string | undefined> = { ...process.env }
  const configProvider = ConfigProvider.fromEnvRecord(env)
  const startup = yield* Effect.provideService(StartupConfig, ConfigProvider.ConfigProvider, configProvider)
  const authentication = yield* Effect.provideService(
    AuthenticationProcessConfig,
    ConfigProvider.ConfigProvider,
    configProvider
  )
  return {
    authentication,
    configProvider,
    logLevel: startup.logLevel,
    otel: startup.otel,
    server: startup.server
  }
})

const applicationCore = (startup: ProcessStartup) =>
  Layer.mergeAll(
    AuthenticationService.layer.pipe(Layer.provideMerge(TenantConfigService.layer(startup.server))),
    SessionService.layer
  )

/**
 * Observability is merged into the runtime context so the console logger and
 * selected signals stay available after acquisition. Redis stays behind
 * `Layer.provide`, so it is not a sibling and is not part of `ApplicationServices`.
 * The public error channel omits `ConfigError` because this Effect version has
 * no layer error map that preserves services; a runtime config failure is still
 * classified as configuration.
 */
export const applicationLayer = (
  startup: ProcessStartup,
  infrastructure: Layer.Layer<NodeServices.NodeServices | Redis.Redis, Redis.RedisError>
): Layer.Layer<ApplicationServices, ObservabilityInitializationError | Redis.RedisError> => {
  const layer = applicationCore(startup).pipe(
    Layer.provide(infrastructure),
    Layer.provideMerge(observabilityLayer({
      logLevel: startup.logLevel,
      otel: startup.otel,
      serverEnv: startup.server.env
    })),
    Layer.provide(ConfigProvider.layer(startup.configProvider))
  )
  return layer as Layer.Layer<ApplicationServices, ObservabilityInitializationError | Redis.RedisError>
}

/**
 * Turbopack evaluates this module separately in the instrumentation chunk and in
 * each route and server-component chunk. `Symbol.for` is one process-wide key,
 * so those copies share the runtime `startProductionRuntime` acquired.
 */
const managedRuntimeSlot = Symbol.for("@pathableai/pre-ets-frontend/ManagedRuntime")

type InstalledRuntime = ManagedRuntime.ManagedRuntime<ApplicationServices, unknown>

const readInstalledRuntime = (): InstalledRuntime | undefined => {
  const published: unknown = Reflect.get(globalThis, managedRuntimeSlot)
  if (published === undefined) return undefined
  return published as InstalledRuntime
}

const rejectNotReady = <A>(): Promise<A> => Effect.runPromise(Effect.fail(new StartupNotReady({})))

export const Runtime = {
  runPromise: <A, E>(effect: Effect.Effect<A, E, ApplicationServices>): Promise<A> => {
    const runtime = readInstalledRuntime()
    if (runtime === undefined) return rejectNotReady()
    return runtime.runPromise(effect)
  }
}

/** Publishes the runtime `startProductionRuntime` acquired. Request code only reads it. */
export const installManagedRuntime = (runtime: InstalledRuntime): void => {
  Reflect.set(globalThis, managedRuntimeSlot, runtime)
}
