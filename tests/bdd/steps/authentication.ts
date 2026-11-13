import type { Page } from "playwright"

import { Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"

import type { AppWorld } from "../support/world.ts"

import { applicationBrowser, signInAtProvider as signIn } from "../support/browser.ts"
import { requestInstance, requestSite, startSecondSite, startSite } from "../support/server.ts"

type RecordedResponse = NonNullable<AppWorld["response"]>

const clearsCorrelation = (response: { headers: Record<string, string> }): boolean =>
  /(?:^|\n)oidc-correlation=;(?:[\s;]|$)/.test(response.headers["set-cookie"] ?? "")

const recordBrowserResponse = async (response: {
  allHeaders: () => Promise<Record<string, string>>
  status: () => number
  text: () => Promise<string>
}): Promise<RecordedResponse> => {
  const status = response.status()
  // A redirect or empty response has no readable body in the browser.
  const bodyless = status === 204 || (status >= 300 && status < 400)
  return {
    body: bodyless ? "" : await response.text(),
    headers: await response.allHeaders(),
    status
  }
}

const waitForCapturedCallback = async (
  callbacks: readonly { readonly cookie: string; readonly url: string }[]
) => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const callback = callbacks[0]
    if (callback !== undefined) return callback
    await delay(100)
  }
  throw new Error("Provider callback was not captured")
}

const captureProviderReturn = async (world: AppWorld, host: string) => {
  await startSecondSite(world)
  const owned = await applicationBrowser(world.port, [host], world.secondaryPort, true)
  try {
    const context = await owned.browser.newContext()
    const page = await context.newPage()
    await page.goto(`http://${host}/`)
    await signIn(page)
    return await waitForCapturedCallback(owned.callbacks)
  } finally {
    await owned.close()
  }
}

Given("the visitor supplies application cookie {string}", function(this: AppWorld, cookie: string) {
  this.cookie = cookie
})
/** Cookie values only: a fabricated reference never has a server-held record. */
const sessionReferences: Readonly<Record<string, () => string | undefined>> = {
  absent: () => undefined,
  malformed: () => "not-a-session-reference",
  "well-formed unknown": () => randomBytes(32).toString("base64url")
}
Given("the visitor's session reference is {string}", function(this: AppWorld, kind: string) {
  const reference = sessionReferences[kind]
  assert.ok(reference, `Unknown session reference kind ${kind}`)
  this.cookie = reference()
})
Given("the recoverable authentication lifetime is {int} second", function(this: AppWorld, seconds: number) {
  this.transactionTtlSeconds = seconds
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

/** The tenant's independently configured provider: its authorization endpoint and client. */
const tenantProvider = async (world: AppWorld, alias: string) => {
  const configuration = JSON.parse(await fs.readFile(path.join(world.directory, `${alias}.json`), "utf8")) as {
    oidc: { clientId: string; issuer: string }
  }
  return {
    authorization: new URL(`${configuration.oidc.issuer}/protocol/openid-connect/auth`),
    clientId: configuration.oidc.clientId
  }
}

const assertTenantAuthorization = (destination: URL, provider: Awaited<ReturnType<typeof tenantProvider>>) => {
  assert.equal(`${destination.origin}${destination.pathname}`, provider.authorization.href)
  assert.equal(destination.searchParams.get("client_id"), provider.clientId)
}

Then(
  "following the response at {string} reaches the {string} tenant provider",
  async function(this: AppWorld, host: string, alias: string) {
    const provider = await tenantProvider(this, alias)
    let response = this.response
    for (let hop = 0; hop < 5; hop++) {
      const location = response?.headers.location
      assert.ok(location, "expected the response to lead elsewhere")
      const destination = new URL(location, `http://${host}`)
      if (destination.host !== host) {
        assertTenantAuthorization(destination, provider)
        return
      }
      response = await requestInstance(this, this.port, host, `${destination.pathname}${destination.search}`)
    }
    assert.fail("the redirect chain did not leave the application")
  }
)

When(
  "the visitor opens {string} at {string} in a browser, refreshes a page showing it, and opens it in another page",
  async function(this: AppWorld, entryPath: string, host: string) {
    await startSite(this)
    const owned = await applicationBrowser(this.port, [host])
    try {
      const context = await owned.browser.newContext()
      if (this.cookie !== undefined) {
        await context.addCookies([{ name: "pathable-session", url: `http://${host}/`, value: this.cookie }])
      }
      const entry = `http://${host}${entryPath}`
      this.protectedDocuments = []
      const observe = (page: Page) =>
        page.on("response", (response) => {
          const url = new URL(response.url())
          if (url.host === host && response.request().resourceType() === "document" && response.status() === 200) {
            this.protectedDocuments.push(url.pathname)
          }
        })
      const first = observe(await context.newPage())
      await first.goto(entry)
      const opened = first.url()
      // A tab can show the entry only after an earlier view; without a usable session the application never renders
      // one, so an unobserved harness stub stands in for that earlier view and the browser's own reload is observed.
      const refreshed = await context.newPage()
      await refreshed.route(entry, (route) => route.fulfill({ body: "<p>Earlier view</p>", contentType: "text/html" }))
      await refreshed.goto(entry)
      await refreshed.unrouteAll()
      observe(refreshed)
      await refreshed.reload()
      const another = observe(await context.newPage())
      await another.goto(entry)
      this.browserEntries = [opened, refreshed.url(), another.url()]
    } finally {
      await owned.close()
    }
  }
)

Then(
  "each browser entry reaches the {string} tenant provider without protected content",
  async function(this: AppWorld, alias: string) {
    const provider = await tenantProvider(this, alias)
    assert.equal(this.browserEntries.length, 3)
    for (const entry of this.browserEntries) assertTenantAuthorization(new URL(entry), provider)
    assert.deepEqual(this.protectedDocuments, [])
  }
)

Then("each browser entry's authorization request asks for fresh authentication", function(this: AppWorld) {
  assert.equal(this.browserEntries.length, 3)
  for (const entry of this.browserEntries) assert.equal(new URL(entry).searchParams.get("max_age"), "0")
})

When("the visitor completes real provider sign-in across two application instances at {string}", async function(
  this: AppWorld,
  host: string
) {
  await startSecondSite(this)
  const owned = await applicationBrowser(this.port, [host], this.secondaryPort)
  try {
    const context = await owned.browser.newContext()
    const page = await context.newPage()
    await page.goto(`http://${host}/`)
    const callbackResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/auth/callback")
    await signIn(page)
    this.response = await recordBrowserResponse(await callbackResponse)
  } finally {
    await owned.close()
  }
})

When("the visitor signs in and then cancels at the real provider at {string}", async function(
  this: AppWorld,
  host: string
) {
  await startSite(this)
  const owned = await applicationBrowser(this.port, [host])
  try {
    const context = await owned.browser.newContext()
    const page = await context.newPage()
    await page.goto(`http://${host}/`)
    await signIn(page)
    // The provider's grant page offers to decline; declining returns the visitor to the application.
    const decline = page.getByRole("button", { name: "No" })
    await decline.waitFor({ state: "visible" })
    const callbackResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/auth/callback")
    await decline.click({ noWaitAfter: true })
    const response = await callbackResponse
    assert.equal(new URL(response.url()).searchParams.get("error"), "access_denied")
    this.response = await recordBrowserResponse(response)
  } finally {
    await owned.close()
  }
})

When("the visitor submits a matching controlled provider denial at {string}", async function(
  this: AppWorld,
  host: string
) {
  await requestSite(this, host, true, "/auth/login")
  assert.equal(this.response?.status, 307)
  const destination = new URL(this.response.headers.location ?? "")
  const state = destination.searchParams.get("state")
  assert.ok(state)
  const cookie = (this.response.headers["set-cookie"] ?? "").split(";", 1)[0]
  assert.ok(cookie)
  assert.match(cookie, /^oidc-correlation=/)
  this.response = await requestInstance(
    this,
    this.port,
    host,
    `/auth/callback?error=access_denied&error_description=controlled-private-value&state=${encodeURIComponent(state)}`,
    true,
    cookie
  )
})

When("the visitor submits a wrong-state callback before the captured valid return at {string}", async function(
  this: AppWorld,
  host: string
) {
  const captured = await captureProviderReturn(this, host)
  const valid = new URL(captured.url)
  const wrong = new URL(valid)
  wrong.searchParams.set("state", "wrong-state")
  this.earlierResponse = await requestInstance(
    this,
    this.port,
    host,
    `${wrong.pathname}${wrong.search}`,
    true,
    captured.cookie
  )
  this.response = await requestInstance(
    this,
    this.secondaryPort,
    host,
    `${valid.pathname}${valid.search}`,
    true,
    captured.cookie
  )
})

When("the captured Springfield return is first submitted to Shelbyville and then Springfield", async function(
  this: AppWorld
) {
  const captured = await captureProviderReturn(this, "springfield.localhost:3000")
  const valid = new URL(captured.url)
  this.earlierResponse = await requestInstance(
    this,
    this.port,
    "shelbyville.localhost:3000",
    `${valid.pathname}${valid.search}`,
    true,
    captured.cookie
  )
  this.response = await requestInstance(
    this,
    this.secondaryPort,
    "springfield.localhost:3000",
    `${valid.pathname}${valid.search}`,
    true,
    captured.cookie
  )
})

When("two application instances race the same captured valid return at {string}", async function(
  this: AppWorld,
  host: string
) {
  const captured = await captureProviderReturn(this, host)
  const valid = new URL(captured.url)
  const requestPath = `${valid.pathname}${valid.search}`
  this.callbackRaceResponses = await Promise.all([
    requestInstance(this, this.port, host, requestPath, true, captured.cookie),
    requestInstance(this, this.secondaryPort, host, requestPath, true, captured.cookie)
  ])
  this.response = this.callbackRaceResponses.find(clearsCorrelation)
  this.replayResponse = await requestInstance(this, this.port, host, requestPath, true, captured.cookie)
})

When("the visitor submits the captured provider return after it expires at {string}", async function(
  this: AppWorld,
  host: string
) {
  const captured = await captureProviderReturn(this, host)
  await delay((this.transactionTtlSeconds + 1) * 1_000)
  const valid = new URL(captured.url)
  this.response = await requestInstance(
    this,
    this.secondaryPort,
    host,
    `${valid.pathname}${valid.search}`,
    true,
    captured.cookie
  )
})

/** The `pathable-session` cookie headers the recorded response issued. */
const sessionCookieHeaders = (world: AppWorld): string[] =>
  (world.response?.headers["set-cookie"] ?? "").split("\n").filter((cookie) => cookie.startsWith("pathable-session="))

/** The one issued `pathable-session` cookie as a request `Cookie` value, without its attributes. */
const issuedSessionCookie = (world: AppWorld): string => {
  const [header] = sessionCookieHeaders(world)
  assert.ok(header, "expected one application session cookie")
  return header.split(";", 1)[0] ?? ""
}

const hostOnlySessionAttributes = [/^pathable-session=[^;]+;/, /HttpOnly/i, /SameSite=Lax/i, /Path=\//i]

Then("the response establishes a session and navigates to the application entry", function(this: AppWorld) {
  const response = this.response
  assert.ok(response, "expected an HTTP response")
  assert.equal(response.status, 303)
  assert.equal(response.headers.location, "/")
  const [session, ...others] = sessionCookieHeaders(this)
  assert.ok(session, "expected one application session cookie")
  assert.equal(others.length, 0)
  for (const attribute of hostOnlySessionAttributes) assert.match(session, attribute)
  assert.doesNotMatch(session, /(?:^|;\s*)Domain=/i)
  assert.ok(clearsCorrelation(response), "expected the recoverable correlation to be cleared")
})

Then("the established session admits the application entry at {string}", async function(
  this: AppWorld,
  host: string
) {
  const admitted = await requestInstance(this, this.port, host, "/", true, issuedSessionCookie(this))
  assert.equal(admitted.status, 200)
  assert.match(admitted.body, /Reference session/)
})

Then("exactly one raced callback consumes the return and replay does not", function(this: AppWorld) {
  assert.deepEqual(this.callbackRaceResponses.map((response) => response.status).sort(), [200, 303])
  assert.equal(this.callbackRaceResponses.filter(clearsCorrelation).length, 1)
  assert.equal(this.replayResponse?.status, 200)
  assert.ok(this.replayResponse)
  assert.equal(clearsCorrelation(this.replayResponse), false)
})
