import { Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"

import type { CapabilityWorld } from "../support/world.ts"

import { signSessionCookie, verifySessionCookie } from "../../../packages/frontend/src/lib/session/cookie.ts"
import { setupSession } from "../../../packages/frontend/src/lib/session/setup.ts"
import { type SessionStore, SessionStoreError } from "../../../packages/frontend/src/lib/session/store.ts"
import { createTenantOperations } from "../../../packages/frontend/src/lib/tenant/operations.ts"
import { seedSession, sessionCookieHeader, writeTenants } from "../support/fixtures.ts"

Given("isolated application session storage", async function(this: CapabilityWorld) {
  await writeTenants(this)
})
Given("a persisted anonymous Springfield session and its signed cookie", async function(this: CapabilityWorld) {
  await seedSession(this)
})
Given("a Springfield session reference that is {string}", async function(this: CapabilityWorld, condition: string) {
  await seedSession(this, false, condition === "foreign cookie" ? "shelbyville" : "springfield")
  assert.ok(this.originalRecord)
  if (["foreign record", "malformed record", "missing record"].includes(condition)) {
    await alterStoredReference(this, condition)
  } else {
    await alterCookie(this, condition)
  }
})
Given("session writes will fail at the storage boundary", function(this: CapabilityWorld) {
  this.failWrites = true
})
When("application session setup handles a Springfield visit", async function(this: CapabilityWorld) {
  const operations = createTenantOperations({
    configDir: this.directory,
    hostSuffix: "pathable.com",
    mode: "host",
    production: true
  })
  const real = this.store
  const store: SessionStore = this.failWrites ?
    {
      clearForInactivity: real.clearForInactivity.bind(real),
      create: () => Promise.reject(new SessionStoreError("Synthetic storage outage")),
      read: real.read.bind(real),
      renewIdleActivity: real.renewIdleActivity.bind(real),
      update: real.update.bind(real)
    } :
    real
  this.setupResult = await setupSession(
    new Request("https://springfield.pathable.com/", { headers: sessionCookieHeader(this) }),
    {
      config: this.config,
      nowSeconds: () => this.now,
      resolveTenant: (request) => operations.resolve({ host: new URL(request.url).host }),
      store
    }
  )
})
Then("a new anonymous Springfield session is persisted with a signed cookie", async function(this: CapabilityWorld) {
  const result = this.setupResult
  assert.ok(result?.kind === "ready")
  assert.equal(result.outcome, "create")
  assert.equal(result.context.tenantId, "springfield")
  assert.equal(result.context.userId, undefined)
  assert.ok(result.cookieValue)
  const claims = await verifySessionCookie(result.cookieValue, this.config, this.now)
  assert.equal(claims?.sid, result.context.sessionId)
  const stored = await this.store.read(result.context.sessionId)
  assert.ok(stored.kind === "record")
  assert.equal(stored.record.tenantId, "springfield")
  assert.equal(stored.record.userId, undefined)
})
Then("the presented session identity is not adopted", function(this: CapabilityWorld) {
  assert.ok(this.setupResult?.kind === "ready")
  assert.notEqual(this.setupResult.context.sessionId, this.sessionId)
})
Then("the original session is reused without extending its absolute lifetime", function(this: CapabilityWorld) {
  assert.ok(this.setupResult?.kind === "ready")
  assert.equal(this.setupResult.outcome, "reuse")
  assert.equal(this.setupResult.context.sessionId, this.sessionId)
  assert.equal(this.setupResult.context.expiresAt, this.originalRecord?.expiresAt)
  assert.equal(this.setupResult.cookieValue, undefined)
})
Then("session setup fails with 503 without a successful cookie", function(this: CapabilityWorld) {
  assert.ok(this.setupResult?.kind === "terminal")
  assert.equal(this.setupResult.status, 503)
  assert.equal("cookieValue" in this.setupResult, false)
})

async function alterCookie(world: CapabilityWorld, condition: string): Promise<void> {
  switch (condition) {
    case "expired":
      world.cookie = await signSessionCookie(
        { exp: world.baseTime, sid: world.sessionId, tenant: "springfield" },
        world.config
      )
      break
    case "foreign cookie":
      break
    case "malformed":
      world.cookie = "not-a-cookie"
      break
    case "tampered":
      world.cookie = `${world.cookie ?? ""}tampered`
      break
    default:
      throw new Error(`Unknown condition: ${condition}`)
  }
}

async function alterStoredReference(world: CapabilityWorld, condition: string): Promise<void> {
  switch (condition) {
    case "foreign record":
      await world.client.set(
        `${world.config.keyPrefix}${world.sessionId}`,
        JSON.stringify({ ...world.originalRecord, tenantId: "shelbyville" }),
        { EX: 86400 }
      )
      break
    case "malformed record":
      await world.client.set(`${world.config.keyPrefix}${world.sessionId}`, "{broken", { EX: 60 })
      break
    case "missing record":
      await world.client.del(`${world.config.keyPrefix}${world.sessionId}`)
      break
    default:
      throw new Error(`Unknown stored condition: ${condition}`)
  }
}
