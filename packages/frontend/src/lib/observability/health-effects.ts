import { Effect } from "effect"
import { NextResponse } from "next/server"

import { requestSpanAttributes } from "./request-span.ts"

const HEALTH_ROUTE = "/api/health"
const HEALTH_ERROR_ROUTE = "/api/health/error"

export const healthOkEffect = Effect.sync(() => NextResponse.json({ ok: true }, { status: 200 })).pipe(
  Effect.withSpan("GET /api/health", {
    attributes: requestSpanAttributes({
      method: "GET",
      route: HEALTH_ROUTE,
      statusCode: 200
    })
  })
)

export const healthErrorEffect = Effect.sync(() =>
  NextResponse.json({ error: "intentional", ok: false }, { status: 500 })
).pipe(
  Effect.withSpan("GET /api/health/error", {
    attributes: requestSpanAttributes({
      method: "GET",
      route: HEALTH_ERROR_ROUTE,
      statusCode: 500
    })
  })
)
