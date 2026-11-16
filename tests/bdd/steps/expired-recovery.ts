import type { Browser, Frame, Page, Response as PlaywrightResponse } from "playwright"

import { After, Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"

import type { AppWorld } from "../support/world.ts"

import {
  applicationBrowser,
  documentText,
  showsFocusIndicator,
  signInThroughApplication,
  suspendTimers
} from "../support/browser.ts"
import { multipartBody, serverActionId } from "../support/server-actions.ts"
import { FETCH_METADATA, requestSiteWith, startSite } from "../support/server.ts"
import { SESSION_END_COPY } from "./expiration.ts"
import { configuredIdleTimeout, setTenantPolicy } from "./tenant.ts"

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

Given("Springfield sessions end after {int} minutes of inactivity", async function(this: AppWorld, minutes: number) {
  await setTenantPolicy(this, "springfield", { idleTimeoutMinutes: minutes })
})

/** The tenant's warning lead (#156): the warning opens this many minutes before a session's idle deadline. */
Given("Springfield warns {int} minutes before its sessions end", async function(this: AppWorld, minutes: number) {
  await setTenantPolicy(this, "springfield", { warningLeadMinutes: minutes })
})

/**
 * Signs in through the application and the tracked provider in a real browser, then closes the page so no activity
 * renews the session. The world keeps the session reference so later raw requests present it.
 */
Given("the visitor has signed in at {string} through the provider", async function(this: AppWorld, host: string) {
  await startSite(this)
  const owned = await applicationBrowser(this.port, [host])
  const context = await owned.browser.newContext()
  this.cookie = await signInThroughApplication(context, host)
  visitors.set(this, { browser: owned.browser, close: owned.close, host, renewedAt: Date.now() })
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
    const { body, contentType } = await multipartBody([[`$ACTION_ID_${action}`, ""]])
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

/** The session-end copy whose heading is `heading`: its explanation and Log in action belong with that heading. */
const copyHeaded = (heading: string) => {
  const copy = SESSION_END_COPY.find((candidate) => candidate.heading === heading)
  assert.ok(copy, `expected a session-end explanation, not "${heading}"`)
  return copy
}

/** The single top-level heading of an HTML document, as text. */
const onlyHeading = (body: string): string => {
  const headings = [...body.matchAll(/<h1[^>]*>(.*?)<\/h1>/gs)].map((match) => match[1] ?? "")
  assert.equal(headings.length, 1, "expected exactly one top-level heading")
  return headings[0] ?? ""
}

/** The recovery document's heading, which it explains with the matching copy and the matching Log in link. */
const assertRecoveryDocument = (world: AppWorld): string => {
  assert.ok(world.response, "expected an HTTP response")
  const { body, headers } = world.response
  assert.match(headers["content-type"] ?? "", /^text\/html/)
  const heading = onlyHeading(body)
  const copy = copyHeaded(heading)
  const texts = [...body.matchAll(/>([^<>]+)</g)].map((match) => match[1]?.trim())
  assert.ok(texts.includes(copy.explanation), `expected the recovery document to explain "${copy.explanation}"`)
  const links = [...body.matchAll(/<a[^>]*href="\/"[^>]*>([^<]*)<\/a>/g)].map((match) => match[1])
  assert.deepEqual(links, [copy.logIn])
  return heading
}

/** The recovery copy is on the page: its explanation and its Log in link, under the heading already observed. */
const assertRecoveryCopy = async (page: Page, heading: string) => {
  const copy = copyHeaded(heading)
  await page.getByText(copy.explanation, { exact: true }).waitFor({ state: "visible" })
  await page.getByRole("link", { exact: true, name: copy.logIn }).waitFor({ state: "visible" })
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
  assertRecoveryDocument(this)
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
  if (options.suspendTimers) await suspendTimers.beforeLoad(page)
  await page.goto(`http://${host}/`)
  await page.getByRole("button", { name: "Record reference operation" }).waitFor({ state: "visible" })
  visitor.renewedAt = Date.now()
  // Timers stop from here on; the tab's clock stands still until a step sets it (research D13).
  if (options.suspendTimers) await suspendTimers.afterLoad(page)
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

/** Resolves when the page's main frame next commits a navigation, which replaces its document. */
const nextMainFrameCommit = (page: Page) =>
  new Promise<void>((resolve) => {
    const committed = (frame: Frame) => {
      if (frame !== page.mainFrame()) return
      page.off("framenavigated", committed)
      resolve()
    }
    page.on("framenavigated", committed)
  })

/**
 * Focuses the reference form's submit button and presses Enter, keeping the response to the form's `POST`: the
 * document navigation without scripts, or the Server Action fetch with scripts. A document submission's response
 * arrives before the tab commits the document it carries, and until then the submitting page is still loaded, so the
 * step waits for that commit and then for the new document to load; later steps read only the new document.
 */
When("the visitor submits the reference form by keyboard", async function(this: AppWorld) {
  const entry = entryOf(this)
  // The form posts to the page itself; the keyboard press also sends an activity report, which is not the submission.
  const page = new URL(entry.page.url()).pathname
  const submitted = entry.page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === page
  )
  const committed = nextMainFrameCommit(entry.page)
  await entry.page.getByRole("button", { name: "Record reference operation" }).focus()
  await entry.page.keyboard.press("Enter")
  entry.submission = await submitted
  if (entry.submission.request().isNavigationRequest()) await committed
  await entry.page.waitForLoadState("load")
})

/**
 * PREETS-SESSION-007 AC1, expiry between browser interaction and server receipt: the keyboard submission leaves the
 * browser well before the session's idle deadline, and request routing holds it there until 5 seconds after the
 * deadline before sending it on, so the server receives it only once the session has expired. The deadline counts
 * from the entry's own page load, which renewed the session; that renewal answered before `renewedAt`, so the server's
 * deadline is no later than the one used here, and the submission must leave at least a minute before it.
 */
When(
  "the visitor submits the reference form by keyboard before the session's idle deadline, and it reaches the server after it",
  { timeout: 8 * 60_000 },
  async function(this: AppWorld) {
    const entry = entryOf(this)
    const deadline = visitorOf(this).renewedAt + await configuredIdleTimeout(this, "springfield")
    const page = new URL(entry.page.url()).pathname
    const isSubmission = (url: URL) => url.pathname === page
    const sent: number[] = []
    await entry.page.route(isSubmission, async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback()
        return
      }
      sent.push(Date.now())
      await delay(Math.max(0, deadline + 5_000 - Date.now()))
      await route.continue()
    })
    const submitted = entry.page.waitForResponse(
      (response) => response.request().method() === "POST" && isSubmission(new URL(response.url())),
      { timeout: Math.max(0, deadline - Date.now()) + 60_000 }
    )
    const committed = nextMainFrameCommit(entry.page)
    await entry.page.getByRole("button", { name: "Record reference operation" }).focus()
    await entry.page.keyboard.press("Enter")
    entry.submission = await submitted
    if (entry.submission.request().isNavigationRequest()) await committed
    await entry.page.waitForLoadState("load")
    await entry.page.unroute(isSubmission)
    assert.equal(sent.length, 1, "expected one held submission")
    const [leftAt = Number.POSITIVE_INFINITY] = sent
    assert.ok(leftAt < deadline - 60_000, `the submission left ${String(deadline - leftAt)} ms before the deadline`)
  }
)

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

/** The document the submission without scripts loaded is the recovery document, and nothing protected remains. */
Then("the page displays the recovery document explaining {string}", async function(this: AppWorld, heading: string) {
  const { page } = entryOf(this)
  await page.getByRole("heading", { level: 1, name: heading }).waitFor({ state: "visible" })
  const headings = await page.getByRole("heading", { level: 1 }).allTextContents()
  assert.deepEqual(headings, [heading])
  await assertRecoveryCopy(page, heading)
  assert.equal(await page.getByRole("button", { name: "Record reference operation" }).count(), 0)
})

/**
 * The document the submission without scripts loaded is a recovery document, under either session-end heading: the
 * store keeps an expired record only briefly, so the server may explain the session as expired or as no longer
 * available. Nothing protected remains.
 */
Then("the page displays a recovery document with a Log in again link", async function(this: AppWorld) {
  const { page } = entryOf(this)
  const heading = page.getByRole("heading", { level: 1 })
  await heading.first().waitFor({ state: "visible" })
  const headings = await heading.allTextContents()
  assert.equal(headings.length, 1, "expected exactly one top-level heading")
  await assertRecoveryCopy(page, headings[0] ?? "")
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
    assert.ok(await showsFocusIndicator(page), "expected a visible focus indicator")
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
    await assertRecoveryCopy(page, heading)
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
