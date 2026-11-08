import { Clock, Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

import { AuthenticationService } from "../authentication.js"
import { type TenantFailureResponse, tenantFailureStatus } from "../error.js"
import { PRIVATE_NO_STORE, toNext } from "../next.js"
import { cookieOptions, CORRELATION_COOKIE } from "./cookie.js"

const redirect = (location: string) =>
  new NextResponse(null, { headers: { "cache-control": PRIVATE_NO_STORE, location }, status: 307 })

const prepareAuthentication = Effect.fn("prepareAuthentication")(
  function*(_respondToTenantFailure: TenantFailureResponse, request: NextRequest) {
    const authentication = yield* AuthenticationService
    const prepared = yield* authentication.prepare({ host: request.headers.get("host") ?? "" })
    const now = yield* Clock.currentTimeMillis
    const response = redirect(prepared.destination)
    const redirectUri = new URL(prepared.destination).searchParams.get("redirect_uri")
    // The cookie returns on the provider's redirect, so the callback URI's scheme decides `Secure`.
    response.cookies.set(
      CORRELATION_COOKIE,
      prepared.correlation,
      cookieOptions({
        maxAge: Math.max(1, Math.ceil((prepared.expiresAt - now) / 1_000)),
        path: "/auth/callback",
        secure: redirectUri === null || new URL(redirectUri).protocol === "https:"
      })
    )
    return response
  },
  (effect, respondToTenantFailure) =>
    effect.pipe(
      Effect.catchTag("AuthenticationUnavailable", () => Effect.succeed(redirect("/login-unavailable"))),
      Effect.catch((failure) => Effect.promise(() => respondToTenantFailure(tenantFailureStatus(failure))))
    )
)

export const createLoginHandler = (respondToTenantFailure: TenantFailureResponse) =>
  toNext((request) => prepareAuthentication(respondToTenantFailure, request))
