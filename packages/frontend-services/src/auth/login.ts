import { Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

import { AuthenticationService, AuthenticationUnavailable } from "../authentication.js"
import { toNext } from "../next.js"
import { PRIVATE_NO_STORE } from "./constants.js"
import { CORRELATION_COOKIE } from "./cookie.js"

export type TenantFailureResponse = (status: 404 | 500) => Promise<NextResponse>

const redirect = (status: number, location?: string) =>
  new NextResponse(null, {
    headers: {
      "cache-control": PRIVATE_NO_STORE,
      ...(location === undefined ? {} : { location })
    },
    status
  })

const prepareAuthentication = (
  respondToTenantFailure: TenantFailureResponse,
  request: NextRequest
) =>
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
    Effect.catch((failure) => Effect.promise(() => respondToTenantFailure(failure.status)))
  )

export const createLoginHandler = (respondToTenantFailure: TenantFailureResponse) =>
  toNext((request) => prepareAuthentication(respondToTenantFailure, request))
