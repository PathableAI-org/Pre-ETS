import { OtelTracer } from "@effect/opentelemetry"
import { registerOTel } from "@vercel/otel"
import { Config, Effect, Layer, Logger, Option, References } from "effect"

import { AppEnv } from "./config/env.ts"
import { OtelConfig } from "./config/index.ts"
import { nodeHttpClientInstrumentation } from "./observability/http.ts"

const DEFAULT_LOG_LEVEL = "Info" as const

/** Fail-soft log knobs for the process-lifetime console logger. */
const appLogConfig = Config.all({
  env: AppEnv,
  logLevel: Config.LogLevel("LOG_LEVEL").pipe(
    Config.orElse(() => Config.succeed(DEFAULT_LOG_LEVEL))
  )
}).pipe(
  // THis should never fail; both fields have orElse guards
  Effect.orDie
)

const prettyConsoleLogger = Logger.consolePretty()

const consoleLoggerForAppEnv = (env: AppEnv): Logger.Logger<unknown, void> =>
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

const DEFAULT_OTEL_SERVICE_NAME = "pre-ets-frontend"

let otelRegistered = false

const registerGlobalOtel = (serviceName: string): void => {
  if (otelRegistered) return
  otelRegistered = true
  registerOTel({
    instrumentations: [nodeHttpClientInstrumentation],
    serviceName,
    traceSampler: "always_on"
  })
}

/**
 * Installs the global OpenTelemetry SDK and Effect tracer bridge when an OTLP
 * endpoint is configured and the SDK is not disabled. Otherwise the process
 * keeps the default noop tracer.
 */
export const observabilityLayer = Layer.unwrap(
  Effect.gen(function*() {
    const otel = yield* OtelConfig
    if (otel.disabled || Option.isNone(otel.endpoint)) return Layer.empty
    registerGlobalOtel(otel.serviceName.pipe(Option.getOrElse(() => DEFAULT_OTEL_SERVICE_NAME)))
    return OtelTracer.layerGlobal
  })
)
