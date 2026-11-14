import type { Page } from "playwright"

import { Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import { setTimeout as delay } from "node:timers/promises"

import type { AppWorld } from "../support/world.ts"

import {
  namesOf,
  OFFSET_TOLERANCE_MILLISECONDS,
  openTabIn,
  openTabs,
  pressEnterAndAwaitPost,
  pressEscapeAndClickOutside,
  SPRINGFIELD,
  type Tab,
  tabOf,
  typeIn,
  untilBefore
} from "./expiration.ts"

/** The warning's name and the alert after a Continue that did not renew (#156 research D9). */
const WARNING = {
  action: "Continue",
  failure: "We could not continue your session. Try again.",
  heading: "Your session is about to expire"
}
/** B5: the warning opens within 2 s of the threshold, and closes in other tabs within 2 s of a renewal response. */
const BOUND_MILLISECONDS = 2_000
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

const header = (page: Page) => page.locator("header[data-session-deadline]")

/** The tab's held local deadline, from its header. */
const heldDeadline = async (tab: Tab): Promise<number> => {
  const deadline = Number(await header(tab.page).getAttribute("data-session-deadline"))
  assert.ok(Number.isFinite(deadline), "expected the tab to hold a deadline")
  return deadline
}

/** The tab's warning threshold on the test's clock: its held deadline minus its held lead (#156 research D2). */
const heldThreshold = async (tab: Tab): Promise<number> => {
  const lead = Number(await header(tab.page).getAttribute("data-session-warning-lead"))
  assert.ok(lead > 0, "expected the tab to hold a positive warning lead")
  tab.deadline = await heldDeadline(tab)
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
  const drift = Math.abs((await heldDeadline(tab)) - tab.deadline)
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

/** Focuses Continue and presses Enter; the step ends when the server answered, and records when that was. */
When("the visitor activates Continue with Enter in tab {string}", async function(this: AppWorld, name: string) {
  const { page } = tabOf(this, name)
  const continueButton = warningIn(page).getByRole("button", { name: WARNING.action })
  const response = await pressEnterAndAwaitPost(page, continueButton, "/session/activity")
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
      tab.deadline = await heldDeadline(tab)
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
      tab.deadline = await heldDeadline(tab)
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
    const renewed = await heldDeadline(tabOf(this, source))
    const drift = Math.abs((await heldDeadline(tab)) - renewed)
    assert.ok(drift <= OFFSET_TOLERANCE_MILLISECONDS, `tab "${name}" did not adopt the later deadline`)
  }
)
