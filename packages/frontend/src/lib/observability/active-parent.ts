import type { Effect, Tracer } from "effect"

import { OtelTracer } from "@effect/opentelemetry"
import { context as otelContext, trace } from "@opentelemetry/api"

/**
 * Continues the active OpenTelemetry request span as the Effect parent.
 * Needed when ManagedRuntime.runPromise runs outside the auto-instrumented
 * async context that `@vercel/otel` would otherwise propagate.
 */
export function attachActiveOtelParent<A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, Exclude<R, Tracer.ParentSpan>> {
  const spanContext = trace.getSpanContext(otelContext.active())
  if (spanContext === undefined || !trace.isSpanContextValid(spanContext)) {
    return effect as Effect.Effect<A, E, Exclude<R, Tracer.ParentSpan>>
  }
  return effect.pipe(OtelTracer.withSpanContext(spanContext))
}
