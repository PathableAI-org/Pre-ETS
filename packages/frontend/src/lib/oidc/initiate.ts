import * as client from "openid-client"

import type { TenantConfig, TenantRecord } from "../tenant/types.ts"
import type { OidcTransactionStore } from "./transaction.ts"

import { signOidcCorrelationCookie } from "./cookie.ts"
import { discoverOidcIssuer } from "./discovery.ts"
import { type OidcSecretResolution, OidcSecretsConfigError, resolveOidcClientSecret } from "./secrets.ts"
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
  readonly discover?: typeof discoverOidcIssuer
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

// fallow-ignore-next-line complexity -- ordered OIDC initiation steps with typed outcomes
export async function initiateLogin(
  input: InitiateLoginInput,
  deps: InitiateLoginDeps
): Promise<InitiateLoginOutcome> {
  const oidc = input.tenantRecord.config.oidc
  if (input.tenantRecord.slug !== input.tenantId) {
    return { kind: "config-refusal", outcomeClass: "403-config" }
  }

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

  const txConfig = deps.txConfig ?? getOidcTxConfig()
  const expiresAt = absoluteOidcExpirySeconds(input.nowSeconds, txConfig.ttlSeconds)
  const redirectUri = approvedCallbackUri(input.origin)
  const randomPKCECodeVerifier = deps.randomPKCECodeVerifier ?? client.randomPKCECodeVerifier
  const calculatePKCECodeChallenge = deps.calculatePKCECodeChallenge
    ?? client.calculatePKCECodeChallenge
  const randomNonce = deps.randomNonce ?? client.randomNonce
  const buildAuthorizationUrl = deps.buildAuthorizationUrl ?? client.buildAuthorizationUrl
  const codeVerifier = randomPKCECodeVerifier()
  const codeChallenge = await calculatePKCECodeChallenge(codeVerifier)
  const nonce = randomNonce()
  const state = generateOidcState()

  const record: OidcTransactionRecord = oidc.connection === undefined
    ? {
      clientId: oidc.clientId,
      codeVerifier,
      expiresAt,
      issuer: oidc.issuer,
      nonce,
      redirectUri,
      sessionId: input.sessionId,
      tenantId: input.tenantId
    }
    : {
      clientId: oidc.clientId,
      codeVerifier,
      connection: oidc.connection,
      expiresAt,
      issuer: oidc.issuer,
      nonce,
      redirectUri,
      sessionId: input.sessionId,
      tenantId: input.tenantId
    }

  const createResult = await deps.store.create(state, record)
  if (createResult.kind !== "created") {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  const parameters: Record<string, string> = {
    client_id: oidc.clientId,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    nonce,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid",
    state: createResult.state
  }

  if (oidc.connection !== undefined) {
    parameters.kc_idp_hint = oidc.connection
  }

  let location: string
  try {
    location = buildAuthorizationUrl(discovered.configuration, parameters).toString()
  } catch {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  if (location.includes(codeVerifier) || (clientSecret !== undefined && location.includes(clientSecret))) {
    return { kind: "login-unavailable", outcomeClass: "login-unavailable" }
  }

  const signCookie = deps.signCookie ?? signOidcCorrelationCookie
  const oidcCookieValue = await signCookie(
    {
      exp: expiresAt,
      state: createResult.state,
      tenant: input.tenantId
    },
    txConfig
  )

  return {
    expiresAt,
    kind: "redirect",
    location,
    oidcCookieValue,
    outcomeClass: "redirect"
  }
}

function approvedCallbackUri(origin: string): string {
  const base = new URL(origin)
  return `${base.origin}/auth/callback`
}
