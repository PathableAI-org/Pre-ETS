import type { Locator, Page } from "playwright"

import { Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import { setTimeout as delay } from "node:timers/promises"

import type { AppWorld } from "../support/world.ts"

import {
  FETCH_METADATA,
  type RecordedResponse,
  requestInstance,
  requestSiteWith,
  sendRequest,
  type SiteRequest
} from "../support/server.ts"
import { namesOf, openedSession, type Tab, tabOf, untilHolding } from "./expiration.ts"
import { actionRequest } from "./http.ts"
import { configuredIdleTimeout } from "./tenant.ts"

/** A same-origin in-page activity communication at `host` as a tab sends it: JSON naming the kind and a coordination tag. */
export const activityCommunication = (host: string, activity: string, coordinationTag: string) => ({
  body: Buffer.from(JSON.stringify({ activity, coordinationTag })),
  headers: {
    ...FETCH_METADATA.application,
    "content-type": "application/json",
    Origin: `https://${host}`,
    "sec-fetch-site": "same-origin"
  },
  host,
  method: "POST",
  path: "/session/activity"
})

/** The usable session's snapshot, from a status read or an activity answer. */
export const snapshotOf = (response: RecordedResponse) => {
  assert.equal(response.status, 200, "expected a usable session")
  const snapshot = JSON.parse(response.body) as { coordinationTag?: unknown; idleDeadlineEpochMilliseconds?: unknown }
  assert.equal(typeof snapshot.coordinationTag, "string")
  assert.equal(typeof snapshot.idleDeadlineEpochMilliseconds, "number")
  return { coordinationTag: String(snapshot.coordinationTag), deadline: Number(snapshot.idleDeadlineEpochMilliseconds) }
}

/** The tag is synthetic; without a usable session no tag can match, and the outcome must not depend on it. */
When(
  "a visitor communicates {string} activity at {string}",
  async function(this: AppWorld, activity: string, host: string) {
    await requestSiteWith(this, activityCommunication(host, activity, "synthetic-tag"))
  }
)

/**
 * Sent with the session's own tag, as its page observed it, so a refusal answers the session's state, whichever layer
 * refuses it (the protection gate before the handler, today), and never a tag mismatch (#442, PREETS-SESSION-010 AC5).
 */
When(
  "the visitor's page communicates {string} activity at {string}",
  async function(this: AppWorld, activity: string, host: string) {
    assert.ok(this.coordinationTag, "expected the page to have observed its session's coordination tag")
    await requestSiteWith(this, activityCommunication(host, activity, this.coordinationTag))
  }
)

/*
 * Qualifying activity with a real session (#441, PREETS-SESSION-009). Every observation is the session's authoritative
 * deadline from its own status read, `GET /session/status`, which never renews: a renewal is seen only when the server
 * wrote a new deadline, never from an event the page handled or a request it sent.
 */

/** B5: in-page interaction is communicated in windows of this length from the session's latest communication. */
const WINDOW_MILLISECONDS = 60_000
/**
 * An interaction communicated at once renews within this of when it began. One held to its window's end waits up to
 * 60 seconds, so the bound separates the two by far.
 */
const AT_ONCE_MILLISECONDS = 2_000
const POLL_MILLISECONDS = 200

/** What presents a session to an instance: its cookie header, at the tenant authority it was established for. */
export interface Presentation {
  readonly cookie: string
  readonly host: string
}

/** The session's deadline as last read, and the visitor's interactions since its latest observed renewal. */
interface Observed {
  deadline: number
  /** When each interaction since the latest observed renewal began, on the test's clock. */
  interactions: number[]
  readonly presented: Presentation
  /** When the latest observed renewal was written: its deadline less the tenant's idle timeout. */
  renewedAt?: number | undefined
  /** When the interaction began whose renewal at once opened the session's current window. */
  windowFrom?: number | undefined
}

/** The named tab's session as a raw request presents it: the reference its browser held when it opened, at its host. */
export const presentationOf = (tab: Tab, name: string): Presentation => ({
  cookie: `pathable-session=${openedSession(tab, name)}`,
  host: tab.host
})

/** `GET /session/status` at the instance on `port`, an application request: it reads the session and never renews it. */
export const sessionStatus = (world: AppWorld, port: number, presented: Presentation): Promise<RecordedResponse> =>
  requestInstance(world, port, presented.host, "/session/status", false, presented.cookie)

/** The scenario's entry in `states`, which an earlier step must have set. */
const required = <A>(states: WeakMap<AppWorld, A>, world: AppWorld, expectation: string): A => {
  const state = states.get(world)
  assert.ok(state, `expected ${expectation}`)
  return state
}

const observations = new WeakMap<AppWorld, Observed>()

const observedOf = (world: AppWorld): Observed => required(observations, world, "the session's deadline to be read")

/** The session's authoritative deadline from its own status read. */
export const deadlineOf = async (world: AppWorld, presented: Presentation): Promise<number> =>
  snapshotOf(await sessionStatus(world, world.port, presented)).deadline

/** When the renewal that set `deadline` was written: the server sets a deadline its idle timeout after receipt. */
const renewalTime = async (world: AppWorld, presented: Presentation, deadline: number): Promise<number> =>
  deadline - await configuredIdleTimeout(world, presented.host.split(".", 1)[0] ?? "")

/** Reads the deadline until it differs from the observed one or `until` passes; answers the new deadline, if any. */
const nextDeadline = async (world: AppWorld, observed: Observed, until: number): Promise<number | undefined> => {
  for (;;) {
    const deadline = await deadlineOf(world, observed.presented)
    if (deadline !== observed.deadline) return deadline
    if (Date.now() >= until) return undefined
    await delay(POLL_MILLISECONDS)
  }
}

/** Takes `deadline` as the latest observed renewal, which communicated every interaction before it. */
const adoptRenewal = async (world: AppWorld, observed: Observed, deadline: number): Promise<number> => {
  const renewedAt = await renewalTime(world, observed.presented, deadline)
  observed.deadline = deadline
  observed.renewedAt = renewedAt
  observed.interactions = []
  return renewedAt
}

/**
 * Opens the synthetic participant page, whose controls start nothing, in each named tab. Each page request renews the
 * session; the deadline is read once every tab shows the page.
 */
Given("tab(s) {} show(s) the participant page", async function(this: AppWorld, list: string) {
  const names = namesOf(list)
  for (const { host, page } of names.map((name) => tabOf(this, name))) {
    await page.goto(`http://${host}/coordination/participant`)
    await page.getByRole("heading", { level: 1, name: "Coordination participant" }).waitFor({ state: "visible" })
  }
  const [first] = names
  assert.ok(first !== undefined, "expected a tab")
  const presented = presentationOf(tabOf(this, first), first)
  observations.set(this, { deadline: await deadlineOf(this, presented), interactions: [], presented })
})

/**
 * Records when an interaction in the named tab begins, then performs it. A `focusedFirst` control is focused by script
 * beforehand, which alone counts for nothing.
 */
const interact = async (
  world: AppWorld,
  name: string,
  act: (page: Page) => Promise<void>,
  focusedFirst?: (page: Page) => Locator
) => {
  const { page } = tabOf(world, name)
  await focusedFirst?.(page).focus()
  observedOf(world).interactions.push(Date.now())
  await act(page)
}

/** The checkbox's visible label: the design system hides the native input, so a person clicks its label. */
const acknowledgement = (page: Page) => page.getByText("Synthetic acknowledgement", { exact: true })
const focusLater = (page: Page) => page.getByRole("button", { name: "Focus later" })
const goalField = (page: Page) => page.getByRole("textbox", { name: "Goal" })
const logOut = (page: Page) => page.getByRole("button", { name: "Log out" })

When("the visitor clicks the acknowledgement checkbox in tab {string}", async function(this: AppWorld, name: string) {
  await interact(this, name, (page) => acknowledgement(page).click())
})

/**
 * A finger rests on the field for longer than the at-once bound before it lifts, so a renewal at once comes from the
 * touch itself, not from the click that follows the lift. Playwright's touchscreen has no press without release, so the
 * touch goes through the browser's own touch input, as its tap does.
 */
When(
  "the visitor holds a finger on the goal field for {int} seconds in tab {string}",
  async function(this: AppWorld, seconds: number, name: string) {
    await interact(this, name, async (page) => {
      const box = await goalField(page).boundingBox()
      assert.ok(box, "expected the goal field on screen")
      const touch = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      const cdp = await page.context().newCDPSession(page)
      try {
        await cdp.send("Input.dispatchTouchEvent", { touchPoints: [touch], type: "touchStart" })
        await delay(seconds * 1_000)
        await cdp.send("Input.dispatchTouchEvent", { touchPoints: [], type: "touchEnd" })
      } finally {
        await cdp.detach()
      }
    })
  }
)

When("the visitor types in the goal field in tab {string}", async function(this: AppWorld, name: string) {
  await interact(this, name, (page) => goalField(page).press("a"))
})

/** Text arrives as an input method or a paste commits it, with no key press. */
When(
  "the visitor enters text in the goal field without pressing a key in tab {string}",
  async function(this: AppWorld, name: string) {
    await interact(this, name, (page) => page.keyboard.insertText("a"), goalField)
  }
)

/** A key that enters no text. */
When(
  "the visitor presses an arrow key in the goal field in tab {string}",
  async function(this: AppWorld, name: string) {
    await interact(this, name, (page) => page.keyboard.press("ArrowRight"), goalField)
  }
)

/**
 * Focus starts on the header's Log out, outside the page's content, so the key press lands on no input of the page;
 * only the focus it moves reaches one.
 */
When(
  "the visitor moves focus from the header into the page with Tab in tab {string}",
  async function(this: AppWorld, name: string) {
    await interact(this, name, (page) => page.keyboard.press("Tab"), logOut)
    const focused = await tabOf(this, name).page.evaluate(() => document.activeElement?.textContent)
    assert.equal(focused, "Open roster page", "expected Tab to move focus to the page's first link")
  }
)

/**
 * Focus is on the button first, so the click moves no focus and is the only interaction. The page moves focus to its
 * goal field two seconds later, on its own.
 */
When("the visitor clicks Focus later, which already has focus, in tab {string}", async function(
  this: AppWorld,
  name: string
) {
  await interact(this, name, (page) => focusLater(page).click(), focusLater)
})

When("the page moves focus to the goal field on its own in tab {string}", async function(this: AppWorld, name: string) {
  await tabOf(this, name).page.waitForFunction(() => document.activeElement?.id === "participant-goal", undefined, {
    timeout: 5_000
  })
})

/** Moves the pointer between the centres of the page's controls, pressing nothing, until `until` on the test's clock. */
const movePointerUntil = async (page: Page, until: number) => {
  const controls = await page.locator("a[href], button, input, select, textarea").all()
  const boxes = (await Promise.all(controls.map((control) => control.boundingBox())))
    .filter((box) => box !== null)
  assert.ok(boxes.length > 0, "expected controls to move across")
  for (let index = 0; Date.now() < until; index += 1) {
    const box = boxes[index % boxes.length]
    if (box !== undefined) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 })
    await delay(100)
  }
}

/**
 * The window opened by the latest renewal ends 60 seconds after the communication behind it, which the server received
 * no later than that renewal: moving until then plus 5 seconds covers movement inside the window and after it.
 */
When(
  "the visitor moves the pointer across the controls of tab {string} until 5 seconds after that renewal's window ends",
  { timeout: 2 * WINDOW_MILLISECONDS },
  async function(this: AppWorld, name: string) {
    const { renewedAt } = observedOf(this)
    assert.ok(renewedAt !== undefined, "expected a renewal to have opened a window")
    await movePointerUntil(tabOf(this, name).page, renewedAt + WINDOW_MILLISECONDS + 5_000)
  }
)

/** The tab has received the latest renewal: the deadline it holds is the session's, within its clock-offset estimate. */
When("tab {string} holds that renewal", async function(this: AppWorld, name: string) {
  await untilHolding(tabOf(this, name).page, observedOf(this).deadline, 5_000)
})

/** Renewed after the latest interaction began and within 2 seconds of it, as a communication sent at once is. */
Then("the session is renewed at once", async function(this: AppWorld) {
  const observed = observedOf(this)
  const began = observed.interactions.at(-1)
  assert.ok(began !== undefined, "expected an interaction")
  const deadline = await nextDeadline(this, observed, began + AT_ONCE_MILLISECONDS + 1_000)
  assert.ok(deadline !== undefined, "expected the session to be renewed")
  const renewedAt = await adoptRenewal(this, observed, deadline)
  const after = renewedAt - began
  assert.ok(after >= 0 && after <= AT_ONCE_MILLISECONDS, `renewed ${String(after)} ms after the interaction began`)
  observed.windowFrom = began
})

Then("the session keeps its deadline", async function(this: AppWorld) {
  const observed = observedOf(this)
  assert.equal(await deadlineOf(this, observed.presented), observed.deadline, "expected no renewal")
})

/**
 * B5: interaction inside an open window waits for its end, 60 seconds after the communication that opened it, which
 * was sent no earlier than the interaction behind it began. Read just before then, the deadline is unchanged; the one
 * renewal comes at the window's end, no later than 60 seconds after the first interaction it communicates.
 */
Then(
  "the session keeps its deadline until that window ends, then is renewed once, no later than 60 seconds after the first of those interactions",
  { timeout: 2 * WINDOW_MILLISECONDS },
  async function(this: AppWorld) {
    const observed = observedOf(this)
    const [first] = observed.interactions
    const { windowFrom } = observed
    assert.ok(first !== undefined && windowFrom !== undefined, "expected interactions inside an open window")
    const windowEnd = windowFrom + WINDOW_MILLISECONDS
    await delay(Math.max(0, windowEnd - 1_000 - Date.now()))
    assert.equal(await deadlineOf(this, observed.presented), observed.deadline, "expected no renewal inside the window")
    const deadline = await nextDeadline(this, observed, first + WINDOW_MILLISECONDS + AT_ONCE_MILLISECONDS)
    assert.ok(deadline !== undefined, "expected the session to be renewed")
    const renewedAt = await adoptRenewal(this, observed, deadline)
    assert.ok(renewedAt >= windowEnd, `renewed ${String(windowEnd - renewedAt)} ms before the window ended`)
    const late = renewedAt - first - WINDOW_MILLISECONDS
    assert.ok(late <= 0, `renewed ${String(late)} ms more than 60 seconds after the first interaction`)
    await delay(AT_ONCE_MILLISECONDS)
    assert.equal(await deadlineOf(this, observed.presented), deadline, "expected one renewal for those interactions")
  }
)

/** A request the session's browser sends, reproduced with its Fetch Metadata, and the deadline just before it. */
interface Sent {
  readonly before: number
  readonly endedAt: number
  readonly presented: Presentation
  readonly response: RecordedResponse
  readonly startedAt: number
}

const sentRequests = new WeakMap<AppWorld, Sent>()

const sentOf = (world: AppWorld): Sent => required(sentRequests, world, "a request to have been sent")

/** Reads the deadline, then sends one same-origin request presenting the visitor's session at `request.host`. */
const sendWithSession = async (world: AppWorld, request: Omit<SiteRequest, "cookie" | "port">) => {
  assert.ok(world.cookie, "expected the visitor to have signed in")
  const presented = { cookie: `pathable-session=${world.cookie}`, host: request.host }
  const before = await deadlineOf(world, presented)
  const startedAt = Date.now()
  const response = await sendRequest(world, {
    ...request,
    cookie: presented.cookie,
    headers: { "sec-fetch-site": "same-origin", ...request.headers },
    port: world.port
  })
  sentRequests.set(world, { before, endedAt: Date.now(), presented, response, startedAt })
}

const get = (path: string, host: string, headers: Readonly<Record<string, string>>) => ({
  headers,
  host,
  method: "GET",
  path
})

When(
  "the session's browser navigates to {string} at {string}",
  async function(this: AppWorld, path: string, host: string) {
    await sendWithSession(this, get(path, host, { Accept: "text/html", ...FETCH_METADATA.document }))
  }
)

/** The headers of the App Router's fetch of a linked page's payload ahead of any navigation to it. */
export const PREFETCH_HEADERS = { ...FETCH_METADATA.application, "next-router-prefetch": "1", rsc: "1" } as const

When(
  "the session's browser prefetches {string} for in-place navigation at {string}",
  async function(this: AppWorld, path: string, host: string) {
    await sendWithSession(this, get(path, host, PREFETCH_HEADERS))
  }
)

/** A browser asks for a site's icon on its own; any image the page loads is the same kind of request. */
When(
  "the session's browser loads {string} as an image at {string}",
  async function(this: AppWorld, path: string, host: string) {
    await sendWithSession(this, get(path, host, FETCH_METADATA.image))
  }
)

/** What every tab sends to confirm the session before acting on a deadline, and on resume. */
When("the session's browser reads its session status at {string}", async function(this: AppWorld, host: string) {
  await sendWithSession(this, get("/session/status", host, FETCH_METADATA.application))
})

When(
  "the session's browser submits the protected reference form at {string}",
  async function(this: AppWorld, host: string) {
    await sendWithSession(this, await actionRequest(this, "runReferenceOperation", host, "/"))
  }
)

/** Admitted: neither denied nor failed, so the session was read and the request let through. */
Then("that request was admitted without renewing the session", async function(this: AppWorld) {
  const { before, presented, response } = sentOf(this)
  assert.ok(
    response.status < 500 && response.status !== 401 && response.status !== 403,
    `answered ${String(response.status)}`
  )
  assert.equal(await deadlineOf(this, presented), before, "expected the session's deadline unchanged")
})

/** Renewed on receipt: the new deadline is the idle timeout after a moment while the request was being handled. */
Then("that request renewed the session as it arrived", async function(this: AppWorld) {
  const { before, endedAt, presented, response, startedAt } = sentOf(this)
  assert.equal(response.status, 200)
  const deadline = await deadlineOf(this, presented)
  assert.ok(deadline > before, "expected a later deadline")
  const renewedAt = await renewalTime(this, presented, deadline)
  assert.ok(
    renewedAt >= startedAt && renewedAt <= endedAt,
    `renewed ${String(renewedAt - startedAt)} ms into a request that took ${String(endedAt - startedAt)} ms`
  )
})
