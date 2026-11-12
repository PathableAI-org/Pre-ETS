import type { BrowserContext, Page } from "playwright"

import { After, Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import { setTimeout as delay } from "node:timers/promises"

import type { AppWorld } from "../support/world.ts"

import { applicationBrowser, signInAtProvider } from "../support/browser.ts"
import { requestInstance, startSite } from "../support/server.ts"

/** The tracked realm's issuer, as the tenant fixtures configure it. */
const PROVIDER_ORIGIN = "http://127.0.0.1:8080"
const PROVIDER_ACCOUNT = `${PROVIDER_ORIGIN}/realms/pre-ets/account`

/**
 * One visitor's browser across the steps of a scenario: a context that already holds a provider single sign-on
 * session, the page in front, every authorization request sent, and protected documents served since a mark.
 */
interface Journey {
  readonly authorizationRequests: URL[]
  authorizationsAtMark: number
  readonly close: () => Promise<void>
  readonly context: BrowserContext
  host: string
  page: Page
  protectedDocumentsSinceMark: string[]
  rememberedSession: string | undefined
}

const journeys = new WeakMap<AppWorld, Journey>()

const journeyOf = (world: AppWorld): Journey => {
  const journey = journeys.get(world)
  assert.ok(journey, "expected the visitor's browser to be open")
  return journey
}

const observeProtectedDocuments = (journey: Journey, page: Page): Page => {
  page.on("response", (response) => {
    const url = new URL(response.url())
    if (url.host === journey.host && response.request().resourceType() === "document" && response.status() === 200) {
      journey.protectedDocumentsSinceMark.push(url.pathname)
    }
  })
  return page
}

const sessionCookie = async (journey: Journey): Promise<string | undefined> =>
  (await journey.context.cookies(`http://${journey.host}/`)).find((cookie) => cookie.name === "pathable-session")
    ?.value

After(async function(this: AppWorld) {
  const journey = journeys.get(this)
  journeys.delete(this)
  await journey?.close()
})

Given("the visitor holds a provider single sign-on session for {string}", async function(
  this: AppWorld,
  host: string
) {
  await startSite(this)
  const owned = await applicationBrowser(this.port, [host])
  const context = await owned.browser.newContext()
  const journey: Journey = {
    authorizationRequests: [],
    authorizationsAtMark: 0,
    close: owned.close,
    context,
    host,
    page: await context.newPage(),
    protectedDocumentsSinceMark: [],
    rememberedSession: undefined
  }
  journeys.set(this, journey)
  context.on("request", (request) => {
    const url = new URL(request.url())
    if (url.origin === PROVIDER_ORIGIN && url.pathname.endsWith("/protocol/openid-connect/auth")) {
      journey.authorizationRequests.push(url)
    }
  })
  observeProtectedDocuments(journey, journey.page)
  // Signing in directly at the provider, not through the application, leaves only a provider session. The provider
  // page runs its own client-side redirects, so it is closed once settled and the application opens in a new page.
  const providerPage = await context.newPage()
  await providerPage.goto(PROVIDER_ACCOUNT)
  await signInAtProvider(providerPage)
  await providerPage.waitForURL((url) => url.origin === PROVIDER_ORIGIN && !url.pathname.includes("login-actions"))
  await providerPage.waitForLoadState("networkidle")
  await providerPage.close()
  assert.equal(await sessionCookie(journey), undefined)
})

When("the visitor opens {string} in the browser", async function(this: AppWorld, entryPath: string) {
  const journey = journeyOf(this)
  await journey.page.goto(`http://${journey.host}${entryPath}`)
})

When("the visitor opens {string} in a new page", async function(this: AppWorld, entryPath: string) {
  const journey = journeyOf(this)
  journey.page = observeProtectedDocuments(journey, await journey.context.newPage())
  await journey.page.goto(`http://${journey.host}${entryPath}`)
})

When("the visitor refreshes the page", async function(this: AppWorld) {
  await journeyOf(this).page.reload()
})

When("the visitor navigates back in history", async function(this: AppWorld) {
  await journeyOf(this).page.goBack()
})

When("the visitor authenticates at the provider", async function(this: AppWorld) {
  const journey = journeyOf(this)
  // With a provider session held, the provider re-authenticates the known user with a password-only form.
  const page = journey.page
  await page.getByRole("textbox", { exact: true, name: "Password" }).fill("demo")
  await page.getByRole("button", { name: /sign in/i }).click({ noWaitAfter: true })
  await page.waitForURL((url) => url.host === journey.host)
})

/**
 * The provider records authentication times in whole seconds, so a request for fresh authentication within the same
 * second as the last one is already satisfied and the provider need not ask again. Real re-entry after idle expiry is
 * minutes later; the journey waits past that resolution so the provider's re-authentication step is observable.
 */
When("a few seconds pass since the visitor last authenticated", async function(this: AppWorld) {
  await delay(2_500)
})

When("the visitor remembers the current application session", async function(this: AppWorld) {
  const journey = journeyOf(this)
  journey.rememberedSession = await sessionCookie(journey)
  assert.ok(journey.rememberedSession, "expected an application session to remember")
  journey.authorizationsAtMark = journey.authorizationRequests.length
  journey.protectedDocumentsSinceMark = []
})

When("the visitor logs out", async function(this: AppWorld) {
  const journey = journeyOf(this)
  await journey.page.getByRole("button", { name: "Log out" }).click()
  await journey.page.getByRole("heading", { name: "You are signed out" }).waitFor({ state: "visible" })
  journey.protectedDocumentsSinceMark = []
})

When("the visitor activates Log in on the signed-out notice with the keyboard", async function(this: AppWorld) {
  const page = journeyOf(this).page
  await page.getByRole("link", { name: "Log in" }).focus()
  await page.keyboard.press("Enter")
})

Then("the provider asks the visitor to authenticate", async function(this: AppWorld) {
  const journey = journeyOf(this)
  await journey.page.getByRole("textbox", { exact: true, name: "Password" }).waitFor({ state: "visible" })
  assert.equal(new URL(journey.page.url()).origin, PROVIDER_ORIGIN)
  const latest = journey.authorizationRequests.at(-1)
  assert.ok(latest, "expected the application to start a provider login")
  assert.equal(latest.searchParams.get("max_age"), "0")
})

Then("no protected content was served before the provider asked", function(this: AppWorld) {
  assert.deepEqual(journeyOf(this).protectedDocumentsSinceMark, [])
})

Then("the protected application is shown", async function(this: AppWorld) {
  const journey = journeyOf(this)
  await journey.page.getByRole("button", { name: "Log out" }).waitFor({ state: "visible" })
  assert.equal(new URL(journey.page.url()).host, journey.host)
})

Then("the visitor holds an application session different from the remembered one", async function(this: AppWorld) {
  const journey = journeyOf(this)
  const current = await sessionCookie(journey)
  assert.ok(current, "expected a new application session")
  assert.notEqual(current, journey.rememberedSession)
})

Then("the protected application is shown without another provider login", async function(this: AppWorld) {
  const journey = journeyOf(this)
  await journey.page.getByRole("button", { name: "Log out" }).waitFor({ state: "visible" })
  assert.equal(journey.authorizationRequests.length, journey.authorizationsAtMark)
  assert.equal(await sessionCookie(journey), journey.rememberedSession)
})

Then("a request presenting the remembered session reference is not admitted", async function(this: AppWorld) {
  const journey = journeyOf(this)
  assert.ok(journey.rememberedSession, "expected a remembered session")
  const response = await requestInstance(
    this,
    this.port,
    journey.host,
    "/",
    true,
    `pathable-session=${journey.rememberedSession}`
  )
  assert.equal(response.status, 307)
  assert.equal(new URL(response.headers.location ?? "", `http://${journey.host}`).pathname, "/auth/login")
  assert.doesNotMatch(response.body, /Reference session/)
})
