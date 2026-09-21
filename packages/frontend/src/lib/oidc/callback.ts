import * as client from "openid-client"

import type { SessionStore } from "../session/store.ts"
import type { TenantConfig, TenantRecord } from "../tenant/types.ts"
import type { OidcSecretResolution } from "./secrets.ts"
import type { OidcTransactionStore } from "./transaction.ts"

import { readSingleNamedCookie } from "../http/cookie-header.ts"
import { computeIdleExpiresAt } from "../session/idle.ts"
import { SessionStoreError } from "../session/store.ts"
import { effectiveIdleTimeoutMinutes } from "../tenant/types.ts"
import { verifyOidcCorrelationCookie } from "./cookie.ts"
import { approvedApplicationOrigin } from "./initiation-http.ts"
import { resolveClientAndDiscover, type ResolveClientAndDiscoverDeps } from "./resolve-client.ts"
import { getOidcTxConfig, OIDC_COOKIE_NAME, type OidcTransactionRecord, type OidcTxConfig } from "./types.ts"

export interface CompleteLoginDeps {
  readonly authorizationCodeGrant?: typeof client.authorizationCodeGrant
  readonly discover?: ResolveClientAndDiscoverDeps["discover"]
  readonly readOidcCookie?: (request: Request) => string | undefined
  readonly resolveSecret?: (
    slug: string,
    clientAuth: TenantConfig["oidc"]["clientAuth"]
  ) => OidcSecretResolution
  readonly sessionStore: SessionStore
  readonly store: OidcTransactionStore
  readonly txConfig?: OidcTxConfig
  readonly verifyCookie?: typeof verifyOidcCorrelationCookie
}

export interface CompleteLoginInput {
  readonly nowSeconds: number
  readonly request: Request
  readonly tenantId: string
  readonly tenantRecord: TenantRecord
}

export type CompleteLoginOutcome =
  | {
    readonly kind: "config-refusal"
    readonly outcomeClass: "403-config"
  }
  | {
    readonly kind: "login-unavailable"
    readonly outcomeClass: "login-unavailable"
  }
  | {
    readonly kind: "process-config"
    readonly outcomeClass: "process-config"
  }
  | {
    readonly kind: "redirect"
    readonly location: string
    readonly outcomeClass: "callback-success"
  }

export async function completeLogin(
  input: CompleteLoginInput,
  deps: CompleteLoginDeps
): Promise<CompleteLoginOutcome> {
  if (input.tenantRecord.slug !== input.tenantId) {
    return { kind: "config-refusal", outcomeClass: "403-config" }
  }

  const query = parseCallbackQuery(input.request)
  if (query.kind !== "ok") {
    return query
  }

  const correlated = await verifyCallbackCorrelation(input, deps, query.state)
  if (correlated.kind !== "ok") {
    return correlated
  }

  const matched = await consumeAndMatchTransaction(input, deps, correlated, query.callbackUrl)
  if (matched.kind !== "ok") {
    return matched
  }

  return await exchangeCodeAndAuthenticate({
    callbackUrl: query.callbackUrl,
    deps,
    input,
    state: query.state,
    tx: matched.tx
  })
}

export function extractDisplayName(claims: {
  readonly name?: unknown
  readonly preferred_username?: unknown
  readonly sub?: unknown
}): string | undefined {
  if (typeof claims.name === "string" && claims.name.trim() !== "") {
    return claims.name
  }

  if (typeof claims.preferred_username === "string" && claims.preferred_username.trim() !== "") {
    return claims.preferred_username
  }

  if (typeof claims.sub === "string" && claims.sub.trim() !== "") {
    return claims.sub
  }

  return undefined
}

async function consumeAndMatchTransaction(
  input: CompleteLoginInput,
  deps: CompleteLoginDeps,
  correlated: {
    readonly cookieTenant: string
    readonly state: string
  },
  callbackUrl: URL
): Promise<CompleteLoginOutcome | { readonly kind: "ok"; readonly tx: OidcTransactionRecord }> {
  const consumed = await deps.store.consume(correlated.state)
  if (consumed.kind === "unavailable" || consumed.kind === "missing") {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  const matched = matchConsumedTransaction(input, correlated.cookieTenant, consumed.record)
  if (matched.kind !== "ok") {
    return matched
  }

  return matchCallbackRedirectUri(input.request, callbackUrl, matched.tx)
}

function defaultReadOidcCookie(request: Request): string | undefined {
  return readSingleNamedCookie(request, OIDC_COOKIE_NAME)
}

async function exchangeCodeAndAuthenticate(input: {
  readonly callbackUrl: URL
  readonly deps: CompleteLoginDeps
  readonly input: CompleteLoginInput
  readonly state: string
  readonly tx: OidcTransactionRecord
}): Promise<CompleteLoginOutcome> {
  const oidc = input.input.tenantRecord.config.oidc
  const resolved = await resolveClientAndDiscover(
    {
      clientAuth: oidc.clientAuth,
      clientId: oidc.clientId,
      issuer: oidc.issuer,
      tenantId: input.input.tenantId
    },
    resolveDiscoverDeps(input.deps)
  )
  if (resolved.kind !== "ok") {
    return mapResolveFailure(resolved.kind)
  }

  const grantUrl = new URL(input.tx.redirectUri)
  grantUrl.search = input.callbackUrl.search
  const grantRequest = new Request(grantUrl, {
    headers: input.input.request.headers,
    method: "GET"
  })

  const authorizationCodeGrant = input.deps.authorizationCodeGrant ?? client.authorizationCodeGrant
  let tokens: Awaited<ReturnType<typeof client.authorizationCodeGrant>>
  try {
    tokens = await authorizationCodeGrant(resolved.discovered.configuration, grantRequest, {
      expectedNonce: input.tx.nonce,
      expectedState: input.state,
      pkceCodeVerifier: input.tx.codeVerifier
    })
  } catch {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  const claims = tokens.claims()
  if (claims === undefined) {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  const userId = extractSubject(claims)
  const userName = extractDisplayName(claims)
  if (userId === undefined || userName === undefined) {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  const authenticated = await writeAuthenticatedSession({
    nowSeconds: input.input.nowSeconds,
    sessionStore: input.deps.sessionStore,
    tenantConfig: input.input.tenantRecord.config,
    tenantId: input.input.tenantId,
    tx: input.tx,
    userId,
    userName
  })
  if (!authenticated) {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  return {
    kind: "redirect",
    location: `${new URL(input.tx.redirectUri).origin}/`,
    outcomeClass: "callback-success"
  }
}

function extractSubject(claims: { readonly sub?: unknown }): string | undefined {
  if (typeof claims.sub !== "string" || claims.sub.trim() === "") {
    return undefined
  }

  return claims.sub
}

function mapResolveFailure(
  kind: "config-refusal" | "login-unavailable" | "process-config"
): CompleteLoginOutcome {
  if (kind === "config-refusal") {
    return { kind: "config-refusal", outcomeClass: "403-config" }
  }

  if (kind === "process-config") {
    return { kind: "process-config", outcomeClass: "process-config" }
  }

  return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
}

function matchCallbackRedirectUri(
  request: Request,
  callbackUrl: URL,
  tx: OidcTransactionRecord
): CompleteLoginOutcome | { readonly kind: "ok"; readonly tx: OidcTransactionRecord } {
  const origin = approvedApplicationOrigin(
    request.headers.get("host") ?? undefined,
    callbackUrl
  )
  if (origin === undefined) {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  const currentCallbackUri = `${origin}/auth/callback`
  if (currentCallbackUri !== tx.redirectUri) {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  return { kind: "ok", tx }
}

function matchConsumedTransaction(
  input: CompleteLoginInput,
  cookieTenant: string,
  tx: OidcTransactionRecord
): CompleteLoginOutcome | { readonly kind: "ok"; readonly tx: OidcTransactionRecord } {
  if (tx.tenantId !== input.tenantId || cookieTenant !== tx.tenantId) {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  if (tx.expiresAt <= input.nowSeconds) {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  const oidc = input.tenantRecord.config.oidc
  if (tx.issuer !== oidc.issuer || tx.clientId !== oidc.clientId) {
    return { kind: "config-refusal", outcomeClass: "403-config" }
  }

  if ((oidc.connection ?? undefined) !== (tx.connection ?? undefined)) {
    return { kind: "config-refusal", outcomeClass: "403-config" }
  }

  return { kind: "ok", tx }
}

function parseCallbackQuery(
  request: Request
): CompleteLoginOutcome | {
  readonly callbackUrl: URL
  readonly kind: "ok"
  readonly state: string
} {
  const callbackUrl = new URL(request.url)
  const errorParam = callbackUrl.searchParams.get("error")
  if (errorParam !== null && errorParam !== "") {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  const code = callbackUrl.searchParams.get("code")
  const state = callbackUrl.searchParams.get("state")
  if (code === null || code.trim() === "" || state === null || state.trim() === "") {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  return { callbackUrl, kind: "ok", state }
}

function resolveDiscoverDeps(deps: CompleteLoginDeps): ResolveClientAndDiscoverDeps {
  return {
    ...(deps.discover === undefined ? {} : { discover: deps.discover }),
    ...(deps.resolveSecret === undefined ? {} : { resolveSecret: deps.resolveSecret })
  }
}

async function verifyCallbackCorrelation(
  input: CompleteLoginInput,
  deps: CompleteLoginDeps,
  state: string
): Promise<
  | CompleteLoginOutcome
  | {
    readonly cookieTenant: string
    readonly kind: "ok"
    readonly state: string
  }
> {
  const txConfig = deps.txConfig ?? getOidcTxConfig()
  const readOidcCookie = deps.readOidcCookie ?? defaultReadOidcCookie
  const verifyCookie = deps.verifyCookie ?? verifyOidcCorrelationCookie
  const rawCookie = readOidcCookie(input.request)
  if (rawCookie === undefined) {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  const cookieClaims = await verifyCookie(rawCookie, txConfig, input.nowSeconds)
  if (cookieClaims === undefined) {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  if (cookieClaims.state !== state || cookieClaims.tenant !== input.tenantId) {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  return {
    cookieTenant: cookieClaims.tenant,
    kind: "ok",
    state
  }
}

async function writeAuthenticatedSession(input: {
  readonly nowSeconds: number
  readonly sessionStore: SessionStore
  readonly tenantConfig: TenantConfig
  readonly tenantId: string
  readonly tx: OidcTransactionRecord
  readonly userId: string
  readonly userName: string
}): Promise<boolean> {
  try {
    const existing = await input.sessionStore.read(input.tx.sessionId)
    if (existing.kind !== "record") {
      return false
    }

    if (
      existing.record.tenantId !== input.tenantId
      || existing.record.tenantId !== input.tx.tenantId
      || existing.record.expiresAt <= input.nowSeconds
    ) {
      return false
    }

    // Phase B: stamp idle fields at authentication on this sid only.
    // Do not extend absolute expiresAt; policy is fixed for the session lifetime.
    const idleDurationMinutes = effectiveIdleTimeoutMinutes(input.tenantConfig)
    const updated = await input.sessionStore.update(input.tx.sessionId, {
      expiresAt: existing.record.expiresAt,
      idleDurationMinutes,
      idleExpiresAt: computeIdleExpiresAt(input.nowSeconds, idleDurationMinutes),
      lastActivityAt: input.nowSeconds,
      tenantId: existing.record.tenantId,
      userId: input.userId,
      userName: input.userName
    })
    return updated.kind === "updated"
  } catch (error) {
    if (error instanceof SessionStoreError) {
      return false
    }

    throw error
  }
}
