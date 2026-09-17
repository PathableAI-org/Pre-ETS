import { randomBytes } from "node:crypto"

export const SESSION_COOKIE_NAME = "pathable-session"
export const DEFAULT_SESSION_KEY_PREFIX = "pre-ets:session:"
export const DEFAULT_SESSION_TTL_SECONDS = 86_400
export const DEFAULT_SESSION_STORE_TIMEOUT_MS = 2_000
export const SESSION_ID_BYTE_LENGTH = 32
export const SESSION_ID_LENGTH = 43
export const NODE_TIMER_MAX_MS = 2_147_483_647
export const SESSION_CONTEXT_HEADER = "x-pathable-session-context"
export const SESSION_END_GENERATION_HEADER = "x-pathable-session-end-generation"
export const TENANT_SLUG_HEADER = "x-preets-tenant-slug"
export const TENANT_ORIGIN_HEADER = "x-preets-tenant-origin"

export type AccessEndedCause = "inactivity"

/** Dual-read parse result; `legacyAuthenticated` is true for four-key authenticated JSON. */
export interface ParsedSessionRecord {
  readonly legacyAuthenticated: boolean
  readonly record: SessionRecord
}

export interface SessionConfig {
  readonly keyPrefix: string
  readonly redisUrl: string
  readonly signingSecret: Uint8Array
  readonly storeTimeoutMs: number
  readonly ttlSeconds: number
}

export interface SessionContext {
  readonly expiresAt: number
  /** Required when authenticated; idle half of deadline-aligned revalidation. */
  readonly idleExpiresAt?: number
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
  /** Anonymous only: set after confirmed idle clearance. */
  readonly accessEndedCause?: AccessEndedCause
  readonly expiresAt: number
  /** Fixed at authentication from tenant effective policy; integer 5–30. */
  readonly idleDurationMinutes?: number
  readonly idleExpiresAt?: number
  readonly lastActivityAt?: number
  /** Anonymous only: monotonic latch for this session end. */
  readonly sessionEndGeneration?: number
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
  const ttlSeconds = parsePositiveSafeInteger(
    env.SESSION_TTL_SECONDS,
    DEFAULT_SESSION_TTL_SECONDS,
    "SESSION_TTL_SECONDS"
  )
  const storeTimeoutMs = parseStoreTimeoutMs(env.SESSION_STORE_TIMEOUT_MS)
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

const MIN_IDLE_DURATION_MINUTES = 5
const MAX_IDLE_DURATION_MINUTES = 30

// fallow-ignore-next-line complexity -- exact-shape context parser; optional auth fields
export function parseSessionContextJson(raw: string): SessionContext | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined
  }

  const value = parsed as Record<string, unknown>
  const keys = Object.keys(value)
  const hasAuth = "userId" in value || "userName" in value
  if (hasAuth) {
    // Authenticated: sessionId, tenantId, expiresAt, userId, userName, idleExpiresAt
    if (keys.length !== 6) {
      return undefined
    }
  } else if (keys.length !== 3) {
    return undefined
  }

  if (typeof value.sessionId !== "string" || !isSessionId(value.sessionId)) {
    return undefined
  }

  if (typeof value.tenantId !== "string" || value.tenantId.trim() === "") {
    return undefined
  }

  if (!isSafeUnixSeconds(value.expiresAt)) {
    return undefined
  }

  if (!hasAuth) {
    return {
      expiresAt: value.expiresAt,
      sessionId: value.sessionId,
      tenantId: value.tenantId
    }
  }

  if (typeof value.userId !== "string" || value.userId.trim() === "") {
    return undefined
  }

  if (typeof value.userName !== "string" || value.userName.trim() === "") {
    return undefined
  }

  if (!isSafeUnixSeconds(value.idleExpiresAt)) {
    return undefined
  }

  return {
    expiresAt: value.expiresAt,
    idleExpiresAt: value.idleExpiresAt,
    sessionId: value.sessionId,
    tenantId: value.tenantId,
    userId: value.userId,
    userName: value.userName
  }
}

/** Parse a session record, stripping the dual-read discriminant. */
export function parseSessionRecord(value: unknown): SessionRecord | undefined {
  return parseSessionRecordDetailed(value)?.record
}

/**
 * Dual-read authenticated + anonymous session record parser.
 * Legacy four-key authenticated JSON yields `legacyAuthenticated: true`.
 */
// fallow-ignore-next-line complexity -- exact-shape record parser; dual-read + optional cause/latch
export function parseSessionRecordDetailed(value: unknown): ParsedSessionRecord | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }

  const raw = value as Record<string, unknown>
  const keys = Object.keys(raw)
  if (!("tenantId" in raw) || !("expiresAt" in raw)) {
    return undefined
  }

  if (typeof raw.tenantId !== "string" || raw.tenantId.trim() === "") {
    return undefined
  }

  if (!isSafeUnixSeconds(raw.expiresAt) || !isDateRepresentableUnixSeconds(raw.expiresAt)) {
    return undefined
  }

  const hasAuth = "userId" in raw || "userName" in raw
  if (hasAuth) {
    return parseAuthenticatedSessionRecord(raw, keys)
  }

  return parseAnonymousSessionRecord(raw, keys)
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
    if (context.idleExpiresAt !== undefined) {
      return JSON.stringify({
        expiresAt: context.expiresAt,
        idleExpiresAt: context.idleExpiresAt,
        sessionId: context.sessionId,
        tenantId: context.tenantId,
        userId: context.userId,
        userName: context.userName
      })
    }

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
    if (
      record.idleDurationMinutes !== undefined
      && record.lastActivityAt !== undefined
      && record.idleExpiresAt !== undefined
    ) {
      return JSON.stringify({
        expiresAt: record.expiresAt,
        idleDurationMinutes: record.idleDurationMinutes,
        idleExpiresAt: record.idleExpiresAt,
        lastActivityAt: record.lastActivityAt,
        tenantId: record.tenantId,
        userId: record.userId,
        userName: record.userName
      })
    }

    return JSON.stringify({
      expiresAt: record.expiresAt,
      tenantId: record.tenantId,
      userId: record.userId,
      userName: record.userName
    })
  }

  const anonymous: {
    accessEndedCause?: AccessEndedCause
    expiresAt: number
    sessionEndGeneration?: number
    tenantId: string
  } = {
    expiresAt: record.expiresAt,
    tenantId: record.tenantId
  }
  if (record.accessEndedCause !== undefined) {
    anonymous.accessEndedCause = record.accessEndedCause
  }
  if (record.sessionEndGeneration !== undefined) {
    anonymous.sessionEndGeneration = record.sessionEndGeneration
  }

  return JSON.stringify(anonymous)
}

/** Build request-forwarded session context from a store record. */
export function sessionContextFromRecord(
  sessionId: string,
  record: SessionRecord
): SessionContext {
  if (record.userId !== undefined && record.userName !== undefined) {
    const context: {
      expiresAt: number
      idleExpiresAt?: number
      sessionId: string
      tenantId: string
      userId: string
      userName: string
    } = {
      expiresAt: record.expiresAt,
      sessionId,
      tenantId: record.tenantId,
      userId: record.userId,
      userName: record.userName
    }
    if (record.idleExpiresAt !== undefined) {
      context.idleExpiresAt = record.idleExpiresAt
    }
    return context
  }

  return {
    expiresAt: record.expiresAt,
    sessionId,
    tenantId: record.tenantId
  }
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

function isAccessEndedCause(value: unknown): value is AccessEndedCause {
  return value === "inactivity"
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

function isIdleDurationMinutes(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= MIN_IDLE_DURATION_MINUTES
    && value <= MAX_IDLE_DURATION_MINUTES
}

function isSessionEndGeneration(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

// fallow-ignore-next-line complexity -- anonymous allowlist: base, +cause, +latch, or both
function parseAnonymousSessionRecord(
  raw: Record<string, unknown>,
  keys: readonly string[]
): ParsedSessionRecord | undefined {
  if (keys.length < 2 || keys.length > 4) {
    return undefined
  }

  const hasCause = "accessEndedCause" in raw
  const hasGeneration = "sessionEndGeneration" in raw
  const expectedLength = 2 + (hasCause ? 1 : 0) + (hasGeneration ? 1 : 0)
  if (keys.length !== expectedLength) {
    return undefined
  }

  const record: {
    accessEndedCause?: AccessEndedCause
    expiresAt: number
    sessionEndGeneration?: number
    tenantId: string
  } = {
    expiresAt: raw.expiresAt as number,
    tenantId: raw.tenantId as string
  }

  if (hasCause) {
    if (!isAccessEndedCause(raw.accessEndedCause)) {
      return undefined
    }
    record.accessEndedCause = raw.accessEndedCause
  }

  if (hasGeneration) {
    if (!isSessionEndGeneration(raw.sessionEndGeneration)) {
      return undefined
    }
    record.sessionEndGeneration = raw.sessionEndGeneration
  }

  return { legacyAuthenticated: false, record }
}

// fallow-ignore-next-line complexity -- exact-shape auth parser; legacy + idle field allowlists
function parseAuthenticatedSessionRecord(
  raw: Record<string, unknown>,
  keys: readonly string[]
): ParsedSessionRecord | undefined {
  if (typeof raw.userId !== "string" || raw.userId.trim() === "") {
    return undefined
  }

  if (typeof raw.userName !== "string" || raw.userName.trim() === "") {
    return undefined
  }

  // Legacy four-key authenticated (pre-idle)
  if (keys.length === 4) {
    return {
      legacyAuthenticated: true,
      record: {
        expiresAt: raw.expiresAt as number,
        tenantId: raw.tenantId as string,
        userId: raw.userId,
        userName: raw.userName
      }
    }
  }

  // Idle-shaped: tenantId, expiresAt, userId, userName, idleDurationMinutes, lastActivityAt, idleExpiresAt
  if (keys.length !== 7) {
    return undefined
  }

  if (
    !("idleDurationMinutes" in raw)
    || !("lastActivityAt" in raw)
    || !("idleExpiresAt" in raw)
  ) {
    return undefined
  }

  if (!isIdleDurationMinutes(raw.idleDurationMinutes)) {
    return undefined
  }

  if (!isSafeUnixSeconds(raw.lastActivityAt) || !isDateRepresentableUnixSeconds(raw.lastActivityAt)) {
    return undefined
  }

  if (!isSafeUnixSeconds(raw.idleExpiresAt) || !isDateRepresentableUnixSeconds(raw.idleExpiresAt)) {
    return undefined
  }

  return {
    legacyAuthenticated: false,
    record: {
      expiresAt: raw.expiresAt as number,
      idleDurationMinutes: raw.idleDurationMinutes,
      idleExpiresAt: raw.idleExpiresAt,
      lastActivityAt: raw.lastActivityAt,
      tenantId: raw.tenantId as string,
      userId: raw.userId,
      userName: raw.userName
    }
  }
}

function parsePositiveSafeInteger(
  raw: string | undefined,
  fallback: number,
  name: string
): number {
  if (raw === undefined || raw === "") {
    return fallback
  }

  if (!/^[1-9]\d*$/.test(raw)) {
    throw new SessionConfigError(`${name} must be a positive integer.`)
  }

  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new SessionConfigError(`${name} must be a positive safe integer.`)
  }

  return value
}

function parseStoreTimeoutMs(raw: string | undefined): number {
  const value = parsePositiveSafeInteger(raw, DEFAULT_SESSION_STORE_TIMEOUT_MS, "SESSION_STORE_TIMEOUT_MS")
  if (value > NODE_TIMER_MAX_MS) {
    throw new SessionConfigError("SESSION_STORE_TIMEOUT_MS exceeds the Node timer-safe range.")
  }

  return value
}

function requireNonEmpty(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === "") {
    throw new SessionConfigError(`${name} is required.`)
  }

  return value
}
