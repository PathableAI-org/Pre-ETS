import { assertSignedIn, expect, login, readSession, session, test } from "./fixtures.ts"

test("sign in through Keycloak and retain authenticated access on reload", async ({ context, page }) => {
  await login(page)
  const original = await session(context)
  expect((await readSession(original.sid))?.userId).toBeTruthy()
  await page.reload()
  await assertSignedIn(page)
  expect((await session(context)).sid).toBe(original.sid)
})
