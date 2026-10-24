import type { Page } from "playwright"

import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { test } from "node:test"

import { applicationBrowser, freePort, spawnFrontend, stopProcess, waitUntilReady } from "../../support/oidc/harness.ts"

const host = "springfield.localhost:3000"
const tenantConfigDir = new URL("../../../fixtures/tenant-config", import.meta.url).pathname
const transactionPrefix = `preets:oidc:node-test:${randomUUID()}:`

interface SiteProcess {
  readonly port: number
  readonly stop: () => Promise<void>
}

const startSite = async (runtime: "development" | "production"): Promise<SiteProcess> => {
  const port = await freePort()
  const { child, logs } = await spawnFrontend(
    {
      allowInsecureLoopback: true,
      baseHostname: "localhost",
      callbackOrigins: { springfield: `http://${host}` },
      directory: tenantConfigDir,
      redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
      runtime,
      staticAlias: undefined,
      transactionPrefix,
      transactionTtlSeconds: 600
    },
    port
  )
  await waitUntilReady(child, logs)
  return { port, stop: () => stopProcess(child) }
}

const signIn = async (page: Page): Promise<void> => {
  await page.getByRole("textbox", { name: /username|email/i }).fill("demo")
  await page.getByRole("textbox", { exact: true, name: "Password" }).fill("demo")
  await page.getByRole("button", { name: /sign in/i }).click({ noWaitAfter: true })
}

await test("issue-level: a rejected provider return establishes no session or cookie", async () => {
  const site = await startSite("production")
  const owned = await applicationBrowser(site.port, [host])
  try {
    const context = await owned.browser.newContext()
    const page = await context.newPage()
    const response = await page.goto(
      `http://${host}/auth/callback?error=access_denied&error_description=controlled&state=wrong`
    )
    assert.equal(response?.status(), 200)
    assert.doesNotMatch(await page.locator("body").innerText(), /Welcome to the Pre-ETS workspace/)
    const names = (await context.cookies()).map((cookie) => cookie.name)
    assert.equal(names.includes("pathable-session"), false)
  } finally {
    await owned.close()
    await site.stop()
  }
})

await test("issue-level: a trusted but unconfirmed completion establishes no session or cookie", async () => {
  const site = await startSite("production")
  const owned = await applicationBrowser(site.port, [host])
  try {
    const context = await owned.browser.newContext()
    const page = await context.newPage()
    await page.goto(`http://${host}/`)
    await signIn(page)
    await page.waitForURL((url) => url.pathname === "/auth/callback").catch(() => undefined)
    const cookies = await context.cookies()
    assert.equal(cookies.some((cookie) => cookie.name === "pathable-session"), false)
    assert.equal(cookies.some((cookie) => cookie.name === "oidc-correlation"), false)
  } finally {
    await owned.close()
    await site.stop()
  }
})

await test("issue-level: confirmed-fresh success is recorded as blocked until the B6/#158 policy exists", (t) => {
  // The freshness confirmation is not implemented: a trusted identity is treated as
  // unconfirmed, so no session is established. The confirmed-fresh establishment and
  // independently scoped second-client read remain blocked and are exercised by the
  // quickstart probe (T031) under the frontend Vitest config once the policy exists.
  t.skip("blocked: the callback has no freshness confirmation, so it never establishes a session")
})
