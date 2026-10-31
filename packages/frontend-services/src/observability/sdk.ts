import type * as NodeSdk from "@effect/opentelemetry/NodeSdk"

import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto"
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto"
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs"
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { Effect, Schema } from "effect"

import type { OtelEnabled } from "../config/otel.js"

const OtelSdkErrorTag = "@pathableai/pre-ets-frontend-services/OtelSdkErrorTag" as const
export class OtelSdkError extends Schema.TaggedError<OtelSdkError>()(OtelSdkErrorTag, {
  cause: Schema.instanceOf(globalThis.Error)
}) {}

const wrapConstructor = <
  Args extends unknown[],
  Instance
>(cls: new(...args: Args) => Instance) =>
(...args: Args): Effect.Effect<Instance, OtelSdkError> =>
  Effect.try({
    catch: (cause) =>
      new OtelSdkError({
        cause: cause instanceof Error ? cause : new Error(String(cause))
      }),
    try: () => new cls(...args)
  })

const pipeExporter: <
  Exporter,
  Consumer
>(
  makeExporter: (options: { readonly url: string }) => Effect.Effect<Exporter, OtelSdkError>,
  makeConsumer: (options: { readonly exporter: Exporter }) => Effect.Effect<Consumer, OtelSdkError>
) => (settings: OtelEnabled) => Effect.Effect<Consumer, OtelSdkError> = (
  makeExporter,
  makeConsumer
) =>
  Effect.fnUntraced(
    function*(settings: OtelEnabled) {
      const exporter = yield* makeExporter({ url: settings.endpoint.toString() })
      return yield* makeConsumer({ exporter })
    }
  )

const makeOTLPTraceExporter = wrapConstructor(OTLPTraceExporter)

const makeBatchSpanProcessor = wrapConstructor(BatchSpanProcessor)

const makeSpanProcessor = Effect.fnUntraced(
  function*(settings: OtelEnabled) {
    const exporter = yield* makeOTLPTraceExporter({
      url: settings.endpoint.toString()
    })
    const processor = yield* makeBatchSpanProcessor(
      exporter
    )

    return processor
  }
)

const makeOTLPLogExporter = wrapConstructor(OTLPLogExporter)

const makeBatchLogRecordProcessor = wrapConstructor(BatchLogRecordProcessor)

const makeLogRecordRecordProcessor = pipeExporter(makeOTLPLogExporter, makeBatchLogRecordProcessor)

const makeOTLPMetricsExporter = wrapConstructor(OTLPMetricExporter)

const makePeriodicExportingMetricReader = wrapConstructor(PeriodicExportingMetricReader)

const makeMetricReader = pipeExporter(makeOTLPMetricsExporter, makePeriodicExportingMetricReader)

export const makeNodeSdkConfiguration: (settings: OtelEnabled) => Effect.Effect<NodeSdk.Configuration, OtelSdkError> =
  Effect.fnUntraced(
    function*(settings: OtelEnabled) {
      const spanProcessor = yield* makeSpanProcessor(settings)
      const logRecordProcessor = yield* makeLogRecordRecordProcessor(settings)
      const metricReader = yield* makeMetricReader(settings)

      const configuration: NodeSdk.Configuration = {
        loggerMergeWithExisting: true,
        logRecordProcessor,
        metricReader,

        resource: {
          serviceName: settings.serviceName,
          serviceVersion: settings.serviceVersion
        },

        spanProcessor
      }

      return configuration
    }
  )
