import type * as NodeSdk from "@effect/opentelemetry/NodeSdk"

import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto"
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto"
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http"
import { RedisInstrumentation } from "@opentelemetry/instrumentation-redis"
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node"
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs"
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import * as otelSdk from "@opentelemetry/sdk-node"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { Effect } from "effect"

import type { OtelEnabled } from "../config.js"

import { OtelSdkError } from "./error.js"

/** Query parameters redacted from HTTP spans, including the OIDC callback's `code` and `state`. */
const redactedQueryParams = [
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
      const url = (signal: "logs" | "metrics" | "traces") => `${settings.endpoint.toString()}v1/${signal}`
      const spanProcessor = new BatchSpanProcessor(new OTLPTraceExporter({ url: url("traces") }))
      const logRecordProcessor = new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: url("logs") }) })
      const metricReader = new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: url("metrics") })
      })
      new otelSdk.NodeSDK({
        instrumentations: [
          new HttpInstrumentation({ redactedQueryParams, redactedQueryParamsServer: redactedQueryParams }),
          new RedisInstrumentation(),
          new RuntimeNodeInstrumentation()
        ],
        logRecordProcessors: [logRecordProcessor],
        metricReaders: [metricReader],
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
