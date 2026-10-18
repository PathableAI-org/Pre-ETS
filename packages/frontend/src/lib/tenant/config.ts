import "server-only"
import { Config, Effect, Schema, SchemaIssue } from "effect"

const IntegrationIdentifier = Schema.NonEmptyString.pipe(Schema.check(Schema.isPattern(/\S/)))

const OidcIntegration = {
  clientId: IntegrationIdentifier,
  connection: Schema.optionalKey(Schema.String),
  issuer: IntegrationIdentifier
}

const TenantOidcConfig = Schema.Union([
  Schema.Struct({
    clientAuth: Schema.Literal("public"),
    ...OidcIntegration
  }),
  Schema.Struct({
    clientAuth: Schema.Literal("confidential"),
    clientSecretRef: IntegrationIdentifier,
    ...OidcIntegration
  })
])

interface SessionPolicy {
  readonly idleTimeoutMinutes: number
  readonly warningLeadMinutes: number
}

/** Effective policy for session creation and timer refresh from validated tenant policy fields. */
export const effectiveSessionPolicy = (config: {
  readonly idleTimeoutMinutes?: number
  readonly warningLeadMinutes?: number
}): SessionPolicy => {
  const idleTimeoutMinutes = config.idleTimeoutMinutes ?? 30
  return {
    idleTimeoutMinutes,
    warningLeadMinutes: config.warningLeadMinutes ?? (idleTimeoutMinutes === 5 ? 0 : 5)
  }
}

const TenantFileSchema = Schema.Struct({
  displayName: Schema.String,
  idleTimeoutMinutes: Schema.optionalKey(Schema.Int.pipe(
    Schema.check(Schema.isBetween({ maximum: 30, minimum: 5 }))
  )),
  oidc: TenantOidcConfig,
  warningLeadMinutes: Schema.optionalKey(Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))))
}).pipe(
  Schema.check(Schema.makeFilter((config) => {
    const policy = effectiveSessionPolicy(config)
    return policy.warningLeadMinutes < policy.idleTimeoutMinutes ||
      { issue: "Warning lead must be less than the effective idle timeout", path: ["warningLeadMinutes"] }
  }))
)

const decodeTenantFile = Schema.decodeUnknownEffect(Schema.fromJsonString(TenantFileSchema), {
  onExcessProperty: "error"
})

/**
 * Reads one complete tenant JSON document from the selected file's ConfigProvider.
 *
 * The decoded value preserves supplied fields. Use {@link effectiveSessionPolicy} for omitted-setting defaults.
 * Resolved credentials never belong in this document. Credential lookup is deferred until a consumer needs it.
 */
export const TenantConfig = Config.String().pipe(
  Config.mapEffect((raw) =>
    decodeTenantFile(raw).pipe(
      Effect.mapError((error) =>
        new Config.ConfigError(
          new Schema.SchemaError(
            new SchemaIssue.InvalidValue({
              message: error.issue._tag === "Encoding" ?
                "Tenant configuration JSON is invalid" :
                "Tenant configuration schema is invalid"
            })
          )
        )
      )
    )
  )
)

/** Validated file content; absent settings remain absent in diagnostics. */
export type TenantConfig = Config.Success<typeof TenantConfig>
