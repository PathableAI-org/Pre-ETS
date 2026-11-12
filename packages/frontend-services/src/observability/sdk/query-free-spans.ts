import type { Attributes, Context } from "@opentelemetry/api"
import type { ReadableSpan, Span, SpanProcessor } from "@opentelemetry/sdk-trace-base"

/**
 * Attributes whose value is, or contains, a URL or request target that may carry a query string. Next.js copies
 * every span name into `next.span_name`, so a fetch span's copy names the full URL.
 */
const urlAttributeKeys = ["http.target", "http.url", "next.span_name", "url.full"]

/** The query attribute itself; dropped entirely. */
const queryAttributeKey = "url.query"

/** A `?` and every character up to the next whitespace, so a URL inside a span name loses only its query. */
const queryPattern = /\?\S*/g

const withoutQuery = (value: string) => value.replace(queryPattern, "")

const queryFreeAttributes = (attributes: Attributes): Attributes => {
  const { [queryAttributeKey]: _query, ...rest } = attributes
  for (const key of urlAttributeKeys) {
    const value = rest[key]
    if (typeof value === "string") rest[key] = withoutQuery(value)
  }
  return rest
}

/**
 * Copies each `ReadableSpan` field explicitly. The SDK passes a class instance whose `spanContext()`, `duration`,
 * `ended`, and dropped counts live on its prototype, so a spread would drop them; an explicit copy also fails to
 * compile if the SDK adds a required field.
 */
const queryFreeSpan = (span: ReadableSpan): ReadableSpan => {
  const copy: ReadableSpan = {
    attributes: queryFreeAttributes(span.attributes),
    droppedAttributesCount: span.droppedAttributesCount,
    droppedEventsCount: span.droppedEventsCount,
    droppedLinksCount: span.droppedLinksCount,
    duration: span.duration,
    ended: span.ended,
    endTime: span.endTime,
    events: span.events,
    instrumentationScope: span.instrumentationScope,
    kind: span.kind,
    links: span.links,
    name: withoutQuery(span.name),
    resource: span.resource,
    spanContext: () => span.spanContext(),
    startTime: span.startTime,
    status: span.status
  }
  // ReadableSpan declares `parentSpanContext?: SpanContext` without `| undefined`, so a root span omits the key.
  return span.parentSpanContext === undefined ? copy : { ...copy, parentSpanContext: span.parentSpanContext }
}

/**
 * Hands each ended span to `delegate` without request query strings, so no instrumentation exports a query value:
 * `url.query` is dropped, and the query is cut from URL attributes and from the span name (Next's fetch spans name
 * the full URL). Paths and route templates stay. Query values are forbidden data under the verification telemetry
 * conventions (docs/observability.md).
 */
export class QueryFreeSpanProcessor implements SpanProcessor {
  constructor(private readonly delegate: SpanProcessor) {}

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush()
  }

  onEnd(span: ReadableSpan): void {
    this.delegate.onEnd(queryFreeSpan(span))
  }

  onStart(span: Span, parentContext: Context): void {
    this.delegate.onStart(span, parentContext)
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown()
  }
}
