import { Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import { setTimeout as delay } from "node:timers/promises"

import type { AppWorld } from "../support/world.ts"

import { applicationBrowser, signInAtProvider } from "../support/browser.ts"
import {
  FETCH_METADATA,
  type RecordedResponse,
  requestInstance,
  sendRequest,
  startSecondSite
} from "../support/server.ts"
import { assertNoProtectedContent, assertSameOriginLogin } from "./http.ts"

/**
 * The port of one of the two independently started application processes: A is the world's site, B its second site.
 * Both serve the same logical tenant authorities and share only the configured session store.
 */
const portOf = (world: AppWorld, instance: string): number => {
  assert.ok(instance === "A" || instance === "B", `Unknown application instance ${instance}`)
  return instance === "A" ? world.port : world.secondaryPort
}

/** What presents a session to an instance: its cookie, at the tenant authority it was established for. */
interface Presentation {
  /** The `Cookie` request header carrying the session reference. */
  readonly cookie: string
  readonly host: string
}

/**
 * One named real session. Deadlines are those the store reported through status reads, which never renew.
 */
interface SharedSession extends Presentation {
  /** The answers to the requests sent through both instances together at the session's deadline. */
  atDeadline: RecordedResponse[]
  /** The tag the session's own tabs send with activity, read from the session's status. */
  readonly coordinationTag: string
  /** The deadline right after sign-in, before any later request renewed it. */
  readonly originalDeadline: number
  /** The answers to activity sent through both instances together. */
  renewals: RecordedResponse[]
  /** The deadline a later renewal set, once a step has renewed the session. */
  renewedDeadline?: number | undefined
}

const sessions = new WeakMap<AppWorld, Map<string, SharedSession>>()

const sessionsOf = (world: AppWorld): Map<string, SharedSession> => {
  const named = sessions.get(world) ?? new Map<string, SharedSession>()
  sessions.set(world, named)
  return named
}

const sessionOf = (world: AppWorld, name: string): SharedSession => {
  const session = sessionsOf(world).get(name)
  assert.ok(session, `expected session ${name} to have been signed in`)
  return session
}

const namesIn = (list: string): string[] => {
  const names = [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "")
  assert.ok(names.length > 0, `expected quoted session names in ${list}`)
  return names
}

/** `GET /session/status`, an application request: it reads the session and never renews it. */
const readStatus = (world: AppWorld, instance: string, session: Presentation) =>
  requestInstance(world, portOf(world, instance), session.host, "/session/status", false, session.cookie)

/** A document entry: the gate renews a usable session for it, and the page reads the session. */
const requestEntry = (world: AppWorld, instance: string, session: Presentation) =>
  requestInstance(world, portOf(world, instance), session.host, "/", true, session.cookie)

/** Qualifying in-page activity as the session's own tab sends it: same-origin JSON carrying the session's tag. */
const communicateActivity = (world: AppWorld, instance: string, session: SharedSession) =>
  sendRequest(world, {
    body: Buffer.from(JSON.stringify({ activity: "keyboard-interaction", coordinationTag: session.coordinationTag })),
    cookie: session.cookie,
    headers: {
      ...FETCH_METADATA.application,
      "content-type": "application/json",
      Origin: `https://${session.host}`,
      "sec-fetch-site": "same-origin"
    },
    host: session.host,
    method: "POST",
    path: "/session/activity",
    port: portOf(world, instance)
  })

/** The usable session's snapshot, from a status read or an activity answer. */
const snapshotOf = (response: RecordedResponse) => {
  assert.equal(response.status, 200, "expected a usable session")
  const snapshot = JSON.parse(response.body) as { coordinationTag?: unknown; idleDeadlineEpochMilliseconds?: unknown }
  assert.equal(typeof snapshot.coordinationTag, "string")
  assert.equal(typeof snapshot.idleDeadlineEpochMilliseconds, "number")
  return { coordinationTag: String(snapshot.coordinationTag), deadline: Number(snapshot.idleDeadlineEpochMilliseconds) }
}

/**
 * The user and tenant an admitted entry shows. The reference entry displays the session's subject, issuer, and tenant
 * alias as the first texts after its heading; steps compare them between instances and promise no layout.
 */
const entryIdentity = (response: RecordedResponse) => {
  assert.equal(response.status, 200, "expected the entry to admit the session")
  const heading = response.body.indexOf(">Reference session<")
  assert.ok(heading >= 0, "expected the protected reference entry")
  const texts = [...response.body.slice(heading + 1).matchAll(/>([^<>]+)</g)].map((match) => match[1] ?? "")
  const [subject = "", issuer = "", tenantAlias = ""] = texts
  assert.ok(subject.length > 0 && issuer.length > 0, "expected the entry to show the session's identity")
  return { issuer, subject, tenantAlias }
}

const renewedDeadlineOf = (session: SharedSession): number => {
  assert.ok(session.renewedDeadline !== undefined, "expected the session to have been renewed")
  return session.renewedDeadline
}

/** Steps run after a deadline on the clock these local processes share. */
const assertPast = (deadline: number): void => {
  assert.ok(Date.now() > deadline, "expected the step to run after the deadline")
}

/**
 * Signs in through the tracked provider in a real browser whose every request, the provider return included, reaches
 * the instance on `port`, then closes the browser so nothing else renews the session. Answers the session's cookie.
 */
const signInThrough = async (port: number, host: string): Promise<string> => {
  const owned = await applicationBrowser(port, [host])
  try {
    const context = await owned.browser.newContext()
    const page = await context.newPage()
    await page.goto(`http://${host}/`)
    await signInAtProvider(page)
    await page.waitForURL((url) => url.host === host)
    await page.getByRole("button", { name: "Log out" }).waitFor({ state: "visible" })
    const session = (await context.cookies(`http://${host}/`)).find((entry) => entry.name === "pathable-session")
    assert.ok(session, "expected an application session after signing in")
    return `pathable-session=${session.value}`
  } finally {
    await owned.close()
  }
}

When(
  "the visitor signs in to session {string} at {string} through instance {word}",
  async function(this: AppWorld, name: string, host: string, instance: string) {
    await startSecondSite(this)
    const cookie = await signInThrough(portOf(this, instance), host)
    const { coordinationTag, deadline } = snapshotOf(await readStatus(this, instance, { cookie, host }))
    sessionsOf(this).set(name, {
      atDeadline: [],
      cookie,
      coordinationTag,
      host,
      originalDeadline: deadline,
      renewals: []
    })
  }
)

When(
  "session {string} is renewed by a page request through instance {word}",
  async function(this: AppWorld, name: string, instance: string) {
    const session = sessionOf(this, name)
    assert.equal((await requestEntry(this, instance, session)).status, 200, "expected the page request admitted")
    session.renewedDeadline = snapshotOf(await readStatus(this, instance, session)).deadline
  }
)

When("activity for session {string} reaches instances A and B simultaneously", async function(
  this: AppWorld,
  name: string
) {
  const session = sessionOf(this, name)
  session.renewals = await Promise.all([
    communicateActivity(this, "A", session),
    communicateActivity(this, "B", session)
  ])
  session.renewedDeadline = snapshotOf(await readStatus(this, "A", session)).deadline
})

When("the original deadlines of sessions {} pass", { timeout: 7 * 60_000 }, async function(
  this: AppWorld,
  list: string
) {
  const deadlines = namesIn(list).map((name) => sessionOf(this, name).originalDeadline)
  await delay(Math.max(0, Math.max(...deadlines) + 2_000 - Date.now()))
})

When("the renewed deadlines of sessions {} pass", { timeout: 7 * 60_000 }, async function(
  this: AppWorld,
  list: string
) {
  const deadlines = namesIn(list).map((name) => renewedDeadlineOf(sessionOf(this, name)))
  await delay(Math.max(0, Math.max(...deadlines) + 2_000 - Date.now()))
})

/** Sent together a tenth of a second after the session's authoritative deadline. */
When(
  "session {string} reaches its deadline as page requests and activity reach instances A and B simultaneously",
  { timeout: 7 * 60_000 },
  async function(this: AppWorld, name: string) {
    const session = sessionOf(this, name)
    await delay(Math.max(0, renewedDeadlineOf(session) + 100 - Date.now()))
    session.atDeadline = await Promise.all([
      requestEntry(this, "A", session),
      requestEntry(this, "B", session),
      communicateActivity(this, "A", session),
      communicateActivity(this, "B", session)
    ])
  }
)

Then(
  "instance {word} admits session {string} to the application entry with the same user and tenant as instance {word}",
  async function(this: AppWorld, other: string, name: string, establishing: string) {
    const session = sessionOf(this, name)
    // The instance that never served this session answers before the establishing one serves it again.
    const recognized = entryIdentity(await requestEntry(this, other, session))
    const established = entryIdentity(await requestEntry(this, establishing, session))
    assert.deepEqual(recognized, established)
    assert.equal(recognized.tenantAlias, session.host.split(".")[0])
  }
)

Then(
  "instance {word} reports the deadline that renewal set for session {string}",
  async function(this: AppWorld, instance: string, name: string) {
    const session = sessionOf(this, name)
    const renewed = renewedDeadlineOf(session)
    assert.ok(renewed > session.originalDeadline, "expected the renewal to set a later deadline")
    assert.equal(snapshotOf(await readStatus(this, instance, session)).deadline, renewed)
  }
)

Then(
  "instance {word} still reports session {string} usable with that renewed deadline",
  async function(this: AppWorld, instance: string, name: string) {
    const session = sessionOf(this, name)
    assertPast(session.originalDeadline)
    assert.equal(snapshotOf(await readStatus(this, instance, session)).deadline, renewedDeadlineOf(session))
  }
)

/** Both renewals were admitted; the store keeps the deadline one of them set, and both instances read it. */
Then(
  "instances A and B report the same later deadline for session {string}, set by one of those renewals",
  async function(this: AppWorld, name: string) {
    const session = sessionOf(this, name)
    const renewals = session.renewals.map((response) => snapshotOf(response).deadline)
    const deadline = renewedDeadlineOf(session)
    assert.equal(snapshotOf(await readStatus(this, "B", session)).deadline, deadline)
    assert.ok(renewals.includes(deadline), "expected the deadline one of the simultaneous renewals set")
    assert.ok(deadline > session.originalDeadline, "expected the renewals to set a later deadline")
  }
)

/** A status read is refused, and a document entry, which would renew a usable session, delegates to login. */
Then(
  "instance {word} denies session {string} protected access",
  async function(this: AppWorld, instance: string, name: string) {
    const session = sessionOf(this, name)
    assertPast(renewedDeadlineOf(session))
    assert.equal((await readStatus(this, instance, session)).status, 401)
    const entry = await requestEntry(this, instance, session)
    assertSameOriginLogin(entry)
    assertNoProtectedContent(entry)
  }
)

Then(
  "activity for session {string} through instance {word} is refused and revives it on neither instance",
  async function(this: AppWorld, name: string, instance: string) {
    const session = sessionOf(this, name)
    assert.equal((await communicateActivity(this, instance, session)).status, 401)
    assert.equal((await readStatus(this, "A", session)).status, 401)
    assert.equal((await readStatus(this, "B", session)).status, 401)
  }
)

Then("each of those simultaneous requests for session {string} is denied", function(this: AppWorld, name: string) {
  const [entryOnA, entryOnB, activityOnA, activityOnB] = sessionOf(this, name).atDeadline
  for (const entry of [entryOnA, entryOnB]) {
    assertSameOriginLogin(entry)
    assertNoProtectedContent(entry)
  }
  assert.equal(activityOnA?.status, 401)
  assert.equal(activityOnB?.status, 401)
})

Then("neither instance reports session {string} usable", async function(this: AppWorld, name: string) {
  const session = sessionOf(this, name)
  assert.equal((await readStatus(this, "A", session)).status, 401)
  assert.equal((await readStatus(this, "B", session)).status, 401)
})
