import "server-only"
import { Clock, Context, Duration, Effect, Layer, Result, Schema } from "effect"

import { ClientCredentials } from "./authentication/credentials.js"
import { completeProvider, prepareProvider } from "./authentication/provider.js"
import {
  AuthenticationTransactions,
  decodeBrowserCorrelation,
  makeBrowserCorrelation
} from "./authentication/transaction.js"
import { type AuthenticationSettings, permittedUrl } from "./config/index.js"
import { parseRequestHost, type RequestHost } from "./request-host.js"
import { type TenantAlias, TenantConfigService, type TenantFailure, TenantNotFound, TenantReadError } from "./tenant.js"

export interface TrustedIdentity {
  readonly authenticatedAt: number
  readonly issuer: string
  readonly subject: string
  readonly tenantAlias: TenantAlias
}

interface AuthenticationServiceShape {
  readonly complete: (
    input: CompleteAuthenticationInput
  ) => Effect.Effect<TrustedIdentity, CallbackExpectedFailure>
  readonly prepare: (
    input: { readonly host: string }
  ) => Effect.Effect<PreparedAuthentication, AuthenticationUnavailable | TenantFailure>
}

interface CompleteAuthenticationInput {
  readonly correlation?: string
  readonly host: string
  readonly query: readonly (readonly [string, string])[]
}

type CorrelationDisposition = CallbackExpectedFailure["correlationDisposition"]

interface PreparedAuthentication {
  readonly correlation: string
  readonly destination: string
  readonly expiresAt: number
}

/** Safe expected denial of an untrusted or no-longer-recoverable callback. */
export class AuthenticationDenied extends Schema.TaggedError<AuthenticationDenied>()("AuthenticationDenied", {}) {}

export class AuthenticationService extends Context.Service<AuthenticationService, AuthenticationServiceShape>()(
  "AuthenticationService"
) {
  static readonly layer = (settings: AuthenticationSettings) => authenticationServiceLayer(settings)
}

/** Safe provider, credential, or transaction unavailability. */
export class AuthenticationUnavailable extends Schema.TaggedError<AuthenticationUnavailable>()(
  "AuthenticationUnavailable",
  {}
) {}

/**
 * Expected callback failure. `reason` says what the browser sees; `correlationDisposition` says whether the
 * correlation cookie survives for a retry.
 */
export class CallbackExpectedFailure extends Schema.TaggedError<CallbackExpectedFailure>()(
  "CallbackExpectedFailure",
  {
    correlationDisposition: Schema.Literals(["clear", "preserve"]),
    reason: Schema.Union([AuthenticationDenied, AuthenticationUnavailable, TenantNotFound, TenantReadError])
  }
) {}

const unavailable = () => new AuthenticationUnavailable({})
const denied = () => new AuthenticationDenied({})
const callbackFailure = (
  reason: CallbackExpectedFailure["reason"],
  correlationDisposition: CorrelationDisposition
) => new CallbackExpectedFailure({ correlationDisposition, reason })

const canonicalPort = (protocol: string, port: string): string | undefined => {
  if (protocol === "https:") return port === "" || port === "443" ? "443" : port
  if (protocol === "http:") return port === "" || port === "80" ? "80" : port
  return undefined
}

const requestMatchesOrigin = (request: RequestHost, origin: URL): boolean => {
  const requestPort = canonicalPort(origin.protocol, request.port)
  const originPort = canonicalPort(origin.protocol, origin.port)
  return requestPort !== undefined && requestPort === originPort &&
    request.hostname === origin.hostname.toLowerCase()
}

interface CallbackShape {
  readonly kind: "error" | "success"
  readonly state: string
}

const callbackValues = (query: readonly (readonly [string, string])[]): Map<string, string[]> => {
  const securityNames = new Set(["code", "error", "error_description", "error_uri", "iss", "state"])
  const values = new Map<string, string[]>()
  for (const [name, value] of query) {
    if (!securityNames.has(name)) continue
    const previous = values.get(name)
    if (previous === undefined) values.set(name, [value])
    else previous.push(value)
  }
  return values
}

const hasInvalidCallbackValue = (values: Map<string, string[]>): boolean =>
  [...values.values()].some((entries) => entries.length !== 1 || entries[0]?.trim() === "")

const validatedCallbackValues = (
  query: readonly (readonly [string, string])[]
): Map<string, string[]> | undefined => {
  const values = callbackValues(query)
  return hasInvalidCallbackValue(values) ? undefined : values
}

const callbackValue = (values: Map<string, string[]>, name: string): string | undefined => values.get(name)?.[0]

const callbackKind = (code: string | undefined, error: string | undefined): CallbackShape["kind"] | undefined => {
  if (code !== undefined) return error === undefined ? "success" : undefined
  return error === undefined ? undefined : "error"
}

const errorDetailsAllowed = (values: Map<string, string[]>, kind: CallbackShape["kind"]): boolean =>
  kind === "error" || !["error_description", "error_uri"].some((name) => values.has(name))

const shapeFromValues = (values: Map<string, string[]>): CallbackShape | undefined => {
  const state = callbackValue(values, "state")
  if (state === undefined) return undefined
  const kind = callbackKind(callbackValue(values, "code"), callbackValue(values, "error"))
  if (kind === undefined) return undefined
  if (!errorDetailsAllowed(values, kind)) return undefined
  return { kind, state }
}

const callbackShape = (
  query: readonly (readonly [string, string])[]
): CallbackShape | undefined => {
  const values = validatedCallbackValues(query)
  return values === undefined ? undefined : shapeFromValues(values)
}

interface AttemptBindings {
  readonly callbackAuthority: string
  readonly clientId: string
  readonly correlation: string
  readonly issuer: string
  readonly redirectUri: string
  readonly state: string
  readonly tenantAlias: string
}

const attemptMatches = (attempt: AttemptBindings, expected: AttemptBindings): boolean =>
  [
    [attempt.callbackAuthority, expected.callbackAuthority],
    [attempt.clientId, expected.clientId],
    [attempt.correlation, expected.correlation],
    [attempt.issuer, expected.issuer],
    [attempt.redirectUri, expected.redirectUri],
    [attempt.state, expected.state],
    [attempt.tenantAlias, expected.tenantAlias]
  ].every(([actual, wanted]) => actual === wanted)

const exactCallback = (origin: URL): { readonly authority: string; readonly redirectUri: string } => ({
  authority: origin.origin,
  redirectUri: new URL("/auth/callback", origin).href
})

const authenticationServiceLayer = (settings: AuthenticationSettings) =>
  Layer.effect(
    AuthenticationService,
    Effect.gen(function*() {
      const credentials = yield* ClientCredentials
      const tenant = yield* TenantConfigService
      const transactions = yield* AuthenticationTransactions
      const validateUrl = Schema.decodeUnknownSync(permittedUrl(settings.allowInsecureLoopback))

      const prepare = Effect.fn("AuthenticationService.prepare")(function*({ host }: { readonly host: string }) {
        const requestHost = parseRequestHost(host)
        if (requestHost === undefined) return yield* unavailable()
        const alias = yield* Effect.fromResult(tenant.getAlias(requestHost.hostname))
        const config = yield* tenant.getConfigFromAlias(alias)
        const origin = Object.hasOwn(settings.callbackOrigins, alias) ? settings.callbackOrigins[alias] : undefined
        if (origin === undefined || !requestMatchesOrigin(requestHost, origin)) {
          return yield* unavailable()
        }
        const callback = exactCallback(origin)
        const clientAuthentication = yield* credentials.resolve(config.oidc).pipe(
          Effect.mapError(() => unavailable())
        )

        const createCandidate = (remaining: number): Effect.Effect<PreparedAuthentication, AuthenticationUnavailable> =>
          Effect.gen(function*() {
            const provider = yield* prepareProvider({
              allowInsecureLoopback: settings.allowInsecureLoopback,
              clientAuthentication,
              clientId: config.oidc.clientId,
              issuer: config.oidc.issuer,
              redirectUri: callback.redirectUri,
              validateUrl
            }).pipe(Effect.mapError(() => unavailable()))
            const correlation = yield* makeBrowserCorrelation
            const createdAt = yield* Clock.currentTimeMillis
            const expiresAt = createdAt + Duration.toMillis(transactions.ttl)
            const stored = yield* transactions.create({
              callbackAuthority: callback.authority,
              clientId: config.oidc.clientId,
              correlation,
              createdAt,
              expiresAt,
              issuer: provider.issuer,
              nonce: provider.nonce,
              pkceVerifier: provider.pkceVerifier,
              redirectUri: callback.redirectUri,
              state: provider.state,
              tenantAlias: alias,
              version: 1
            }).pipe(Effect.result)
            if (Result.isFailure(stored)) {
              if (stored.failure._tag === "AuthenticationAttemptCollision" && remaining > 1) {
                return yield* createCandidate(remaining - 1)
              }
              return yield* unavailable()
            }
            return { correlation, destination: provider.destination, expiresAt }
          })

        return yield* createCandidate(3)
      })

      const qualifyCallback = Effect.fnUntraced(function*(input: CompleteAuthenticationInput) {
        const shape = callbackShape(input.query)
        const requestHost = parseRequestHost(input.host)
        if (shape === undefined || requestHost === undefined) {
          return yield* callbackFailure(denied(), "preserve")
        }
        const correlation = yield* decodeBrowserCorrelation(input.correlation).pipe(
          Effect.mapError(() => callbackFailure(denied(), "preserve"))
        )
        const alias = yield* Effect.fromResult(tenant.getAlias(requestHost.hostname)).pipe(
          Effect.mapError((failure) => callbackFailure(failure, "preserve"))
        )
        const config = yield* tenant.getConfigFromAlias(alias).pipe(
          Effect.mapError((failure) => callbackFailure(failure, "preserve"))
        )
        const origin = Object.hasOwn(settings.callbackOrigins, alias) ? settings.callbackOrigins[alias] : undefined
        if (origin === undefined || !requestMatchesOrigin(requestHost, origin)) {
          return yield* callbackFailure(denied(), "preserve")
        }
        return { alias, callback: exactCallback(origin), config, correlation, shape }
      })

      const complete = Effect.fn("AuthenticationService.complete")(function*(input: CompleteAuthenticationInput) {
        const qualified = yield* qualifyCallback(input)

        const attempt = yield* transactions.consume({
          correlation: qualified.correlation,
          state: qualified.shape.state,
          tenantAlias: qualified.alias
        }).pipe(
          Effect.mapError((failure) => {
            if (failure._tag === "TransactionStoreUnavailable") {
              return callbackFailure(
                unavailable(),
                failure.phase === "before-send" ? "preserve" : "clear"
              )
            }
            return callbackFailure(
              denied(),
              failure.reason === "missing" ? "preserve" : "clear"
            )
          })
        )

        const configuredIssuer = yield* Effect.try({
          catch: () => callbackFailure(unavailable(), "clear"),
          try: () => validateUrl(qualified.config.oidc.issuer).href
        })
        if (
          !attemptMatches(attempt, {
            callbackAuthority: qualified.callback.authority,
            clientId: qualified.config.oidc.clientId,
            correlation: qualified.correlation,
            issuer: configuredIssuer,
            redirectUri: qualified.callback.redirectUri,
            state: qualified.shape.state,
            tenantAlias: qualified.alias
          })
        ) {
          return yield* callbackFailure(denied(), "clear")
        }
        if (qualified.shape.kind === "error") return yield* callbackFailure(denied(), "clear")

        const clientAuthentication = yield* credentials.resolve(qualified.config.oidc).pipe(
          Effect.mapError(() => callbackFailure(unavailable(), "clear"))
        )
        const identity = yield* completeProvider({
          allowInsecureLoopback: settings.allowInsecureLoopback,
          callbackQuery: input.query,
          clientAuthentication,
          clientId: qualified.config.oidc.clientId,
          expectedNonce: attempt.nonce,
          expectedState: attempt.state,
          issuer: qualified.config.oidc.issuer,
          pkceVerifier: attempt.pkceVerifier,
          redirectUri: qualified.callback.redirectUri,
          validateUrl
        }).pipe(
          Effect.mapError(() => callbackFailure(unavailable(), "clear"))
        )
        return {
          authenticatedAt: identity.authenticatedAt,
          issuer: identity.issuer,
          subject: identity.subject,
          tenantAlias: qualified.alias
        }
      })

      return AuthenticationService.of({ complete, prepare })
    })
  ).pipe(
    Layer.provide(Layer.mergeAll(
      ClientCredentials.layer(settings.clientSecrets),
      AuthenticationTransactions.layer(settings.transactions)
    ))
  )
