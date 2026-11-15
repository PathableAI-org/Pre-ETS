import type { BrowserContext, Page } from "playwright"

import assert from "node:assert/strict"

import { applicationBrowser } from "./harness.ts"

export { applicationBrowser } from "./harness.ts"

/**
 * Runs `use` in a new context of an owned application browser for `host` whose cookie jar presents the session
 * reference, when there is one, and closes the browser afterwards.
 */
export const withSessionContext = async <A>(
  port: number,
  host: string,
  reference: string | undefined,
  use: (context: BrowserContext) => Promise<A>
): Promise<A> => {
  const owned = await applicationBrowser(port, [host])
  try {
    const context = await owned.browser.newContext()
    if (reference !== undefined) {
      await context.addCookies([{ name: "pathable-session", url: `http://${host}/`, value: reference }])
    }
    return await use(context)
  } finally {
    await owned.close()
  }
}

/** Submits the tracked realm's synthetic user on the provider's sign-in form. */
export const signInAtProvider = async (page: Page): Promise<void> => {
  await page.getByRole("textbox", { name: /username|email/i }).fill("demo")
  await page.getByRole("textbox", { exact: true, name: "Password" }).fill("demo")
  await page.getByRole("button", { name: /sign in/i }).click({ noWaitAfter: true })
}

/**
 * Signs in at `host` through the application and the tracked provider in a new page of `context`, waits until the
 * signed-in entry shows, and answers the application session cookie's value.
 */
export const signInThroughApplication = async (context: BrowserContext, host: string): Promise<string> => {
  const page = await context.newPage()
  await page.goto(`http://${host}/`)
  await signInAtProvider(page)
  await page.waitForURL((url) => url.host === host)
  await page.getByRole("button", { name: "Log out" }).waitFor({ state: "visible" })
  const session = (await context.cookies(`http://${host}/`)).find((cookie) => cookie.name === "pathable-session")
  assert.ok(session, "expected an application session after signing in")
  return session.value
}

/**
 * Whether the focused element draws a keyboard focus indicator: it matches `:focus-visible` and its computed outline
 * is drawn, with a style other than `none` and a nonzero width.
 */
export const showsFocusIndicator = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const focused = document.activeElement
    if (focused?.matches(":focus-visible") !== true) return false
    const { outlineStyle, outlineWidth } = getComputedStyle(focused)
    return outlineStyle !== "none" && Number.parseFloat(outlineWidth) > 0
  })

/**
 * Every element's text, hidden or not. Inline scripts are excluded: they hold Next's serialized render data, which is
 * never displayed, focusable, or exposed to assistive technology.
 */
export const documentText = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const body = document.body.cloneNode(true)
    if (!(body instanceof HTMLElement)) return ""
    for (const script of body.querySelectorAll("script")) script.remove()
    return body.textContent
  })

/**
 * Stops the page's timers under Playwright's clock: installed before the page loads, paused right after it, so no
 * timer fires while its clock stands still (research D13). The page keeps receiving events.
 */
export const suspendTimers = {
  afterLoad: async (page: Page): Promise<void> => {
    await page.clock.pauseAt(Date.now() + 1_000)
  },
  beforeLoad: async (page: Page): Promise<void> => {
    await page.clock.install()
  }
}

/**
 * Emulates a suspended tab returning (verification.md "emulated freeze"): the page's clock is set to `time` without
 * running its timers, the page reports hidden and then visible again, and only then do its timers run at real speed.
 * Answers whether the protected content was hidden synchronously, in the same task as the return.
 */
export const resumeAt = async (page: Page, time: number, protectedControl: string): Promise<boolean> => {
  await page.clock.setSystemTime(time)
  const hiddenAtOnce = await page.evaluate((name) => {
    const report = (state: DocumentVisibilityState) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state })
      document.dispatchEvent(new Event("visibilitychange"))
    }
    report("hidden")
    report("visible")
    Reflect.deleteProperty(document, "visibilityState")
    const control = [...document.querySelectorAll("button")].find((button) => button.textContent === name)
    // A control no longer in the document is hidden too.
    return control?.closest("[hidden]") !== null
  }, protectedControl)
  await page.clock.resume()
  return hiddenAtOnce
}

declare global {
  interface Window {
    /** Set by the dialog watcher once any dialog has been in the document. */
    preetsDialogSeen?: boolean
    /** Set by the dialog watcher: the first dialog in the document, by its labelling heading, and when it came. */
    preetsFirstDialog?: { readonly at: number; readonly name: string }
  }
}

/** Records, from the first script of every document, whether a dialog was ever in it, and which came first and when. */
export const watchForDialogs = (): void => {
  const nameOf = (dialog: Element) =>
    document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")?.textContent ?? ""
  const record = () => {
    const dialog = document.querySelector("[role=dialog]")
    if (dialog === null) return
    globalThis.window.preetsDialogSeen = true
    globalThis.window.preetsFirstDialog ??= { at: Date.now(), name: nameOf(dialog) }
  }
  new MutationObserver(record).observe(document, { childList: true, subtree: true })
}

/** The roles counted as headers and controls when reading what the accessibility tree exposes. */
const EXPOSED_ROLES: ReadonlySet<string> = new Set(["banner", "button", "checkbox", "combobox", "link", "textbox"])

/**
 * Each header and control in Chromium's own accessibility tree, as `role: name`, read over CDP. Playwright's role
 * queries do not treat inert content as hidden; this tree leaves it out, as assistive technology and the keyboard do.
 */
export const exposedControls = async (page: Page): Promise<string[]> => {
  const cdp = await page.context().newCDPSession(page)
  try {
    const { nodes } = await cdp.send("Accessibility.getFullAXTree")
    return nodes
      .filter((node) => !node.ignored && EXPOSED_ROLES.has(String(node.role?.value)))
      .map((node) => `${String(node.role?.value)}: ${String(node.name?.value ?? "")}`)
  } finally {
    await cdp.detach()
  }
}
