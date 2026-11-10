import type { NextRequest, NextResponse } from "next/server"

import type { SessionReference } from "../session.js"

import { isLoopbackHostname, parseRequestHost } from "../request-host.js"
import { SESSION_COOKIE } from "./session.js"

export const CORRELATION_COOKIE = "oidc-correlation"

/** Host-only, HttpOnly, SameSite=Lax: the attributes every application cookie shares. */
export const cookieOptions = (input: { readonly maxAge: number; readonly path: string; readonly secure: boolean }) => ({
  ...browserSessionCookieOptions(input),
  maxAge: input.maxAge
})

/** The shared attributes without `Max-Age`: the cookie lasts for the browser session. */
const browserSessionCookieOptions = (input: { readonly path: string; readonly secure: boolean }) => ({
  httpOnly: true,
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

/**
 * Writes the opaque session reference as the sole host-only session cookie, without `Max-Age` (research D15). Only
 * establishment calls this: a later response could be delayed past another tab's login and overwrite its cookie. The
 * server record's TTL is the idle authority; a cookie outliving its record names nothing.
 */
export const setSessionCookie = (
  response: NextResponse,
  request: NextRequest,
  reference: SessionReference
): NextResponse => {
  const secure = requestCookieOptions({
    host: request.headers.get("host") ?? "",
    maxAge: 0,
    path: "/",
    protocol: request.nextUrl.protocol
  }).secure
  response.cookies.set(SESSION_COOKIE, reference, browserSessionCookieOptions({ path: "/", secure }))
  return response
}

/** Expires the correlation cookie. */
export const clearCorrelation = (response: NextResponse, request: NextRequest): NextResponse => {
  response.cookies.set(CORRELATION_COOKIE, "", requestCookie(request, "/auth/callback", 0))
  return response
}
