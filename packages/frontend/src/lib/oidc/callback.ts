import * as client from "openid-client"

import type { SessionStore } from "../session/store.ts"
import type { TenantConfig, TenantRecord } from "../tenant/types.ts"
import type { OidcTransactionStore } from "./transaction.ts"

import { SessionStoreError } from "../session/store.ts"
import { verifyOidcCorrelationCookie } from "./cookie.ts"
import { discoverOidcIssuer } from "./discovery.ts"
import { approvedApplicationOrigin } from "./initiation-http.ts"
import { type OidcSecretResolution, OidcSecretsConfigError, resolveOidcClientSecret } from "./secrets.ts"
import { getOidcTxConfig, OIDC_COOKIE_NAME, type OidcTransactionRecord, type OidcTxConfig } from "./types.ts"

export interface CompleteLoginDeps {
  readonly authorizationCodeGrant?: typeof client.authorizationCodeGrant
  readonly discover?: typeof discoverOidcIssuer
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

// fallow-ignore-next-line complexity -- ordered callback steps with typed fail-closed outcomes
export async function completeLogin(
  input: CompleteLoginInput,
  deps: CompleteLoginDeps
): Promise<CompleteLoginOutcome> {
  if (input.tenantRecord.slug !== input.tenantId) {
    return { kind: "config-refusal", outcomeClass: "403-config" }
  }

  const callbackUrl = new URL(input.request.url)
  const errorParam = callbackUrl.searchParams.get("error")
  if (errorParam !== null && errorParam !== "") {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  const code = callbackUrl.searchParams.get("code")
  const state = callbackUrl.searchParams.get("state")
  if (code === null || code.trim() === "" || state === null || state.trim() === "") {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

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

  const consumed = await deps.store.consume(state)
  if (consumed.kind === "unavailable") {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  if (consumed.kind === "missing") {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  const tx = consumed.record
  if (tx.tenantId !== input.tenantId || cookieClaims.tenant !== tx.tenantId) {
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

  const origin = approvedApplicationOrigin(
    input.request.headers.get("host") ?? undefined,
    callbackUrl
  )
  if (origin === undefined) {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  const currentCallbackUri = `${origin}/auth/callback`
  if (currentCallbackUri !== tx.redirectUri) {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  // fallow-ignore-next-line code-duplication -- secret resolve + discover mirrors initiateLogin
  let secretResolution: OidcSecretResolution
  try {
    secretResolution = (deps.resolveSecret ?? resolveOidcClientSecret)(
      input.tenantId,
      oidc.clientAuth
    )
  } catch (error) {
    if (error instanceof OidcSecretsConfigError) {
      return { kind: "process-config", outcomeClass: "process-config" }
    }

    throw error
  }

  if (secretResolution.kind === "config-refusal") {
    return { kind: "config-refusal", outcomeClass: "403-config" }
  }

  const clientSecret = secretResolution.kind === "secret" ? secretResolution.secret : undefined

  let discovered: Awaited<ReturnType<typeof discoverOidcIssuer>>
  try {
    const discover = deps.discover ?? discoverOidcIssuer
    discovered = clientSecret === undefined
      ? await discover(oidc.issuer, oidc.clientId)
      : await discover(oidc.issuer, oidc.clientId, { clientSecret })
  } catch {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  const grantUrl = new URL(tx.redirectUri)
  grantUrl.search = callbackUrl.search
  const grantRequest = new Request(grantUrl, {
    headers: input.request.headers,
    method: "GET"
  })

  const authorizationCodeGrant = deps.authorizationCodeGrant ?? client.authorizationCodeGrant
  let tokens: Awaited<ReturnType<typeof client.authorizationCodeGrant>>
  try {
    tokens = await authorizationCodeGrant(discovered.configuration, grantRequest, {
      expectedNonce: tx.nonce,
      expectedState: state,
      pkceCodeVerifier: tx.codeVerifier
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
    nowSeconds: input.nowSeconds,
    sessionStore: deps.sessionStore,
    tenantId: input.tenantId,
    tx,
    userId,
    userName
  })
  if (!authenticated) {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  return {
    kind: "redirect",
    location: `${new URL(tx.redirectUri).origin}/`,
    outcomeClass: "callback-success"
  }
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

// fallow-ignore-next-line code-duplication -- cookie scan mirrors session cookie reader
function defaultReadOidcCookie(request: Request): string | undefined {
  const header = request.headers.get("cookie")
  if (header === null || header === "") {
    return undefined
  }

  const parts = header.split(";")
  let found: string | undefined
  for (const part of parts) {
    const trimmed = part.trim()
    const separator = trimmed.indexOf("=")
    if (separator <= 0) {
      continue
    }

    const name = trimmed.slice(0, separator)
    if (name !== OIDC_COOKIE_NAME) {
      continue
    }

    if (found !== undefined) {
      return undefined
    }

    found = trimmed.slice(separator + 1)
  }

  return found
}

function extractSubject(claims: { readonly sub?: unknown }): string | undefined {
  if (typeof claims.sub !== "string" || claims.sub.trim() === "") {
    return undefined
  }

  return claims.sub
}

async function writeAuthenticatedSession(input: {
  readonly nowSeconds: number
  readonly sessionStore: SessionStore
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

    await input.sessionStore.update(input.tx.sessionId, {
      expiresAt: existing.record.expiresAt,
      tenantId: existing.record.tenantId,
      userId: input.userId,
      userName: input.userName
    })
    return true
  } catch (error) {
    if (error instanceof SessionStoreError) {
      return false
    }

    throw error
  }
}
