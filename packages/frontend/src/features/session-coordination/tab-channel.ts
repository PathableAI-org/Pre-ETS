import type { InPageSessionActivity } from "@pathableai/pre-ets-frontend-services"

import type { ActivityWindowRecord } from "./activity-window.ts"

import { recordTabMessageReceipt, recordTabMessageSend, type TabMessageKind } from "../../shared/browser-tracing.ts"
import { IN_PAGE_ACTIVITIES } from "./activity-classification.ts"

const CHANNEL = "preets-session-coordination"
export const CURRENT_KEY = "preets-session-current:v1"
const ENDED_PREFIX = "preets-session-ended:v1:"
const RECORD_PREFIX = "preets-session-activity:v1:"
const PENDING_LOGOUT_PREFIX = "preets-session-logout-pending:v1:"
const LOCK = "preets-session-activity"
/** Ended markers older than this are pruned (R33). */
const ENDED_MARKER_LIFETIME_MILLISECONDS = 24 * 60 * 60_000
/** Window records kept for tags other than this tab's and the current hint's. */
const OTHER_WINDOW_RECORDS_KEPT = 4

export interface TabChannel {
  readonly close: () => void
  readonly post: (message: TabMessage) => void
}

/**
 * Messages between tabs of one origin and storage partition (data-model "Channel messages"). Each carries only the
 * coordination tag, times, and the warning lead or activity kind; never protected content, identity, or the reference.
 */
export type TabMessage =
  | {
    /** A definitive refusal, or a usable status after `notAfter`, for this attempt (R22, R26). */
    readonly attemptId: string
    readonly coordinationTag: string
    readonly type: "logout-failed"
  }
  | {
    /** Storage or locks unavailable: a tab sent an in-page communication at local time `at` (R24). */
    readonly at: number
    readonly coordinationTag: string
    readonly type: "communicated"
  }
  | {
    readonly activity: InPageSessionActivity
    readonly coordinationTag: string
    readonly sendAt: number
    readonly type: "pending"
  }
  | {
    readonly attemptId: string
    readonly coordinationTag: string
    /** The attempt's server-clock cutoff; receivers watch until it plus 3 s (R21, R26, R27). */
    readonly notAfter: number
    readonly type: "logout-started"
  }
  | {
    readonly coordinationTag: string
    /** `window-query`: storage or locks unavailable and a tab joined; tabs answer with `communicated` (R37). */
    readonly type: "logged-out" | "session-current" | "window-query"
  }
  | {
    readonly coordinationTag: string
    /** On the server clock; each receiving tab converts it with its own offset (R29). */
    readonly idleDeadlineEpochMilliseconds: number
    readonly observedAtEpochMilliseconds: number
    readonly revision: number
    readonly type: "renewed"
    readonly warningLeadMinutes: number
  }

type UnknownRecord = Readonly<Record<string, unknown>>

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null
const isTime = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const isOptionalTime = (value: unknown): value is number | undefined => value === undefined || isTime(value)
const isActivity = (value: unknown): value is InPageSessionActivity =>
  typeof value === "string" && IN_PAGE_ACTIVITIES.has(value)

const SIGNALS: ReadonlySet<unknown> = new Set(["logged-out", "session-current", "window-query"])

const pendingMessage = (data: UnknownRecord, coordinationTag: string): TabMessage | undefined =>
  isTime(data.sendAt) && isActivity(data.activity) ?
    { activity: data.activity, coordinationTag, sendAt: data.sendAt, type: "pending" } :
    undefined

const renewedMessage = (data: UnknownRecord, coordinationTag: string): TabMessage | undefined => {
  const { idleDeadlineEpochMilliseconds, observedAtEpochMilliseconds, revision, warningLeadMinutes } = data
  const times = [idleDeadlineEpochMilliseconds, observedAtEpochMilliseconds, revision, warningLeadMinutes]
  if (!times.every(isTime)) return undefined
  return {
    coordinationTag,
    idleDeadlineEpochMilliseconds: Number(idleDeadlineEpochMilliseconds),
    observedAtEpochMilliseconds: Number(observedAtEpochMilliseconds),
    revision: Number(revision),
    type: "renewed",
    warningLeadMinutes: Number(warningLeadMinutes)
  }
}

const signalMessage = (data: UnknownRecord, coordinationTag: string): TabMessage | undefined =>
  SIGNALS.has(data.type) ? { coordinationTag, type: data.type as "logged-out" } : undefined

const communicatedMessage = (data: UnknownRecord, coordinationTag: string): TabMessage | undefined =>
  isTime(data.at) ? { at: data.at, coordinationTag, type: "communicated" } : undefined

const logoutStartedMessage = (data: UnknownRecord, coordinationTag: string): TabMessage | undefined =>
  isTime(data.notAfter) && typeof data.attemptId === "string" ?
    { attemptId: data.attemptId, coordinationTag, notAfter: data.notAfter, type: "logout-started" } :
    undefined

const logoutFailedMessage = (data: UnknownRecord, coordinationTag: string): TabMessage | undefined =>
  typeof data.attemptId === "string" ? { attemptId: data.attemptId, coordinationTag, type: "logout-failed" } : undefined

const PARSERS: Readonly<Record<string, (data: UnknownRecord, coordinationTag: string) => TabMessage | undefined>> = {
  communicated: communicatedMessage,
  "logout-failed": logoutFailedMessage,
  "logout-started": logoutStartedMessage,
  pending: pendingMessage,
  renewed: renewedMessage
}

/** The closed-set telemetry kind of each message type (telemetry contract). */
const TELEMETRY_KINDS: Readonly<Record<TabMessage["type"], TabMessageKind>> = {
  communicated: "communicated",
  "logged-out": "logged_out",
  "logout-failed": "logout_failed",
  "logout-started": "logout_started",
  pending: "pending",
  renewed: "renewed",
  "session-current": "session_current",
  "window-query": "window_query"
}

/** Malformed messages are ignored, and so is the telemetry-only `telemetryId` field (research D8). */
const parseMessage = (data: unknown): TabMessage | undefined => {
  if (!isRecord(data) || typeof data.coordinationTag !== "string") return undefined
  const parse = typeof data.type === "string" ? PARSERS[data.type] ?? signalMessage : signalMessage
  return parse(data, data.coordinationTag)
}

const silentChannel: TabChannel = { close: () => undefined, post: () => undefined }

/**
 * Each well-formed receipt is recorded and `receive` runs in its scope, so a transition it causes is its child. Each
 * send is recorded and, while tracing runs, carries the send's telemetry-only `telemetryId` (research D8).
 */
export const openTabChannel = (receive: (message: TabMessage) => void): TabChannel => {
  if (typeof BroadcastChannel === "undefined") return silentChannel
  const channel = new BroadcastChannel(CHANNEL)
  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    const message = parseMessage(event.data)
    if (message === undefined) return
    const telemetryId = isRecord(event.data) ? event.data.telemetryId : undefined
    recordTabMessageReceipt(TELEMETRY_KINDS[message.type], telemetryId).run(() => {
      receive(message)
    })
  })
  return {
    close: () => {
      channel.close()
    },
    post: (message) => {
      const telemetryId = recordTabMessageSend(TELEMETRY_KINDS[message.type])
      channel.postMessage(telemetryId === undefined ? message : { ...message, telemetryId })
    }
  }
}

/** Unavailable storage or a malformed value reads as absent. */
const readJson = (key: string): unknown => {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}

/**
 * Unavailable storage leaves each tab deciding alone; it never delays a communication or claims a session. Answers
 * whether the value was stored.
 */
const writeJson = (key: string, value: unknown): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // Storage is advisory; the server stays the authority.
    return false
  }
}

const parseWindowRecord = (value: unknown): ActivityWindowRecord | undefined => {
  if (!isRecord(value)) return undefined
  const { lastCommunicatedAt, pendingLatest, pendingSince } = value
  if (!isOptionalTime(lastCommunicatedAt) || !isOptionalTime(pendingLatest)) return undefined
  return isOptionalTime(pendingSince) ? { lastCommunicatedAt, pendingLatest, pendingSince } : undefined
}

/** This session's B5-W record; another session's record is never read (R20). */
export const readWindowRecord = (coordinationTag: string): ActivityWindowRecord | undefined =>
  parseWindowRecord(readJson(`${RECORD_PREFIX}${coordinationTag}`))

const lastTouched = (record: ActivityWindowRecord | undefined) =>
  Math.max(record?.lastCommunicatedAt ?? 0, record?.pendingSince ?? 0)

/** Keeps this tab's and the hint's records and the most recently touched others, at most four of them. */
const pruneWindowRecords = (keep: ReadonlySet<string>) => {
  try {
    const others = Object.keys(localStorage)
      .filter((key) => key.startsWith(RECORD_PREFIX) && !keep.has(key))
      .map((key) => ({ key, touched: lastTouched(parseWindowRecord(readJson(key))) }))
      .sort((left, right) => right.touched - left.touched)
    for (const { key } of others.slice(OTHER_WINDOW_RECORDS_KEPT)) localStorage.removeItem(key)
  } catch {
    // Storage is advisory.
  }
}

/** Writes only this session's record, under the cross-tab window lock. Answers whether it was stored. */
export const writeWindowRecord = (coordinationTag: string, record: ActivityWindowRecord): boolean => {
  const key = `${RECORD_PREFIX}${coordinationTag}`
  if (!writeJson(key, record)) return false
  pruneWindowRecords(new Set([`${RECORD_PREFIX}${readCurrentHint() ?? coordinationTag}`, key]))
  return true
}

/** The current-session hint: the tag of the most recently mounted protected document. A hint, never proof (R14). */
export const readCurrentHint = (): string | undefined => {
  const value = readJson(CURRENT_KEY)
  return isRecord(value) && typeof value.coordinationTag === "string" ? value.coordinationTag : undefined
}

/** Answers whether the hint was stored; a tab that cannot store it keeps the confirmed tag in memory (R19). */
export const writeCurrentHint = (coordinationTag: string): boolean => writeJson(CURRENT_KEY, { coordinationTag })

/** One marker per ended tag, so concurrent writers never overwrite one another (R3, R33). */
export const endedKey = (coordinationTag: string): string => `${ENDED_PREFIX}${coordinationTag}`

/**
 * Why a session ended, as recorded by the tab that confirmed it: `expired` after confirmed expiry, `ended` after a
 * logout or any other confirmed end (#157 research D9).
 */
export type EndedCause = "ended" | "expired"

/**
 * The recorded cause when the tag is confirmed ended, so a tab that missed the broadcast can replay it (R3). A record
 * without a cause, written by an older tab, reads as `ended`.
 */
export const readEnded = (coordinationTag: string): EndedCause | undefined => {
  const value = readJson(endedKey(coordinationTag))
  if (!isRecord(value) || !isTime(value.endedAt)) return undefined
  return value.cause === "expired" ? "expired" : "ended"
}

const pruneEndedMarkers = (now: number) => {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(ENDED_PREFIX)) continue
      const value = readJson(key)
      const endedAt = isRecord(value) && isTime(value.endedAt) ? value.endedAt : Number.NEGATIVE_INFINITY
      if (now - endedAt > ENDED_MARKER_LIFETIME_MILLISECONDS) localStorage.removeItem(key)
    }
  } catch {
    // Storage is advisory.
  }
}

/** Written only after the server answered that the session ended, never on a local deadline alone (FR-010). */
export const recordEnded = (coordinationTag: string, cause: EndedCause): void => {
  const now = Date.now()
  writeJson(endedKey(coordinationTag), { cause, endedAt: now })
  pruneEndedMarkers(now)
}

/** One unresolved logout attempt of a tag; `notAfter` is its server-clock cutoff (research D8, R26, R30). */
export interface PendingLogout {
  readonly attemptId: string
  readonly notAfter: number
}

/** One key per attempt, so concurrent writers never overwrite one another (R30). */
const pendingLogoutPrefix = (coordinationTag: string) => `${PENDING_LOGOUT_PREFIX}${coordinationTag}:`

/** Unresolved attempts of a tag. An attempt triggers confirmation only; it never ends a tab by itself (R28). */
export const pendingLogouts = (coordinationTag: string): readonly PendingLogout[] => {
  const prefix = pendingLogoutPrefix(coordinationTag)
  try {
    return Object.keys(localStorage).flatMap((key) => {
      const value = key.startsWith(prefix) ? readJson(key) : undefined
      return isRecord(value) && isTime(value.notAfter) ?
        [{ attemptId: key.slice(prefix.length), notAfter: value.notAfter }] :
        []
    })
  } catch {
    return []
  }
}

/** Written before the logout request is sent, so a tab that mounts or resumes meanwhile can watch it. */
export const addPendingLogout = (coordinationTag: string, attempt: PendingLogout): void => {
  writeJson(`${pendingLogoutPrefix(coordinationTag)}${attempt.attemptId}`, { notAfter: attempt.notAfter })
}

/** Deleted when the attempt resolves. */
export const removePendingLogout = (coordinationTag: string, attemptId: string): void => {
  try {
    localStorage.removeItem(`${pendingLogoutPrefix(coordinationTag)}${attemptId}`)
  } catch {
    // Storage is advisory.
  }
}

/** Whether `localStorage` can be written and read back; otherwise windows are kept in memory (R24). */
export const storageAvailable = (): boolean => {
  try {
    const probe = `${RECORD_PREFIX}probe`
    localStorage.setItem(probe, "1")
    localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/** Runs `task` under the cross-tab window lock, or answers `undefined` where Web Locks are unavailable. */
export const windowLock = (): ((task: () => void) => Promise<void>) | undefined => {
  if (typeof navigator === "undefined" || !("locks" in navigator)) return undefined
  const { locks } = navigator
  return (task) =>
    locks.request(LOCK, () => {
      task()
    })
}
