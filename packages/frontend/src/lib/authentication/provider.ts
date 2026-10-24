import { Effect, Schema } from "effect"
import * as oidc from "openid-client"

import type { ResolvedClientAuthentication } from "./credentials.ts"

export interface CompleteProviderAuthentication extends ProviderRequest {
  readonly callbackQuery: readonly (readonly [string, string])[]
  readonly expectedNonce: string
  readonly expectedState: string
  readonly pkceVerifier: string
}

export interface PreparedProviderAuthentication {
  readonly destination: string
  readonly issuer: string
  readonly nonce: string
  readonly pkceVerifier: string
  readonly state: string
}

export interface ProviderIdentity {
  readonly authenticatedAt: number
  readonly issuer: string
  readonly subject: string
}

interface ProviderRequest {
  readonly allowInsecureLoopback: boolean
  readonly clientAuthentication: ResolvedClientAuthentication
  readonly clientId: string
  readonly issuer: string
  readonly redirectUri: string
  readonly validateUrl: (raw: string) => URL
}

class ProviderUnavailable extends Schema.TaggedError<ProviderUnavailable>()("ProviderUnavailable", {}) {}

const validateIssuer = (request: ProviderRequest): URL => {
  const issuer = request.validateUrl(request.issuer)
  // The pinned client's direct-document branch skips the issuer comparison.
  if (issuer.href.includes("/.well-known/") || issuer.search !== "") throw new ProviderUnavailable({})
  return issuer
}

const providerFetch = (request: ProviderRequest, signal: AbortSignal): oidc.CustomFetch => async (input, init) => {
  request.validateUrl(input)
  const { body, ...options } = init
  const response = await globalThis.fetch(input, {
    ...options,
    ...(body === undefined ? {} : { body: body instanceof Uint8Array ? new Uint8Array(body) : body }),
    redirect: "manual",
    signal: init.signal === undefined ? signal : AbortSignal.any([signal, init.signal])
  })
  if (response.redirected || (response.status >= 300 && response.status < 400)) throw new ProviderUnavailable({})
  return response
}

const discoverProvider = async (request: ProviderRequest, issuer: URL, signal: AbortSignal) => {
  const config = await oidc.discovery(
    issuer,
    request.clientId,
    undefined,
    request.clientAuthentication.method,
    {
      [oidc.customFetch]: providerFetch(request, signal),
      ...(request.allowInsecureLoopback ? { execute: [oidc.allowInsecureRequests] } : {})
    }
  )
  if (new URL(config.serverMetadata().issuer).href !== issuer.href) throw new ProviderUnavailable({})
  return config
}

const providerOperation = <A>(operation: (signal: AbortSignal) => Promise<A>) =>
  Effect.tryPromise({
    catch: () => new ProviderUnavailable({}),
    try: operation
  }).pipe(
    Effect.timeoutOrElse({
      duration: "5 seconds",
      orElse: () => Effect.fail(new ProviderUnavailable({}))
    })
  )

export const prepareProvider = (
  request: ProviderRequest
): Effect.Effect<PreparedProviderAuthentication, ProviderUnavailable> =>
  providerOperation(async (signal) => {
    const issuer = validateIssuer(request)
    request.validateUrl(request.redirectUri)
    const config = await discoverProvider(request, issuer, signal)
    const nonce = oidc.randomNonce()
    const pkceVerifier = oidc.randomPKCECodeVerifier()
    const state = oidc.randomState()
    const destination = oidc.buildAuthorizationUrl(config, {
      code_challenge: await oidc.calculatePKCECodeChallenge(pkceVerifier),
      code_challenge_method: "S256",
      max_age: "0",
      nonce,
      redirect_uri: request.redirectUri,
      response_type: "code",
      scope: "openid",
      state
    })
    request.validateUrl(destination.href)
    return { destination: destination.href, issuer: issuer.href, nonce, pkceVerifier, state }
  })

export const completeProvider = (
  request: CompleteProviderAuthentication
): Effect.Effect<ProviderIdentity, ProviderUnavailable> =>
  providerOperation(async (signal) => {
    const issuer = validateIssuer(request)
    request.validateUrl(request.redirectUri)
    const config = await discoverProvider(request, issuer, signal)
    oidc.enableNonRepudiationChecks(config)

    const currentUrl = new URL(request.redirectUri)
    for (const [name, value] of request.callbackQuery) currentUrl.searchParams.append(name, value)

    const response = await oidc.authorizationCodeGrant(config, currentUrl, {
      expectedNonce: request.expectedNonce,
      expectedState: request.expectedState,
      idTokenExpected: true,
      pkceCodeVerifier: request.pkceVerifier
    })
    const claims = response.claims()
    const subject = claims?.sub
    const authenticatedAt = claims?.auth_time
    if (
      typeof subject !== "string" || subject.trim() === "" ||
      typeof authenticatedAt !== "number" || !Number.isInteger(authenticatedAt)
    ) {
      throw new ProviderUnavailable({})
    }
    return { authenticatedAt, issuer: issuer.href, subject }
  })
