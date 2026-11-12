import { Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

import { AuthenticationService, type CallbackExpectedFailure, type TrustedIdentity } from "../authentication.js"
import { SessionService, SessionServiceUnavailable } from "../session.js"
import { effectiveSessionPolicy, TenantConfigService } from "../tenant.js"
import { clearCorrelation, CORRELATION_COOKIE, setSessionCookie } from "./cookies.js"
import { PRIVATE_NO_STORE, toNext } from "./handler.js"
import { type TenantFailureResponse, tenantFailureStatus } from "./tenant-failure.js"

export interface CallbackResponses {
  readonly authenticationReturn: () => Promise<NextResponse>
  readonly tenantFailure: TenantFailureResponse
}

const responseForReason = (
  responses: CallbackResponses,
  reason: CallbackExpectedFailure["reason"]
): Promise<NextResponse> => {
  switch (reason._tag) {
    case "AuthenticationDenied":
    case "AuthenticationNotFresh":
    case "AuthenticationUnavailable":
      return responses.authenticationReturn()
    case "TenantNotFound":
    case "TenantReadError":
      return responses.tenantFailure(tenantFailureStatus(reason))
  }
}

/** Failed or ambiguous establishment fails closed with no session cookie. */
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
  const established = yield* session.establish({
    identity: { issuer: identity.issuer, subject: identity.subject },
    policy: effectiveSessionPolicy(config),
    tenantAlias: identity.tenantAlias
  })
  // A navigable 303 so the browser leaves the provider and its next request presents the new session.
  const response = new NextResponse(null, {
    headers: { "cache-control": PRIVATE_NO_STORE, location: "/" },
    status: 303
  })
  return setSessionCookie(clearCorrelation(response, request), request, established.reference)
})

const respondToTrustedIdentity = (responses: CallbackResponses, request: NextRequest, identity: TrustedIdentity) =>
  establishSession(request, identity).pipe(
    Effect.catchTag("SessionServiceUnavailable", () => failClosedAfterTrustedResult(responses, request))
  )

const completeAuthentication = Effect.fn("completeAuthentication")(
  function*(_responses: CallbackResponses, request: NextRequest) {
    const authentication = yield* AuthenticationService
    return yield* authentication.complete({
      correlation: request.cookies.get(CORRELATION_COOKIE)?.value,
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
