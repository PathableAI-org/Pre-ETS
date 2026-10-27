import { NodePath, NodeRedis, NodeServices } from "@effect/platform-node"
import { Effect, Layer, Logger, ManagedRuntime, Path, References } from "effect"

import { AppEnv, LogConfig } from "./config/index.js"
import { applicationLayer, type ApplicationServices, installManagedRuntime, loadProcessStartup } from "./runtime.js"

const getLogConfig = Effect.fnUntraced(
  function*() {
    const env = yield* AppEnv
    const logLevel = yield* LogConfig

    return { env, logLevel } as const
  },
  // These Config values should never fail
  Effect.orDie
)

const consoleLogger = (env: AppEnv): Logger.Logger<unknown, void> =>
  env === "development" ? Logger.consolePretty() : Logger.consoleJson

const LoggerLayerLive = Layer.unwrap(Effect.gen(function*() {
  const { env, logLevel } = yield* getLogConfig()
  return Layer.mergeAll(
    Logger.layer([consoleLogger(env)]),
    Layer.succeed(References.MinimumLogLevel, logLevel)
  )
}))

const runtimeLayer = Layer.unwrap(Effect.gen(function*() {
  const path = yield* Path.Path
  const cwd = path.resolve()
  const startup = yield* loadProcessStartup.pipe(
    Effect.annotateLogs({ cwd }),
    Effect.tap(() => Effect.logDebug("Loaded server config")),
    Effect.tapError((error) => Effect.logError("Failed to load server config", { error }))
  )
  const infrastructure = Layer.mergeAll(
    NodeServices.layer,
    NodeRedis.layer({
      disableOfflineQueue: true,
      pingInterval: 1_000,
      socket: { socketTimeout: 5_000 },
      url: startup.server.redis.url
    })
  )
  return applicationLayer(startup, infrastructure)
})).pipe(Layer.provideMerge(Layer.mergeAll(LoggerLayerLive, NodePath.layer)))

const makeRuntime = Effect.fnUntraced(function*(
  publish: (runtime: ManagedRuntime.ManagedRuntime<ApplicationServices, unknown>) => void
) {
  const runtime = ManagedRuntime.make(runtimeLayer)
  publish(runtime)
  yield* Effect.tryPromise({
    catch: (error: unknown) => error,
    try: () => runtime.runPromise(Effect.void)
  }).pipe(
    Effect.tapError(() => Effect.promise(() => runtime.dispose().then(() => undefined, () => undefined))),
    Effect.orDie
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
