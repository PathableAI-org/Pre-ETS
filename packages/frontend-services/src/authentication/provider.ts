import { Cache, Context, Duration, Effect, Exit, Layer, Schema } from "effect"
import * as oidc from "openid-client"

import type { ResolvedClientAuthentication } from "./credentials.js"

import { permittedUrl } from "../config.js"

interface CompleteProviderAuthentication extends ProviderRequest {
  readonly callbackQuery: readonly (readonly [string, string])[]
  readonly expectedNonce: string
  readonly expectedState: string
  readonly pkceVerifier: string
}

interface PreparedProviderAuthentication {
  readonly destination: string
  readonly issuer: string
  readonly nonce: string
  readonly pkceVerifier: string
  readonly state: string
}

interface ProviderIdentity {
  /** The ID token's `auth_time` in seconds, or undefined when the provider supplied none. */
  readonly authenticatedAt: number | undefined
  readonly issuer: string
  readonly subject: string
}

interface ProviderRequest {
  readonly clientAuthentication: ResolvedClientAuthentication
  readonly clientId: string
  readonly issuer: string
  readonly redirectUri: string
}

class ProviderUnavailable extends Schema.TaggedError<ProviderUnavailable>()("ProviderUnavailable", {}) {}

/**
 * How long successfully discovered provider metadata is reused. Tenant files are still read per request, so a
 * changed issuer, client ID, or client authentication mode is a different key and is discovered immediately. This
 * bounds only how long a provider's own metadata change at an unchanged issuer can go unseen.
 */
const discoveryTimeToLive = Duration.minutes(5)

/** Distinct provider identities a process keeps; the least recently used entry is evicted beyond this. */
const discoveryCapacity = 256

/** The cache key. Effect compares plain-object keys structurally. */
interface DiscoveryKey {
  readonly clientAuthMode: ResolvedClientAuthentication["mode"]
  readonly clientId: string
  readonly issuer: string
}

/**
 * The ID token claims this application relies on. Other claims are ignored. An absent `auth_time` is decoded so the
 * caller can deny it as missing freshness evidence; a present but malformed one stays an invalid token.
 */
const IdentityClaims = Schema.Struct({
  auth_time: Schema.optionalKey(Schema.Int),
  sub: Schema.String.pipe(Schema.check(Schema.isPattern(/\S/)))
})

const decodeIdentityClaims = Schema.decodeUnknownEffect(IdentityClaims)

const unavailable = () => new ProviderUnavailable({})

/** One provider operation: discovery (cached or not) plus the protocol exchange share a five-second deadline. */
const withDeadline = <A, R>(operation: Effect.Effect<A, ProviderUnavailable, R>) =>
  operation.pipe(
    Effect.timeoutOrElse({
      duration: "5 seconds",
      orElse: () => Effect.fail(unavailable())
    })
  )

const providerLayer = (allowInsecureLoopback: boolean) => {
  // The provider adapter's fetch hook runs outside Effect and needs a throwing validator.
  const validateUrl = Schema.decodeUnknownSync(permittedUrl(allowInsecureLoopback))

  const providerFetch = (signal: AbortSignal): oidc.CustomFetch => async (input, init) => {
    validateUrl(input)
    const { body, ...options } = init
    const response = await globalThis.fetch(input, {
      ...options,
      body: body instanceof Uint8Array ? new Uint8Array(body) : body ?? null,
      redirect: "manual",
      signal: init.signal === undefined ? signal : AbortSignal.any([signal, init.signal])
    })
    if (response.redirected || (response.status >= 300 && response.status < 400)) throw unavailable()
    return response
  }

  /** Validates the configured issuer and redirect URI on every request, before any cached value is used. */
  const discoveryKey = (request: ProviderRequest) =>
    Effect.try({
      catch: unavailable,
      try: (): DiscoveryKey => {
        const issuer = validateUrl(request.issuer)
        // The pinned client's direct-document branch skips the issuer comparison.
        if (issuer.href.includes("/.well-known/") || issuer.search !== "") throw unavailable()
        validateUrl(request.redirectUri)
        return {
          clientAuthMode: request.clientAuthentication.mode,
          clientId: request.clientId,
          issuer: issuer.href
        }
      }
    })

  /** Fetches metadata and requires it to report the configured issuer. Only the server metadata is kept. */
  const discover = (key: DiscoveryKey) =>
    Effect.tryPromise({
      catch: unavailable,
      try: async (signal) => {
        const config = await oidc.discovery(new URL(key.issuer), key.clientId, undefined, undefined, {
          execute: allowInsecureLoopback ? [oidc.allowInsecureRequests] : [],
          [oidc.customFetch]: providerFetch(signal)
        })
        const metadata = config.serverMetadata()
        if (new URL(metadata.issuer).href !== key.issuer) throw unavailable()
        return metadata
      }
    })

  /** A per-request client: credentials and the cancellation signal are never shared through the cache. */
  const configuration = (
    metadata: oidc.ServerMetadata,
    request: ProviderRequest,
    signal: AbortSignal
  ): oidc.Configuration => {
    const config = new oidc.Configuration(
      metadata,
      request.clientId,
      undefined,
      request.clientAuthentication.method
    )
    if (allowInsecureLoopback) oidc.allowInsecureRequests(config)
    config[oidc.customFetch] = providerFetch(signal)
    return config
  }

  return Layer.effect(
    OidcProvider,
    Effect.gen(function*() {
      // Failures and interruptions are never cached: the next request discovers again.
      const discovered = yield* Cache.makeWith(discover, {
        capacity: discoveryCapacity,
        timeToLive: (exit) => Exit.isSuccess(exit) ? discoveryTimeToLive : Duration.zero
      })

      const exchange = <A>(
        request: ProviderRequest,
        operation: (config: oidc.Configuration, issuer: string) => Promise<A>
      ) =>
        withDeadline(Effect.gen(function*() {
          const key = yield* discoveryKey(request)
          const metadata = yield* Cache.get(discovered, key)
          return yield* Effect.tryPromise({
            catch: unavailable,
            try: (signal) => operation(configuration(metadata, request, signal), key.issuer)
          })
        }))

      const prepare = (request: ProviderRequest): Effect.Effect<PreparedProviderAuthentication, ProviderUnavailable> =>
        exchange(request, async (config, issuer) => {
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
          validateUrl(destination.href)
          return { destination: destination.href, issuer, nonce, pkceVerifier, state }
        })

      const complete = (
        request: CompleteProviderAuthentication
      ): Effect.Effect<ProviderIdentity, ProviderUnavailable> =>
        exchange(request, async (config, issuer) => {
          oidc.enableNonRepudiationChecks(config)

          const currentUrl = new URL(request.redirectUri)
          for (const [name, value] of request.callbackQuery) currentUrl.searchParams.append(name, value)

          const response = await oidc.authorizationCodeGrant(config, currentUrl, {
            expectedNonce: request.expectedNonce,
            expectedState: request.expectedState,
            idTokenExpected: true,
            pkceCodeVerifier: request.pkceVerifier
          })
          return { claims: response.claims(), issuer }
        }).pipe(
          Effect.flatMap(({ claims, issuer }) =>
            decodeIdentityClaims(claims).pipe(
              Effect.map((identity) => ({ authenticatedAt: identity.auth_time, issuer, subject: identity.sub })),
              Effect.mapError(unavailable)
            )
          )
        )

      return OidcProvider.of({ complete, prepare })
    })
  )
}

/** OIDC provider operations. The layer owns the process's discovered-metadata cache. */
export class OidcProvider extends Context.Service<OidcProvider, {
  readonly complete: (request: CompleteProviderAuthentication) => Effect.Effect<ProviderIdentity, ProviderUnavailable>
  readonly prepare: (request: ProviderRequest) => Effect.Effect<PreparedProviderAuthentication, ProviderUnavailable>
}>()("OidcProvider") {
  static readonly layer = (allowInsecureLoopback: boolean) => providerLayer(allowInsecureLoopback)
}
