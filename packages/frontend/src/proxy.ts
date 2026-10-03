import { type NextRequest, NextResponse } from "next/server"

import {
  generateSessionId,
  serializeSessionContext,
  SESSION_CONTEXT_HEADER,
  type SessionContext,
  TENANT_ORIGIN_HEADER,
  TENANT_SLUG_HEADER
} from "./lib/session/types.ts"

const CACHE_CONTROL = "private, no-store"
const DUMMY_TENANT_ID = "springfield"

/**
 * Temporary dummy Proxy for the tenant/session refactor.
 * Forwards a synthetic anonymous session context so the home page can render
 * without Redis, OIDC, or real tenant resolution.
 */
export function proxy(request: NextRequest): NextResponse {
  const requestHeaders = new Headers(request.headers)
  stripReservedHeaders(requestHeaders)

  const context: SessionContext = {
    expiresAt: Math.floor(Date.now() / 1000) + 86_400,
    sessionId: generateSessionId(),
    tenantId: DUMMY_TENANT_ID
  }

  requestHeaders.set(SESSION_CONTEXT_HEADER, serializeSessionContext(context))
  requestHeaders.set(TENANT_SLUG_HEADER, context.tenantId)
  requestHeaders.set(TENANT_ORIGIN_HEADER, "local-static")

  const response = NextResponse.next({
    request: { headers: requestHeaders }
  })
  response.headers.set("Cache-Control", CACHE_CONTROL)
  return response
}

export const config = {
  matcher: ["/", "/auth/callback"]
}

function stripReservedHeaders(headers: Headers): void {
  headers.delete(SESSION_CONTEXT_HEADER)
  for (const name of [...headers.keys()]) {
    if (name.toLowerCase().startsWith("x-preets-tenant-")) {
      headers.delete(name)
    }
  }
}
