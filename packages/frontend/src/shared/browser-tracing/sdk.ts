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
import { type Fact, type FactScope, recordFact, replayFacts } from "./facts.ts"

/** A same-origin request Next sends outside any synchronous scope, which an earlier interaction caused (D16). */
export type CausedRequest =
  | { readonly kind: "action" }
  | { readonly kind: "router"; readonly path: string }

/** What the facade hands the SDK when it registers: the buffered facts and the pending-cause slots. */
export interface SdkStartup {
  readonly buffered: readonly Fact[]
  /** Claims the pending cause of `request` once, when exactly one is pending; otherwise answers `undefined`. */
  readonly claimCause: (request: CausedRequest) => FactScope | undefined
  readonly dropped: number
}

const outcome = (value: string) => (span: Span) => {
  span.setAttribute("preets.outcome", value)
}

/** T-003: `responded` for any HTTP response, `network_error` when none arrived. */
const fetchOutcome: FetchCustomAttributeFunction = (span, _request, result) => {
  span.setAttribute("preets.outcome", result instanceof Response ? "responded" : "network_error")
}

/** A Server Action POST (`Next-Action`) or a non-prefetch RSC request (`RSC: 1`), by Next's own headers only. */
const causedRequest = (input: RequestInfo | URL, init: RequestInit | undefined): CausedRequest | undefined => {
  const url = new URL(input instanceof Request ? input.url : input, location.href)
  if (url.origin !== location.origin) return undefined
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  if (headers.has("next-action")) return { kind: "action" }
  const navigation = headers.get("rsc") === "1" && !headers.has("next-router-prefetch")
  return navigation ? { kind: "router", path: url.pathname } : undefined
}

/**
 * Registers the web SDK: a provider exporting filtered spans over OTLP/HTTP straight to the collector with no
 * headers, `traceparent` on same-origin `fetch` only, and the document-load records continuing the rendered
 * `traceparent` (research D4–D7, D9, D10). Then it wraps `fetch` with the cause wrapper, replays the facts buffered
 * before registration, and sets the `started` marker last. Answers the live recorder. Loaded lazily by the facade only.
 */
export function startSdk(config: BrowserTracingConfig, startup: SdkStartup): (fact: Fact) => FactScope {
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
  wrapFetch(startup.claimCause)
  replayFacts(startup.buffered, startup.dropped)
  document.documentElement.dataset.preetsBrowserTracing = "started"
  return recordFact
}

/**
 * Wraps the instrumented `fetch` so a request with an unambiguous pending cause starts inside that cause's scope, and
 * its fetch span and the server spans below it become the interaction's descendants (research D16). Next reads
 * `window.fetch` at call time for both request kinds. A failure in the claim sends the request unchanged.
 */
function wrapFetch(claimCause: SdkStartup["claimCause"]): void {
  const instrumented = window.fetch.bind(window)
  const claim = (input: RequestInfo | URL, init: RequestInit | undefined) => {
    try {
      const request = causedRequest(input, init)
      return request === undefined ? undefined : claimCause(request)
    } catch {
      return undefined
    }
  }
  window.fetch = (input, init) => {
    const send = () => instrumented(input, init)
    const cause = claim(input, init)
    return cause === undefined ? send() : cause(send)
  }
}
