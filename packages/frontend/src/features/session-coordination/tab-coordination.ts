import type { InPageSessionActivity, SessionCoordinationSnapshot } from "@pathableai/pre-ets-frontend-services"

import { classifySessionActivity } from "./activity-classification.ts"
import { ACTIVITY_WINDOW_MILLISECONDS, decideActivityCommunication } from "./activity-window.ts"
import { readSessionStatus, sendActivity, sendLogout, type SessionOutcome } from "./session-endpoints.ts"
import {
  openTabChannel,
  readWindowRecord,
  type TabChannel,
  type TabMessage,
  windowLock,
  writeWindowRecord
} from "./tab-channel.ts"

/** Tab states from data-model "Tab coordination states"; `Confirming` keeps the `active` view. */
export type TabView = "active" | "concealed" | "ended" | "logging-out" | "logout-failed"

export interface TabViewState {
  /** The session ended by this tab's own logout, so this tab moves focus to the notice. */
  readonly endedHere: boolean
  readonly view: TabView
}

type TimerName = "confirm" | "flush" | "near-deadline" | "retry"

const CONFIRMATION_RETRY_MILLISECONDS = 5_000
const ACTIVITY_EVENTS = ["beforeinput", "click", "focusin", "keydown", "pointerdown"] as const
const GESTURE_EVENTS = ["keydown", "pointerdown"] as const

/**
 * One tab's participation in its session: B5-W activity communication, cross-tab synchronization, confirmation before
 * acting on the local deadline, resume handling, and logout. The server decides validity; this never claims a session
 * is usable on its own and fails closed when the server cannot confirm.
 */
export class TabCoordination {
  #channel: TabChannel | undefined
  readonly #content: () => HTMLElement | null
  #deadline = Number.NEGATIVE_INFINITY
  #gesture = false
  readonly #initial: SessionCoordinationSnapshot
  readonly #notify: (state: TabViewState) => void
  #pendingActivity: InPageSessionActivity | undefined
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

  /** Logout is sent at once and never enters the activity window (FR-009). */
  async logout(): Promise<void> {
    if (this.#view === "ended" || this.#view === "logging-out") return
    this.#setView("logging-out")
    const outcome = await sendLogout(this.#tag)
    if (outcome === "failed") {
      this.#setView("logout-failed")
      return
    }
    this.#channel?.post({ coordinationTag: this.#tag, type: "logged-out" })
    this.#end(true)
  }

  /** Communicates classified activity from `element`'s subtree. */
  observe(element: HTMLElement): () => void {
    const classify = (event: Event) => {
      const activity = classifySessionActivity(event, { gestureInCurrentTask: this.#gesture })
      if (activity !== undefined) this.#activity(activity)
    }
    for (const type of ACTIVITY_EVENTS) element.addEventListener(type, classify, { capture: true })
    return () => {
      for (const type of ACTIVITY_EVENTS) element.removeEventListener(type, classify, { capture: true })
    }
  }

  start(): () => void {
    this.#channel = openTabChannel((message) => {
      this.#receive(message)
    })
    this.#adoptSnapshot(this.#initial)
    const stopLifecycle = this.#listenToLifecycle()
    return () => {
      stopLifecycle()
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

  #adoptDeadline(localDeadline: number) {
    if (localDeadline <= this.#deadline) return
    this.#deadline = localDeadline
    this.#schedule("confirm", localDeadline, () => {
      this.#guard(this.confirm())
    })
    this.#schedule("near-deadline", localDeadline - ACTIVITY_WINDOW_MILLISECONDS + 1, () => {
      if (this.#pendingActivity !== undefined) this.#flush()
    })
  }

  /** Converts the server deadline to this tab's clock, adopts it if later, and shares it (research D6). */
  #adoptSnapshot(snapshot: SessionCoordinationSnapshot) {
    if (snapshot.coordinationTag !== this.#tag) {
      this.#end(false)
      return
    }
    const localDeadline = Date.now() + snapshot.idleDeadlineEpochMilliseconds - snapshot.serverTimeEpochMilliseconds
    this.#adoptDeadline(localDeadline)
    this.#channel?.post({
      coordinationTag: this.#tag,
      localDeadline,
      type: "renewed",
      warningLeadMinutes: snapshot.warningLeadMinutes
    })
  }

  #applyStatus(outcome: SessionOutcome) {
    switch (outcome._tag) {
      case "Ended":
        this.#end(false)
        return
      case "Undetermined":
        this.#conceal()
        this.#schedule("retry", Date.now() + CONFIRMATION_RETRY_MILLISECONDS, () => {
          this.#guard(this.confirm())
        })
        return
      case "Usable":
        this.#adoptSnapshot(outcome.snapshot)
        if (this.#view === "concealed") this.#setView("active")
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

  /** Window end or near deadline: one tab sends the coalesced activity if it is still pending. */
  #flush() {
    const lock = windowLock()
    const activity = this.#pendingActivity
    if (lock === undefined || activity === undefined || this.#view === "ended") return
    this.#guard(lock(() => {
      this.#flushPending(activity)
    }))
  }

  #flushPending(activity: InPageSessionActivity) {
    const record = readWindowRecord()
    if (record?.coordinationTag !== this.#tag || record.pendingSince === undefined) {
      this.#pendingActivity = undefined
      return
    }
    const decision = decideActivityCommunication(record, {
      coordinationTag: this.#tag,
      deadline: this.#deadline,
      now: Date.now()
    })
    if (decision._tag === "Coalesce") {
      this.#scheduleFlush(decision.sendAt)
      return
    }
    writeWindowRecord(decision.record)
    this.#pendingActivity = undefined
    this.#send(activity)
  }

  /** An unexpected failure leaves the tab concealed rather than presenting a usable session. */
  #guard(work: Promise<void>) {
    work.catch(() => {
      this.#conceal()
    })
  }

  #listenToLifecycle() {
    const resume = () => {
      this.#resume()
    }
    const pageHide = (event: PageTransitionEvent) => {
      this.#pageHide(event)
    }
    const gesture = (event: Event) => {
      if (!event.isTrusted) return
      this.#gesture = true
      setTimeout(() => {
        this.#gesture = false
      }, 0)
    }
    document.addEventListener("visibilitychange", resume)
    document.addEventListener("resume", resume)
    window.addEventListener("pagehide", pageHide)
    for (const type of GESTURE_EVENTS) window.addEventListener(type, gesture, { capture: true })
    return () => {
      document.removeEventListener("visibilitychange", resume)
      document.removeEventListener("resume", resume)
      window.removeEventListener("pagehide", pageHide)
      for (const type of GESTURE_EVENTS) window.removeEventListener(type, gesture, { capture: true })
    }
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

  #receive(message: TabMessage) {
    if (message.coordinationTag !== this.#tag) return
    switch (message.type) {
      case "logged-out":
        this.#end(false)
        return
      case "pending":
        this.#pendingActivity ??= message.activity
        this.#scheduleFlush(message.sendAt)
        return
      case "renewed":
        this.#adoptDeadline(message.localDeadline)
    }
  }

  /** B5-R: past the local deadline conceal at once; either way confirm with the server (research D9). */
  #resume() {
    if (this.#view === "ended" || document.visibilityState !== "visible") return
    if (Date.now() >= this.#deadline) this.#conceal()
    this.#guard(this.confirm())
  }

  #schedule(name: TimerName, at: number, task: () => void) {
    const existing = this.#timers.get(name)
    if (existing !== undefined) clearTimeout(existing)
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
        if (outcome._tag === "Usable") this.#adoptSnapshot(outcome.snapshot)
        if (outcome._tag === "Ended") this.#end(false)
      })
    )
  }

  #setView(view: Exclude<TabView, "ended">) {
    if (this.#view === "ended") return
    this.#view = view
    this.#notify({ endedHere: false, view })
  }
}
