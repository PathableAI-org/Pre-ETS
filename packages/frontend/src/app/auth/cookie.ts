import type { NextRequest, NextResponse } from "next/server"

export const CORRELATION_COOKIE = "oidc-correlation"
const SESSION_COOKIE = "pathable-session"

export const isLoopbackHost = (host: string): boolean => {
  const hostname = host.replace(/^\[|\](?::\d+)?$|:\d+$/g, "")
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname)
}

/** Writes the opaque session reference as the sole host-only session cookie. */
export const setSessionCookie = (
  response: NextResponse,
  request: NextRequest,
  reference: string,
  maxAgeSeconds: number
): NextResponse => {
  response.cookies.set(SESSION_COOKIE, reference, {
    httpOnly: true,
    maxAge: maxAgeSeconds,
    path: "/",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:" || !isLoopbackHost(request.headers.get("host") ?? "")
  })
  return response
}
