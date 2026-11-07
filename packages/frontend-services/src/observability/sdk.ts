import type * as NodeSdk from "@effect/opentelemetry/NodeSdk"

import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto"
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto"
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http"
import { RedisInstrumentation } from "@opentelemetry/instrumentation-redis"
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node"
import { BatchLogRecordProcessor, type LogRecordProcessor } from "@opentelemetry/sdk-logs"
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import * as otelSdk from "@opentelemetry/sdk-node"
import { BatchSpanProcessor, type SpanProcessor } from "@opentelemetry/sdk-trace-base"
import { Effect } from "effect"

import type { OtelEnabled } from "../config/otel.js"

import { OtelSdkError } from "./error.js"
import type { Instrumentation, InstrumentationConfig } from "@opentelemetry/instrumentation"

const wrapConstructor =
  <
    Args extends unknown[],
    Instance
  >(cls: new(...args: Args) => Instance) =>
  (...args: Args): Effect.Effect<Instance, OtelSdkError> =>
    Effect.try({
      catch: (cause) => OtelSdkError.new(cause),
      try: () => new cls(...args)
    })

const pipeExporter: <
  Exporter,
  Consumer
>(
  makeExporter: (options: { readonly url: string }) => Effect.Effect<Exporter, OtelSdkError>,
  makeConsumer: (options: { readonly exporter: Exporter }) => Effect.Effect<Consumer, OtelSdkError>
) => (url: string) => Effect.Effect<Consumer, OtelSdkError> = (
  makeExporter,
  makeConsumer
) =>
  Effect.fnUntraced(
    function*(url: string) {
      const exporter = yield* makeExporter({ url })
      return yield* makeConsumer({ exporter })
    }
  )

const makeOTLPTraceExporter = wrapConstructor(OTLPTraceExporter)

const makeBatchSpanProcessor = wrapConstructor(BatchSpanProcessor)

const makeSpanProcessor: (settings: OtelEnabled) => Effect.Effect<SpanProcessor, OtelSdkError> = Effect.fnUntraced(
  function*(settings: OtelEnabled) {
    const exporter = yield* makeOTLPTraceExporter({
      url: `${settings.endpoint.toString()}v1/traces`
    })
    const processor = yield* makeBatchSpanProcessor(
      exporter
    )

    return processor
  }
)

const makeOTLPLogExporter = wrapConstructor(OTLPLogExporter)

const makeBatchLogRecordProcessor = wrapConstructor(BatchLogRecordProcessor)

const makeLogRecordRecordProcessor: (url: string) => Effect.Effect<LogRecordProcessor, OtelSdkError> = pipeExporter(
  makeOTLPLogExporter,
  makeBatchLogRecordProcessor
)

const makeOTLPMetricsExporter = wrapConstructor(OTLPMetricExporter)

const makePeriodicExportingMetricReader = wrapConstructor(PeriodicExportingMetricReader)

const makeMetricReader = pipeExporter(makeOTLPMetricsExporter, makePeriodicExportingMetricReader)

const makeOtelSdk = wrapConstructor(otelSdk.NodeSDK)

const makeHttpInstrumentation = wrapConstructor(HttpInstrumentation)
const makeRedisInstrumentation = wrapConstructor(RedisInstrumentation)
const makeRuntimeNodeInstrumentation = wrapConstructor(RuntimeNodeInstrumentation)

const makeInstrumentations: {
  (): Effect.Effect<Instrumentation<InstrumentationConfig>[], OtelSdkError>
} = Effect.fn(
  function*() {
    const redacted = [
      "sig",
      "Signature",
      "AWSAccessKeyId",
      "X-Goog-Signature",
      "X-Amz-Signature",
      "X-Amz-Credential",
      "X-Amz-Security-Token",
      "api_key",
      "code",
      "state"
    ]

    return yield* Effect.all([
      makeHttpInstrumentation({
        redactedQueryParams: redacted,
        redactedQueryParamsServer: redacted
      }),
      makeRedisInstrumentation(),
      makeRuntimeNodeInstrumentation()
    ])
  }
)

export const makeNodeSdkConfiguration: (settings: OtelEnabled) => Effect.Effect<NodeSdk.Configuration, OtelSdkError> =
  Effect.fnUntraced(
    function*(settings: OtelEnabled) {
      const spanProcessor = yield* makeSpanProcessor(settings)
      const logRecordProcessor = yield* makeLogRecordRecordProcessor(
        `${settings.endpoint.toString()}v1/logs`
      )
      const metricReader = yield* makeMetricReader(
        `${settings.endpoint.toString()}v1/metrics`
      )
      const instrumentations = yield* makeInstrumentations()

      const sdk = yield* makeOtelSdk({
        instrumentations,
        logRecordProcessors: [logRecordProcessor],
        metricReaders: [metricReader],
        spanProcessors: [spanProcessor]
      })

      yield* Effect.try({
        catch: (cause) => OtelSdkError.new(cause),
        try: () => {
          sdk.start()
        }
      })

      return {
        loggerMergeWithExisting: true,
        logRecordProcessor,
        metricReader,

        resource: {
          serviceName: settings.serviceName,
          serviceVersion: settings.serviceVersion
        },

        spanProcessor
      }
    }
  )
