import { Clock, Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

import { AuthenticationService } from "../authentication.js"
import { cookieOptions, CORRELATION_COOKIE } from "./cookies.js"
import { PRIVATE_NO_STORE, toNext } from "./handler.js"
import { navigationStatus, resolveRequestTenant } from "./request.js"
import { type TenantFailureResponse, tenantFailureStatus } from "./tenant-failure.js"

const redirect = (location: string) =>
  new NextResponse(null, { headers: { "cache-control": PRIVATE_NO_STORE, location }, status: 307 })

const prepareAuthentication = Effect.fn("prepareAuthentication")(
  function*(_respondToTenantFailure: TenantFailureResponse, request: NextRequest) {
    const host = request.headers.get("host") ?? ""
    // A fetch, prefetch, or subresource must not create a transaction or overwrite a login in progress. The tenant
    // resolves first so tenant failures keep their 404/500; `prepare` looks the tenant up itself for a navigation.
    if (navigationStatus(request.headers) === "non-navigation") {
      yield* resolveRequestTenant(host)
      return new NextResponse(null, { headers: { "cache-control": PRIVATE_NO_STORE }, status: 401 })
    }
    const authentication = yield* AuthenticationService
    const prepared = yield* authentication.prepare({ host })
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
