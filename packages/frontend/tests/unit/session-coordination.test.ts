import type { SessionCoordinationSnapshot } from "@pathableai/pre-ets-frontend-services"

import { fc, it } from "@fast-check/vitest"
import { afterEach, beforeEach, describe, expect, vi } from "vitest"

import { classifySessionActivity } from "../../src/features/session-coordination/activity-classification.ts"
import {
  type ActivityWindowRecord,
  applyCommunication,
  decideActivityCommunication,
  flushActivityCommunication
} from "../../src/features/session-coordination/activity-window.ts"
import { calibrateClockOffset } from "../../src/features/session-coordination/clock-offset.ts"
import { knownExpiration } from "../../src/features/session-coordination/known-expiration.ts"
import { adoptSnapshot } from "../../src/features/session-coordination/snapshot-order.ts"
import { openTabChannel, type TabMessage } from "../../src/features/session-coordination/tab-channel.ts"
import { TabCoordination, type TabViewState } from "../../src/features/session-coordination/tab-coordination.ts"
import { ACTION_DENIAL_BODY, readActionDenial } from "../../src/providers/action-denial.ts"

const WINDOW = 60_000

interface FakeElement {
  getAttribute(name: string): null | string
  hasAttribute(name: string): boolean
  readonly isContentEditable?: boolean
  readonly parentElement: FakeElement | null
  readonly tagName: string
}

/** A plain object with the element facts a DOM `Element` provides; the node environment has no DOM. */
const element = (
  tagName: string,
  attributes: Readonly<Record<string, string>> = {},
  parentElement: FakeElement | null = null
): FakeElement => ({
  getAttribute: (name) => attributes[name] ?? null,
  hasAttribute: (name) => name in attributes,
  parentElement,
  tagName
})

const domEvent = (
  type: string,
  target: FakeElement | null,
  extra: Readonly<Record<string, unknown>> = {}
) => ({ isTrusted: true, target, type, ...extra }) as unknown as Event

const classify = (event: Event, gestureInCurrentTask = false) =>
  classifySessionActivity(event, { gestureInCurrentTask })

const main = element("MAIN")
const button = element("BUTTON", {}, main)
const textInput = element("INPUT", { type: "text" }, main)
const link = element("A", { href: "/coordination/roster" }, main)
const roleButton = element("DIV", { role: "button" }, main)
const editable = element("DIV", { contenteditable: "true" }, main)

describe("classifySessionActivity (research D4) [PREETS-SESSION-009]", () => {
  it.each([
    ["a click on a button", domEvent("click", button), "intentional-control-activation"],
    ["a click inside a link", domEvent("click", element("SPAN", {}, link)), "intentional-control-activation"],
    ["a click on an ARIA button", domEvent("click", roleButton), "intentional-control-activation"],
    ["text entry in an input", domEvent("beforeinput", textInput), "text-entry"],
    ["text entry in an editable region", domEvent("beforeinput", editable), "text-entry"],
    ["a character key", domEvent("keydown", textInput, { key: "a" }), "keyboard-interaction"],
    ["Enter on a button", domEvent("keydown", button, { key: "Enter" }), "keyboard-interaction"],
    ["a touch press", domEvent("pointerdown", button, { pointerType: "touch" }), "touch-interaction"]
  ])("counts %s", (_label, event, expected) => {
    expect(classify(event)).toBe(expected)
  })

  it("counts focus on a meaningful input only with a user gesture in the same task", () => {
    expect(classify(domEvent("focusin", textInput), true)).toBe("user-driven-meaningful-input-focus")
    expect(classify(domEvent("focusin", textInput), false)).toBeUndefined()
  })

  it.each([
    ["pointer movement", domEvent("pointermove", button, { pointerType: "mouse" })],
    ["mouse movement", domEvent("mousemove", button)],
    ["a mouse press", domEvent("pointerdown", button, { pointerType: "mouse" })],
    ["scrolling", domEvent("scroll", main)],
    ["a wheel turn", domEvent("wheel", button)],
    ["a lone modifier key", domEvent("keydown", textInput, { key: "Shift" })],
    ["an untrusted click", domEvent("click", button, { isTrusted: false })],
    ["a click outside any meaningful input", domEvent("click", element("P", {}, main))],
    ["a click on an anchor without href", domEvent("click", element("A", {}, main))],
    ["a click on a hidden input", domEvent("click", element("INPUT", { type: "hidden" }, main))],
    ["a click on a disabled button", domEvent("click", element("BUTTON", { disabled: "" }, main))],
    ["a click on an aria-disabled control", domEvent("click", element("BUTTON", { "aria-disabled": "true" }))],
    ["a click inside an inert region", domEvent("click", element("BUTTON", {}, element("DIV", { inert: "" })))],
    [
      "a click inside aria-hidden content",
      domEvent("click", element("BUTTON", {}, element("DIV", { "aria-hidden": "true" })))
    ],
    ["an event without an element target", domEvent("click", null)]
  ])("does not count %s", (_label, event) => {
    expect(classify(event, true)).toBeUndefined()
  })
})

const TAG = "session-a"

interface Outcome {
  /** Interaction time and the time of the send that communicated it. */
  readonly covered: readonly (readonly [number, number])[]
  /** Per interaction, in order: the most recent send already made when it occurred. */
  readonly previousSends: readonly (number | undefined)[]
  /** Send time and the deadline known when it was sent. */
  readonly sends: readonly (readonly [number, number])[]
}

/**
 * Drives the window policy as the coordinator does: each interaction decides against the shared record; the window
 * end and the near-deadline point re-decide while a pending interaction remains; each send renews the deadline.
 */
interface Timer {
  readonly at: number
  readonly kind: "flush" | "near-deadline"
}

const simulate = (
  interactions: readonly number[],
  initialDeadline: number,
  idle: number,
  staleFlushes: readonly number[] = []
): Outcome => {
  const queue = [...interactions]
  const timers: Timer[] = staleFlushes.map((at) => ({ at, kind: "flush" }))
  let record: ActivityWindowRecord | undefined
  let deadline = initialDeadline
  let pending: number[] = []
  const covered: (readonly [number, number])[] = []
  const previousSends: (number | undefined)[] = []
  const sends: (readonly [number, number])[] = []

  const send = (now: number) => {
    sends.push([now, deadline])
    for (const at of pending) covered.push([at, now])
    pending = []
    deadline = now + idle
  }
  const decide = (now: number) => {
    const decision = decideActivityCommunication(record, { deadline, now })
    record = decision.record
    if (decision._tag === "SendNow") send(now)
    else timers.push({ at: decision.sendAt, kind: "flush" }, { at: deadline - WINDOW + 1, kind: "near-deadline" })
  }
  const flush = (now: number) => {
    const decision = flushActivityCommunication(record, { now })
    if (decision._tag === "Reschedule") timers.push({ at: decision.sendAt, kind: "flush" })
    if (decision._tag !== "Send") return
    record = decision.record
    send(now)
  }
  const nearDeadline = (now: number) => {
    if (record?.pendingSince !== undefined && deadline - now < WINDOW) decide(now)
  }
  const interact = (at: number) => {
    previousSends.push(sends.at(-1)?.[0])
    pending.push(at)
    decide(at)
  }
  const step = () => {
    timers.sort((left, right) => left.at - right.at)
    const nextTimer = timers[0]
    const nextInteraction = queue[0] ?? Number.POSITIVE_INFINITY
    if (nextTimer === undefined || nextInteraction <= nextTimer.at) {
      interact(queue.shift() ?? nextInteraction)
      return
    }
    timers.shift()
    if (nextTimer.kind === "flush") flush(nextTimer.at)
    else nearDeadline(nextTimer.at)
  }

  while (queue.length > 0 || (timers.length > 0 && pending.length > 0)) step()
  return { covered, previousSends, sends }
}

const interactionTimes = fc
  .array(fc.integer({ max: 600_000, min: 0 }), { maxLength: 40, minLength: 1 })
  .map((times) => [...times].sort((left, right) => left - right))

describe("decideActivityCommunication (research D5, B5-W) [PREETS-SESSION-009]", () => {
  it.prop([
    interactionTimes,
    fc.integer({ max: 1_800_000, min: -60_000 }),
    fc.integer({ max: 30, min: 5 }),
    fc.array(fc.integer({ max: 700_000, min: 0 }), { maxLength: 10 })
  ], { numRuns: 500 })(
    "communicates every interaction within 60 s, at most once per window except near the deadline, despite stale timers",
    (interactions, initialDeadline, idleMinutes, staleFlushes) => {
      const { covered, sends } = simulate(interactions, initialDeadline, idleMinutes * WINDOW, staleFlushes)

      expect(covered.map(([at]) => at)).toEqual(interactions)
      for (const [at, sentAt] of covered) {
        expect(sentAt - at).toBeGreaterThanOrEqual(0)
        expect(sentAt - at).toBeLessThanOrEqual(WINDOW)
      }
      for (let index = 1; index < sends.length; index += 1) {
        const [previous] = sends[index - 1] ?? [Number.NEGATIVE_INFINITY]
        const [sentAt, knownDeadline] = sends[index] ?? [0, 0]
        expect(sentAt - previous >= WINDOW || knownDeadline - sentAt < WINDOW).toBe(true)
      }
    }
  )

  it.prop([interactionTimes, fc.integer({ max: 30, min: 5 })], { numRuns: 300 })(
    "sends the first interaction after 60 s of silence at once",
    (interactions, idleMinutes) => {
      const { covered, previousSends } = simulate(interactions, Number.POSITIVE_INFINITY, idleMinutes * WINDOW)

      covered.forEach(([at, sentAt], index) => {
        const previous = previousSends[index]
        if (previous === undefined || at - previous >= WINDOW) expect(sentAt).toBe(at)
      })
    }
  )
})

const snapshot = (revision: number, idleDeadlineEpochMilliseconds: number, observedAtEpochMilliseconds = 1_000) => ({
  coordinationTag: TAG,
  idleDeadlineEpochMilliseconds,
  observedAtEpochMilliseconds,
  revision,
  serverTimeEpochMilliseconds: observedAtEpochMilliseconds + 5,
  warningLeadMinutes: 2
})

describe("adoptSnapshot (research D6) [PREETS-SESSION-010]", () => {
  it("adopts a higher revision even when a policy refresh shortened the deadline", () => {
    expect(adoptSnapshot(snapshot(1, 1_800_000), snapshot(2, 300_000))).toBe(true)
  })

  it("rejects a lower revision that arrives late, whatever its deadline or timestamps", () => {
    const held = snapshot(3, 300_000, 2_000)
    expect(adoptSnapshot(held, { ...snapshot(2, 1_800_000, 9_000), serverTimeEpochMilliseconds: 9_999 })).toBe(false)
  })

  it("ignores an equal revision, even with a later observation time", () => {
    expect(adoptSnapshot(snapshot(3, 300_000, 2_000), snapshot(3, 1_800_000, 2_000))).toBe(false)
    expect(adoptSnapshot(snapshot(3, 300_000, 2_000), snapshot(3, 1_800_000, 2_001))).toBe(false)
  })

  it("never adopts another session's snapshot", () => {
    expect(adoptSnapshot(snapshot(1, 1), { ...snapshot(9, 1), coordinationTag: "other-session" })).toBe(false)
  })

  it("adopts the first snapshot", () => {
    expect(adoptSnapshot(undefined, snapshot(1, 1))).toBe(true)
  })
})

describe("calibrateClockOffset (research D6, R29) [PREETS-SESSION-010]", () => {
  const SERVER_AHEAD = 7_000
  const deadline = 2_000_000
  const sample = (sentAt: number, receivedAt: number, builtAt: number) => ({
    receivedAt,
    sentAt,
    serverTime: builtAt + SERVER_AHEAD
  })

  it("converts a response delayed by 20 s to the prompt local deadline, within half the round trip", () => {
    const prompt = calibrateClockOffset(undefined, sample(1_000, 1_100, 1_050))
    const delayed = calibrateClockOffset(undefined, sample(1_000, 21_100, 1_050))

    expect(Math.abs((deadline - delayed.offset) - (deadline - prompt.offset))).toBeLessThanOrEqual(
      delayed.roundTrip / 2
    )
    expect(deadline - prompt.offset).toBeCloseTo(deadline - SERVER_AHEAD, -2)
  })

  it("recalibrates from an equal-revision response with a smaller round trip", () => {
    const held = calibrateClockOffset(undefined, sample(1_000, 3_000, 2_900))
    const tighter = calibrateClockOffset(held, sample(5_000, 5_040, 5_020))

    expect(tighter).not.toBe(held)
    expect(tighter.offset).toBe(SERVER_AHEAD)
    expect(calibrateClockOffset(tighter, sample(9_000, 9_500, 9_250))).toBe(tighter)
  })

  it("replaces a stale estimate whose interval no longer overlaps, as after a local clock step", () => {
    const held = calibrateClockOffset(undefined, sample(1_000, 1_020, 1_010))
    const stepped = calibrateClockOffset(held, { receivedAt: 2_100, sentAt: 2_000, serverTime: 2_050 + 60_000 })

    expect(stepped.offset).toBe(60_000)
  })

  it("converts one broadcast server-clock deadline to the same instant in two tabs with skewed clocks", () => {
    const skew = 4_321
    const tabA = calibrateClockOffset(undefined, sample(1_000, 1_040, 1_020))
    const tabB = calibrateClockOffset(undefined, {
      receivedAt: 1_040 + skew,
      sentAt: 1_000 + skew,
      serverTime: 1_020 + SERVER_AHEAD
    })

    expect((deadline - tabB.offset) - (deadline - tabA.offset)).toBe(skew)
  })
})

/**
 * The no-storage fallback in one tab: own interactions decide against the in-memory record, other tabs' sends arrive
 * as delayed `communicated { at }`, and the window-end flush re-decides. Returns own send times.
 */
interface FallbackEvent {
  readonly at: number
  readonly kind: "flush" | "interaction" | "received"
  readonly sentAt?: number | undefined
}

const runFallback = (interactions: readonly number[], received: readonly (readonly [number, number])[]) => {
  const events: FallbackEvent[] = [
    ...interactions.map((at): FallbackEvent => ({ at, kind: "interaction" })),
    ...received.map(([sentAt, delay]): FallbackEvent => ({ at: sentAt + delay, kind: "received", sentAt }))
  ]
  let record: ActivityWindowRecord = {
    lastCommunicatedAt: undefined,
    pendingLatest: undefined,
    pendingSince: undefined
  }
  const sends: number[] = []
  const handlers: Record<FallbackEvent["kind"], (event: FallbackEvent) => void> = {
    flush: ({ at }) => {
      const decision = flushActivityCommunication(record, { now: at })
      if (decision._tag === "Reschedule") events.push({ at: decision.sendAt, kind: "flush" })
      if (decision._tag !== "Send") return
      record = decision.record
      sends.push(at)
    },
    interaction: ({ at }) => {
      const decision = decideActivityCommunication(record, { deadline: Number.POSITIVE_INFINITY, now: at })
      record = decision.record
      if (decision._tag === "SendNow") sends.push(at)
      else events.push({ at: decision.sendAt, kind: "flush" })
    },
    received: ({ sentAt }) => {
      record = applyCommunication(record, sentAt ?? 0)
    }
  }
  while (events.length > 0) {
    events.sort((left, right) => left.at - right.at)
    const next = events.shift()
    if (next !== undefined) handlers[next.kind](next)
  }
  return sends
}

describe("applyCommunication (research D5, R32, R36) [PREETS-SESSION-009]", () => {
  it.prop([
    interactionTimes,
    fc.array(fc.tuple(fc.integer({ max: 600_000, min: 0 }), fc.integer({ max: 5_000, min: 0 })), { maxLength: 10 })
  ], { numRuns: 500 })(
    "covers every interaction by a send within 60 s and never sends without uncovered activity",
    (interactions, received) => {
      const sends = runFallback(interactions, received)
      const communications = [...sends, ...received.map(([sentAt]) => sentAt)]

      for (const at of interactions) {
        expect(communications.some((sentAt) => sentAt >= at && sentAt - at <= WINDOW)).toBe(true)
      }
      // A send is justified by an interaction no communication this tab knew of by then had covered. An interaction in
      // the same millisecond as one of this tab's sends follows it, so that send does not cover it.
      for (const sentAt of sends) {
        const ownEarlier = sends.filter((other) => other < sentAt)
        const receivedEarlier = received.filter(([at, delay]) => at + delay < sentAt).map(([at]) => at)
        const uncovered = interactions.some((at) =>
          at <= sentAt && ownEarlier.every((other) => other <= at) && receivedEarlier.every((other) => other < at)
        )
        expect(uncovered).toBe(true)
      }
    }
  )

  it("keeps later pending activity when a communication covers only earlier activity", () => {
    const pending = { lastCommunicatedAt: 0, pendingLatest: 20, pendingSince: 5 }
    expect(applyCommunication(pending, 10)).toStrictEqual({
      lastCommunicatedAt: 10,
      pendingLatest: 20,
      pendingSince: 10
    })
    expect(applyCommunication(pending, 20)).toStrictEqual({
      lastCommunicatedAt: 20,
      pendingLatest: undefined,
      pendingSince: undefined
    })
  })
})

describe("openTabChannel (research D8) [PREETS-SESSION-010]", () => {
  it("accepts a well-formed message that carries the telemetry-only telemetryId field, without that field", async () => {
    let channel: ReturnType<typeof openTabChannel> | undefined
    const received = new Promise<TabMessage>((resolve) => {
      channel = openTabChannel(resolve)
    })
    // Another tab of the same origin, posting on the coordination channel name.
    const otherTab = new BroadcastChannel("preets-session-coordination")
    otherTab.postMessage({
      attemptId: "attempt-1",
      coordinationTag: "tag-a",
      notAfter: 1_000,
      telemetryId: "0b5d3c1e-8f4a-4c2b-9d6e-1a2b3c4d5e6f",
      type: "logout-started"
    })
    await expect(received).resolves.toStrictEqual({
      attemptId: "attempt-1",
      coordinationTag: "tag-a",
      notAfter: 1_000,
      type: "logout-started"
    })
    otherTab.close()
    channel?.close()
  })
})

describe("readActionDenial (#157 research D3) [PREETS-SESSION-007]", () => {
  it.each(
    [
      ["expired", new Error(ACTION_DENIAL_BODY.expired)],
      ["unknown", new Error(ACTION_DENIAL_BODY.unknown)]
    ] as const
  )("reads the gate's %s token from a rejection", (cause, error) => {
    expect(readActionDenial(error)).toBe(cause)
  })

  it.each([
    ["a generic rejection", new Error("An unexpected response was received from the server.")],
    ["a token with surrounding text", new Error(` ${ACTION_DENIAL_BODY.expired}`)],
    ["a token in another case", new Error(ACTION_DENIAL_BODY.expired.toUpperCase())],
    ["the bare token string", ACTION_DENIAL_BODY.expired],
    ["an object with the token as message", { message: ACTION_DENIAL_BODY.expired }],
    ["nothing", undefined]
  ])("accepts no cause from %s", (_label, error) => {
    expect(readActionDenial(error)).toBeUndefined()
  })
})

describe("knownExpiration (#157 research D7) [PREETS-SESSION-007]", () => {
  it.each([
    ["the deadline passed on the tab's estimate", { serverTimes: [1_000, undefined] }, true],
    ["the deadline passed on the status response's date", { serverTimes: [500, 1_000] }, true],
    ["the estimate reached the deadline exactly", { serverTimes: [1_000] }, true],
    ["the deadline has not passed on any estimate", { serverTimes: [999, 999] }, false],
    ["no server time is known", { serverTimes: [undefined] }, false]
  ])("is %s → %s", (_label, row, expected) => {
    expect(knownExpiration({ deadline: 1_000, logoutObserved: false, ...row })).toBe(expected)
  })

  it("is never known after an observed logout, or without a held deadline", () => {
    expect(knownExpiration({ deadline: 1_000, logoutObserved: true, serverTimes: [5_000] })).toBe(false)
    expect(knownExpiration({ deadline: undefined, logoutObserved: false, serverTimes: [5_000] })).toBe(false)
  })
})

/** A `Storage` over a map: the node environment has no `localStorage`. */
const memoryStorage = () => {
  const items = new Map<string, string>()
  const storage = {
    clear: () => {
      items.clear()
    },
    getItem: (key: string) => items.get(key) ?? null,
    key: (index: number) => [...items.keys()][index] ?? null,
    get length() {
      return items.size
    },
    removeItem: (key: string) => {
      items.delete(key)
    },
    setItem: (key: string, value: string) => {
      items.set(key, value)
    }
  }
  // `Object.keys(localStorage)` lists stored keys, as in a browser.
  return new Proxy(storage, {
    getOwnPropertyDescriptor: (_target, key) =>
      typeof key === "string" && items.has(key) ?
        { configurable: true, enumerable: true, value: items.get(key) } :
        undefined,
    ownKeys: () => [...items.keys()]
  })
}

describe("TabCoordination.deny (#157 research D6, D7) [PREETS-SESSION-007]", () => {
  const NOW = Date.UTC(2026, 10, 13, 12, 0, 0)
  const DEADLINE = NOW + 60_000
  const tag = "tag-denied"
  const snapshot: SessionCoordinationSnapshot = {
    coordinationTag: tag,
    idleDeadlineEpochMilliseconds: DEADLINE,
    observedAtEpochMilliseconds: NOW,
    revision: 1,
    serverTimeEpochMilliseconds: NOW,
    warningLeadMinutes: 2
  }
  let storage: ReturnType<typeof memoryStorage>
  let states: TabViewState[]
  let messages: unknown[]
  let observer: BroadcastChannel
  let stop: () => void

  /** The status endpoint answers 401 with `date`, or 200 with a usable snapshot. */
  const statusAnswers = (answer: "usable" | { readonly date: string }) => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        answer === "usable" ?
          Response.json({ ...snapshot, revision: 2 }) :
          new Response(null, { headers: { date: answer.date }, status: 401 })
      )
    )
    vi.stubGlobal("fetch", fetch)
    return fetch
  }

  const start = () => {
    const coordination = new TabCoordination(snapshot, (state) => states.push(state), () => null)
    stop = coordination.start()
    observer = new BroadcastChannel("preets-session-coordination")
    observer.onmessage = (event: MessageEvent) => messages.push(event.data)
    return coordination
  }

  /** Lets queued channel deliveries arrive before asserting none came. */
  const deliveries = () => new Promise((resolve) => setImmediate(resolve))

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    vi.setSystemTime(NOW)
    storage = memoryStorage()
    states = []
    messages = []
    vi.stubGlobal("localStorage", storage)
    vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }))
    vi.stubGlobal("window", new EventTarget())
    // No navigation entry exists here; any constructor lets the coordinator's `instanceof` check answer false.
    vi.stubGlobal("PerformanceNavigationTiming", Object)
  })

  afterEach(() => {
    stop()
    observer.close()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("enters expired recovery when the status date shows the held deadline passed, though the tab's clock lags", async () => {
    statusAnswers({ date: new Date(DEADLINE + 5_000).toUTCString() })
    const coordination = start()

    await expect(coordination.deny(undefined)).resolves.toBe(true)

    expect(states.at(-1)).toStrictEqual({ concealed: true, endedHere: false, recovery: "expired", view: "recovery" })
  })

  it("enters expired recovery when the tab's own estimate passed the deadline while its timers were suspended", async () => {
    statusAnswers({ date: "not a date" })
    const coordination = start()
    vi.setSystemTime(DEADLINE + 1_000)

    await expect(coordination.deny("unknown")).resolves.toBe(true)

    expect(states.at(-1)?.recovery).toBe("expired")
  })

  it("enters unknown recovery when the record ended before the deadline, without a record or a message", async () => {
    statusAnswers({ date: new Date(NOW + 10_000).toUTCString() })
    const coordination = start()
    const stored = Object.keys(storage)

    await expect(coordination.deny(undefined)).resolves.toBe(true)
    await deliveries()

    expect(states.at(-1)).toStrictEqual({ concealed: true, endedHere: false, recovery: "unknown", view: "recovery" })
    expect(Object.keys(storage)).toStrictEqual(stored)
    expect(messages).toStrictEqual([])
  })

  it("trusts the gate's expired token without reading the status", async () => {
    const fetch = statusAnswers("usable")
    const coordination = start()

    await expect(coordination.deny("expired")).resolves.toBe(true)

    expect(fetch).not.toHaveBeenCalled()
    expect(states.at(-1)?.recovery).toBe("expired")
  })

  it("leaves the page when the session is still usable, so the form reports the action as not performed", async () => {
    statusAnswers("usable")
    const coordination = start()

    await expect(coordination.deny(undefined)).resolves.toBe(false)

    expect(states.at(-1)?.view).toBe("active")
  })

  it("stops coordinating after recovery: a later denial changes nothing", async () => {
    statusAnswers({ date: new Date(NOW).toUTCString() })
    const coordination = start()
    await coordination.deny(undefined)
    const recorded = states.length

    await expect(coordination.deny("expired")).resolves.toBe(false)

    expect(states).toHaveLength(recorded)
  })
})
