import { type NextRequest, NextResponse } from "next/server"

import type { TenantConfig } from "./lib/tenant/types.ts"

import { completeLogin, type CompleteLoginOutcome } from "./lib/oidc/callback.ts"
import { isDocumentNavigation } from "./lib/oidc/document-navigation.ts"
import { extendedForbiddenBody } from "./lib/oidc/forbidden-body.ts"
import { initiateLogin, type InitiateLoginOutcome } from "./lib/oidc/initiate.ts"
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
  sessionContextFromRecord,
  TENANT_ORIGIN_HEADER,
  TENANT_SLUG_HEADER
} from "./lib/session/types.ts"
import { createEnvTenantOperations } from "./lib/tenant/operations.ts"

const CACHE_CONTROL = "private, no-store"
const LOGIN_UNAVAILABLE_PATH = "/login-unavailable"

let store: RedisSessionStore | undefined
let oidcStore: RedisOidcTransactionStore | undefined
let operations: ReturnType<typeof createEnvTenantOperations> | undefined

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const requestHeaders = new Headers(request.headers)
  stripReservedHeaders(requestHeaders)

  const loaded = loadProxyRuntime()
  if (loaded.kind === "terminal") {
    return loaded.response
  }

  if (isAuthCallbackPath(request.nextUrl.pathname)) {
    return await routeAuthCallback(request, loaded.deps, loaded.txConfig)
  }

  return await handleSessionRequest(request, requestHeaders, loaded.deps, loaded.txConfig)
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

function forwardWithoutSessionRewrite(requestHeaders: Headers): NextResponse {
  const response = NextResponse.next({
    request: { headers: requestHeaders }
  })
  response.headers.set("Cache-Control", CACHE_CONTROL)
  return response
}

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

  let completion: CompleteLoginOutcome
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

  return mapCompleteLoginOutcome(completion)
}

async function handleSessionRequest(
  request: NextRequest,
  requestHeaders: Headers,
  deps: ReturnType<typeof sessionDependencies>,
  txConfig: OidcTxConfig
): Promise<NextResponse> {
  // Idle confirm / activity / login-again Server Actions POST to `/` (matcher).
  // Pass the presented cookie through without minting a fresh anonymous sid or
  // starting OIDC — otherwise idle-elapsed setup clears auth and 401s the action.
  if (request.headers.has("next-action")) {
    return await passThroughServerActionSession(request, requestHeaders, deps)
  }

  const result = await setupSession(request, {
    config: deps.sessionConfig,
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

  return await initiateForUnauthenticated(request, deps, txConfig, result)
}

function handleUnauthenticatedNavigation(request: NextRequest): NextResponse | undefined {
  if (!isDocumentNavigation(request)) {
    logOutcome("401-nondoc")
    return new NextResponse(null, {
      headers: { "Cache-Control": CACHE_CONTROL },
      status: 401
    })
  }

  return undefined
}

async function initiateForUnauthenticated(
  request: NextRequest,
  deps: ReturnType<typeof sessionDependencies>,
  txConfig: OidcTxConfig,
  result: {
    readonly config: TenantConfig
    readonly context: SessionContext
    readonly cookieValue?: string
    readonly origin: "host-associated" | "local-static"
    readonly outcome: "create" | "reuse"
  }
): Promise<NextResponse> {
  const unauthenticated = handleUnauthenticatedNavigation(request)
  if (unauthenticated !== undefined) {
    return unauthenticated
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

  let initiation: InitiateLoginOutcome
  try {
    initiation = await initiateLogin(
      {
        nowSeconds: Math.floor(Date.now() / 1000),
        origin,
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

  return mapInitiateLoginOutcome(initiation, {
    sessionCookieValue: result.cookieValue,
    sessionExpiresAt: result.context.expiresAt,
    setupOutcome: result.outcome
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

function loadProxyRuntime():
  | {
    readonly deps: ReturnType<typeof sessionDependencies>
    readonly kind: "ready"
    readonly txConfig: OidcTxConfig
  }
  | {
    readonly kind: "terminal"
    readonly response: NextResponse
  }
{
  const config = loadProxyConfig()
  if (config === undefined) {
    return { kind: "terminal", response: terminalResponse(500) }
  }

  let txConfig: OidcTxConfig
  try {
    txConfig = getOidcTxConfig()
  } catch (error) {
    if (error instanceof OidcTxConfigError) {
      return { kind: "terminal", response: terminalResponse(500) }
    }

    throw error
  }

  return {
    deps: sessionDependencies(config, txConfig),
    kind: "ready",
    txConfig
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

function mapCompleteLoginOutcome(completion: CompleteLoginOutcome): NextResponse {
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

function mapInitiateLoginOutcome(
  initiation: InitiateLoginOutcome,
  session: {
    readonly sessionCookieValue: string | undefined
    readonly sessionExpiresAt: number
    readonly setupOutcome: "create" | "reuse"
  }
): NextResponse {
  if (initiation.kind === "redirect") {
    logOutcome(session.setupOutcome === "reuse" ? "reuse" : "redirect")
    const response = NextResponse.redirect(initiation.location, 302)
    response.headers.set("Cache-Control", CACHE_CONTROL)
    attachOidcCookie(response, initiation.expiresAt, initiation.oidcCookieValue)
    const sessionCookie = sessionCookieForRedirect(session.setupOutcome, session.sessionCookieValue)
    if (sessionCookie !== undefined) {
      attachSessionCookie(response, session.sessionExpiresAt, sessionCookie)
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

/**
 * Resolve tenant + optional cookie session for App Router Server Actions.
 * Does not create sessions, clear idle, or initiate OIDC.
 */
async function passThroughServerActionSession(
  request: NextRequest,
  requestHeaders: Headers,
  deps: ReturnType<typeof sessionDependencies>
): Promise<NextResponse> {
  const tenant = await mapTenantResolve(deps.operations, request)
  if (tenant.kind !== "ok") {
    logOutcome("action-tenant-unavailable")
    return terminalResponse(tenant.kind === "config-error" ? 500 : 403)
  }

  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (cookieValue === undefined || cookieValue === "") {
    logOutcome("action-anonymous-no-cookie")
    return forwardWithoutSessionRewrite(requestHeaders)
  }

  const claims = await verifySessionCookie(
    cookieValue,
    deps.sessionConfig,
    Math.floor(Date.now() / 1000)
  )
  if (claims?.tenant !== tenant.tenantId) {
    logOutcome("action-invalid-cookie")
    return forwardWithoutSessionRewrite(requestHeaders)
  }

  const context = await sessionContextForActionCookie(deps.store, claims)
  logOutcome(
    context.userId === undefined ? "action-pass-anonymous" : "action-pass-authenticated"
  )
  // Never attach a replacement Set-Cookie — keep the request cookie for the action.
  return readyResponse(requestHeaders, context, tenant.origin, undefined)
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

async function routeAuthCallback(
  request: NextRequest,
  deps: ReturnType<typeof sessionDependencies>,
  txConfig: OidcTxConfig
): Promise<NextResponse> {
  if (request.method !== "GET") {
    logOutcome("401-nonget-callback")
    return new NextResponse(null, {
      headers: { "Cache-Control": CACHE_CONTROL },
      status: 401
    })
  }

  return await handleAuthCallback(request, deps, txConfig)
}

async function sessionContextForActionCookie(
  store: RedisSessionStore,
  claims: { readonly exp: number; readonly sid: string; readonly tenant: string }
): Promise<SessionContext> {
  const read = await store.read(claims.sid)
  if (read.kind === "record") {
    return sessionContextFromRecord(claims.sid, read.record)
  }
  return {
    expiresAt: claims.exp,
    sessionId: claims.sid,
    tenantId: claims.tenant
  }
}

function sessionDependencies(config: SessionConfig, txConfig: OidcTxConfig) {
  store ??= new RedisSessionStore(config)
  oidcStore ??= new RedisOidcTransactionStore({
    keyPrefix: txConfig.keyPrefix,
    redisUrl: config.redisUrl,
    storeTimeoutMs: txConfig.storeTimeoutMs
  })
  operations ??= createEnvTenantOperations()
  return { oidcStore, operations, sessionConfig: config, store }
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
