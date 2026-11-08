import { Clock, Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

import { AuthenticationService, type CallbackExpectedFailure, type TrustedIdentity } from "../authentication.js"
import { tenantFailureStatus } from "../error.js"
import { toNext } from "../next.js"
import {
  type EstablishedSession,
  type EstablishSessionInput,
  type NoUsableSession,
  type SessionIdentity,
  SessionService,
  SessionServiceUnavailable,
  type UsableSession
} from "../session.js"
import { effectiveSessionPolicy, type SessionPolicy, TenantConfigService } from "../tenant.js"
import { PRIVATE_NO_STORE } from "./constants.js"
import { CORRELATION_COOKIE, isLoopbackHost, setSessionCookie } from "./cookie.js"
import { CallbackFreshness } from "./freshness.js"

export interface CallbackResponses {
  readonly authenticationReturn: () => Promise<NextResponse>
  readonly tenantFailure: (status: 404 | 500) => Promise<NextResponse>
}

/** Establish only issues the usable member of the public read result. */
type IssuedSession = Extract<NoUsableSession | UsableSession, { readonly _tag: "UsableSession" }>

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

const responseForReason = (
  responses: CallbackResponses,
  reason: CallbackExpectedFailure["reason"]
): Promise<NextResponse> => {
  switch (reason._tag) {
    case "AuthenticationDenied":
    case "AuthenticationUnavailable":
      return responses.authenticationReturn()
    case "TenantNotFound":
    case "TenantReadError":
      return responses.tenantFailure(tenantFailureStatus(reason))
  }
}

/** Failed or ambiguous establishment, and unconfirmed trusted completion, both fail closed with no session cookie. */
const failClosedAfterTrustedResult = (responses: CallbackResponses, request: NextRequest) =>
  Effect.promise(responses.authenticationReturn).pipe(Effect.map((response) => clearCorrelation(response, request)))

const establishSession = Effect.fn("establishSession")(function*(
  request: NextRequest,
  identity: TrustedIdentity
) {
  const tenant = yield* TenantConfigService
  const session = yield* SessionService
  const config = yield* tenant.getConfigFromAlias(identity.tenantAlias).pipe(
    Effect.mapError(() => new SessionServiceUnavailable({}))
  )
  const policy: SessionPolicy = effectiveSessionPolicy(config)
  const input: EstablishSessionInput = {
    identity: { issuer: identity.issuer, subject: identity.subject } satisfies SessionIdentity,
    policy,
    tenantAlias: identity.tenantAlias
  }
  const established: EstablishedSession = yield* session.establish(input)
  const usable: IssuedSession = established.session
  const now = yield* Clock.currentTimeMillis
  const maxAgeSeconds = Math.max(0, Math.floor((usable.idleDeadlineEpochMilliseconds - now) / 1_000))
  const response = new NextResponse(null, {
    headers: { "cache-control": PRIVATE_NO_STORE },
    status: 204
  })
  return setSessionCookie(clearCorrelation(response, request), request, established.reference, maxAgeSeconds)
})

const respondToTrustedIdentity = Effect.fnUntraced(function*(
  responses: CallbackResponses,
  request: NextRequest,
  identity: TrustedIdentity
) {
  const freshness = yield* CallbackFreshness
  if (!freshness.confirmed(identity)) return yield* failClosedAfterTrustedResult(responses, request)
  return yield* establishSession(request, identity).pipe(
    Effect.catchTag("SessionServiceUnavailable", () => failClosedAfterTrustedResult(responses, request))
  )
})

const completeAuthentication = Effect.fn("completeAuthentication")(
  function*(_responses: CallbackResponses, request: NextRequest) {
    const authentication = yield* AuthenticationService
    const correlation = request.cookies.get(CORRELATION_COOKIE)?.value
    return yield* authentication.complete({
      ...(correlation === undefined ? {} : { correlation }),
      host: request.headers.get("host") ?? "",
      query: [...request.nextUrl.searchParams.entries()]
    })
  },
  (effect, responses, request) =>
    effect.pipe(
      Effect.matchEffect({
        onFailure: (failure) =>
          Effect.promise(() => responseForReason(responses, failure.reason)).pipe(
            Effect.map((response) =>
              failure.correlationDisposition === "clear" ? clearCorrelation(response, request) : response
            )
          ),
        onSuccess: (identity) => respondToTrustedIdentity(responses, request, identity)
      })
    )
)

export const createCallbackHandler = (responses: CallbackResponses) =>
  toNext((request) => completeAuthentication(responses, request))
