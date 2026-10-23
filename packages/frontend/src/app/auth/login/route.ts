import type { NextRequest } from "next/server"

import { Effect } from "effect"
import { NextResponse } from "next/server"

import { AuthenticationService, AuthenticationUnavailable } from "../../../lib/authentication.ts"
import { toNext } from "../../../lib/next.ts"
import { PRIVATE_NO_STORE } from "../constants.ts"
import { CORRELATION_COOKIE } from "../cookie.ts"
import { tenantFailureResponse } from "../presentation.tsx"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const redirect = (status: number, location?: string) =>
  new NextResponse(null, {
    headers: {
      "cache-control": PRIVATE_NO_STORE,
      ...(location === undefined ? {} : { location })
    },
    status
  })

const prepareAuthentication = (request: NextRequest) =>
  Effect.gen(function*() {
    const authentication = yield* AuthenticationService
    return yield* authentication.prepare({ host: request.headers.get("host") ?? "" })
  }).pipe(
    Effect.map((prepared) => {
      const response = redirect(307, prepared.destination)
      const redirectUri = new URL(prepared.destination).searchParams.get("redirect_uri")
      response.cookies.set(CORRELATION_COOKIE, prepared.correlation, {
        httpOnly: true,
        maxAge: Math.max(1, Math.ceil((prepared.expiresAt - Date.now()) / 1_000)),
        path: "/auth/callback",
        sameSite: "lax",
        secure: redirectUri === null || new URL(redirectUri).protocol === "https:"
      })
      return response
    }),
    Effect.catchTag(AuthenticationUnavailable.tag, () => Effect.succeed(redirect(307, "/login-unavailable"))),
    Effect.catch((failure) => Effect.promise(() => tenantFailureResponse(failure.status)))
  )

export const GET = toNext(prepareAuthentication)
