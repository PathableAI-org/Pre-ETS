import { Clock, Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

import {
  AuthenticationDenied,
  AuthenticationService,
  AuthenticationUnavailable,
  type CallbackExpectedFailure,
  type TrustedIdentity
} from "../authentication.js"
import { toNext } from "../next.js"
import {
  type EffectiveSessionPolicy,
  type EstablishedSession,
  type EstablishSessionInput,
  type NoUsableSession,
  type SessionIdentity,
  SessionService,
  SessionServiceUnavailable,
  type UsableSession
} from "../session.js"
import { TenantConfigService } from "../tenant.js"
import { PRIVATE_NO_STORE } from "./constants.js"
import { CORRELATION_COOKIE, isLoopbackHost, setSessionCookie } from "./cookie.js"
import { callbackFreshnessPolicy } from "./freshness.js"

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

const responseForReason = (responses: CallbackResponses, reason: CallbackExpectedFailure["reason"]) =>
  Effect.fail(reason).pipe(
    Effect.catchTag(AuthenticationDenied.tag, () => Effect.promise(responses.authenticationReturn)),
    Effect.catchTag(AuthenticationUnavailable.tag, () => Effect.promise(responses.authenticationReturn)),
    Effect.catch((failure) => Effect.promise(() => responses.tenantFailure(failure.status)))
  )

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
  const policy: EffectiveSessionPolicy = tenant.effectiveSessionPolicy(config)
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

const completeAuthentication = (responses: CallbackResponses, request: NextRequest) =>
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
        responseForReason(responses, failure.reason).pipe(
          Effect.map((response) =>
            failure.correlationDisposition === "clear" ? clearCorrelation(response, request) : response
          )
        ),
      onSuccess: (identity) =>
        callbackFreshnessPolicy.confirmed(identity) ?
          establishSession(request, identity).pipe(
            Effect.catchTag(SessionServiceUnavailable.tag, () => failClosedAfterTrustedResult(responses, request))
          ) :
          failClosedAfterTrustedResult(responses, request)
    })
  )

export const createCallbackHandler = (responses: CallbackResponses) =>
  toNext((request) => completeAuthentication(responses, request))
