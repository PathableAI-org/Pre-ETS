import { type NextRequest, NextResponse } from "next/server"

import { isDocumentNavigation } from "./lib/oidc/document-navigation.ts"
import { extendedForbiddenBody } from "./lib/oidc/forbidden-body.ts"
import { initiateLogin } from "./lib/oidc/initiate.ts"
import { isAuthCallbackPath, sessionCookieForRedirect } from "./lib/oidc/initiation-http.ts"
import { RedisOidcTransactionStore } from "./lib/oidc/transaction.ts"
import {
  getOidcTxConfig,
  OIDC_COOKIE_NAME,
  oidcCookieAttributes,
  type OidcTxConfig,
  OidcTxConfigError
} from "./lib/oidc/types.ts"
import { signSessionCookie, verifySessionCookie } from "./lib/session/cookie.ts"
import { setupSession, toTenantResolveResult } from "./lib/session/setup.ts"
import { RedisSessionStore } from "./lib/session/store.ts"
import {
  cookieAttributes,
  getSessionConfig,
  SESSION_CONTEXT_HEADER,
  SESSION_COOKIE_NAME,
  type SessionConfig,
  SessionConfigError
} from "./lib/session/types.ts"
import { createEnvTenantOperations } from "./lib/tenant/operations.ts"

const CACHE_CONTROL = "private, no-store"
const LOGIN_UNAVAILABLE_PATH = "/login-unavailable"

let store: RedisSessionStore | undefined
let oidcStore: RedisOidcTransactionStore | undefined
let operations: ReturnType<typeof createEnvTenantOperations> | undefined

// fallow-ignore-next-line complexity -- request-boundary: callback exclude, setup, initiate
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const requestHeaders = new Headers(request.headers)
  stripReservedHeaders(requestHeaders)

  if (isAuthCallbackPath(request.nextUrl.pathname)) {
    const response = NextResponse.next({
      request: {
        headers: requestHeaders
      }
    })
    response.headers.set("Cache-Control", CACHE_CONTROL)
    return response
  }

  const config = loadProxyConfig()
  if (config === undefined) {
    return terminalResponse(500)
  }

  let txConfig: OidcTxConfig
  try {
    txConfig = getOidcTxConfig()
  } catch (error) {
    if (error instanceof OidcTxConfigError) {
      return terminalResponse(500)
    }

    throw error
  }

  const deps = sessionDependencies(config, txConfig)
  const result = await setupSession(request, {
    config,
    resolveTenant: async () => await mapTenantResolve(deps.operations, request),
    signCookie: signSessionCookie,
    store: deps.store,
    verifyCookie: verifySessionCookie
  })

  if (result.kind === "terminal") {
    return terminalResponse(result.status, result.message)
  }

  if (!isDocumentNavigation(request)) {
    logOutcome("401-nondoc")
    return new NextResponse(null, {
      headers: { "Cache-Control": CACHE_CONTROL },
      status: 401
    })
  }

  let initiation
  try {
    initiation = await initiateLogin(
      {
        nowSeconds: Math.floor(Date.now() / 1000),
        origin: request.nextUrl.origin,
        sessionId: result.context.sessionId,
        setupOutcome: result.outcome,
        tenantId: result.context.tenantId,
        tenantRecord: {
          config: result.config,
          slug: result.context.tenantId
        }
      },
      {
        store: deps.oidcStore,
        txConfig
      }
    )
  } catch {
    return terminalResponse(500)
  }

  if (initiation.kind === "redirect") {
    logOutcome(result.outcome === "reuse" ? "reuse" : "redirect")
    const response = NextResponse.redirect(initiation.location, 302)
    response.headers.set("Cache-Control", CACHE_CONTROL)
    attachOidcCookie(response, initiation.expiresAt, initiation.oidcCookieValue)
    const sessionCookie = sessionCookieForRedirect(result.outcome, result.cookieValue)
    if (sessionCookie !== undefined) {
      attachSessionCookie(response, result.context.expiresAt, sessionCookie)
    }

    return response
  }

  if (initiation.kind === "config-refusal") {
    logOutcome("403-config")
    return extendedForbiddenResponse()
  }

  if (initiation.kind === "process-config") {
    logOutcome("process-config")
    return terminalResponse(500)
  }

  logOutcome("login-unavailable")
  const unavailable = NextResponse.redirect(
    new URL(LOGIN_UNAVAILABLE_PATH, request.nextUrl.origin),
    302
  )
  unavailable.headers.set("Cache-Control", CACHE_CONTROL)
  return unavailable
}

export const config = {
  matcher: ["/", "/auth/callback"]
}

function attachOidcCookie(
  response: NextResponse,
  expiresAt: number,
  cookieValue: string
): void {
  const attributes = oidcCookieAttributes(expiresAt, process.env.NODE_ENV !== "development")
  response.cookies.set(OIDC_COOKIE_NAME, cookieValue, {
    expires: attributes.expires,
    httpOnly: attributes.httpOnly,
    path: attributes.path,
    sameSite: attributes.sameSite,
    secure: attributes.secure
  })
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

function extendedForbiddenResponse(): NextResponse {
  return new NextResponse(extendedForbiddenBody(), {
    headers: {
      "Cache-Control": CACHE_CONTROL,
      "Content-Type": "text/html; charset=utf-8"
    },
    status: 403
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

function logOutcome(outcomeClass: string): void {
  try {
    console.error(JSON.stringify({ outcomeClass }))
  } catch {
    // Diagnostics must never change the response.
  }
}

async function mapTenantResolve(
  ops: ReturnType<typeof createEnvTenantOperations>,
  request: NextRequest
) {
  return toTenantResolveResult(
    await ops.resolve({
      host: request.headers.get("host") ?? undefined
    })
  )
}

function sessionDependencies(config: SessionConfig, txConfig: OidcTxConfig) {
  store ??= new RedisSessionStore(config)
  oidcStore ??= new RedisOidcTransactionStore({
    keyPrefix: txConfig.keyPrefix,
    redisUrl: config.redisUrl,
    storeTimeoutMs: txConfig.storeTimeoutMs
  })
  operations ??= createEnvTenantOperations()
  return { oidcStore, operations, store }
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
