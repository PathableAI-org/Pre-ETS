import { Effect, Schema } from "effect"
import * as oidc from "openid-client"

interface ProviderRequest {
  readonly allowInsecureLoopback: boolean
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
    signal: init.signal === undefined ? signal : AbortSignal.any([signal, init.signal])
  })
  if (response.redirected || (response.status >= 300 && response.status < 400)) throw new ProviderUnavailable({})
  return response
}

const discoverProvider = async (request: ProviderRequest, issuer: URL, signal: AbortSignal) => {
  const config = await oidc.discovery(issuer, request.clientId, undefined, undefined, {
    [oidc.customFetch]: providerFetch(request, signal),
    ...(request.allowInsecureLoopback ? { execute: [oidc.allowInsecureRequests] } : {})
  })
  if (new URL(config.serverMetadata().issuer).href !== issuer.href) throw new ProviderUnavailable({})
  return config
}

const buildDestination = async (request: ProviderRequest, config: oidc.Configuration) => {
  const verifier = oidc.randomPKCECodeVerifier()
  const destination = oidc.buildAuthorizationUrl(config, {
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
    max_age: "0",
    nonce: oidc.randomNonce(),
    redirect_uri: request.redirectUri,
    response_type: "code",
    scope: "openid",
    state: oidc.randomState()
  })
  request.validateUrl(destination.href)
  return destination.href
}

/** Only public protocol fields leave this operation; the verifier is discarded after preparation. */
export const prepareProvider = (request: ProviderRequest) =>
  Effect.tryPromise({
    catch: () => new ProviderUnavailable({}),
    try: async (signal) => {
      const issuer = validateIssuer(request)
      request.validateUrl(request.redirectUri)
      return buildDestination(request, await discoverProvider(request, issuer, signal))
    }
  }).pipe(Effect.timeoutOrElse({
    duration: "5 seconds",
    orElse: () => Effect.fail(new ProviderUnavailable({}))
  }))
