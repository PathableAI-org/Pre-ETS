import "server-only"
import { Schema } from "effect"

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

const TenantFields = Schema.Struct({
  displayName: Schema.String,
  idleTimeoutMinutes: Schema.optionalKey(Schema.Int.pipe(
    Schema.check(Schema.isBetween({ maximum: 30, minimum: 5 }))
  )),
  oidc: TenantOidcConfig,
  warningLeadMinutes: Schema.optionalKey(Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))))
})

/** Idle timeout and warning lead, in minutes, that session creation and refresh apply. */
export interface SessionPolicy {
  readonly idleTimeoutMinutes: number
  readonly warningLeadMinutes: number
}

/** Fills omitted tenant policy settings with their defaults: 30-minute timeout, 5-minute warning (0 at 5 minutes). */
export const effectiveSessionPolicy = (
  settings: Pick<typeof TenantFields.Type, "idleTimeoutMinutes" | "warningLeadMinutes">
): SessionPolicy => {
  const idleTimeoutMinutes = settings.idleTimeoutMinutes ?? 30
  return {
    idleTimeoutMinutes,
    warningLeadMinutes: settings.warningLeadMinutes ?? (idleTimeoutMinutes === 5 ? 0 : 5)
  }
}

const TenantConfigSchema = TenantFields.pipe(
  Schema.check(Schema.makeFilter((config) => {
    const policy = effectiveSessionPolicy(config)
    return policy.warningLeadMinutes < policy.idleTimeoutMinutes ||
      { issue: "Warning lead must be less than the effective idle timeout", path: ["warningLeadMinutes"] }
  }))
)

/**
 * Validated tenant file content. Omitted settings stay omitted; use {@link effectiveSessionPolicy} for defaults.
 * Resolved credentials never belong in this document. Credential lookup is deferred until a consumer needs it.
 */
export type TenantConfig = typeof TenantConfigSchema.Type

/** Decodes one complete tenant JSON document. Unknown fields, including nested credential fields, are rejected. */
export const decodeTenantConfig = Schema.decodeUnknownEffect(Schema.fromJsonString(TenantConfigSchema), {
  onExcessProperty: "error"
})
