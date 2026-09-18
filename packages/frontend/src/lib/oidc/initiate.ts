import * as client from "openid-client"

import type { TenantConfig, TenantRecord } from "../tenant/types.ts"
import type { DiscoveredOidcClient } from "./discovery.ts"
import type { OidcSecretResolution } from "./secrets.ts"
import type { OidcTransactionStore } from "./transaction.ts"

import { signOidcCorrelationCookie } from "./cookie.ts"
import { resolveClientAndDiscover, type ResolveClientAndDiscoverDeps } from "./resolve-client.ts"
import {
  absoluteOidcExpirySeconds,
  generateOidcState,
  getOidcTxConfig,
  type OidcTransactionRecord,
  type OidcTxConfig
} from "./types.ts"

export interface InitiateLoginDeps {
  readonly buildAuthorizationUrl?: typeof client.buildAuthorizationUrl
  readonly calculatePKCECodeChallenge?: typeof client.calculatePKCECodeChallenge
  readonly discover?: ResolveClientAndDiscoverDeps["discover"]
  readonly randomNonce?: typeof client.randomNonce
  readonly randomPKCECodeVerifier?: typeof client.randomPKCECodeVerifier
  readonly resolveSecret?: (
    slug: string,
    clientAuth: TenantConfig["oidc"]["clientAuth"]
  ) => OidcSecretResolution
  readonly signCookie?: typeof signOidcCorrelationCookie
  readonly store: OidcTransactionStore
  readonly txConfig?: OidcTxConfig
}

export interface InitiateLoginInput {
  readonly nowSeconds: number
  readonly origin: string
  readonly sessionId: string
  readonly setupOutcome: "create" | "reuse"
  readonly tenantId: string
  readonly tenantRecord: TenantRecord
}

export type InitiateLoginOutcome =
  | {
    readonly expiresAt: number
    readonly kind: "redirect"
    readonly location: string
    readonly oidcCookieValue: string
    readonly outcomeClass: "redirect"
  }
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

export async function initiateLogin(
  input: InitiateLoginInput,
  deps: InitiateLoginDeps
): Promise<InitiateLoginOutcome> {
  const oidc = input.tenantRecord.config.oidc
  if (input.tenantRecord.slug !== input.tenantId) {
    return { kind: "config-refusal", outcomeClass: "403-config" }
  }

  const resolved = await resolveClientAndDiscover(
    {
      clientAuth: oidc.clientAuth,
      clientId: oidc.clientId,
      issuer: oidc.issuer,
      tenantId: input.tenantId
    },
    resolveDiscoverDeps(deps)
  )
  if (resolved.kind !== "ok") {
    return mapResolveFailure(resolved.kind)
  }

  const prepared = await prepareTransaction(input, oidc, deps)
  if (prepared.kind !== "ok") {
    return prepared
  }

  return await buildRedirectOutcome({
    buildAuthorizationUrl: deps.buildAuthorizationUrl ?? client.buildAuthorizationUrl,
    clientSecret: resolved.clientSecret,
    codeChallenge: prepared.codeChallenge,
    codeVerifier: prepared.codeVerifier,
    discovered: resolved.discovered,
    expiresAt: prepared.expiresAt,
    nonce: prepared.nonce,
    oidc,
    redirectUri: prepared.redirectUri,
    signCookie: deps.signCookie ?? signOidcCorrelationCookie,
    state: prepared.state,
    tenantId: input.tenantId,
    txConfig: prepared.txConfig
  })
}

function approvedCallbackUri(origin: string): string {
  const base = new URL(origin)
  return `${base.origin}/auth/callback`
}

function buildAuthorizationLocation(input: {
  readonly buildAuthorizationUrl: typeof client.buildAuthorizationUrl
  readonly clientSecret: string | undefined
  readonly codeChallenge: string
  readonly codeVerifier: string
  readonly discovered: DiscoveredOidcClient
  readonly nonce: string
  readonly oidc: TenantConfig["oidc"]
  readonly redirectUri: string
  readonly state: string
}): InitiateLoginOutcome | { readonly kind: "ok"; readonly location: string } {
  const parameters: Record<string, string> = {
    client_id: input.oidc.clientId,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    nonce: input.nonce,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "openid",
    state: input.state
  }

  if (input.oidc.connection !== undefined) {
    parameters.kc_idp_hint = input.oidc.connection
  }

  let location: string
  try {
    location = input.buildAuthorizationUrl(input.discovered.configuration, parameters).toString()
  } catch {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  if (
    location.includes(input.codeVerifier)
    || (input.clientSecret !== undefined && location.includes(input.clientSecret))
  ) {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  return { kind: "ok", location }
}

async function buildRedirectOutcome(input: {
  readonly buildAuthorizationUrl: typeof client.buildAuthorizationUrl
  readonly clientSecret: string | undefined
  readonly codeChallenge: string
  readonly codeVerifier: string
  readonly discovered: DiscoveredOidcClient
  readonly expiresAt: number
  readonly nonce: string
  readonly oidc: TenantConfig["oidc"]
  readonly redirectUri: string
  readonly signCookie: typeof signOidcCorrelationCookie
  readonly state: string
  readonly tenantId: string
  readonly txConfig: OidcTxConfig
}): Promise<InitiateLoginOutcome> {
  const located = buildAuthorizationLocation(input)
  if (located.kind !== "ok") {
    return located
  }

  const oidcCookieValue = await input.signCookie(
    {
      exp: input.expiresAt,
      state: input.state,
      tenant: input.tenantId
    },
    input.txConfig
  )

  return {
    expiresAt: input.expiresAt,
    kind: "redirect",
    location: located.location,
    oidcCookieValue,
    outcomeClass: "redirect"
  }
}

function buildTransactionRecord(input: {
  readonly codeVerifier: string
  readonly expiresAt: number
  readonly nonce: string
  readonly oidc: TenantConfig["oidc"]
  readonly redirectUri: string
  readonly sessionId: string
  readonly tenantId: string
}): OidcTransactionRecord {
  if (input.oidc.connection === undefined) {
    return {
      clientId: input.oidc.clientId,
      codeVerifier: input.codeVerifier,
      expiresAt: input.expiresAt,
      issuer: input.oidc.issuer,
      nonce: input.nonce,
      redirectUri: input.redirectUri,
      sessionId: input.sessionId,
      tenantId: input.tenantId
    }
  }

  return {
    clientId: input.oidc.clientId,
    codeVerifier: input.codeVerifier,
    connection: input.oidc.connection,
    expiresAt: input.expiresAt,
    issuer: input.oidc.issuer,
    nonce: input.nonce,
    redirectUri: input.redirectUri,
    sessionId: input.sessionId,
    tenantId: input.tenantId
  }
}

function mapResolveFailure(
  kind: "config-refusal" | "login-unavailable" | "process-config"
): InitiateLoginOutcome {
  if (kind === "config-refusal") {
    return { kind: "config-refusal", outcomeClass: "403-config" }
  }

  if (kind === "process-config") {
    return { kind: "process-config", outcomeClass: "process-config" }
  }

  return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
}

async function prepareTransaction(
  input: InitiateLoginInput,
  oidc: TenantConfig["oidc"],
  deps: InitiateLoginDeps
): Promise<
  | InitiateLoginOutcome
  | {
    readonly codeChallenge: string
    readonly codeVerifier: string
    readonly expiresAt: number
    readonly kind: "ok"
    readonly nonce: string
    readonly redirectUri: string
    readonly state: string
    readonly txConfig: OidcTxConfig
  }
> {
  const txConfig = deps.txConfig ?? getOidcTxConfig()
  const expiresAt = absoluteOidcExpirySeconds(input.nowSeconds, txConfig.ttlSeconds)
  const redirectUri = approvedCallbackUri(input.origin)
  const randomPKCECodeVerifier = deps.randomPKCECodeVerifier ?? client.randomPKCECodeVerifier
  const calculatePKCECodeChallenge = deps.calculatePKCECodeChallenge
    ?? client.calculatePKCECodeChallenge
  const randomNonce = deps.randomNonce ?? client.randomNonce
  const codeVerifier = randomPKCECodeVerifier()
  const codeChallenge = await calculatePKCECodeChallenge(codeVerifier)
  const nonce = randomNonce()
  const state = generateOidcState()

  const record = buildTransactionRecord({
    codeVerifier,
    expiresAt,
    nonce,
    oidc,
    redirectUri,
    sessionId: input.sessionId,
    tenantId: input.tenantId
  })

  const createResult = await deps.store.create(state, record)
  if (createResult.kind !== "created") {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  return {
    codeChallenge,
    codeVerifier,
    expiresAt,
    kind: "ok",
    nonce,
    redirectUri,
    state: createResult.state,
    txConfig
  }
}

function resolveDiscoverDeps(deps: InitiateLoginDeps): ResolveClientAndDiscoverDeps {
  return {
    ...(deps.discover === undefined ? {} : { discover: deps.discover }),
    ...(deps.resolveSecret === undefined ? {} : { resolveSecret: deps.resolveSecret })
  }
}
