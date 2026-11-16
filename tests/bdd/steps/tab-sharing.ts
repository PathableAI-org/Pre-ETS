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
 * AC1: one idle state. The session the tabs share (the reference the first tab opened with, which every tab's browser
 * presents) has one authoritative deadline in its own status read, and each tab holds it. A page load's renewal reaches
 * the other tabs only once that page is interactive (gap G2), so the tabs have until the observation timeout to hold
 * it, not the 2-second bound.
 */
Then(
  "tabs {} each hold the deadline the server reports for the session tab {string} opened with",
  { timeout: 60_000 },
  async function(this: AppWorld, list: string, source: string) {
    const { deadline } = snapshotOf(await sessionStatus(this, this.port, presentationOf(tabOf(this, source), source)))
    for (const name of namesOf(list)) {
      const tab = tabOf(this, name)
      await heldAt(tab.page, deadline, name)
      tab.deadline = await heldDeadline(tab.page)
    }
  }
)

/**
 * Observes every named tab at once until `observe` answers when it showed the outcome, on the test's clock, and requires
 * each within the B5 bound of `from`.
 */
const assertEachWithinBound = async (
  world: AppWorld,
  list: string,
  from: number,
  outcome: string,
  observe: (tab: Tab, name: string) => Promise<number>
) => {
  const names = namesOf(list)
  const times = await Promise.all(names.map((name) => observe(tabOf(world, name), name)))
  names.forEach((name, index) => {
    const late = (times[index] ?? Number.POSITIVE_INFINITY) - from
    assert.ok(late <= BOUND_MILLISECONDS, `tab "${name}" ${outcome} ${String(late)} ms late`)
  })
}

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
    for (const name of namesOf(list)) {
      const moved = deadline - tabOf(this, name).deadline
      assert.ok(moved > OFFSET_TOLERANCE_MILLISECONDS, `the renewal did not move "${name}"'s deadline`)
    }
    await assertEachWithinBound(this, list, renewedAt, "held the renewed deadline", async (tab, name) => {
      const at = await heldAt(tab.page, deadline, name)
      tab.deadline = await heldDeadline(tab.page)
      return at
    })
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
    await assertEachWithinBound(this, list, loggedOutAt, "showed the signed-out notice", (tab) => signedOutAt(tab.page))
  }
)

/**
 * AC6: once the bound for the event has passed, with a second's margin, each named tab of another session never showed
 * the signed-out notice and holds the deadline it opened with, and that session's own status read answers it usable
 * with the same deadline, so the event neither ended nor renewed it.
 */
Then(
  "tabs {} keep their sessions unchanged 3 seconds after the {word} in tab {string}",
  { timeout: 60_000 },
  async function(this: AppWorld, list: string, event: string, source: string) {
    const at = await eventTime(this, event, source)
    await delay(Math.max(0, at + BOUND_MILLISECONDS + 1_000 - Date.now()))
    for (const name of namesOf(list)) {
      const tab = tabOf(this, name)
      assert.equal(await tab.page.getByRole("heading", { name: SIGNED_OUT }).count(), 0, `"${name}" was signed out`)
      const held = await heldDeadline(tab.page)
      assert.ok(Math.abs(held - tab.deadline) <= OFFSET_TOLERANCE_MILLISECONDS, `tab "${name}" holds a new deadline`)
      const { deadline } = snapshotOf(await sessionStatus(this, this.port, presentationOf(tab, name)))
      assert.ok(Math.abs(deadline - tab.deadline) <= OFFSET_TOLERANCE_MILLISECONDS, `"${name}"'s session was renewed`)
    }
  }
)

/**
 * Raw requests in later steps present the reference the tab's browser held when it opened, as a tab still holding that
 * session would; after a logout, that is the logged-out session.
 */
Given(
  "requests sent outside the browser present the session tab {string} opened with",
  function(this: AppWorld, name: string) {
    const { session } = tabOf(this, name)
    assert.ok(session, `expected tab "${name}" to have opened with a session`)
    this.cookie = session
  }
)

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
