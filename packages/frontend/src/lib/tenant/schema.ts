import { Effect, Schema } from "effect"

export class TenantConfigError extends Schema.TaggedError<TenantConfigError>()(
  "@pathableai/pre-ets-frontend/TenantResolutionError",
  {
    cause: Schema.instanceOf(globalThis.Error),
    message: Schema.String
  }
) {}

const TenantAliasBrand = "@pathableai/pre-ets-frontend/TenantAlias" as const
export type TenantAliasBrand = typeof TenantAliasBrand

export const TenantAlias = Schema.NonEmptyString.pipe(
  Schema.check(Schema.isPattern(/^[a-z-]+$/)),
  Schema.brand(TenantAliasBrand)
)
export type TenantAlias = typeof TenantAlias.Type

const OidcClientAuthBrand = "@pathableai/pre-ets-frontend/OidcClientAuth" as const
export type OidcClientAuthBrand = typeof OidcClientAuthBrand
export const OidcClientAuth = Schema.Literals([
  "confidential",
  "public"
])
export type OidcClientAuth = typeof OidcClientAuth.Type

export const TenantOidcConfig = Schema.Struct({
  clientAuth: OidcClientAuth,
  clientId: Schema.String,
  connection: Schema.optionalKey(Schema.String),
  issuer: Schema.String
})
export type TenantOidcConfig = typeof TenantOidcConfig.Type

export const TenantConfig = Schema.Struct({
  displayName: Schema.String,
  idleTimeoutMinutes: Schema.Int.pipe(
    Schema.check(Schema.isBetween({
      maximum: 30,
      minimum: 5
    })),
    Schema.withDecodingDefault(Effect.succeed(30))
  ),
  oidc: TenantOidcConfig
})

export type TenantConfig = typeof TenantConfig.Type
