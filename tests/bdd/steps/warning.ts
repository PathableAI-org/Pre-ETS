import type { Page, Request as PlaywrightRequest, Response as PlaywrightResponse } from "playwright"

import { Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import { setTimeout as delay } from "node:timers/promises"

import type { AppWorld } from "../support/world.ts"

import { exposedControls } from "../support/browser.ts"
import {
  BOUND_MILLISECONDS,
  EXPIRED_COPY,
  heldDeadline,
  namesOf,
  OFFSET_TOLERANCE_MILLISECONDS,
  openTabIn,
  openTabs,
  pressEscapeAndClickOutside,
  pressKeyAndAwaitPost,
  PROTECTED_CONTROL,
  resumptionOf,
  sessionHeader,
  SPRINGFIELD,
  type Tab,
  tabOf,
  typeIn,
  untilBefore
} from "./expiration.ts"
import { setTenantPolicy } from "./expired-recovery.ts"

/** The warning's name and the alert after a Continue that did not renew (#156 research D9). */
const WARNING = {
  action: "Continue",
  explanation: "For your security, your session will end soon because of inactivity. Select Continue to keep working.",
  failure: "We could not continue your session. Try again.",
  heading: "Your session is about to expire"
}
const MINUTE_MILLISECONDS = 60_000
/** How long after a threshold or renewal a step waits for the warning to open or close before failing. */
const OBSERVATION_MILLISECONDS = 15_000

/** One change of the warning in a tab: when it opened or closed, by the page's clock, which is the test's. */
interface WarningChange {
  readonly at: number
  readonly open: boolean
}

declare global {
  interface Window {
    /** Set by warning scenarios: each time the warning opened or closed in this document. */
    preetsWarningLog?: WarningChange[]
  }
}

/** Per scenario: each observed tab's threshold under measurement, and the latest renewal response, by the test clock. */
interface Measured {
  renewedAt?: number | undefined
  readonly thresholds: Map<string, { readonly from: number; readonly threshold: number }>
}

const measured = new WeakMap<AppWorld, Measured>()

const measuredOf = (world: AppWorld): Measured => {
  const existing = measured.get(world)
  if (existing !== undefined) return existing
  const created: Measured = { thresholds: new Map() }
  measured.set(world, created)
  return created
}

/**
 * Starts recording, in the page, each time a dialog named as the warning opens or closes. A warning already open when
 * recording starts is recorded as opening then.
 */
const observeWarning = (page: Page) =>
  page.evaluate((heading) => {
    if (globalThis.window.preetsWarningLog !== undefined) return
    const log: WarningChange[] = []
    globalThis.window.preetsWarningLog = log
    const isOpen = () =>
      [...document.querySelectorAll("[role=dialog]")].some((dialog) =>
        document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")?.textContent === heading
      )
    let open = false
    const record = () => {
      if (isOpen() === open) return
      open = !open
      log.push({ at: Date.now(), open })
    }
    record()
    new MutationObserver(record).observe(document.body, { childList: true, subtree: true })
  }, WARNING.heading)

const warningLog = (page: Page): Promise<WarningChange[]> =>
  page.evaluate(() => globalThis.window.preetsWarningLog ?? [])

/** Observes the warning in every open tab of the scenario, before any threshold under measurement. */
const observeAllTabs = async (world: AppWorld) => {
  for (const tab of await openTabs(world)) await observeWarning(tab.page)
}

/**
 * Waits until the tab records the warning opening, or closing, at or after `from`, and answers when. Fails once
 * `until` passes on the test's clock.
 */
const changeAfter = async (tab: Tab, open: boolean, from: number, until: number): Promise<number> => {
  for (;;) {
    const change = (await warningLog(tab.page)).find((entry) => entry.open === open && entry.at >= from)
    if (change !== undefined) return change.at
    assert.ok(Date.now() < until, `expected the warning to ${open ? "open" : "close"}`)
    await delay(50)
  }
}

/** The tab's warning threshold on the test's clock: its held deadline minus its held lead (#156 research D2). */
const heldThreshold = async (tab: Tab): Promise<number> => {
  const lead = Number(await sessionHeader(tab.page).getAttribute("data-session-warning-lead"))
  assert.ok(lead > 0, "expected the tab to hold a positive warning lead")
  tab.deadline = await heldDeadline(tab.page)
  return tab.deadline - lead * MINUTE_MILLISECONDS
}

const warningIn = (page: Page) => page.getByRole("dialog", { name: WARNING.heading })

/** The focused element is the warning's Continue button. */
const focusedOnContinue = (page: Page) =>
  page.evaluate((action) => {
    const active = document.activeElement
    return active?.tagName === "BUTTON" && active.textContent === action && active.closest("[role=dialog]") !== null
  }, WARNING.action)

const reachThresholds = async (world: AppWorld, names: readonly string[]) => {
  await observeAllTabs(world)
  const from = Date.now()
  const thresholds = await Promise.all(names.map((name) => heldThreshold(tabOf(world, name))))
  names.forEach((name, index) => {
    measuredOf(world).thresholds.set(name, { from, threshold: thresholds[index] ?? Number.NaN })
  })
  await untilBefore(Math.max(...thresholds), 0)
}

When("tabs {} reach their warning threshold", { timeout: 7 * 60_000 }, async function(this: AppWorld, list: string) {
  await reachThresholds(this, namesOf(list))
})

When("tab {string} reaches its warning threshold", { timeout: 7 * 60_000 }, async function(
  this: AppWorld,
  name: string
) {
  await reachThresholds(this, [name])
})

/**
 * FR-005, FR-006, FR-015 (focus entry): each tab opened the warning no earlier than its threshold and within 2 s of
 * it, and Continue has focus.
 */
const assertWarnedAtThreshold = async (world: AppWorld, names: readonly string[]) => {
  for (const name of names) {
    const tab = tabOf(world, name)
    const measure = measuredOf(world).thresholds.get(name)
    assert.ok(measure, `expected tab "${name}" to have reached its warning threshold`)
    const opened = await changeAfter(tab, true, measure.from, measure.threshold + OBSERVATION_MILLISECONDS)
    const late = opened - measure.threshold
    assert.ok(late >= -OFFSET_TOLERANCE_MILLISECONDS, `tab "${name}" warned ${String(-late)} ms before its threshold`)
    assert.ok(late <= BOUND_MILLISECONDS, `tab "${name}" warned ${String(late)} ms after its threshold`)
    await warningIn(tab.page).waitFor({ state: "visible" })
    assert.equal(await focusedOnContinue(tab.page), true, `expected focus on Continue in tab "${name}"`)
  }
}

Then(
  "tabs {} each show the warning within 2 seconds of their warning threshold, with focus on Continue",
  { timeout: 60_000 },
  async function(this: AppWorld, list: string) {
    await assertWarnedAtThreshold(this, namesOf(list))
  }
)

Then(
  "tab {string} shows the warning within 2 seconds of its warning threshold, with focus on Continue",
  { timeout: 60_000 },
  async function(this: AppWorld, name: string) {
    await assertWarnedAtThreshold(this, [name])
  }
)

/** No warning is open in the tab, and none opened since its warning was first observed. */
const assertNoWarning = async (tab: Tab, name: string) => {
  assert.equal(await warningIn(tab.page).count(), 0, `tab "${name}" shows the warning`)
  assert.deepEqual((await warningLog(tab.page)).filter((change) => change.open), [], `tab "${name}" warned`)
}

Then("tabs {} show no warning", async function(this: AppWorld, list: string) {
  for (const name of namesOf(list)) await assertNoWarning(tabOf(this, name), name)
})

/** The tab's held deadline is the one last read, within its clock-offset estimate: nothing renewed the session. */
const assertDeadlineUnchanged = async (tab: Tab, name: string) => {
  const drift = Math.abs((await heldDeadline(tab.page)) - tab.deadline)
  assert.ok(drift <= OFFSET_TOLERANCE_MILLISECONDS, `the deadline of tab "${name}" moved by ${String(drift)} ms`)
}

/** FR-018: nothing of another session's warning or renewal reached the tab. */
Then("tab {string} shows no warning and holds its deadline unchanged", async function(this: AppWorld, name: string) {
  const tab = tabOf(this, name)
  await assertNoWarning(tab, name)
  await assertDeadlineUnchanged(tab, name)
})

/** FR-009, FR-011: the warning is still open in each tab, it never closed, and no renewal moved the deadline. */
const assertWarningStaysOpen = async (world: AppWorld, names: readonly string[]) => {
  for (const name of names) {
    const tab = tabOf(world, name)
    await warningIn(tab.page).waitFor({ state: "visible" })
    const closed = (await warningLog(tab.page)).filter((change) => !change.open)
    assert.deepEqual(closed, [], `the warning closed in tab "${name}"`)
    await assertDeadlineUnchanged(tab, name)
  }
}

Then("the warning stays open in tabs {} with their deadline unchanged", async function(this: AppWorld, list: string) {
  await assertWarningStaysOpen(this, namesOf(list))
})

Then(
  "the warning stays open in tab {string} with its deadline unchanged",
  async function(this: AppWorld, name: string) {
    await assertWarningStaysOpen(this, [name])
  }
)

When("the visitor presses Escape and clicks outside the warning in tab {string}", async function(
  this: AppWorld,
  name: string
) {
  await pressEscapeAndClickOutside(tabOf(this, name).page)
})

/** Request routing answers the tab's next activity report with 503, as a server error would (research D14). */
When("the next activity report from tab {string} fails with a server error", async function(
  this: AppWorld,
  name: string
) {
  await tabOf(this, name).page.route("**/session/activity", (route) => route.fulfill({ status: 503 }), { times: 1 })
})

When("the visitor clicks Continue in tab {string}", async function(this: AppWorld, name: string) {
  const { page } = tabOf(this, name)
  const answered = page.waitForResponse((response) => new URL(response.url()).pathname === "/session/activity")
  await warningIn(page).getByRole("button", { name: WARNING.action }).click()
  await answered
})

Then("tab {string} says the session could not be continued", async function(this: AppWorld, name: string) {
  const alert = warningIn(tabOf(this, name).page).getByRole("alert")
  await alert.waitFor({ state: "visible" })
  assert.equal((await alert.textContent())?.trim(), WARNING.failure)
})

/** Focuses Continue and presses Enter or Space; the step ends when the server answered, and records when that was. */
When("the visitor activates Continue with {word} in tab {string}", async function(
  this: AppWorld,
  key: string,
  name: string
) {
  assert.ok(key === "Enter" || key === "Space", "expected Enter or Space")
  const { page } = tabOf(this, name)
  const continueButton = warningIn(page).getByRole("button", { name: WARNING.action })
  const response = await pressKeyAndAwaitPost(page, continueButton, key, "/session/activity")
  measuredOf(this).renewedAt = Date.now()
  assert.equal(response.status(), 200, "expected Continue to be answered")
})

/**
 * FR-008–FR-010: Continue renewed the session, and every named tab closed its warning within 2 s of the renewal
 * response and holds the same deadline, later than before.
 */
Then(
  "tabs {} close their warning within 2 seconds of the renewal and hold its later deadline",
  { timeout: 60_000 },
  async function(this: AppWorld, list: string) {
    const renewedAt = measuredOf(this).renewedAt
    assert.ok(renewedAt !== undefined, "expected a renewal")
    const tabs = namesOf(list).map((name) => ({ name, tab: tabOf(this, name) }))
    const earlier = Math.max(...tabs.map(({ tab }) => tab.deadline))
    for (const { name, tab } of tabs) {
      const closed = await changeAfter(
        tab,
        false,
        renewedAt - OBSERVATION_MILLISECONDS,
        renewedAt + OBSERVATION_MILLISECONDS
      )
      assert.ok(closed - renewedAt <= BOUND_MILLISECONDS, `tab "${name}" closed ${String(closed - renewedAt)} ms late`)
      assert.equal(await warningIn(tab.page).count(), 0)
      tab.deadline = await heldDeadline(tab.page)
      assert.ok(tab.deadline > earlier, `tab "${name}" still holds the earlier deadline`)
    }
    const deadlines = tabs.map(({ tab }) => tab.deadline)
    assert.ok(Math.max(...deadlines) - Math.min(...deadlines) <= OFFSET_TOLERANCE_MILLISECONDS, "deadlines differ")
  }
)

/**
 * Opens a protected page of the visitor's session in a new tab; its page load renews the session. The renewal response
 * time is when that tab's browser received its document, by Navigation Timing on the page's clock.
 */
When("the visitor opens a protected page in a new tab {string}", async function(this: AppWorld, name: string) {
  const tab = await openTabIn(this, "visitor", name, SPRINGFIELD)
  measuredOf(this).renewedAt = await tab.page.evaluate(() => {
    const [navigation] = performance.getEntriesByType("navigation")
    return performance.timeOrigin + (navigation instanceof PerformanceNavigationTiming ? navigation.responseStart : 0)
  })
})

/**
 * FR-009, FR-010 with gap G2: a page-load renewal reaches other tabs only when the new page's coordinator starts, so
 * the close is required but its delay is recorded rather than held to 2 s (verification.md, VL-2).
 */
Then(
  "tabs {} close their warning and adopt the deadline of tab {string}",
  { timeout: 60_000 },
  async function(this: AppWorld, list: string, source: string) {
    const renewedAt = measuredOf(this).renewedAt
    assert.ok(renewedAt !== undefined, "expected a renewal")
    const renewing = tabOf(this, source)
    for (const name of namesOf(list)) {
      const tab = tabOf(this, name)
      const closed = await changeAfter(
        tab,
        false,
        renewedAt - OBSERVATION_MILLISECONDS,
        renewedAt + OBSERVATION_MILLISECONDS
      )
      this.attach(`tab "${name}" closed ${String(closed - renewedAt)} ms after the page-load response (gap G2)`)
      tab.deadline = await heldDeadline(tab.page)
      const drift = Math.abs(tab.deadline - renewing.deadline)
      assert.ok(drift <= OFFSET_TOLERANCE_MILLISECONDS, `tab "${name}" did not adopt the deadline of tab "${source}"`)
    }
  }
)

/** Types in the tab 30 seconds before another tab's warning threshold; the tab reports it at once. */
When(
  "the visitor types in tab {string} 30 seconds before the warning threshold of tab {string}",
  { timeout: 7 * 60_000 },
  async function(this: AppWorld, name: string, other: string) {
    await observeAllTabs(this)
    const stale = tabOf(this, other)
    const threshold = await heldThreshold(stale)
    measuredOf(this).thresholds.set(other, { from: Date.now(), threshold })
    await untilBefore(threshold, 30_000)
    await typeIn(tabOf(this, name))
  }
)

/**
 * FR-006 (V-007): the tab learned of no renewal, reached its stale threshold, and confirmed with the server; it showed
 * no warning, and it holds the later deadline of the tab that renewed.
 */
Then(
  "tab {string} shows no warning through its stale threshold and adopts the deadline of tab {string}",
  { timeout: 7 * 60_000 },
  async function(this: AppWorld, name: string, source: string) {
    const measure = measuredOf(this).thresholds.get(name)
    assert.ok(measure, `expected tab "${name}" to have a threshold under measurement`)
    await untilBefore(measure.threshold, -5_000)
    const tab = tabOf(this, name)
    await assertNoWarning(tab, name)
    const renewed = await heldDeadline(tabOf(this, source).page)
    const drift = Math.abs((await heldDeadline(tab.page)) - renewed)
    assert.ok(drift <= OFFSET_TOLERANCE_MILLISECONDS, `tab "${name}" did not adopt the later deadline`)
  }
)

/** Accessible blocking (#156 slice B, quickstart §B). */

/** The roster's attendance-note field; programmatic focus there is not activity, so nothing renews. */
const ATTENDANCE_NOTE = "Attendance note"

Given(
  "tab {string} shows the roster with focus on its attendance note, and tab {string} has learned its renewal",
  async function(this: AppWorld, name: string, other: string) {
    const tab = tabOf(this, name)
    await tab.page.goto(`http://${tab.host}/coordination/roster`)
    await tab.page.getByRole("button", { name: "Log out" }).waitFor({ state: "visible" })
    await tab.page.getByRole("textbox", { name: ATTENDANCE_NOTE }).focus()
    tab.deadline = await heldDeadline(tab.page)
    const sharing = tabOf(this, other)
    // The page load renewed the session, and the other tab adopts it from the broadcast after hydration (gap G2).
    await sharing.page.waitForFunction(
      ({ held, tolerance }) =>
        Math.abs(Number(document.querySelector("header")?.getAttribute("data-session-deadline")) - held) <= tolerance,
      { held: tab.deadline, tolerance: OFFSET_TOLERANCE_MILLISECONDS },
      { polling: 50, timeout: 10_000 }
    )
    sharing.deadline = await heldDeadline(sharing.page)
  }
)

/** FR-014 in part (V-014): one modal dialog, named and described, whose only control is Continue (workaround 2). */
Then(
  "the warning in tab {string} is a modal dialog that explains itself, with Continue as its only control",
  async function(this: AppWorld, name: string) {
    const { page } = tabOf(this, name)
    const dialog = warningIn(page)
    assert.equal(await page.getByRole("dialog").count(), 1, "expected exactly one dialog")
    assert.equal(await dialog.getAttribute("aria-modal"), "true")
    const described = await dialog.getAttribute("aria-describedby")
    assert.ok(described, "expected the warning to have a description")
    assert.equal(await page.locator(`[id="${described}"]`).textContent(), WARNING.explanation)
    assert.deepEqual(await dialog.getByRole("button").allTextContents(), [WARNING.action])
    assert.equal(await dialog.getByRole("link").count(), 0)
    assert.equal(await page.getByLabel("Close modal").isVisible(), false, "the library's close control is shown")
  }
)

/** FR-015 (V-015): focus is on the warning's Continue, and with `indicated`, its focus indicator is drawn. */
const assertFocusOnContinue = async (world: AppWorld, name: string, indicated: boolean) => {
  const { page } = tabOf(world, name)
  assert.equal(await focusedOnContinue(page), true, `expected focus on Continue in tab "${name}"`)
  if (!indicated) return
  const indicator = await page.evaluate(() => ({
    focusVisible: document.activeElement?.matches(":focus-visible") === true,
    outline: document.activeElement === null ? "none" : getComputedStyle(document.activeElement).outlineStyle
  }))
  assert.ok(indicator.focusVisible && indicator.outline !== "none", "expected a visible focus indicator")
}

Then("focus in tab {string} is on Continue", async function(this: AppWorld, name: string) {
  await assertFocusOnContinue(this, name, false)
})

Then("focus in tab {string} is on Continue with a visible focus indicator", async function(
  this: AppWorld,
  name: string
) {
  await assertFocusOnContinue(this, name, true)
})

When("the visitor clicks outside the warning in tab {string}", async function(this: AppWorld, name: string) {
  await tabOf(this, name).page.mouse.click(4, 4)
})

/** Another window of the browser takes focus, and the visitor brings the tab back. */
When("another window takes focus from tab {string} and gives it back", async function(this: AppWorld, name: string) {
  const { page } = tabOf(this, name)
  const other = await page.context().newPage()
  try {
    await other.bringToFront()
    await page.bringToFront()
  } finally {
    await other.close()
  }
})

/** FR-016 (V-015): the accessibility tree exposes Continue and nothing else, so no header or control behind it. */
Then("nothing behind the warning in tab {string} is exposed", async function(this: AppWorld, name: string) {
  assert.deepEqual(await exposedControls(tabOf(this, name).page), [`button: ${WARNING.action}`])
})

/** Per scenario: the navigations, router requests, and logout requests a tab sent while the warning was open. */
const blockedRequests = new WeakMap<AppWorld, readonly string[]>()

/** Pointer presses where Log out and the participant link are drawn; the background is inert, so they reach nothing. */
When("the visitor clicks where Log out and the participant link are in tab {string}", async function(
  this: AppWorld,
  name: string
) {
  const { page } = tabOf(this, name)
  const sent: string[] = []
  const record = (request: PlaywrightRequest) => {
    const { pathname } = new URL(request.url())
    if (request.isNavigationRequest() || request.headers().rsc !== undefined || pathname.includes("logout")) {
      sent.push(`${request.method()} ${pathname}`)
    }
  }
  page.on("request", record)
  for (const target of [page.getByText("Log out"), page.getByText("Open participant page", { exact: true })]) {
    const box = await target.boundingBox()
    assert.ok(box, "expected the background control to be drawn")
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  }
  // A navigation or logout starts within the press's task; the wait lets a router request or redirect show too.
  await delay(1_000)
  page.off("request", record)
  blockedRequests.set(this, sent)
})

Then("tab {string} navigated nowhere and started no logout", async function(this: AppWorld, name: string) {
  const { page } = tabOf(this, name)
  assert.equal(new URL(page.url()).pathname, "/coordination/roster")
  assert.deepEqual(blockedRequests.get(this), [], `tab "${name}" sent a request from behind the warning`)
  await warningIn(page).waitFor({ state: "visible" })
})

/** FR-017 (V-015): focus returned to the element that had it, which is still present and focusable. */
Then("focus in tab {string} is back on its attendance note", async function(this: AppWorld, name: string) {
  const { page } = tabOf(this, name)
  assert.equal(await page.evaluate(() => document.activeElement?.id), "roster-attendance-note")
})

/**
 * FR-017 (V-015): with nothing focused before, focus goes to the page's main content. The pages have no `main`
 * landmark, so that is the protected content's container: it holds the page heading and not the header.
 */
Then("focus in tab {string} is on its main content", async function(this: AppWorld, name: string) {
  const focused = await tabOf(this, name).page.evaluate(() => {
    const active = document.activeElement
    return {
      holdsHeader: active?.querySelector("header") !== null,
      holdsHeading: active?.querySelector("h1") !== null,
      isBody: active === document.body
    }
  })
  assert.deepEqual(focused, { holdsHeader: false, holdsHeading: true, isBody: false })
})

/** After the warning closed, each tab's header and controls are exposed, and so operable, again. */
Then("tabs {} expose their header and controls again", async function(this: AppWorld, list: string) {
  for (const name of namesOf(list)) {
    const exposed = await exposedControls(tabOf(this, name).page)
    assert.ok(exposed.includes("button: Log out"), `tab "${name}" still hides its header: ${JSON.stringify(exposed)}`)
    assert.ok(!exposed.includes(`button: ${WARNING.action}`), `tab "${name}" still shows the warning`)
  }
})

/** Expiration still wins (#156 slice C, quickstart §C). */

When(
  "the visitor waits until {int} seconds after the warning threshold of tab {string}",
  { timeout: 7 * 60_000 },
  async function(this: AppWorld, seconds: number, name: string) {
    await observeAllTabs(this)
    await untilBefore(await heldThreshold(tabOf(this, name)), -seconds * 1_000)
  }
)

Then("tab {string} kept its protected content on resuming", function(this: AppWorld, name: string) {
  assert.equal(resumptionOf(this, name).hiddenAtOnce, false, `tab "${name}" hid its content on resuming`)
})

/** The first session status answer the tab received since `from`, on the test's clock; fails after 10 seconds. */
const statusAnswerSince = async (tab: Tab, from: number) => {
  const until = Date.now() + 10_000
  for (;;) {
    const answer = tab.statusAnswers.find((candidate) => candidate.at >= from)
    if (answer !== undefined) return answer
    assert.ok(Date.now() < until, "expected the tab to confirm with the server")
    await delay(50)
  }
}

/**
 * FR-007, FR-012 (V-012, V-013): after resuming, the tab confirmed with the server, which answered the session usable,
 * and only then opened the warning, within 2 s of the resume, over its protected content and with no expiration modal.
 */
Then(
  "tab {string} confirms with the server, then shows the warning over its protected content within 2 seconds of resuming",
  async function(this: AppWorld, name: string) {
    const tab = tabOf(this, name)
    const { startedAt } = resumptionOf(this, name)
    await warningIn(tab.page).waitFor({ state: "visible", timeout: 10_000 })
    const shownAt = Date.now()
    assert.ok(shownAt - startedAt <= BOUND_MILLISECONDS, `tab "${name}" warned ${String(shownAt - startedAt)} ms late`)
    const answer = await statusAnswerSince(tab, startedAt)
    assert.ok(answer.status === 200 && answer.at <= shownAt, `tab "${name}" warned before the server confirmed`)
    await tab.page.getByRole("button", { name: PROTECTED_CONTROL }).waitFor({ state: "visible" })
    assert.equal(await tab.page.getByRole("dialog", { name: EXPIRED_COPY.heading }).count(), 0)
  }
)

/** FR-006, FR-012 (V-012): the tab confirmed, learned of the later renewal, and shows no warning. */
Then(
  "tab {string} confirms with the server, shows no warning, and adopts the deadline of tab {string}",
  async function(this: AppWorld, name: string, source: string) {
    const tab = tabOf(this, name)
    const answer = await statusAnswerSince(tab, resumptionOf(this, name).startedAt)
    assert.equal(answer.status, 200)
    const renewed = await heldDeadline(tabOf(this, source).page)
    await tab.page.waitForFunction(
      ({ held, tolerance }) =>
        Math.abs(Number(document.querySelector("header")?.getAttribute("data-session-deadline")) - held) <= tolerance,
      { held: renewed, tolerance: OFFSET_TOLERANCE_MILLISECONDS },
      { polling: 50, timeout: 5_000 }
    )
    await delay(1_000)
    await assertNoWarning(tab, name)
  }
)

/** The late Continue's answer and when it arrived, on the test's clock, with the deadline it missed. */
interface LateContinue {
  readonly answeredAt: number
  readonly deadline: number
  readonly status: number
}

const lateContinues = new WeakMap<AppWorld, LateContinue>()

/**
 * Activates Continue shortly before the tab's deadline; request routing holds the request until a second after the
 * deadline, then releases it to the server unchanged (V-011). The hold is shorter than Continue's 10 s limit.
 */
When(
  "the visitor activates Continue in tab {string} {int} seconds before its deadline, and the request reaches the server after it",
  { timeout: 7 * 60_000 },
  async function(this: AppWorld, name: string, lead: number) {
    const tab = tabOf(this, name)
    const deadline = await heldDeadline(tab.page)
    tab.deadline = deadline
    await untilBefore(deadline, lead * 1_000)
    await tab.page.route("**/session/activity", async (route) => {
      await untilBefore(deadline, -1_000)
      await route.continue()
    })
    try {
      const answered = tab.page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/session/activity",
        { timeout: (lead + 10) * 1_000 }
      )
      await warningIn(tab.page).getByRole("button", { name: WARNING.action }).press("Enter")
      const response = await answered
      lateContinues.set(this, { answeredAt: Date.now(), deadline, status: response.status() })
    } finally {
      await tab.page.unroute("**/session/activity")
    }
  }
)

Then("the late Continue in tab {string} was answered 401 after its deadline", function(this: AppWorld, name: string) {
  const late = lateContinues.get(this)
  assert.ok(late, `expected a late Continue in tab "${name}"`)
  assert.ok(late.answeredAt > late.deadline, "expected the Continue to be answered after the deadline")
  assert.equal(late.status, 401)
})

/**
 * FR-011, FR-012 (V-017): each tab shows the expiration modal and no warning, and its warning, once last opened, stayed
 * open until the deadline: no tab closed it as renewed.
 */
Then(
  "tabs {} replaced the warning with the expiration modal, never closing it as renewed",
  { timeout: 60_000 },
  async function(this: AppWorld, list: string) {
    for (const name of namesOf(list)) {
      const tab = tabOf(this, name)
      await tab.page.getByRole("dialog", { name: EXPIRED_COPY.heading }).waitFor({ state: "visible", timeout: 10_000 })
      assert.equal(await warningIn(tab.page).count(), 0, `tab "${name}" still shows the warning`)
      const log = await warningLog(tab.page)
      const lastOpening = log.map((change) => change.open).lastIndexOf(true)
      assert.ok(lastOpening >= 0, `expected the warning to have been open in tab "${name}"`)
      assert.deepEqual(
        log.slice(lastOpening + 1).map((change) => change.at >= tab.deadline - OFFSET_TOLERANCE_MILLISECONDS),
        [true],
        `tab "${name}" closed its warning before its deadline, or more than once`
      )
    }
  }
)

/** The tab's own same-origin request for its session status, with its cookie and Fetch Metadata, answers 401. */
Then("the session status of tab {string} answers 401", async function(this: AppWorld, name: string) {
  const status = await tabOf(this, name).page.evaluate(async () => (await fetch("/session/status")).status)
  assert.equal(status, 401)
})

/** The resource types of the application's own requests: documents and script requests, not static files. */
const APPLICATION_REQUESTS: ReadonlySet<string> = new Set(["document", "fetch", "xhr"])

/** Per scenario: each application request the tab sent after the interaction began, with its answer's status. */
const answeredAfterInteraction = new WeakMap<AppWorld, { readonly answered: string[]; readonly stop: () => void }>()

/** Character keys and Escape in the tab; requests the tab sends from here on are recorded until the next check. */
When("the visitor presses character keys and Escape in tab {string}", async function(this: AppWorld, name: string) {
  const tab = tabOf(this, name)
  const answered: string[] = []
  const record = (response: PlaywrightResponse) => {
    const url = new URL(response.url())
    const kind = response.request().resourceType()
    if (url.host === tab.host && APPLICATION_REQUESTS.has(kind)) {
      answered.push(`${String(response.status())} ${response.request().method()} ${url.pathname}`)
    }
  }
  tab.page.on("response", record)
  answeredAfterInteraction.set(this, { answered, stop: () => tab.page.off("response", record) })
  for (const key of ["a", "1", "Escape"]) await tab.page.keyboard.press(key)
})

/** FR-012 (V-013): no interaction since revived the ended session; nothing the tab sent was answered 200. */
Then("no request from tab {string} was answered 200 since then", async function(this: AppWorld, name: string) {
  const recorded = answeredAfterInteraction.get(this)
  assert.ok(recorded, `expected interaction in tab "${name}"`)
  await delay(2_000)
  recorded.stop()
  assert.deepEqual(recorded.answered.filter((entry) => entry.startsWith("200 ")), [])
})

/**
 * FR-003 with a disabled warning (V-016): no dialog was in each tab before its deadline, and the first was the
 * expiration modal, within 2 s of it. Read from the dialog watcher, so the tabs need not be watched while other steps
 * run.
 */
Then(
  "tabs {} showed no dialog before their deadline, then the expiration modal within 2 seconds of it",
  { timeout: 8 * 60_000 },
  async function(this: AppWorld, list: string) {
    for (const name of namesOf(list)) {
      const tab = tabOf(this, name)
      await untilBefore(tab.deadline, -(BOUND_MILLISECONDS + 1_000))
      const first = await tab.page.evaluate(() => globalThis.window.preetsFirstDialog)
      assert.ok(first, `expected a dialog in tab "${name}"`)
      assert.equal(first.name, EXPIRED_COPY.heading, `the first dialog in tab "${name}"`)
      const late = first.at - tab.deadline
      assert.ok(late >= -OFFSET_TOLERANCE_MILLISECONDS, `tab "${name}" showed a dialog ${String(-late)} ms early`)
      assert.ok(late <= BOUND_MILLISECONDS, `tab "${name}" showed the expiration modal ${String(late)} ms late`)
    }
  }
)

Given(
  "Shelbyville sessions end after {int} minutes of inactivity, with no warning lead set",
  async function(this: AppWorld, minutes: number) {
    await setTenantPolicy(this, "shelbyville", { idleTimeoutMinutes: minutes, warningLeadMinutes: undefined })
  }
)

Given(
  "Shelbyville's tenant file changes to a {int}-minute timeout with a warning lead of {int}",
  async function(this: AppWorld, minutes: number, lead: number) {
    await setTenantPolicy(this, "shelbyville", { idleTimeoutMinutes: minutes, warningLeadMinutes: lead })
  }
)
