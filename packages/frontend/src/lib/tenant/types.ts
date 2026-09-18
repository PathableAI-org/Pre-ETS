export type HostSuffix = "localhost" | "pathable.com"

export type OidcClientAuth = "confidential" | "public"

export interface TenantConfig {
  readonly displayName: string
  readonly oidc: TenantOidcConfig
}

export type TenantMode = "host" | "static"

export interface TenantOidcConfig {
  readonly clientAuth: OidcClientAuth
  readonly clientId: string
  readonly connection?: string
  readonly issuer: string
}

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
  "Supply a valid TENANT_LOCAL_CONFIG_JSON record with slug, Display Name, and oidc, then restart."

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const ALLOWED_CONFIG_KEYS = new Set(["displayName", "oidc"])
const ALLOWED_OIDC_KEYS = new Set(["clientAuth", "clientId", "connection", "issuer"])
const CLIENT_AUTH_VALUES = new Set<OidcClientAuth>(["confidential", "public"])

export function isCanonicalTenantSlug(value: string): boolean {
  return value.length >= 1 && value.length <= 63 && value !== "www" && SLUG_PATTERN.test(value)
}

export function parseLocalConfigJson(raw: string | undefined): TenantRecord {
  if (raw === undefined || raw === "") {
    throw new Error(LOCAL_CONFIG_ERROR)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(LOCAL_CONFIG_ERROR)
  }

  const record = parseTenantRecord(parsed)
  if (record === undefined) {
    throw new Error(LOCAL_CONFIG_ERROR)
  }

  return record
}

export function parseTenantConfig(
  value: unknown,
  options: { readonly allowLoopbackHttp?: boolean } = {}
): TenantConfig | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }

  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => !ALLOWED_CONFIG_KEYS.has(key))) {
    return undefined
  }

  if (typeof record.displayName !== "string" || record.displayName.trim() === "") {
    return undefined
  }

  const oidc = parseTenantOidcConfig(record.oidc, options)
  if (oidc === undefined) {
    return undefined
  }

  return {
    displayName: record.displayName,
    oidc
  }
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

function allowLoopbackHttpDefault(): boolean {
  return process.env.NODE_ENV === "development"
}

function isAllowedIssuerProtocol(
  url: URL,
  options: { readonly allowLoopbackHttp?: boolean }
): boolean {
  const protocol = url.protocol.toLowerCase()
  const allowLoopbackHttp = options.allowLoopbackHttp ?? allowLoopbackHttpDefault()

  if (protocol === "https:") {
    return true
  }

  if (protocol === "http:") {
    return allowLoopbackHttp && isLoopbackHostname(url.hostname)
  }

  return false
}

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]"
}

function isValidIssuer(
  raw: string,
  options: { readonly allowLoopbackHttp?: boolean }
): boolean {
  const url = parseAbsoluteIssuerUrl(raw)
  if (url === undefined) {
    return false
  }

  return isAllowedIssuerProtocol(url, options)
}

function parseAbsoluteIssuerUrl(raw: string): undefined | URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return undefined
  }

  // Reject userinfo; relative/incomplete strings fail URL parsing above.
  if (url.username !== "" || url.password !== "") {
    return undefined
  }

  return url
}

function parseRequiredOidcFields(
  oidc: Record<string, unknown>,
  options: { readonly allowLoopbackHttp?: boolean }
): Omit<TenantOidcConfig, "connection"> | undefined {
  if (typeof oidc.issuer !== "string" || !isValidIssuer(oidc.issuer, options)) {
    return undefined
  }

  if (typeof oidc.clientId !== "string" || oidc.clientId.trim() === "") {
    return undefined
  }

  if (typeof oidc.clientAuth !== "string" || !CLIENT_AUTH_VALUES.has(oidc.clientAuth as OidcClientAuth)) {
    return undefined
  }

  return {
    clientAuth: oidc.clientAuth as OidcClientAuth,
    clientId: oidc.clientId,
    issuer: oidc.issuer
  }
}

function parseTenantOidcConfig(
  value: unknown,
  options: { readonly allowLoopbackHttp?: boolean }
): TenantOidcConfig | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }

  const oidc = value as Record<string, unknown>
  if (Object.keys(oidc).some((key) => !ALLOWED_OIDC_KEYS.has(key))) {
    return undefined
  }

  const required = parseRequiredOidcFields(oidc, options)
  if (required === undefined) {
    return undefined
  }

  if (!("connection" in oidc)) {
    return required
  }

  if (typeof oidc.connection !== "string" || oidc.connection.trim() === "") {
    return undefined
  }

  return {
    ...required,
    connection: oidc.connection
  }
}
