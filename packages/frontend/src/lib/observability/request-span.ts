import { Effect } from "effect"

import { buildRequestSpanAttributes, type RequestSpanFacts, type SpanAttributes } from "./attributes.ts"

/**
 * Annotates the current Effect span with sanitized request facts.
 * Producers must use this (or `buildRequestSpanAttributes`) so prohibited keys
 * cannot reach OTLP export.
 */
export function annotateRequestSpan(
  facts: RequestSpanFacts
): Effect.Effect<void> {
  return Effect.annotateCurrentSpan(buildRequestSpanAttributes(facts))
}

export function requestSpanAttributes(
  facts: RequestSpanFacts
): SpanAttributes {
  return buildRequestSpanAttributes(facts)
}
