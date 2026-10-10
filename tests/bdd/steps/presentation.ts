import { Then } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import { chromium } from "playwright"

import type { AppWorld } from "../support/world.ts"

Then("invalid tenant navigation presents the ordinary missing page", async function(this: AppWorld) {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    // Route browser navigation to the owned process while preserving the
    // logical hostname. No external DNS or infrastructure ingress is tested.
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url())
      const response = await route.fetch({
        headers: { ...route.request().headers(), host: url.hostname },
        url: `http://127.0.0.1:${String(this.port)}${url.pathname}${url.search}`
      })
      await route.fulfill({ response })
    })
    const ordinary = await page.goto("http://springfield.example.test/this-page-is-absent")
    assert.equal(ordinary?.status(), 404)
    await page.getByRole("heading", { exact: true, name: "404" }).waitFor({ state: "visible" })
    const expected = await page.locator("body").innerText()
    assert.match(expected, /This page could not be found/)
    for (const host of ["capital-city.example.test", "example.test"]) {
      const response = await page.goto(`http://${host}/`)
      assert.equal(response?.status(), 404)
      await page.getByRole("heading", { exact: true, name: "404" }).waitFor({ state: "visible" })
      assert.equal(await page.locator("body").innerText(), expected)
    }
  } finally {
    await browser.close()
  }
})
