import { Config, Duration, Effect, Schema, SchemaIssue, SchemaTransformation } from "effect"

const isLoopback = (hostname: string): boolean =>
  hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "[::1]" ||
  /^127(?:\.\d{1,3}){3}$/.test(hostname)

/** The application exception is narrower than the protocol client's general HTTP escape. */
export const permittedUrl = (allowInsecureLoopback: boolean) =>
  Schema.URLFromString.pipe(
    Schema.check(Schema.makeFilter((url) =>
      url.username === "" && url.password === "" && !url.href.includes("#") &&
        (url.protocol === "https:" ||
          (allowInsecureLoopback && url.protocol === "http:" && isLoopback(url.hostname))) ||
      "Authentication URL must use permitted transport and contain no credentials or fragment"
    ))
  )

/** Process-only authentication settings. The selected tenant file remains unchanged and non-secret. */
export interface AuthenticationSettings {
  readonly allowInsecureLoopback: boolean
  readonly callbackOrigins: Readonly<Record<string, URL>>
  readonly clientSecrets: Readonly<Record<string, string>>
  readonly transactions: TransactionStoreSettings
}

export interface TransactionStoreSettings {
  readonly prefix: string
  readonly ttl: Duration.Duration
}

/**
 * Decodes a setting whose supplied value must never appear in an error: a secret, or a setting whose contract
 * forbids echoing it. The failure names the setting and drops the schema issue, which would quote the input.
 */
const withoutEcho = <A>(name: string, codec: Schema.Codec<A, string>): Config.Config<A> =>
  Config.String(name).pipe(
    Config.mapEffect((raw) =>
      Schema.decodeUnknownEffect(codec)(raw).pipe(
        Effect.mapError(() =>
          new Config.ConfigError(
            new Schema.SchemaError(new SchemaIssue.InvalidValue({ message: `${name} is invalid` }))
          )
        )
      )
    )
  )

const callbackOrigins = (allowInsecureLoopback: boolean) => {
  const origin = permittedUrl(allowInsecureLoopback).pipe(
    Schema.check(Schema.makeFilter((url) => url.href === `${url.origin}/` || "Callback authority must be an origin"))
  )
  return Config.schema(Schema.fromJsonString(Schema.Record(Schema.String, origin)), "OIDC_CALLBACK_ORIGINS_JSON").pipe(
    Config.withDefault({})
  )
}

const ClientSecrets = withoutEcho(
  "OIDC_CLIENT_SECRETS_JSON",
  Schema.fromJsonString(Schema.Record(Schema.NonEmptyString, Schema.NonEmptyString))
).pipe(Config.withDefault({}))

/** A base-10 integer from 1 through 600: configuration may shorten the transaction lifetime, never extend it. */
const TransactionTtlSeconds = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[1-9][0-9]{0,2}$/)),
  Schema.decodeTo(
    Schema.Int.pipe(Schema.check(Schema.isBetween({ maximum: 600, minimum: 1 }))),
    SchemaTransformation.numberFromString
  )
)

const TransactionStoreConfig: Config.Config<TransactionStoreSettings> = Config.all({
  prefix: Config.String("OIDC_TX_KEY_PREFIX").pipe(Config.withDefault("preets:oidc-tx:v1")),
  ttl: withoutEcho("OIDC_TX_TTL_SECONDS", TransactionTtlSeconds).pipe(
    Config.map(Duration.seconds),
    Config.withDefault(Duration.seconds(600))
  )
})

export const AuthenticationConfig: Config.Config<AuthenticationSettings> = Config.Boolean(
  "OIDC_ALLOW_INSECURE_LOOPBACK"
).pipe(
  Config.withDefault(false),
  Config.flatMap((allowInsecureLoopback) =>
    Config.all({
      callbackOrigins: callbackOrigins(allowInsecureLoopback),
      clientSecrets: ClientSecrets,
      transactions: TransactionStoreConfig
    }).pipe(Config.map((settings) => ({ allowInsecureLoopback, ...settings })))
  )
)
