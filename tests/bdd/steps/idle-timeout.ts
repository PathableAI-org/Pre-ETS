import { Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import { setTimeout as delay } from "node:timers/promises"

import type { AppWorld } from "../support/world.ts"

import { applicationBrowser, signInThroughApplication } from "../support/browser.ts"
import { namedEntries } from "../support/named.ts"
import { FETCH_METADATA, type RecordedResponse, requestInstance, sendRequest, startSite } from "../support/server.ts"
import { namesOf } from "./expiration.ts"
import { actionRequest, assertNoProtectedContent, assertSameOriginLogin } from "./http.ts"
import {
  activityCommunication,
  deadlineOf,
  PREFETCH_HEADERS,
  type Presentation,
  sessionStatus,
  snapshotOf
} from "./session-coordination.ts"

/*
 * Named sessions under the tenant idle timeout (#452, PREETS-SESSION-008). Every deadline is judged by the test's own
 * clock: a session is due to end its timeout after the request that last wrote it, which the test timed. A deadline the
 * application reports is compared with that, never taken as the expectation; enforcement is observed through status
 * reads, which never renew, so observing a session leaves its deadline where it was.
 */

const MINUTE_MILLISECONDS = 60_000
/** A session must still be usable this long before the earliest moment it is due to end. */
const BEFORE_DUE_MILLISECONDS = 1_000
/** A session must have ended this long after the latest moment it is due to end. */
const AFTER_DUE_MILLISECONDS = 100

/** One named real session as raw requests present it, with no browser left running for it. */
interface TimedSession extends Presentation {
  /** The tag the session's own tabs would send with activity and forms, read from its status. */
  readonly coordinationTag: string
  /** The latest requests presenting it that no visitor action caused. */
  unprompted: readonly Unprompted[]
  written: Written
}

/** One request presenting a session that no visitor action caused: its answer, and the deadline read around it. */
interface Unprompted {
  readonly after: number
  readonly before: number
  readonly kind: string
  readonly status: number
}

/** On the test's clock, from sending the request that last wrote a session's deadline to receiving its answer. */
interface Written {
  readonly from: number
  readonly to: number
}

const sessions = namedEntries<TimedSession>((name) => `expected session ${name} to have been signed in`)

const sessionOf = sessions.get

/** The earliest and latest moments the session is due to end under a timeout of `minutes`, on the test's clock. */
const dueOf = (session: TimedSession, minutes: number) => ({
  earliest: session.written.from + minutes * MINUTE_MILLISECONDS,
  latest: session.written.to + minutes * MINUTE_MILLISECONDS
})

/** A document entry: the gate renews a usable session for it, with the tenant's timeout at that moment. */
const pageRequest = (world: AppWorld, session: TimedSession) =>
  requestInstance(world, world.port, session.host, "/", true, session.cookie)

/** Qualifying in-page activity as the session's own tab communicates it, carrying the session's tag. */
const inPageActivity = (world: AppWorld, session: TimedSession) =>
  sendRequest(world, {
    ...activityCommunication(session.host, "keyboard-interaction", session.coordinationTag),
    cookie: session.cookie,
    port: world.port
  })

/** The protected reference form as the session's own page submits it, with the session's tag. */
const formSubmission = async (world: AppWorld, session: TimedSession) =>
  sendRequest(world, {
    ...await actionRequest(world, "runReferenceOperation", session.host, "/", session.coordinationTag),
    cookie: session.cookie,
    port: world.port
  })

const statusRead = (world: AppWorld, session: Presentation) => sessionStatus(world, world.port, session)

/**
 * Signs each named session in through the application and the tracked provider in a browser of its own, then closes
 * that browser, so nothing renews the session afterwards and no browser timer can end it. The provider's return
 * establishes the session and the entry it loads renews it, so its deadline was last written between the browser's
 * first request and its closing.
 */
When(
  "the visitor signs in to session(s) {} at {string}",
  { timeout: 4 * MINUTE_MILLISECONDS },
  async function(this: AppWorld, list: string, host: string) {
    await startSite(this)
    const names = namesOf(list)
    assert.ok(names.length > 0, `expected quoted session names in ${list}`)
    for (const name of names) {
      const owned = await applicationBrowser(this.port, [host])
      let reference: string
      let written: Written
      try {
        const context = await owned.browser.newContext()
        const from = Date.now()
        reference = await signInThroughApplication(context, host)
        await context.close()
        written = { from, to: Date.now() }
      } finally {
        await owned.close()
      }
      const presented = { cookie: `pathable-session=${reference}`, host }
      const { coordinationTag } = snapshotOf(await statusRead(this, presented))
      sessions.set(this, name, { ...presented, coordinationTag, unprompted: [], written })
    }
  }
)

/** Sends one qualifying request and takes it as the latest write of the session's deadline, once it was admitted. */
const renew = async (
  world: AppWorld,
  name: string,
  send: (world: AppWorld, session: TimedSession) => Promise<RecordedResponse>
) => {
  const session = sessionOf(world, name)
  const from = Date.now()
  const { status } = await send(world, session)
  const to = Date.now()
  assert.equal(status, 200, `expected the request for session ${name} to be admitted`)
  session.written = { from, to }
}

When("session {string} is renewed by a page request", async function(this: AppWorld, name: string) {
  await renew(this, name, pageRequest)
})

When("session {string} is renewed by in-page activity", async function(this: AppWorld, name: string) {
  await renew(this, name, inPageActivity)
})

When("session {string} is renewed by a protected form submission", async function(this: AppWorld, name: string) {
  await renew(this, name, formSubmission)
})

/** Requests an open tab sends on its own: a link's prefetch, a route refresh, the site icon, and a status read. */
const UNPROMPTED_REQUESTS = [
  { headers: PREFETCH_HEADERS, kind: "prefetch", path: "/coordination/participant" },
  { headers: { ...FETCH_METADATA.application, rsc: "1" }, kind: "RSC request", path: "/coordination/participant" },
  { headers: FETCH_METADATA.image, kind: "image request", path: "/favicon.ico" },
  { headers: FETCH_METADATA.application, kind: "status read", path: "/session/status" }
] as const

/** Each request is same-origin, as a tab sends it, and the deadline is read just before and just after it. */
When(
  "session {string} is presented with a prefetch, an RSC request, an image request, and a status read",
  async function(this: AppWorld, name: string) {
    const session = sessionOf(this, name)
    const sent: Unprompted[] = []
    for (const { headers, kind, path } of UNPROMPTED_REQUESTS) {
      const before = await deadlineOf(this, session)
      const { status } = await sendRequest(this, {
        cookie: session.cookie,
        headers: { "sec-fetch-site": "same-origin", ...headers },
        host: session.host,
        method: "GET",
        path,
        port: this.port
      })
      sent.push({ after: await deadlineOf(this, session), before, kind, status })
    }
    session.unprompted = sent
  }
)

/**
 * Admitted: neither denied nor failed, so the gate read a usable session and let the request through; a request it
 * denied would renew nothing whatever the timeout, and would show nothing.
 */
Then(
  "each of those requests was admitted without moving the deadline of session {string}",
  function(this: AppWorld, name: string) {
    const { unprompted } = sessionOf(this, name)
    assert.ok(unprompted.length > 0, `expected requests to have presented session ${name}`)
    for (const { after, before, kind, status } of unprompted) {
      assert.ok(status < 500 && status !== 401 && status !== 403, `the ${kind} was answered ${String(status)}`)
      assert.equal(after, before, `the ${kind} moved the deadline of session ${name}`)
    }
  }
)

/** The deadline the session's status reports lies within the moments the test's clock says it is due to end. */
const assertReportedDeadline = async (world: AppWorld, name: string, minutes: number) => {
  const session = sessionOf(world, name)
  const { deadline } = snapshotOf(await statusRead(world, session))
  const { earliest, latest } = dueOf(session, minutes)
  assert.ok(
    deadline >= earliest && deadline <= latest,
    `session ${name} reports a deadline ${String(deadline - earliest)} ms from the earliest it is due, ` +
      `which is ${String(latest - earliest)} ms before the latest`
  )
}

Then(
  "session {string} reports a deadline {int} minutes after it was established or last renewed",
  async function(this: AppWorld, name: string, minutes: number) {
    await assertReportedDeadline(this, name, minutes)
  }
)

Then(
  "sessions {} each report a deadline {int} minutes after they were established or last renewed",
  async function(this: AppWorld, list: string, minutes: number) {
    for (const name of namesOf(list)) await assertReportedDeadline(this, name, minutes)
  }
)

When(
  "the visitor waits until {int} seconds before session {string} is due to end, {int} minutes after it was established or last renewed",
  { timeout: 8 * MINUTE_MILLISECONDS },
  async function(this: AppWorld, seconds: number, name: string, minutes: number) {
    const until = dueOf(sessionOf(this, name), minutes).earliest - seconds * 1_000
    assert.ok(Date.now() <= until, `expected the scenario to reach this step before ${String(seconds)} seconds remain`)
    await delay(until - Date.now())
  }
)

/**
 * The server ends each session between the moments it is due to end, and not before: a status read a second before
 * the earliest finds it usable, and one once the latest has passed finds it ended. The reads of every listed session
 * run in time order, so sessions whose moments interleave are each read at theirs.
 */
const assertEnded = async (world: AppWorld, names: readonly string[], minutes: number) => {
  assert.ok(names.length > 0, "expected quoted session names")
  const reads = names.flatMap((name) => {
    const session = sessionOf(world, name)
    const { earliest, latest } = dueOf(session, minutes)
    return [
      { at: earliest - BEFORE_DUE_MILLISECONDS, due: earliest, name, session, usable: true },
      { at: latest + AFTER_DUE_MILLISECONDS, due: latest, name, session, usable: false }
    ]
  }).sort((one, other) => one.at - other.at)
  for (const { at, due, name, session, usable } of reads) {
    await delay(Math.max(0, at - Date.now()))
    const { status } = await statusRead(world, session)
    const answeredAt = Date.now()
    if (usable) {
      assert.ok(answeredAt < due, `the read of session ${name} came ${String(answeredAt - due)} ms too late to judge`)
      assert.equal(
        status,
        200,
        `expected session ${name} usable ${String(due - answeredAt)} ms before it is due to end`
      )
    } else {
      assert.equal(status, 401, `expected session ${name} ended ${String(answeredAt - due)} ms after it was due to end`)
    }
  }
}

Then(
  "the server ends session {string} {int} minutes after it was established or last renewed, and not before",
  { timeout: 8 * MINUTE_MILLISECONDS },
  async function(this: AppWorld, name: string, minutes: number) {
    await assertEnded(this, [name], minutes)
  }
)

Then(
  "the server ends sessions {} {int} minutes after they were established or last renewed, and not before",
  { timeout: 8 * MINUTE_MILLISECONDS },
  async function(this: AppWorld, list: string, minutes: number) {
    await assertEnded(this, namesOf(list), minutes)
  }
)

/**
 * A page request, in-page activity, and a protected form submission, each of which would renew a usable session, then a
 * status read: the page request's answer, and the others' statuses.
 */
const presentEach = async (world: AppWorld, name: string) => {
  const session = sessionOf(world, name)
  return {
    page: await pageRequest(world, session),
    statuses: {
      activity: (await inPageActivity(world, session)).status,
      formSubmission: (await formSubmission(world, session)).status,
      statusRead: (await statusRead(world, session)).status
    }
  }
}

/** The tenant failure comes before any session operation, so no request reads or renews the session. */
Then(
  "a page request, in-page activity, a protected form submission, and a status read for session {string} are each answered 404, as for a missing tenant",
  async function(this: AppWorld, name: string) {
    const { page, statuses } = await presentEach(this, name)
    assert.equal(page.status, 404, "the page request")
    assert.equal(page.headers.location, undefined, "the page request redirected")
    assertNoProtectedContent(page)
    assert.deepEqual(statuses, { activity: 404, formSubmission: 404, statusRead: 404 })
  }
)

/** None of the requests may renew the ended session under the tenant's current timeout, and the status read agrees. */
Then(
  "a page request, in-page activity, and a protected form submission for session {string} are each refused, and it stays ended",
  async function(this: AppWorld, name: string) {
    const { page, statuses } = await presentEach(this, name)
    assertSameOriginLogin(page)
    assertNoProtectedContent(page)
    assert.deepEqual(statuses, { activity: 401, formSubmission: 401, statusRead: 401 })
  }
)
