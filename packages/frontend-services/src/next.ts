import "server-only"
import { Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

import type { ApplicationServices } from "./runtime.js"

import { Runtime, StartupNotReady } from "./runtime.js"

/** Runs one request Effect on the process runtime and returns its Next.js response. */
export const toNext =
  (handler: (request: NextRequest) => Effect.Effect<NextResponse, never, ApplicationServices>) =>
  (request: NextRequest): Promise<NextResponse> =>
    Runtime.runPromise(Effect.suspend(() => handler(request))).catch((error: unknown) => {
      if (error instanceof StartupNotReady) return new NextResponse(null, { status: 503 })
      throw error
    })
