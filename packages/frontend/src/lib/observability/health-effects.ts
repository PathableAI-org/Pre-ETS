import { Effect } from "effect"
import { NextResponse } from "next/server"

/**
 * Demo handlers: HTTP request spans come from @vercel/otel auto-instrumentation.
 * Effect.withSpan here is a logical child under the active OTEL request context.
 */
export const healthOkEffect = Effect.sync(() => NextResponse.json({ ok: true }, { status: 200 })).pipe(
  Effect.withSpan("health.check")
)

export const healthErrorEffect = Effect.sync(() =>
  NextResponse.json({ error: "intentional", ok: false }, { status: 500 })
).pipe(
  Effect.withSpan("health.error")
)
