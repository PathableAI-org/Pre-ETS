import type {
  InPageSessionActivity,
  SessionCoordinationSnapshot,
  SessionEndCause
} from "@pathableai/pre-ets-frontend-services"

import {
  recordUiTransition,
  type TraceScope,
  type TransitionCause,
  type UiState,
  withdrawSubmitCause
} from "../../shared/browser-tracing.ts"
import { classifySessionActivity } from "./activity-classification.ts"
import {
  ACTIVITY_WINDOW_MILLISECONDS,
  type ActivityWindowRecord,
  applyCommunication,
  decideActivityCommunication,
  flushActivityCommunication
} from "./activity-window.ts"
import { calibrateClockOffset, type ClockOffset, type ClockSample } from "./clock-offset.ts"
import { knownExpiration } from "./known-expiration.ts"
import { readSessionStatus, sendActivity, sendLogout, type SessionOutcome } from "./session-endpoints.ts"
import { adoptSnapshot } from "./snapshot-order.ts"
import {
  addPendingLogout,
  CURRENT_KEY,
  type EndedCause,
  endedKey,
  openTabChannel,
  pendingLogouts,
  readCurrentHint,
  readEnded,
  readWindowRecord,
  recordEnded,
  removePendingLogout,
  storageAvailable,
  type TabChannel,
  type TabMessage,
  windowLock,
  writeCurrentHint,
  writeWindowRecord
} from "./tab-channel.ts"

/**
 * Tab states from data-model "Tab coordination states"; `Confirming` keeps its view. Concealment is orthogonal, so a
 * logout in progress keeps its busy state while an unconfirmed session hides the content. `recovery` follows a denied
 * action in this tab only (#157 research D6); `expired` follows confirmed expiry in every sharing tab (#157 D8–D10).
 * `ended`, `expired`, and `recovery` are terminal.
 */
export type TabView = "active" | "ended" | "expired" | "logging-out" | "logout-failed" | "recovery"

export interface TabViewState {
  /** Protected content is hidden and inert (temporary concealment, or a failed logout). */
  readonly concealed: boolean
  /** The held local deadline, exposed on the header as non-protected evidence (V-004). */
  readonly deadline?: number | undefined
  /** The session ended by this tab's own logout, so this tab moves focus to the notice. */
  readonly endedHere: boolean
  /** In the `expired` view: the page is entering the back/forward cache, so the modal is hidden (#157 FR-018). */
  readonly pageHidden?: true | undefined
  /** Why the session ended, as far as this tab knows; set in the `recovery` view. */
  readonly recovery?: SessionEndCause | undefined
  readonly view: TabView
  /** The held warning lead, exposed beside the deadline. */
  readonly warningLeadMinutes?: number | undefined
}

type TimerName = "confirm" | "flush" | "logout-watch" | "near-deadline" | "retry"

const CONFIRMATION_RETRY_MILLISECONDS = 5_000
/**
 * How long after a protected submission leaves this tab an `Ended` activity answer waits for the action's own outcome,
 * so a denied action shows recovery in this tab only (#157 FR-003, FR-008). A settled action answers sooner.
 */
const SUBMISSION_SETTLE_MILLISECONDS = 5_000
/** Watch reads start on a fixed one-second cadence and each gives up after one second, keeping FR-015's 2-second bound. */
const LOGOUT_WATCH_INTERVAL_MILLISECONDS = 1_000
/** A logout attempt is refused by the server after `notAfter`, this far ahead on the server clock (R21). */
const LOGOUT_ATTEMPT_MILLISECONDS = 10_000
const ACTIVITY_EVENTS = ["beforeinput", "click", "focusin", "keydown", "pointerdown"] as const
const GESTURE_EVENTS = ["keydown", "pointerdown"] as const

type Listener = readonly [EventTarget, string, (event: Event) => void, boolean]

const listenAll = (listeners: readonly Listener[]) => {
  for (const [target, type, handler, capture] of listeners) target.addEventListener(type, handler, { capture })
  return () => {
    for (const [target, type, handler, capture] of listeners) target.removeEventListener(type, handler, { capture })
  }
}

/** Why this tab concealed temporarily, where the telemetry contract says (#157 T-003). */
type ConcealCause = Extract<TransitionCause, "deadline" | "resume">

/** Why this tab confirmed expiry: its own confirmation (at the deadline or on resume), or another tab's record. */
type ExpiryCause = Extract<TransitionCause, "deadline" | "peer" | "resume">

/** States whose transitions carry the concealment cause and server-clock timing (#157 T-003). */
const TIMED_STATES: ReadonlySet<UiState> = new Set<UiState>(["content_concealed", "content_shown"])

/** The minimum wait before re-confirming a session the server still holds past this tab's local deadline. */
const NEAR_DEADLINE_RETRY_MILLISECONDS = 250

/** The recorded UI state of each running view, unconcealed and concealed (telemetry contract closed sets). */
const UI_STATES: Readonly<
  Record<Exclude<TabView, "expired" | "recovery">, readonly [shown: UiState, concealed: UiState]>
> = {
  active: ["content_shown", "content_concealed"],
  ended: ["signed_out", "signed_out"],
  "logging-out": ["logging_out", "logging_out_concealed"],
  "logout-failed": ["logout_failed", "logout_failed"]
}

/** The recorded UI state of the recovery view by cause (#157 T-002). */
const RECOVERY_STATES: Readonly<Record<SessionEndCause, UiState>> = {
  expired: "recovery_expired",
  unknown: "recovery_unavailable"
}

/** No transition was recorded: work runs in whatever scope is already active. */
const CURRENT_SCOPE: TraceScope = { run: (task) => task() }

const EMPTY_WINDOW: ActivityWindowRecord = {
  lastCommunicatedAt: undefined,
  pendingLatest: undefined,
  pendingSince: undefined
}

/** The page navigation's own request timing describes the first server-rendered snapshot of this document only. */
let navigationTimingUsed = false

/** Which server clock a snapshot field reads: the application's, or Redis `TIME` for logout cutoffs (R29, R34). */
type ClockOf = (snapshot: SessionCoordinationSnapshot) => number

interface TimedSnapshot {
  readonly receivedAt: number
  readonly sentAt: number
  readonly snapshot: SessionCoordinationSnapshot
}

const applicationClock: ClockOf = (snapshot) => snapshot.serverTimeEpochMilliseconds
const redisClock: ClockOf = (snapshot) => snapshot.observedAtEpochMilliseconds

/**
 * The server-rendered snapshot's request timing, from Navigation Timing for the document's first coordinator only.
 * Otherwise it is unknown.
 */
const navigationTiming = (): undefined | { readonly receivedAt: number; readonly sentAt: number } => {
  const [entry] = typeof performance === "undefined" ? [] : performance.getEntriesByType("navigation")
  if (navigationTimingUsed || !(entry instanceof PerformanceNavigationTiming)) return undefined
  navigationTimingUsed = true
  const origin = performance.timeOrigin
  return { receivedAt: origin + entry.responseStart, sentAt: origin + entry.requestStart }
}

/**
 * The server-rendered snapshot's estimate. With unknown timing it assumes receipt at mount and has an unbounded round
 * trip, so the first timed response replaces it (R29).
 */
const initialOffset = (serverTime: number, timing: ReturnType<typeof navigationTiming>): ClockOffset =>
  timing === undefined ?
    { offset: serverTime - Date.now(), roundTrip: Number.POSITIVE_INFINITY } :
    calibrateClockOffset(undefined, { ...timing, serverTime })

const responseSample = (outcome: TimedSnapshot, clockOf: ClockOf): ClockSample => ({
  receivedAt: outcome.receivedAt,
  sentAt: outcome.sentAt,
  serverTime: clockOf(outcome.snapshot)
})

/**
 * One tab's participation in its session: B5-W activity communication, cross-tab synchronization ordered by store
 * observation, confirmation before acting on the local deadline, replay of missed logouts, the Server Action submit
 * guard, resume handling, and logout. The server decides validity; this never claims a session is usable on its own,
 * never ends a tab on a hint alone, and fails closed when the server cannot confirm.
 */
export class TabCoordination {
  /** Unresolved logout attempts of this tag, by attempt, with their server-clock `notAfter` (R26, R31). */
  readonly #attempts = new Map<string, number>()
  /** Aborts reads still in flight when the controller is torn down. */
  readonly #cancel = new AbortController()
  #channel: TabChannel | undefined
  /** Server clock minus this tab's clock, from the latest server snapshot (research D6). */
  /** Server clock minus this tab's clock, calibrated from request timing (research D6, R29). */
  #clock: ClockOffset | undefined
  /** Why the current temporary concealment began, when the telemetry contract names it (#157 T-003). */
  #concealCause: ConcealCause | undefined
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
  /** When a protected submission last left this tab (#157). */
  #lastSubmission = Number.NEGATIVE_INFINITY
  /** This tab's logout had no definitive answer; confirmation decides its outcome (R18). */
  #logoutUnresolved = false
  /** The window for this tab's tag when storage or locks are unavailable (R24). */
  #memoryWindow: ActivityWindowRecord | undefined
  readonly #notify: (state: TabViewState) => void
  /** This tab's own latest logout attempt (R26). */
  #ownAttempt: string | undefined
  #pendingActivity: InPageSessionActivity | undefined
  /** What each message for this tab's own session does (data-model "Channel messages"). */
  readonly #receivers: Readonly<Record<TabMessage["type"], (message: TabMessage) => void>> = {
    communicated: (message) => {
      // Only fallback tabs keep the window in memory; a shared tab's window lives in storage (R24).
      if (message.type !== "communicated" || this.#sharedWindow) return
      // It covers pending activity at or before it; later activity keeps its 60-second bound (R32, R36).
      const record = applyCommunication(this.#memoryWindow ?? EMPTY_WINDOW, message.at)
      this.#memoryWindow = record
      if (record.pendingSince !== undefined) return
      this.#pendingActivity = undefined
      this.#stopTimer("flush")
    },
    "logged-out": () => {
      this.#end(false)
    },
    // One attempt failed definitively; watching continues while another attempt of this tag is unresolved (R26).
    "logout-failed": (message) => {
      if (message.type !== "logout-failed") return
      this.#attempts.delete(message.attemptId)
      this.#stopWatchIfIdle()
    },
    "logout-started": (message) => {
      if (message.type !== "logout-started") return
      this.#trackAttempt(message.attemptId, message.notAfter)
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
        idleDeadlineEpochMilliseconds: message.idleDeadlineEpochMilliseconds,
        observedAtEpochMilliseconds: message.observedAtEpochMilliseconds,
        revision: message.revision,
        // A relayed deadline is already on the server clock; the relaying tab's server time is not needed.
        serverTimeEpochMilliseconds: Number.NaN,
        warningLeadMinutes: message.warningLeadMinutes
      }, false)
    },
    "session-current": () => undefined,
    // A joining tab without storage or locks learns the open window (R37).
    "window-query": () => {
      const at = this.#memoryWindow?.lastCommunicatedAt
      if (this.#sharedWindow || at === undefined) return
      this.#channel?.post({ at, coordinationTag: this.#tag, type: "communicated" })
    }
  }
  /** Redis `TIME` minus this tab's clock, calibrated from snapshots' `observedAt`; generates logout cutoffs (R34). */
  #redisClock: ClockOffset | undefined
  /** Whether the activity window is shared through storage under a Web Lock; otherwise it is kept in memory (R24). */
  #sharedWindow = false
  readonly #tag: string
  readonly #timers = new Map<TimerName, ReturnType<typeof setTimeout>>()
  /** The last recorded UI state; `undefined` until the first publish, which records `mounted → …`. */
  #uiState: UiState | undefined
  #view: TabView = "active"

  get #serverOffset() {
    return this.#clock?.offset ?? 0
  }

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
    await this.#confirm("deadline", timeout)
  }

  /**
   * A protected action of this tab was rejected (#157 research D6). The gate's `expired` token enters recovery at
   * once. Otherwise the session status decides: `Ended` enters recovery with the known-expiration cause (research D7),
   * and any other answer is applied as a confirmation. Recovery writes no ended record and posts no message, so other
   * tabs keep their state (FR-008). Answers whether the tab now shows recovery. Never throws.
   */
  async deny(cause: SessionEndCause | undefined): Promise<boolean> {
    if (!this.#running()) return false
    if (cause === "expired") return this.#recover("expired")
    const startedAt = Date.now()
    const outcome = await readSessionStatus(this.#cancel.signal)
    if (!this.#live() || !this.#running()) return false
    if (outcome._tag !== "Ended") {
      this.#applyStatus(outcome, startedAt, "deadline")
      return false
    }
    return this.#recover(this.#knownExpiration(outcome.serverTime) ? "expired" : "unknown")
  }

  /** Logout is sent at once with `keepalive` and never enters the activity window (FR-009, research D8). */
  async logout(): Promise<void> {
    if (!this.#running() || this.#view === "logging-out") return
    const transition = this.#setView("logging-out")
    const attemptId = crypto.randomUUID()
    // On the Redis clock, which the store's atomic check and attempt resolution also use (R34).
    const notAfter = Date.now() + (this.#redisClock?.offset ?? this.#serverOffset) + LOGOUT_ATTEMPT_MILLISECONDS
    this.#ownAttempt = attemptId
    // The broadcast and the request start inside the transition's scope, so both are its children (research D5).
    const outcome = await transition.run(() => {
      addPendingLogout(this.#tag, { attemptId, notAfter })
      this.#channel?.post({ attemptId, coordinationTag: this.#tag, notAfter, type: "logout-started" })
      return sendLogout(this.#tag, notAfter)
    })
    if (outcome === "refused") {
      this.#logoutRefused()
      this.#guard(this.confirm())
    } else if (outcome === "unknown") {
      // The server may have ended the session and lost or failed the reply: conceal; confirmation decides (R18, R22).
      this.#logoutUnresolved = true
      this.#conceal()
      this.#trackAttempt(attemptId, notAfter)
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
    const storage = storageAvailable()
    this.#sharedWindow = windowLock() !== undefined && storage
    const stopListening = this.#listen()
    this.#publish()
    const timing = navigationTiming()
    this.#clock = initialOffset(applicationClock(this.#initial), timing)
    this.#redisClock = initialOffset(redisClock(this.#initial), timing)
    this.#replayPendingLogouts()
    this.#stopListening = stopListening
    if (!this.#replayEnded("peer")) {
      // Without readable storage the replay proves nothing, so confirm before trusting the snapshot (R39).
      if (storage) this.#adoptSnapshot(this.#initial, true)
      else this.#concealAndConfirm()
      if (!writeCurrentHint(this.#tag)) this.#hintOverride = this.#tag
      this.#channel.post({ coordinationTag: this.#tag, type: "session-current" })
      if (!this.#sharedWindow) this.#channel.post({ coordinationTag: this.#tag, type: "window-query" })
    }
    return () => {
      this.#stop()
    }
  }

  /** A newer server-rendered snapshot of this session (a route refresh) counts as a confirmation of it. */
  update(snapshot: SessionCoordinationSnapshot): void {
    if (!this.#running()) return
    // Its request timing is unknown, so it does not recalibrate the clock; a newer revision reveals content.
    if (this.#adoptSnapshot(snapshot, true)) this.#reveal()
  }

  #activity(activity: InPageSessionActivity) {
    if (this.#view !== "active" || this.#concealed) return
    this.#withWindow(() => {
      this.#decide(activity)
    })
  }

  /**
   * Converts the held server-clock deadline with the current offset and schedules confirmation and the near-deadline
   * flush; snapshot age never extends it (R29).
   */
  /**
   * An activity report found the session ended. While a protected submission of this tab is settling, its outcome
   * decides instead: a denial enters recovery in this tab only, and a settled action confirms. If neither comes, a
   * confirmation at the end of the settle window ends the tab as before (#157 research D6, FR-008).
   */
  #activityEnded(serverTime: number | undefined) {
    const settledBy = this.#lastSubmission + SUBMISSION_SETTLE_MILLISECONDS
    if (Date.now() >= settledBy) {
      this.#endConfirmed("deadline", serverTime)
      return
    }
    this.#schedule("retry", settledBy, () => {
      this.#guard(this.confirm())
    })
  }

  /** Enters a recorded end: `expired` unless this tab observed a logout, which keeps precedence (#157 FR-019). */
  #adoptEnded(recorded: EndedCause, cause: ExpiryCause) {
    if (recorded === "expired" && !this.#logoutObserved()) this.#expire(cause, undefined)
    else this.#end(false)
  }

  /**
   * Adopts a snapshot of this tab's session when its store observation is later than the held one (research D6).
   * Answers whether it was adopted.
   */
  #adoptSnapshot(snapshot: SessionCoordinationSnapshot, broadcast: boolean): boolean {
    if (snapshot.coordinationTag !== this.#tag) {
      this.#endConfirmed("deadline", undefined)
      return false
    }
    if (!adoptSnapshot(this.#held, snapshot)) return false
    this.#held = snapshot
    this.#applyDeadline()
    if (broadcast) {
      this.#channel?.post({
        coordinationTag: this.#tag,
        idleDeadlineEpochMilliseconds: snapshot.idleDeadlineEpochMilliseconds,
        observedAtEpochMilliseconds: snapshot.observedAtEpochMilliseconds,
        revision: snapshot.revision,
        type: "renewed",
        warningLeadMinutes: snapshot.warningLeadMinutes
      })
    }
    return true
  }

  #applyDeadline() {
    if (this.#held === undefined) return
    this.#deadline = this.#held.idleDeadlineEpochMilliseconds - this.#serverOffset
    this.#publish()
    // At the local deadline the content is concealed while the server confirms (#157 research D10).
    this.#schedule("confirm", this.#deadline, () => {
      this.#concealAndConfirm("deadline")
    })
    this.#schedule("near-deadline", this.#deadline - ACTIVITY_WINDOW_MILLISECONDS + 1, () => {
      this.#flushNearDeadline()
    })
  }

  /**
   * Acts on a status answer for a read started at `startedAt` because of `cause`. A usable answer for this session
   * reveals concealed content when the read started after concealment began, or when its snapshot is newer than the
   * held one, so a renewal adopted from another tab meanwhile does not keep this tab hidden.
   */
  #applyStatus(outcome: SessionOutcome, startedAt: number, cause: ExpiryCause) {
    switch (outcome._tag) {
      case "Ended":
        this.#endConfirmed(cause, outcome.serverTime)
        return
      case "Undetermined":
        this.#conceal()
        this.#schedule("retry", Date.now() + CONFIRMATION_RETRY_MILLISECONDS, () => {
          this.#guard(this.#confirm(cause))
        })
        return
      case "Usable":
        this.#calibrate(outcome)
        this.#resolveAttempts(outcome.snapshot)
        if (this.#adoptSnapshot(outcome.snapshot, true) || startedAt >= this.#concealedSince) this.#reveal()
        this.#confirmAtServerDeadline(outcome.snapshot)
    }
  }

  /** Any response may recalibrate the offsets, including an equal revision; a changed offset reconverts the deadline. */
  #calibrate(outcome: TimedSnapshot) {
    this.#redisClock = calibrateClockOffset(this.#redisClock, responseSample(outcome, redisClock))
    const next = calibrateClockOffset(this.#clock, responseSample(outcome, applicationClock))
    if (next === this.#clock) return
    this.#clock = next
    this.#applyDeadline()
  }

  #clearTimers() {
    for (const timer of this.#timers.values()) clearTimeout(timer)
    this.#timers.clear()
  }

  /**
   * Temporary concealment, applied to the DOM at once so nothing stays visible or focusable until React commits.
   * It applies over a logout in progress too. `cause` names a deadline or resume concealment (#157 T-003).
   */
  #conceal(cause?: ConcealCause): TraceScope {
    if (!this.#running()) return CURRENT_SCOPE
    if (!this.#concealed) {
      this.#concealedSince = Date.now()
      this.#concealCause = cause
    }
    this.#concealed = true
    return this.#publish()
  }

  /** The confirmation starts inside the concealment's scope, so its request is the transition's child (D5). */
  #concealAndConfirm(cause?: ConcealCause) {
    this.#conceal(cause).run(() => {
      this.#guard(this.#confirm(cause ?? "deadline"))
    })
  }

  /** Reads the session without renewing it; `cause` names why, should the answer confirm expiry (#157 T-003). */
  async #confirm(cause: ExpiryCause, timeout?: number): Promise<void> {
    if (!this.#running()) return
    const startedAt = Date.now()
    const outcome = await readSessionStatus(this.#cancel.signal, timeout)
    if (this.#live()) this.#applyStatus(outcome, startedAt, cause)
  }

  /**
   * The server still holds the session past this tab's local deadline, as when the local estimate runs slightly early
   * or an equal revision adopted nothing: confirm again when the server's own deadline arrives, so confirmed expiry
   * stays within the 2-second bound (B5) instead of waiting a full retry.
   */
  #confirmAtServerDeadline(snapshot: SessionCoordinationSnapshot) {
    const now = Date.now()
    if (snapshot.coordinationTag !== this.#tag || now < this.#deadline || this.#timers.has("confirm")) return
    const remaining = snapshot.idleDeadlineEpochMilliseconds - snapshot.serverTimeEpochMilliseconds
    const wait = Math.min(Math.max(remaining, NEAR_DEADLINE_RETRY_MILLISECONDS), CONFIRMATION_RETRY_MILLISECONDS)
    this.#schedule("confirm", now + wait, () => {
      this.#concealAndConfirm("deadline")
    })
  }

  /** Holds a submission whose hint names another session, confirms, and replays it if this session is current (R15). */
  async #confirmThenReplay(form: HTMLFormElement, submitter: HTMLElement | null) {
    const startedAt = Date.now()
    const outcome = await readSessionStatus(this.#cancel.signal)
    if (!this.#live()) return
    this.#applyStatus(outcome, startedAt, "deadline")
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
    if (!this.#terminate("ended")) return
    this.#notify({ concealed: true, endedHere, view: "ended" })
    this.#transition()
  }

  /**
   * The server answered 401 or a different session: record it so tabs that missed it can replay it. While this tab's
   * own logout is unresolved, that answer is its outcome (R18). With known expiration (#157 research D7) every sharing
   * tab enters `expired`; otherwise it ends (D9).
   */
  #endConfirmed(cause: ExpiryCause, serverTime: number | undefined) {
    if (this.#logoutUnresolved) {
      this.#logoutEnded()
      return
    }
    if (this.#knownExpiration(serverTime)) {
      recordEnded(this.#tag, "expired")
      this.#expire(cause, serverTime)
      return
    }
    recordEnded(this.#tag, "ended")
    this.#end(false)
  }

  /**
   * Confirmed expiry: the header and content are unmounted and the expiration modal is shown (#157 research D8). The
   * transition carries the cause and the server-clock timing (T-003).
   */
  #expire(cause: ExpiryCause, serverTime: number | undefined) {
    const timing = this.#timing(serverTime)
    if (!this.#terminate("expired")) return
    this.#notify({ concealed: true, endedHere: false, view: "expired" })
    const from = this.#uiState
    this.#uiState = "expired"
    recordUiTransition(from, "expired", { cause, timing })
  }

  /** Window end: one tab sends the coalesced activity if it is still pending and its window is due (R8). */
  #flush() {
    const activity = this.#pendingActivity
    if (activity === undefined || !this.#running()) return
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

  /** The tab's known expiration on the server clock (#157 research D7); `serverTime` is an `Ended` answer's date. */
  #knownExpiration(serverTime: number | undefined): boolean {
    return knownExpiration({
      deadline: this.#held?.idleDeadlineEpochMilliseconds,
      logoutObserved: this.#logoutObserved(),
      serverTimes: [this.#serverNow(), serverTime]
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
    if (this.#ownAttempt !== undefined) removePendingLogout(this.#tag, this.#ownAttempt)
    recordEnded(this.#tag, "ended")
    this.#post("logged-out")
    this.#end(true)
  }

  /** This tab received a logout of its session, or a logout attempt of its tag is unresolved (#157 research D7). */
  #logoutObserved(): boolean {
    return this.#logoutUnresolved || this.#attempts.size > 0
  }

  /** Logout did not complete (403, or confirmed still usable after `notAfter`): conceal and offer Log out again. */
  #logoutRefused() {
    this.#logoutUnresolved = false
    const own = this.#ownAttempt
    if (own !== undefined) {
      removePendingLogout(this.#tag, own)
      this.#attempts.delete(own)
      this.#channel?.post({ attemptId: own, coordinationTag: this.#tag, type: "logout-failed" })
    }
    this.#stopWatchIfIdle()
    this.#setView("logout-failed")
  }

  /**
   * Conceals before the page enters the back/forward cache, and hides the expiration modal, so a restored page shows
   * neither until `RestoredPageGuard` reloads it (#157 FR-018).
   */
  #pageHide(event: PageTransitionEvent) {
    if (!event.persisted) return
    if (this.#view === "expired") this.#notify({ concealed: true, endedHere: false, pageHidden: true, view: "expired" })
    else this.#conceal()
  }

  #post(type: "logged-out") {
    this.#channel?.post({ coordinationTag: this.#tag, type })
  }

  /**
   * Applies `hidden` and `inert` synchronously, then lets React render the same state. Answers the scope of the UI
   * transition it recorded, or the current scope when the UI state did not change.
   */
  #publish(): TraceScope {
    const concealed = this.#concealed || this.#view === "logout-failed"
    this.#hideContent(concealed)
    this.#notify({
      concealed,
      deadline: this.#held === undefined ? undefined : this.#deadline,
      endedHere: false,
      view: this.#view,
      warningLeadMinutes: this.#held?.warningLeadMinutes
    })
    return this.#transition()
  }

  #readWindow() {
    return this.#sharedWindow ? readWindowRecord(this.#tag) : this.#memoryWindow
  }

  /** Messages for other tags are ignored, except `session-current`: a hint that only triggers confirmation (R14, R38). */
  #receive(message: TabMessage) {
    if (message.coordinationTag === this.#tag) {
      this.#receivers[message.type](message)
      return
    }
    if (message.type === "session-current") this.#guard(this.confirm())
  }

  /**
   * Replaces the tab's header and content with recovery and stops coordinating: no record, no message, no further
   * reads or activity, so nothing here changes another tab (#157 research D6, FR-008). Answers `true`.
   */
  #recover(cause: SessionEndCause): true {
    this.#view = "recovery"
    this.#hideContent(true)
    this.#notify({ concealed: true, endedHere: false, recovery: cause, view: "recovery" })
    const from = this.#uiState
    this.#uiState = RECOVERY_STATES[cause]
    recordUiTransition(from, this.#uiState, { cause: "action_denied" })
    this.#stop()
    return true
  }

  /** A confirmed-ended tag ends the tab, or shows it expired, as recorded. Answers whether it did. */
  #replayEnded(cause: ExpiryCause): boolean {
    const recorded = readEnded(this.#tag)
    if (recorded === undefined) return false
    this.#adoptEnded(recorded, cause)
    return true
  }

  /** Unresolved logout attempts of this tag start the watch; a stored attempt alone never ends the tab (R28). */
  #replayPendingLogouts() {
    for (const attempt of pendingLogouts(this.#tag)) this.#trackAttempt(attempt.attemptId, attempt.notAfter)
  }

  /**
   * A usable status observed by Redis after an attempt's `notAfter` shows that attempt can no longer delete, so it
   * resolves; no clock agreement between the application and Redis is assumed (R31). For this tab's own ambiguous
   * attempt, that is the "confirmed still usable" outcome (R22).
   */
  #resolveAttempts(snapshot: SessionCoordinationSnapshot) {
    if (snapshot.coordinationTag !== this.#tag) return
    for (const [attemptId, notAfter] of this.#attempts) {
      if (snapshot.observedAtEpochMilliseconds <= notAfter) continue
      if (attemptId === this.#ownAttempt && this.#logoutUnresolved) this.#logoutRefused()
      this.#attempts.delete(attemptId)
      removePendingLogout(this.#tag, attemptId)
    }
    this.#stopWatchIfIdle()
  }

  /** B5-R: replay records first; past the local deadline conceal at once; either way confirm (research D9). */
  #resume() {
    if (!this.#running() || document.visibilityState !== "visible") return
    if (this.#replayEnded("resume")) return
    this.#replayPendingLogouts()
    const hint = readCurrentHint()
    // A hint naming another session, or a passed deadline, conceals temporarily and confirms; it never ends the tab
    // (R14). The confirmation starts inside the concealment's scope (research D5).
    const overdue = (hint !== undefined && hint !== this.#tag) || Date.now() >= this.#deadline
    const transition = overdue ? this.#conceal("resume") : CURRENT_SCOPE
    transition.run(() => {
      this.#guard(this.#confirm("resume"))
    })
  }

  /** Ends temporary concealment after the server confirmed this session. */
  #reveal() {
    if (!this.#concealed || !this.#running()) return
    this.#concealed = false
    this.#concealedSince = Number.POSITIVE_INFINITY
    this.#publish()
    this.#concealCause = undefined
  }

  /** Still coordinating a session that has not reached a terminal view (`ended`, `expired`, or `recovery`). */
  #running() {
    return this.#live() && this.#view !== "ended" && this.#view !== "expired" && this.#view !== "recovery"
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
        if (outcome._tag === "Usable") {
          this.#calibrate(outcome)
          this.#adoptSnapshot(outcome.snapshot, true)
        }
        if (outcome._tag === "Ended") this.#activityEnded(outcome.serverTime)
      })
    )
  }

  /** Server time on this tab's calibrated estimate (#157 research D7). */
  #serverNow(): number {
    return Date.now() + this.#serverOffset
  }

  #setView(view: Exclude<TabView, "ended" | "expired" | "recovery">): TraceScope {
    if (!this.#running()) return CURRENT_SCOPE
    this.#view = view
    return this.#publish()
  }

  /** Stops listening, aborts reads in flight, closes the channel, and clears timers. Idempotent. */
  #stop() {
    this.#stopListening()
    this.#cancel.abort()
    this.#channel?.close()
    this.#channel = undefined
    this.#clearTimers()
  }

  #stopListening: () => void = () => undefined

  #stopTimer(name: TimerName) {
    const existing = this.#timers.get(name)
    if (existing !== undefined) clearTimeout(existing)
    this.#timers.delete(name)
  }

  /** Stops the watch once no attempt remains; a pending tick is kept so the fixed cadence holds (R11, FR-015). */
  #stopWatchIfIdle() {
    if (!this.#running() || this.#attempts.size === 0) this.#stopTimer("logout-watch")
  }

  #storage(event: StorageEvent) {
    if (event.key === endedKey(this.#tag)) this.#replayEnded("peer")
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
      this.#lastSubmission = Date.now()
      return
    }
    if ((this.#hintOverride ?? readCurrentHint() ?? this.#tag) === this.#tag) {
      this.#lastSubmission = Date.now()
      return
    }
    event.preventDefault()
    // The cancelled submission causes no request; its confirmed replay, if any, does (research D16).
    withdrawSubmitCause(event)
    this.#guard(this.#confirmThenReplay(form, event.submitter))
  }

  /**
   * Leaves coordination for a terminal view that keeps the page listeners: timers stop, pending activity is dropped,
   * every attempt of this tag is resolved because the session ended (R31), and the content is hidden at once. Answers
   * whether this tab was still running.
   */
  #terminate(view: "ended" | "expired"): boolean {
    if (!this.#running()) return false
    this.#clearTimers()
    this.#pendingActivity = undefined
    for (const attemptId of this.#attempts.keys()) removePendingLogout(this.#tag, attemptId)
    this.#attempts.clear()
    this.#view = view
    this.#hideContent(true)
    return true
  }

  /** The held deadline and this tab's best server-time estimate, both on the server clock (#157 T-003). */
  #timing(serverTime: number | undefined) {
    if (this.#held === undefined) return undefined
    const estimate = this.#serverNow()
    return {
      deadlineMs: this.#held.idleDeadlineEpochMilliseconds,
      serverTimeMs: serverTime === undefined ? estimate : Math.max(estimate, serverTime)
    }
  }

  /** Watches an attempt of this tag until it resolves (R26, R31). */
  #trackAttempt(attemptId: string, notAfter: number) {
    this.#attempts.set(attemptId, notAfter)
    if (!this.#timers.has("logout-watch")) this.#watchLogout()
  }

  /** Records the UI state when it changed and answers that record's scope; otherwise the current scope (T-004). */
  #transition(): TraceScope {
    // Recovery and expiry record their own transition once, with its cause.
    if (this.#view === "recovery" || this.#view === "expired") return CURRENT_SCOPE
    const to = UI_STATES[this.#view][this.#concealed ? 1 : 0]
    if (to === this.#uiState) return CURRENT_SCOPE
    const from = this.#uiState
    this.#uiState = to
    const cause = TIMED_STATES.has(to) ? this.#concealCause : undefined
    return recordUiTransition(from, to, cause === undefined ? undefined : { cause, timing: this.#timing(undefined) })
  }

  /**
   * While any attempt of this tag is unresolved, start a confirmation each second (R11, R26, R31). Ticks do not wait
   * for earlier reads, so a slow read cannot push the next one past the concealment bound.
   */
  #watchLogout(at = Date.now() + LOGOUT_WATCH_INTERVAL_MILLISECONDS) {
    if (!this.#running() || this.#attempts.size === 0) {
      this.#stopTimer("logout-watch")
      return
    }
    this.#schedule("logout-watch", at, () => {
      this.#watchLogout(at + LOGOUT_WATCH_INTERVAL_MILLISECONDS)
      this.#guard(this.confirm(LOGOUT_WATCH_INTERVAL_MILLISECONDS))
    })
  }

  /** Runs window work under the cross-tab lock when the window is shared, otherwise at once (R24). */
  #withWindow(task: () => void) {
    const lock = this.#sharedWindow ? windowLock() : undefined
    if (lock === undefined) task()
    else this.#guard(lock(task))
  }

  /** Storage that stops accepting writes moves this tab to the in-memory fallback, keeping the record (R24). */
  #writeWindow(record: ActivityWindowRecord) {
    if (this.#sharedWindow && writeWindowRecord(this.#tag, record)) return
    this.#sharedWindow = false
    this.#memoryWindow = record
  }
}
