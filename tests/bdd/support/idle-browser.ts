import assert from "node:assert/strict"

import type { TenantWorld } from "./world.ts"

import { signSessionCookie, verifySessionCookie } from "../../../packages/frontend/src/lib/session/cookie.ts"
import { computeIdleExpiresAt } from "../../../packages/frontend/src/lib/session/idle.ts"
import { RedisSessionStore } from "../../../packages/frontend/src/lib/session/store.ts"
import {
  generateSessionId,
  SESSION_COOKIE_NAME,
  type SessionRecord
} from "../../../packages/frontend/src/lib/session/types.ts"
import { assertInactivityModalSemantics } from "./actions.ts"
import { ensureMockOidcIssuer } from "./oidc.ts"
import { ensureOwnedProcess } from "./server.ts"
import { ensureSessionSettings } from "./session-env.ts"
import {
  deleteStoredSessionKey,
  hostForTenant,
  sessionConfig,
  setCookie,
  startLocalRedis,
  trackSessionId,
  visitUrl
} from "./session.ts"

const IDLE_DURATION_MINUTES = 5
/** Wall-clock seconds of remaining idle life after the page is open. */
const DEFAULT_IDLE_REMAINING_SECONDS = 20

export async function activateLoginAgainWithKeyboard(world: TenantWorld): Promise<void> {
  assert.ok(world.page)
  const loginAgain = world.page.getByTestId("inactivity-ended-login-again")
  if (!(await isActiveElement(loginAgain))) {
    await loginAgain.focus()
  }
  await world.page.keyboard.press("Enter")
  await world.page.waitForURL(
    /openid-connect\/auth|login-unavailable|Mock IdP/i,
    { timeout: 15_000 }
  ).catch(() => undefined)
}

export async function assertAuthenticatedLandingWithoutTemporaryWork(
  world: TenantWorld,
  tenantId: string
): Promise<void> {
  assert.ok(world.page)
  await world.page.getByText(/Signed in as:/i).waitFor({ state: "visible", timeout: 10_000 })
  if (tenantId === "springfield") {
    await world.page.getByText(/Tenant: Springfield Demo/i).waitFor({
      state: "visible",
      timeout: 5_000
    })
  }
  assert.equal(await world.page.getByTestId("unsent-practice-note").count(), 0)
  assert.notEqual(world.sessionId, world.originalSessionId)
}

export function assertDurableRecordRemembered(
  world: TenantWorld,
  record: string
): void {
  assert.ok(
    world.idleBrowserDurableRecords?.has(record),
    `durable record ${record} must remain tracked (demo UI has no durable fixture)`
  )
}

export async function assertExplanationDoesNotClaimInactivity(
  world: TenantWorld
): Promise<void> {
  assert.ok(world.page)
  assert.equal(await world.page.getByTestId("inactivity-ended-modal").count(), 0)
  const body = await world.page.innerText("body")
  assert.doesNotMatch(body, /ended because of inactivity/i)
  assert.doesNotMatch(body, /Session ended due to inactivity/i)
}

export async function assertFocusInInactivityModal(world: TenantWorld): Promise<void> {
  assert.ok(world.page)
  const loginAgain = world.page.getByTestId("inactivity-ended-login-again")
  await loginAgain.waitFor({ state: "visible" })
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await isActiveElement(loginAgain)) {
      return
    }
    await world.page.waitForTimeout(100)
  }
  assert.ok(await isActiveElement(loginAgain), "expected focus on Log in again")
}

export async function assertInactivityModalAccessible(world: TenantWorld): Promise<void> {
  assert.ok(world.page)
  await assertInactivityModalSemantics(world)
  const dialog = world.page.getByRole("dialog", {
    name: /session ended due to inactivity/i
  })
  const name = await dialog.getAttribute("aria-label")
  assert.match(name ?? "", /inactivity/i)
}

export async function assertKeyboardOperableRetryPath(world: TenantWorld): Promise<void> {
  assert.ok(world.page)
  const tryAgain = world.page.getByRole("link", { name: /try again/i })
  assert.equal(await tryAgain.count(), 1, "expected keyboard-operable Try again link")
  await tryAgain.focus()
  assert.ok(await isActiveElement(tryAgain))
}

export async function assertKeyboardStaysInModal(world: TenantWorld): Promise<void> {
  assert.ok(world.page)
  const loginAgain = world.page.getByTestId("inactivity-ended-login-again")
  assert.ok(await isActiveElement(loginAgain))
  await world.page.keyboard.press("Tab")
  await world.page.keyboard.press("Tab")
  assert.equal(await world.page.getByTestId("unsent-practice-note").count(), 0)
  const activeIsLogin = await isActiveElement(loginAgain)
  const activeInDialog = await isFocusInsideInactivityModal(world)
  assert.ok(activeIsLogin || activeInDialog, "focus escaped the inactivity modal")
}

export async function assertNoProtectedAccessInBrowser(world: TenantWorld): Promise<void> {
  assert.ok(world.page)
  assert.equal(
    await world.page.getByText(/Signed in as:/i).count(),
    0,
    "protected signed-in UI must not be available"
  )
  assert.equal(await world.page.getByTestId("unsent-practice-note").count(), 0)
}

export async function assertSpringfieldAuthJourneyBegan(world: TenantWorld): Promise<void> {
  assert.ok(world.page)
  const url = world.page.url()
  const body = await world.page.content()
  const onMockIdp = url.includes("openid-connect/auth") || /Mock IdP Login/i.test(body)
  const onUnavailable = /login-unavailable/i.test(url)
  assert.ok(
    onMockIdp || onUnavailable,
    `expected IdP or login-unavailable after Log in again, got ${url}`
  )
}

export async function assertTemporaryWorkClearedInBrowser(world: TenantWorld): Promise<void> {
  assert.ok(world.page)
  assert.equal(
    await world.page.getByTestId("unsent-practice-note").count(),
    0,
    "unsent practice note must not remain exposed"
  )
}

export async function clickLoginAgain(world: TenantWorld): Promise<void> {
  assert.ok(world.page)
  await Promise.all([
    world.page.waitForURL(/openid-connect\/auth|login-unavailable/i, { timeout: 15_000 }).catch(
      () => undefined
    ),
    world.page.getByTestId("inactivity-ended-login-again").click()
  ])
}

/**
 * After login-again rotated the cookie, authenticate the new sid in Redis and
 * return to the tenant landing (mock IdP has no real token endpoint).
 */
export async function completeLoginAgainAsAuthenticated(
  world: TenantWorld,
  tenantId: string,
  idleDurationMinutes = 7
): Promise<void> {
  assert.ok(world.page)
  await world.page.waitForURL(/openid-connect\/auth|Mock IdP/i, { timeout: 15_000 }).catch(
    () => undefined
  )

  const config = sessionConfig(world)
  const host = hostForTenant(world, tenantId)
  await syncSessionCookieFromBrowser(world, host)

  const cookieHeader = world.sessionCookieJar?.get(host)
  assert.ok(cookieHeader?.startsWith(`${SESSION_COOKIE_NAME}=`), "login-again cookie missing")
  const token = cookieHeader.slice(`${SESSION_COOKIE_NAME}=`.length)
  const claims = await verifySessionCookie(token, config, Math.floor(Date.now() / 1000))
  assert.ok(claims, "login-again cookie must verify")
  assert.notEqual(
    claims.sid,
    world.originalSessionId,
    "login-again must rotate away from the expired sid"
  )

  const now = Math.floor(Date.now() / 1000)
  const lastActivityAt = now
  const record: SessionRecord = {
    expiresAt: claims.exp,
    idleDurationMinutes,
    idleExpiresAt: computeIdleExpiresAt(lastActivityAt, idleDurationMinutes),
    lastActivityAt,
    tenantId,
    userId: "bdd-idle-user",
    userName: "BDD Idle User"
  }
  const store = new RedisSessionStore(config)
  const updated = await store.update(claims.sid, record)
  if (updated.kind === "missing") {
    const created = await store.create(claims.sid, record)
    assert.equal(created.kind, "created")
  } else {
    assert.equal(updated.kind, "updated")
  }

  world.sessionId = claims.sid
  world.sessionTenantId = tenantId
  await visitUrl(world, `http://${tenantId}.localhost:${String(world.port)}/`)
}

export async function endLoginAgainJourney(
  world: TenantWorld,
  outcome: string
): Promise<void> {
  assert.ok(world.page)
  const tenantId = world.sessionTenantId ?? "springfield"
  const unavailableUrl = `http://${tenantId}.localhost:${String(world.port)}/login-unavailable`

  switch (outcome) {
    case "authentication fails": {
      const fail = world.page.getByRole("link", { name: "Fail authentication" })
      if (await fail.count() > 0) {
        await fail.click().catch(() => undefined)
      }
      await visitUrl(world, unavailableUrl)
      break
    }
    case "the provider is unavailable": {
      await visitUrl(world, unavailableUrl)
      break
    }
    case "the user cancels": {
      const cancel = world.page.getByRole("link", { name: "Cancel" })
      if (await cancel.count() > 0) {
        await cancel.click().catch(() => undefined)
      }
      // Product maps cancel/error returns to an app-owned retry surface.
      await visitUrl(world, unavailableUrl)
      break
    }
    default: {
      throw new Error(`Unsupported login-again outcome: ${outcome}`)
    }
  }
}

export async function navigateInactivityModalWithKeyboard(world: TenantWorld): Promise<void> {
  assert.ok(world.page)
  const loginAgain = world.page.getByTestId("inactivity-ended-login-again")
  for (let index = 0; index < 12; index += 1) {
    if (await isActiveElement(loginAgain)) {
      return
    }
    await world.page.keyboard.press("Tab")
  }
  assert.ok(await isActiveElement(loginAgain), "keyboard navigation never reached Log in again")
}

export async function presentNonInactivityInterruption(
  world: TenantWorld,
  cause: string
): Promise<void> {
  assert.ok(world.page)
  assert.ok(world.sessionId)
  world.idleBrowserCause = cause
  const tenantId = world.sessionTenantId ?? "springfield"
  const config = sessionConfig(world)
  const store = new RedisSessionStore(config)

  switch (cause) {
    case "confirmed absolute lifetime expiration":
    case "indistinguishable lifetime causes": {
      const now = Math.floor(Date.now() / 1000)
      // Absolute elapsed while idle deadline remains in the future → not inactivity.
      const lastActivityAt = now - 60
      const idleDurationMinutes = IDLE_DURATION_MINUTES
      await store.update(world.sessionId, {
        expiresAt: now - 10,
        idleDurationMinutes,
        idleExpiresAt: computeIdleExpiresAt(lastActivityAt, idleDurationMinutes),
        lastActivityAt,
        tenantId,
        userId: "bdd-idle-user",
        userName: "BDD Idle User"
      })
      await visitUrl(world, `http://${tenantId}.localhost:${String(world.port)}/`)
      break
    }
    case "evicted session state":
    case "missing session state": {
      await deleteStoredSessionKey(world, world.sessionId)
      await visitUrl(world, `http://${tenantId}.localhost:${String(world.port)}/`)
      break
    }
    case "unavailable authorization state": {
      // Abort Server Action transport so the island fail-closes without an
      // inactivity claim (avoids restarting Next against a dead Redis).
      await world.page.route("**/*", async (route) => {
        if (route.request().headers()["next-action"] !== undefined) {
          await route.abort("failed")
          return
        }
        await route.continue()
      })
      await world.page.evaluate(() => {
        ;(globalThis as { dispatchEvent: (event: Event) => boolean }).dispatchEvent(
          new Event("focus")
        )
      })
      await world.page.getByTestId("auth-unavailable-retry").waitFor({
        state: "visible",
        timeout: 10_000
      }).catch(() => undefined)
      break
    }
    default: {
      throw new Error(`Unsupported interruption cause: ${cause}`)
    }
  }
}

export function rememberIdleBrowserDurableRecord(world: TenantWorld, record: string): void {
  world.idleBrowserDurableRecords ??= new Set()
  world.idleBrowserDurableRecords.add(record)
}

export function rememberIdleBrowserTemporaryWork(world: TenantWorld, work: string): void {
  world.idleBrowserTemporaryWork = work
}

/**
 * Prepare Redis + Next + mock IdP, seed an authenticated idle session whose
 * idle deadline is a few seconds ahead, then open Springfield in Playwright.
 */
export async function seedIdleBrowserAuthenticatedAccess(
  world: TenantWorld,
  tenantId: string,
  options: { readonly idleRemainingSeconds?: number } = {}
): Promise<void> {
  ensureSessionSettings(world)
  world.forceDevelopmentRuntime = true
  world.runtime = "development"
  world.resolutionMode = "host"
  world.sessionCookieHostStyle = "localhost"
  if (world.tenants.length === 0) {
    world.tenants = [
      { displayName: "Springfield Demo", slug: "springfield" },
      { displayName: "Shelbyville Demo", slug: "shelbyville" }
    ]
  }

  const mockIssuer = await ensureMockOidcIssuer(world)
  world.oidcFixtures = [
    {
      clientAuth: "public",
      clientId: "springfield-web",
      connection: "springfield-idp",
      displayName: "Springfield Demo",
      issuer: mockIssuer,
      slug: "springfield"
    },
    {
      clientAuth: "public",
      clientId: "shelbyville-web",
      connection: "shelbyville-idp",
      displayName: "Shelbyville Demo",
      issuer: mockIssuer,
      slug: "shelbyville"
    }
  ]
  world.processSignature = undefined

  await startLocalRedis(world)
  // Warm Next before stamping a short idle deadline so startup cannot burn it.
  await ensureOwnedProcess(world)

  const remaining = options.idleRemainingSeconds ?? DEFAULT_IDLE_REMAINING_SECONDS
  const now = Math.floor(Date.now() / 1000)
  const lastActivityAt = now - (IDLE_DURATION_MINUTES * 60 - remaining)
  const idleExpiresAt = computeIdleExpiresAt(lastActivityAt, IDLE_DURATION_MINUTES)
  const expiresAt = now + 86_400
  const sessionId = generateSessionId()
  const record: SessionRecord = {
    expiresAt,
    idleDurationMinutes: IDLE_DURATION_MINUTES,
    idleExpiresAt,
    lastActivityAt,
    tenantId,
    userId: "bdd-idle-user",
    userName: "BDD Idle User"
  }

  const config = sessionConfig(world)
  const store = new RedisSessionStore(config)
  const created = await store.create(sessionId, record)
  assert.equal(created.kind, "created", "failed to seed authenticated idle session")

  const token = await signSessionCookie(
    { exp: expiresAt, sid: sessionId, tenant: tenantId },
    config
  )
  setCookie(world, hostForTenant(world, tenantId), token)
  trackSessionId(world, sessionId)
  world.sessionId = sessionId
  world.originalSessionId = sessionId
  world.sessionTenantId = tenantId
  world.sessionExpiresAtSeconds = expiresAt
  world.previousSessionRecord = record
  world.idleBrowserTemporaryWork = undefined
  world.idleBrowserDurableRecords = new Set()
  world.idleBrowserCause = undefined

  const url = `http://${tenantId}.localhost:${String(world.port)}/`
  await visitUrl(world, url)
  assert.ok(world.page, "Playwright page required after idle browser seed")

  await world.page.getByText(`Tenant:`).waitFor({ state: "visible", timeout: 15_000 })
  await world.page.getByText(/Signed in as:/i).waitFor({ state: "visible", timeout: 10_000 })
}

/** Wait until the PathAble inactivity modal is open after deadline-aligned confirm. */
export async function waitForInactivityModal(world: TenantWorld): Promise<void> {
  assert.ok(world.page)
  assert.ok(world.sessionId)

  const page = world.page

  // Push authoritative idle past now so the island's focus/visibility confirm
  // discovers inactivity without depending on a long client timer (still uses
  // the production confirm Server Action — not a harness-only UI shortcut).
  await forceAuthoritativeIdleElapsed(world)

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await dispatchWindowFocus(world)
    const retry = page.getByTestId("auth-unavailable-retry")
    if (await retry.count() > 0) {
      await retry.click()
    }
    try {
      await page.getByTestId("inactivity-ended-modal").waitFor({
        state: "visible",
        timeout: 4_000
      })
      await page.getByTestId("inactivity-ended-login-again").waitFor({
        state: "visible",
        timeout: 5_000
      })
      return
    } catch {
      // Retry focus-triggered confirm.
    }
  }

  throw new Error("inactivity modal did not open after confirm attempts")
}

export async function waitForUnsentPracticeNote(world: TenantWorld): Promise<void> {
  assert.ok(world.page)
  await world.page.getByTestId("unsent-practice-note").waitFor({
    state: "visible",
    timeout: 10_000
  })
}

async function dispatchWindowFocus(world: TenantWorld): Promise<void> {
  assert.ok(world.page)
  await world.page.evaluate(() => {
    ;(globalThis as { dispatchEvent: (event: Event) => boolean }).dispatchEvent(
      new Event("focus")
    )
  })
}

async function forceAuthoritativeIdleElapsed(world: TenantWorld): Promise<void> {
  assert.ok(world.sessionId)
  const tenantId = world.sessionTenantId ?? "springfield"
  const config = sessionConfig(world)
  const store = new RedisSessionStore(config)
  const now = Math.floor(Date.now() / 1000)
  const lastActivityAt = now - IDLE_DURATION_MINUTES * 60 - 5
  const idleExpiresAt = computeIdleExpiresAt(lastActivityAt, IDLE_DURATION_MINUTES)
  const expiresAt = world.sessionExpiresAtSeconds ?? now + 86_400
  const updated = await store.update(world.sessionId, {
    expiresAt,
    idleDurationMinutes: IDLE_DURATION_MINUTES,
    idleExpiresAt,
    lastActivityAt,
    tenantId,
    userId: "bdd-idle-user",
    userName: "BDD Idle User"
  })
  assert.equal(updated.kind, "updated", "failed to expire idle deadline in Redis")
}

async function isActiveElement(locator: {
  evaluate: (fn: (node: object) => boolean) => Promise<boolean>
}): Promise<boolean> {
  return await locator.evaluate((node: object) => {
    const doc = "ownerDocument" in node
      ? (node.ownerDocument as null | { activeElement?: object })
      : null
    return doc?.activeElement === node
  })
}

async function isFocusInsideInactivityModal(world: TenantWorld): Promise<boolean> {
  assert.ok(world.page)
  return await world.page.evaluate(() => {
    const doc = globalThis as {
      document?: {
        activeElement?: null | {
          closest?: (selector: string) => unknown
        }
      }
    }
    const active = doc.document?.activeElement
    if (active?.closest === undefined) {
      return false
    }
    return active.closest("[data-testid=\"inactivity-ended-modal\"]") !== null
      || active.closest("[role=\"dialog\"]") !== null
  })
}

async function syncSessionCookieFromBrowser(
  world: TenantWorld,
  host: string
): Promise<void> {
  assert.ok(world.browserContext)
  const cookies = await world.browserContext.cookies()
  const session = cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME)
  assert.ok(session, "browser must hold a session cookie after login-again")
  setCookie(world, host, session.value)
}
