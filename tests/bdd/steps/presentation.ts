import { Then } from "@cucumber/cucumber"
import assert from "node:assert/strict"

import type { AppWorld } from "../support/world.ts"

import { applicationBrowser, documentText, withSessionContext } from "../support/browser.ts"
import { startSite } from "../support/server.ts"

Then("invalid tenant navigation presents the ordinary missing page", async function(this: AppWorld) {
  const owned = await applicationBrowser(this.port, [
    "springfield.example.test",
    "capital-city.example.test",
    "example.test"
  ])
  const browser = owned.browser
  try {
    const page = await browser.newPage()
    const ordinary = await page.goto("http://springfield.example.test/_test/this-page-is-absent")
    assert.equal(ordinary?.status(), 404)
    const expected = await page.locator("body").innerText()
    assert.match(expected, /This page could not be found/)
    for (const host of ["capital-city.example.test", "example.test"]) {
      const response = await page.goto(`http://${host}/`)
      assert.equal(response?.status(), 404)
      const rendered = await page.locator("body").innerText()
      assert.equal(rendered.replace(/\s+/g, " ").trim(), expected.replace(/\s+/g, " ").trim())
    }
  } finally {
    await owned.close()
  }
})

/**
 * The browser presents the world's session reference to the named Host. Whether the forbidden page is rendered in place
 * or reached through navigation is open (PREETS-SESSION-005), so only the document the navigation ends on is observed:
 * its HTTP 403, a top-level heading that says access is denied, and no protected content.
 */
Then(
  "browser navigation to {string} at {string} presents the forbidden page",
  async function(this: AppWorld, entryPath: string, host: string) {
    await startSite(this)
    await withSessionContext(this.port, host, this.cookie, async (context) => {
      const page = await context.newPage()
      const response = await page.goto(`http://${host}${entryPath}`)
      assert.equal(response?.status(), 403)
      await page.getByRole("heading", { level: 1, name: /access denied|forbidden/i }).waitFor({ state: "visible" })
      assert.doesNotMatch(await documentText(page), /Reference session/)
    })
  }
)
