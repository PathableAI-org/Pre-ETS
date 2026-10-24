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
  type NoUsableSession,
  type SessionIdentity,
  SessionService,
  SessionServiceUnavailable,
  type UsableSession
} from "../../../lib/session.ts"
import { TenantConfigService } from "../../../lib/tenant.ts"
import { PRIVATE_NO_STORE } from "../constants.ts"
import { CORRELATION_COOKIE, isLoopbackHost, setSessionCookie } from "../cookie.ts"
import { authenticationReturnBody, tenantFailureResponse } from "../presentation.tsx"
import { callbackFreshnessPolicy } from "./freshness.ts"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

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

const establishSession = Effect.fn("establishSession")(function*(
  request: NextRequest,
  identity: TrustedIdentity
) {
  const tenant = yield* TenantConfigService
  const session = yield* SessionService
  const config = yield* tenant.getConfigFromAlias(identity.tenantAlias).pipe(
    Effect.mapError((cause) => new SessionServiceUnavailable({ cause }))
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
        callbackFreshnessPolicy.confirmed(identity) ?
          establishSession(request, identity).pipe(
            Effect.catchTag(SessionServiceUnavailable.tag, () => failClosedAfterTrustedResult(request))
          ) :
          failClosedAfterTrustedResult(request)
    })
  )

export const GET = toNext(completeAuthentication)
