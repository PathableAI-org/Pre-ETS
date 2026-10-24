import type { NextRequest } from "next/server"

import { Clock, Effect } from "effect"
import { NextResponse } from "next/server"

import {
  AuthenticationDenied,
  AuthenticationService,
  AuthenticationUnavailable,
  type CallbackExpectedFailure,
  type TrustedIdentity
} from "../../../lib/authentication.ts"
import { toNext } from "../../../lib/next.ts"
import {
  type EffectiveSessionPolicy,
  type EstablishedSession,
  type EstablishSessionInput,
  type SessionIdentity,
  SessionService,
  SessionServiceUnavailable,
  type UsableSession
} from "../../../lib/session.ts"
import { TenantConfigService } from "../../../lib/tenant.ts"
import { PRIVATE_NO_STORE } from "../constants.ts"
import { CORRELATION_COOKIE, isLoopbackHost, setSessionCookie } from "../cookie.ts"
import { authenticationReturnBody, tenantFailureResponse } from "../presentation.tsx"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const clearCorrelation = (response: NextResponse, request: NextRequest): NextResponse => {
  const host = request.headers.get("host") ?? ""
  response.cookies.set(CORRELATION_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/auth/callback",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:" || !isLoopbackHost(host)
  })
  return response
}

/**
 * B6/#158 owns the authentication-time comparison, clock tolerance, and provider
 * policy that would confirm a fresh authentication event. Until that confirmation
 * exists, a trusted identity is treated as unconfirmed and never establishes a
 * session or issues a session cookie.
 */
const freshnessConfirmed = (_identity: TrustedIdentity): boolean => false

const authenticationReturn = Effect.promise(async () =>
  new NextResponse(await authenticationReturnBody(), {
    headers: {
      "cache-control": PRIVATE_NO_STORE,
      "content-type": "text/html; charset=utf-8"
    },
    status: 200
  })
)

const tenantFailure = (status: 404 | 500) => Effect.promise(() => tenantFailureResponse(status))

const responseForReason = (reason: CallbackExpectedFailure["reason"]) =>
  Effect.fail(reason).pipe(
    Effect.catchTag(AuthenticationDenied.tag, () => authenticationReturn),
    Effect.catchTag(AuthenticationUnavailable.tag, () => authenticationReturn),
    Effect.catch((failure) => tenantFailure(failure.status))
  )

/** Failed or ambiguous establishment, and unconfirmed trusted completion, both fail closed with no session cookie. */
const failClosedAfterTrustedResult = (request: NextRequest) =>
  authenticationReturn.pipe(Effect.map((response) => clearCorrelation(response, request)))

const establishSession = (request: NextRequest, identity: TrustedIdentity) =>
  Effect.gen(function*() {
    const tenant = yield* TenantConfigService
    const session = yield* SessionService
    const config = yield* tenant.getConfigFromAlias(identity.tenantAlias).pipe(
      Effect.mapError(() => new SessionServiceUnavailable({}))
    )
    const policy: EffectiveSessionPolicy = tenant.effectiveSessionPolicy(config)
    const input: EstablishSessionInput = {
      identity: { issuer: identity.issuer, subject: identity.subject } satisfies SessionIdentity,
      policy,
      tenantAlias: identity.tenantAlias
    }
    const established: EstablishedSession = yield* session.establish(input)
    const usable: UsableSession = established.session
    const now = yield* Clock.currentTimeMillis
    const maxAgeSeconds = Math.max(0, Math.floor((usable.idleDeadlineEpochMilliseconds - now) / 1_000))
    const response = new NextResponse(null, {
      headers: { "cache-control": PRIVATE_NO_STORE },
      status: 204
    })
    return setSessionCookie(clearCorrelation(response, request), request, established.reference, maxAgeSeconds)
  })

const completeAuthentication = (request: NextRequest) =>
  Effect.gen(function*() {
    const authentication = yield* AuthenticationService
    const correlation = request.cookies.get(CORRELATION_COOKIE)?.value
    return yield* authentication.complete({
      ...(correlation === undefined ? {} : { correlation }),
      host: request.headers.get("host") ?? "",
      query: [...request.nextUrl.searchParams.entries()]
    })
  }).pipe(
    Effect.matchEffect({
      onFailure: (failure) =>
        responseForReason(failure.reason).pipe(
          Effect.map((response) =>
            failure.correlationDisposition === "clear" ? clearCorrelation(response, request) : response
          )
        ),
      onSuccess: (identity) =>
        freshnessConfirmed(identity) ?
          establishSession(request, identity).pipe(
            Effect.catchTag(SessionServiceUnavailable.tag, () => failClosedAfterTrustedResult(request))
          ) :
          failClosedAfterTrustedResult(request)
    })
  )

export const GET = toNext(completeAuthentication)
