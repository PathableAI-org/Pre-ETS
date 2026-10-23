import type { NextRequest } from "next/server"

import { Effect } from "effect"
import { NextResponse } from "next/server"

import {
  AuthenticationDenied,
  AuthenticationService,
  AuthenticationUnavailable,
  type CallbackExpectedFailure
} from "../../../lib/authentication.ts"
import { toNext } from "../../../lib/next.ts"
import { PRIVATE_NO_STORE } from "../constants.ts"
import { CORRELATION_COOKIE } from "../cookie.ts"
import { authenticationReturnBody, tenantFailureResponse } from "../presentation.tsx"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const isLoopbackHost = (host: string): boolean => {
  const hostname = host.replace(/^\[|\](?::\d+)?$|:\d+$/g, "")
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname)
}

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
      onSuccess: () =>
        Effect.succeed(clearCorrelation(
          new NextResponse(null, {
            headers: { "cache-control": PRIVATE_NO_STORE },
            status: 204
          }),
          request
        ))
    })
  )

export const GET = toNext(completeAuthentication)
