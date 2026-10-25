import type { Resource } from "@effect/opentelemetry/Resource"
import type { DiagLogger } from "@opentelemetry/api"
import type { LogRecordExporter } from "@opentelemetry/sdk-logs"
import type { PushMetricExporter } from "@opentelemetry/sdk-metrics"
import type { SpanExporter } from "@opentelemetry/sdk-trace-base"
import type { LogLevel } from "effect/LogLevel"

import { NodeSdk } from "@effect/opentelemetry"
import { diag, DiagLogLevel } from "@opentelemetry/api"
import { OTLPLogExporter as OtlpJsonLogExporter } from "@opentelemetry/exporter-logs-otlp-http"
import { OTLPLogExporter as OtlpProtoLogExporter } from "@opentelemetry/exporter-logs-otlp-proto"
import { OTLPMetricExporter as OtlpJsonMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http"
import { OTLPMetricExporter as OtlpProtoMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto"
import { OTLPTraceExporter as OtlpJsonTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { OTLPTraceExporter as OtlpProtoTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto"
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs"
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import { AlwaysOnSampler, BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import { Cause, Effect, Layer, Logger, Option, References, Schema } from "effect"

import type { OtelSettings } from "./config/index.ts"

import { nodeHttpClientInstrumentation } from "./observability/http.ts"

export interface ObservabilitySelection {
  readonly logs: SelectedOtlpSignal | undefined
  readonly metrics: SelectedOtlpSignal | undefined
  readonly traces: SelectedOtlpSignal | undefined
}

export type OtlpHttpProtocol = "http/json" | "http/protobuf"

export interface SelectedOtlpSignal {
  readonly protocol: OtlpHttpProtocol
  readonly url: string
}

const observabilityInitializationErrorTag = "@pathableai/pre-ets-frontend/ObservabilityInitializationError"

type Signal = ObservabilityInitializationError["signal"]

export class ObservabilityInitializationError extends Schema.TaggedError<ObservabilityInitializationError>()(
  observabilityInitializationErrorTag,
  {
    reason: Schema.Literals(["endpoint", "exporter", "protocol"]),
    signal: Schema.Literals(["logs", "metrics", "traces"])
  }
) {}

const httpJson: OtlpHttpProtocol = "http/json"
const httpProtobuf: OtlpHttpProtocol = "http/protobuf"
const defaultServiceName = "pre-ets-frontend"
const exportTimeoutMillis = 3_000
const metricExportIntervalMillis = 5_000
const otlpExportSuccess = 0
const redisClientError = "NodeRedis client error"
const redisClientErrorSentence = "pre-ets-frontend: redis client error"

const isHttpProtocol = (value: string): value is OtlpHttpProtocol => value === httpJson || value === httpProtobuf

const initializationError = (signal: Signal, reason: ObservabilityInitializationError["reason"]) =>
  new ObservabilityInitializationError({ reason, signal })

const selectSignal = Effect.fnUntraced(function*(
  signal: Signal,
  exporter: Option.Option<string>,
  url: Option.Option<string>,
  protocol: Option.Option<string>,
  baseProtocol: Option.Option<string>
) {
  if (Option.isSome(exporter) && exporter.value === "none") return undefined
  if (Option.isNone(url)) return undefined
  if (Option.isSome(exporter) && exporter.value !== "otlp") {
    return yield* Effect.fail(initializationError(signal, "exporter"))
  }
  const selectedProtocol = Option.getOrElse(Option.isSome(protocol) ? protocol : baseProtocol, () => httpProtobuf)
  if (!isHttpProtocol(selectedProtocol)) return yield* Effect.fail(initializationError(signal, "protocol"))
  // Installed Effect 4.0.5 decodes unknown strings with decodeUnknownEffect. Schema.decodeUnknown is not exported.
  yield* Schema.decodeUnknownEffect(Schema.URLFromString)(url.value).pipe(
    Effect.mapError(() => initializationError(signal, "endpoint"))
  )
  return { protocol: selectedProtocol, url: url.value }
})

/** Selects OTLP signals from parsed settings. It does not read the process environment or open a socket. */
export const selectObservability: (
  otel: OtelSettings
) => Effect.Effect<ObservabilitySelection, ObservabilityInitializationError> = Effect.fnUntraced(
  function*(otel: OtelSettings) {
    if (otel.disabled) return { logs: undefined, metrics: undefined, traces: undefined }
    const traces = yield* selectSignal(
      "traces",
      otel.tracesExporter,
      otel.exportUrl,
      otel.tracesProtocol,
      otel.protocol
    )
    const metrics = yield* selectSignal(
      "metrics",
      otel.metricsExporter,
      otel.metricsExportUrl,
      otel.metricsProtocol,
      otel.protocol
    )
    const logs = yield* selectSignal("logs", otel.logsExporter, otel.logsExportUrl, otel.logsProtocol, otel.protocol)
    return { logs, metrics, traces }
  }
)

const writeDeliveryFailure = (signal: Signal): void => {
  process.stderr.write(`pre-ets-frontend: telemetry delivery failed signal=${signal}\n`)
}

interface CallbackExporter {
  export(payload: unknown, resultCallback: (result: { readonly code: number }) => void): void
}

const guardDelivery = <Exporter>(exporter: Exporter, signal: Signal): Exporter => {
  const callbackExporter = exporter as CallbackExporter
  const original = callbackExporter.export.bind(callbackExporter)
  callbackExporter.export = (payload, resultCallback) => {
    original(payload, (result) => {
      if (result.code !== otlpExportSuccess) writeDeliveryFailure(signal)
      resultCallback(result)
    })
  }
  return exporter
}

const ignoreDiagnostic = (): void => {
  return undefined
}

const quietDiagnostics: DiagLogger = {
  debug: ignoreDiagnostic,
  error: ignoreDiagnostic,
  info: ignoreDiagnostic,
  verbose: ignoreDiagnostic,
  warn: ignoreDiagnostic
}

const installQuietDiagnostics = (): void => {
  diag.setLogger(quietDiagnostics, DiagLogLevel.ERROR)
}

const consoleLogger = (serverEnv: "development" | "production" | "test"): Logger.Logger<unknown, void> =>
  serverEnv === "production" ? Logger.consoleJson : Logger.consolePretty()

const redactRedisClientError = (
  logger: Logger.Logger<unknown, unknown>
): Logger.Logger<unknown, unknown> =>
  Logger.make((options) => {
    const message = options.message
    if (Array.isArray(message) && message[0] === redisClientError) {
      return logger.log({
        cause: Cause.empty,
        date: options.date,
        fiber: options.fiber,
        logLevel: options.logLevel,
        message: [redisClientErrorSentence]
      })
    }
    return logger.log(options)
  })

const redactLayer = Layer.unwrap(Effect.gen(function*() {
  const current = yield* Effect.service(Logger.CurrentLoggers)
  const wrapped = new Set<Logger.Logger<unknown, unknown>>()
  for (const logger of current) wrapped.add(redactRedisClientError(logger))
  return Layer.succeed(Logger.CurrentLoggers, wrapped)
}))

const consoleLayer = (logLevel: LogLevel, serverEnv: "development" | "production" | "test") =>
  Layer.mergeAll(
    Logger.layer([consoleLogger(serverEnv)]),
    Layer.succeed(References.MinimumLogLevel, logLevel)
  )

let capturedProvider: NodeTracerProvider | undefined

const rememberProvider = (provider: NodeTracerProvider): void => {
  capturedProvider = provider
}

const installTracerCapture = (): () => void => {
  const prototype = NodeTracerProvider.prototype
  const original = Reflect.get<NodeTracerProvider, "getTracer">(prototype, "getTracer")
  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    prototype.getTracer = original
  }
  prototype.getTracer = function(this: NodeTracerProvider, ...args: Parameters<NodeTracerProvider["getTracer"]>) {
    rememberProvider(this)
    restore()
    return Reflect.apply(original, this, args)
  }
  return restore
}

const traceExporter = (signal: SelectedOtlpSignal): SpanExporter =>
  guardDelivery(
    signal.protocol === httpJson ?
      new OtlpJsonTraceExporter({ url: signal.url }) :
      new OtlpProtoTraceExporter({ url: signal.url }),
    "traces"
  )

const metricExporter = (signal: SelectedOtlpSignal): PushMetricExporter =>
  guardDelivery(
    signal.protocol === httpJson ?
      new OtlpJsonMetricExporter({ url: signal.url }) :
      new OtlpProtoMetricExporter({ url: signal.url }),
    "metrics"
  )

const logExporter = (signal: SelectedOtlpSignal): LogRecordExporter =>
  guardDelivery(
    signal.protocol === httpJson ?
      new OtlpJsonLogExporter({ url: signal.url }) :
      new OtlpProtoLogExporter({ url: signal.url }),
    "logs"
  )

const httpLayer = Layer.effectDiscard(Effect.gen(function*() {
  const provider = capturedProvider
  if (provider !== undefined) {
    provider.register()
    nodeHttpClientInstrumentation.setTracerProvider(provider)
    nodeHttpClientInstrumentation.enable()
  }
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      nodeHttpClientInstrumentation.disable()
    })
  )
}))

const selectedLayer = (
  selection: ObservabilitySelection,
  logLevel: LogLevel,
  serverEnv: "development" | "production" | "test",
  serviceName: string
) => {
  installQuietDiagnostics()
  const sdk = NodeSdk.layer(() => ({
    loggerMergeWithExisting: true,
    logRecordProcessor: selection.logs === undefined ?
      undefined :
      new BatchLogRecordProcessor({
        exporter: logExporter(selection.logs),
        exportTimeoutMillis
      }),
    metricReader: selection.metrics === undefined ?
      undefined :
      new PeriodicExportingMetricReader({
        exporter: metricExporter(selection.metrics),
        exportIntervalMillis: metricExportIntervalMillis,
        exportTimeoutMillis
      }),
    resource: { serviceName },
    shutdownTimeout: "3 seconds",
    spanProcessor: selection.traces === undefined ?
      undefined :
      new BatchSpanProcessor(traceExporter(selection.traces), { exportTimeoutMillis }),
    tracerConfig: selection.traces === undefined ? undefined : { sampler: new AlwaysOnSampler() }
  }))
  const patch = selection.traces === undefined ?
    Layer.empty :
    Layer.effectDiscard(Effect.acquireRelease(
      Effect.sync(installTracerCapture),
      (restore) =>
        Effect.sync(() => {
          restore()
        })
    ))
  const sdkReady = sdk.pipe(Layer.provideMerge(Layer.mergeAll(consoleLayer(logLevel, serverEnv), patch)))
  const side = selection.traces === undefined ? redactLayer : Layer.mergeAll(httpLayer, redactLayer)
  return side.pipe(Layer.provideMerge(sdkReady))
}

const consoleOnlyLayer = (logLevel: LogLevel, serverEnv: "development" | "production" | "test") =>
  redactLayer.pipe(Layer.provideMerge(
    NodeSdk.layerEmpty.pipe(Layer.provideMerge(consoleLayer(logLevel, serverEnv)))
  ))

const anySelected = (selection: ObservabilitySelection): boolean =>
  selection.logs !== undefined || selection.metrics !== undefined || selection.traces !== undefined

/**
 * Console logger plus one Node SDK for the signals `selectObservability` accepts.
 * A selection failure fails this layer before exporters are constructed.
 */
export const observabilityLayer = (input: {
  readonly logLevel: LogLevel
  readonly otel: OtelSettings
  readonly serverEnv: "development" | "production" | "test"
}): Layer.Layer<Resource, ObservabilityInitializationError> =>
  Layer.unwrap(Effect.gen(function*() {
    const selection = yield* selectObservability(input.otel)
    if (!anySelected(selection)) return consoleOnlyLayer(input.logLevel, input.serverEnv)
    const serviceName = Option.getOrElse(input.otel.serviceName, () => defaultServiceName)
    return selectedLayer(selection, input.logLevel, input.serverEnv, serviceName)
  }))
