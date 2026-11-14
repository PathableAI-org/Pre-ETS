import type { Page } from "playwright"

export { applicationBrowser } from "./harness.ts"

/** Submits the tracked realm's synthetic user on the provider's sign-in form. */
export const signInAtProvider = async (page: Page): Promise<void> => {
  await page.getByRole("textbox", { name: /username|email/i }).fill("demo")
  await page.getByRole("textbox", { exact: true, name: "Password" }).fill("demo")
  await page.getByRole("button", { name: /sign in/i }).click({ noWaitAfter: true })
}

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
