import "server-only"
import { Effect, Predicate } from "effect"
import { type NextRequest, NextResponse } from "next/server"

import type { ApplicationServices } from "../runtime.js"

import { Runtime } from "../runtime.js"

/** `Cache-Control` for every response that carries per-user state or a tenant diagnostic. */
export const PRIVATE_NO_STORE = "private, no-store"

/** Runs one request Effect on the process runtime and returns its Next.js response. */
export const toNext =
  (handler: (request: NextRequest) => Effect.Effect<NextResponse, never, ApplicationServices>) =>
  (request: NextRequest): Promise<NextResponse> =>
    Runtime.runPromise(Effect.suspend(() => handler(request))).catch((error: unknown) => {
      if (Predicate.isTagged(error, "StartupNotReady")) {
        return new NextResponse(null, { headers: { "cache-control": PRIVATE_NO_STORE }, status: 503 })
      }
      throw error
    })
