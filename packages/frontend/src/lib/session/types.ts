import { randomBytes } from "node:crypto"

import { parsePositiveSafeInteger, parseStoreTimeoutMs } from "../env/positive-int.ts"

export const SESSION_COOKIE_NAME = "pathable-session"
export const DEFAULT_SESSION_KEY_PREFIX = "pre-ets:session:"
export const DEFAULT_SESSION_TTL_SECONDS = 86_400
export const DEFAULT_SESSION_STORE_TIMEOUT_MS = 2_000
export const SESSION_ID_BYTE_LENGTH = 32
export const SESSION_ID_LENGTH = 43
export const NODE_TIMER_MAX_MS = 2_147_483_647
export const SESSION_CONTEXT_HEADER = "x-pathable-session-context"
export const TENANT_SLUG_HEADER = "x-preets-tenant-slug"
export const TENANT_ORIGIN_HEADER = "x-preets-tenant-origin"

export interface SessionConfig {
  readonly keyPrefix: string
  readonly redisUrl: string
  readonly signingSecret: Uint8Array
  readonly storeTimeoutMs: number
  readonly ttlSeconds: number
}

export interface SessionContext {
  readonly expiresAt: number
  readonly sessionId: string
  readonly tenantId: string
  readonly userId?: string
  readonly userName?: string
}

export interface SessionCookieClaims {
  readonly exp: number
  readonly sid: string
  readonly tenant: string
}

export type SessionOutcomeClass = "403" | "500" | "503" | "create" | "reuse"

export interface SessionRecord {
  readonly expiresAt: number
  readonly tenantId: string
  readonly userId?: string
  readonly userName?: string
}

export type TenantOrigin = "host-associated" | "local-static"

export class SessionConfigError extends Error {
  override readonly name = "SessionConfigError"
}

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/
const BASE64URL_SECRET_PATTERN = /^[A-Za-z0-9_-]+$/

let cachedConfig: SessionConfig | undefined
let cachedConfigError: SessionConfigError | undefined

type OptionalAuthPair =
  | {
    readonly kind: "absent"
  }
  | {
    readonly kind: "present"
    readonly userId: string
    readonly userName: string
  }

export function absoluteExpirySeconds(nowSeconds: number, ttlSeconds: number): number {
  if (!isSafeUnixSeconds(nowSeconds) || !Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new SessionConfigError("Invalid session lifetime.")
  }

  const expiresAt = nowSeconds + ttlSeconds
  if (!isDateRepresentableUnixSeconds(expiresAt) || expiresAt <= nowSeconds) {
    throw new SessionConfigError("Session expiry is not representable.")
  }

  return expiresAt
}

export function cookieAttributes(expiresAt: number, secure: boolean): {
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

export function generateSessionId(random: () => Uint8Array = defaultRandom): string {
  const bytes = random()
  if (bytes.byteLength !== SESSION_ID_BYTE_LENGTH) {
    throw new Error("Session id entropy must be exactly 32 bytes.")
  }

  return Buffer.from(bytes).toString("base64url")
}

export function getSessionConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  options: { readonly forceReload?: boolean } = {}
): SessionConfig {
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
    cachedConfig = parseSessionConfig(env)
    return cachedConfig
  } catch (error) {
    const configError = error instanceof SessionConfigError
      ? error
      : new SessionConfigError("Invalid session configuration.")
    cachedConfigError = configError
    throw configError
  }
}

export function isSafeUnixSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

export function isSessionId(value: string): boolean {
  return SESSION_ID_PATTERN.test(value)
}

export function parseSessionConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): SessionConfig {
  const redisUrl = requireNonEmpty(env.REDIS_URL, "REDIS_URL")
  assertRedisUrl(redisUrl)

  const signingSecret = parseSigningSecret(requireNonEmpty(env.SESSION_SIGNING_SECRET, "SESSION_SIGNING_SECRET"))
  const createError = (message: string): Error => new SessionConfigError(message)
  const ttlSeconds = parsePositiveSafeInteger(
    env.SESSION_TTL_SECONDS,
    DEFAULT_SESSION_TTL_SECONDS,
    "SESSION_TTL_SECONDS",
    createError
  )
  const storeTimeoutMs = parseStoreTimeoutMs(
    env.SESSION_STORE_TIMEOUT_MS,
    DEFAULT_SESSION_STORE_TIMEOUT_MS,
    NODE_TIMER_MAX_MS,
    createError
  )
  const keyPrefix = env.SESSION_KEY_PREFIX === undefined || env.SESSION_KEY_PREFIX === ""
    ? DEFAULT_SESSION_KEY_PREFIX
    : env.SESSION_KEY_PREFIX

  return {
    keyPrefix,
    redisUrl,
    signingSecret,
    storeTimeoutMs,
    ttlSeconds
  }
}

export function parseSessionContextJson(raw: string): SessionContext | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }

  const value = asPlainObject(parsed)
  if (value === undefined) {
    return undefined
  }

  const auth = parseOptionalAuthPair(value)
  if (auth === undefined) {
    return undefined
  }

  const expectedKeys = auth.kind === "present" ? 5 : 3
  if (Object.keys(value).length !== expectedKeys) {
    return undefined
  }

  if (typeof value.sessionId !== "string" || !isSessionId(value.sessionId)) {
    return undefined
  }

  const tenantId = nonEmptyString(value.tenantId)
  if (tenantId === undefined) {
    return undefined
  }

  if (!isSafeUnixSeconds(value.expiresAt)) {
    return undefined
  }

  if (auth.kind === "absent") {
    return {
      expiresAt: value.expiresAt,
      sessionId: value.sessionId,
      tenantId
    }
  }

  return {
    expiresAt: value.expiresAt,
    sessionId: value.sessionId,
    tenantId,
    userId: auth.userId,
    userName: auth.userName
  }
}

export function parseSessionRecord(value: unknown): SessionRecord | undefined {
  const record = asPlainObject(value)
  if (record === undefined) {
    return undefined
  }

  const auth = parseOptionalAuthPair(record)
  if (auth === undefined) {
    return undefined
  }

  const expectedKeys = auth.kind === "present" ? 4 : 2
  if (
    Object.keys(record).length !== expectedKeys
    || !("tenantId" in record)
    || !("expiresAt" in record)
  ) {
    return undefined
  }

  const tenantId = nonEmptyString(record.tenantId)
  if (tenantId === undefined) {
    return undefined
  }

  if (!isSafeUnixSeconds(record.expiresAt) || !isDateRepresentableUnixSeconds(record.expiresAt)) {
    return undefined
  }

  if (auth.kind === "absent") {
    return {
      expiresAt: record.expiresAt,
      tenantId
    }
  }

  return {
    expiresAt: record.expiresAt,
    tenantId,
    userId: auth.userId,
    userName: auth.userName
  }
}

export function parseSigningSecret(raw: string): Uint8Array {
  if (!BASE64URL_SECRET_PATTERN.test(raw)) {
    throw new SessionConfigError("SESSION_SIGNING_SECRET must be base64url.")
  }

  let bytes: Buffer
  try {
    bytes = Buffer.from(raw, "base64url")
  } catch {
    throw new SessionConfigError("SESSION_SIGNING_SECRET must be base64url.")
  }

  if (bytes.byteLength < SESSION_ID_BYTE_LENGTH) {
    throw new SessionConfigError("SESSION_SIGNING_SECRET must encode at least 32 bytes.")
  }

  return new Uint8Array(bytes)
}

export function resetSessionConfigCacheForTests(): void {
  cachedConfig = undefined
  cachedConfigError = undefined
}

export function serializeSessionContext(context: SessionContext): string {
  if (context.userId !== undefined && context.userName !== undefined) {
    return JSON.stringify({
      expiresAt: context.expiresAt,
      sessionId: context.sessionId,
      tenantId: context.tenantId,
      userId: context.userId,
      userName: context.userName
    })
  }

  return JSON.stringify({
    expiresAt: context.expiresAt,
    sessionId: context.sessionId,
    tenantId: context.tenantId
  })
}

export function serializeSessionRecord(record: SessionRecord): string {
  if (record.userId !== undefined && record.userName !== undefined) {
    return JSON.stringify({
      expiresAt: record.expiresAt,
      tenantId: record.tenantId,
      userId: record.userId,
      userName: record.userName
    })
  }

  return JSON.stringify({ expiresAt: record.expiresAt, tenantId: record.tenantId })
}

/** Build request-forwarded session context from a store record. */
export function sessionContextFromRecord(
  sessionId: string,
  record: SessionRecord
): SessionContext {
  if (record.userId !== undefined && record.userName !== undefined) {
    return {
      expiresAt: record.expiresAt,
      sessionId,
      tenantId: record.tenantId,
      userId: record.userId,
      userName: record.userName
    }
  }

  return {
    expiresAt: record.expiresAt,
    sessionId,
    tenantId: record.tenantId
  }
}

function asPlainObject(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }

  return value as Record<string, unknown>
}

function assertRedisUrl(raw: string): void {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new SessionConfigError("REDIS_URL is invalid.")
  }

  const protocol = url.protocol.toLowerCase()
  const host = url.hostname.toLowerCase()
  const loopback = host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]"

  if (protocol === "redis:") {
    if (!loopback) {
      throw new SessionConfigError("Cleartext REDIS_URL is only allowed for loopback.")
    }

    return
  }

  if (protocol === "rediss:") {
    if (!hasRedisAuth(url)) {
      throw new SessionConfigError("Non-local REDIS_URL requires TLS and authentication.")
    }

    return
  }

  throw new SessionConfigError("REDIS_URL protocol is unsupported.")
}

function defaultRandom(): Uint8Array {
  return randomBytes(SESSION_ID_BYTE_LENGTH)
}

function hasRedisAuth(url: URL): boolean {
  return url.password !== ""
}

function isDateRepresentableUnixSeconds(value: number): boolean {
  if (!Number.isSafeInteger(value) || value <= 0) {
    return false
  }

  const millis = value * 1000
  if (!Number.isSafeInteger(millis)) {
    return false
  }

  const date = new Date(millis)
  return !Number.isNaN(date.getTime()) && Math.floor(date.getTime() / 1000) === value
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined
  }

  return value
}

/** Both userId/userName present and nonempty, or neither (reject half-auth). */
function parseOptionalAuthPair(record: Record<string, unknown>): OptionalAuthPair | undefined {
  const hasUserId = "userId" in record
  const hasUserName = "userName" in record
  if (!hasUserId && !hasUserName) {
    return { kind: "absent" }
  }

  if (!hasUserId || !hasUserName) {
    return undefined
  }

  const userId = nonEmptyString(record.userId)
  const userName = nonEmptyString(record.userName)
  if (userId === undefined || userName === undefined) {
    return undefined
  }

  return { kind: "present", userId, userName }
}

function requireNonEmpty(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === "") {
    throw new SessionConfigError(`${name} is required.`)
  }

  return value
}
