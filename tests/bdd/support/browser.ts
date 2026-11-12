import type { Page } from "playwright"

export { applicationBrowser } from "./harness.ts"

/** Submits the tracked realm's synthetic user on the provider's sign-in form. */
export const signInAtProvider = async (page: Page): Promise<void> => {
  await page.getByRole("textbox", { name: /username|email/i }).fill("demo")
  await page.getByRole("textbox", { exact: true, name: "Password" }).fill("demo")
  await page.getByRole("button", { name: /sign in/i }).click({ noWaitAfter: true })
}
