import { type NextRequest, NextResponse } from "next/server"

import { signSessionCookie, verifySessionCookie } from "./lib/session/cookie.ts"
import { setupSession, toTenantResolveResult } from "./lib/session/setup.ts"
import { RedisSessionStore } from "./lib/session/store.ts"
import {
  cookieAttributes,
  getSessionConfig,
  serializeSessionContext,
  SESSION_CONTEXT_HEADER,
  SESSION_COOKIE_NAME,
  SessionConfigError,
  type SessionContext,
  TENANT_ORIGIN_HEADER,
  TENANT_SLUG_HEADER
} from "./lib/session/types.ts"
import { createEnvTenantOperations } from "./lib/tenant/operations.ts"

const CACHE_CONTROL = "private, no-store"

let store: RedisSessionStore | undefined

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const requestHeaders = new Headers(request.headers)
  stripReservedHeaders(requestHeaders)

  const config = loadProxyConfig()
  if (config === undefined) {
    return terminalResponse(500)
  }

  store ??= new RedisSessionStore(config)
  const operations = createEnvTenantOperations()
  const result = await setupSession(request, {
    config,
    resolveTenant: async () => await mapTenantResolve(operations, request),
    signCookie: signSessionCookie,
    store,
    verifyCookie: verifySessionCookie
  })

  if (result.kind === "terminal") {
    return terminalResponse(result.status, result.message)
  }

  return readyResponse(requestHeaders, result.context, result.origin, result.cookieValue)
}

export const config = {
  matcher: "/"
}

function attachSessionCookie(
  response: NextResponse,
  expiresAt: number,
  cookieValue: string
): void {
  const attributes = cookieAttributes(expiresAt, process.env.NODE_ENV !== "development")
  response.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
    expires: attributes.expires,
    httpOnly: attributes.httpOnly,
    path: attributes.path,
    sameSite: attributes.sameSite,
    secure: attributes.secure
  })
}

function loadProxyConfig() {
  try {
    return getSessionConfig()
  } catch (error) {
    if (error instanceof SessionConfigError) {
      return undefined
    }

    throw error
  }
}

async function mapTenantResolve(
  operations: ReturnType<typeof createEnvTenantOperations>,
  request: NextRequest
) {
  return toTenantResolveResult(
    await operations.resolve({
      host: request.headers.get("host") ?? undefined
    })
  )
}

function readyResponse(
  requestHeaders: Headers,
  context: SessionContext,
  origin: "host-associated" | "local-static",
  cookieValue: string | undefined
): NextResponse {
  requestHeaders.set(SESSION_CONTEXT_HEADER, serializeSessionContext(context))
  requestHeaders.set(TENANT_SLUG_HEADER, context.tenantId)
  requestHeaders.set(TENANT_ORIGIN_HEADER, origin)

  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  })
  response.headers.set("Cache-Control", CACHE_CONTROL)
  if (cookieValue !== undefined) {
    attachSessionCookie(response, context.expiresAt, cookieValue)
  }

  return response
}

function stripReservedHeaders(headers: Headers): void {
  headers.delete(SESSION_CONTEXT_HEADER)
  for (const name of [...headers.keys()]) {
    if (name.toLowerCase().startsWith("x-preets-tenant-")) {
      headers.delete(name)
    }
  }
}

function terminalResponse(status: 403 | 500 | 503, message?: string): NextResponse {
  const body = message
    ?? (status === 403
      ? "Access denied."
      : status === 503
      ? "Service unavailable."
      : "Internal Server Error")

  return new NextResponse(body, {
    headers: {
      "Cache-Control": CACHE_CONTROL,
      "Content-Type": "text/plain; charset=utf-8"
    },
    status
  })
}
