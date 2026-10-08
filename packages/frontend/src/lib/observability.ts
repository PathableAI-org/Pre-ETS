import { Config, Effect, Layer, Logger, References } from "effect"

import { AppEnv } from "./config/env.ts"

const DEFAULT_LOG_LEVEL = "Info" as const

/** Fail-soft log knobs for the process-lifetime console logger. */
export const appLogConfig = Config.all({
  env: AppEnv,
  logLevel: Config.LogLevel("LOG_LEVEL").pipe(
    Config.orElse(() => Config.succeed(DEFAULT_LOG_LEVEL))
  )
}).pipe(
  // THis should never fail; both fields have orElse guards
  Effect.orDie
)

const prettyConsoleLogger = Logger.consolePretty()

export const consoleLoggerForAppEnv = (env: AppEnv): Logger.Logger<unknown, void> =>
  env === "production" ? Logger.consoleJson : prettyConsoleLogger

/** Process-lifetime console logger: JSON in production, pretty otherwise. */
export const appLoggerLayer = (): Layer.Layer<never> =>
  Layer.unwrap(
    Effect.gen(function*() {
      const { env, logLevel } = yield* appLogConfig
      return Layer.mergeAll(
        Logger.layer([consoleLoggerForAppEnv(env)]),
        Layer.succeed(References.MinimumLogLevel, logLevel)
      )
    })
  )
