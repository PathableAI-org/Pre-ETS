import "server-only"
import { Clock, Context, Duration, Effect, Layer, Option, Schema } from "effect"

import { ClientCredentials } from "./authentication/credentials.js"
import { FRESHNESS_TOLERANCE, freshnessPosition } from "./authentication/freshness.js"
import { OidcProvider } from "./authentication/provider.js"
import {
  AuthenticationTransactions,
  decodeBrowserCorrelation,
  makeBrowserCorrelation
} from "./authentication/transaction.js"
import { type AuthenticationSettings, permittedUrl } from "./config.js"
import { annotateOutcome } from "./observability.js"
import { parseRequestHost, type RequestHost } from "./request-host.js"
import { type TenantAlias, TenantConfigService, type TenantFailure, TenantNotFound, TenantReadError } from "./tenant.js"

/** A validated identity whose authentication event was confirmed fresh. */
export interface TrustedIdentity {
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
  readonly correlation?: string | undefined
  readonly host: string
  readonly query: readonly (readonly [string, string])[]
}

type CorrelationDisposition = CallbackExpectedFailure["correlationDisposition"]

interface PreparedAuthentication {
  readonly correlation: string
  readonly destination: string
  readonly expiresAt: number
}

/** The request host is malformed, or is not its tenant's configured callback origin. */
class UntrustedHost extends Schema.TaggedError<UntrustedHost>()("UntrustedHost", {}) {}

/** Safe expected denial of an untrusted or no-longer-recoverable callback. */
export class AuthenticationDenied extends Schema.TaggedError<AuthenticationDenied>()("AuthenticationDenied", {}) {}

/** The provider's authentication time was absent, or outside the freshness window. */
export class AuthenticationNotFresh extends Schema.TaggedError<AuthenticationNotFresh>()("AuthenticationNotFresh", {
  evidence: Schema.Literals(["missing", "stale"])
}) {}

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
    reason: Schema.Union([
      AuthenticationDenied,
      AuthenticationNotFresh,
      AuthenticationUnavailable,
      TenantNotFound,
      TenantReadError
    ])
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

const callbackSecurityNames = new Set(["code", "error", "error_description", "error_uri", "iss", "state"])

/** A security parameter appears exactly once with a non-blank value. */
const SingleValue = Schema.Tuple([Schema.String.pipe(Schema.check(Schema.isPattern(/\S/)))])

/**
 * The two permitted callback shapes, keyed by security parameter. Unknown security parameters are rejected, so a
 * success carries no error fields and an error carries no code. Non-security parameters are ignored.
 */
const CallbackQuery = Schema.Union([
  Schema.Struct({ code: SingleValue, iss: Schema.optionalKey(SingleValue), state: SingleValue }),
  Schema.Struct({
    error: SingleValue,
    error_description: Schema.optionalKey(SingleValue),
    error_uri: Schema.optionalKey(SingleValue),
    iss: Schema.optionalKey(SingleValue),
    state: SingleValue
  })
])

const decodeCallbackQuery = Schema.decodeUnknownOption(CallbackQuery, { onExcessProperty: "error" })

const securityParameters = (query: readonly (readonly [string, string])[]): Record<string, string[]> => {
  const values: Record<string, string[]> = {}
  for (const [name, value] of query) {
    if (callbackSecurityNames.has(name)) (values[name] ??= []).push(value)
  }
  return values
}

const callbackShape = (
  query: readonly (readonly [string, string])[]
): Option.Option<{ readonly kind: "error" | "success"; readonly state: string }> =>
  decodeCallbackQuery(securityParameters(query)).pipe(
    Option.map((parameters) => ({ kind: "code" in parameters ? "success" : "error", state: parameters.state[0] }))
  )

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
  attempt.callbackAuthority === expected.callbackAuthority &&
  attempt.clientId === expected.clientId &&
  attempt.correlation === expected.correlation &&
  attempt.issuer === expected.issuer &&
  attempt.redirectUri === expected.redirectUri &&
  attempt.state === expected.state &&
  attempt.tenantAlias === expected.tenantAlias

const completionOutcome = (reason: CallbackExpectedFailure["reason"]): string => {
  switch (reason._tag) {
    case "AuthenticationDenied":
      return "denied"
    case "AuthenticationNotFresh":
      return `not_fresh_${reason.evidence}`
    case "AuthenticationUnavailable":
      return "unavailable"
    case "TenantNotFound":
    case "TenantReadError":
      return "tenant_failure"
  }
}

/** Sets the closed-set completion outcome on the `AuthenticationService.complete` span for every failure. */
const annotateCompletionFailure = <A, R>(effect: Effect.Effect<A, CallbackExpectedFailure, R>) =>
  effect.pipe(Effect.tapError((failure) => annotateOutcome(completionOutcome(failure.reason))))

const exactCallback = (origin: URL): { readonly authority: string; readonly redirectUri: string } => ({
  authority: origin.origin,
  redirectUri: new URL("/auth/callback", origin).href
})

const authenticationServiceLayer = (settings: AuthenticationSettings) => {
  const decodeUrl = Schema.decodeUnknownEffect(permittedUrl(settings.allowInsecureLoopback))
  return Layer.effect(
    AuthenticationService,
    Effect.gen(function*() {
      const credentials = yield* ClientCredentials
      const provider = yield* OidcProvider
      const tenant = yield* TenantConfigService
      const transactions = yield* AuthenticationTransactions

      /** The tenant, its configuration, and its exact callback URI for a request host. */
      const resolveCallbackTarget = Effect.fnUntraced(function*(host: string) {
        const requestHost = parseRequestHost(host)
        if (requestHost === undefined) return yield* new UntrustedHost({})
        const alias = yield* Effect.fromResult(tenant.getAlias(requestHost.hostname))
        const config = yield* tenant.getConfigFromAlias(alias)
        const origin = Object.hasOwn(settings.callbackOrigins, alias) ? settings.callbackOrigins[alias] : undefined
        if (origin === undefined || !requestMatchesOrigin(requestHost, origin)) return yield* new UntrustedHost({})
        return { alias, callback: exactCallback(origin), config }
      })

      const prepare = Effect.fn("AuthenticationService.prepare")(function*({ host }: { readonly host: string }) {
        const { alias, callback, config } = yield* resolveCallbackTarget(host).pipe(
          Effect.catchTag("UntrustedHost", () => Effect.fail(unavailable()))
        )
        const clientAuthentication = yield* credentials.resolve(config.oidc).pipe(
          Effect.mapError(() => unavailable())
        )

        /** A fresh provider state and correlation per attempt; only a correlation collision is retried. */
        const createCandidate = Effect.gen(function*() {
          const prepared = yield* provider.prepare({
            clientAuthentication,
            clientId: config.oidc.clientId,
            issuer: config.oidc.issuer,
            redirectUri: callback.redirectUri
          }).pipe(Effect.mapError(() => unavailable()))
          const correlation = yield* makeBrowserCorrelation
          const createdAt = yield* Clock.currentTimeMillis
          const expiresAt = createdAt + Duration.toMillis(transactions.ttl)
          yield* transactions.create({
            callbackAuthority: callback.authority,
            clientId: config.oidc.clientId,
            correlation,
            createdAt,
            expiresAt,
            issuer: prepared.issuer,
            nonce: prepared.nonce,
            pkceVerifier: prepared.pkceVerifier,
            redirectUri: callback.redirectUri,
            state: prepared.state,
            tenantAlias: alias,
            version: 1
          })
          return { correlation, destination: prepared.destination, expiresAt }
        })

        return yield* createCandidate.pipe(
          Effect.retry({ times: 2, while: (failure) => failure._tag === "AuthenticationAttemptCollision" }),
          Effect.mapError(() => unavailable())
        )
      })

      const qualifyCallback = Effect.fnUntraced(function*(input: CompleteAuthenticationInput) {
        const shape = callbackShape(input.query)
        if (Option.isNone(shape)) return yield* callbackFailure(denied(), "preserve")
        const correlation = yield* decodeBrowserCorrelation(input.correlation).pipe(
          Effect.mapError(() => callbackFailure(denied(), "preserve"))
        )
        const target = yield* resolveCallbackTarget(input.host).pipe(
          Effect.mapError((failure) =>
            callbackFailure(failure._tag === "UntrustedHost" ? denied() : failure, "preserve")
          )
        )
        yield* Effect.annotateCurrentSpan("preets.tenant.alias", target.alias)
        return { ...target, correlation, shape: shape.value }
      })

      const complete = Effect.fn("AuthenticationService.complete")(function*(input: CompleteAuthenticationInput) {
        // The instant the provider's return reached the application bounds the freshness window above.
        const callbackAt = yield* Clock.currentTimeMillis
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

        yield* Effect.annotateCurrentSpan({
          "preets.authentication.callback_ms": callbackAt,
          "preets.authentication.transaction_started_ms": attempt.createdAt
        })

        const configuredIssuer = yield* decodeUrl(qualified.config.oidc.issuer).pipe(
          Effect.mapError(() => callbackFailure(unavailable(), "clear"))
        )
        if (
          !attemptMatches(attempt, {
            callbackAuthority: qualified.callback.authority,
            clientId: qualified.config.oidc.clientId,
            correlation: qualified.correlation,
            issuer: configuredIssuer.href,
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
        const identity = yield* provider.complete({
          callbackQuery: input.query,
          clientAuthentication,
          clientId: qualified.config.oidc.clientId,
          expectedNonce: attempt.nonce,
          expectedState: attempt.state,
          issuer: qualified.config.oidc.issuer,
          pkceVerifier: attempt.pkceVerifier,
          redirectUri: qualified.callback.redirectUri
        }).pipe(
          Effect.mapError(() => callbackFailure(unavailable(), "clear"))
        )

        const position = freshnessPosition({
          authTimeSeconds: identity.authenticatedAt,
          callbackAtMs: callbackAt,
          startedAtMs: attempt.createdAt
        })
        const freshness = position === "inside" ? "confirmed" : position === "missing" ? "missing" : "stale"
        yield* Effect.annotateCurrentSpan({
          "preets.authentication.freshness": freshness,
          "preets.authentication.freshness_position": position,
          "preets.authentication.freshness_tolerance_ms": Duration.toMillis(FRESHNESS_TOLERANCE)
        })
        if (freshness !== "confirmed") {
          yield* Effect.logWarning("Authentication freshness denied").pipe(
            Effect.annotateLogs({
              "preets.authentication.freshness": freshness,
              "preets.tenant.alias": qualified.alias
            })
          )
          return yield* callbackFailure(new AuthenticationNotFresh({ evidence: freshness }), "clear")
        }

        yield* annotateOutcome("confirmed")
        return { issuer: identity.issuer, subject: identity.subject, tenantAlias: qualified.alias }
      }, annotateCompletionFailure)

      return AuthenticationService.of({ complete, prepare })
    })
  ).pipe(
    Layer.provide(Layer.mergeAll(
      ClientCredentials.layer(settings.clientSecrets),
      OidcProvider.layer(settings.allowInsecureLoopback),
      AuthenticationTransactions.layer(settings.transactions)
    ))
  )
}
