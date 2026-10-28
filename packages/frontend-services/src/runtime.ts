import type { NodeServices } from "@effect/platform-node"
import type * as Redis from "effect/persistence/Redis"

import { type Config, ConfigProvider, Effect, Layer, type ManagedRuntime, Schema } from "effect"

import { AuthenticationProcessConfig, AuthenticationService } from "./authentication.js"
import { type OtelConfig, type ServerConfig, StartupConfig } from "./config/index.js"
import { type ObservabilityInitializationError, observabilityLayer } from "./observability.js"
import { SessionService } from "./session.js"
import { TenantConfigService } from "./tenant.js"

const startupNotReadyTag = "@pathableai/pre-ets-frontend/StartupNotReady"

export type ApplicationServices = AuthenticationService | SessionService | TenantConfigService

export interface ProcessStartup {
  readonly authentication: Config.Success<typeof AuthenticationProcessConfig>
  readonly configProvider: ConfigProvider.ConfigProvider
  readonly logLevel: Config.Success<typeof StartupConfig>["logLevel"]
  readonly otel: Config.Success<typeof OtelConfig>
  readonly server: Config.Success<typeof ServerConfig>
}

export class StartupNotReady extends Schema.TaggedError<StartupNotReady>()(startupNotReadyTag, {}) {}

export const loadProcessStartup: Effect.Effect<ProcessStartup, Config.ConfigError> = Effect.gen(function*() {
  const configProvider = ConfigProvider.fromEnv()
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
 * Observability is merged into the runtime context so the selected signals stay
 * available after acquisition. Redis stays behind `Layer.provide`, so it is not
 * a sibling and is not part of `ApplicationServices`. The console logger is a
 * separate layer supplied by the caller. The public error channel omits
 * `ConfigError` because this Effect version has no layer error map that preserves
 * services.
 */
export const applicationLayer = (
  startup: ProcessStartup,
  infrastructure: Layer.Layer<NodeServices.NodeServices | Redis.Redis, Redis.RedisError>
): Layer.Layer<ApplicationServices, ObservabilityInitializationError | Redis.RedisError> => {
  const layer = applicationCore(startup).pipe(
    Layer.provide(infrastructure),
    Layer.provideMerge(observabilityLayer({
      otel: startup.otel
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

export type InstalledRuntime = ManagedRuntime.ManagedRuntime<ApplicationServices, unknown>

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
