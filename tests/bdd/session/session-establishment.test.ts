import type { Page } from "playwright"

import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { test, type TestContext } from "node:test"

import { applicationBrowser, freePort, spawnFrontend, stopProcess, waitUntilReady } from "../../support/oidc/harness.ts"

const host = "springfield.localhost:3000"
const tenantConfigDir = new URL("../../../fixtures/tenant-config", import.meta.url).pathname
const sessionPrefix = `preets:session:node-test:${randomUUID()}:`
const transactionPrefix = `preets:oidc:node-test:${randomUUID()}:`

const startSite = async (t: TestContext, runtime: "development" | "production"): Promise<{ readonly port: number }> => {
  const port = await freePort()
  const { child, logs } = await spawnFrontend(
    {
      allowInsecureLoopback: true,
      baseHostname: "localhost",
      callbackOrigins: { springfield: `http://${host}` },
      directory: tenantConfigDir,
      redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
      runtime,
      sessionPrefix,
      staticAlias: undefined,
      transactionPrefix,
      transactionTtlSeconds: 600
    },
    port
  )
  t.after(() => stopProcess(child))
  await waitUntilReady(child, logs)
  return { port }
}

const openBrowser = async (t: TestContext, port: number) => {
  const owned = await applicationBrowser(port, [host])
  t.after(() => owned.close())
  return owned
}

const signIn = async (page: Page): Promise<void> => {
  await page.getByRole("textbox", { name: /username|email/i }).fill("demo")
  await page.getByRole("textbox", { exact: true, name: "Password" }).fill("demo")
  await page.getByRole("button", { name: /sign in/i }).click({ noWaitAfter: true })
}

await test("issue-level: a rejected provider return establishes no session or cookie", async (t) => {
  const site = await startSite(t, "production")
  const owned = await openBrowser(t, site.port)
  const context = await owned.browser.newContext()
  const page = await context.newPage()
  const response = await page.goto(
    `http://${host}/auth/callback?error=access_denied&error_description=controlled&state=wrong`
  )
  assert.equal(response?.status(), 200)
  assert.doesNotMatch(await page.locator("body").innerText(), /Welcome to the Pre-ETS workspace/)
  const names = (await context.cookies()).map((cookie) => cookie.name)
  assert.equal(names.includes("pathable-session"), false)
})

await test("issue-level: a safe provider return establishes no session or cookie", async (t) => {
  const site = await startSite(t, "production")
  const owned = await openBrowser(t, site.port)
  const context = await owned.browser.newContext()
  const page = await context.newPage()
  await page.goto(`http://${host}/`)
  const issued = await context.cookies()
  assert.equal(issued.some((cookie) => cookie.name === "oidc-correlation"), true)
  const callback = page.waitForResponse((response) => new URL(response.url()).pathname === "/auth/callback")
  await signIn(page)
  const response = await callback
  assert.equal(response.status(), 200)
  assert.equal(response.headers()["cache-control"], "private, no-store")
  const body = await response.text()
  assert.match(body, /Sign-in could not continue/)
  assert.match(body, /Return to the application entry/)
  assert.doesNotMatch(body, /Welcome to the Pre-ETS workspace/)
  const cookies = await context.cookies()
  assert.equal(cookies.some((cookie) => cookie.name === "pathable-session"), false)
  assert.equal(cookies.some((cookie) => cookie.name === "oidc-correlation"), false)
})

await test("issue-level: confirmed-fresh success is recorded as blocked until the B6/#158 policy exists", (t) => {
  // The freshness confirmation is not implemented: a trusted identity is treated as
  // unconfirmed, so no session is established. The confirmed-fresh establishment and
  // independently scoped second-client read remain blocked and are exercised by the
  // quickstart probe (T031) under the frontend Vitest config once the policy exists.
  t.skip("blocked: the callback has no freshness confirmation, so it never establishes a session")
})
