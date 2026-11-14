import type { Browser, Page, Response as PlaywrightResponse } from "playwright"

import { After, Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"

import type { AppWorld } from "../support/world.ts"

import { applicationBrowser, documentText, signInAtProvider } from "../support/browser.ts"
import { multipartBody, serverActionId } from "../support/server-actions.ts"
import { FETCH_METADATA, requestSiteWith, startSite } from "../support/server.ts"

/**
 * One visitor's real application session: the browser that signed in through the tracked provider, the host it
 * signed in at, and when the session was established (its idle deadline counts from then; nothing renews it later).
 */
interface SignedInVisitor {
  readonly browser: Browser
  readonly close: () => Promise<void>
  /** The application entry the visitor opened in a further context, once a step has opened it. */
  entry?: OpenEntry | undefined
  readonly host: string
  /** When a request last renewed the session: sign-in, then each opened protected page. */
  renewedAt: number
  /** A second tab of the entry's browser context, sharing its session, once a step has opened it. */
  second?: Page | undefined
}

const visitors = new WeakMap<AppWorld, SignedInVisitor>()

/** The page the visitor has open on the application entry, and the response to its latest form submission. */
interface OpenEntry {
  readonly page: Page
  submission?: PlaywrightResponse | undefined
}

const RECEIPT_COOKIE = "preets-ref-effect"

const visitorOf = (world: AppWorld): SignedInVisitor => {
  const visitor = visitors.get(world)
  assert.ok(visitor, "expected the visitor to have signed in")
  return visitor
}

After(async function(this: AppWorld) {
  const visitor = visitors.get(this)
  visitors.delete(this)
  await visitor?.close()
})

const entryOf = (world: AppWorld): OpenEntry => {
  const { entry } = visitorOf(world)
  assert.ok(entry, "expected the visitor to have the application entry open")
  return entry
}

/** Sets one session-policy field in the scenario-owned Springfield tenant file, which is read on each request. */
const setSpringfieldPolicy = async (
  world: AppWorld,
  field: "idleTimeoutMinutes" | "warningLeadMinutes",
  minutes: number
) => {
  assert.ok(world.ownedDirectory, "expected scenario-owned tenant sites")
  const file = path.join(world.directory, "springfield.json")
  const springfield = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>
  await fs.writeFile(file, JSON.stringify({ ...springfield, [field]: minutes }))
}

Given("Springfield sessions end after {int} minutes of inactivity", async function(this: AppWorld, minutes: number) {
  await setSpringfieldPolicy(this, "idleTimeoutMinutes", minutes)
})

/** The tenant's warning lead (#156): the warning opens this many minutes before a session's idle deadline. */
Given("Springfield warns {int} minutes before its sessions end", async function(this: AppWorld, minutes: number) {
  await setSpringfieldPolicy(this, "warningLeadMinutes", minutes)
})

/**
 * Signs in through the application and the tracked provider in a real browser, then closes the page so no activity
 * renews the session. The world keeps the session reference so later raw requests present it.
 */
Given("the visitor has signed in at {string} through the provider", async function(this: AppWorld, host: string) {
  await startSite(this)
  const owned = await applicationBrowser(this.port, [host])
  const context = await owned.browser.newContext()
  const page = await context.newPage()
  await page.goto(`http://${host}/`)
  await signInAtProvider(page)
  await page.waitForURL((url) => url.host === host)
  await page.getByRole("button", { name: "Log out" }).waitFor({ state: "visible" })
  const signedInAt = Date.now()
  const session = (await context.cookies(`http://${host}/`)).find((cookie) => cookie.name === "pathable-session")
  assert.ok(session, "expected an application session after signing in")
  this.cookie = session.value
  visitors.set(this, { browser: owned.browser, close: owned.close, host, renewedAt: signedInAt })
  await context.close()
})

/**
 * Another browser holding a copy of the session cookie logs out, so the server removes the record while the visitor's
 * own browser receives no notice of it (research D13). The visitor's reference stays in the world.
 */
When("the visitor's session record is removed by logging out in another browser", async function(this: AppWorld) {
  const visitor = visitorOf(this)
  assert.ok(this.cookie, "expected a session reference to copy")
  const other = await visitor.browser.newContext()
  await other.addCookies([{ name: "pathable-session", url: `http://${visitor.host}/`, value: this.cookie }])
  const page = await other.newPage()
  await page.goto(`http://${visitor.host}/`)
  await page.getByRole("button", { name: "Log out" }).click()
  await page.getByRole("heading", { name: "You are signed out" }).waitFor({ state: "visible" })
  await other.close()
})

/** Real elapsed time past the scenario tenant's idle timeout, counted from the latest renewal, plus a margin. */
When("the session's idle deadline passes without activity", { timeout: 7 * 60_000 }, async function(this: AppWorld) {
  const visitor = visitorOf(this)
  const file = path.join(this.directory, "springfield.json")
  const { idleTimeoutMinutes } = JSON.parse(await fs.readFile(file, "utf8")) as { idleTimeoutMinutes?: number }
  assert.ok(idleTimeoutMinutes !== undefined, "expected a scenario idle timeout")
  const deadline = visitor.renewedAt + idleTimeoutMinutes * 60_000
  await delay(Math.max(0, deadline + 5_000 - Date.now()))
})

/**
 * A browser form submission without scripts: a top-level `multipart/form-data` navigation `POST` to the page, naming
 * the Server Action in a `$ACTION_ID_` field as React's server-rendered form action does, with no `next-action` header.
 */
When(
  "the visitor submits the protected reference action without scripts at {string}",
  async function(this: AppWorld, host: string) {
    const action = await serverActionId("runReferenceOperation")
    const { body, contentType } = await multipartBody({ [`$ACTION_ID_${action}`]: "" })
    await requestSiteWith(this, {
      body,
      headers: {
        ...FETCH_METADATA.document,
        Accept: "text/html",
        "content-type": contentType,
        Origin: `http://${host}`,
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1"
      },
      host,
      method: "POST",
      path: "/"
    })
  }
)

const RECOVERY_HEADINGS = ["Your session expired", "Your session is no longer available"]

/** The single top-level heading of an HTML document, as text. */
const onlyHeading = (body: string): string => {
  const headings = [...body.matchAll(/<h1[^>]*>(.*?)<\/h1>/gs)].map((match) => match[1] ?? "")
  assert.equal(headings.length, 1, "expected exactly one top-level heading")
  return headings[0] ?? ""
}

const assertRecoveryDocument = (world: AppWorld): string => {
  assert.ok(world.response, "expected an HTTP response")
  assert.match(world.response.headers["content-type"] ?? "", /^text\/html/)
  assert.match(world.response.body, /<a[^>]*href="\/"[^>]*>Log in again<\/a>/)
  return onlyHeading(world.response.body)
}

Then("the response is the recovery document explaining {string}", function(this: AppWorld, heading: string) {
  assert.equal(assertRecoveryDocument(this), heading)
})

/** Exactly `text/plain`: Next's client reads the body as the rejection only for that type (research D3, L-4). */
Then("the response is the action denial token {string}", function(this: AppWorld, token: string) {
  assert.ok(this.response, "expected an HTTP response")
  assert.equal(this.response.headers["content-type"], "text/plain")
  assert.equal(this.response.body, token)
})

Then("the response is a recovery document with a Log in again link", function(this: AppWorld) {
  assert.ok(RECOVERY_HEADINGS.includes(assertRecoveryDocument(this)), "expected a session-end explanation")
})

Then("the response reveals no session reference, identity, or tenant", function(this: AppWorld) {
  assert.ok(this.response, "expected an HTTP response")
  assert.ok(this.cookie, "expected the visitor's session reference")
  const output = `${this.response.body}\n${Object.entries(this.response.headers).flat().join("\n")}`
  assert.ok(!output.includes(this.cookie), "the response repeats the session reference")
  assert.doesNotMatch(output, /pathable-session|springfield|shelbyville|\bdemo\b|id_token|access_token/i)
})

/**
 * A new browser context of the visitor's browser that presents the visitor's session, with scripts enabled or
 * disabled, opened on the application entry and showing the protected reference form.
 */
const openEntry = async (world: AppWorld, host: string, options: {
  readonly scripts: boolean
  readonly suspendTimers: boolean
}) => {
  const visitor = visitorOf(world)
  assert.ok(world.cookie, "expected the visitor's session reference")
  const context = await visitor.browser.newContext({ javaScriptEnabled: options.scripts })
  await context.addCookies([{ name: "pathable-session", url: `http://${host}/`, value: world.cookie }])
  const page = await context.newPage()
  if (options.suspendTimers) await page.clock.install()
  await page.goto(`http://${host}/`)
  await page.getByRole("button", { name: "Record reference operation" }).waitFor({ state: "visible" })
  visitor.renewedAt = Date.now()
  // Timers stop from here on; the tab's clock stands still until a step sets it (research D13).
  if (options.suspendTimers) await page.clock.pauseAt(Date.now() + 1_000)
  visitor.entry = { page }
}

Given(
  "the visitor opens the application entry at {string} with scripts {word}",
  async function(this: AppWorld, host: string, scripts: string) {
    assert.ok(scripts === "enabled" || scripts === "disabled", "expected scripts enabled or disabled")
    await openEntry(this, host, { scripts: scripts === "enabled", suspendTimers: false })
  }
)

/** Scripts run, but the page's timers are paused under Playwright's clock right after it loads. */
Given(
  "the visitor opens the application entry at {string} with its timers suspended",
  async function(this: AppWorld, host: string) {
    await openEntry(this, host, { scripts: true, suspendTimers: true })
  }
)

/** The tab's clock jumps to wall time while every timer stays paused, as after a suspended device wakes. */
When("the tab's clock is set to the current time without running its timers", async function(this: AppWorld) {
  await entryOf(this).page.clock.setSystemTime(Date.now())
})

/** Another tab in the entry's browser context: it shares the session and the cross-tab channel. */
Given("the visitor opens a second tab on the application entry", async function(this: AppWorld) {
  const visitor = visitorOf(this)
  const { page } = entryOf(this)
  const second = await page.context().newPage()
  await second.goto(page.url())
  await second.getByRole("button", { name: "Record reference operation" }).waitFor({ state: "visible" })
  visitor.renewedAt = Date.now()
  visitor.second = second
})

const secondTabOf = (world: AppWorld): Page => {
  const { second } = visitorOf(world)
  assert.ok(second, "expected a second tab")
  return second
}

When("the visitor logs out in the second tab", async function(this: AppWorld) {
  const second = secondTabOf(this)
  await second.getByRole("button", { name: "Log out" }).click()
  await second.getByRole("heading", { name: "You are signed out" }).waitFor({ state: "visible" })
})

/**
 * Focuses the reference form's submit button and presses Enter, keeping the response to the form's `POST`: the
 * document navigation without scripts, or the Server Action fetch with scripts.
 */
When("the visitor submits the reference form by keyboard", async function(this: AppWorld) {
  const entry = entryOf(this)
  // The form posts to the page itself; the keyboard press also sends an activity report, which is not the submission.
  const page = new URL(entry.page.url()).pathname
  const submitted = entry.page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === page
  )
  await entry.page.getByRole("button", { name: "Record reference operation" }).focus()
  await entry.page.keyboard.press("Enter")
  entry.submission = await submitted
  await entry.page.waitForLoadState()
})

Then(
  "the form submission is a {word} request answered with status {int}",
  function(this: AppWorld, kind: string, status: number) {
    const { submission } = entryOf(this)
    assert.ok(submission, "expected a form submission")
    assert.equal(submission.request().isNavigationRequest(), kind === "document", `expected a ${kind} request`)
    if (kind === "document") {
      assert.match(
        submission.request().headers()["content-type"] ?? "",
        /^(multipart\/form-data|application\/x-www-form-urlencoded)/
      )
    }
    assert.equal(submission.status(), status)
  }
)

Then("the browser holds no reference-operation receipt", async function(this: AppWorld) {
  const cookies = await entryOf(this).page.context().cookies()
  assert.ok(!cookies.some((cookie) => cookie.name === RECEIPT_COOKIE), "a reference-operation receipt was issued")
})

Then("the browser holds a reference-operation receipt", async function(this: AppWorld) {
  const cookies = await entryOf(this).page.context().cookies()
  assert.ok(cookies.some((cookie) => cookie.name === RECEIPT_COOKIE), "expected a reference-operation receipt")
})

Then("the page shows the status {string}", async function(this: AppWorld, message: string) {
  await entryOf(this).page.getByRole("status").filter({ hasText: message }).waitFor({ state: "visible" })
})

Then("the page displays the recovery document explaining {string}", async function(this: AppWorld, heading: string) {
  const { page } = entryOf(this)
  const headings = await page.getByRole("heading", { level: 1 }).allTextContents()
  assert.deepEqual(headings, [heading])
  assert.equal(await page.getByRole("button", { name: "Record reference operation" }).count(), 0)
})

/**
 * Tabs from the top of the document to the Log in link, requires a visible keyboard focus indicator on it, and
 * activates it with Enter, which navigates the tab to the application entry (the fresh-entry boundary).
 */
Then(
  "{string} is reachable by keyboard with visible focus and opens the application entry",
  async function(this: AppWorld, name: string) {
    const { page } = entryOf(this)
    const link = page.getByRole("link", { name })
    let focused = false
    for (let presses = 0; presses < 10 && !focused; presses += 1) {
      await page.keyboard.press("Tab")
      focused = await link.evaluate((element) => element === document.activeElement)
    }
    assert.ok(focused, `expected Tab to reach "${name}"`)
    const indicator = await link.evaluate((element) => ({
      focusVisible: element.matches(":focus-visible"),
      outline: getComputedStyle(element).outlineStyle
    }))
    assert.ok(indicator.focusVisible && indicator.outline !== "none", "expected a visible focus indicator")
    const host = new URL(page.url()).host
    const entry = page.waitForRequest((request) =>
      request.isNavigationRequest() && request.method() === "GET" && request.url() === `http://${host}/`
    )
    await page.keyboard.press("Enter")
    await entry
  }
)

Then(
  "the form submission was answered with the action denial token {string}",
  async function(this: AppWorld, token: string) {
    const { submission } = entryOf(this)
    assert.ok(submission, "expected a form submission")
    assert.equal(submission.headers()["content-type"], "text/plain")
    assert.equal(await submission.text(), token)
  }
)

/** Protected text the reference page renders; none of it may remain once recovery replaced the content. */
const PROTECTED_TEXT = /Reference session|Record reference operation|springfield|Log out/i

/**
 * Recovery replaced the header and protected content: one top-level heading with the explanation, the Log in again
 * link, and no earlier protected text or control left in the document, visible or not.
 */
Then(
  "the tab shows recovery explaining {string} in place of its content",
  async function(this: AppWorld, heading: string) {
    const { page } = entryOf(this)
    await page.getByRole("heading", { level: 1, name: heading }).waitFor({ state: "visible" })
    assert.deepEqual(await page.getByRole("heading", { level: 1 }).allTextContents(), [heading])
    await page.getByRole("link", { name: "Log in again" }).waitFor({ state: "visible" })
    assert.doesNotMatch(await documentText(page), PROTECTED_TEXT)
    const tree = await page.locator("body").ariaSnapshot()
    assert.doesNotMatch(tree, PROTECTED_TEXT)
    assert.equal(await page.locator("form, button").count(), 0, "a protected control remains in the document")
  }
)

Then("focus is on the recovery heading", async function(this: AppWorld) {
  const focused = await entryOf(this).page.evaluate(() => ({
    level: document.activeElement?.tagName,
    target: document.activeElement?.getAttribute("data-preets-focus")
  }))
  assert.deepEqual(focused, { level: "H1", target: "recovery_heading" })
})

Then("the second tab still shows its protected content", async function(this: AppWorld) {
  const second = secondTabOf(this)
  assert.ok(await second.getByRole("button", { name: "Record reference operation" }).isVisible())
  assert.ok(await second.getByRole("heading", { name: "Reference session" }).isVisible())
  assert.equal(await second.getByRole("heading", { name: /Your session/ }).count(), 0)
})

Then("the first tab shows the signed-out notice and no recovery content", async function(this: AppWorld) {
  const { page } = entryOf(this)
  await page.getByRole("heading", { name: "You are signed out" }).waitFor({ state: "visible" })
  assert.equal(await page.getByRole("heading", { name: /Your session/ }).count(), 0)
  assert.equal(await page.getByRole("button", { name: "Record reference operation" }).count(), 0)
})
