import type * as NodeSdk from "@effect/opentelemetry/NodeSdk"

import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto"
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto"
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http"
import { RedisInstrumentation } from "@opentelemetry/instrumentation-redis"
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node"
import { envDetector } from "@opentelemetry/resources"
import { BatchLogRecordProcessor, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs"
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import * as otelSdk from "@opentelemetry/sdk-node"
import { BatchSpanProcessor, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { Effect } from "effect"

import type { ExportTiming, OtelEnabled } from "../config.js"

import { OtelSdkError } from "./error.js"
import { QueryFreeSpanProcessor } from "./sdk/query-free-spans.js"

type SignalUrl = (signal: "logs" | "metrics" | "traces") => string

/**
 * The span and log processors for the export timing, over OTLP protobuf exporters at the same URLs. `batch` is the
 * SDK's batching with its defaults, as before export timing existed. `immediate` exports each ended span and each
 * emitted log record on its own as soon as it is handed over. An exporter refuses an export once its in-flight limit
 * (30 by default) is reached and the simple processors do not retry, so that limit is lifted under `immediate`; each
 * request still ends at the exporter's own timeout.
 */
const exportProcessors = (timing: ExportTiming, url: SignalUrl) => {
  if (timing === "batch") {
    return {
      logRecordProcessor: new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: url("logs") }) }),
      spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter({ url: url("traces") }))
    }
  }
  const concurrencyLimit = Number.POSITIVE_INFINITY
  return {
    logRecordProcessor: new SimpleLogRecordProcessor({
      exporter: new OTLPLogExporter({ concurrencyLimit, url: url("logs") })
    }),
    spanProcessor: new SimpleSpanProcessor(new OTLPTraceExporter({ concurrencyLimit, url: url("traces") }))
  }
}

/**
 * Builds the OTLP pipeline and starts the global Node SDK. Every OpenTelemetry constructor and `start` is
 * synchronous and may throw, so one `Effect.try` covers them.
 */
export const makeNodeSdkConfiguration = (
  settings: OtelEnabled
): Effect.Effect<NodeSdk.Configuration, OtelSdkError> =>
  Effect.try({
    catch: (cause) => new OtelSdkError({ cause }),
    try: () => {
      const url: SignalUrl = (signal) => `${settings.endpoint.toString()}v1/${signal}`
      const processors = exportProcessors(settings.exportTiming, url)
      // Query removal runs in front of either span processor, so both timings export the same span content.
      const spanProcessor = new QueryFreeSpanProcessor(processors.spanProcessor)
      const { logRecordProcessor } = processors
      // A metric reader binds to exactly one producer, so the global NodeSDK MeterProvider and the Effect metrics
      // bridge each get their own reader and exporter.
      const makeMetricReader = () =>
        new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter({ url: url("metrics") }) })
      const globalMetricReader = makeMetricReader()
      const metricReader = makeMetricReader()
      new otelSdk.NodeSDK({
        instrumentations: [
          new HttpInstrumentation(),
          new RedisInstrumentation(),
          new RuntimeNodeInstrumentation()
        ],
        logRecordProcessors: [logRecordProcessor],
        metricReaders: [globalMetricReader],
        // Only the environment detector runs, so the resource carries `OTEL_SERVICE_NAME`,
        // `OTEL_RESOURCE_ATTRIBUTES`, and the SDK's `telemetry.sdk.*` defaults. The default host and process
        // detectors would export the hostname, OS account, and command line. An explicit list also overrides
        // `OTEL_NODE_RESOURCE_DETECTORS`.
        resourceDetectors: [envDetector],
        spanProcessors: [spanProcessor]
      }).start()
      return {
        loggerMergeWithExisting: true,
        logRecordProcessor,
        metricReader,
        resource: { serviceName: settings.serviceName, serviceVersion: settings.serviceVersion },
        spanProcessor
      }
    }
  })
