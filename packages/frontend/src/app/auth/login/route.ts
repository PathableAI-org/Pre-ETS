import type { NextRequest } from "next/server"

import { Effect, Result } from "effect"
import { NextResponse } from "next/server"

import { AuthenticationService, AuthenticationUnavailable } from "../../../lib/authentication.ts"
import { Runtime } from "../../../lib/runtime"
import { CORRELATION_COOKIE } from "../cookie.ts"
import { tenantFailureResponse } from "../presentation.tsx"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const privateNoStore = "private, no-store"

const failedResponse = (status: number, location?: string) =>
  new NextResponse(null, {
    headers: {
      "cache-control": privateNoStore,
      ...(location === undefined ? {} : { location })
    },
    status
  })

export async function GET(request: NextRequest): Promise<NextResponse> {
  const outcome = await Effect.gen(function*() {
    const authentication = yield* AuthenticationService
    return yield* authentication.prepare({ host: request.headers.get("host") ?? "" })
  }).pipe(Effect.result, Runtime.runPromise)

  if (Result.isFailure(outcome)) {
    return outcome.failure instanceof AuthenticationUnavailable ?
      failedResponse(307, "/login-unavailable") :
      await tenantFailureResponse(outcome.failure.status)
  }

  const prepared = outcome.success
  const response = failedResponse(307, prepared.destination)
  const redirectUri = new URL(prepared.destination).searchParams.get("redirect_uri")
  response.cookies.set(CORRELATION_COOKIE, prepared.correlation, {
    httpOnly: true,
    maxAge: Math.max(1, Math.ceil((prepared.expiresAt - Date.now()) / 1_000)),
    path: "/auth/callback",
    sameSite: "lax",
    secure: redirectUri === null || new URL(redirectUri).protocol === "https:"
  })
  return response
}
