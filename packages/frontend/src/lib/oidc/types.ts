import { randomBytes } from "node:crypto"

import { parsePositiveSafeInteger, parseStoreTimeoutMs } from "../env/positive-int.ts"
import {
  DEFAULT_SESSION_STORE_TIMEOUT_MS,
  isSafeUnixSeconds,
  isSessionId,
  NODE_TIMER_MAX_MS,
  parseSigningSecret,
  SessionConfigError
} from "../session/types.ts"

export const OIDC_COOKIE_NAME = "pathable-oidc"
export const DEFAULT_OIDC_TX_KEY_PREFIX = "pre-ets:oidc-tx:"
export const DEFAULT_OIDC_TX_TTL_SECONDS = 600
export const OIDC_STATE_BYTE_LENGTH = 32
export const OIDC_STATE_LENGTH = 43

export interface OidcCorrelationClaims {
  readonly exp: number
  readonly state: string
  readonly tenant: string
}

export interface OidcTransactionRecord {
  readonly clientId: string
  readonly codeVerifier: string
  readonly connection?: string
  readonly expiresAt: number
  readonly issuer: string
  readonly nonce: string
  readonly redirectUri: string
  readonly sessionId: string
  readonly tenantId: string
}

export interface OidcTxConfig {
  readonly keyPrefix: string
  readonly signingSecret: Uint8Array
  readonly storeTimeoutMs: number
  readonly ttlSeconds: number
}

export class OidcTxConfigError extends Error {
  override readonly name = "OidcTxConfigError"
}

const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/
const ALLOWED_TX_KEYS = new Set([
  "clientId",
  "codeVerifier",
  "connection",
  "expiresAt",
  "issuer",
  "nonce",
  "redirectUri",
  "sessionId",
  "tenantId"
])
const ALLOWED_CLAIM_KEYS = new Set(["exp", "state", "tenant"])

let cachedConfig: OidcTxConfig | undefined
let cachedConfigError: OidcTxConfigError | undefined

export function absoluteOidcExpirySeconds(nowSeconds: number, ttlSeconds: number): number {
  if (!isSafeUnixSeconds(nowSeconds) || !Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new OidcTxConfigError("Invalid OIDC transaction lifetime.")
  }

  const expiresAt = nowSeconds + ttlSeconds
  if (!isSafeUnixSeconds(expiresAt) || expiresAt <= nowSeconds) {
    throw new OidcTxConfigError("OIDC transaction expiry is not representable.")
  }

  return expiresAt
}

export function generateOidcState(random: () => Uint8Array = defaultRandom): string {
  const bytes = random()
  if (bytes.byteLength !== OIDC_STATE_BYTE_LENGTH) {
    throw new Error("OIDC state entropy must be exactly 32 bytes.")
  }

  return Buffer.from(bytes).toString("base64url")
}

export function getOidcTxConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  options: { readonly forceReload?: boolean } = {}
): OidcTxConfig {
  if (options.forceReload === true) {
    cachedConfig = undefined
    cachedConfigError = undefined
  }

  if (cachedConfig !== undefined) {
    return cachedConfig
  }

  if (cachedConfigError !== undefined) {
    throw cachedConfigError
  }

  try {
    cachedConfig = parseOidcTxConfig(env)
    return cachedConfig
  } catch (error) {
    const configError = error instanceof OidcTxConfigError
      ? error
      : new OidcTxConfigError("Invalid OIDC transaction configuration.")
    cachedConfigError = configError
    throw configError
  }
}

export function isOidcState(value: string): boolean {
  return STATE_PATTERN.test(value)
}

export function oidcCookieAttributes(expiresAt: number, secure: boolean): {
  readonly expires: Date
  readonly httpOnly: true
  readonly path: "/"
  readonly sameSite: "lax"
  readonly secure: boolean
} {
  return {
    expires: new Date(expiresAt * 1000),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure
  }
}

export function parseOidcCorrelationClaims(value: unknown): OidcCorrelationClaims | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }

  const claims = value as Record<string, unknown>
  if (Object.keys(claims).some((key) => !ALLOWED_CLAIM_KEYS.has(key))) {
    return undefined
  }

  if (typeof claims.state !== "string" || claims.state.trim() === "") {
    return undefined
  }

  if (typeof claims.tenant !== "string" || claims.tenant.trim() === "") {
    return undefined
  }

  if (!isSafeUnixSeconds(claims.exp)) {
    return undefined
  }

  return {
    exp: claims.exp,
    state: claims.state,
    tenant: claims.tenant
  }
}

const REQUIRED_TX_STRING_KEYS = [
  "clientId",
  "codeVerifier",
  "issuer",
  "nonce",
  "redirectUri",
  "tenantId"
] as const

export function parseOidcTransactionRecord(value: unknown): OidcTransactionRecord | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }

  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => !ALLOWED_TX_KEYS.has(key))) {
    return undefined
  }

  const strings = readRequiredNonemptyStrings(record, REQUIRED_TX_STRING_KEYS)
  if (strings === undefined) {
    return undefined
  }

  if (typeof record.sessionId !== "string" || !isSessionId(record.sessionId)) {
    return undefined
  }

  if (!isSafeUnixSeconds(record.expiresAt)) {
    return undefined
  }

  const base: OidcTransactionRecord = {
    clientId: strings.clientId,
    codeVerifier: strings.codeVerifier,
    expiresAt: record.expiresAt,
    issuer: strings.issuer,
    nonce: strings.nonce,
    redirectUri: strings.redirectUri,
    sessionId: record.sessionId,
    tenantId: strings.tenantId
  }

  if (!("connection" in record)) {
    return base
  }

  if (typeof record.connection !== "string" || record.connection.trim() === "") {
    return undefined
  }

  return {
    ...base,
    connection: record.connection
  }
}

export function resetOidcTxConfigCacheForTests(): void {
  cachedConfig = undefined
  cachedConfigError = undefined
}

export function serializeOidcTransactionRecord(record: OidcTransactionRecord): string {
  if (record.connection === undefined) {
    return JSON.stringify({
      clientId: record.clientId,
      codeVerifier: record.codeVerifier,
      expiresAt: record.expiresAt,
      issuer: record.issuer,
      nonce: record.nonce,
      redirectUri: record.redirectUri,
      sessionId: record.sessionId,
      tenantId: record.tenantId
    })
  }

  return JSON.stringify({
    clientId: record.clientId,
    codeVerifier: record.codeVerifier,
    connection: record.connection,
    expiresAt: record.expiresAt,
    issuer: record.issuer,
    nonce: record.nonce,
    redirectUri: record.redirectUri,
    sessionId: record.sessionId,
    tenantId: record.tenantId
  })
}

function defaultRandom(): Uint8Array {
  return randomBytes(OIDC_STATE_BYTE_LENGTH)
}

function parseOidcTxConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): OidcTxConfig {
  const signingSecretRaw = env.OIDC_TX_SIGNING_SECRET !== undefined && env.OIDC_TX_SIGNING_SECRET !== ""
    ? env.OIDC_TX_SIGNING_SECRET
    : env.SESSION_SIGNING_SECRET

  if (signingSecretRaw === undefined || signingSecretRaw.trim() === "") {
    throw new OidcTxConfigError("OIDC_TX_SIGNING_SECRET or SESSION_SIGNING_SECRET is required.")
  }

  let signingSecret: Uint8Array
  try {
    signingSecret = parseSigningSecret(signingSecretRaw)
  } catch (error) {
    if (error instanceof SessionConfigError) {
      throw new OidcTxConfigError(error.message)
    }

    throw new OidcTxConfigError("Invalid OIDC transaction signing secret.")
  }

  const createError = (message: string): Error => new OidcTxConfigError(message)
  const ttlSeconds = parsePositiveSafeInteger(
    env.OIDC_TX_TTL_SECONDS,
    DEFAULT_OIDC_TX_TTL_SECONDS,
    "OIDC_TX_TTL_SECONDS",
    createError
  )
  const storeTimeoutMs = parseStoreTimeoutMs(
    env.SESSION_STORE_TIMEOUT_MS,
    DEFAULT_SESSION_STORE_TIMEOUT_MS,
    NODE_TIMER_MAX_MS,
    createError
  )
  const keyPrefix = env.OIDC_TX_KEY_PREFIX === undefined || env.OIDC_TX_KEY_PREFIX === ""
    ? DEFAULT_OIDC_TX_KEY_PREFIX
    : env.OIDC_TX_KEY_PREFIX

  return {
    keyPrefix,
    signingSecret,
    storeTimeoutMs,
    ttlSeconds
  }
}

function readRequiredNonemptyStrings<const Keys extends readonly string[]>(
  record: Record<string, unknown>,
  keys: Keys
): Readonly<Record<Keys[number], string>> | undefined {
  const result: Record<string, string> = {}
  for (const key of keys) {
    const value = record[key]
    if (typeof value !== "string" || value.trim() === "") {
      return undefined
    }

    result[key] = value
  }

  return result as Readonly<Record<Keys[number], string>>
}

// Re-export helper used by cookie module tests via types surface when needed.
export { isSafeUnixSeconds }
