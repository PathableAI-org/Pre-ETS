import type { NodeServices } from "@effect/platform-node"
import type * as Redis from "effect/persistence/Redis"

import { type Config, ConfigProvider, type Effect, Layer, type ManagedRuntime, Schema } from "effect"

import { AuthenticationService } from "./authentication.js"
import { StartupConfig, type StartupSettings } from "./config/index.js"
import { type ObservabilityInitializationError, observabilityLayer } from "./observability.js"
import { SessionService } from "./session.js"
import { TenantConfigService } from "./tenant.js"

export type ApplicationServices = AuthenticationService | SessionService | TenantConfigService

class StartupNotReady extends Schema.TaggedError<StartupNotReady>()("StartupNotReady", {}) {}

/** The one environment decode. Every setting the process uses is in the result. */
export const loadProcessStartup: Effect.Effect<StartupSettings, Config.ConfigError> = StartupConfig.parse(
  ConfigProvider.fromEnv()
)

/**
 * Observability is merged into the runtime context so the selected signals stay
 * available after acquisition. Redis stays behind `Layer.provide`, so it is not
 * a sibling and is not part of `ApplicationServices`. The console logger is a
 * separate layer supplied by the caller.
 */
export const applicationLayer = (
  startup: StartupSettings,
  infrastructure: Layer.Layer<NodeServices.NodeServices | Redis.Redis, Redis.RedisError>
): Layer.Layer<ApplicationServices, ObservabilityInitializationError | Redis.RedisError> =>
  Layer.mergeAll(
    AuthenticationService.layer(startup.authentication).pipe(
      Layer.provideMerge(TenantConfigService.layer(startup.tenant))
    ),
    SessionService.layer(startup.session)
  ).pipe(
    Layer.provide(infrastructure),
    Layer.provideMerge(observabilityLayer({ otel: startup.otel }))
  )

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

export const Runtime = {
  runPromise: <A, E>(effect: Effect.Effect<A, E, ApplicationServices>): Promise<A> => {
    const runtime = readInstalledRuntime()
    if (runtime === undefined) return Promise.reject(new StartupNotReady({}))
    return runtime.runPromise(effect)
  }
}

/** Publishes the runtime `startProductionRuntime` acquired. Request code only reads it. */
export const installManagedRuntime = (runtime: InstalledRuntime): void => {
  Reflect.set(globalThis, managedRuntimeSlot, runtime)
}
