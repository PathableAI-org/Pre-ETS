import type { Page } from "playwright"

export { applicationBrowser } from "./harness.ts"

/** Submits the tracked realm's synthetic user on the provider's sign-in form. */
export const signInAtProvider = async (page: Page): Promise<void> => {
  await page.getByRole("textbox", { name: /username|email/i }).fill("demo")
  await page.getByRole("textbox", { exact: true, name: "Password" }).fill("demo")
  await page.getByRole("button", { name: /sign in/i }).click({ noWaitAfter: true })
}

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
  }
}

/** Records, from the first script of every document, whether a dialog was ever in it. */
export const watchForDialogs = (): void => {
  const observe = () => {
    new MutationObserver(() => {
      if (document.querySelector("[role=dialog]") !== null) globalThis.window.preetsDialogSeen = true
    }).observe(document, { childList: true, subtree: true })
  }
  observe()
}
