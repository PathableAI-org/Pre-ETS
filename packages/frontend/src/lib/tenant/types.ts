import path from "node:path"

export type HostSuffix = "localhost" | "pathable.com"

export type { OidcClientAuth, TenantConfig, TenantOidcConfig } from "./schema"

import { Schema } from "effect"

import { TenantConfig } from "./schema"

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
  "Supply a valid TENANT_STATIC_ALIAS naming a readable {alias}.json under TENANT_CONFIG_DIR, then restart."

export type FilesystemFailureCategory =
  | "escape"
  | "io"
  | "mismatch"
  | "missing-dir"
  | "parse"

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/** Effective idle duration for new authenticated sessions (omit → 30). */
export function effectiveIdleTimeoutMinutes(config: TenantConfig): number {
  return config.idleTimeoutMinutes
}

export function isCanonicalTenantSlug(value: string): boolean {
  return value.length >= 1 && value.length <= 63 && value !== "www" && SLUG_PATTERN.test(value)
}

export function parseTenantConfig(
  value: unknown,
  _options: { readonly allowLoopbackHttp?: boolean } = {}
): TenantConfig | undefined {
  return Schema.decodeUnknownSync(TenantConfig)(value)
}

export function parseTenantRecord(
  value: unknown,
  options: { readonly allowLoopbackHttp?: boolean } = {}
): TenantRecord | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }

  const record = value as Record<string, unknown>
  if (typeof record.slug !== "string" || !isCanonicalTenantSlug(record.slug)) {
    return undefined
  }

  const config = parseTenantConfig(record.config, options)
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

/**
 * Resolve `TENANT_CONFIG_DIR`. Empty/missing → unavailable. Relative paths resolve
 * against `cwd` (defaults to `process.cwd()` at the call site / boot).
 */
export function resolveTenantConfigDir(
  raw: string | undefined,
  cwd: string = process.cwd()
): string {
  if (raw === undefined || raw.trim() === "") {
    throw new Error(CONFIG_UNAVAILABLE)
  }

  const trimmed = raw.trim()
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed)
}

/**
 * Canonicalize `TENANT_STATIC_ALIAS`. Missing, blank, or non-canonical → local config error.
 */
export function resolveTenantStaticAlias(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === "") {
    throw new Error(LOCAL_CONFIG_ERROR)
  }

  const alias = raw.trim()
  if (!isCanonicalTenantSlug(alias)) {
    throw new Error(LOCAL_CONFIG_ERROR)
  }

  return alias
}
