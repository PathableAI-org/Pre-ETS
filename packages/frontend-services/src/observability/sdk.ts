import * as NodeSdk from "@effect/opentelemetry/NodeSdk"
import { type OtelEnabled } from "../config/otel.ts"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto"
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto"
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto"

import { Effect, Schema } from "effect"
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs"
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"

const OtelSdkErrorTag = "@pathableai/pre-ets-frontend-services/OtelSdkErrorTag" as const;
class OtelSdkError extends Schema.TaggedError<OtelSdkError>()(OtelSdkErrorTag, {
  cause: Schema.instanceOf(globalThis.Error),
}){}

const wrapConstructor = <
  C extends new(...args: any) => any,
>(cls: C) => (...args: ConstructorParameters<C>): Effect.Effect<InstanceType<C>, OtelSdkError> => Effect.try({
  try: () => new cls(...args),
  catch: cause => new OtelSdkError({
    cause: cause instanceof Error ? cause : new Error(String(cause)),
  })
});


const makeOTLPTraceExporter = wrapConstructor(OTLPTraceExporter);

const makeBatchSpanProcessor = wrapConstructor(BatchSpanProcessor);

const makeSpanProcessor = Effect.fnUntraced(
  function*(settings: OtelEnabled) {
    const exporter = yield *makeOTLPTraceExporter({
      url: settings.endpoint.toString(),
    })
    const processor = yield *makeBatchSpanProcessor(
      exporter
    )

    return processor
  }
)

const makeOTLPLogExporter = wrapConstructor(OTLPLogExporter)

const makeBatchLogRecordProcessor = wrapConstructor(BatchLogRecordProcessor)

const makeLogRecordRecordProcessor = Effect.fnUntraced(
  function*(settings: OtelEnabled){
    const exporter = yield *makeOTLPLogExporter({
      url: settings.endpoint.toString(),
    })
    const processor = yield *makeBatchLogRecordProcessor({
      exporter
    })

    return processor
  }
)

const makeOTLPMetricsExporter = wrapConstructor(OTLPMetricExporter);

const makePeriodicExportingMetricReader = wrapConstructor(PeriodicExportingMetricReader);

const makeMetricReader = Effect.fnUntraced(
  function*(settings: OtelEnabled){
    const exporter = yield *makeOTLPMetricsExporter({
      url: settings.endpoint.toString()
    })

    const reader = yield *makePeriodicExportingMetricReader({
      exporter
    })

    return reader;
  }
)

export const makeNodeSdkConfiguration: {
  (settings: OtelEnabled): Effect.Effect<NodeSdk.Configuration, OtelSdkError>
} = Effect.fnUntraced(
  function*(settings: OtelEnabled) {
    const spanProcessor = yield *makeSpanProcessor(settings);
    const logRecordProcessor = yield *makeLogRecordRecordProcessor(settings);
    const metricReader = yield *makeMetricReader(settings);

    const configuration: NodeSdk.Configuration = {
      spanProcessor,
      logRecordProcessor,
      metricReader,

      resource: {
        serviceName: settings.serviceName,
        serviceVersion: settings.serviceVersion
      },

      loggerMergeWithExisting: true,
    }

    return configuration;
  }
)
