import { Schema } from "effect"

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

export const TenantConfig = Schema.Struct({})

export type TenantConfig = typeof TenantConfig.Type
