import type { BrowserContext, Page } from "playwright"

import assert from "node:assert/strict"
import { createHash, randomBytes } from "node:crypto"

import { applicationBrowser, providerBrowser } from "./harness.ts"

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

/** The tracked realm's provider, as every tenant fixture's issuer names it. */
export const PROVIDER_ORIGIN = "http://127.0.0.1:8080"
/** Whether a URL is the tracked provider's endpoint ending in `suffix`. */
const providerEndpoint = (suffix: string) => (url: URL) =>
  url.origin === PROVIDER_ORIGIN && url.pathname.endsWith(suffix)
/** An authorization request at the tracked provider. */
export const isAuthorization = providerEndpoint("/protocol/openid-connect/auth")
/** A submission of the tracked provider's authentication step. */
export const isAuthentication = providerEndpoint("/login-actions/authenticate")

/** Submits the tracked realm's synthetic user on the provider's sign-in form. */
export const signInAtProvider = async (page: Page): Promise<void> => {
  await page.getByRole("textbox", { name: /username|email/i }).fill("demo")
  await page.getByRole("textbox", { exact: true, name: "Password" }).fill("demo")
  await page.getByRole("button", { name: /sign in/i }).click({ noWaitAfter: true })
}

/**
 * The authorization code in the provider's answer to a sign-in, which must lead back to `redirectUri`. These checks use
 * `assert.fail`, whose message Cucumber shows; for `assert.ok` it shows only the diff.
 */
const returnedCode = (answer: string | undefined, redirectUri: string): string => {
  const code = answer?.startsWith(`${redirectUri}?`) === true ? new URL(answer).searchParams.get("code") : null
  if (code === null || code === "") {
    assert.fail("expected the provider to answer the sign-in with a code for the redirect URI")
  }
  return code
}

/**
 * Signs the tracked realm's synthetic user in at `issuer` for `clientId` without the application, and answers the
 * claims of the ID token the provider issues. The browser never requests `redirectUri`: the provider's answer to the
 * sign-in is read without being followed, and its code is exchanged directly. Setup uses this to check a fixture
 * client's prerequisite; it observes nothing about the application.
 */
export const providerIdTokenClaims = async (request: {
  readonly clientId: string
  readonly issuer: string
  readonly redirectUri: string
}): Promise<Record<string, unknown>> => {
  // The sign-in answer is intercepted by `isAuthentication`, which matches only the tracked provider; any other issuer
  // would let the browser follow the redirect instead.
  if (new URL(request.issuer).origin !== PROVIDER_ORIGIN) {
    assert.fail(`expected the tracked provider at ${PROVIDER_ORIGIN}, got issuer ${request.issuer}`)
  }
  const verifier = randomBytes(32).toString("base64url")
  const authorization = new URL(`${request.issuer}/protocol/openid-connect/auth`)
  authorization.search = new URLSearchParams({
    client_id: request.clientId,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    max_age: "0",
    redirect_uri: request.redirectUri,
    response_type: "code",
    scope: "openid",
    state: randomBytes(16).toString("base64url")
  }).toString()
  const browser = await providerBrowser()
  try {
    const page = await browser.newPage()
    // Playwright cannot route a redirect, so the browser must not follow the provider's: it would deliver the code to
    // whatever listens at `redirectUri`.
    const answers: string[] = []
    await page.route(isAuthentication, async (route) => {
      answers.push((await route.fetch({ maxRedirects: 0 })).headers().location ?? "")
      await route.fulfill({ status: 204 })
    }, { times: 1 })
    await page.goto(authorization.href)
    const answered = page.waitForResponse((response) => isAuthentication(new URL(response.url())))
    await signInAtProvider(page)
    await answered
    const code = returnedCode(answers[0], request.redirectUri)
    const response = await fetch(`${request.issuer}/protocol/openid-connect/token`, {
      body: new URLSearchParams({
        client_id: request.clientId,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: request.redirectUri
      }),
      method: "POST"
    })
    if (!response.ok) assert.fail(`expected the provider to issue tokens, got HTTP ${String(response.status)}`)
    const { id_token: idToken } = (await response.json()) as { id_token: string }
    return JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>
  } finally {
    await browser.close()
  }
}

/**
 * The same authorization as `authorization`, asking the provider not to prompt and without `max_age`. The state, nonce,
 * and code challenge are new, so nothing of the application's transaction is reused.
 */
const silentAuthorization = (authorization: URL): URL => {
  const silent = new URL(authorization.href)
  silent.searchParams.delete("max_age")
  silent.searchParams.set("prompt", "none")
  silent.searchParams.set("state", randomBytes(16).toString("base64url"))
  silent.searchParams.set("nonce", randomBytes(16).toString("base64url"))
  silent.searchParams.set(
    "code_challenge",
    createHash("sha256").update(randomBytes(32).toString("base64url")).digest("base64url")
  )
  return silent
}

/** Where the provider's answer to `authorization`, requested in a new page of `context`, leads, without following it. */
const authorizationAnswer = async (context: BrowserContext, authorization: URL): Promise<string> => {
  const page = await context.newPage()
  try {
    const answers: string[] = []
    await page.route(isAuthorization, async (route) => {
      answers.push((await route.fetch({ maxRedirects: 0 })).headers().location ?? "")
      await route.fulfill({ body: "", contentType: "text/plain", status: 200 })
    }, { times: 1 })
    await page.goto(authorization.href)
    return answers.join("")
  } finally {
    await page.close()
  }
}

/**
 * Whether the tracked provider would still sign the browser of `context` in without asking: the same authorization as
 * `authorization`, but with `prompt=none` and without `max_age`, made with the provider cookies `context` holds, is
 * answered with a code for its redirect URI rather than an error. The answer is read without being followed, so the
 * code never reaches the redirect URI and is never redeemed. A pending authentication step in another page of
 * `context` stays as it was.
 */
export const providerSignsInSilently = async (context: BrowserContext, authorization: URL): Promise<boolean> => {
  if (!isAuthorization(authorization)) assert.fail(`expected an authorization at ${PROVIDER_ORIGIN}`)
  const redirectUri = String(authorization.searchParams.get("redirect_uri"))
  const answer = await authorizationAnswer(context, silentAuthorization(authorization))
  if (!answer.startsWith(`${redirectUri}?`)) {
    assert.fail("expected the provider to answer a silent authorization at the redirect URI")
  }
  const { searchParams } = new URL(answer)
  return !searchParams.has("error") && searchParams.has("code")
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
 * Signs in at `host` through the application on `port` in a browser of its own, which it then closes, so no page
 * renews or watches the session afterwards. Answers the session cookie's value, with when the browser began signing in
 * and when it had closed its pages, on the test's clock: every request of the sign-in falls between the two.
 */
export const signInAndClose = async (
  port: number,
  host: string
): Promise<{ readonly closedAt: number; readonly reference: string; readonly startedAt: number }> => {
  const owned = await applicationBrowser(port, [host])
  try {
    const context = await owned.browser.newContext()
    const startedAt = Date.now()
    const reference = await signInThroughApplication(context, host)
    await context.close()
    return { closedAt: Date.now(), reference, startedAt }
  } finally {
    await owned.close()
  }
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
 * The document's full text, hidden or not: every node's text from the root element down, the head and inline scripts
 * included. Next's serialized render data stays in inline scripts after they run, so a check that skips them would miss
 * protected text left there (PREETS-SESSION-012 AC1, PREETS-SESSION-007 AC3). Values held only in the page's script
 * memory are not in the document.
 */
export const documentText = (page: Page): Promise<string> => page.evaluate(() => document.documentElement.textContent)

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
