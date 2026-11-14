import type { Browser } from "playwright"

import { After, Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"

import type { AppWorld } from "../support/world.ts"

import { applicationBrowser, signInAtProvider } from "../support/browser.ts"
import { multipartBody, serverActionId } from "../support/server-actions.ts"
import { FETCH_METADATA, requestSiteWith, startSite } from "../support/server.ts"

/**
 * One visitor's real application session: the browser that signed in through the tracked provider, the host it
 * signed in at, and when the session was established (its idle deadline counts from then; nothing renews it later).
 */
interface SignedInVisitor {
  readonly browser: Browser
  readonly close: () => Promise<void>
  readonly host: string
  readonly signedInAt: number
}

const visitors = new WeakMap<AppWorld, SignedInVisitor>()

const visitorOf = (world: AppWorld): SignedInVisitor => {
  const visitor = visitors.get(world)
  assert.ok(visitor, "expected the visitor to have signed in")
  return visitor
}

After(async function(this: AppWorld) {
  const visitor = visitors.get(this)
  visitors.delete(this)
  await visitor?.close()
})

Given("Springfield sessions end after {int} minutes of inactivity", async function(this: AppWorld, minutes: number) {
  assert.ok(this.ownedDirectory, "expected scenario-owned tenant sites")
  const file = path.join(this.directory, "springfield.json")
  const springfield = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>
  await fs.writeFile(file, JSON.stringify({ ...springfield, idleTimeoutMinutes: minutes }))
})

/**
 * Signs in through the application and the tracked provider in a real browser, then closes the page so no activity
 * renews the session. The world keeps the session reference so later raw requests present it.
 */
Given("the visitor has signed in at {string} through the provider", async function(this: AppWorld, host: string) {
  await startSite(this)
  const owned = await applicationBrowser(this.port, [host])
  const context = await owned.browser.newContext()
  const page = await context.newPage()
  await page.goto(`http://${host}/`)
  await signInAtProvider(page)
  await page.waitForURL((url) => url.host === host)
  await page.getByRole("button", { name: "Log out" }).waitFor({ state: "visible" })
  const signedInAt = Date.now()
  const session = (await context.cookies(`http://${host}/`)).find((cookie) => cookie.name === "pathable-session")
  assert.ok(session, "expected an application session after signing in")
  this.cookie = session.value
  visitors.set(this, { browser: owned.browser, close: owned.close, host, signedInAt })
  await context.close()
})

/**
 * Another browser holding a copy of the session cookie logs out, so the server removes the record while the visitor's
 * own browser receives no notice of it (research D13). The visitor's reference stays in the world.
 */
When("the visitor's session record is removed by logging out in another browser", async function(this: AppWorld) {
  const visitor = visitorOf(this)
  assert.ok(this.cookie, "expected a session reference to copy")
  const other = await visitor.browser.newContext()
  await other.addCookies([{ name: "pathable-session", url: `http://${visitor.host}/`, value: this.cookie }])
  const page = await other.newPage()
  await page.goto(`http://${visitor.host}/`)
  await page.getByRole("button", { name: "Log out" }).click()
  await page.getByRole("heading", { name: "You are signed out" }).waitFor({ state: "visible" })
  await other.close()
})

/** Real elapsed time past the scenario tenant's idle timeout, counted from establishment, plus a margin. */
When("the session's idle deadline passes without activity", { timeout: 7 * 60_000 }, async function(this: AppWorld) {
  const visitor = visitorOf(this)
  const file = path.join(this.directory, "springfield.json")
  const { idleTimeoutMinutes } = JSON.parse(await fs.readFile(file, "utf8")) as { idleTimeoutMinutes?: number }
  assert.ok(idleTimeoutMinutes !== undefined, "expected a scenario idle timeout")
  const deadline = visitor.signedInAt + idleTimeoutMinutes * 60_000
  await delay(Math.max(0, deadline + 5_000 - Date.now()))
})

/**
 * A browser form submission without scripts: a top-level `multipart/form-data` navigation `POST` to the page, naming
 * the Server Action in a `$ACTION_ID_` field as React's server-rendered form action does, with no `next-action` header.
 */
When(
  "the visitor submits the protected reference action without scripts at {string}",
  async function(this: AppWorld, host: string) {
    const action = await serverActionId("runReferenceOperation")
    const { body, contentType } = await multipartBody({ [`$ACTION_ID_${action}`]: "" })
    await requestSiteWith(this, {
      body,
      headers: {
        ...FETCH_METADATA.document,
        Accept: "text/html",
        "content-type": contentType,
        Origin: `http://${host}`,
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1"
      },
      host,
      method: "POST",
      path: "/"
    })
  }
)

const RECOVERY_HEADINGS = ["Your session expired", "Your session is no longer available"]

/** The single top-level heading of an HTML document, as text. */
const onlyHeading = (body: string): string => {
  const headings = [...body.matchAll(/<h1[^>]*>(.*?)<\/h1>/gs)].map((match) => match[1] ?? "")
  assert.equal(headings.length, 1, "expected exactly one top-level heading")
  return headings[0] ?? ""
}

const assertRecoveryDocument = (world: AppWorld): string => {
  assert.ok(world.response, "expected an HTTP response")
  assert.match(world.response.headers["content-type"] ?? "", /^text\/html/)
  assert.match(world.response.body, /<a[^>]*href="\/"[^>]*>Log in again<\/a>/)
  return onlyHeading(world.response.body)
}

Then("the response is the recovery document explaining {string}", function(this: AppWorld, heading: string) {
  assert.equal(assertRecoveryDocument(this), heading)
})

Then("the response is a recovery document with a Log in again link", function(this: AppWorld) {
  assert.ok(RECOVERY_HEADINGS.includes(assertRecoveryDocument(this)), "expected a session-end explanation")
})

Then("the response reveals no session reference, identity, or tenant", function(this: AppWorld) {
  assert.ok(this.response, "expected an HTTP response")
  assert.ok(this.cookie, "expected the visitor's session reference")
  const output = `${this.response.body}\n${Object.entries(this.response.headers).flat().join("\n")}`
  assert.ok(!output.includes(this.cookie), "the response repeats the session reference")
  assert.doesNotMatch(output, /pathable-session|springfield|shelbyville|\bdemo\b|id_token|access_token/i)
})
