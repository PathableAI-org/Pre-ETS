import { Config, Context, Effect, Layer, Schema, SchemaIssue } from "effect"
import * as oidc from "openid-client"

export interface ResolvedClientAuthentication {
  readonly method: oidc.ClientAuth
  readonly mode: "confidential" | "public"
}

type ClientAuthenticationRequest =
  | { readonly clientAuth: "confidential"; readonly clientSecretRef: string }
  | { readonly clientAuth: "public" }

class ClientCredentialUnavailable extends Schema.TaggedError<ClientCredentialUnavailable>()(
  "ClientCredentialUnavailable",
  {}
) {}

const SecretMap = Schema.fromJsonString(Schema.Record(Schema.NonEmptyString, Schema.NonEmptyString))

const invalidCredentialConfig = () =>
  new Config.ConfigError(
    new Schema.SchemaError(
      new SchemaIssue.InvalidValue({ message: "Authentication credential settings are invalid" })
    )
  )

const ClientCredentialConfig = Config.String("OIDC_CLIENT_SECRETS_JSON").pipe(
  Config.withDefault("{}"),
  Config.mapEffect((raw) =>
    Schema.decodeUnknownEffect(SecretMap)(raw).pipe(
      Effect.mapError(invalidCredentialConfig)
    )
  )
)

export class ClientCredentials extends Context.Service<ClientCredentials, {
  readonly resolve: (
    request: ClientAuthenticationRequest
  ) => Effect.Effect<ResolvedClientAuthentication, ClientCredentialUnavailable>
}>()("@pathableai/pre-ets-frontend/ClientCredentials") {
  static readonly layer = Layer.effect(
    ClientCredentials,
    Effect.gen(function*() {
      const values = yield* ClientCredentialConfig
      const resolve = Effect.fnUntraced(function*(request: ClientAuthenticationRequest) {
        if (request.clientAuth === "public") {
          return { method: oidc.None(), mode: "public" } as const
        }
        const secret = Object.hasOwn(values, request.clientSecretRef) ? values[request.clientSecretRef] : undefined
        if (secret === undefined) return yield* new ClientCredentialUnavailable({})
        return { method: oidc.ClientSecretPost(secret), mode: "confidential" } as const
      })
      return ClientCredentials.of({ resolve })
    })
  )
}
