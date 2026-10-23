import "server-only"
import type { Effect } from "effect"
import type { NextRequest, NextResponse } from "next/server"

import { Runtime } from "./runtime.ts"

type Runnable<A> = Parameters<typeof Runtime.runPromise>[0] extends Effect.Effect<unknown, unknown, infer R>
  ? Effect.Effect<A, never, R>
  : never

/** Runs one request Effect on the process runtime and returns its Next.js response. */
export const toNext =
  (handler: (request: NextRequest) => Runnable<NextResponse>) => (request: NextRequest): Promise<NextResponse> =>
    Runtime.runPromise(handler(request))
