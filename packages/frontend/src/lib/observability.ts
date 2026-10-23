import type { TracerProvider } from "@opentelemetry/api"

import { NodeSdk, OtelTracer, Resource } from "@effect/opentelemetry"
import { OTLPTraceExporter as OtlpJsonTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { OTLPTraceExporter as OtlpProtoTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto"
import { AlwaysOnSampler, BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
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
const HTTP_JSON = "http/json"
const HTTP_PROTOBUF = "http/protobuf"
const HTTP_PROTOCOLS = new Set([HTTP_JSON, HTTP_PROTOBUF])

const otlpTraceExporter = (protocol: string, url: string) =>
  protocol === HTTP_JSON ? new OtlpJsonTraceExporter({ url }) : new OtlpProtoTraceExporter({ url })

interface RegistrableProvider extends TracerProvider {
  readonly register: () => void
}

const isRegistrableProvider = (provider: TracerProvider): provider is RegistrableProvider =>
  "register" in provider && typeof provider.register === "function"

const registerGlobalProvider = (provider: TracerProvider): void => {
  if (!isRegistrableProvider(provider)) return
  provider.register()
}

const selected = <A>(specific: Option.Option<A>, general: Option.Option<A>): Option.Option<A> =>
  Option.isSome(specific) ? specific : general

/**
 * Next.js records the server span on the global tracer. `NodeSdk` builds that
 * provider; registering it lets Effect spans parent to the same trace. The URL
 * and disabled flag are the parsed values, so `OTEL_SDK_DISABLED=false` stays
 * enabled. Collector headers stay on the exporter's environment path, where
 * traces headers override base keys.
 */
const tracingLayer = (otel: Config.Success<typeof OtelConfig>, url: string, protocol: string) => {
  const serviceName = Option.getOrElse(otel.serviceName, () => DEFAULT_OTEL_SERVICE_NAME)
  const providerLayer = NodeSdk.layerTracerProvider(
    new BatchSpanProcessor(otlpTraceExporter(protocol, url)),
    { sampler: new AlwaysOnSampler(), shutdownTimeout: "3 seconds" }
  ).pipe(Layer.provide(Resource.layerFromEnv(Resource.configToAttributes({ serviceName }))))

  const clientLayer = Layer.effectDiscard(Effect.gen(function*() {
    const provider = yield* OtelTracer.OtelTracerProvider
    registerGlobalProvider(provider)
    nodeHttpClientInstrumentation.setTracerProvider(provider)
    nodeHttpClientInstrumentation.enable()
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        nodeHttpClientInstrumentation.disable()
      })
    )
  }))

  return Layer.mergeAll(OtelTracer.layer, clientLayer).pipe(Layer.provide(providerLayer))
}

/**
 * Installs the Node OpenTelemetry provider and Effect tracer bridge when an OTLP
 * endpoint is configured and the SDK is not disabled. Otherwise the process
 * keeps the default noop tracer.
 */
export const observabilityLayer = Layer.unwrap(
  Effect.gen(function*() {
    const otel = yield* OtelConfig
    if (otel.disabled || Option.isNone(otel.exportUrl)) return Layer.empty
    const protocol = Option.getOrElse(selected(otel.tracesProtocol, otel.protocol), () => HTTP_PROTOBUF)
    if (!HTTP_PROTOCOLS.has(protocol)) {
      return yield* Effect.die(new Error("OTLP traces protocol must be http/protobuf or http/json"))
    }
    try {
      new URL(otel.exportUrl.value)
    } catch {
      return yield* Effect.die(new Error("OTLP traces endpoint is not a valid URL"))
    }
    return tracingLayer(otel, otel.exportUrl.value, protocol)
  })
)
