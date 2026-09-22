import { Given, Then, When } from "@cucumber/cucumber"
import { expect } from "@playwright/test"
import assert from "node:assert/strict"
import { chromium } from "playwright"

import type { CapabilityWorld } from "../support/world.ts"

import { SESSION_COOKIE_NAME } from "../../../packages/frontend/src/lib/session/types.ts"
import { seedSession, writeConfidentialTenant, writeTenant } from "../support/fixtures.ts"
import { assertRenderedTenant } from "../support/presentation.ts"
import { startSite } from "../support/server.ts"

async function browser(world: CapabilityWorld): Promise<void> {
  world.staticAlias = "springfield"
  await startSite(world)
  world.browser = await chromium.launch()
  world.context = await world.browser.newContext()
  world.page = await world.context.newPage()
}
Given(
  "an explicitly seeded authenticated Springfield browser session with tenant name {string}",
  async function(this: CapabilityWorld, name: string) {
    await writeTenant(this, "springfield", name)
    await seedSession(this, true)
    await browser(this)
    assert.ok(this.context && this.cookie)
    await this.context.addCookies([{
      httpOnly: true,
      name: SESSION_COOKIE_NAME,
      sameSite: "Lax",
      url: `http://localhost:${String(this.port)}`,
      value: this.cookie
    }])
  }
)
When("the browser opens the protected workspace", async function(this: CapabilityWorld) {
  assert.ok(this.page)
  const response = await this.page.goto(`http://localhost:${String(this.port)}/`)
  assert.ok(response)
  assert.equal(response.status(), 200)
  await expect(this.page.getByRole("heading", { exact: true, name: "Welcome to the Pre-ETS workspace" })).toBeVisible()
  this.response = { body: "", headers: {}, status: response.status() }
})
Then(
  "the authenticated workspace visibly presents {string} as literal tenant text",
  async function(this: CapabilityWorld, name: string) {
    assert.ok(this.page && this.response)
    const locator = this.page.getByText(`Tenant: ${name}`, { exact: true })
    await expect(locator).toBeVisible()
    assertRenderedTenant(this.response.status, await locator.textContent(), name)
    assert.equal(await locator.locator("script").count(), 0)
    assert.equal(await locator.locator("demo").count(), 0)
  }
)
Then(
  "the workspace has an accessible heading and keyboard-operable continuation",
  async function(this: CapabilityWorld) {
    assert.ok(this.page)
    await expect(this.page.getByRole("heading", { level: 1 })).toHaveText("Welcome to the Pre-ETS workspace")
    const button = this.page.getByRole("button", { exact: true, name: "Continue to Pre-ETS" })
    for (let count = 0; count < 12; count++) {
      await this.page.keyboard.press("Tab")
      if (await button.evaluate((element) => element === document.activeElement)) break
    }
    await expect(button).toBeFocused()
    await expect(button).toBeVisible()
    await this.page.keyboard.press("Enter")
  }
)
When(
  "the server session is aged beyond inactivity and the browser requests confirmation",
  async function(this: CapabilityWorld) {
    assert.ok(this.page)
    await expect(this.page.getByText("Unsent practice note", { exact: true })).toBeVisible()
    await this.page.waitForLoadState("networkidle")
    const key = `${this.config.keyPrefix}${this.sessionId}`
    const raw = await this.client.get(key)
    assert.ok(raw)
    const record = await this.store.read(this.sessionId)
    assert.ok(record.kind === "record")
    const deadline = Math.floor(Date.now() / 1000) - 1
    const next = JSON.stringify({ ...record.record, idleExpiresAt: deadline, lastActivityAt: deadline - 300 })
    const changed = await this.client.eval(
      "if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL'); return 1",
      { arguments: [raw, next], keys: [key] }
    )
    assert.equal(changed, 1, "session changed while preparing expiration")
    assert.equal(await this.client.get(key), next)
    await this.page.evaluate(() => window.dispatchEvent(new Event("focus")))
  }
)
Then("the inactivity dialog names and describes the interruption", async function(this: CapabilityWorld) {
  assert.ok(this.page)
  const dialog = this.page.getByRole("dialog", { exact: true, name: "Session ended due to inactivity" })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAccessibleDescription(/Your session ended because of inactivity/)
})
Then("protected temporary content is removed", async function(this: CapabilityWorld) {
  assert.ok(this.page)
  await expect(this.page.getByText("Unsent practice note", { exact: true })).toHaveCount(0)
})
Then("recovery starts from a focused keyboard-operable Log in again button", async function(this: CapabilityWorld) {
  assert.ok(this.page)
  const dialog = this.page.getByRole("dialog", { exact: true, name: "Session ended due to inactivity" })
  const button = dialog.getByRole("button", { exact: true, name: "Log in again" })
  await expect(button).toBeFocused()
  await this.page.keyboard.press("Enter")
  await expect(this.page.getByRole("heading", { exact: true, name: "Mock provider login" })).toBeVisible()
  assert.equal(new URL(this.page.url()).searchParams.get("client_id"), "springfield-web")
})
Given(
  "a browser site whose Springfield login configuration requires a missing client secret",
  async function(this: CapabilityWorld) {
    await writeConfidentialTenant(this)
    await browser(this)
  }
)
When("the browser opens the tenant entry page", async function(this: CapabilityWorld) {
  assert.ok(this.page)
  await this.page.goto(`http://localhost:${String(this.port)}/`)
})
Then("accessible failure guidance explains that login cannot start", async function(this: CapabilityWorld) {
  assert.ok(this.page)
  await expect(this.page.getByRole("heading", { exact: true, name: "Login cannot start" })).toBeVisible()
  await expect(this.page.getByText(/contact/i)).toBeVisible()
})
