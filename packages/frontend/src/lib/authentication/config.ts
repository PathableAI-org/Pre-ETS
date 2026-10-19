import { Config, Effect, Schema, SchemaIssue } from "effect"

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

const invalidAuthenticationConfig = () =>
  new Config.ConfigError(
    new Schema.SchemaError(
      new SchemaIssue.InvalidValue({ message: "Authentication process settings are invalid" })
    )
  )

interface AuthenticationSettings {
  readonly allowInsecureLoopback: boolean
  readonly callbackOrigins: Readonly<Record<string, URL>>
}

/** Process-only callback authority. The selected tenant file remains unchanged and non-secret. */
export const AuthenticationConfig: Config.Config<AuthenticationSettings> = Config.Boolean(
  "OIDC_ALLOW_INSECURE_LOOPBACK"
).pipe(
  Config.withDefault(false),
  Config.flatMap((allowInsecureLoopback) => {
    const origin = permittedUrl(allowInsecureLoopback).pipe(
      Schema.check(Schema.makeFilter((url) => url.href === `${url.origin}/` || "Callback authority must be an origin"))
    )
    const origins = Schema.fromJsonString(Schema.Record(Schema.String, origin))
    return Config.String("OIDC_CALLBACK_ORIGINS_JSON").pipe(
      Config.withDefault("{}"),
      Config.mapEffect((raw) =>
        Schema.decodeUnknownEffect(origins)(raw).pipe(
          Effect.mapError(invalidAuthenticationConfig)
        )
      ),
      Config.map((callbackOrigins) => ({ allowInsecureLoopback, callbackOrigins }))
    )
  })
)
