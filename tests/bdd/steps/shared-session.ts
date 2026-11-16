import { Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import { setTimeout as delay } from "node:timers/promises"

import type { AppWorld } from "../support/world.ts"

import { applicationBrowser, signInThroughApplication } from "../support/browser.ts"
import { namedEntries } from "../support/named.ts"
import { type RecordedResponse, requestInstance, sendRequest, startSecondSite } from "../support/server.ts"
import { namesOf } from "./expiration.ts"
import { assertNoProtectedContent, assertSameOriginLogin } from "./http.ts"
import { activityCommunication, type Presentation, sessionStatus, snapshotOf } from "./session-coordination.ts"

/**
 * The port of one of the two independently started application processes: A is the world's site, B its second site.
 * Both serve the same logical tenant authorities from the same configuration; session state reaches either one only
 * through the shared session store.
 */
const portOf = (world: AppWorld, instance: string): number => {
  assert.ok(instance === "A" || instance === "B", `Unknown application instance ${instance}`)
  return instance === "A" ? world.port : world.secondaryPort
}

/** The user and tenant an admitted entry shows. */
export interface EntryIdentity {
  readonly issuer: string
  readonly subject: string
  readonly tenantAlias: string
}

/**
 * One named real session. Deadlines are those the store reported through status reads, which never renew.
 */
interface SharedSession extends Presentation {
  /** The answers to the requests sent through both instances together at the session's deadline. */
  atDeadline: RecordedResponse[]
  /** The tag the session's own tabs send with activity, read from the session's status. */
  readonly coordinationTag: string
  /** What the establishing instance's entry showed right after sign-in, before the other instance served it. */
  readonly establishedIdentity: EntryIdentity
  /** The instance every request of the sign-in reached. */
  readonly establishedThrough: string
  /** The deadline right after sign-in, before any later request renewed it. */
  readonly originalDeadline: number
  /** The answers to activity sent through both instances together. */
  renewals: RecordedResponse[]
  /** The deadline a later renewal set, once a step has renewed the session. */
  renewedDeadline?: number | undefined
}

const sessions = namedEntries<SharedSession>((name) => `expected session ${name} to have been signed in`)

const sessionOf = sessions.get

const readStatus = (world: AppWorld, instance: string, session: Presentation) =>
  sessionStatus(world, portOf(world, instance), session)

/** A document entry: the gate renews a usable session for it, and the page reads the session. */
const requestEntry = (world: AppWorld, instance: string, session: Presentation) =>
  requestInstance(world, portOf(world, instance), session.host, "/", true, session.cookie)

/** Qualifying in-page activity as the session's own tab sends it, carrying the session's tag. */
const communicateActivity = (world: AppWorld, instance: string, session: SharedSession) =>
  sendRequest(world, {
    ...activityCommunication(session.host, "keyboard-interaction", session.coordinationTag),
    cookie: session.cookie,
    port: portOf(world, instance)
  })

/**
 * The reference entry displays the session's subject, issuer, and tenant alias as the first texts after its heading;
 * steps compare them between instances and promise no layout.
 */
export const entryIdentity = (response: RecordedResponse): EntryIdentity => {
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

/** Waits until two seconds after the latest of the listed sessions' chosen deadlines. */
const waitPast = async (world: AppWorld, list: string, deadlineOf: (session: SharedSession) => number) => {
  const names = namesOf(list)
  assert.ok(names.length > 0, `expected quoted session names in ${list}`)
  const latest = Math.max(...names.map((name) => deadlineOf(sessionOf(world, name))))
  await delay(Math.max(0, latest + 2_000 - Date.now()))
}

/** Steps run after a deadline on the clock these local processes share. */
const assertPast = (deadline: number): void => {
  assert.ok(Date.now() > deadline, "expected the step to run after the deadline")
}

/**
 * Signs in in a real browser whose every request, the provider return included, reaches one instance, and closes it
 * so nothing else renews the session. That instance's entry is then read for the identity it shows, and its status
 * for the session's tag and deadline.
 */
When(
  "the visitor signs in to session {string} at {string} through instance {word}",
  async function(this: AppWorld, name: string, host: string, instance: string) {
    await startSecondSite(this)
    const owned = await applicationBrowser(portOf(this, instance), [host])
    let reference: string
    try {
      reference = await signInThroughApplication(await owned.browser.newContext(), host)
    } finally {
      await owned.close()
    }
    const presented = { cookie: `pathable-session=${reference}`, host }
    const establishedIdentity = entryIdentity(await requestEntry(this, instance, presented))
    const { coordinationTag, deadline } = snapshotOf(await readStatus(this, instance, presented))
    sessions.set(this, name, {
      ...presented,
      atDeadline: [],
      coordinationTag,
      establishedIdentity,
      establishedThrough: instance,
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
  await waitPast(this, list, (session) => session.originalDeadline)
})

When("the renewed deadlines of sessions {} pass", { timeout: 7 * 60_000 }, async function(
  this: AppWorld,
  list: string
) {
  await waitPast(this, list, renewedDeadlineOf)
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

/** The other instance's first answer for the session is compared with what the establishing one showed before it. */
Then(
  "instance {word} admits session {string} to the application entry with the same user and tenant as instance {word}",
  async function(this: AppWorld, other: string, name: string, establishing: string) {
    const session = sessionOf(this, name)
    assert.equal(
      session.establishedThrough,
      establishing,
      `expected session ${name} established through ${establishing}`
    )
    assert.notEqual(other, establishing, "expected the other instance")
    const recognized = entryIdentity(await requestEntry(this, other, session))
    assert.deepEqual(recognized, session.establishedIdentity)
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
