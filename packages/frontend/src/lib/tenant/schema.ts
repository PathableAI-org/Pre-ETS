import { Effect, Schema } from "effect"

import { HttpError } from "../error.ts"

const fixedStatus = <const Code extends 404 | 500>(code: Code) =>
  Schema.Literal(code).pipe(Schema.withConstructorDefault(Effect.succeed(code)))

export type TenantFailure = TenantNotFound | TenantReadError

export class TenantNotFound extends HttpError.extend<TenantNotFound>(
  "@pathableai/pre-ets-frontend/TenantNotFound"
)({
  status: fixedStatus(404)
}) {}

export class TenantReadError extends HttpError.extend<TenantReadError>(
  "@pathableai/pre-ets-frontend/TenantReadError"
)({
  status: fixedStatus(500)
}) {}

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

const TenantOidcConfig = Schema.Struct({
  clientAuth: OidcClientAuth,
  clientId: Schema.String,
  connection: Schema.optionalKey(Schema.String),
  issuer: Schema.String
})

export const TenantConfig = Schema.Struct({
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

export type TenantConfig = typeof TenantConfig.Type
