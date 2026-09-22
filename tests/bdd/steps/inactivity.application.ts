import { Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"

import type { CapabilityWorld } from "../support/world.ts"

import { recordQualifyingActivity } from "../../../packages/frontend/src/lib/session/activity.ts"
import { guardAuthenticatedAccess } from "../../../packages/frontend/src/lib/session/guard.ts"
import { seedSession } from "../support/fixtures.ts"

Given(
  "an isolated authenticated session with a five-minute inactivity duration",
  async function(this: CapabilityWorld) {
    await seedSession(this, true)
  }
)
When(
  "the protected-operation guard runs {int} seconds after authentication",
  async function(this: CapabilityWorld, seconds: number) {
    this.now = this.baseTime + seconds
    this.guardResult = await guardAuthenticatedAccess({ sessionId: this.sessionId, tenantId: "springfield" }, {
      nowSeconds: () => this.now,
      store: this.store
    })
  }
)
Then("protected access is {string}", function(this: CapabilityWorld, outcome: string) {
  assert.equal(this.guardResult?.kind, outcome === "allowed" ? "allow" : "deny")
})
When(
  "qualifying activity is accepted {int} seconds after authentication",
  async function(this: CapabilityWorld, seconds: number) {
    await attemptActivity(this, seconds)
    assert.equal(this.activityResult?.kind, "renewed")
  }
)
When(
  "qualifying activity is attempted {int} seconds after authentication",
  async function(this: CapabilityWorld, seconds: number) {
    await attemptActivity(this, seconds)
  }
)
Then("activity is denied", function(this: CapabilityWorld) {
  assert.equal(this.activityResult?.kind, "denied")
})
Then(
  "the idle deadline is {int} seconds after authentication and absolute expiry is unchanged",
  async function(this: CapabilityWorld, seconds: number) {
    const loaded = await this.store.read(this.sessionId)
    assert.ok(loaded.kind === "record")
    assert.equal(loaded.record.idleExpiresAt, this.baseTime + seconds)
    assert.equal(loaded.record.expiresAt, this.originalRecord?.expiresAt)
  }
)
Then("the stored session has no authenticated identity and records inactivity", async function(this: CapabilityWorld) {
  const loaded = await this.store.read(this.sessionId)
  assert.ok(loaded.kind === "record")
  assert.equal(loaded.record.userId, undefined)
  assert.equal(loaded.record.userName, undefined)
  assert.equal(loaded.record.tenantId, "springfield")
  assert.equal(loaded.record.accessEndedCause, "inactivity")
})
Given("the authenticated record was removed", async function(this: CapabilityWorld) {
  await this.client.del(`${this.config.keyPrefix}${this.sessionId}`)
})
Then("access is denied without claiming inactivity", function(this: CapabilityWorld) {
  assert.ok(this.guardResult?.kind === "deny")
  assert.equal(this.guardResult.inactivity, false)
})

async function attemptActivity(world: CapabilityWorld, seconds: number): Promise<void> {
  world.now = world.baseTime + seconds
  world.activityResult = await recordQualifyingActivity({ cookieValue: world.cookie }, {
    config: world.config,
    nowSeconds: () => world.now,
    store: world.store
  })
}
