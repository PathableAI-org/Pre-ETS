import { type NextRequest, NextResponse } from "next/server"

import { completeLogin } from "./lib/oidc/callback.ts"
import { isDocumentNavigation } from "./lib/oidc/document-navigation.ts"
import { extendedForbiddenBody } from "./lib/oidc/forbidden-body.ts"
import { initiateLogin } from "./lib/oidc/initiate.ts"
import { approvedApplicationOrigin, isAuthCallbackPath, sessionCookieForRedirect } from "./lib/oidc/initiation-http.ts"
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
  serializeSessionContext,
  SESSION_CONTEXT_HEADER,
  SESSION_COOKIE_NAME,
  type SessionConfig,
  SessionConfigError,
  type SessionContext,
  TENANT_ORIGIN_HEADER,
  TENANT_SLUG_HEADER
} from "./lib/session/types.ts"
import { createEnvTenantOperations } from "./lib/tenant/operations.ts"

const CACHE_CONTROL = "private, no-store"
const LOGIN_UNAVAILABLE_PATH = "/login-unavailable"

let store: RedisSessionStore | undefined
let oidcStore: RedisOidcTransactionStore | undefined
let operations: ReturnType<typeof createEnvTenantOperations> | undefined

// fallow-ignore-next-line complexity -- request-boundary: callback, setup, short-circuit, initiate
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const requestHeaders = new Headers(request.headers)
  stripReservedHeaders(requestHeaders)

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

  if (isAuthCallbackPath(request.nextUrl.pathname)) {
    if (request.method !== "GET") {
      logOutcome("401-nonget-callback")
      return new NextResponse(null, {
        headers: { "Cache-Control": CACHE_CONTROL },
        status: 401
      })
    }

    return await handleAuthCallback(request, deps, txConfig)
  }

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

  if (result.context.userId !== undefined) {
    logOutcome(result.outcome === "reuse" ? "authenticated-reuse" : "authenticated-create")
    return readyResponse(requestHeaders, result.context, result.origin, result.cookieValue)
  }

  if (!isDocumentNavigation(request)) {
    logOutcome("401-nondoc")
    return new NextResponse(null, {
      headers: { "Cache-Control": CACHE_CONTROL },
      status: 401
    })
  }

  const origin = approvedApplicationOrigin(
    request.headers.get("host") ?? undefined,
    request.nextUrl,
    { tenantOrigin: result.origin }
  )
  if (origin === undefined) {
    logOutcome("login-unavailable")
    return loginUnavailableRedirect(303)
  }

  const setupOutcome = result.outcome
  const cookieValue = result.cookieValue

  let initiation
  try {
    initiation = await initiateLogin(
      {
        nowSeconds: Math.floor(Date.now() / 1000),
        origin,
        sessionId: result.context.sessionId,
        setupOutcome,
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
    logOutcome(setupOutcome === "reuse" ? "reuse" : "redirect")
    const response = NextResponse.redirect(initiation.location, 302)
    response.headers.set("Cache-Control", CACHE_CONTROL)
    attachOidcCookie(response, initiation.expiresAt, initiation.oidcCookieValue)
    const sessionCookie = sessionCookieForRedirect(setupOutcome, cookieValue)
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
  return loginUnavailableRedirect(302)
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

function clearOidcCookie(response: NextResponse): void {
  const attributes = oidcCookieAttributes(0, process.env.NODE_ENV !== "development")
  response.cookies.set(OIDC_COOKIE_NAME, "", {
    expires: new Date(0),
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

// fallow-ignore-next-line complexity -- callback tenant resolve + completeLogin outcome mapping
async function handleAuthCallback(
  request: NextRequest,
  deps: ReturnType<typeof sessionDependencies>,
  txConfig: OidcTxConfig
): Promise<NextResponse> {
  if (!isDocumentNavigation(request)) {
    logOutcome("401-nondoc-callback")
    return new NextResponse(null, {
      headers: { "Cache-Control": CACHE_CONTROL },
      status: 401
    })
  }

  const tenant = await mapTenantResolve(deps.operations, request)
  if (tenant.kind === "unknown") {
    const response = terminalResponse(403, "Access denied.")
    clearOidcCookie(response)
    return response
  }

  if (tenant.kind === "config-error") {
    const response = terminalResponse(500, tenant.message)
    clearOidcCookie(response)
    return response
  }

  let completion
  try {
    completion = await completeLogin(
      {
        nowSeconds: Math.floor(Date.now() / 1000),
        request,
        tenantId: tenant.tenantId,
        tenantRecord: {
          config: tenant.config,
          slug: tenant.tenantId
        }
      },
      {
        sessionStore: deps.store,
        store: deps.oidcStore,
        txConfig
      }
    )
  } catch {
    const response = terminalResponse(500)
    clearOidcCookie(response)
    return response
  }

  if (completion.kind === "redirect") {
    logOutcome("callback-success")
    const response = NextResponse.redirect(completion.location, 303)
    response.headers.set("Cache-Control", CACHE_CONTROL)
    clearOidcCookie(response)
    return response
  }

  if (completion.kind === "config-refusal") {
    logOutcome("403-config-callback")
    const response = extendedForbiddenResponse()
    clearOidcCookie(response)
    return response
  }

  if (completion.kind === "process-config") {
    logOutcome("process-config-callback")
    const response = terminalResponse(500)
    clearOidcCookie(response)
    return response
  }

  logOutcome("login-unavailable-callback")
  const unavailable = loginUnavailableRedirect(303)
  clearOidcCookie(unavailable)
  return unavailable
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

/** Relative Location avoids constructing an absolute URL from an untrusted Host. */
function loginUnavailableRedirect(status: 302 | 303): NextResponse {
  return new NextResponse(null, {
    headers: {
      "Cache-Control": CACHE_CONTROL,
      Location: LOGIN_UNAVAILABLE_PATH
    },
    status
  })
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

function passthroughWithTenantHeaders(
  requestHeaders: Headers,
  context: SessionContext,
  origin: "host-associated" | "local-static"
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
  return response
}

function readyResponse(
  requestHeaders: Headers,
  context: SessionContext,
  origin: "host-associated" | "local-static",
  cookieValue: string | undefined
): NextResponse {
  const response = passthroughWithTenantHeaders(requestHeaders, context, origin)
  if (cookieValue !== undefined) {
    attachSessionCookie(response, context.expiresAt, cookieValue)
  }
  return response
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
