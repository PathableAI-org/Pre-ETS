export type ApplicationRuntime = "development" | "production"

export interface BoundTenant {
  readonly origin: TenantOrigin
  readonly slug: string
}

export interface CurrentTenantContext extends BoundTenant {
  readonly config: TenantConfig
}

export type HostSuffix = "localhost" | "pathable.com"

export interface TenantConfig {
  readonly displayName: string
}

export interface TenantFailure {
  readonly ok: false
  readonly reason: TenantFailureReason
}

export type TenantFailureReason =
  | "config-unavailable"
  | "invalid-config"
  | "invalid-context"
  | "invalid-host"
  | "invalid-settings"
  | "unknown-tenant"

export type TenantMode = "host" | "static"

export type TenantOrigin = "host-associated" | "local-static"

export interface TenantRecord {
  readonly config: TenantConfig
  readonly slug: string
}

export type TenantResult<T> = TenantFailure | TenantSuccess<T>

export interface TenantSuccess<T> {
  readonly ok: true
  readonly value: T
}

const INVALID_MODE_MESSAGE =
  "Use host or development-only static for TENANT_RESOLUTION; host association remains enabled."

export interface ModeDiagnostic {
  readonly category: "invalid-mode"
  readonly message: typeof INVALID_MODE_MESSAGE
}

export type ModeSelection =
  | {
    readonly diagnostic: ModeDiagnostic
    readonly mode: "host"
  }
  | {
    readonly mode: TenantMode
  }

export const INVALID_MODE_DIAGNOSTIC: ModeDiagnostic = {
  category: "invalid-mode",
  message: INVALID_MODE_MESSAGE
}

export function fail(reason: TenantFailureReason): TenantFailure {
  return { ok: false, reason }
}

export function ok<T>(value: T): TenantSuccess<T> {
  return { ok: true, value }
}

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export function isCanonicalTenantSlug(value: string): boolean {
  return value.length >= 1 && value.length <= 63 && value !== "www" && SLUG_PATTERN.test(value)
}

export function parseTenantRecord(value: unknown): TenantResult<TenantRecord> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail("invalid-config")
  }

  const record = value as Record<string, unknown>
  const slugResult = parseTenantSlug(record.slug)
  if (!slugResult.ok) {
    return slugResult
  }

  const configResult = parseTenantConfig(record.config)
  if (!configResult.ok) {
    return configResult
  }

  const allowed = new Set(["config", "slug"])
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    return fail("invalid-config")
  }

  return ok({
    config: configResult.value,
    slug: slugResult.value
  })
}

function parseTenantConfig(value: unknown): TenantResult<TenantConfig> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail("invalid-config")
  }

  const keys = Object.keys(value)
  if (keys.some((key) => key !== "displayName")) {
    return fail("invalid-config")
  }

  if (!("displayName" in value)) {
    return fail("invalid-config")
  }

  const displayName = value.displayName
  if (typeof displayName !== "string" || displayName.trim() === "") {
    return fail("invalid-config")
  }

  return ok({ displayName })
}

function parseTenantSlug(value: unknown): TenantResult<string> {
  if (typeof value !== "string" || !isCanonicalTenantSlug(value)) {
    return fail("invalid-config")
  }

  return ok(value)
}
