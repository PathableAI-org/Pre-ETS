import { Then } from "@cucumber/cucumber"
import assert from "node:assert/strict"

import type { AppWorld } from "../support/world.ts"

import { applicationBrowser } from "../support/browser.ts"

Then("invalid tenant navigation presents the ordinary missing page", async function(this: AppWorld) {
  const owned = await applicationBrowser(this.port, [
    "springfield.example.test",
    "capital-city.example.test",
    "example.test"
  ])
  const browser = owned.browser
  try {
    const page = await browser.newPage()
    const ordinary = await page.goto("http://springfield.example.test/this-page-is-absent")
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
