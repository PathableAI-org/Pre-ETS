export type HostSuffix = "localhost" | "pathable.com"

export interface TenantConfig {
  readonly displayName: string
}

export type TenantMode = "host" | "static"

export interface TenantRecord {
  readonly config: TenantConfig
  readonly slug: string
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

export const CONFIG_UNAVAILABLE = "Tenant configuration is unavailable."
export const LOCAL_CONFIG_ERROR =
  "Supply a valid TENANT_LOCAL_CONFIG_JSON record with slug and Display Name, then restart."

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export function isCanonicalTenantSlug(value: string): boolean {
  return value.length >= 1 && value.length <= 63 && value !== "www" && SLUG_PATTERN.test(value)
}

export function parseTenantRecord(value: unknown): TenantRecord | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }

  const record = value as Record<string, unknown>
  if (typeof record.slug !== "string" || !isCanonicalTenantSlug(record.slug)) {
    return undefined
  }

  const config = parseTenantConfig(record.config)
  if (config === undefined) {
    return undefined
  }

  const allowed = new Set(["config", "slug"])
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    return undefined
  }

  return {
    config,
    slug: record.slug
  }
}

export function selectTenantMode(rawMode: string | undefined, production = false): ModeSelection {
  if (production) {
    return { mode: "host" }
  }

  if (rawMode === undefined || rawMode === "" || rawMode === "host") {
    return { mode: "host" }
  }

  if (rawMode === "static") {
    return { mode: "static" }
  }

  return {
    diagnostic: INVALID_MODE_DIAGNOSTIC,
    mode: "host"
  }
}

function parseTenantConfig(value: unknown): TenantConfig | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }

  const keys = Object.keys(value)
  if (keys.some((key) => key !== "displayName")) {
    return undefined
  }

  if (!("displayName" in value)) {
    return undefined
  }

  const displayName = value.displayName
  if (typeof displayName !== "string" || displayName.trim() === "") {
    return undefined
  }

  return { displayName }
}
