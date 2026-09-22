import { Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"

import type { CapabilityWorld } from "../support/world.ts"

import { createTenantOperations } from "../../../packages/frontend/src/lib/tenant/operations.ts"
import { effectiveIdleTimeoutMinutes, parseTenantConfig } from "../../../packages/frontend/src/lib/tenant/types.ts"
import { tenantConfig, writeTenant, writeTenants } from "../support/fixtures.ts"

function resolver(world: CapabilityWorld) {
  return createTenantOperations({
    configDir: world.directory,
    hostSuffix: "pathable.com",
    mode: "host",
    production: true
  })
}
Given("isolated filesystem configuration for Springfield and Shelbyville", async function(this: CapabilityWorld) {
  await writeTenants(this)
})
Given("both tenant files display {string}", async function(this: CapabilityWorld, name: string) {
  await writeTenant(this, "springfield", name)
  await writeTenant(this, "shelbyville", name)
})
Given("Springfield's file contains {string}", async function(this: CapabilityWorld, defect: string) {
  const config: Record<string, unknown> = tenantConfig(this)
  let slug = "springfield"
  switch (defect) {
    case "empty name":
      config.displayName = ""
      break
    case "malformed JSON":
      break
    case "mismatched identity":
      slug = "shelbyville"
      break
    case "missing name":
      delete config.displayName
      break
    case "numeric name":
      config.displayName = 42
      break
    case "whitespace name":
      config.displayName = "   "
      break
    default:
      throw new Error(`Unknown defect: ${defect}`)
  }
  await fs.writeFile(
    path.join(this.directory, "springfield.json"),
    defect === "malformed JSON" ? "{broken" : JSON.stringify({ config, slug })
  )
})
When("application tenant resolution handles {string}", async function(this: CapabilityWorld, host: string) {
  this.tenantResult = await resolver(this).resolve({ host })
})
When("both tenant hosts are resolved concurrently", async function(this: CapabilityWorld) {
  const operations = resolver(this)
  this.tenantResults = await Promise.all(
    ["springfield", "shelbyville"].map((tenant) => operations.resolve({ host: `${tenant}.pathable.com` }))
  )
})
Then(
  "the resolved identity is {string} with name {string}",
  function(this: CapabilityWorld, tenant: string, name: string) {
    assert.ok(this.tenantResult?.kind === "ok")
    assert.equal(this.tenantResult.tenantId, tenant)
    assert.equal(this.tenantResult.config.displayName, name)
    assert.equal(this.tenantResult.origin, "host-associated")
  }
)
Then("the results have separate Springfield and Shelbyville identities", function(this: CapabilityWorld) {
  assert.deepEqual(
    this.tenantResults.map((result) =>
      result.kind === "ok" ? [result.tenantId, result.config.displayName] : result.kind
    ),
    [
      ["springfield", "Regional Training"],
      ["shelbyville", "Regional Training"]
    ]
  )
})
Then("tenant resolution reports {string} without configuration", function(this: CapabilityWorld, kind: string) {
  assert.equal(this.tenantResult?.kind, kind)
  assert.ok(this.tenantResult)
  assert.equal("config" in this.tenantResult, false)
  assert.doesNotMatch(JSON.stringify(this.tenantResult), /Springfield Demo|Shelbyville Demo/)
})
Given("Springfield configuration was read before the operator changed its name", async function(this: CapabilityWorld) {
  const result = await resolver(this).resolve({ host: "springfield.pathable.com" })
  assert.ok(result.kind === "ok")
  assert.equal(result.config.displayName, "Springfield Demo")
  await writeTenant(this, "springfield", "Springfield Training")
})
When("a fresh application resolver reads Springfield after the change", async function(this: CapabilityWorld) {
  this.tenantResult = await resolver(this).resolve({ host: "springfield.pathable.com" })
})
When("production tenant parsing receives inactivity choice {string}", function(this: CapabilityWorld, choice: string) {
  const { idleTimeoutMinutes: _duration, ...base } = tenantConfig(this)
  const value = Number.isNaN(Number(choice)) ? choice : Number(choice)
  this.parsedConfig = parseTenantConfig({ ...base, ...(choice === "omitted" ? {} : { idleTimeoutMinutes: value }) })
})
Then("the effective inactivity duration is {int} minutes", function(this: CapabilityWorld, minutes: number) {
  assert.ok(this.parsedConfig)
  assert.equal(effectiveIdleTimeoutMinutes(this.parsedConfig), minutes)
})
Then("the tenant configuration is rejected", function(this: CapabilityWorld) {
  assert.equal(this.parsedConfig, undefined)
})
