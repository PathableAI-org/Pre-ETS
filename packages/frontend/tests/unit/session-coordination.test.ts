import { fc, it } from "@fast-check/vitest"
import { describe, expect } from "vitest"

import { classifySessionActivity } from "../../src/features/session-coordination/activity-classification.ts"
import {
  type ActivityWindowRecord,
  decideActivityCommunication,
  flushActivityCommunication
} from "../../src/features/session-coordination/activity-window.ts"
import { adoptSnapshot } from "../../src/features/session-coordination/snapshot-order.ts"

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
    const decision = decideActivityCommunication(record, { coordinationTag: TAG, deadline, now })
    record = decision.record
    if (decision._tag === "SendNow") send(now)
    else timers.push({ at: decision.sendAt, kind: "flush" }, { at: deadline - WINDOW + 1, kind: "near-deadline" })
  }
  const flush = (now: number) => {
    const decision = flushActivityCommunication(record, { coordinationTag: TAG, now })
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

  it.prop([
    fc.string(),
    fc.option(fc.integer(), { nil: undefined }),
    fc.option(fc.integer(), { nil: undefined }),
    fc.integer({ max: 10_000_000, min: 0 }),
    fc.integer({ max: 10_000_000, min: 0 })
  ])(
    "decides with another session's record as if there were none",
    (foreignTag, lastCommunicatedAt, pendingSince, now, deadlineOffset) => {
      fc.pre(foreignTag !== TAG)
      const input = { coordinationTag: TAG, deadline: now + deadlineOffset, now }

      expect(decideActivityCommunication({ coordinationTag: foreignTag, lastCommunicatedAt, pendingSince }, input))
        .toStrictEqual(decideActivityCommunication(undefined, input))
    }
  )
})

const snapshot = (observedAtEpochMilliseconds: number, idleDeadlineEpochMilliseconds: number) => ({
  coordinationTag: TAG,
  idleDeadlineEpochMilliseconds,
  observedAtEpochMilliseconds,
  serverTimeEpochMilliseconds: observedAtEpochMilliseconds + 5,
  warningLeadMinutes: 2
})

describe("adoptSnapshot (research D6) [PREETS-SESSION-010]", () => {
  it("adopts a later observation even when a policy refresh shortened the deadline", () => {
    expect(adoptSnapshot(snapshot(1_000, 1_800_000), snapshot(2_000, 300_000))).toBe(true)
  })

  it("rejects an earlier observation that arrives late, whatever its deadline or server time", () => {
    const held = snapshot(2_000.5, 300_000)
    expect(adoptSnapshot(held, { ...snapshot(2_000.25, 1_800_000), serverTimeEpochMilliseconds: 9_999 })).toBe(false)
    expect(adoptSnapshot(held, snapshot(2_000.5, 1_800_000))).toBe(false)
  })

  it("adopts the first snapshot", () => {
    expect(adoptSnapshot(undefined, snapshot(1, 1))).toBe(true)
  })
})
