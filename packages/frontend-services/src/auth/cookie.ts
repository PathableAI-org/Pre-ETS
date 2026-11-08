import type { NextRequest, NextResponse } from "next/server"

import type { SessionReference } from "../session.js"

import { isLoopbackHostname, parseRequestHost } from "../request-host.js"
import { SESSION_COOKIE } from "../session-request.js"

export const CORRELATION_COOKIE = "oidc-correlation"

/** Host-only, HttpOnly, SameSite=Lax: the attributes every application cookie shares. */
export const cookieOptions = (input: { readonly maxAge: number; readonly path: string; readonly secure: boolean }) => ({
  httpOnly: true,
  maxAge: input.maxAge,
  path: input.path,
  sameSite: "lax" as const,
  secure: input.secure
})

/**
 * Cookie options for a response to this request. `Secure` is set unless the request is plain HTTP to a loopback
 * host, so local development works without TLS. Without a known protocol, only the host decides.
 */
export const requestCookieOptions = (input: {
  readonly host: string
  readonly maxAge: number
  readonly path: string
  readonly protocol?: string | undefined
}) => {
  const hostname = parseRequestHost(input.host)?.hostname
  const loopback = hostname !== undefined && isLoopbackHostname(hostname)
  return cookieOptions({ maxAge: input.maxAge, path: input.path, secure: input.protocol === "https:" || !loopback })
}

const requestCookie = (request: NextRequest, path: string, maxAge: number) =>
  requestCookieOptions({ host: request.headers.get("host") ?? "", maxAge, path, protocol: request.nextUrl.protocol })

/** Writes the opaque session reference as the sole host-only session cookie. */
export const setSessionCookie = (
  response: NextResponse,
  request: NextRequest,
  reference: SessionReference,
  maxAgeSeconds: number
): NextResponse => {
  response.cookies.set(SESSION_COOKIE, reference, requestCookie(request, "/", maxAgeSeconds))
  return response
}

/** Expires the correlation cookie. */
export const clearCorrelation = (response: NextResponse, request: NextRequest): NextResponse => {
  response.cookies.set(CORRELATION_COOKIE, "", requestCookie(request, "/auth/callback", 0))
  return response
}
