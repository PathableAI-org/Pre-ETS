import { Config, Schema } from "effect"

export class TenantConfigError extends Schema.TaggedError<TenantConfigError>()(
  "@pathableai/pre-ets-frontend/TenantResolutionError",
  {
    cause: Schema.instanceOf(globalThis.Error),
    message: Schema.String
  }
) {}

const TenantAliasBrand = "@pathableai/pre-ets-frontend/TenantAlias" as const

export const TenantAlias = Schema.NonEmptyString.pipe(
  Schema.check(Schema.isPattern(/^[a-z-]+$/)),
  Schema.brand(TenantAliasBrand)
)
export type TenantAlias = typeof TenantAlias.Type

const OidcClientAuth = Schema.Literals([
  "confidential",
  "public"
])
export type OidcClientAuth = typeof OidcClientAuth.Type

const TenantOidcConfig = Schema.Struct({
  clientAuth: OidcClientAuth,
  clientId: Schema.String,
  connection: Schema.optionalKey(Schema.String),
  issuer: Schema.String
})
export type TenantOidcConfig = typeof TenantOidcConfig.Type

const TenantConfigSchema = Schema.Struct({
  displayName: Schema.String,
  idleTimeoutMinutes: Schema.optionalKey(
    Schema.Int.pipe(
      Schema.check(Schema.isBetween({
        maximum: 30,
        minimum: 5
      }))
    )
  ),
  oidc: Schema.optionalKey(TenantOidcConfig)
})

export const TenantConfig = Config.schema(TenantConfigSchema)
export type TenantConfig = Config.Success<typeof TenantConfig>
