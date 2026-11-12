import type { Span } from "@opentelemetry/api"
import type { BrowserTracingConfig } from "@pathableai/pre-ets-frontend-services"

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { registerInstrumentations } from "@opentelemetry/instrumentation"
import { DocumentLoadInstrumentation } from "@opentelemetry/instrumentation-document-load"
import { type FetchCustomAttributeFunction, FetchInstrumentation } from "@opentelemetry/instrumentation-fetch"
import { defaultResource, resourceFromAttributes } from "@opentelemetry/resources"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web"

import { filterExport } from "./export-filter.ts"

const outcome = (value: string) => (span: Span) => {
  span.setAttribute("preets.outcome", value)
}

/** T-003: `responded` for any HTTP response, `network_error` when none arrived. */
const fetchOutcome: FetchCustomAttributeFunction = (span, _request, result) => {
  span.setAttribute("preets.outcome", result instanceof Response ? "responded" : "network_error")
}

/**
 * Registers the web SDK: a provider exporting filtered spans over OTLP/HTTP straight to the collector with no
 * headers, `traceparent` on same-origin `fetch` only, and the document-load records continuing the rendered
 * `traceparent` (research D4–D7, D9, D10). Sets the `started` marker last. Loaded lazily by the facade only.
 */
export function startSdk(config: BrowserTracingConfig): void {
  const traceUrl = new URL("v1/traces", config.endpoint).href
  const provider = new WebTracerProvider({
    // The default resource contributes only `telemetry.sdk.*` (language `webjs`); the service values replace its name.
    resource: defaultResource().merge(resourceFromAttributes({
      "service.instance.id": config.serviceInstanceId,
      "service.name": config.serviceName,
      "service.version": config.serviceVersion
    })),
    spanProcessors: [new BatchSpanProcessor(filterExport(new OTLPTraceExporter({ url: traceUrl })))]
  })
  provider.register()
  registerInstrumentations({
    instrumentations: [
      // `propagateTraceHeaderCorsUrls` stays unset, so only same-origin requests carry `traceparent` (D6).
      new FetchInstrumentation({ applyCustomAttributesOnSpan: fetchOutcome, ignoreUrls: [traceUrl] }),
      new DocumentLoadInstrumentation({
        applyCustomAttributesOnSpan: { documentFetch: outcome("fetched"), documentLoad: outcome("loaded") },
        ignorePerformancePaintEvents: true
      })
    ],
    tracerProvider: provider
  })
  document.documentElement.dataset.preetsBrowserTracing = "started"
}
