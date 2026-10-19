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

/** Only public protocol fields leave this operation; the verifier is discarded after preparation. */
export const prepareProvider = (request: ProviderRequest) =>
  Effect.tryPromise({
    catch: () => new ProviderUnavailable({}),
    try: async (signal) => {
      const issuer = request.validateUrl(request.issuer)
      // The pinned client's direct-document branch skips the issuer comparison.
      if (issuer.href.includes("/.well-known/") || issuer.search !== "") throw new ProviderUnavailable({})
      request.validateUrl(request.redirectUri)
      const config = await oidc.discovery(issuer, request.clientId, undefined, undefined, {
        [oidc.customFetch]: async (input, init) => {
          request.validateUrl(input)
          const { body, ...options } = init
          const response = await globalThis.fetch(input, {
            ...options,
            ...(body === undefined ? {} : { body: body instanceof Uint8Array ? new Uint8Array(body) : body }),
            signal: init.signal === undefined ? signal : AbortSignal.any([signal, init.signal])
          })
          if (response.redirected || (response.status >= 300 && response.status < 400)) {
            throw new ProviderUnavailable({})
          }
          return response
        },
        ...(request.allowInsecureLoopback ? { execute: [oidc.allowInsecureRequests] } : {})
      })
      if (new URL(config.serverMetadata().issuer).href !== issuer.href) throw new ProviderUnavailable({})
      const verifier = oidc.randomPKCECodeVerifier()
      const challenge = await oidc.calculatePKCECodeChallenge(verifier)
      const destination = oidc.buildAuthorizationUrl(config, {
        code_challenge: challenge,
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
  }).pipe(Effect.timeoutOrElse({
    duration: "5 seconds",
    orElse: () => Effect.fail(new ProviderUnavailable({}))
  }))
