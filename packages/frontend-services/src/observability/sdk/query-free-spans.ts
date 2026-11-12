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
 * A view of `span` that overrides only `name` and `attributes`; every other field, including any the SDK adds later,
 * reads through to the span. A spread copy would lose the SDK span's prototype members (`spanContext()`, `duration`,
 * `ended`, and the dropped counts).
 */
const queryFreeSpan = (span: ReadableSpan): ReadableSpan => {
  const overrides: Partial<ReadableSpan> = {
    attributes: queryFreeAttributes(span.attributes),
    name: withoutQuery(span.name)
  }
  return new Proxy(span, {
    get: (target, key): unknown => Reflect.get(Reflect.has(overrides, key) ? overrides : target, key)
  })
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
