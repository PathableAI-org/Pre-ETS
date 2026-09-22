import { Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"

import type { CapabilityWorld } from "../support/world.ts"

import { verifySessionCookie } from "../../../packages/frontend/src/lib/session/cookie.ts"
import { writeConfidentialTenant, writeTenants } from "../support/fixtures.ts"
import { loginLocation, requestSite, stopSite } from "../support/server.ts"

Given("production tenant sites for Springfield and Shelbyville", async function(this: CapabilityWorld) {
  await writeTenants(this)
})
Given("caller headers and query parameters suggest Shelbyville", function(this: CapabilityWorld) {
  this.extraHeaders = {
    "x-bdd-query": "/?tenant=shelbyville&issuer=https://other.example&return=https://other.example",
    "x-forwarded-host": "shelbyville.pathable.com",
    "x-tenant-id": "shelbyville"
  }
})
Given("static development settings select Shelbyville", function(this: CapabilityWorld) {
  this.staticAlias = "shelbyville"
})
When("a visitor requests the document at {string}", async function(this: CapabilityWorld, host: string) {
  await requestSite(this, host)
})
Then("the response refuses access with status {int} and no redirect", function(this: CapabilityWorld, status: number) {
  assert.equal(this.response?.status, status)
  assert.equal(this.response.headers.location, undefined)
})
Then("no session cookie or tenant content is returned", function(this: CapabilityWorld) {
  assert.ok(this.response)
  assert.doesNotMatch(this.response.headers["set-cookie"] ?? "", /pathable-session=/)
  assert.doesNotMatch(this.response.body, /Tenant: |Springfield Demo|Shelbyville Demo|Unsent practice note/)
})
function assertLogin(world: CapabilityWorld, tenant: string) {
  const location = loginLocation(world)
  assert.equal(location.origin, new URL(world.issuer).origin)
  assert.equal(location.pathname, `${new URL(world.issuer).pathname}/protocol/openid-connect/auth`)
  assert.equal(location.searchParams.get("client_id"), `${tenant}-web`)
  const destination = new URL(location.searchParams.get("redirect_uri") ?? "")
  assert.equal(destination.hostname, `${tenant}.pathable.com`)
  assert.equal(destination.pathname, "/auth/callback")
}
Then("login starts for {string} on its own return host", function(this: CapabilityWorld, tenant: string) {
  assertLogin(this, tenant)
})
Then("the production selection is {string}", function(this: CapabilityWorld, selection: string) {
  if (selection === "refused") {
    assert.equal(this.response?.status, 403)
    assert.equal(this.response.headers.location, undefined)
  } else assertLogin(this, selection)
})
Then("application content is not served before authentication", function(this: CapabilityWorld) {
  assert.ok(this.response)
  assert.doesNotMatch(this.response.body, /Welcome to the Pre-ETS workspace|Signed in as:|Unsent practice note/)
})
Then("the authorization request contains PKCE, state, and nonce without a verifier", function(this: CapabilityWorld) {
  const location = loginLocation(this)
  for (const key of ["state", "nonce", "code_challenge"]) assert.ok(location.searchParams.get(key))
  assert.equal(location.searchParams.get("code_challenge_method"), "S256")
  assert.equal(location.searchParams.get("response_type"), "code")
  assert.equal(location.searchParams.has("code_verifier"), false)
})
Given("a visitor previously received an anonymous Springfield session cookie", async function(this: CapabilityWorld) {
  await requestSite(this, "springfield.pathable.com")
  assertLogin(this, "springfield")
  const match = /pathable-session=([^;\n]+)/.exec(this.response?.headers["set-cookie"] ?? "")
  assert.ok(match?.[1])
  this.cookie = match[1]
})
Given("Springfield's server configuration requires a missing client secret", async function(this: CapabilityWorld) {
  await writeConfidentialTenant(this)
})
When("a visitor requests protected data without document navigation", async function(this: CapabilityWorld) {
  await requestSite(this, "springfield.pathable.com", false)
})

Given("the owned frontend is restarted", async function(this: CapabilityWorld) {
  await stopSite(this)
})
Given("Springfield is removed from configuration and the frontend restarts", async function(this: CapabilityWorld) {
  await stopSite(this)
  await fs.unlink(path.join(this.directory, "springfield.json"))
})
Then(
  "the previous anonymous session remains usable without a replacement cookie",
  async function(this: CapabilityWorld) {
    assert.ok(this.cookie)
    const claims = await verifySessionCookie(this.cookie, this.config, this.now)
    assert.ok(claims)
    const stored = await this.store.read(claims.sid)
    assert.ok(stored.kind === "record")
    assert.equal(stored.record.tenantId, "springfield")
    assert.equal(stored.record.userId, undefined)
    assert.doesNotMatch(this.response?.headers["set-cookie"] ?? "", /pathable-session=/)
  }
)
Then(
  "the production cookie is host-only, HttpOnly, Secure, and contains only a signed anonymous reference",
  async function(this: CapabilityWorld) {
    const cookie = this.response?.headers["set-cookie"]?.split("\n").find((value) =>
      value.startsWith("pathable-session=")
    )
    assert.ok(cookie)
    assert.match(cookie, /; HttpOnly/i)
    assert.match(cookie, /; Secure/i)
    assert.doesNotMatch(cookie, /; Domain=/i)
    const value = cookie.split(";")[0]?.slice("pathable-session=".length)
    assert.ok(value)
    const claims = await verifySessionCookie(value, this.config, this.now)
    assert.ok(claims)
    assert.deepEqual(Object.keys(claims).sort(), ["exp", "sid", "tenant"])
    const stored = await this.store.read(claims.sid)
    assert.ok(stored.kind === "record")
    assert.equal(stored.record.userId, undefined)
  }
)
