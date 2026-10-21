import { Given, Then } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"

import type { AppWorld } from "../support/world.ts"

import { applicationBrowser } from "../support/browser.ts"

Given("the visitor supplies application cookie {string}", function(this: AppWorld, cookie: string) {
  this.cookie = cookie
})
Given("Springfield preparation has {string}", async function(this: AppWorld, failure: string) {
  if (failure === "no callback origin") {
    this.callbackOrigins = {}
    return
  }
  assert.equal(failure, "unavailable provider")
  const selected = path.join(this.directory, "springfield.json")
  const configuration = JSON.parse(await fs.readFile(selected, "utf8")) as {
    oidc: { issuer: string }
  }
  configuration.oidc.issuer = "http://127.0.0.1:1/realms/unavailable"
  await fs.writeFile(selected, JSON.stringify(configuration))
})
Then("initiation uses the independently configured {string} tenant", async function(this: AppWorld, alias: string) {
  assert.equal(this.response?.status, 307)
  const configuration = JSON.parse(await fs.readFile(path.join(this.directory, `${alias}.json`), "utf8")) as {
    oidc: { clientId: string; issuer: string }
  }
  const destination = new URL(this.response.headers.location ?? "")
  assert.equal(destination.origin, new URL(configuration.oidc.issuer).origin)
  assert.equal(destination.pathname, `${new URL(configuration.oidc.issuer).pathname}/protocol/openid-connect/auth`)
  assert.equal(destination.searchParams.get("client_id"), configuration.oidc.clientId)
  assert.equal(destination.searchParams.get("redirect_uri"), `http://${alias}.localhost:3000/auth/callback`)
  assert.equal(destination.searchParams.get("response_type"), "code")
  assert.ok(destination.searchParams.get("scope")?.split(" ").includes("openid"))
  assert.equal(destination.searchParams.get("code_challenge_method"), "S256")
  assert.ok(destination.searchParams.get("code_challenge"))
  assert.ok(destination.searchParams.get("state"))
  assert.ok(destination.searchParams.get("nonce"))
})
Then("the authorization request asks for fresh authentication", function(this: AppWorld) {
  const destination = new URL(this.response?.headers.location ?? "")
  assert.equal(destination.searchParams.get("max_age"), "0")
})
Then("the response delegates to public sign-in failure", function(this: AppWorld) {
  assert.equal(this.response?.status, 307)
  assert.equal(this.response.headers.location, "/login-unavailable")
})
Then("browser entry at {string} reaches the real tenant provider", async function(this: AppWorld, host: string) {
  const destination = new URL(this.response?.headers.location ?? "")
  const owned = await applicationBrowser(this.port, [host])
  try {
    const context = await owned.browser.newContext()
    const page = await context.newPage()
    const response = await page.goto(`http://${host}/`)
    assert.equal(response?.status(), 200)
    const current = new URL(page.url())
    assert.equal(current.origin, destination.origin)
    assert.equal(current.pathname, destination.pathname)
    assert.equal(current.searchParams.get("client_id"), destination.searchParams.get("client_id"))
    await page.getByRole("textbox", { name: /username|email/i }).waitFor({ state: "visible" })
    const cookies = await context.cookies(`http://${host}/`)
    assert.equal(cookies.length, 0)
  } finally {
    await owned.close()
  }
})
Then("browser entry at {string} reaches public sign-in failure", async function(this: AppWorld, host: string) {
  const owned = await applicationBrowser(this.port, [host])
  try {
    const page = await owned.browser.newPage()
    const response = await page.goto(`http://${host}/`)
    assert.equal(response?.status(), 200)
    assert.equal(new URL(page.url()).pathname, "/login-unavailable")
    await page.getByRole("link", { name: "Try again" }).waitFor({ state: "visible" })
  } finally {
    await owned.close()
  }
})
