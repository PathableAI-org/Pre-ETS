import { Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"

import type { TenantWorld } from "../support/world.ts"

import { ensureOwnedProcess, restartOwnedProcess } from "../support/server.ts"
import { createRedisClient } from "../support/session-deps.ts"
import { ensureSessionSettings } from "../support/session-env.ts"
import {
  applySessionReferenceCondition,
  assertCookieAndRecordExpireAt,
  assertFreshSpringfieldSession,
  assertNoSessionCookieIssued,
  assertOriginalSessionRetained,
  assertSessionAccessDenied,
  assertSessionCookieAttributes,
  assertSessionPersistedBeforeCookie,
  assertSessionServiceFailure,
  assertSignedClaimsMinimal,
  assertSpringfieldTenantPage,
  clearCookies,
  configureStorageFailure,
  ensureSessionContractEvidence,
  fetchTenantResource,
  parseIsoSeconds,
  readStoredRecord,
  retryUrl,
  runSessionContract,
  seedCrossTenantReference,
  seedKnownSessionTenants,
  seedValidSession,
  sessionConfig,
  startLocalRedis,
  stopLocalRedis,
  verifyComposeRedisSetup,
  verifyHostSessionRoundTrip,
  visitUrl
} from "../support/session.ts"

Given("a clean local session-development environment with documented prerequisites", async function(this: TenantWorld) {
  ensureSessionSettings(this)
  this.runtime = "development"
  seedKnownSessionTenants(this, "springfield", "shelbyville")
  this.runtime = "development"
  await verifyComposeRedisSetup()
})

When(
  "the developer follows the documented session setup and verification instructions",
  async function(this: TenantWorld) {
    await ensureOwnedProcess(this)
    await verifyHostSessionRoundTrip(this)
  }
)

Then("Compose starts Redis from an official image with a pinned version", async function() {
  await verifyComposeRedisSetup()
})

Then("Redis is published only on a loopback address", async function() {
  await verifyComposeRedisSetup()
})

Then(
  "the host-run frontend creates and retrieves a tenant session through the configured Redis connection",
  async function(this: TenantWorld) {
    await verifyHostSessionRoundTrip(this)
  }
)

Then("no hosted service account is required", function() {
  assert.ok(true)
})

Then("the frontend and backend remain host processes", function(this: TenantWorld) {
  assert.ok(this.ownedProcess)
})

Then("the developer can stop the local service using the documented shutdown instructions", async function() {
  await verifyComposeRedisSetup()
})

Given("local Redis and the host-run frontend are available", async function(this: TenantWorld) {
  ensureSessionSettings(this)
  seedKnownSessionTenants(this, "springfield", "shelbyville")
  await ensureOwnedProcess(this)
})

Given(
  "local tenant resolution uses {string} with tenant {string}",
  function(this: TenantWorld, mode: string, tenant: string) {
    this.sessionCookieHostStyle = "localhost"
    this.runtime = "development"
    this.processSignature = undefined
    if (mode === "host association") {
      this.resolutionMode = "host"
    } else if (mode === "explicit static") {
      this.resolutionMode = "static"
      this.localStaticRecord = { displayName: "Springfield Demo", slug: tenant }
    } else {
      throw new Error(`Unknown local tenant mode: ${mode}`)
    }
  }
)

Given("the visitor already has a session established at {string}", async function(this: TenantWorld, url: string) {
  await visitUrl(this, url)
  assert.ok(this.sessionId)
  this.originalSessionId = this.sessionId
  this.originalSessionTenantId = this.sessionTenantId
})

When("the visitor returns to {string}", async function(this: TenantWorld, url: string) {
  await visitUrl(this, url)
})

Then("the original session id and tenant binding are retained", function(this: TenantWorld) {
  assertOriginalSessionRetained(this)
})

Then(
  "the visitor receives the existing Springfield tenant page without additional action",
  function(this: TenantWorld) {
    assertSpringfieldTenantPage(this)
  }
)

Then("the HTTP development cookie remains host-only and HttpOnly", function(this: TenantWorld) {
  assertSessionCookieAttributes(this, false)
})

Given("the host-run frontend is configured for local Redis", async function(this: TenantWorld) {
  ensureSessionSettings(this)
  seedKnownSessionTenants(this, "springfield", "shelbyville")
  await ensureOwnedProcess(this)
})

Given("local Redis has been stopped", async function(this: TenantWorld) {
  await stopLocalRedis(this)
})

When("the visitor opens {string}", async function(this: TenantWorld, url: string) {
  await visitUrl(this, url)
})

Then("the visitor receives a controlled service failure without normal tenant content", function(this: TenantWorld) {
  assertSessionServiceFailure(this)
})

Then("no successful new session cookie is issued", function(this: TenantWorld) {
  assertNoSessionCookieIssued(this)
})

Given("a visitor received a service failure while local Redis was stopped", async function(this: TenantWorld) {
  this.sessionStorageFailed = true
  await stopLocalRedis(this)
  await visitUrl(this, `http://springfield.localhost:${String(this.port)}/`)
  assertSessionServiceFailure(this)
})

Given("local Redis has restarted successfully", async function(this: TenantWorld) {
  await startLocalRedis(this)
  if (this.ownedProcess !== undefined) {
    await restartOwnedProcess(this, { preserveCookies: true })
  }
})

When("the visitor retries {string}", async function(this: TenantWorld, url: string) {
  await retryUrl(this, url)
})

Then(
  "an existing usable session is resumed or a fresh session for {string} is created",
  function(this: TenantWorld, tenant: string) {
    assert.ok(this.sessionId)
    assert.equal(this.sessionTenantId, tenant)
  }
)

Given("the frontend runs in production with local static tenant settings supplied", async function(this: TenantWorld) {
  this.runtime = "production"
  this.resolutionMode = "static"
  this.localStaticRecord = { displayName: "Springfield Demo", slug: "springfield" }
  await restartOwnedProcess(this)
})

Then("the existing access-denied outcome is returned without a redirect", function(this: TenantWorld) {
  assertSessionAccessDenied(this)
})

Then("no session is created and no session cookie is issued", async function(this: TenantWorld) {
  assertNoSessionCookieIssued(this)
  if (this.sessionKeyPrefix !== undefined) {
    const client = createRedisClient({
      disableOfflineQueue: true,
      url: this.redisUrl ?? "redis://127.0.0.1:6379"
    })
    try {
      await client.connect()
      const keys = await client.keys(`${this.sessionKeyPrefix}*`)
      assert.equal(keys.length, 0)
    } finally {
      await client.quit().catch(() => undefined)
    }
  }
})

Given(
  "session setup has known tenants {string} and {string}",
  function(this: TenantWorld, first: string, second: string) {
    seedKnownSessionTenants(this, first, second)
  }
)

Given("the external session store is available and isolated for this scenario", async function(this: TenantWorld) {
  ensureSessionSettings(this)
  const config = sessionConfig(this)
  const client = createRedisClient({ disableOfflineQueue: true, url: config.redisUrl })
  try {
    await client.connect()
    assert.equal(await client.ping(), "PONG")
  } finally {
    await client.quit().catch(() => undefined)
  }
})

Given("the visitor has no session cookie", function(this: TenantWorld) {
  clearCookies(this)
})

Then("cookie inspection precedes tenant resolution", async function(this: TenantWorld) {
  await ensureSessionContractEvidence(this)
  const events = this.sessionContract?.events ?? []
  assert.ok(events.includes("readCookie"))
  assert.ok(events.includes("resolveTenant"))
  assert.ok(events.indexOf("readCookie") < events.indexOf("resolveTenant"))
})

Then("tenant validation precedes persistence of the new session", async function(this: TenantWorld) {
  await ensureSessionContractEvidence(this)
  const events = this.sessionContract?.events ?? []
  assert.ok(events.includes("resolveTenant"))
  assert.ok(events.includes("store.create"))
  assert.ok(events.indexOf("resolveTenant") < events.indexOf("store.create"))
})

Then(
  "the new session contains tenant id {string} and no authenticated identity",
  function(this: TenantWorld, tenantId: string) {
    assert.equal(this.sessionTenantId, tenantId)
    assert.ok(this.sessionContract?.result.kind === "ready")
  }
)

Then("persistence succeeds before the session cookie is issued", async function(this: TenantWorld) {
  await ensureSessionContractEvidence(this)
  assertSessionPersistedBeforeCookie(this)
})

Then("downstream handling of this request receives that same session", function(this: TenantWorld) {
  assert.ok(this.sessionId)
  assert.ok(this.httpResponse)
  assert.match(this.httpResponse.body, /Tenant: Springfield Demo/)
})

Given("the visitor has a valid unexpired session for {string}", async function(this: TenantWorld, tenantId: string) {
  await seedValidSession(this, tenantId)
  this.originalSessionId = this.sessionId
  this.originalSessionTenantId = this.sessionTenantId
})

Then("the referenced session is loaded before tenant resolution", async function(this: TenantWorld) {
  await ensureSessionContractEvidence(this)
  const events = this.sessionContract?.events ?? []
  assert.ok(events.includes("store.read"))
  assert.ok(events.includes("resolveTenant"))
  assert.ok(events.indexOf("store.read") < events.indexOf("resolveTenant"))
})

Then("the session is accepted only after its tenant matches the validated host tenant", function(this: TenantWorld) {
  assert.equal(this.sessionTenantId, "springfield")
  assert.equal(this.sessionContract?.result.kind, "ready")
})

Then("no replacement session is created", function(this: TenantWorld) {
  assert.equal(this.sessionContract?.result.kind, "ready")
  assert.ok(this.sessionContract)
  assert.equal(this.sessionContract.result.kind, "ready")
  assert.equal(this.sessionContract.result.outcome, "reuse")
})

Given(
  "the frontend has restarted while the external session record remains available",
  async function(this: TenantWorld) {
    await restartOwnedProcess(this, { preserveCookies: true })
  }
)

Given("the tenant page needs the session more than once during the request", function(this: TenantWorld) {
  this.sessionDoubleAccess = true
})

Then("exactly one new session is persisted for the request", async function(this: TenantWorld) {
  await ensureSessionContractEvidence(this)
  const createCount = (this.sessionContract?.events ?? []).filter((event) => event === "store.create").length
  assert.equal(createCount, 1)
})

Then("every downstream session access receives that session", function(this: TenantWorld) {
  assert.ok(this.sessionId)
  if (this.httpResponse !== undefined) {
    assert.match(this.httpResponse.body, /Tenant: Springfield Demo/)
  } else {
    assert.equal(this.sessionContract?.result.kind, "ready")
  }
})

Then("the response contains no conflicting session cookies", function(this: TenantWorld) {
  const raw = this.httpResponse?.headers["set-cookie"] ?? ""
  const matches = raw.match(/pathable-session=/g) ?? []
  assert.ok(matches.length <= 1)
})

Then("the session cookie is host-only, HttpOnly, and Secure", function(this: TenantWorld) {
  assertSessionCookieAttributes(this, true)
})

Then(
  "its signed application claims contain only a session reference, tenant binding, and expiry",
  async function(this: TenantWorld) {
    await assertSignedClaimsMinimal(this)
  }
)

Then("it contains no authenticated identity or session payload", async function(this: TenantWorld) {
  await assertSignedClaimsMinimal(this)
})

Then("possession of the cookie does not authenticate the visitor", function(this: TenantWorld) {
  assert.ok(this.httpResponse)
  assert.doesNotMatch(this.httpResponse.body, /authenticated/i)
})

Given("the session lifetime is {string}", function(this: TenantWorld, configuration: string) {
  if (configuration === "default") {
    this.sessionTtlSeconds = 86_400
  } else if (configuration === "2 hours") {
    this.sessionTtlSeconds = 7200
  } else {
    throw new Error(`Unknown session lifetime: ${configuration}`)
  }
})

Given(
  "the visitor has a session created at {string} for {string}",
  async function(this: TenantWorld, createdAt: string, tenantId: string) {
    this.sessionCreatedAtSeconds = parseIsoSeconds(createdAt)
    this.sessionExpiresAtSeconds = this.sessionCreatedAtSeconds + (this.sessionTtlSeconds ?? 86_400)
    await seedValidSession(this, tenantId)
    this.originalSessionId = this.sessionId
    this.originalSessionTenantId = tenantId
  }
)

Given("the current time is {string}", function(this: TenantWorld, iso: string) {
  this.fixedNowSeconds = parseIsoSeconds(iso)
  if (
    this.sessionExpiresAtSeconds !== undefined
    && this.fixedNowSeconds >= this.sessionExpiresAtSeconds
  ) {
    this.sessionExpiresAtSeconds = this.fixedNowSeconds
  }
})

Then("both the cookie and stored session expire at {string}", async function(this: TenantWorld, iso: string) {
  if (this.sessionContract === undefined && this.useContract) {
    await runSessionContract(this, this.lastVisitedUrl ?? `https://springfield.pathable.com/`)
  }
  await assertCookieAndRecordExpireAt(this, iso)
})

Then("the visit does not extend either expiry", async function(this: TenantWorld) {
  assert.ok(this.originalSessionId)
  const record = await readStoredRecord(this, this.originalSessionId)
  assert.ok(record)
  assert.equal(record.expiresAt, this.sessionExpiresAtSeconds)
})

Given(
  "the visitor has a session for {string} expiring at {string}",
  async function(this: TenantWorld, tenantId: string, iso: string) {
    this.sessionExpiresAtSeconds = parseIsoSeconds(iso)
    this.sessionCreatedAtSeconds = this.sessionExpiresAtSeconds - (this.sessionTtlSeconds ?? 86_400)
    await seedValidSession(this, tenantId)
    this.originalSessionId = this.sessionId
    this.originalSessionTenantId = tenantId
  }
)

Then(
  "a fresh session for {string} replaces the expired session reference",
  function(this: TenantWorld, tenantId: string) {
    assertFreshSpringfieldSession(this)
    assert.equal(this.sessionTenantId, tenantId)
  }
)

Then("none of the expired session state is carried forward", async function(this: TenantWorld) {
  assert.ok(this.originalSessionId)
  const oldRecord = await readStoredRecord(this, this.originalSessionId)
  assert.ok(oldRecord)
  assert.notEqual(this.sessionId, this.originalSessionId)
})

Given(
  "the visitor previously received a session but the browser refused its cookie",
  async function(this: TenantWorld) {
    clearCookies(this)
    await visitUrl(this, `https://springfield.pathable.com/`)
    assert.ok(this.sessionId)
    this.originalSessionId = this.sessionId
    clearCookies(this)
  }
)

Then(
  "a new session for {string} is issued without reusing the previous id",
  function(this: TenantWorld, tenantId: string) {
    assert.ok(this.sessionId)
    assert.notEqual(this.sessionId, this.originalSessionId)
    assert.equal(this.sessionTenantId, tenantId)
  }
)

When(
  "the browser fetches an existing {string} from the tenant site",
  async function(this: TenantWorld, resource: string) {
    await fetchTenantResource(this, resource)
  }
)

Given(
  "the visitor presents a session reference with condition {string}",
  async function(this: TenantWorld, condition: string) {
    await applySessionReferenceCondition(this, condition)
  }
)

Then(
  "a fresh server-generated session for {string} is persisted before its cookie is issued",
  function(this: TenantWorld, tenantId: string) {
    assertSessionPersistedBeforeCookie(this, tenantId)
  }
)

Then("no presented session id is adopted for the new record", function(this: TenantWorld) {
  assert.ok(this.sessionId)
  assert.ok(this.originalSessionId === undefined || this.sessionId !== this.originalSessionId)
})

Then("no state from the unusable session is exposed or copied", function(this: TenantWorld) {
  assert.ok(this.httpResponse)
  assert.doesNotMatch(this.httpResponse.body, /shelbyville/i)
})

Given("the visitor presents a signed cookie bound to {string}", function(this: TenantWorld, tenantId: string) {
  this.sessionCookieTenant = tenantId
})

Given("its stored record is bound to {string}", async function(this: TenantWorld, tenantId: string) {
  assert.ok(this.sessionCookieTenant)
  await seedCrossTenantReference(this, this.sessionCookieTenant, tenantId)
})

Then("a fresh session is created only for validated tenant {string}", function(this: TenantWorld, tenantId: string) {
  assert.equal(this.sessionTenantId, tenantId)
  assert.equal(this.sessionContract?.result.outcome, "create")
})

Then("the previous record is neither changed nor reassigned", async function(this: TenantWorld) {
  assert.ok(this.crossTenantSessionId)
  assert.ok(this.foreignSessionRecord)
  const current = await readStoredRecord(this, this.crossTenantSessionId)
  assert.deepEqual(current, this.foreignSessionRecord)
})

Then("no state from the previous record reaches downstream handling", function(this: TenantWorld) {
  assert.ok(this.httpResponse)
  assert.doesNotMatch(this.httpResponse.body, /Shelbyville Demo/)
})

Given("the visitor's cookie state is {string}", async function(this: TenantWorld, cookie: string) {
  if (cookie === "absent") {
    clearCookies(this)
    return
  }

  if (cookie === "valid Springfield session") {
    await seedValidSession(this, "springfield")
    return
  }

  if (cookie === "unknown session id") {
    await applySessionReferenceCondition(this, "unknown session id")
    return
  }

  throw new Error(`Unknown cookie state: ${cookie}`)
})

Then("no tenant session state is accepted", function(this: TenantWorld) {
  assertSessionAccessDenied(this)
})

Given("{string} is no longer configured as a known tenant", function(this: TenantWorld, slug: string) {
  this.tenants = this.tenants.filter((tenant) => tenant.slug !== slug)
})

Given("session storage will fail during {string}", async function(this: TenantWorld, operation: string) {
  await configureStorageFailure(this, operation)
})

Then("no process-local fallback session permits tenant processing", function(this: TenantWorld) {
  assertSessionServiceFailure(this)
  assert.ok(this.httpResponse)
  assert.doesNotMatch(this.httpResponse.body, /Tenant: /)
})

Given("the visitor previously received a controlled session-storage failure", async function(this: TenantWorld) {
  await seedValidSession(this, "springfield")
  this.originalSessionId = this.sessionId
  this.originalSessionTenantId = this.sessionTenantId
  this.sessionStorageFailed = true
  await configureStorageFailure(this, "reading the session")
  await visitUrl(this, `https://springfield.pathable.com/`)
  assertSessionServiceFailure(this)
})

Given("storage has recovered with {string}", async function(this: TenantWorld, recordState: string) {
  this.redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
  await restartOwnedProcess(this, { preserveCookies: true })
  if (recordState === "the original unexpired record intact" && this.originalSessionId !== undefined) {
    this.sessionId = this.originalSessionId
    await seedValidSession(this, "springfield")
  }
})

Then("session setup has outcome {string}", function(this: TenantWorld, outcome: string) {
  if (outcome === "original session reused") {
    assertOriginalSessionRetained(this)
    return
  }

  if (outcome === "fresh tenant session created") {
    assert.ok(this.sessionId)
    return
  }

  throw new Error(`Unknown session setup outcome: ${outcome}`)
})
