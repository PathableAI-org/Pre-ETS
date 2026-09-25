import { Array, pipe, Result, Schema, String } from "effect"

const TenantAliasBrand = "@pathableai/pre-ets-frontend/TenantAlias" as const
export type TenantAliasBrand = typeof TenantAliasBrand

export const TenantAlias = Schema.NonEmptyString.pipe(
  Schema.check(Schema.isPattern(/^[a-z-]+$/)),
  Schema.brand(TenantAliasBrand)
)
export type TenantAlias = typeof TenantAlias.Type

export class TenantAliasError extends Schema.TaggedError<TenantAliasError>()(
  "@pathableai/pre-ets-frontend/TenantResolutionError",
  {
    cause: Schema.instanceOf(Schema.SchemaError),
    message: Schema.String
  }
) {}

export const tenantAliasFromHost: (a: string) => Result.Result<TenantAlias, TenantAliasError> = (
  host
) =>
  pipe(
    host,
    String.split("."),
    Array.headNonEmpty,
    String.toLowerCase,
    Schema.decodeResult(TenantAlias),
    Result.mapError(
      (e) =>
        new TenantAliasError({
          cause: e,
          message: `Failed to read tenant alias from HOST: "${host}"`
        })
    )
  )
