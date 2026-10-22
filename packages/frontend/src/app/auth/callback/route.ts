import type { NextRequest } from "next/server"

import { Effect, Result } from "effect"
import { NextResponse } from "next/server"

import {
  AuthenticationDenied,
  AuthenticationService,
  AuthenticationUnavailable,
  type CallbackExpectedFailure
} from "../../../lib/authentication.ts"
import { Runtime } from "../../../lib/runtime"
import { CORRELATION_COOKIE } from "../cookie.ts"
import { authenticationReturnBody, tenantFailureResponse } from "../presentation.tsx"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const privateNoStore = "private, no-store"

const isLoopbackHost = (host: string): boolean => {
  const hostname = host.replace(/^\[|\](?::\d+)?$|:\d+$/g, "")
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname)
}

const clearCorrelation = (response: NextResponse, request: NextRequest): void => {
  const host = request.headers.get("host") ?? ""
  response.cookies.set(CORRELATION_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/auth/callback",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:" || !isLoopbackHost(host)
  })
}

const deniedResponse = async () =>
  new NextResponse(await authenticationReturnBody(), {
    headers: {
      "cache-control": privateNoStore,
      "content-type": "text/html; charset=utf-8"
    },
    status: 200
  })

export async function GET(request: NextRequest): Promise<NextResponse> {
  const outcome = await Effect.gen(function*() {
    const authentication = yield* AuthenticationService
    const correlation = request.cookies.get(CORRELATION_COOKIE)?.value
    return yield* authentication.complete({
      ...(correlation === undefined ? {} : { correlation }),
      host: request.headers.get("host") ?? "",
      query: [...request.nextUrl.searchParams.entries()]
    })
  }).pipe(Effect.result, Runtime.runPromise)

  if (Result.isSuccess(outcome)) {
    const response = new NextResponse(null, {
      headers: { "cache-control": privateNoStore },
      status: 204
    })
    clearCorrelation(response, request)
    return response
  }

  const failure: CallbackExpectedFailure = outcome.failure
  const response =
    failure.reason instanceof AuthenticationDenied || failure.reason instanceof AuthenticationUnavailable ?
      await deniedResponse() :
      await tenantFailureResponse(failure.reason.status)
  if (failure.correlationDisposition === "clear") clearCorrelation(response, request)
  return response
}
