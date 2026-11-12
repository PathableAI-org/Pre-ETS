import { Config, Duration, type Redacted, Schema, SchemaTransformation } from "effect"

import { isLoopbackHostname } from "../request-host.js"

/** The application exception is narrower than the protocol client's general HTTP escape. */
export const permittedUrl = (allowInsecureLoopback: boolean) =>
  Schema.URLFromString.pipe(
    Schema.check(Schema.makeFilter((url) =>
      url.username === "" && url.password === "" && !url.href.includes("#") &&
        (url.protocol === "https:" ||
          (allowInsecureLoopback && url.protocol === "http:" && isLoopbackHostname(url.hostname))) ||
      "Authentication URL must use permitted transport and contain no credentials or fragment"
    ))
  )

/** Process-only authentication settings. The selected tenant file remains unchanged and non-secret. */
export interface AuthenticationSettings {
  readonly allowInsecureLoopback: boolean
  readonly callbackOrigins: Readonly<Record<string, URL>>
  /** Client secrets stay `Redacted` until the OIDC client authenticates with one. */
  readonly clientSecrets: Readonly<Record<string, Redacted.Redacted>>
  readonly transactions: TransactionStoreSettings
}

export interface TransactionStoreSettings {
  readonly prefix: string
  readonly ttl: Duration.Duration
}

const callbackOrigins = (allowInsecureLoopback: boolean) => {
  const origin = permittedUrl(allowInsecureLoopback).pipe(
    Schema.check(Schema.makeFilter((url) => url.href === `${url.origin}/` || "Callback authority must be an origin"))
  )
  return Config.schema(Schema.fromJsonString(Schema.Record(Schema.String, origin)), "OIDC_CALLBACK_ORIGINS_JSON").pipe(
    Config.withDefault({})
  )
}

const clientSecrets = (withoutEcho: <A>(name: string, codec: Schema.Codec<A, string>) => Config.Config<A>) =>
  withoutEcho(
    "OIDC_CLIENT_SECRETS_JSON",
    Schema.fromJsonString(Schema.Record(Schema.NonEmptyString, Schema.RedactedFromValue(Schema.NonEmptyString)))
  ).pipe(Config.withDefault({}))

/** A base-10 integer from 1 through 600: configuration may shorten the transaction lifetime, never extend it. */
const TransactionTtlSeconds = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^[1-9][0-9]{0,2}$/, {
      message: "Expected a whole number of seconds without sign or leading zero"
    })
  ),
  Schema.decodeTo(
    Schema.Int.pipe(Schema.check(Schema.isBetween({ maximum: 600, minimum: 1 }))),
    SchemaTransformation.numberFromString
  )
)

const transactionStoreConfig = (
  withoutEcho: <A>(name: string, codec: Schema.Codec<A, string>) => Config.Config<A>
): Config.Config<TransactionStoreSettings> =>
  Config.all({
    prefix: Config.String("OIDC_TX_KEY_PREFIX").pipe(Config.withDefault("preets:oidc-tx:v1")),
    ttl: withoutEcho("OIDC_TX_TTL_SECONDS", TransactionTtlSeconds).pipe(
      Config.map(Duration.seconds),
      Config.withDefault(Duration.seconds(600))
    )
  })

export const authenticationConfig = (
  withoutEcho: <A>(name: string, codec: Schema.Codec<A, string>) => Config.Config<A>
): Config.Config<AuthenticationSettings> =>
  Config.Boolean("OIDC_ALLOW_INSECURE_LOOPBACK").pipe(
    Config.withDefault(false),
    Config.flatMap((allowInsecureLoopback) =>
      Config.all({
        callbackOrigins: callbackOrigins(allowInsecureLoopback),
        clientSecrets: clientSecrets(withoutEcho),
        transactions: transactionStoreConfig(withoutEcho)
      }).pipe(Config.map((settings) => ({ allowInsecureLoopback, ...settings })))
    )
  )
