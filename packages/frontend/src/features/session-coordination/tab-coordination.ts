import type { InPageSessionActivity, SessionCoordinationSnapshot } from "@pathableai/pre-ets-frontend-services"

import { classifySessionActivity } from "./activity-classification.ts"
import {
  ACTIVITY_WINDOW_MILLISECONDS,
  type ActivityWindowRecord,
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
  readLogoutInProgress,
  readWindowRecord,
  recordEnded,
  recordLogoutInProgress,
  storageAvailable,
  type TabChannel,
  type TabMessage,
  windowLock,
  writeCurrentHint,
  writeWindowRecord
} from "./tab-channel.ts"

/**
 * Tab states from data-model "Tab coordination states"; `Confirming` keeps its view. Concealment is orthogonal, so a
 * logout in progress keeps its busy state while an unconfirmed session hides the content.
 */
export type TabView = "active" | "ended" | "logging-out" | "logout-failed"

export interface TabViewState {
  /** Protected content is hidden and inert (temporary concealment, or a failed logout). */
  readonly concealed: boolean
  /** The held local deadline, exposed on the header as non-protected evidence (V-004). */
  readonly deadline?: number | undefined
  /** The session ended by this tab's own logout, so this tab moves focus to the notice. */
  readonly endedHere: boolean
  readonly view: TabView
  /** The held warning lead, exposed beside the deadline. */
  readonly warningLeadMinutes?: number | undefined
}

type TimerName = "confirm" | "flush" | "logout-watch" | "near-deadline" | "retry"

const CONFIRMATION_RETRY_MILLISECONDS = 5_000
/** Watch reads start on a fixed one-second cadence and each gives up after one second, keeping FR-015's 2-second bound. */
const LOGOUT_WATCH_INTERVAL_MILLISECONDS = 1_000
/** A logout attempt is refused by the server after `notAfter`, this far ahead on the server clock (R21). */
const LOGOUT_ATTEMPT_MILLISECONDS = 10_000
/** Watches outlast `notAfter` by this much, so no invalidation from the attempt can follow them (R21). */
const LOGOUT_WATCH_GRACE_MILLISECONDS = 2_000
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
  /** Aborts reads still in flight when the controller is torn down. */
  readonly #cancel = new AbortController()
  #channel: TabChannel | undefined
  #concealed = false
  /** When concealment began; a confirmation started later may reveal the content. */
  #concealedSince = Number.POSITIVE_INFINITY
  /** The held submission that was confirmed; its replay passes the guard once (R15, R19). */
  #confirmedReplay: undefined | { readonly form: HTMLFormElement; readonly submitter: HTMLElement | null }
  readonly #content: () => HTMLElement | null
  #deadline = Number.NEGATIVE_INFINITY
  #gesture = false
  #held: SessionCoordinationSnapshot | undefined
  /** The confirmed tag when storage could not hold it; used as this tab's hint (R19). */
  #hintOverride: string | undefined
  readonly #initial: SessionCoordinationSnapshot
  /** This tab's logout attempt's `notAfter` on the local clock; a usable answer after it means logout failed (R22). */
  #logoutNotAfter = Number.POSITIVE_INFINITY
  /** This tab's logout had no definitive answer; confirmation decides its outcome (R18). */
  #logoutUnresolved = false
  /** The window for this tab's tag when storage or locks are unavailable (R24). */
  #memoryWindow: ActivityWindowRecord | undefined
  readonly #notify: (state: TabViewState) => void
  #pendingActivity: InPageSessionActivity | undefined
  /** What each message for this tab's own session does (data-model "Channel messages"). */
  readonly #receivers: Readonly<Record<TabMessage["type"], (message: TabMessage) => void>> = {
    communicated: (message) => {
      if (message.type !== "communicated") return
      const last = Math.max(this.#memoryWindow?.lastCommunicatedAt ?? message.at, message.at)
      this.#memoryWindow = { lastCommunicatedAt: last, pendingSince: this.#memoryWindow?.pendingSince }
    },
    "logged-out": () => {
      this.#end(false)
    },
    // Sent only for a definitive 403 or 503, so logout did not happen (R18).
    "logout-failed": () => {
      this.#stopTimer("logout-watch")
    },
    "logout-started": (message) => {
      if (message.type !== "logout-started") return
      this.#watchLogout(message.notAfter - this.#serverOffset + LOGOUT_WATCH_GRACE_MILLISECONDS)
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
        revision: message.revision,
        serverTimeEpochMilliseconds: Date.now(),
        warningLeadMinutes: message.warningLeadMinutes
      }, false)
    },
    "session-current": () => undefined
  }
  /** Server clock minus this tab's clock, from the latest server snapshot (research D6). */
  #serverOffset = 0
  /** Whether the activity window is shared through storage under a Web Lock; otherwise it is kept in memory (R24). */
  #sharedWindow = false
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
  async confirm(timeout?: number): Promise<void> {
    if (this.#view === "ended") return
    const startedAt = Date.now()
    const outcome = await readSessionStatus(this.#cancel.signal, timeout)
    if (this.#live()) this.#applyStatus(outcome, startedAt)
  }

  /** Logout is sent at once with `keepalive` and never enters the activity window (FR-009, research D8). */
  async logout(): Promise<void> {
    if (this.#view === "ended" || this.#view === "logging-out") return
    this.#setView("logging-out")
    const notAfter = Date.now() + this.#serverOffset + LOGOUT_ATTEMPT_MILLISECONDS
    this.#logoutNotAfter = notAfter - this.#serverOffset
    const watchUntil = this.#logoutNotAfter + LOGOUT_WATCH_GRACE_MILLISECONDS
    recordLogoutInProgress(this.#tag, watchUntil)
    this.#channel?.post({ coordinationTag: this.#tag, notAfter, type: "logout-started" })
    const outcome = await sendLogout(this.#tag, notAfter)
    if (outcome === "refused") {
      this.#logoutRefused()
      this.#guard(this.confirm())
    } else if (outcome === "unknown") {
      // The server may have ended the session and lost or failed the reply: conceal; confirmation decides (R18, R22).
      this.#logoutUnresolved = true
      this.#conceal()
      this.#watchLogout(watchUntil)
      this.#guard(this.confirm())
    } else {
      this.#logoutEnded()
    }
  }

  /**
   * On mount: subscribes, replays the ended record, then adopts the server-rendered snapshot, writes the current-session
   * hint, and broadcasts the page-load renewal (research D14). Until this runs nothing conceals server-rendered
   * content (gap G1), and the renewal reaches other tabs only now (gap G2). Classified activity is observed within the
   * protected content; gestures are tracked at document capture (R7).
   */
  start(): () => void {
    this.#channel = openTabChannel((message) => {
      this.#receive(message)
    })
    this.#sharedWindow = windowLock() !== undefined && storageAvailable()
    const stopListening = this.#listen()
    this.#publish()
    if (!this.#replayEnded()) {
      this.#adoptSnapshot(this.#initial, true)
      if (!writeCurrentHint(this.#tag)) this.#hintOverride = this.#tag
      this.#channel.post({ coordinationTag: this.#tag, type: "session-current" })
      this.#replayLogoutInProgress()
    }
    return () => {
      stopListening()
      this.#cancel.abort()
      this.#channel?.close()
      this.#channel = undefined
      this.#clearTimers()
    }
  }

  /** A newer server-rendered snapshot of this session (a route refresh) counts as a confirmation of it. */
  update(snapshot: SessionCoordinationSnapshot): void {
    if (!this.#live() || this.#view === "ended") return
    this.#applyStatus({ _tag: "Usable", snapshot }, Number.NEGATIVE_INFINITY)
  }

  #activity(activity: InPageSessionActivity) {
    if (this.#view !== "active" || this.#concealed) return
    this.#withWindow(() => {
      this.#decide(activity)
    })
  }

  /**
   * Adopts a snapshot of this tab's session when its store observation is later than the held one (research D6).
   * Answers whether it was adopted.
   */
  #adoptSnapshot(snapshot: SessionCoordinationSnapshot, broadcast: boolean): boolean {
    if (snapshot.coordinationTag !== this.#tag) {
      this.#endConfirmed()
      return false
    }
    if (!adoptSnapshot(this.#held, snapshot)) return false
    this.#held = snapshot
    this.#deadline = Date.now() + snapshot.idleDeadlineEpochMilliseconds - snapshot.serverTimeEpochMilliseconds
    // Only a server snapshot carries the server clock; a relayed `renewed` message carries a local deadline.
    if (broadcast) this.#serverOffset = snapshot.serverTimeEpochMilliseconds - Date.now()
    this.#publish()
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
        revision: snapshot.revision,
        type: "renewed",
        warningLeadMinutes: snapshot.warningLeadMinutes
      })
    }
    return true
  }

  /**
   * Acts on a status answer for a read started at `startedAt`. A usable answer for this session reveals concealed
   * content when the read started after concealment began, or when its snapshot is newer than the held one, so a
   * renewal adopted from another tab meanwhile does not keep this tab hidden.
   */
  #applyStatus(outcome: SessionOutcome, startedAt: number) {
    switch (outcome._tag) {
      case "Ended":
        if (this.#logoutUnresolved) this.#logoutEnded()
        else this.#endConfirmed()
        return
      case "Undetermined":
        this.#conceal()
        this.#schedule("retry", Date.now() + CONFIRMATION_RETRY_MILLISECONDS, () => {
          this.#guard(this.confirm())
        })
        return
      case "Usable":
        // Before `notAfter` the attempt may still arrive, so a usable answer does not yet mean logout failed (R22).
        if (this.#logoutUnresolved && Date.now() > this.#logoutNotAfter) this.#logoutRefused()
        if (this.#adoptSnapshot(outcome.snapshot, true) || startedAt >= this.#concealedSince) this.#reveal()
    }
  }

  #clearTimers() {
    for (const timer of this.#timers.values()) clearTimeout(timer)
    this.#timers.clear()
  }

  /**
   * Temporary concealment, applied to the DOM at once so nothing stays visible or focusable until React commits.
   * It applies over a logout in progress too.
   */
  #conceal() {
    if (this.#view === "ended" || !this.#live()) return
    if (!this.#concealed) this.#concealedSince = Date.now()
    this.#concealed = true
    this.#publish()
  }

  /** Holds a submission whose hint names another session, confirms, and replays it if this session is current (R15). */
  async #confirmThenReplay(form: HTMLFormElement, submitter: HTMLElement | null) {
    const startedAt = Date.now()
    const outcome = await readSessionStatus(this.#cancel.signal)
    if (!this.#live()) return
    this.#applyStatus(outcome, startedAt)
    if (outcome._tag !== "Usable" || outcome.snapshot.coordinationTag !== this.#tag) return
    if (!writeCurrentHint(this.#tag)) this.#hintOverride = this.#tag
    this.#confirmedReplay = { form, submitter }
    form.requestSubmit(submitter)
  }

  #decide(activity: InPageSessionActivity) {
    if (!this.#live()) return
    const decision = decideActivityCommunication(this.#readWindow(), { deadline: this.#deadline, now: Date.now() })
    this.#writeWindow(decision.record)
    if (decision._tag === "SendNow") {
      this.#pendingActivity = undefined
      this.#send(activity)
      return
    }
    this.#pendingActivity ??= activity
    // In memory each tab flushes only its own pending activity (R24).
    if (this.#sharedWindow) {
      this.#channel?.post({ activity, coordinationTag: this.#tag, sendAt: decision.sendAt, type: "pending" })
    }
    this.#scheduleFlush(decision.sendAt)
  }

  #end(endedHere: boolean) {
    if (this.#view === "ended" || !this.#live()) return
    this.#clearTimers()
    this.#pendingActivity = undefined
    this.#view = "ended"
    this.#hideContent(true)
    this.#notify({ concealed: true, endedHere, view: "ended" })
  }

  /** The server answered 401 or a different session: record it so tabs that missed it can replay it. */
  #endConfirmed() {
    recordEnded(this.#tag)
    this.#end(false)
  }

  /** Window end: one tab sends the coalesced activity if it is still pending and its window is due (R8). */
  #flush() {
    const activity = this.#pendingActivity
    if (activity === undefined || this.#view === "ended") return
    this.#withWindow(() => {
      if (!this.#live()) return
      const decision = flushActivityCommunication(this.#readWindow(), { now: Date.now() })
      if (decision._tag === "Reschedule") this.#scheduleFlush(decision.sendAt)
      if (decision._tag !== "Send") return
      this.#writeWindow(decision.record)
      this.#pendingActivity = undefined
      this.#send(activity)
    })
  }

  /** Near the deadline, pending activity is sent at once (B5-W). */
  #flushNearDeadline() {
    const activity = this.#pendingActivity
    if (activity === undefined) return
    this.#withWindow(() => {
      if (!this.#live() || this.#readWindow()?.pendingSince === undefined) return
      this.#decide(activity)
    })
  }

  /** An unexpected failure leaves the tab concealed rather than presenting a usable session. */
  #guard(work: Promise<void>) {
    work.catch(() => {
      this.#conceal()
    })
  }

  /** Sets `hidden` and `inert` on the protected content at once, before React commits the same state. */
  #hideContent(hidden: boolean) {
    const content = this.#content()
    if (content === null) return
    content.hidden = hidden
    content.inert = hidden
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
    const content = this.#content()
    const classify = (event: Event) => {
      const activity = classifySessionActivity(event, { gestureInCurrentTask: this.#gesture })
      if (activity !== undefined) this.#activity(activity)
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
      ...ACTIVITY_EVENTS.flatMap((type): Listener[] => content === null ? [] : [[content, type, classify, true]]),
      ...GESTURE_EVENTS.map((type): Listener => [document, type, gesture, true])
    ])
  }

  /** False once torn down: late completions and queued lock work then change nothing. */
  #live() {
    return !this.#cancel.signal.aborted
  }

  /** Logout ended the session (204, 401, 409, or a confirmed end after an unknown outcome): every tab ends. */
  #logoutEnded() {
    this.#logoutUnresolved = false
    recordEnded(this.#tag)
    this.#post("logged-out")
    this.#end(true)
  }

  /** Logout did not complete (403, or confirmed still usable after `notAfter`): conceal and offer Log out again. */
  #logoutRefused() {
    this.#logoutUnresolved = false
    this.#stopTimer("logout-watch")
    this.#post("logout-failed")
    this.#setView("logout-failed")
  }

  /** Conceals before the page enters the back/forward cache; `RestoredPageGuard` reloads it on restore. */
  #pageHide(event: PageTransitionEvent) {
    if (event.persisted) this.#conceal()
  }

  #post(type: "logged-out" | "logout-failed") {
    this.#channel?.post({ coordinationTag: this.#tag, type })
  }

  /** Applies `hidden` and `inert` synchronously, then lets React render the same state. */
  #publish() {
    const concealed = this.#concealed || this.#view === "logout-failed"
    this.#hideContent(concealed)
    this.#notify({
      concealed,
      deadline: this.#held === undefined ? undefined : this.#deadline,
      endedHere: false,
      view: this.#view,
      warningLeadMinutes: this.#held?.warningLeadMinutes
    })
  }

  #readWindow() {
    return this.#sharedWindow ? readWindowRecord(this.#tag) : this.#memoryWindow
  }

  #receive(message: TabMessage) {
    if (message.coordinationTag === this.#tag) {
      this.#receivers[message.type](message)
      return
    }
    // Another session's document mounted: confirm, never end on the hint alone (R14).
    if (message.type === "session-current") this.#guard(this.confirm())
  }

  /** A confirmed-ended tag ends the tab. Answers whether it did. */
  #replayEnded(): boolean {
    if (!readEndedTags().includes(this.#tag)) return false
    this.#end(false)
    return true
  }

  /** A logout in progress for this tag resumes the confirmation watch; the record alone never ends the tab. */
  #replayLogoutInProgress() {
    const logoutUntil = readLogoutInProgress(this.#tag)
    if (logoutUntil !== undefined && !this.#timers.has("logout-watch")) this.#watchLogout(logoutUntil)
  }

  /** B5-R: replay records first; past the local deadline conceal at once; either way confirm (research D9). */
  #resume() {
    if (this.#view === "ended" || document.visibilityState !== "visible") return
    if (this.#replayEnded()) return
    this.#replayLogoutInProgress()
    const hint = readCurrentHint()
    // A hint naming another session conceals temporarily and confirms; it never ends the tab (R14).
    if (hint !== undefined && hint !== this.#tag) this.#conceal()
    if (Date.now() >= this.#deadline) this.#conceal()
    this.#guard(this.confirm())
  }

  /** Ends temporary concealment after the server confirmed this session. */
  #reveal() {
    if (!this.#concealed || this.#view === "ended" || !this.#live()) return
    this.#concealed = false
    this.#concealedSince = Number.POSITIVE_INFINITY
    this.#publish()
  }

  #schedule(name: TimerName, at: number, task: () => void) {
    this.#stopTimer(name)
    if (!this.#live()) return
    // A fired timer leaves the table first, so the table names only pending timers.
    this.#timers.set(
      name,
      setTimeout(() => {
        this.#timers.delete(name)
        task()
      }, Math.max(0, at - Date.now()))
    )
  }

  #scheduleFlush(at: number) {
    this.#schedule("flush", at, () => {
      this.#flush()
    })
  }

  #send(activity: InPageSessionActivity) {
    // In memory the window is shared by announcing each communication (R24).
    if (!this.#sharedWindow) this.#channel?.post({ at: Date.now(), coordinationTag: this.#tag, type: "communicated" })
    this.#guard(
      sendActivity(activity, this.#tag).then((outcome) => {
        if (!this.#live()) return
        if (outcome._tag === "Usable") this.#adoptSnapshot(outcome.snapshot, true)
        if (outcome._tag === "Ended") this.#endConfirmed()
      })
    )
  }

  #setView(view: Exclude<TabView, "ended">) {
    if (this.#view === "ended" || !this.#live()) return
    this.#view = view
    this.#publish()
  }

  #stopTimer(name: TimerName) {
    const existing = this.#timers.get(name)
    if (existing !== undefined) clearTimeout(existing)
    this.#timers.delete(name)
  }

  #storage(event: StorageEvent) {
    if (event.key === ENDED_KEY && readEndedTags().includes(this.#tag)) this.#end(false)
    if (event.key !== CURRENT_KEY) return
    this.#hintOverride = undefined
    if (readCurrentHint() !== this.#tag) this.#guard(this.confirm())
  }

  /** Server Action submit guard (research D2, R2, R15): a hint naming another session holds the submission. */
  #submit(event: SubmitEvent) {
    const form = event.target
    const content = this.#content()
    if (!(form instanceof HTMLFormElement) || !content?.contains(form)) return
    const replay = this.#confirmedReplay
    if (replay?.form === form && replay.submitter === event.submitter) {
      this.#confirmedReplay = undefined
      return
    }
    if ((this.#hintOverride ?? readCurrentHint() ?? this.#tag) === this.#tag) return
    event.preventDefault()
    this.#guard(this.#confirmThenReplay(form, event.submitter))
  }

  /**
   * After a logout starts, start a confirmation each second until the outcome arrives or `notAfter` plus 2 s (R11, R21).
   * Ticks do not wait for earlier reads, so a slow read cannot push the next one past the concealment bound.
   */
  #watchLogout(until: number, at = Date.now() + LOGOUT_WATCH_INTERVAL_MILLISECONDS) {
    if (this.#view === "ended" || at > until) return
    this.#schedule("logout-watch", at, () => {
      this.#watchLogout(until, at + LOGOUT_WATCH_INTERVAL_MILLISECONDS)
      this.#guard(this.confirm(LOGOUT_WATCH_INTERVAL_MILLISECONDS))
    })
  }

  /** Runs window work under the cross-tab lock when the window is shared, otherwise at once (R24). */
  #withWindow(task: () => void) {
    const lock = this.#sharedWindow ? windowLock() : undefined
    if (lock === undefined) task()
    else this.#guard(lock(task))
  }

  #writeWindow(record: ActivityWindowRecord) {
    if (this.#sharedWindow) writeWindowRecord(this.#tag, record)
    else this.#memoryWindow = record
  }
}
