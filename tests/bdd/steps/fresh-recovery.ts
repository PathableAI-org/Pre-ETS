import type { BrowserContext, Page } from "playwright"

import { After, Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import { setTimeout as delay } from "node:timers/promises"

import type { AppWorld } from "../support/world.ts"

import {
  applicationBrowser,
  documentText,
  isAuthorization,
  PROVIDER_ORIGIN,
  providerSignsInSilently,
  signInAtProvider
} from "../support/browser.ts"
import { startSite } from "../support/server.ts"
import { assertNotAdmitted } from "./expiration.ts"

const PROVIDER_ACCOUNT = `${PROVIDER_ORIGIN}/realms/pre-ets/account`

declare global {
  interface Window {
    /** Exposed by the journey: reports each `pageshow` and whether the page came from the back-forward cache. */
    preetsPageShown?: (persisted: boolean) => Promise<void>
  }
}

/**
 * One visitor's browser across the steps of a scenario: a context that already holds a provider single sign-on
 * session, the page in front, every authorization request sent, each answer to a provider return, and protected
 * documents served or restored from the back-forward cache since a mark.
 */
interface Journey {
  readonly authorizationRequests: URL[]
  authorizationsAtMark: number
  /** The `Set-Cookie` of each answer to a provider return at the journey's host, in order. */
  readonly callbackAnswers: Promise<{ readonly setCookie: string }>[]
  readonly close: () => Promise<void>
  readonly context: BrowserContext
  host: string
  page: Page
  protectedDocumentsSinceMark: string[]
  rememberedSession: string | undefined
  restoredDocumentsSinceMark: string[]
}

const journeys = new WeakMap<AppWorld, Journey>()

const journeyOf = (world: AppWorld): Journey => {
  const journey = journeys.get(world)
  assert.ok(journey, "expected the visitor's browser to be open")
  return journey
}

/**
 * Records what a page of the journey requests and is served: its authorization requests, and its protected documents.
 * Other pages of the context, such as a check of the provider session, are not the visitor's journey.
 */
const observeJourneyPage = (journey: Journey, page: Page): Page => {
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (isAuthorization(url)) journey.authorizationRequests.push(url)
  })
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
  const owned = await applicationBrowser(this.port, [host], undefined, false, true)
  const context = await owned.browser.newContext()
  const journey: Journey = {
    authorizationRequests: [],
    authorizationsAtMark: 0,
    callbackAnswers: [],
    close: owned.close,
    context,
    host,
    page: await context.newPage(),
    protectedDocumentsSinceMark: [],
    rememberedSession: undefined,
    restoredDocumentsSinceMark: []
  }
  journeys.set(this, journey)
  // A page restored from the back-forward cache sends no request, so its `pageshow` event is the only signal.
  await context.exposeBinding("preetsPageShown", ({ page }, persisted: boolean) => {
    const url = new URL(page.url())
    if (persisted && url.host === journey.host) journey.restoredDocumentsSinceMark.push(url.pathname)
  })
  await context.addInitScript(() => {
    globalThis.addEventListener("pageshow", (event) => {
      void globalThis.window.preetsPageShown?.(event.persisted)
    })
  })
  context.on("response", (response) => {
    const url = new URL(response.url())
    if (url.host !== journey.host || url.pathname !== "/auth/callback") return
    journey.callbackAnswers.push(
      response.allHeaders().then((headers) => ({ setCookie: headers["set-cookie"] ?? "" }))
    )
  })
  observeJourneyPage(journey, journey.page)
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
  journey.page = observeJourneyPage(journey, await journey.context.newPage())
  await journey.page.goto(`http://${journey.host}${entryPath}`)
})

When("the visitor refreshes the page", async function(this: AppWorld) {
  await journeyOf(this).page.reload()
})

When("the visitor navigates back in history", async function(this: AppWorld) {
  await journeyOf(this).page.goBack()
})

When("the visitor navigates forward in history", async function(this: AppWorld) {
  await journeyOf(this).page.goForward()
})

When("the visitor authenticates at the provider", async function(this: AppWorld) {
  const journey = journeyOf(this)
  // With a provider session held, the provider re-authenticates the known user with a password-only form.
  const page = journey.page
  await page.getByRole("textbox", { exact: true, name: "Password" }).fill("demo")
  await page.getByRole("button", { name: /sign in/i }).click()
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
  journey.restoredDocumentsSinceMark = []
})

When("the visitor logs out", async function(this: AppWorld) {
  const journey = journeyOf(this)
  await journey.page.getByRole("button", { name: "Log out" }).click()
  await journey.page.getByRole("heading", { name: "You are signed out" }).waitFor({ state: "visible" })
  journey.protectedDocumentsSinceMark = []
  journey.restoredDocumentsSinceMark = []
})

When("the visitor logs out in another page", async function(this: AppWorld) {
  const journey = journeyOf(this)
  const other = await journey.context.newPage()
  await other.goto(`http://${journey.host}/`)
  await other.getByRole("button", { name: "Log out" }).click()
  await other.getByRole("heading", { name: "You are signed out" }).waitFor({ state: "visible" })
  await other.close()
  journey.protectedDocumentsSinceMark = []
  journey.restoredDocumentsSinceMark = []
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
  const journey = journeyOf(this)
  assert.deepEqual(journey.protectedDocumentsSinceMark, [])
  assert.deepEqual(journey.restoredDocumentsSinceMark, [])
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
  await assertNotAdmitted(this, journey.host, journey.rememberedSession)
})

/**
 * PREETS-SESSION-013 AC3, observed directly: while the provider asks, the browser still holds a provider single
 * sign-on session that would answer the same authorization without `max_age` at once, so the ask is the fresh
 * authentication the application requested, not a first sign-in.
 */
Then("the provider still holds the visitor's single sign-on session", async function(this: AppWorld) {
  const journey = journeyOf(this)
  const latest = journey.authorizationRequests.at(-1)
  assert.ok(latest, "expected the application to start a provider login")
  assert.ok(
    await providerSignsInSilently(journey.context, latest),
    "expected the provider to sign the visitor in without asking"
  )
})

/**
 * The provider's authentication step offers no cancel control, so the visitor cancels by leaving it unanswered and
 * opening the application again in the same page. What the page shows next is for later steps.
 */
When(
  "the visitor leaves the provider's authentication step unanswered and opens {string} again",
  async function(this: AppWorld, entryPath: string) {
    const journey = journeyOf(this)
    await journey.page.getByRole("textbox", { exact: true, name: "Password" }).waitFor({ state: "visible" })
    journey.authorizationsAtMark = journey.authorizationRequests.length
    journey.protectedDocumentsSinceMark = []
    journey.restoredDocumentsSinceMark = []
    await journey.page.goto(`http://${journey.host}${entryPath}`)
  }
)

/**
 * Since the mark, the journey sent an authorization request with a state no earlier one carried: a login the
 * application started anew, not an earlier provider page requested again.
 */
Then("the application starts a new provider login", function(this: AppWorld) {
  const journey = journeyOf(this)
  const earlier = new Set(
    journey.authorizationRequests.slice(0, journey.authorizationsAtMark).map((url) => url.searchParams.get("state"))
  )
  const fresh = journey.authorizationRequests.slice(journey.authorizationsAtMark).filter((url) =>
    !earlier.has(url.searchParams.get("state"))
  )
  assert.ok(fresh.length > 0, "expected the application to start a new provider login")
})

/** PREETS-SESSION-013 AC5: the browser holds no session reference, or one that is not admitted. */
Then("the visitor holds no usable application session", async function(this: AppWorld) {
  const journey = journeyOf(this)
  const held = await sessionCookie(journey)
  if (held !== undefined) await assertNotAdmitted(this, journey.host, held)
})

/**
 * The answer to the provider's return issued no application session cookie, the browser holds none, and the page the
 * visitor was left on shows no protected text or control.
 */
Then("the provider's return establishes no application session and shows no protected content", async function(
  this: AppWorld
) {
  const journey = journeyOf(this)
  const answer = await journey.callbackAnswers.at(-1)
  assert.ok(answer, "expected the provider's return to reach the application")
  assert.doesNotMatch(answer.setCookie, /(?:^|\n)pathable-session=/)
  assert.equal(await sessionCookie(journey), undefined)
  const { page } = journey
  await page.waitForLoadState()
  assert.equal(await page.getByRole("button", { name: "Log out" }).count(), 0)
  assert.doesNotMatch(await documentText(page), /Reference session|Record reference operation/)
})
