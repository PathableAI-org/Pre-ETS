import type { InPageSessionActivity, SessionCoordinationSnapshot } from "@pathableai/pre-ets-frontend-services"

import { classifySessionActivity } from "./activity-classification.ts"
import {
  ACTIVITY_WINDOW_MILLISECONDS,
  decideActivityCommunication,
  flushActivityCommunication
} from "./activity-window.ts"
import { readSessionStatus, sendActivity, sendLogout, type SessionOutcome } from "./session-endpoints.ts"
import { adoptSnapshot } from "./snapshot-order.ts"
import {
  CURRENT_KEY,
  ENDED_KEY,
  openTabChannel,
  readCurrentHint,
  readEndedTags,
  readWindowRecord,
  recordEnded,
  type TabChannel,
  type TabMessage,
  windowLock,
  writeCurrentHint,
  writeWindowRecord
} from "./tab-channel.ts"

/** Tab states from data-model "Tab coordination states"; `Confirming` keeps the `active` view. */
export type TabView = "active" | "concealed" | "ended" | "logging-out" | "logout-failed"

export interface TabViewState {
  /** The session ended by this tab's own logout, so this tab moves focus to the notice. */
  readonly endedHere: boolean
  readonly view: TabView
}

type TimerName = "confirm" | "flush" | "logout-watch" | "near-deadline" | "retry"

const CONFIRMATION_RETRY_MILLISECONDS = 5_000
const LOGOUT_WATCH_INTERVAL_MILLISECONDS = 1_000
const LOGOUT_WATCH_LIMIT_MILLISECONDS = 10_000
const ACTIVITY_EVENTS = ["beforeinput", "click", "focusin", "keydown", "pointerdown"] as const
const GESTURE_EVENTS = ["keydown", "pointerdown"] as const

type Listener = readonly [EventTarget, string, (event: Event) => void, boolean]

const listenAll = (listeners: readonly Listener[]) => {
  for (const [target, type, handler, capture] of listeners) target.addEventListener(type, handler, { capture })
  return () => {
    for (const [target, type, handler, capture] of listeners) target.removeEventListener(type, handler, { capture })
  }
}

/**
 * One tab's participation in its session: B5-W activity communication, cross-tab synchronization ordered by store
 * observation, confirmation before acting on the local deadline, replay of missed logouts, the Server Action submit
 * guard, resume handling, and logout. The server decides validity; this never claims a session is usable on its own,
 * never ends a tab on a hint alone, and fails closed when the server cannot confirm.
 */
export class TabCoordination {
  #channel: TabChannel | undefined
  readonly #content: () => HTMLElement | null
  #deadline = Number.NEGATIVE_INFINITY
  #gesture = false
  #held: SessionCoordinationSnapshot | undefined
  readonly #initial: SessionCoordinationSnapshot
  readonly #notify: (state: TabViewState) => void
  #pendingActivity: InPageSessionActivity | undefined
  /** What each message for this tab's own session does (data-model "Channel messages"). */
  readonly #receivers: Readonly<Record<TabMessage["type"], (message: TabMessage) => void>> = {
    "logged-out": () => {
      this.#end(false)
    },
    "logout-failed": () => {
      this.#stopTimer("logout-watch")
    },
    "logout-started": () => {
      this.#watchLogout(Date.now() + LOGOUT_WATCH_LIMIT_MILLISECONDS)
    },
    pending: (message) => {
      if (message.type !== "pending") return
      this.#pendingActivity ??= message.activity
      this.#scheduleFlush(message.sendAt)
    },
    renewed: (message) => {
      if (message.type !== "renewed") return
      this.#adoptSnapshot({
        coordinationTag: message.coordinationTag,
        idleDeadlineEpochMilliseconds: message.localDeadline,
        observedAtEpochMilliseconds: message.observedAtEpochMilliseconds,
        serverTimeEpochMilliseconds: Date.now(),
        warningLeadMinutes: message.warningLeadMinutes
      }, false)
    },
    "session-current": () => undefined
  }
  readonly #tag: string
  readonly #timers = new Map<TimerName, ReturnType<typeof setTimeout>>()

  #view: TabView = "active"

  constructor(
    snapshot: SessionCoordinationSnapshot,
    notify: (state: TabViewState) => void,
    content: () => HTMLElement | null
  ) {
    this.#initial = snapshot
    this.#tag = snapshot.coordinationTag
    this.#notify = notify
    this.#content = content
  }

  /** Reads the session without renewing it and acts on the answer. Never throws. */
  async confirm(): Promise<void> {
    if (this.#view === "ended") return
    this.#applyStatus(await readSessionStatus())
  }

  /** Logout is sent at once with `keepalive` and never enters the activity window (FR-009, research D8). */
  async logout(): Promise<void> {
    if (this.#view === "ended" || this.#view === "logging-out") return
    this.#setView("logging-out")
    this.#post("logout-started")
    const outcome = await sendLogout(this.#tag)
    if (outcome === "failed") {
      this.#post("logout-failed")
      this.#setView("logout-failed")
      return
    }
    recordEnded(this.#tag)
    this.#post("logged-out")
    this.#end(true)
  }

  /** Communicates classified activity from `element`'s subtree; gestures are tracked at document capture (R7). */
  observe(element: HTMLElement): () => void {
    const classify = (event: Event) => {
      const activity = classifySessionActivity(event, { gestureInCurrentTask: this.#gesture })
      if (activity !== undefined) this.#activity(activity)
    }
    return listenAll(ACTIVITY_EVENTS.map((type) => [element, type, classify, true]))
  }

  /** Subscribes first, replays missed logouts and session changes, and only then trusts the snapshot (research D14). */
  start(): () => void {
    this.#channel = openTabChannel((message) => {
      this.#receive(message)
    })
    const stopListening = this.#listen()
    if (!this.#replayRecords()) this.#adoptSnapshot(this.#initial, true)
    return () => {
      stopListening()
      this.#channel?.close()
      this.#clearTimers()
    }
  }

  #activity(activity: InPageSessionActivity) {
    if (this.#view !== "active") return
    const lock = windowLock()
    if (lock === undefined) {
      this.#send(activity)
      return
    }
    this.#guard(lock(() => {
      this.#decide(activity)
    }))
  }

  /** Adopts a snapshot of this tab's session when its store observation is later than the held one (research D6). */
  #adoptSnapshot(snapshot: SessionCoordinationSnapshot, broadcast: boolean) {
    if (snapshot.coordinationTag !== this.#tag) {
      this.#endConfirmed()
      return
    }
    if (!adoptSnapshot(this.#held, snapshot)) return
    this.#held = snapshot
    this.#deadline = Date.now() + snapshot.idleDeadlineEpochMilliseconds - snapshot.serverTimeEpochMilliseconds
    this.#schedule("confirm", this.#deadline, () => {
      this.#guard(this.confirm())
    })
    this.#schedule("near-deadline", this.#deadline - ACTIVITY_WINDOW_MILLISECONDS + 1, () => {
      this.#flushNearDeadline()
    })
    if (broadcast) {
      this.#channel?.post({
        coordinationTag: this.#tag,
        localDeadline: this.#deadline,
        observedAtEpochMilliseconds: snapshot.observedAtEpochMilliseconds,
        type: "renewed",
        warningLeadMinutes: snapshot.warningLeadMinutes
      })
    }
  }

  #applyStatus(outcome: SessionOutcome) {
    switch (outcome._tag) {
      case "Ended":
        this.#endConfirmed()
        return
      case "Undetermined":
        this.#conceal()
        this.#schedule("retry", Date.now() + CONFIRMATION_RETRY_MILLISECONDS, () => {
          this.#guard(this.confirm())
        })
        return
      case "Usable":
        this.#adoptSnapshot(outcome.snapshot, true)
        if (this.#view === "concealed" && outcome.snapshot.coordinationTag === this.#tag) this.#setView("active")
    }
  }

  #clearTimers() {
    for (const timer of this.#timers.values()) clearTimeout(timer)
    this.#timers.clear()
  }

  /** Temporary concealment; never the ended state, and never over a logout in progress or failed. */
  #conceal() {
    if (this.#view === "active") this.#setView("concealed")
  }

  /** Holds a submission whose hint names another session, confirms, and replays it if this session is current (R15). */
  async #confirmThenReplay(form: HTMLFormElement, submitter: HTMLElement | null) {
    const outcome = await readSessionStatus()
    this.#applyStatus(outcome)
    if (outcome._tag !== "Usable" || outcome.snapshot.coordinationTag !== this.#tag) return
    writeCurrentHint(this.#tag)
    form.requestSubmit(submitter)
  }

  #decide(activity: InPageSessionActivity) {
    const decision = decideActivityCommunication(readWindowRecord(), {
      coordinationTag: this.#tag,
      deadline: this.#deadline,
      now: Date.now()
    })
    writeWindowRecord(decision.record)
    if (decision._tag === "SendNow") {
      this.#pendingActivity = undefined
      this.#send(activity)
      return
    }
    this.#pendingActivity ??= activity
    this.#channel?.post({ activity, coordinationTag: this.#tag, sendAt: decision.sendAt, type: "pending" })
    this.#scheduleFlush(decision.sendAt)
  }

  #end(endedHere: boolean) {
    if (this.#view === "ended") return
    this.#clearTimers()
    this.#pendingActivity = undefined
    this.#view = "ended"
    this.#notify({ endedHere, view: "ended" })
  }

  /** The server answered 401 or a different session: record it so tabs that missed it can replay it. */
  #endConfirmed() {
    recordEnded(this.#tag)
    this.#end(false)
  }

  /** Window end: one tab sends the coalesced activity if it is still pending and its window is due (R8). */
  #flush() {
    const lock = windowLock()
    const activity = this.#pendingActivity
    if (lock === undefined || activity === undefined || this.#view === "ended") return
    this.#guard(lock(() => {
      const decision = flushActivityCommunication(readWindowRecord(), { coordinationTag: this.#tag, now: Date.now() })
      if (decision._tag === "Reschedule") this.#scheduleFlush(decision.sendAt)
      if (decision._tag !== "Send") return
      writeWindowRecord(decision.record)
      this.#pendingActivity = undefined
      this.#send(activity)
    }))
  }

  /** Near the deadline, pending activity is sent at once (B5-W). */
  #flushNearDeadline() {
    const lock = windowLock()
    const activity = this.#pendingActivity
    if (lock === undefined || activity === undefined) return
    this.#guard(lock(() => {
      if (readWindowRecord()?.pendingSince === undefined) return
      this.#decide(activity)
    }))
  }

  /** An unexpected failure leaves the tab concealed rather than presenting a usable session. */
  #guard(work: Promise<void>) {
    work.catch(() => {
      this.#conceal()
    })
  }

  #listen() {
    const resume = () => {
      this.#resume()
    }
    const gesture = (event: Event) => {
      if (!event.isTrusted) return
      this.#gesture = true
      setTimeout(() => {
        this.#gesture = false
      }, 0)
    }
    return listenAll([
      [document, "visibilitychange", resume, false],
      [document, "resume", resume, false],
      [document, "submit", (event) => {
        this.#submit(event as SubmitEvent)
      }, true],
      [window, "pagehide", (event) => {
        this.#pageHide(event as PageTransitionEvent)
      }, false],
      [window, "storage", (event) => {
        this.#storage(event as StorageEvent)
      }, false],
      ...GESTURE_EVENTS.map((type): Listener => [document, type, gesture, true])
    ])
  }

  /** Conceals before the page enters the back/forward cache; `RestoredPageGuard` reloads it on restore. */
  #pageHide(event: PageTransitionEvent) {
    if (!event.persisted || this.#view === "ended") return
    const content = this.#content()
    if (content !== null) {
      content.hidden = true
      content.inert = true
    }
    this.#conceal()
  }

  #post(type: "logged-out" | "logout-failed" | "logout-started") {
    this.#channel?.post({ coordinationTag: this.#tag, type })
  }

  #receive(message: TabMessage) {
    if (message.coordinationTag === this.#tag) {
      this.#receivers[message.type](message)
      return
    }
    // Another session's document mounted: confirm, never end on the hint alone (R14).
    if (message.type === "session-current") this.#guard(this.confirm())
  }

  /**
   * Applies the shared records synchronously: a confirmed-ended tag ends the tab; a hint naming another session
   * conceals temporarily and confirms. Answers whether the tab ended.
   */
  #replayRecords(): boolean {
    if (readEndedTags().includes(this.#tag)) {
      this.#end(false)
      return true
    }
    const hint = readCurrentHint()
    if (hint !== undefined && hint !== this.#tag) {
      this.#conceal()
      this.#guard(this.confirm())
    }
    return false
  }

  /** B5-R: replay records first; past the local deadline conceal at once; either way confirm (research D9). */
  #resume() {
    if (this.#view === "ended" || document.visibilityState !== "visible") return
    if (this.#replayRecords()) return
    if (Date.now() >= this.#deadline) this.#conceal()
    this.#guard(this.confirm())
  }

  #schedule(name: TimerName, at: number, task: () => void) {
    this.#stopTimer(name)
    this.#timers.set(name, setTimeout(task, Math.max(0, at - Date.now())))
  }

  #scheduleFlush(at: number) {
    this.#schedule("flush", at, () => {
      this.#flush()
    })
  }

  #send(activity: InPageSessionActivity) {
    this.#guard(
      sendActivity(activity, this.#tag).then((outcome) => {
        if (outcome._tag === "Usable") this.#adoptSnapshot(outcome.snapshot, true)
        if (outcome._tag === "Ended") this.#endConfirmed()
      })
    )
  }

  #setView(view: Exclude<TabView, "ended">) {
    if (this.#view === "ended") return
    this.#view = view
    this.#notify({ endedHere: false, view })
  }

  #stopTimer(name: TimerName) {
    const existing = this.#timers.get(name)
    if (existing !== undefined) clearTimeout(existing)
    this.#timers.delete(name)
  }

  #storage(event: StorageEvent) {
    if (event.key === ENDED_KEY && readEndedTags().includes(this.#tag)) this.#end(false)
    if (event.key === CURRENT_KEY && readCurrentHint() !== this.#tag) this.#guard(this.confirm())
  }

  /** Server Action submit guard (research D2, R2, R15): a hint naming another session holds the submission. */
  #submit(event: SubmitEvent) {
    const form = event.target
    const content = this.#content()
    if (!(form instanceof HTMLFormElement) || !content?.contains(form)) return
    if ((readCurrentHint() ?? this.#tag) === this.#tag) return
    event.preventDefault()
    this.#guard(this.#confirmThenReplay(form, event.submitter))
  }

  /** After another tab starts logout, confirm each second until the outcome arrives, at most 10 s (R11). */
  #watchLogout(until: number) {
    if (this.#view === "ended" || Date.now() >= until) return
    this.#schedule("logout-watch", Date.now() + LOGOUT_WATCH_INTERVAL_MILLISECONDS, () => {
      this.#guard(
        this.confirm().then(() => {
          this.#watchLogout(until)
        })
      )
    })
  }
}
