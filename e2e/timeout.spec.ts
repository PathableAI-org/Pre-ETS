import {
  assertOldCookieDenied,
  assertSignedIn,
  expect,
  expire,
  login,
  readSession,
  session,
  showExpiration,
  submitCredentials,
  test
} from "./fixtures.ts"

test("server rejects the expired cookie before browser recovery", async ({ context, page }) => {
  await login(page)
  const original = await expire(context)
  await assertOldCookieDenied(original)
})

test("expiration provides accessible keyboard recovery", async ({ context, page }) => {
  await login(page)
  await expire(context)
  await showExpiration(page)
  const dialog = page.getByRole("dialog", { name: "Session ended due to inactivity" })
  await expect(dialog).toHaveAccessibleDescription(/Your session ended because of inactivity/)
  const action = dialog.getByRole("button", { exact: true, name: "Log in again" })
  await expect(action).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(action).toBeFocused()
  await page.keyboard.press("Shift+Tab")
  await expect(action).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeVisible()
  await expect(page.getByText("Unsent practice note", { exact: true })).toHaveCount(0)
})

test("login again completes real SSO and creates new application access", async ({ context, page }) => {
  await login(page)
  const original = await expire(context)
  await showExpiration(page)
  const callback = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/auth/callback" && response.status() >= 300 && response.status() < 400
  )
  await expect(page.getByRole("button", { exact: true, name: "Log in again" })).toBeFocused()
  await page.keyboard.press("Enter")
  await callback
  await assertSignedIn(page)
  const current = await session(context)
  expect(current.sid).not.toBe(original.sid)
  expect((await readSession(current.sid))?.userId).toBeTruthy()
  await expect(page.getByText("Unsent practice note", { exact: true })).toHaveCount(0)
  await assertOldCookieDenied(original)
})

test("failed recovery credentials deny access and allow a successful retry", async ({ context, page }) => {
  await login(page)
  const original = await expire(context)
  await showExpiration(page)
  await context.clearCookies({ domain: "127.0.0.1" })
  await page.getByRole("button", { exact: true, name: "Log in again" }).click()
  await submitCredentials(page, "incorrect-demo-password")
  await expect(page.getByText("Invalid username or password.", { exact: true })).toBeVisible()
  expect((await readSession((await session(context)).sid))?.userId).toBeUndefined()
  await assertOldCookieDenied(original)
  await submitCredentials(page)
  await assertSignedIn(page)
  expect((await session(context)).sid).not.toBe(original.sid)
})

test("both tabs remove protected content after shared session expiration", async ({ context, page }) => {
  await login(page)
  const second = await context.newPage()
  await second.goto("/")
  await assertSignedIn(second)
  await expect(second.getByText("Unsent practice note", { exact: true })).toBeVisible()
  await expire(context)
  await showExpiration(page)
  await expect(second.getByRole("dialog", { name: "Session ended due to inactivity" })).toBeVisible()
  await expect(second.getByText("Unsent practice note", { exact: true })).toHaveCount(0)
})
