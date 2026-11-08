import { NodePath, NodeRedis, NodeServices } from "@effect/platform-node"
import { Effect, Layer, Logger, ManagedRuntime, Path, References } from "effect"

import type { AppEnv, StartupSettings } from "./config/index.js"

import { applicationLayer, type ApplicationServices, installManagedRuntime, loadProcessStartup } from "./runtime.js"

const consoleLogger = (env: AppEnv): Logger.Logger<unknown, void> =>
  env === "development" ? Logger.consolePretty() : Logger.consoleJson

const loggingLayer = (startup: Pick<StartupSettings, "env" | "logLevel">) =>
  Layer.mergeAll(
    Logger.layer([consoleLogger(startup.env)]),
    Layer.succeed(References.MinimumLogLevel, startup.logLevel)
  )

/**
 * Settings choose the console format, so a settings failure is logged as JSON, the production format, before any
 * setting is known.
 */
const runtimeLayer = Layer.unwrap(Effect.gen(function*() {
  const path = yield* Path.Path
  const cwd = path.resolve()
  const startup = yield* loadProcessStartup.pipe(
    Effect.tapError((error) =>
      Effect.logError("Failed to load server config", { error }).pipe(
        Effect.annotateLogs({ cwd }),
        Effect.provide(Logger.layer([Logger.consoleJson]))
      )
    )
  )
  const logging = loggingLayer(startup)
  yield* Effect.logDebug("Loaded server config").pipe(Effect.annotateLogs({ cwd }), Effect.provide(logging))
  const infrastructure = Layer.mergeAll(
    NodeServices.layer,
    NodeRedis.layer({
      disableOfflineQueue: true,
      pingInterval: 1_000,
      socket: { socketTimeout: 5_000 },
      url: startup.redisUrl
    })
  )
  return applicationLayer(startup, infrastructure).pipe(Layer.provideMerge(logging))
})).pipe(Layer.provide(NodePath.layer))

const makeRuntime = Effect.fnUntraced(function*(
  publish: (runtime: ManagedRuntime.ManagedRuntime<ApplicationServices, unknown>) => void
) {
  const runtime = ManagedRuntime.make(runtimeLayer)
  publish(runtime)
  yield* Effect.promise(() => runtime.runPromise(Effect.void)).pipe(
    Effect.onError(() => Effect.promise(() => runtime.dispose().then(() => undefined, () => undefined)))
  )
  return runtime
})

const fatalExitMilliseconds = 10_000
const startupFailed = "pre-ets-frontend: startup failed"

const writeStderr = (sentence: string): void => {
  try {
    process.stderr.write(`${sentence}\n`)
  } catch {
    // A failed diagnostic write does not change the exit status.
  }
}

/** Builds the production runtime and publishes it for request handlers. */
export const startProductionRuntime = (): Promise<void> => {
  let managed: ManagedRuntime.ManagedRuntime<ApplicationServices, unknown> | undefined
  let disposal: Promise<void> | undefined
  let fatal = false
  let shuttingDown = false

  const disposeOnce = (): Promise<void> => {
    if (disposal === undefined) {
      const current = managed
      disposal = current === undefined ?
        Promise.resolve() :
        current.dispose().then(() => undefined, () => undefined)
    }
    return disposal
  }

  const onSignal = () => {
    if (fatal || shuttingDown) return
    shuttingDown = true
    void disposeOnce().then(() => {
      process.exit(0)
    })
  }
  process.on("SIGTERM", onSignal)
  process.on("SIGINT", onSignal)

  const fail = async (): Promise<never> => {
    fatal = true
    const timer = setTimeout(() => {
      process.exit(1)
    }, fatalExitMilliseconds)
    writeStderr(startupFailed)
    await disposeOnce()
    clearTimeout(timer)
    process.exit(1)
  }

  return Effect.runPromise(makeRuntime((runtime) => {
    managed = runtime
  })).then((runtime) => {
    installManagedRuntime(runtime)
  }).catch(() => fail())
}
