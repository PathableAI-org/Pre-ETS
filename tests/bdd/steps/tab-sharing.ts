import type { Page } from "playwright"

import { Given, Then } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import { setTimeout as delay } from "node:timers/promises"

import type { AppWorld } from "../support/world.ts"

import {
  assertNoProtectedContent,
  BOUND_MILLISECONDS,
  heldDeadline,
  namesOf,
  OFFSET_TOLERANCE_MILLISECONDS,
  PROTECTED_CONTROL,
  resumptionOf,
  sessionOf,
  type Tab,
  tabOf
} from "./expiration.ts"
import { type Presentation, sessionStatus, snapshotOf } from "./session-coordination.ts"

/*
 * One session shared by a browser's tabs (PREETS-SESSION-010): joining, a renewal reaching every sharing tab, shared
 * logout, and isolation from other sessions. The tabs are the named tabs `expiration.ts` opens; the session is read
 * through its own status reads, which never renew, and through what each tab shows.
 */

/** How long after an event a step waits for each tab to reflect it before failing; the bound is checked separately. */
const OBSERVATION_MILLISECONDS = 15_000
const POLL_MILLISECONDS = 50
const SIGNED_OUT = "You are signed out"

/** The tab's session as a raw request presents it: the reference its browser held when it opened, at its host. */
const presentationOf = (tab: Tab, name: string): Presentation => {
  assert.ok(tab.session, `expected tab "${name}" to have opened with a session`)
  return { cookie: `pathable-session=${tab.session}`, host: tab.host }
}

/**
 * The events a later step measures from, read from the tab's own Resource Timing on its clock, which is the test's: no
 * clock is installed in these tabs. Logout is measured from when the request left, which is no later than the server
 * ending the session, so the bound is checked conservatively; a renewal from its response arriving, as B5 measures it.
 */
const EVENTS = {
  logout: { at: "startTime", pathname: "/auth/logout" },
  typing: { at: "responseEnd", pathname: "/session/activity" }
} as const

const isEvent = (event: string): event is keyof typeof EVENTS => Object.hasOwn(EVENTS, event)

/** When the event happened in the named tab: its latest request to the event's path. */
const eventTime = async (world: AppWorld, event: string, name: string): Promise<number> => {
  assert.ok(isEvent(event), `expected a logout or typing, not "${event}"`)
  const { at, pathname } = EVENTS[event]
  const time = await tabOf(world, name).page.evaluate(({ at, pathname }) => {
    const entry = performance.getEntriesByType("resource")
      .filter((candidate) => new URL(candidate.name).pathname === pathname)
      .at(-1)
    return entry instanceof PerformanceResourceTiming ? performance.timeOrigin + entry[at] : undefined
  }, { at, pathname })
  assert.ok(time !== undefined, `expected tab "${name}" to have sent a request to ${pathname}`)
  return time
}

/** Waits until the tab shows the signed-out notice and answers when, on the test's clock. */
const signedOutAt = async (page: Page): Promise<number> => {
  await page.getByRole("heading", { level: 1, name: SIGNED_OUT }).waitFor({
    state: "visible",
    timeout: OBSERVATION_MILLISECONDS
  })
  return Date.now()
}

/** Waits until the tab holds `deadline`, within its clock-offset estimate, and answers when, on the test's clock. */
const heldAt = async (page: Page, deadline: number, name: string): Promise<number> => {
  const until = Date.now() + OBSERVATION_MILLISECONDS
  while (Math.abs(await heldDeadline(page) - deadline) > OFFSET_TOLERANCE_MILLISECONDS) {
    assert.ok(Date.now() < until, `expected tab "${name}" to hold the deadline ${String(deadline)}`)
    await delay(POLL_MILLISECONDS)
  }
  return Date.now()
}

/** The session the tab's own document reads from `GET /session/status`, as its coordinator would. */
const statusReadIn = async (page: Page) => {
  const { body, status } = await page.evaluate(async () => {
    const response = await fetch("/session/status", { cache: "no-store" })
    return { body: await response.text(), status: response.status }
  })
  return snapshotOf({ body, headers: {}, status })
}

/**
 * PREETS-SESSION-010 AC2: the new tab was served the protected document at once, with no request to the application's
 * login route or to the provider, and its browser presents the reference the earlier tab opened with.
 */
Then(
  "tab {string} started no login and presents the session reference tab {string} opened with",
  async function(this: AppWorld, name: string, earlier: string) {
    const tab = tabOf(this, name)
    assert.deepEqual(tab.loginTraffic.map(String), [], `tab "${name}" started a login`)
    assert.deepEqual(tab.protectedDocuments, ["/"], `tab "${name}" was not served the protected document at once`)
    const reference = tabOf(this, earlier).session
    assert.ok(reference, `expected tab "${earlier}" to have opened with a session`)
    assert.equal(await sessionOf(tab), reference, `tab "${name}" presents another session reference`)
  }
)

/**
 * AC1: each tab's own status read answers one session (the same coordination tag) with one deadline, and each tab
 * holds that deadline. A page load's renewal reaches the other tabs only once that page is interactive (gap G2), so the
 * tabs are given until the observation timeout to hold it rather than the 2-second bound.
 */
Then(
  "tabs {} each read one session and its deadline from the server, and hold that deadline",
  { timeout: 60_000 },
  async function(this: AppWorld, list: string) {
    const tabs = namesOf(list).map((name) => ({ name, tab: tabOf(this, name) }))
    const reads = await Promise.all(tabs.map(({ tab }) => statusReadIn(tab.page)))
    const [first] = reads
    assert.ok(first, "expected tabs to read their session")
    reads.forEach((read, index) => {
      assert.deepEqual(read, first, `tab "${tabs[index]?.name ?? ""}" read another session or deadline`)
    })
    for (const { name, tab } of tabs) {
      await heldAt(tab.page, first.deadline, name)
      tab.deadline = await heldDeadline(tab.page)
    }
  }
)

/**
 * AC3 with the B5 bound: the renewal moved the session's deadline, as its own status read reports it, and every named
 * tab holds the renewed deadline within 2 s of the renewal response in the typing tab.
 */
Then(
  "tabs {} hold the renewed deadline within 2 seconds of the renewal response in tab {string}",
  { timeout: 60_000 },
  async function(this: AppWorld, list: string, source: string) {
    const renewedAt = await eventTime(this, "typing", source)
    const { deadline } = snapshotOf(await sessionStatus(this, this.port, presentationOf(tabOf(this, source), source)))
    const tabs = namesOf(list).map((name) => ({ name, tab: tabOf(this, name) }))
    for (const { name, tab } of tabs) {
      assert.ok(
        deadline - tab.deadline > OFFSET_TOLERANCE_MILLISECONDS,
        `the renewal did not move "${name}"'s deadline`
      )
    }
    const held = await Promise.all(tabs.map(({ name, tab }) => heldAt(tab.page, deadline, name)))
    for (const [index, { name, tab }] of tabs.entries()) {
      const late = (held[index] ?? Number.POSITIVE_INFINITY) - renewedAt
      assert.ok(late <= BOUND_MILLISECONDS, `tab "${name}" held the renewed deadline ${String(late)} ms late`)
      tab.deadline = await heldDeadline(tab.page)
    }
  }
)

/**
 * AC5 with the B5 bound: every named tab shows the signed-out notice within 2 s of the logout request, measured from
 * when it left the logging-out tab. Each tab is observed from the start of this step, so a notice already shown counts
 * as shown now.
 */
Then(
  "tabs {} show the signed-out notice within 2 seconds of the logout in tab {string}",
  { timeout: 60_000 },
  async function(this: AppWorld, list: string, source: string) {
    const loggedOutAt = await eventTime(this, "logout", source)
    const names = namesOf(list)
    const shown = await Promise.all(names.map((name) => signedOutAt(tabOf(this, name).page)))
    names.forEach((name, index) => {
      const late = (shown[index] ?? Number.POSITIVE_INFINITY) - loggedOutAt
      assert.ok(late <= BOUND_MILLISECONDS, `tab "${name}" showed the signed-out notice ${String(late)} ms late`)
    })
  }
)

/**
 * AC6: once the bound for the event has passed, with a second's margin, each named tab of another session still shows
 * its protected content, never showed the signed-out notice or a dialog, and holds the deadline it opened with; that
 * session's own status read answers it usable with the same deadline, so the event neither ended nor renewed it.
 */
Then(
  "tabs {} keep their content and unchanged sessions 3 seconds after the {word} in tab {string}",
  { timeout: 60_000 },
  async function(this: AppWorld, list: string, event: string, source: string) {
    const at = await eventTime(this, event, source)
    await delay(Math.max(0, at + BOUND_MILLISECONDS + 1_000 - Date.now()))
    for (const name of namesOf(list)) {
      const tab = tabOf(this, name)
      assert.ok(
        await tab.page.getByRole("button", { name: PROTECTED_CONTROL }).isVisible(),
        `tab "${name}" lost content`
      )
      assert.equal(await tab.page.getByRole("heading", { name: SIGNED_OUT }).count(), 0, `"${name}" was signed out`)
      assert.equal(
        await tab.page.evaluate(() => globalThis.window.preetsDialogSeen === true),
        false,
        `dialog in "${name}"`
      )
      const held = await heldDeadline(tab.page)
      assert.ok(Math.abs(held - tab.deadline) <= OFFSET_TOLERANCE_MILLISECONDS, `tab "${name}" holds a new deadline`)
      const { deadline } = snapshotOf(await sessionStatus(this, this.port, presentationOf(tab, name)))
      assert.ok(Math.abs(deadline - tab.deadline) <= OFFSET_TOLERANCE_MILLISECONDS, `"${name}"'s session was renewed`)
    }
  }
)

/** Raw requests in later steps present the reference the tab's browser held when it opened. */
Given(
  "requests sent outside the browser present the session tab {string} opened with",
  function(this: AppWorld, name: string) {
    const { session } = tabOf(this, name)
    assert.ok(session, `expected tab "${name}" to have opened with a session`)
    this.cookie = session
  }
)

/** Logout sets no cookie (research D15): each tab's browser still presents the reference the raw requests present. */
Then("tabs {} still present that session", async function(this: AppWorld, list: string) {
  assert.ok(this.cookie, "expected raw requests to present a session")
  for (const name of namesOf(list)) {
    assert.equal(await sessionOf(tabOf(this, name)), this.cookie, `tab "${name}" presents another session`)
  }
})

/**
 * The emulation's premise: the suspended tab of another browser received nothing of the logout, so a notice after it
 * resumes comes from its return (B5: a resumed tab confirms with the server).
 */
Then(
  "tab {string} still shows the protected content it had when suspended",
  async function(this: AppWorld, name: string) {
    const { page } = tabOf(this, name)
    assert.ok(await page.getByRole("button", { name: PROTECTED_CONTROL }).isVisible(), `tab "${name}" lost content`)
    assert.equal(await page.getByRole("heading", { name: SIGNED_OUT }).count(), 0, `tab "${name}" was signed out`)
  }
)

/**
 * B5: a tab returning before its deadline confirms with the server and, the session having ended while it was
 * suspended, conceals within 2 s of resuming; here it shows the signed-out notice and keeps no protected content.
 */
Then(
  "tab {string} shows the signed-out notice within 2 seconds of resuming, with no protected content",
  { timeout: 60_000 },
  async function(this: AppWorld, name: string) {
    const { page } = tabOf(this, name)
    const late = await signedOutAt(page) - resumptionOf(this, name).startedAt
    assert.ok(
      late <= BOUND_MILLISECONDS,
      `tab "${name}" showed the signed-out notice ${String(late)} ms after resuming`
    )
    await assertNoProtectedContent(page, name)
  }
)
