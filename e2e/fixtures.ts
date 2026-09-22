import type { BrowserContext, Page } from "@playwright/test"

import { test as base, expect, request } from "@playwright/test"
import assert from "node:assert/strict"

import { verifySessionCookie } from "../packages/frontend/src/lib/session/cookie.ts"
import { parseSessionRecord, SESSION_COOKIE_NAME } from "../packages/frontend/src/lib/session/types.ts"
import { cleanupKeys, connectRedis } from "./redis.ts"

export const test = base.extend<{ isolated: undefined }>({
  isolated: [async ({ context }, use) => {
    try {
      await use(undefined)
    } finally {
      await context.close()
      await cleanupKeys()
    }
  }, { auto: true }]
})
export { expect } from "@playwright/test"

export async function assertOldCookieDenied(
  original: { cookie: string; sid: string }
): Promise<void> {
  const isolated = await request.newContext()
  try {
    const response = await isolated.get("http://localhost:3000/", {
      headers: { Accept: "text/html", Cookie: original.cookie, "sec-fetch-dest": "document" },
      maxRedirects: 0
    })
    expect([302, 303, 307, 308]).toContain(response.status())
    expect(response.headers().location).toContain("http://127.0.0.1:8080/realms/pre-ets/")
    expect(await response.text()).not.toContain("Signed in as:")
    expect((await readSession(original.sid))?.userId).toBeUndefined()
  } finally {
    await isolated.dispose()
  }
}

export async function assertSignedIn(page: Page): Promise<void> {
  await expect(page).toHaveURL("http://localhost:3000/")
  await expect(page.getByRole("heading", { name: "Welcome to the Pre-ETS workspace" })).toBeVisible()
  await expect(page.getByText("Tenant: Local Demo", { exact: true })).toBeVisible()
  await expect(page.getByText("Signed in as: Demo User", { exact: true })).toBeVisible()
}

export async function expire(context: BrowserContext) {
  for (const page of context.pages()) await page.waitForLoadState("networkidle")
  const original = await session(context)
  const client = await connectRedis()
  try {
    const key = `${sessionPrefix()}${original.sid}`
    const raw = await client.get(key)
    assert.ok(raw)
    const record = parseSessionRecord(JSON.parse(raw))
    assert.ok(record?.userId)
    assert.equal(record.idleDurationMinutes, 5)
    const deadline = Math.floor(Date.now() / 1000) - 1
    const next = JSON.stringify({ ...record, idleExpiresAt: deadline, lastActivityAt: deadline - 300 })
    const changed = await client.eval(
      "if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL'); return 1",
      { arguments: [raw, next], keys: [key] }
    )
    assert.equal(changed, 1, "session changed while preparing expiration")
    assert.equal(await client.get(key), next)
  } finally {
    client.destroy()
  }
  return original
}

export async function login(page: Page): Promise<void> {
  await page.goto("/")
  await expect(page).toHaveURL(/127\.0\.0\.1:8080\/realms\/pre-ets\//)
  const callback = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/auth/callback" && response.status() >= 300 && response.status() < 400
  )
  await submitCredentials(page)
  await callback
  await assertSignedIn(page)
  await expect(page.getByText("Unsent practice note", { exact: true })).toBeVisible()
}

export async function readSession(sid: string) {
  const client = await connectRedis()
  try {
    const raw = await client.get(`${sessionPrefix()}${sid}`)
    return raw === null ? undefined : parseSessionRecord(JSON.parse(raw))
  } finally {
    client.destroy()
  }
}

export async function session(context: BrowserContext) {
  const cookie = (await context.cookies("http://localhost:3000")).find((value) => value.name === SESSION_COOKIE_NAME)
  assert.ok(cookie)
  const secret = process.env.SESSION_SIGNING_SECRET
  assert.ok(secret)
  const claims = await verifySessionCookie(
    cookie.value,
    { signingSecret: Buffer.from(secret, "base64url") },
    Math.floor(Date.now() / 1000)
  )
  assert.ok(claims)
  return { cookie: `${cookie.name}=${cookie.value}`, sid: claims.sid }
}

export async function showExpiration(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await expect(page.getByRole("dialog", { name: "Session ended due to inactivity" })).toBeVisible()
  await expect(page.getByText("Unsent practice note", { exact: true })).toHaveCount(0)
}

export async function submitCredentials(page: Page, password = "demo"): Promise<void> {
  await page.getByLabel("Username or email", { exact: true }).fill("demo")
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByRole("button", { exact: true, name: "Sign In" }).click()
}

function sessionPrefix(): string {
  const prefix = process.env.SESSION_KEY_PREFIX
  assert.ok(prefix)
  assert.ok(prefix.startsWith("e2e:"))
  return prefix
}
