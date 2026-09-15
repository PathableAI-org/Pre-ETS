import assert from "node:assert/strict"
import { execFile as execFileCallback } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import type { HttpExchange, TenantWorld } from "./world.ts"

import { signSessionCookie, verifySessionCookie } from "../../../packages/frontend/src/lib/session/cookie.ts"
import { setupSession, toTenantResolveResult } from "../../../packages/frontend/src/lib/session/setup.ts"
import {
  RedisSessionStore,
  type SessionStore,
  SessionStoreError
} from "../../../packages/frontend/src/lib/session/store.ts"
import {
  generateSessionId,
  parseSessionConfig,
  resetSessionConfigCacheForTests,
  serializeSessionRecord,
  SESSION_COOKIE_NAME,
  type SessionConfig,
  type SessionRecord
} from "../../../packages/frontend/src/lib/session/types.ts"
import { createTenantOperations } from "../../../packages/frontend/src/lib/tenant/operations.ts"
import { assertDisplayedName, assertForbiddenPage, upsertTenant } from "./actions.ts"
import { sendRawGet } from "./raw-http.ts"
import { ensureBrowser, ensureOwnedProcess, restartOwnedProcess } from "./server.ts"
import { createRedisClient, decodeJwt, jwtVerify } from "./session-deps.ts"
import { ensureSessionSettings } from "./session-env.ts"
const execFile = promisify(execFileCallback)
const REPO_ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)))
const COMPOSE_FILE = path.join(REPO_ROOT, "compose.yaml")
const CLOSED_REDIS_URL = "redis://127.0.0.1:6399"
const SEED_PAGE_HTML = [
  "<!DOCTYPE html><html><head>",
  "<link rel=\"stylesheet\" href=\"/_next/static/css/app.css\"/>",
  "</head><body>",
  "<script src=\"/_next/static/chunks/webpack.js\"></script>",
  "</body></html>"
].join("")

interface HttpSessionSnapshot {
  readonly sessionCookieJar: Map<string, string> | undefined
  readonly sessionExpiresAtSeconds: number | undefined
  readonly sessionId: string | undefined
  readonly sessionTenantId: string | undefined
}

interface ParsedUrl {
  readonly host: string
  readonly path: string
  readonly port: number
}

interface TracingStore extends SessionStore {
  readonly events: string[]
}

export async function applySessionReferenceCondition(world: TenantWorld, condition: string): Promise<void> {
  const config = sessionConfig(world)
  const store = new RedisSessionStore(config)
  const now = nowSeconds(world)
  const tenantId = "springfield"
  const sessionId = generateSessionId()
  world.sessionId = sessionId
  world.sessionTenantId = tenantId

  switch (condition) {
    case "evicted record with valid cookie": {
      const expiresAt = now + 3600
      const token = await signSessionCookie({ exp: expiresAt, sid: sessionId, tenant: tenantId }, config)
      setCookie(world, hostForTenant(world, tenantId), token)
      return
    }
    case "expired cookie": {
      const token = await signSessionCookie({ exp: now - 60, sid: sessionId, tenant: tenantId }, config)
      setCookie(world, hostForTenant(world, tenantId), token)
      return
    }
    case "expired record with valid cookie": {
      const expiresAt = now - 1
      await store.create(sessionId, { expiresAt, tenantId })
      trackSessionId(world, sessionId)
      const token = await signSessionCookie({ exp: now + 3600, sid: sessionId, tenant: tenantId }, config)
      setCookie(world, hostForTenant(world, tenantId), token)
      world.previousSessionRecord = { expiresAt, tenantId }
      return
    }
    case "malformed cookie": {
      clearCookies(world)
      setCookie(world, hostForTenant(world, tenantId), "not-a-jwt")
      return
    }
    case "malformed stored record": {
      await seedSignedRawRecord(world, config, sessionId, tenantId, now + 3600, "{not-json")
      return
    }
    case "missing cookie": {
      clearCookies(world)
      return
    }
    case "record missing tenant binding": {
      await seedSignedRawRecord(
        world,
        config,
        sessionId,
        tenantId,
        now + 3600,
        JSON.stringify({ expiresAt: now + 3600 })
      )
      return
    }
    case "tampered signature": {
      const token = await signSessionCookie({ exp: now + 3600, sid: sessionId, tenant: tenantId }, config)
      setCookie(world, hostForTenant(world, tenantId), `${token}x`)
      return
    }
    case "unknown session id": {
      const token = await signSessionCookie({ exp: now + 3600, sid: sessionId, tenant: tenantId }, config)
      setCookie(world, hostForTenant(world, tenantId), token)
      return
    }
    default: {
      throw new Error(`Unknown session reference condition: ${condition}`)
    }
  }
}

export async function assertCookieAndRecordExpireAt(world: TenantWorld, iso: string): Promise<void> {
  const expected = parseIsoSeconds(iso)
  if (world.sessionContract?.result.kind === "ready") {
    assert.equal(world.sessionContract.result.context.expiresAt, expected)
  } else {
    assert.equal(world.sessionExpiresAtSeconds, expected)
  }

  const token = latestSessionCookie(world)
    ?? (world.sessionContract?.result.kind === "ready" ? world.sessionContract.result.cookieValue : undefined)
  assert.ok(token, "expected a session cookie token from contract or HTTP")
  const decoded = decodeJwt(token)
  assert.equal(decoded.exp, expected)
  const sessionId = world.sessionContract?.result.kind === "ready"
    ? world.sessionContract.result.context.sessionId
    : world.sessionId
  assert.ok(sessionId)
  const record = await readStoredRecord(world, sessionId)
  assert.ok(record)
  assert.equal(record.expiresAt, expected)
}

export function assertFreshSpringfieldSession(world: TenantWorld): void {
  assert.ok(world.sessionId)
  assert.ok(world.originalSessionId)
  assert.notEqual(world.sessionId, world.originalSessionId, "expected a fresh session id after expiry")
  assert.equal(world.sessionTenantId, "springfield")
  if (world.sessionContract?.result.kind === "ready") {
    assert.equal(world.sessionContract.result.outcome, "create")
  }
}

export function assertNoSessionCookieIssued(world: TenantWorld): void {
  const setCookies = collectSetCookies(world.httpResponse?.headers ?? {})
  assert.equal(setCookies.some((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`)), false)
}

export function assertOriginalSessionRetained(world: TenantWorld): void {
  assert.ok(world.sessionId)
  assert.ok(world.originalSessionId)
  assert.equal(world.sessionId, world.originalSessionId)
  assert.equal(world.sessionTenantId, world.originalSessionTenantId)
}

export function assertSessionAccessDenied(world: TenantWorld): void {
  assert.ok(world.httpResponse)
  assertForbiddenPage(world.httpResponse)
}

export function assertSessionCookieAttributes(world: TenantWorld, secure: boolean): void {
  const setCookies = collectSetCookies(world.httpResponse?.headers ?? {})
  const cookieLine = setCookies.find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`))
  assert.ok(cookieLine)
  assert.match(cookieLine, /HttpOnly/i)
  assert.match(cookieLine, /Path=\//i)
  assert.doesNotMatch(cookieLine, /Domain=/i)
  if (secure) {
    assert.match(cookieLine, /Secure/i)
  } else {
    assert.doesNotMatch(cookieLine, /Secure/i)
  }
}

export function assertSessionPersistedBeforeCookie(world: TenantWorld, tenantId?: string): void {
  if (tenantId !== undefined) {
    assert.equal(world.sessionTenantId, tenantId)
  }

  const events = world.sessionContract?.events ?? []
  assert.ok(events.includes("store.create"))
  assert.ok(events.includes("signCookie"))
  assert.ok(world.sessionContract)
  assert.equal(world.sessionContract.result.kind, "ready")
  assert.equal(world.sessionContract.result.outcome, "create")
  // setupSession signs before persisting, but a ready create outcome is only returned after store.create succeeds.
  assert.notEqual(world.sessionContract.result.cookieValue, undefined)
}

export function assertSessionServiceFailure(world: TenantWorld): void {
  assert.ok(world.httpResponse)
  assert.equal(world.httpResponse.status, 503)
  assert.match(world.httpResponse.body, /Service unavailable\./)
}

export async function assertSignedClaimsMinimal(world: TenantWorld): Promise<void> {
  const token = latestSessionCookie(world)
  assert.ok(token)
  const config = sessionConfig(world)
  const { payload, protectedHeader } = await jwtVerify(token, config.signingSecret, {
    algorithms: ["HS256"]
  })
  assert.equal(protectedHeader.alg, "HS256")
  assert.equal(protectedHeader.typ, "JWT")
  assert.deepEqual(Object.keys(payload).sort(), ["exp", "sid", "tenant"])
  assert.ok(typeof payload.sid === "string")
  assert.ok(typeof payload.tenant === "string")
  assert.ok(typeof payload.exp === "number")
}

export function assertSpringfieldTenantPage(world: TenantWorld): void {
  assertDisplayedName(world, "Springfield Demo")
}

export async function cleanupScenarioSessionKeys(world: TenantWorld): Promise<void> {
  if (world.sessionKeyPrefix === undefined) {
    return
  }

  const client = createRedisClient({ disableOfflineQueue: true, url: world.redisUrl ?? "redis://127.0.0.1:6379" })
  try {
    try {
      await client.connect()
      for (const id of world.sessionTrackedIds) {
        await client.del(`${world.sessionKeyPrefix}${id}`)
      }

      for await (const key of client.scanIterator({ COUNT: 100, MATCH: `${world.sessionKeyPrefix}*` })) {
        await client.del(key)
      }
    } catch {
      // Best-effort cleanup: Redis may be intentionally unavailable during 503 scenarios.
    }
  } finally {
    await client.quit().catch(() => undefined)
  }
}

export async function configureStorageFailure(world: TenantWorld, operation: string): Promise<void> {
  world.sessionStorageFailureOperation = operation
  world.redisUrl = CLOSED_REDIS_URL
  await restartOwnedProcess(world, { preserveCookies: true })
}

export async function ensureRedisAvailable(world: TenantWorld): Promise<void> {
  ensureSessionSettings(world)
  const client = createRedisClient({
    disableOfflineQueue: true,
    url: world.redisUrl ?? "redis://127.0.0.1:6379"
  })
  try {
    await client.connect()
    const pong = await client.ping()
    assert.equal(pong, "PONG")
  } finally {
    await client.quit().catch(() => undefined)
  }
}

export async function ensureSessionContractEvidence(world: TenantWorld): Promise<void> {
  if (world.sessionContract !== undefined) {
    return
  }

  assert.ok(world.lastVisitedUrl, "No visited URL available for contract probe")

  if (!world.useHttp) {
    await runSessionContract(world, world.lastVisitedUrl)
    return
  }

  const saved = snapshotHttpSessionState(world)
  if (!world.sessionHadCookieBeforeLastVisit) {
    clearCookies(world)
    world.sessionId = undefined
    world.sessionTenantId = undefined
    world.sessionExpiresAtSeconds = undefined
  }

  await runSessionContract(world, world.lastVisitedUrl)
  restoreHttpSessionState(world, saved)
}

export async function fetchTenantResource(world: TenantWorld, resource: string): Promise<void> {
  const host = world.requestedHost ?? hostForTenant(world, "springfield")
  await ensureOwnedProcess(world)
  const targetPath = resolveResourcePath(world, resource)
  world.httpResponse = await sendSessionHttpRequest({
    cookieJar: new Map(),
    host,
    path: targetPath,
    port: world.port
  })
  world.sessionId = undefined
}

export function nowSeconds(world: TenantWorld): number {
  return world.fixedNowSeconds ?? Math.floor(Date.now() / 1000)
}

export function parseIsoSeconds(value: string): number {
  const millis = Date.parse(value)
  assert.ok(!Number.isNaN(millis), `Invalid ISO timestamp: ${value}`)
  return Math.floor(millis / 1000)
}

export async function readStoredRecord(
  world: TenantWorld,
  sessionId: string
): Promise<SessionRecord | undefined> {
  const config = sessionConfig(world)
  const store = new RedisSessionStore(config)
  const result = await store.read(sessionId)
  return result.kind === "record" ? result.record : undefined
}

export async function retryUrl(world: TenantWorld, rawUrl: string): Promise<void> {
  world.sessionStorageFailed = false
  if (world.redisUrl === CLOSED_REDIS_URL) {
    world.redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
    await restartOwnedProcess(world, { preserveCookies: true })
  }
  await visitUrl(world, rawUrl)
}

export async function runSessionContract(
  world: TenantWorld,
  rawUrl: string,
  options: { readonly preserveHttpSessionState?: boolean } = {}
): Promise<void> {
  const config = sessionConfig(world)
  const parsed = parseUrl(world, rawUrl)
  ensureRuntimeForUrl(world, rawUrl)
  const request = buildRequest(world, parsed)
  const hostSuffix = hostSuffixForHost(parsed.host)
  const tenantOps = createTenantOperations({
    hostRecordsJson: JSON.stringify(world.tenants.map((tenant) => ({
      config: { displayName: tenant.displayName },
      slug: tenant.slug
    }))),
    hostSuffix,
    localConfigJson: world.localStaticRecord === undefined
      ? undefined
      : JSON.stringify({
        config: { displayName: world.localStaticRecord.displayName },
        slug: world.localStaticRecord.slug
      }),
    mode: world.resolutionMode ?? "host",
    production: hostSuffix === "pathable.com"
  })
  const priorSessionId = world.sessionId
  const priorTenantId = world.sessionTenantId
  const priorExpiresAt = world.sessionExpiresAtSeconds

  const events: string[] = []
  const tracing = createTracingStore(world, config, events)
  const result = await setupSession(request, {
    config,
    ...(world.sessionDoubleAccess
      ? {
        createId: () => {
          events.push("createId")
          return world.sessionId ?? generateSessionId()
        }
      }
      : {}),
    nowSeconds: () => nowSeconds(world),
    readCookie: (incoming) => {
      events.push("readCookie")
      return readCookieFromRequest(incoming)
    },
    resolveTenant: async (incoming) => {
      events.push("resolveTenant")
      return toTenantResolveResult(
        await tenantOps.resolve({
          host: incoming.headers.get("host") ?? undefined
        })
      )
    },
    signCookie: async (claims, activeConfig) => {
      events.push("signCookie")
      return await signSessionCookie(claims, activeConfig)
    },
    store: tracing,
    verifyCookie: async (token, activeConfig, currentNow) => {
      events.push("verifyCookie")
      return await verifySessionCookie(token, activeConfig, currentNow)
    }
  })

  world.sessionContract = { events: [...events], result }
  if (result.kind !== "ready") {
    return
  }

  if (options.preserveHttpSessionState === true) {
    world.sessionId = priorSessionId
    world.sessionTenantId = priorTenantId
    world.sessionExpiresAtSeconds = priorExpiresAt
    return
  }

  world.sessionId = result.context.sessionId
  world.sessionTenantId = result.context.tenantId
  world.sessionExpiresAtSeconds = result.context.expiresAt
  if (result.outcome === "create") {
    trackSessionId(world, result.context.sessionId)
  }
  if (result.cookieValue !== undefined) {
    setCookie(world, parsed.host, result.cookieValue)
  }
}

export async function seedCrossTenantReference(
  world: TenantWorld,
  cookieTenant: string,
  recordTenant: string
): Promise<void> {
  const config = sessionConfig(world)
  const store = new RedisSessionStore(config)
  const now = nowSeconds(world)
  const sessionId = generateSessionId()
  const expiresAt = now + config.ttlSeconds
  await store.create(sessionId, { expiresAt, tenantId: recordTenant })
  trackSessionId(world, sessionId)
  world.crossTenantSessionId = sessionId
  world.foreignSessionRecord = await readStoredRecord(world, sessionId)
  const token = await signSessionCookie({ exp: expiresAt, sid: sessionId, tenant: cookieTenant }, config)
  setCookie(world, hostForTenant(world, "springfield"), token)
  world.sessionId = sessionId
  world.sessionTenantId = cookieTenant
}

export function seedKnownSessionTenants(world: TenantWorld, first: string, second: string): void {
  upsertTenant(world, first, `${capitalize(first)} Demo`)
  upsertTenant(world, second, `${capitalize(second)} Demo`)
  world.resolutionMode ??= "host"
  // Continuity/recovery features use *.pathable.com hosts (production host binding).
  world.runtime ??= "production"
}

export async function seedValidSession(world: TenantWorld, tenantId: string): Promise<void> {
  const config = sessionConfig(world)
  const createdAt = world.sessionCreatedAtSeconds ?? nowSeconds(world)
  const expiresAt = world.sessionExpiresAtSeconds ?? createdAt + config.ttlSeconds
  const sessionId = world.sessionId ?? generateSessionId()
  world.sessionExpiresAtSeconds = expiresAt
  const record = { expiresAt, tenantId }
  // Redis EXAT is absolute wall-clock; keep logical expiresAt in the JSON record for app-clock tests.
  const redisExat = Math.max(expiresAt, Math.floor(Date.now() / 1000) + 3_600)
  await writeRawRecord(world, sessionId, serializeSessionRecord(record), redisExat)
  trackSessionId(world, sessionId)
  const token = await signSessionCookie({ exp: expiresAt, sid: sessionId, tenant: tenantId }, config)
  setCookie(world, hostForTenant(world, tenantId), token)
  world.sessionId = sessionId
  world.sessionTenantId = tenantId
  world.sessionExpiresAtSeconds = expiresAt
  world.previousSessionRecord = record
}

export function sessionConfig(world: TenantWorld): SessionConfig {
  ensureSessionSettings(world)
  resetSessionConfigCacheForTests()
  return parseSessionConfig({
    REDIS_URL: world.redisUrl,
    SESSION_KEY_PREFIX: world.sessionKeyPrefix,
    SESSION_SIGNING_SECRET: world.sessionSigningSecret,
    SESSION_STORE_TIMEOUT_MS: String(world.sessionStoreTimeoutMs),
    SESSION_TTL_SECONDS: String(world.sessionTtlSeconds)
  })
}

export async function startLocalRedis(world: TenantWorld): Promise<void> {
  if (world.redisStoppedViaDocker) {
    await execFile("docker", ["compose", "-f", COMPOSE_FILE, "start", "redis"], { cwd: REPO_ROOT })
    await waitForRedis(world.redisUrl ?? "redis://127.0.0.1:6379")
    world.redisStoppedViaDocker = false
    return
  }

  world.redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
  await waitForRedis(world.redisUrl)
}

export async function stopLocalRedis(world: TenantWorld): Promise<void> {
  if (isCiRedisService()) {
    world.redisUrl = CLOSED_REDIS_URL
    await restartOwnedProcess(world, { preserveCookies: true })
    return
  }

  if (await dockerAvailable()) {
    await execFile("docker", ["compose", "-f", COMPOSE_FILE, "stop", "redis"], { cwd: REPO_ROOT })
    world.redisStoppedViaDocker = true
    return
  }

  throw new Error("docker compose is required to stop local Redis outside CI")
}

export async function verifyComposeRedisSetup(): Promise<void> {
  const contents = fs.readFileSync(COMPOSE_FILE, "utf8")
  assert.match(contents, /image:\s*redis:8\.2\.9/)
  assert.match(contents, /127\.0\.0\.1:6379:6379/)
  if (await dockerAvailable()) {
    const { stdout } = await execFile("docker", ["compose", "-f", COMPOSE_FILE, "config"], { cwd: REPO_ROOT })
    assert.match(stdout, /redis:8\.2\.9/)
    assert.match(stdout, /host_ip:\s*127\.0\.0\.1/)
    assert.match(stdout, /published:\s*"6379"/)
  }
}

export async function verifyHostSessionRoundTrip(world: TenantWorld): Promise<void> {
  clearCookies(world)
  const url = `http://springfield.localhost:${String(world.port)}/`
  await visitUrl(world, url)
  assert.ok(world.sessionId)
  const firstId = world.sessionId
  await visitUrl(world, url)
  assert.equal(world.sessionId, firstId)
  const record = await readStoredRecord(world, firstId)
  assert.ok(record)
  assert.equal(record.tenantId, "springfield")
}

export async function visitUrl(world: TenantWorld, rawUrl: string): Promise<void> {
  world.lastVisitedUrl = rawUrl
  const parsed = parseUrl(world, rawUrl)
  captureHost(world, parsed.host, parsed.port)
  ensureRuntimeForUrl(world, rawUrl)

  const runContractBeforeHttp = world.useContract && !world.useHttp && !world.useBrowser
  if (runContractBeforeHttp) {
    await runSessionContract(world, rawUrl)
  }

  if (world.useHttp || world.useBrowser) {
    world.sessionHadCookieBeforeLastVisit = cookieHeaderForHost(world, parsed.host) !== undefined
    await expireSessionCookieForHttp(world, parsed.host)
    await requestSessionPage(world, parsed)
    rememberOriginalSession(world)
  }

  if (world.useBrowser) {
    await openSessionBrowserPage(world, parsed)
  }
}

function applyResponseCookies(world: TenantWorld, host: string, response: HttpExchange): void {
  for (const line of collectSetCookies(response.headers)) {
    const match = new RegExp(`^${SESSION_COOKIE_NAME}=([^;]+)`).exec(line)
    if (match?.[1] !== undefined) {
      setCookie(world, host, match[1])
    }
  }
}

function buildRequest(world: TenantWorld, parsed: ParsedUrl): Request {
  const headers = new Headers()
  headers.set("host", parsed.host)
  const cookie = cookieHeaderForHost(world, parsed.host)
  if (cookie !== undefined) {
    headers.set("cookie", cookie)
  }

  return new Request(pageUrl(parsed), { headers })
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function captureHost(world: TenantWorld, host: string, port: number): void {
  world.requestedHost = host
  world.port = port
}

async function captureSessionFromResponse(world: TenantWorld, host: string): Promise<void> {
  const token = latestSessionCookie(world)
  if (token === undefined) {
    return
  }

  const config = sessionConfig(world)
  const claims = await verifySessionCookie(token, config, Math.floor(Date.now() / 1000))
  if (claims === undefined) {
    return
  }

  world.sessionId = claims.sid
  world.sessionTenantId = claims.tenant
  world.sessionExpiresAtSeconds = claims.exp
  trackSessionId(world, claims.sid)
  setCookie(world, host, token)
}

function clearCookies(world: TenantWorld): void {
  world.sessionCookieJar = new Map()
}

function collectSetCookies(headers: Record<string, string>): string[] {
  const raw = headers["set-cookie"]
  if (raw === undefined) {
    return []
  }

  if (raw.includes("\n")) {
    return raw.split("\n")
  }

  return raw.split(/,(?=[^;]+?=)/)
}

function cookieDomain(host: string): string {
  return host.split(":")[0] ?? host
}

function cookieHeaderForHost(world: TenantWorld, host: string): string | undefined {
  return world.sessionCookieJar?.get(host)
}

function createStoreForWorld(world: TenantWorld, config: SessionConfig): SessionStore {
  if (world.redisUrl === CLOSED_REDIS_URL) {
    return {
      create: () => Promise.reject(new SessionStoreError("Session store unavailable.")),
      read: () => Promise.reject(new SessionStoreError("Session store unavailable."))
    }
  }

  return new RedisSessionStore(config)
}

function createTracingStore(
  world: TenantWorld,
  config: SessionConfig,
  events: string[]
): TracingStore {
  const inner = createStoreForWorld(world, config)
  return {
    async create(id, record) {
      events.push("store.create")
      return await inner.create(id, record)
    },
    events,
    async read(id) {
      events.push("store.read")
      return await inner.read(id)
    }
  }
}

function discoverResourcePath(body: string, resource: string): string {
  if (resource === "static asset") {
    const match = /\/_next\/static\/[^"'\\s>]+/.exec(body)
    assert.ok(match, "Could not discover a static asset path")
    return match[0]
  }

  const match = /\/_next\/static\/chunks\/[^"'\\s>]+/.exec(body)
  assert.ok(match, "Could not discover a framework resource path")
  return match[0]
}

async function dockerAvailable(): Promise<boolean> {
  try {
    await execFile("docker", ["version"])
    return true
  } catch {
    return false
  }
}

function ensureRuntimeForUrl(world: TenantWorld, rawUrl: string): void {
  const host = new URL(rawUrl).host
  if (hostSuffixForHost(host) === "pathable.com") {
    world.sessionCookieHostStyle = "pathable"
    if (world.runtime !== "production") {
      world.runtime = "production"
      world.processSignature = undefined
    }
    return
  }

  world.sessionCookieHostStyle = "localhost"
  if (world.runtime === "production") {
    world.runtime = "development"
    world.processSignature = undefined
  }
}

async function expireSessionCookieForHttp(world: TenantWorld, host: string): Promise<void> {
  if (
    world.sessionId === undefined
    || world.sessionTenantId === undefined
    || world.sessionExpiresAtSeconds === undefined
    || world.fixedNowSeconds === undefined
    || world.fixedNowSeconds < world.sessionExpiresAtSeconds
  ) {
    return
  }

  const config = sessionConfig(world)
  const exp = Math.floor(Date.now() / 1000) - 1
  const token = await signSessionCookie({
    exp,
    sid: world.sessionId,
    tenant: world.sessionTenantId
  }, config)
  setCookie(world, host, token)
}

function hostForTenant(world: TenantWorld, tenantId: string): string {
  if (world.resolutionMode === "static") {
    return `localhost:${String(world.port)}`
  }

  if (world.sessionCookieHostStyle === "pathable" || world.runtime === "production") {
    return `${tenantId}.pathable.com`
  }

  return `${tenantId}.localhost:${String(world.port)}`
}

function hostSuffixForHost(host: string): "localhost" | "pathable.com" {
  const hostname = host.split(":")[0] ?? host
  return hostname.endsWith(".pathable.com") || hostname === "pathable.com" ? "pathable.com" : "localhost"
}

function isCiRedisService(): boolean {
  return (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true")
    && process.env.REDIS_URL !== undefined
    && process.env.REDIS_URL !== ""
}

function latestSessionCookie(world: TenantWorld): string | undefined {
  const header = world.requestedHost === undefined
    ? undefined
    : world.sessionCookieJar?.get(world.requestedHost)
  if (header === undefined) {
    const setCookies = collectSetCookies(world.httpResponse?.headers ?? {})
    const line = setCookies.find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`))
    if (line === undefined) {
      return undefined
    }

    return line.slice(`${SESSION_COOKIE_NAME}=`.length).split(";")[0]
  }

  return header.slice(`${SESSION_COOKIE_NAME}=`.length)
}

async function openSessionBrowserPage(world: TenantWorld, parsed: ParsedUrl): Promise<void> {
  await ensureBrowser(world)
  assert.ok(world.browser)
  world.browserContext ??= await world.browser.newContext()
  world.page ??= await world.browserContext.newPage()
  const token = cookieHeaderForHost(world, parsed.host)?.slice(`${SESSION_COOKIE_NAME}=`.length)
  if (token !== undefined) {
    await world.browserContext.addCookies([{
      domain: cookieDomain(parsed.host),
      expires: Math.floor(Date.now() / 1000) + 86_400,
      httpOnly: true,
      name: SESSION_COOKIE_NAME,
      path: "/",
      url: pageUrl(parsed),
      value: token
    }])
  }
  await world.page.goto(pageUrl(parsed), { waitUntil: "domcontentloaded" })
}

function pageUrl(parsed: ParsedUrl): string {
  return `http://${parsed.host}${parsed.path}`
}

function parseUrl(world: TenantWorld, rawUrl: string): ParsedUrl {
  const url = new URL(rawUrl)
  const port = url.port === "" ? world.port : Number(url.port)
  const host = url.host
  return { host, path: `${url.pathname}${url.search}`, port }
}

function readCookieFromRequest(request: Request): string | undefined {
  const header = request.headers.get("cookie")
  if (header === null || header === "") {
    return undefined
  }

  for (const part of header.split(";")) {
    const trimmed = part.trim()
    const separator = trimmed.indexOf("=")
    if (separator <= 0) {
      continue
    }

    if (trimmed.slice(0, separator) === SESSION_COOKIE_NAME) {
      return trimmed.slice(separator + 1)
    }
  }

  return undefined
}

function rememberOriginalSession(world: TenantWorld): void {
  if (world.sessionId === undefined) {
    return
  }

  world.originalSessionId ??= world.sessionId
  world.originalSessionTenantId ??= world.sessionTenantId
}

async function requestSessionPage(world: TenantWorld, parsed: ParsedUrl): Promise<void> {
  await ensureOwnedProcess(world)
  world.httpResponse = await sendSessionHttpRequest({
    cookieJar: world.sessionCookieJar ?? new Map<string, string>(),
    host: parsed.host,
    path: parsed.path,
    port: parsed.port
  })
  applyResponseCookies(world, parsed.host, world.httpResponse)
  if (world.httpResponse.status === 200) {
    await captureSessionFromResponse(world, parsed.host)
  }
}

function resolveResourcePath(world: TenantWorld, resource: string): string {
  const priorBody = world.httpResponse?.body
  if (priorBody !== undefined && priorBody.length > 0) {
    return discoverResourcePath(priorBody, resource)
  }

  if (resource === "static asset") {
    return "/favicon.ico"
  }

  return discoverResourcePath(SEED_PAGE_HTML, resource)
}

function restoreHttpSessionState(world: TenantWorld, saved: HttpSessionSnapshot): void {
  world.sessionCookieJar = saved.sessionCookieJar
  world.sessionId = saved.sessionId
  world.sessionTenantId = saved.sessionTenantId
  world.sessionExpiresAtSeconds = saved.sessionExpiresAtSeconds
}

async function seedSignedRawRecord(
  world: TenantWorld,
  config: SessionConfig,
  sessionId: string,
  tenantId: string,
  expiresAt: number,
  raw: string
): Promise<void> {
  await writeRawRecord(world, sessionId, raw)
  trackSessionId(world, sessionId)
  const token = await signSessionCookie({ exp: expiresAt, sid: sessionId, tenant: tenantId }, config)
  setCookie(world, hostForTenant(world, tenantId), token)
}

async function sendSessionHttpRequest(options: {
  cookieJar: Map<string, string>
  host: string
  path: string
  port: number
}): Promise<HttpExchange> {
  const extraHeaders: Record<string, string> = {}
  const cookie = cookieHeaderForHost({ sessionCookieJar: options.cookieJar } as TenantWorld, options.host)
  if (cookie !== undefined) {
    extraHeaders.Cookie = cookie
  }

  return await sendRawGet({
    extraHeaders,
    host: options.host,
    path: options.path,
    port: options.port
  })
}

function setCookie(world: TenantWorld, host: string, value: string): void {
  world.sessionCookieJar ??= new Map()
  world.sessionCookieJar.set(host, `${SESSION_COOKIE_NAME}=${value}`)
}

function snapshotHttpSessionState(world: TenantWorld): HttpSessionSnapshot {
  return {
    sessionCookieJar: world.sessionCookieJar === undefined ? undefined : new Map(world.sessionCookieJar),
    sessionExpiresAtSeconds: world.sessionExpiresAtSeconds,
    sessionId: world.sessionId,
    sessionTenantId: world.sessionTenantId
  }
}

function trackSessionId(world: TenantWorld, sessionId: string): void {
  if (!world.sessionTrackedIds.includes(sessionId)) {
    world.sessionTrackedIds.push(sessionId)
  }
}

async function waitForRedis(url: string): Promise<void> {
  const client = createRedisClient({ disableOfflineQueue: true, url })
  try {
    await client.connect()
    assert.equal(await client.ping(), "PONG")
  } finally {
    await client.quit().catch(() => undefined)
  }
}

async function writeRawRecord(
  world: TenantWorld,
  sessionId: string,
  raw: string,
  exatSeconds?: number
): Promise<void> {
  ensureSessionSettings(world)
  const prefix = world.sessionKeyPrefix ?? ""
  const client = createRedisClient({ disableOfflineQueue: true, url: world.redisUrl ?? "redis://127.0.0.1:6379" })
  try {
    await client.connect()
    const key = `${prefix}${sessionId}`
    if (exatSeconds === undefined) {
      await client.set(key, raw)
    } else {
      await client.set(key, raw, {
        expiration: {
          type: "EXAT",
          value: exatSeconds
        }
      })
    }
  } finally {
    await client.quit().catch(() => undefined)
  }
}

export { clearCookies, hostForTenant, setCookie, trackSessionId }
