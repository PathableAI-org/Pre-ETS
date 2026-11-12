import { Context, Effect, Layer, Redacted, Schema } from "effect"
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

const supportedSecretMethod = (
  methods: readonly string[] | undefined
): "client_secret_basic" | "client_secret_post" | undefined => {
  // Omitted metadata means client_secret_basic, the OpenID Connect default.
  const advertised = methods === undefined || methods.length === 0 ? ["client_secret_basic"] : methods
  const selected = advertised.find((method) => method === "client_secret_basic" || method === "client_secret_post")
  return selected === "client_secret_basic" || selected === "client_secret_post" ? selected : undefined
}

const confidentialAuthentication = (secret: string): oidc.ClientAuth => (metadata, client, body, headers) => {
  const method = supportedSecretMethod(metadata.token_endpoint_auth_methods_supported)
  if (method === undefined) throw new Error("Confidential client authentication method is unsupported")
  const authenticate = method === "client_secret_basic" ? oidc.ClientSecretBasic(secret) : oidc.ClientSecretPost(secret)
  authenticate(metadata, client, body, headers)
}

export class ClientCredentials extends Context.Service<ClientCredentials, {
  readonly resolve: (
    request: ClientAuthenticationRequest
  ) => Effect.Effect<ResolvedClientAuthentication, ClientCredentialUnavailable>
}>()("ClientCredentials") {
  /** `secrets` maps a tenant's non-secret `clientSecretRef` to its client secret. */
  static readonly layer = (secrets: Readonly<Record<string, Redacted.Redacted>>) =>
    Layer.succeed(ClientCredentials, {
      resolve: Effect.fnUntraced(function*(request: ClientAuthenticationRequest) {
        if (request.clientAuth === "public") {
          return { method: oidc.None(), mode: "public" } as const
        }
        const secret = Object.hasOwn(secrets, request.clientSecretRef) ? secrets[request.clientSecretRef] : undefined
        if (secret === undefined) return yield* new ClientCredentialUnavailable({})
        return { method: confidentialAuthentication(Redacted.value(secret)), mode: "confidential" } as const
      })
    })
}
