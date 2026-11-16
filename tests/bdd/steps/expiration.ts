import type { Browser, BrowserContext, Locator, Page, Response as PlaywrightResponse } from "playwright"

import { After, Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import { setTimeout as delay } from "node:timers/promises"

import type { AppWorld } from "../support/world.ts"

import {
  applicationBrowser,
  documentText,
  isAuthentication,
  isAuthorization,
  PROVIDER_ORIGIN,
  providerSignsInSilently,
  resumeAt,
  showsFocusIndicator,
  signInAtProvider,
  suspendTimers,
  watchForDialogs
} from "../support/browser.ts"
import { requestInstance, startSite } from "../support/server.ts"

export const SPRINGFIELD = "springfield.localhost:3000"
const SHELBYVILLE = "shelbyville.localhost:3000"
export const PROTECTED_CONTROL = "Record reference operation"
/** The heading of the notice every tab sharing a session shows once it was logged out. */
export const SIGNED_OUT_HEADING = "You are signed out"
/** Protected text the reference page renders, and the header's Log out; none may remain behind the modal. */
const PROTECTED_TEXT = /Reference session|Record reference operation|springfield|shelbyville|Log out/i
/** The expired recovery copy that the modal must share with in-tab recovery (#157 FR-020, research D12). */
export const EXPIRED_COPY = {
  explanation: "For your security, your session ended after a period of inactivity.",
  heading: "Your session expired",
  logIn: "Log in again"
}
/** The recovery copy when the session ended for a reason the server cannot tell, which claims no cause. */
const UNAVAILABLE_COPY = {
  explanation: "To continue, log in again.",
  heading: "Your session is no longer available",
  logIn: "Log in again"
}
/**
 * Every session-end copy: the modal and each recovery presentation assert one of these whole, so the modal's expired
 * explanation and action stay equivalent to recovery's (PREETS-SESSION-012 AC4, PREETS-SESSION-007 AC2).
 */
export const SESSION_END_COPY: readonly (typeof EXPIRED_COPY)[] = [EXPIRED_COPY, UNAVAILABLE_COPY]
/**
 * B5: concealment and the modal within 2 s of the deadline, or of the return for a resumed tab; the warning within 2 s
 * of its threshold, and its close within 2 s of a renewal response (#156).
 */
export const BOUND_MILLISECONDS = 2_000

declare global {
  interface Window {
    /** Exposed by expiration scenarios: reports protected content the page has just exposed, by its text. */
    preetsProtectedExposed?: (text: string) => Promise<void>
    /** Exposed by expiration scenarios: reports a `pageshow` and whether a dialog was in the document then. */
    preetsRestoreShown?: (persisted: boolean, dialog: boolean) => Promise<void>
  }
}

/**
 * One open tab: its page, its own local deadline as last read, the application session it opened with, and since a
 * mark, protected documents served and login traffic (the application's login route and any provider request).
 */
export interface Tab {
  deadline: number
  /**
   * Protected content the page reported exposing since a mark, by its text: in a page restored from the back/forward
   * cache, or once a change to its document exposed content that was concealed or absent.
   */
  readonly exposed: string[]
  /** Settles once a failed login's last document has loaded, after a step arranged that failure. */
  failedLogin?: Promise<unknown> | undefined
  readonly host: string
  readonly loginTraffic: URL[]
  readonly page: Page
  readonly protectedDocuments: string[]
  /** `pageshow` events from the back/forward cache, and whether each found a dialog in the restored document. */
  readonly restored: boolean[]
  /** The application session reference the tab's browser held when the tab opened. */
  session: string | undefined
  /** Each session status answer the tab received, with its status and when it arrived on the test's clock. */
  readonly statusAnswers: { readonly at: number; readonly status: number }[]
}

/** The scenario's browser, named tabs, and its signed-in contexts by name. */
interface Expiration {
  readonly browser: Browser
  readonly close: () => Promise<void>
  readonly contexts: Map<string, BrowserContext>
  readonly tabs: Map<string, Tab>
}

const scenarios = new WeakMap<AppWorld, Expiration>()

After(async function(this: AppWorld) {
  const scenario = scenarios.get(this)
  scenarios.delete(this)
  await scenario?.close()
})

/** Starts the site and one browser, with the back/forward cache on, for every host the scenario uses. */
const scenarioOf = async (world: AppWorld): Promise<Expiration> => {
  const existing = scenarios.get(world)
  if (existing !== undefined) return existing
  await startSite(world)
  const owned = await applicationBrowser(world.port, [SPRINGFIELD, SHELBYVILLE], undefined, false, true)
  const scenario: Expiration = { browser: owned.browser, close: owned.close, contexts: new Map(), tabs: new Map() }
  scenarios.set(world, scenario)
  return scenario
}

export const tabOf = (world: AppWorld, name: string): Tab => {
  const tab = scenarios.get(world)?.tabs.get(name)
  assert.ok(tab, `expected tab "${name}" to be open`)
  return tab
}

/** Tab names written `"S1", "S2", and "S3"` or `"S1" and "S2"`. */
export const namesOf = (list: string): readonly string[] =>
  [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "")

/**
 * Runs as the first script of every document: reports protected content (a protected page's heading or control in the
 * document, not inside `[hidden]` or `[inert]`) when the page is restored from the back/forward cache with it exposed,
 * and when a change to the document exposes it after it was concealed or absent. It cannot use outer bindings.
 */
const watchForExposure = (): void => {
  const PROTECTED =
    /^(Reference session|Coordination roster|Coordination participant|Record reference operation|Record attendance note|Open participant page in place)$/
  const exposedText = () =>
    [...document.querySelectorAll("h1, button")].find((element) =>
      PROTECTED.test(element.textContent) && element.closest("[hidden], [inert]") === null
    )?.textContent
  let shown = false
  const report = (restored: boolean) => {
    const text = exposedText()
    if (text !== undefined && (restored || !shown)) {
      void globalThis.window.preetsProtectedExposed?.(text).catch(() => undefined)
    }
    shown = text !== undefined
  }
  new MutationObserver(() => {
    report(false)
  }).observe(document, { attributeFilter: ["hidden", "inert"], childList: true, subtree: true })
  globalThis.addEventListener("pageshow", (event) => {
    if (event.persisted) report(true)
  })
}

/** The open tab showing `page`, if the scenario has one. */
const tabShowing = (scenario: Expiration, page: Page): Tab | undefined =>
  [...scenario.tabs.values()].find((candidate) => candidate.page === page)

/**
 * A new browser context that watches for dialogs and exposed protected content and reports back/forward-cache restores;
 * with `hasTouch`, it has a touch screen as well as a mouse and keyboard.
 */
const newContext = async (scenario: Expiration, hasTouch = false): Promise<BrowserContext> => {
  const context = await scenario.browser.newContext({ hasTouch })
  await context.addInitScript(watchForDialogs)
  await context.addInitScript(watchForExposure)
  await context.exposeBinding("preetsProtectedExposed", ({ page }, text: string) => {
    tabShowing(scenario, page)?.exposed.push(text)
  })
  await context.addInitScript(() => {
    globalThis.addEventListener("pageshow", (event) => {
      void globalThis.window.preetsRestoreShown?.(event.persisted, document.querySelector("[role=dialog]") !== null)
    })
  })
  await context.exposeBinding("preetsRestoreShown", ({ page }, persisted: boolean, dialog: boolean) => {
    if (persisted) tabShowing(scenario, page)?.restored.push(dialog)
  })
  return context
}

/** The application session reference the named tab's browser held when the tab opened. */
export const openedSession = (tab: Tab, name: string): string => {
  assert.ok(tab.session, `expected tab "${name}" to have opened with a session`)
  return tab.session
}

/** The application session reference the tab's browser holds for its host, if any. */
export const sessionOf = async (tab: Tab): Promise<string | undefined> =>
  (await tab.page.context().cookies(`http://${tab.host}/`)).find((cookie) => cookie.name === "pathable-session")?.value

/** Waits for the protected page and reads the tab's held local deadline from its header. */
const readDeadline = async (page: Page): Promise<number> => {
  await page.getByRole("button", { name: PROTECTED_CONTROL }).waitFor({ state: "visible" })
  return heldDeadline(page)
}

/** The session header the coordinator renders, which carries the held deadline and warning lead as evidence. */
export const sessionHeader = (page: Page): Locator => page.locator("header[data-session-deadline]")

/** The tab's held local deadline, read from its header as it is now. */
export const heldDeadline = async (page: Page): Promise<number> => {
  const deadline = Number(await sessionHeader(page).getAttribute("data-session-deadline"))
  assert.ok(Number.isFinite(deadline), "expected the tab to hold a deadline")
  return deadline
}

/** How long after an event a step waits for a tab to reflect it before failing; any bound is checked separately. */
export const OBSERVATION_MILLISECONDS = 15_000

/**
 * Waits until the tab's header holds `deadline`, within the tab's clock-offset estimate, and answers when it first did,
 * on the test's clock.
 */
export const untilHolding = async (page: Page, deadline: number, timeout: number): Promise<number> => {
  await page.waitForFunction(
    ({ held, tolerance }) =>
      Math.abs(
        Number(document.querySelector("header[data-session-deadline]")?.getAttribute("data-session-deadline")) -
          held
      ) <= tolerance,
    { held: deadline, tolerance: OFFSET_TOLERANCE_MILLISECONDS },
    { polling: 50, timeout }
  )
  return Date.now()
}

/** Playwright's clock in a tab: `installed` keeps real time but can be set; `suspended` also stops timers after load. */
interface TabClock {
  readonly clock?: "installed" | "suspended" | undefined
}

/** A new named page at `host` in `context`, recording what a tab records, before it has opened anything. */
const newTab = async (scenario: Expiration, context: BrowserContext, name: string, host: string): Promise<Tab> => {
  const page = await context.newPage()
  const tab: Tab = {
    deadline: Number.NaN,
    exposed: [],
    host,
    loginTraffic: [],
    page,
    protectedDocuments: [],
    restored: [],
    session: undefined,
    statusAnswers: []
  }
  scenario.tabs.set(name, tab)
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (url.origin === PROVIDER_ORIGIN || (url.host === host && url.pathname.startsWith("/auth/login"))) {
      tab.loginTraffic.push(url)
    }
  })
  page.on("response", (response) => {
    const url = new URL(response.url())
    if (url.host === host && response.request().resourceType() === "document" && response.status() === 200) {
      tab.protectedDocuments.push(url.pathname)
    }
  })
  page.on("response", (response) => {
    if (new URL(response.url()).pathname !== "/session/status") return
    tab.statusAnswers.push({ at: Date.now(), status: response.status() })
  })
  return tab
}

/** Opens a named tab at `host` in `context`, optionally under Playwright's clock. */
const openTab = async (
  scenario: Expiration,
  context: BrowserContext,
  name: string,
  host: string,
  options: TabClock = {}
): Promise<Tab> => {
  const tab = await newTab(scenario, context, name, host)
  const { page } = tab
  if (options.clock !== undefined) await suspendTimers.beforeLoad(page)
  await page.goto(`http://${host}/`)
  tab.deadline = await readDeadline(page)
  tab.session = await sessionOf(tab)
  if (options.clock === "suspended") await suspendTimers.afterLoad(page)
  return tab
}

/**
 * Signs in through the application at `host`. With a provider session already held, only the password is asked, or
 * nothing at all: the provider records authentication in whole seconds, so a sign-in within the same second as the
 * previous one already satisfies the fresh-authentication request and returns straight to the application.
 */
const signIn = async (page: Page, host: string) => {
  await page.goto(`http://${host}/`)
  const username = page.getByRole("textbox", { name: /username|email/i })
  const password = page.getByRole("textbox", { exact: true, name: "Password" })
  const logOut = page.getByRole("button", { name: "Log out" })
  await password.or(logOut).first().waitFor({ state: "visible" })
  if (await logOut.isVisible()) return
  if (await username.isVisible()) {
    await signInAtProvider(page)
  } else {
    await password.fill("demo")
    await page.getByRole("button", { name: /sign in/i }).click({ noWaitAfter: true })
  }
  await page.waitForURL((url) => url.host === host)
  await logOut.waitFor({ state: "visible" })
}

/** Signs in a named context at `host` and opens the named tabs there; the sign-in page itself is closed. */
const signInAndOpen = async (
  world: AppWorld,
  contextName: string,
  host: string,
  names: readonly string[],
  options: TabClock = {},
  hasTouch = false
) => {
  const scenario = await scenarioOf(world)
  const context = scenario.contexts.get(contextName) ?? await newContext(scenario, hasTouch)
  scenario.contexts.set(contextName, context)
  const signing = await context.newPage()
  await signIn(signing, host)
  await signing.close()
  for (const name of names) await openTab(scenario, context, name, host, options)
  await settleDeadlines(names.map((name) => tabOf(world, name)))
}

/** Each tab converts the server deadline with its own clock-offset estimate, which differs by a few milliseconds. */
export const OFFSET_TOLERANCE_MILLISECONDS = 250

/**
 * Every page load renewed the session and broadcast it; waits until the tabs agree on the latest deadline, within
 * their clock-offset estimates, so each tab's measured deadline is the one it holds.
 */
const settleDeadlines = async (tabs: readonly Tab[]) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    for (const tab of tabs) tab.deadline = await readDeadline(tab.page)
    const deadlines = tabs.map((tab) => tab.deadline)
    if (Math.max(...deadlines) - Math.min(...deadlines) <= OFFSET_TOLERANCE_MILLISECONDS) return
    await delay(200)
  }
  assert.fail("expected the tabs to agree on one deadline")
}

/** Every tab the scenario has open, so another step file can observe them all (#156). */
export const openTabs = async (world: AppWorld): Promise<readonly Tab[]> => [...(await scenarioOf(world)).tabs.values()]

/** Opens a further named tab at `host` in a signed-in browser, such as `visitor`; its page load renews its session. */
export const openTabIn = async (world: AppWorld, browser: string, name: string, host: string): Promise<Tab> => {
  const scenario = await scenarioOf(world)
  const context = scenario.contexts.get(browser)
  assert.ok(context, `expected browser "${browser}" to have signed in`)
  return openTab(scenario, context, name, host)
}

Given(
  "the visitor has signed in at {string} and opened tabs {}",
  async function(this: AppWorld, host: string, list: string) {
    await signInAndOpen(this, "visitor", host, namesOf(list))
  }
)

Given(
  "the visitor has signed in at {string} and opened tab {string}",
  async function(this: AppWorld, host: string, name: string) {
    await signInAndOpen(this, "visitor", host, [name])
  }
)

/** The visitor's browser has a touch screen, so the visitor can tap as well as click and type (#441). */
Given(
  "the visitor has signed in at {string} on a touch screen and opened tab {string}",
  async function(this: AppWorld, host: string, name: string) {
    await signInAndOpen(this, "visitor", host, [name], {}, true)
  }
)

Given(
  "the visitor has signed in at {string} and opened tab {string} with its timers suspended",
  async function(this: AppWorld, host: string, name: string) {
    await signInAndOpen(this, "visitor", host, [name], { clock: "suspended" })
  }
)

Given(
  "another browser has signed in at {string} and opened tab {string}",
  async function(this: AppWorld, host: string, name: string) {
    await signInAndOpen(this, `other:${name}`, host, [name])
  }
)

Given(
  "another browser has signed in at {string} and opened tab {string} with its timers suspended",
  async function(this: AppWorld, host: string, name: string) {
    await signInAndOpen(this, `other:${name}`, host, [name], { clock: "suspended" })
  }
)

/**
 * Another browser presents a copy of the visitor's session and opens a tab. It shares the session with the visitor's
 * tabs but exchanges no cross-tab messages with them: its renewals reach them only through the server, and theirs
 * never reach it, as for a suspended tab.
 */
const openSharingTab = async (world: AppWorld, name: string, options: TabClock) => {
  const scenario = await scenarioOf(world)
  const visitor = scenario.contexts.get("visitor")
  assert.ok(visitor, "expected the visitor to have signed in")
  const session = (await visitor.cookies(`http://${SPRINGFIELD}/`)).find((cookie) => cookie.name === "pathable-session")
  assert.ok(session, "expected the visitor's session")
  const context = await newContext(scenario)
  await context.addCookies([{ name: "pathable-session", url: `http://${SPRINGFIELD}/`, value: session.value }])
  scenario.contexts.set(`sharing:${name}`, context)
  await openTab(scenario, context, name, SPRINGFIELD, options)
}

/** The tab leaves for the public login-failure page, which runs no session coordination. */
const leaveForPublicPage = async (tab: Tab) => {
  await tab.page.goto(`http://${tab.host}/login-unavailable`)
  await tab.page.getByRole("heading", { level: 1, name: "Login cannot start" }).waitFor({ state: "visible" })
}

/**
 * The tab leaves the protected entry for a public page that runs no session coordination, so nothing on the session's
 * cross-tab channel evicts the entry from the back/forward cache: a sharing tab's message would (Chromium reports
 * `BroadcastChannelOnMessage`), which is why the tab is in a browser of its own.
 */
Given(
  "another browser sharing the visitor's session has opened tab {string} and then left it for a public page",
  async function(this: AppWorld, name: string) {
    await openSharingTab(this, name, {})
    await leaveForPublicPage(tabOf(this, name))
  }
)

Given(
  "another browser sharing the visitor's session has opened tab {string} with its timers suspended",
  async function(this: AppWorld, name: string) {
    await openSharingTab(this, name, { clock: "suspended" })
  }
)

/** Opening a protected page renews the session on the server; the visitor's tabs do not learn of it. */
When(
  "another browser sharing the visitor's session opens tab {string} 30 seconds before the deadline of tab {string}",
  { timeout: 7 * 60_000 },
  async function(this: AppWorld, name: string, other: string) {
    await untilBefore(tabOf(this, other).deadline, 30_000)
    await openSharingTab(this, name, {})
  }
)

When("the visitor logs out in tab {string}", async function(this: AppWorld, name: string) {
  const { page } = tabOf(this, name)
  await page.getByRole("button", { name: "Log out" }).click()
  await page.getByRole("heading", { name: SIGNED_OUT_HEADING }).waitFor({ state: "visible" })
})

/** A character key on a protected control counts as activity, and the tab communicates it at once after silence. */
export const typeIn = async (tab: Tab): Promise<void> => {
  await tab.page.getByRole("button", { name: PROTECTED_CONTROL }).focus()
  const reported = tab.page.waitForResponse((response) => new URL(response.url()).pathname === "/session/activity")
  await tab.page.keyboard.press("a")
  assert.equal((await reported).status(), 200)
}

export const untilBefore = async (deadline: number, lead: number): Promise<void> => {
  await delay(Math.max(0, deadline - lead - Date.now()))
}

/** Waits until a dialog is in each named tab and answers when each appeared, on the test's clock. */
const dialogTimes = (world: AppWorld, names: readonly string[], timeout: number) =>
  Promise.all(names.map(async (name) => {
    await tabOf(world, name).page.waitForFunction(() => document.querySelector("[role=dialog]") !== null, undefined, {
      polling: 50,
      timeout
    })
    return Date.now()
  }))

When(
  "the idle deadline of tab {string} passes while tab {string} stays active",
  { timeout: 7 * 60_000 },
  async function(this: AppWorld, name: string, active: string) {
    const { deadline } = tabOf(this, name)
    await untilBefore(deadline, 30_000)
    await typeIn(tabOf(this, active))
    await untilBefore(deadline, 0)
  }
)

Then(
  "tabs {} each show the expiration modal within 2 seconds of their deadline",
  { timeout: 60_000 },
  async function(this: AppWorld, list: string) {
    const names = namesOf(list)
    const shown = await dialogTimes(this, names, 15_000)
    names.forEach((name, index) => {
      const late = (shown[index] ?? Number.POSITIVE_INFINITY) - tabOf(this, name).deadline
      assert.ok(late <= BOUND_MILLISECONDS, `tab "${name}" showed the modal ${String(late)} ms after its deadline`)
    })
  }
)

/** No protected text remains in the document or its accessibility tree, and no protected control remains. */
export const assertNoProtectedContent = async (page: Page, name: string): Promise<void> => {
  assert.doesNotMatch(await documentText(page), PROTECTED_TEXT, `tab "${name}" still holds protected text`)
  assert.doesNotMatch(await page.locator("body").ariaSnapshot(), PROTECTED_TEXT)
  assert.equal(await page.locator("form, header").count(), 0, `tab "${name}" still holds the header or a form`)
}

Then("tabs {} hold no protected content", async function(this: AppWorld, list: string) {
  for (const name of namesOf(list)) await assertNoProtectedContent(tabOf(this, name).page, name)
})

/** Each tab shows its protected content, and no dialog was ever in its document. */
Then("tabs {} still show their protected content", async function(this: AppWorld, list: string) {
  for (const name of namesOf(list)) {
    const { page } = tabOf(this, name)
    assert.ok(await page.getByRole("button", { name: PROTECTED_CONTROL }).isVisible(), `tab "${name}" lost content`)
    assert.equal(await page.evaluate(() => globalThis.window.preetsDialogSeen === true), false, `modal in "${name}"`)
  }
})

Then(
  "tab {string} still shows the signed-out notice and no expiration modal after its former deadline",
  { timeout: 7 * 60_000 },
  async function(this: AppWorld, name: string) {
    const { deadline, page } = tabOf(this, name)
    await untilBefore(deadline, -3_000)
    assert.ok(await page.getByRole("heading", { name: SIGNED_OUT_HEADING }).isVisible())
    assert.equal(await page.evaluate(() => globalThis.window.preetsDialogSeen === true), false)
  }
)

/**
 * The modal: a modal dialog named and described by the expired copy that recovery also asserts, whose only link is
 * Log in again to the application entry.
 */
export const assertExpirationModal = async (page: Page): Promise<void> => {
  const dialog = page.getByRole("dialog", { name: EXPIRED_COPY.heading })
  await dialog.waitFor({ state: "visible" })
  assert.equal(await dialog.getAttribute("aria-modal"), "true")
  const described = await dialog.getAttribute("aria-describedby")
  assert.ok(described, "expected the modal to have a description")
  assert.equal(await page.locator(`[id="${described}"]`).textContent(), EXPIRED_COPY.explanation)
  assert.deepEqual(await dialog.getByRole("link").allTextContents(), [EXPIRED_COPY.logIn])
  assert.equal(await dialog.getByRole("link").getAttribute("href"), "/")
}

Then(
  "the expiration modal in tab {string} explains expiration as in-tab recovery does, with the same Log in action",
  async function(this: AppWorld, name: string) {
    await assertExpirationModal(tabOf(this, name).page)
  }
)

const activeElementOf = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement ?? document.body
    return { inDialog: active.closest("[role=dialog]") !== null, name: active.textContent, tag: active.tagName }
  })

Then("focus in tab {string} is on {string} in the expiration modal", async function(
  this: AppWorld,
  name: string,
  link: string
) {
  assert.deepEqual(await activeElementOf(tabOf(this, name).page), { inDialog: true, name: link, tag: "A" })
})

/** Presses Escape, then clicks the page's top-left corner, outside any dialog. */
export const pressEscapeAndClickOutside = async (page: Page): Promise<void> => {
  await page.keyboard.press("Escape")
  await page.mouse.click(4, 4)
}

/** Focuses `control`, presses `key`, and answers the response to the `POST` to `pathname` that it caused. */
export const pressKeyAndAwaitPost = async (
  page: Page,
  control: Locator,
  key: "Enter" | "Space",
  pathname: string
): Promise<PlaywrightResponse> => {
  const answered = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === pathname
  )
  await control.focus()
  await page.keyboard.press(key)
  return answered
}

When(
  "the visitor presses Escape, clicks outside the modal, and activates its close button in tab {string}",
  async function(this: AppWorld, name: string) {
    const { page } = tabOf(this, name)
    await pressEscapeAndClickOutside(page)
    // The library modal always renders a close control (#400, styles#264); here it does nothing.
    await page.getByRole("dialog").getByRole("button").click()
  }
)

Then("tab {string} still shows the expiration modal and no protected content", async function(
  this: AppWorld,
  name: string
) {
  const tab = tabOf(this, name)
  await tab.page.getByRole("dialog", { name: EXPIRED_COPY.heading }).waitFor({ state: "visible" })
  assert.equal(new URL(tab.page.url()).pathname, "/")
  await assertNoProtectedContent(tab.page, name)
})

When(
  "the visitor presses Tab {int} times and then Shift+Tab {int} times in tab {string}",
  async function(this: AppWorld, forward: number, backward: number, name: string) {
    const { page } = tabOf(this, name)
    const presses = [
      ...Array.from({ length: forward }, () => "Tab"),
      ...Array.from({ length: backward }, () => "Shift+Tab")
    ]
    for (const key of presses) {
      await page.keyboard.press(key)
      const inDialog = await page.evaluate(() => document.activeElement?.closest("[role=dialog]") !== null)
      assert.ok(inDialog, `focus left the modal after ${key}`)
      assert.ok(await showsFocusIndicator(page), `no visible focus indicator after ${key}`)
    }
  }
)

Then("focus in tab {string} stayed within the expiration modal with visible focus", async function(
  this: AppWorld,
  name: string
) {
  assert.equal((await activeElementOf(tabOf(this, name).page)).inDialog, true)
})

When(
  "the visitor clicks where the protected control was in tab {string}",
  async function(this: AppWorld, name: string) {
    const { page } = tabOf(this, name)
    const viewport = page.viewportSize()
    assert.ok(viewport, "expected a viewport")
    // The reference page's control sits in the upper content area; click across it, where the background was.
    for (const y of [120, 200, 280]) await page.mouse.click(Math.round(viewport.width / 3), y)
  }
)

When("the visitor refreshes tab {string}", async function(this: AppWorld, name: string) {
  const tab = tabOf(this, name)
  tab.protectedDocuments.length = 0
  tab.exposed.length = 0
  await tab.page.reload()
})

/**
 * Back to the page before, which the tab left by a full navigation before expiry, or forward again. It waits only for
 * the traversal to commit: a page restored from the back/forward cache fires no `load`, and the outcome is for the
 * following step to observe.
 */
When("the visitor navigates {word} in tab {string}", async function(this: AppWorld, direction: string, name: string) {
  assert.ok(direction === "back" || direction === "forward", "expected back or forward")
  const tab = tabOf(this, name)
  tab.protectedDocuments.length = 0
  tab.exposed.length = 0
  const options = { waitUntil: "commit" } as const
  await (direction === "back" ? tab.page.goBack(options) : tab.page.goForward(options))
})

/** Two full navigations, so the tab has a forward entry; both renew the session for every tab sharing it. */
Given("the visitor has opened the roster in tab {string} and returned to the entry", async function(
  this: AppWorld,
  name: string
) {
  const tab = tabOf(this, name)
  await tab.page.goto(`http://${tab.host}/coordination/roster`)
  await tab.page.getByRole("button", { name: "Log out" }).waitFor({ state: "visible" })
  await tab.page.goBack()
  const context = tab.page.context()
  const sharing = [...(scenarios.get(this)?.tabs.values() ?? [])].filter((other) =>
    other.host === tab.host && other.page.context() === context
  )
  await settleDeadlines(sharing)
})

/** The deadline the protected page now in the tab holds, after the page load that renewed the session. */
const deadlineAfterLoad = async (tab: Tab) => {
  await tab.page.getByRole("button", { name: "Log out" }).waitFor({ state: "visible" })
  tab.deadline = await heldDeadline(tab.page)
}

/** A full navigation from the entry, so the entry is the page before; the page load renews the session. */
Given("the visitor has opened the roster in tab {string}", async function(this: AppWorld, name: string) {
  const tab = tabOf(this, name)
  await tab.page.goto(`http://${tab.host}/coordination/roster`)
  await deadlineAfterLoad(tab)
})

/**
 * The tab leaves the protected entry for a public page that runs no session coordination. Its browser has no other
 * tab, so nothing on the session's cross-tab channel evicts the entry from the back/forward cache.
 */
Given("the visitor has left tab {string} for a public page", async function(this: AppWorld, name: string) {
  await leaveForPublicPage(tabOf(this, name))
})

/**
 * Opens the roster by a full navigation, then the participant page in place: the App Router's own navigation, which
 * adds a history entry without loading a document. The click is activity, and B5 may communicate part of it only at
 * its window's end, so the tab's deadline is not predicted here; the scenario waits for the tab to confirm expiry.
 */
const openParticipantInPlace = async (tab: Tab) => {
  await tab.page.goto(`http://${tab.host}/coordination/roster`)
  await tab.page.getByRole("heading", { level: 1, name: "Coordination roster" }).waitFor({ state: "visible" })
  await tab.page.getByRole("button", { name: "Open participant page in place" }).click()
  await tab.page.getByRole("heading", { level: 1, name: "Coordination participant" }).waitFor({ state: "visible" })
}

Given(
  "the visitor has opened the participant page in place from the roster in tab {string}",
  async function(this: AppWorld, name: string) {
    await openParticipantInPlace(tabOf(this, name))
  }
)

/** As above, then back to the roster in place, so the participant page is a forward entry of the same document. */
Given(
  "the visitor has opened the participant page in place from the roster in tab {string} and gone back to the roster",
  async function(this: AppWorld, name: string) {
    const tab = tabOf(this, name)
    await openParticipantInPlace(tab)
    await tab.page.goBack({ waitUntil: "commit" })
    await tab.page.getByRole("heading", { level: 1, name: "Coordination roster" }).waitFor({ state: "visible" })
    assert.equal(new URL(tab.page.url()).pathname, "/coordination/roster")
  }
)

/**
 * Real time passes with no activity until each tab shows the expiration modal, which it shows only once the server
 * answered that its session ended, however late the session's last renewal was communicated.
 */
When(
  "the sessions of tabs {} expire and each shows the expiration modal",
  { timeout: 8 * 60_000 },
  async function(this: AppWorld, list: string) {
    for (const name of namesOf(list)) {
      await tabOf(this, name).page.getByRole("dialog", { name: EXPIRED_COPY.heading }).waitFor({
        state: "visible",
        timeout: 7 * 60_000
      })
    }
  }
)

/** A new tab in the same browser opens the application entry; its earlier session is the one that browser held. */
When(
  "the visitor opens a new tab {string} in the browser of tab {string}",
  async function(this: AppWorld, name: string, source: string) {
    const from = tabOf(this, source)
    const tab = await newTab(await scenarioOf(this), from.page.context(), name, from.host)
    tab.session = openedSession(from, source)
    await tab.page.goto(`http://${tab.host}/`)
  }
)

/**
 * PREETS-SESSION-013 AC3, observed directly: while the provider asks, the tab's browser still holds a provider single
 * sign-on session that would answer the same authorization without `max_age` at once.
 */
Then("the provider still holds the single sign-on session of tab {string}", async function(
  this: AppWorld,
  name: string
) {
  const tab = tabOf(this, name)
  const authorization = tab.loginTraffic.filter(isAuthorization).at(-1)
  assert.ok(authorization, "expected the application to start a provider login")
  assert.ok(
    await providerSignsInSilently(tab.page.context(), authorization),
    `expected the provider to sign tab "${name}" in without asking`
  )
})

/** Tabs to the link within the modal, then presses Enter. */
When("the visitor activates {string} by keyboard in tab {string}", async function(
  this: AppWorld,
  link: string,
  name: string
) {
  const tab = tabOf(this, name)
  tab.protectedDocuments.length = 0
  tab.exposed.length = 0
  tab.loginTraffic.length = 0
  for (let presses = 0; presses < 3 && (await activeElementOf(tab.page)).name !== link; presses += 1) {
    await tab.page.keyboard.press("Tab")
  }
  assert.deepEqual(await activeElementOf(tab.page), { inDialog: true, name: link, tag: "A" })
  await tab.page.keyboard.press("Enter")
})

/** The tab is on the provider's page asking the visitor to authenticate. */
const awaitProviderForm = async (tab: Tab) => {
  await tab.page.getByRole("textbox", { exact: true, name: "Password" }).waitFor({ state: "visible" })
  assert.equal(new URL(tab.page.url()).origin, PROVIDER_ORIGIN)
}

/**
 * Fresh entry (PREETS-SESSION-004): the tab reaches the provider asking the visitor to authenticate, no protected
 * document was served on the way, and a page restored from the back/forward cache held no dialog.
 */
const assertFreshEntry = async (tab: Tab) => {
  await awaitProviderForm(tab)
  assert.deepEqual(tab.protectedDocuments, [])
  assert.deepEqual(tab.exposed, [], "the tab exposed protected content on the way")
  assert.ok(!tab.restored.includes(true), "a restored page showed the modal")
}

Then(
  "tab {string} follows fresh entry to the provider without the modal or protected content",
  async function(this: AppWorld, name: string) {
    await assertFreshEntry(tabOf(this, name))
  }
)

/** As fresh entry, after the browser restored the protected page from its back/forward cache rather than loading it. */
Then(
  "tab {string} is restored from the back-forward cache and follows fresh entry to the provider without the modal or protected content",
  async function(this: AppWorld, name: string) {
    const tab = tabOf(this, name)
    await assertFreshEntry(tab)
    assert.ok(tab.restored.length > 0, `tab "${name}" was not restored from the back/forward cache`)
  }
)

/** Each named tab's local deadline passed, plus a margin, by the test's clock. */
When("the idle deadline of tabs {} passes", { timeout: 7 * 60_000 }, async function(this: AppWorld, list: string) {
  const latest = Math.max(...namesOf(list).map((name) => tabOf(this, name).deadline))
  await untilBefore(latest, -5_000)
})

When(
  "the visitor types in tab {string} 30 seconds before its deadline",
  { timeout: 7 * 60_000 },
  async function(this: AppWorld, name: string) {
    const tab = tabOf(this, name)
    await untilBefore(tab.deadline, 30_000)
    await typeIn(tab)
  }
)

/** The resumed tab's clock is set to wall time, or held `lag` seconds before its own deadline. */
const resume = async (world: AppWorld, name: string, lagSeconds?: number) => {
  const tab = tabOf(world, name)
  const time = lagSeconds === undefined ? Date.now() : tab.deadline - lagSeconds * 1_000
  const startedAt = Date.now()
  const hiddenAtOnce = await resumeAt(tab.page, time, PROTECTED_CONTROL)
  return { hiddenAtOnce, startedAt }
}

const resumptions = new WeakMap<AppWorld, Map<string, { hiddenAtOnce: boolean; startedAt: number }>>()

const recordResume = (world: AppWorld, name: string, outcome: { hiddenAtOnce: boolean; startedAt: number }) => {
  const recorded = resumptions.get(world) ?? new Map<string, { hiddenAtOnce: boolean; startedAt: number }>()
  recorded.set(name, outcome)
  resumptions.set(world, recorded)
}

/** How the named tab's last resume went: whether its content hid at once, and when the resume started. */
export const resumptionOf = (world: AppWorld, name: string): { hiddenAtOnce: boolean; startedAt: number } => {
  const outcome = resumptions.get(world)?.get(name)
  assert.ok(outcome, `expected tab "${name}" to have resumed`)
  return outcome
}

When("tab {string} resumes", async function(this: AppWorld, name: string) {
  recordResume(this, name, await resume(this, name))
})

When(
  "tab {string} resumes with its clock held {int} seconds before its deadline",
  async function(this: AppWorld, name: string, lag: number) {
    recordResume(this, name, await resume(this, name, lag))
  }
)

Then("tab {string} hid its protected content at once on resuming", function(this: AppWorld, name: string) {
  assert.equal(resumptionOf(this, name).hiddenAtOnce, true)
})

Then("tab {string} shows the expiration modal within 2 seconds of resuming", async function(
  this: AppWorld,
  name: string
) {
  const [shown] = await dialogTimes(this, [name], 10_000)
  const late = (shown ?? Number.POSITIVE_INFINITY) - resumptionOf(this, name).startedAt
  assert.ok(late <= BOUND_MILLISECONDS, `tab "${name}" showed the modal ${String(late)} ms after resuming`)
  await assertNoProtectedContent(tabOf(this, name).page, name)
})

Then("tab {string} shows its protected content again without the expiration modal", async function(
  this: AppWorld,
  name: string
) {
  const { page } = tabOf(this, name)
  await page.getByRole("button", { name: PROTECTED_CONTROL }).waitFor({ state: "visible" })
  assert.equal(await page.evaluate(() => globalThis.window.preetsDialogSeen === true), false)
})

Given(
  "the visitor has signed in at {string} and opened tab {string} under a settable clock",
  async function(this: AppWorld, host: string, name: string) {
    await signInAndOpen(this, "visitor", host, [name], { clock: "installed" })
  }
)

When("the visitor types in tab {string}", async function(this: AppWorld, name: string) {
  await typeIn(tabOf(this, name))
})

/**
 * The tab's clock runs `lead` seconds ahead while a second tab opens, renews the session, and broadcasts it. The tab
 * adopts the renewal and schedules its deadline check from its fast clock, so the check is due `lead` seconds early in
 * real time. The second tab closes and the clock returns to the current time; the check stays early, and when it fires
 * the tab's clock still reads before its local deadline, as when a timer outruns a loaded wall clock.
 */
When(
  "tab {string} schedules its deadline check from a clock {int} seconds fast, then the clock is corrected",
  async function(this: AppWorld, name: string, lead: number) {
    const scenario = await scenarioOf(this)
    const tab = tabOf(this, name)
    const before = await readDeadline(tab.page)
    await tab.page.clock.setSystemTime(Date.now() + lead * 1_000)
    const renewing = await openTab(scenario, tab.page.context(), `${name} renewal`, tab.host)
    await tab.page.waitForFunction(
      (held) => document.querySelector("header")?.getAttribute("data-session-deadline") !== String(held),
      before,
      { polling: 50, timeout: 5_000 }
    )
    // The renewing tab's clock is unskewed, so its deadline is the session's on the test's clock.
    tab.deadline = renewing.deadline
    await renewing.page.close()
    scenario.tabs.delete(`${name} renewal`)
    await tab.page.clock.setSystemTime(Date.now())
  }
)

Then(
  "tab {string} had a session check answered as still valid before its deadline",
  function(this: AppWorld, name: string) {
    const tab = tabOf(this, name)
    const early = tab.statusAnswers.filter((answer) => answer.status === 200 && answer.at < tab.deadline)
    assert.ok(
      early.length > 0,
      `expected tab "${name}" to confirm early; answers: ${JSON.stringify(tab.statusAnswers)}`
    )
  }
)

When("tab {string} reaches its deadline", { timeout: 7 * 60_000 }, async function(this: AppWorld, name: string) {
  await untilBefore(tabOf(this, name).deadline, 0)
})

/**
 * Log in from recovery content and the expiration modal (#157 slice C; PREETS-SESSION-013). Each tab's browser
 * signed in through the application, so it holds a provider single sign-on session that Log in must not reuse.
 */

Given(
  "another browser sharing the visitor's session has opened tab {string}",
  async function(this: AppWorld, name: string) {
    await openSharingTab(this, name, {})
  }
)

/** Starts a new mark for what the tab sends and receives from here on. */
const mark = (tab: Tab) => {
  tab.loginTraffic.length = 0
  tab.protectedDocuments.length = 0
  tab.exposed.length = 0
}

Then("tabs {} show the expiration modal and no protected content", async function(this: AppWorld, list: string) {
  for (const name of namesOf(list)) {
    const tab = tabOf(this, name)
    await tab.page.getByRole("dialog", { name: EXPIRED_COPY.heading }).waitFor({ state: "visible" })
    await assertNoProtectedContent(tab.page, name)
    mark(tab)
  }
})

/** The tab's clock jumps to wall time while every timer stays paused, as after a suspended device wakes. */
When(
  "the clock of tab {string} is set to the current time without running its timers",
  async function(this: AppWorld, name: string) {
    await tabOf(this, name).page.clock.setSystemTime(Date.now())
  }
)

When("the timers of tab {string} run again", async function(this: AppWorld, name: string) {
  await tabOf(this, name).page.clock.resume()
})

/** Focuses the reference form's submit button, presses Enter, and waits for the Server Action's answer. */
When("the visitor submits the reference form by keyboard in tab {string}", async function(
  this: AppWorld,
  name: string
) {
  const { page } = tabOf(this, name)
  await pressKeyAndAwaitPost(page, page.getByRole("button", { name: PROTECTED_CONTROL }), "Enter", "/")
})

/** Recovery replaced the header and content: one heading with the explanation, Log in again, nothing protected. */
Then(
  "tab {string} shows recovery explaining {string} in place of its content",
  async function(this: AppWorld, name: string, heading: string) {
    const tab = tabOf(this, name)
    await tab.page.getByRole("heading", { level: 1, name: heading }).waitFor({ state: "visible" })
    assert.deepEqual(await tab.page.getByRole("heading", { level: 1 }).allTextContents(), [heading])
    await tab.page.getByRole("link", { name: EXPIRED_COPY.logIn }).waitFor({ state: "visible" })
    await assertNoProtectedContent(tab.page, name)
    mark(tab)
  }
)

/** The visitor looks at the page and does nothing: no input reaches any tab. */
When("the visitor waits {int} seconds without acting", async function(this: AppWorld, seconds: number) {
  await delay(seconds * 1_000)
})

/** PREETS-SESSION-007 AC1: since the tab showed recovery or the modal, it requested no login route or provider. */
Then("no login has started in tab(s) {}", function(this: AppWorld, list: string) {
  for (const name of namesOf(list)) {
    assert.deepEqual(tabOf(this, name).loginTraffic.map(String), [], `tab "${name}" started a login`)
  }
})

/** Recovery moved focus to its heading; Tab reaches the link, and Enter activates it. */
When(
  "the visitor activates {string} in the recovery content by keyboard in tab {string}",
  async function(this: AppWorld, link: string, name: string) {
    const tab = tabOf(this, name)
    mark(tab)
    const target = tab.page.getByRole("link", { name: link })
    let focused = await target.evaluate((element) => element === document.activeElement)
    for (let presses = 0; presses < 3 && !focused; presses += 1) {
      await tab.page.keyboard.press("Tab")
      focused = await target.evaluate((element) => element === document.activeElement)
    }
    assert.ok(focused, `expected Tab to reach "${link}"`)
    await tab.page.keyboard.press("Enter")
  }
)

/** Answers the provider's password-only authentication step for the synthetic user. */
const submitPassword = async (page: Page) => {
  await page.getByRole("textbox", { exact: true, name: "Password" }).fill("demo")
  await page.getByRole("button", { name: /sign in/i }).click({ noWaitAfter: true })
}

/** The tab shows the protected application at its own host. */
const awaitApplication = async (tab: Tab) => {
  await tab.page.getByRole("button", { name: "Log out" }).waitFor({ state: "visible" })
  assert.equal(new URL(tab.page.url()).host, tab.host)
}

/**
 * B6: the application asked the provider for fresh authentication (`max_age=0`), and the provider, despite the
 * browser's single sign-on session, presents an authentication step instead of returning at once.
 */
Then("the provider asks the visitor to authenticate in tab {string}", async function(this: AppWorld, name: string) {
  const tab = tabOf(this, name)
  await awaitProviderForm(tab)
  const authorization = tab.loginTraffic.filter(isAuthorization).at(-1)
  assert.ok(authorization, "expected the application to start a provider login")
  assert.equal(authorization.searchParams.get("max_age"), "0")
})

/** With a provider session held, the provider re-authenticates the known user with a password-only form. */
When("the visitor authenticates at the provider in tab {string}", async function(this: AppWorld, name: string) {
  const tab = tabOf(this, name)
  await submitPassword(tab.page)
  await tab.page.waitForURL((url) => url.host === tab.host)
})

/** The protected application, under a session reference other than the one the tab opened with. */
Then("tab {string} shows the protected application under a new session", async function(
  this: AppWorld,
  name: string
) {
  const tab = tabOf(this, name)
  await awaitApplication(tab)
  const current = await sessionOf(tab)
  assert.ok(current, "expected a new application session")
  assert.notEqual(current, tab.session)
})

/**
 * A raw document request at `host` presenting a session reference: answered with the login delegation, never protected
 * content.
 */
export const assertNotAdmitted = async (world: AppWorld, host: string, session: string): Promise<void> => {
  const { body, headers, status } = await requestInstance(
    world,
    world.port,
    host,
    "/",
    true,
    `pathable-session=${session}`
  )
  const delegation = new URL(headers.location ?? "", `http://${host}`).pathname
  assert.deepEqual({ delegation, status }, { delegation: "/auth/login", status: 307 })
  assert.doesNotMatch(body, PROTECTED_TEXT)
}

Then("a request presenting the earlier session of tab {string} is not admitted", async function(
  this: AppWorld,
  name: string
) {
  const tab = tabOf(this, name)
  assert.ok(tab.session, "expected the tab to have opened with a session")
  await assertNotAdmitted(this, tab.host, tab.session)
})

/**
 * FR-024: after another tab's login established a new session in the same browser, this tab, which the visitor has
 * not touched, still shows the modal and no protected content, and received no protected document. The tabs
 * exchange messages at once; the observation lasts a few seconds beyond that.
 */
Then(
  "tab {string} still shows the expiration modal and no protected content after the login in tab {string}",
  async function(this: AppWorld, name: string, other: string) {
    const tab = tabOf(this, name)
    assert.notEqual(await sessionOf(tab), tab.session, `expected the login in tab "${other}" to have a new session`)
    await delay(3_000)
    await tab.page.getByRole("dialog", { name: EXPIRED_COPY.heading }).waitFor({ state: "visible" })
    assert.equal(new URL(tab.page.url()).pathname, "/")
    await assertNoProtectedContent(tab.page, name)
    assert.deepEqual(tab.protectedDocuments, [])
  }
)

/** The tab's content now comes from a document the server rendered under the valid session, with no provider step. */
Then(
  "tab {string} shows the protected application from a new document without another provider login",
  async function(this: AppWorld, name: string) {
    const tab = tabOf(this, name)
    await awaitApplication(tab)
    assert.deepEqual(tab.protectedDocuments, ["/"])
    assert.deepEqual(tab.loginTraffic.map(String), [])
  }
)

/**
 * Instead of completing the next authentication step submitted in this tab, the provider returns the error it sends
 * when a visitor declines (`access_denied` with the authorization request's state, as the tracked realm's
 * cancellation client does). The authorization request itself reached the real provider.
 */
const cancelNextAuthentication = async (tab: Tab) => {
  await tab.page.route(
    (url) => isAuthentication(url),
    async (route) => {
      const authorization = tab.loginTraffic.filter(isAuthorization).at(-1)
      assert.ok(authorization, "expected a provider login to be in progress")
      const callback = new URL(authorization.searchParams.get("redirect_uri") ?? "")
      callback.searchParams.set("error", "access_denied")
      callback.searchParams.set("state", authorization.searchParams.get("state") ?? "")
      await route.fulfill({ headers: { location: callback.href }, status: 302 })
    },
    { times: 1 }
  )
  tab.failedLogin = tab.page.waitForURL((url) => url.host === tab.host && url.pathname === "/auth/callback")
}

/** The provider stops accepting connections after it asked to authenticate, for the next submission only. */
const refuseNextAuthentication = async (tab: Tab) => {
  await tab.page.route((url) => isAuthentication(url), (route) => route.abort("connectionrefused"), { times: 1 })
  // The browser then shows its own error document instead of anything the provider or the application sent.
  tab.failedLogin = tab.page.waitForEvent("requestfailed", (request) => isAuthentication(new URL(request.url())))
    .then(() => tab.page.waitForURL((url) => url.protocol === "chrome-error:"))
}

When("the visitor will cancel at the next authentication step in tab {string}", async function(
  this: AppWorld,
  name: string
) {
  await cancelNextAuthentication(tabOf(this, name))
})

When("the provider will become unreachable at the next authentication step in tab {string}", async function(
  this: AppWorld,
  name: string
) {
  await refuseNextAuthentication(tabOf(this, name))
})

/** The visitor answers the provider's authentication step; where the login goes next is for later steps. */
When("the visitor submits the authentication step at the provider in tab {string}", async function(
  this: AppWorld,
  name: string
) {
  await submitPassword(tabOf(this, name).page)
})

/**
 * PREETS-SESSION-013 AC5: once the failed login ended, the tab displays no protected text or control, no protected
 * document was served, and any session reference the browser still holds is not admitted.
 */
Then(
  "tab {string} shows no protected content and holds no usable application session",
  async function(this: AppWorld, name: string) {
    const tab = tabOf(this, name)
    assert.ok(tab.failedLogin, "expected a failed login to have been arranged")
    await tab.failedLogin
    await tab.page.waitForLoadState()
    assert.doesNotMatch(await documentText(tab.page), PROTECTED_TEXT, `tab "${name}" shows protected text`)
    assert.equal(await tab.page.getByRole("button", { name: PROTECTED_CONTROL }).count(), 0)
    assert.equal(await tab.page.getByRole("button", { name: "Log out" }).count(), 0)
    assert.deepEqual(tab.protectedDocuments.filter((pathname) => !pathname.startsWith("/auth/")), [])
    const held = await sessionOf(tab)
    if (held !== undefined) await assertNotAdmitted(this, tab.host, held)
  }
)

/** Log in again leads to the application entry; the visitor opens it again in the same tab. */
When("the visitor tries Log in again from tab {string}", async function(this: AppWorld, name: string) {
  const tab = tabOf(this, name)
  mark(tab)
  await tab.page.goto(`http://${tab.host}/`)
})
