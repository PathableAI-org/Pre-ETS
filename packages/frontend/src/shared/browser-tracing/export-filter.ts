import type { Attributes } from "@opentelemetry/api"
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base"

/**
 * Record names the telemetry contract defines (T-001–T-007, T-009–T-011; #157 T-005). Every other span is dropped.
 */
const EXPORTED_SPAN_NAMES: ReadonlySet<string> = new Set([
  "BrowserTracing.buffer",
  "CONNECT",
  "DELETE",
  "documentFetch",
  "documentLoad",
  "Focus.move",
  "GET",
  "HEAD",
  "Interaction.login",
  "Interaction.submit",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
  "Router.transition",
  "TabChannel.receive",
  "TabChannel.send",
  "TabCoordination.transition",
  "TRACE"
])

/** The contract's attribute allow list. `url.full` and `url.path` are reduced to a pathname separately. */
const EXPORTED_ATTRIBUTE_KEYS: ReadonlySet<string> = new Set([
  "http.request.method",
  "http.response.status_code",
  "preets.focus.cause",
  "preets.focus.change",
  "preets.focus.target",
  "preets.interaction.kind",
  "preets.login.entry",
  "preets.navigation.type",
  "preets.outcome",
  "preets.tab.message.direction",
  "preets.tab.message.id",
  "preets.tab.message.kind",
  "preets.tracing.dropped_count",
  "preets.ui.cause",
  "preets.ui.from_state",
  "preets.ui.to_state"
])

const URL_KEYS: ReadonlySet<string> = new Set(["url.full", "url.path"])

/** Resolves relative paths only; the origin never reaches the exported value. */
const PATH_BASE = "http://path.invalid"

/** A URL's pathname, without origin, query, or fragment. */
const pathOf = (value: unknown): string | undefined => {
  if (typeof value !== "string" || !URL.canParse(value, PATH_BASE)) return undefined
  return new URL(value, PATH_BASE).pathname
}

const filterAttributes = (attributes: Attributes): Attributes => {
  const kept: Attributes = {}
  for (const [key, value] of Object.entries(attributes)) {
    if (EXPORTED_ATTRIBUTE_KEYS.has(key)) kept[key] = value
  }
  for (const key of URL_KEYS) {
    const path = pathOf(attributes[key])
    if (path !== undefined) kept["url.path"] = path
  }
  return kept
}

/**
 * A copy carrying only allow-listed attributes, event names and times without `exception` events or event attributes,
 * no links, and the status code without its description.
 */
const filterSpan = (span: ReadableSpan): ReadableSpan => {
  const filtered: ReadableSpan = {
    attributes: filterAttributes(span.attributes),
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
    duration: span.duration,
    ended: span.ended,
    endTime: span.endTime,
    events: span.events.filter((event) => event.name !== "exception").map(({ name, time }) => ({ name, time })),
    instrumentationScope: span.instrumentationScope,
    kind: span.kind,
    links: [],
    name: span.name,
    resource: span.resource,
    spanContext: () => span.spanContext(),
    startTime: span.startTime,
    status: { code: span.status.code }
  }
  // ReadableSpan declares `parentSpanContext` optional without `| undefined`, so a root span must omit the key.
  return span.parentSpanContext === undefined ? filtered : { ...filtered, parentSpanContext: span.parentSpanContext }
}

/** Wraps `exporter` so every exported span passes the contract's allow lists (research D9; FR-019–FR-021a). */
export function filterExport(exporter: SpanExporter): SpanExporter {
  return {
    export: (spans, resultCallback) => {
      exporter.export(spans.filter((span) => EXPORTED_SPAN_NAMES.has(span.name)).map(filterSpan), resultCallback)
    },
    forceFlush: () => exporter.forceFlush?.() ?? Promise.resolve(),
    shutdown: () => exporter.shutdown()
  }
}
