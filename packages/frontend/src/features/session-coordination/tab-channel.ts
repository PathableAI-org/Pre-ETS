import type { InPageSessionActivity } from "@pathableai/pre-ets-frontend-services"

import type { ActivityWindowRecord } from "./activity-window.ts"

import { IN_PAGE_ACTIVITIES } from "./activity-classification.ts"

const CHANNEL = "preets-session-coordination"
export const CURRENT_KEY = "preets-session-current:v1"
export const ENDED_KEY = "preets-session-ended:v1"
const RECORD_PREFIX = "preets-session-activity:v1:"
const LOGOUT_KEY = "preets-session-logout:v1"
const LOCK = "preets-session-activity"
const ENDED_TAGS_KEPT = 8
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
    readonly activity: InPageSessionActivity
    readonly coordinationTag: string
    readonly sendAt: number
    readonly type: "pending"
  }
  | { readonly at: number; readonly coordinationTag: string; readonly type: "communicated" }
  | { readonly coordinationTag: string; readonly notAfter: number; readonly type: "logout-started" }
  /** Storage or locks unavailable: a tab sent an in-page communication at local time `at` (R24). */
  | {
    readonly coordinationTag: string
    readonly localDeadline: number
    readonly observedAtEpochMilliseconds: number
    readonly revision: number
    readonly type: "renewed"
    readonly warningLeadMinutes: number
  }
  /** `notAfter` is the attempt's server-clock limit; receivers watch until it plus 2 s (R21). */
  | {
    readonly coordinationTag: string
    readonly type: "logged-out" | "logout-failed" | "session-current"
  }

type UnknownRecord = Readonly<Record<string, unknown>>

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null
const isTime = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const isOptionalTime = (value: unknown): value is number | undefined => value === undefined || isTime(value)
const isActivity = (value: unknown): value is InPageSessionActivity =>
  typeof value === "string" && IN_PAGE_ACTIVITIES.has(value)

const SIGNALS: ReadonlySet<unknown> = new Set(["logged-out", "logout-failed", "session-current"])

const pendingMessage = (data: UnknownRecord, coordinationTag: string): TabMessage | undefined =>
  isTime(data.sendAt) && isActivity(data.activity) ?
    { activity: data.activity, coordinationTag, sendAt: data.sendAt, type: "pending" } :
    undefined

const renewedMessage = (data: UnknownRecord, coordinationTag: string): TabMessage | undefined => {
  const { localDeadline, observedAtEpochMilliseconds, revision, warningLeadMinutes } = data
  const times = [localDeadline, observedAtEpochMilliseconds, revision, warningLeadMinutes]
  if (!times.every(isTime)) return undefined
  return {
    coordinationTag,
    localDeadline: Number(localDeadline),
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
  isTime(data.notAfter) ? { coordinationTag, notAfter: data.notAfter, type: "logout-started" } : undefined

const PARSERS: Readonly<Record<string, (data: UnknownRecord, coordinationTag: string) => TabMessage | undefined>> = {
  communicated: communicatedMessage,
  "logout-started": logoutStartedMessage,
  pending: pendingMessage,
  renewed: renewedMessage
}

/** Malformed messages are ignored. */
const parseMessage = (data: unknown): TabMessage | undefined => {
  if (!isRecord(data) || typeof data.coordinationTag !== "string") return undefined
  const parse = typeof data.type === "string" ? PARSERS[data.type] ?? signalMessage : signalMessage
  return parse(data, data.coordinationTag)
}

const silentChannel: TabChannel = { close: () => undefined, post: () => undefined }

export const openTabChannel = (receive: (message: TabMessage) => void): TabChannel => {
  if (typeof BroadcastChannel === "undefined") return silentChannel
  const channel = new BroadcastChannel(CHANNEL)
  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    const message = parseMessage(event.data)
    if (message !== undefined) receive(message)
  })
  return {
    close: () => {
      channel.close()
    },
    post: (message) => {
      channel.postMessage(message)
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
  const { lastCommunicatedAt, pendingSince } = value
  if (!isOptionalTime(lastCommunicatedAt) || !isOptionalTime(pendingSince)) return undefined
  return { lastCommunicatedAt, pendingSince }
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

/** Writes only this session's record, under the cross-tab window lock. */
export const writeWindowRecord = (coordinationTag: string, record: ActivityWindowRecord): void => {
  const key = `${RECORD_PREFIX}${coordinationTag}`
  if (!writeJson(key, record)) return
  pruneWindowRecords(new Set([`${RECORD_PREFIX}${readCurrentHint() ?? coordinationTag}`, key]))
}

/** The current-session hint: the tag of the most recently mounted protected document. A hint, never proof (R14). */
export const readCurrentHint = (): string | undefined => {
  const value = readJson(CURRENT_KEY)
  return isRecord(value) && typeof value.coordinationTag === "string" ? value.coordinationTag : undefined
}

/** Answers whether the hint was stored; a tab that cannot store it keeps the confirmed tag in memory (R19). */
export const writeCurrentHint = (coordinationTag: string): boolean => writeJson(CURRENT_KEY, { coordinationTag })

/** Tags of sessions confirmed ended, newest first, so a tab that missed the broadcast can replay it (R3). */
export const readEndedTags = (): readonly string[] => {
  const value = readJson(ENDED_KEY)
  if (!isRecord(value) || !Array.isArray(value.coordinationTags)) return []
  return value.coordinationTags.filter((tag): tag is string => typeof tag === "string")
}

export const recordEnded = (coordinationTag: string): void => {
  const others = readEndedTags().filter((tag) => tag !== coordinationTag)
  writeJson(ENDED_KEY, { coordinationTags: [coordinationTag, ...others].slice(0, ENDED_TAGS_KEPT) })
}

/**
 * Logout in progress for a tag, until a time: a tab that mounts or resumes after `logout-started` replays the
 * confirmation watch from it. It triggers confirmation only; it never establishes that logout succeeded.
 */
export const readLogoutInProgress = (coordinationTag: string): number | undefined => {
  const value = readJson(LOGOUT_KEY)
  return isRecord(value) && value.coordinationTag === coordinationTag && isTime(value.until) ? value.until : undefined
}

export const recordLogoutInProgress = (coordinationTag: string, until: number): void => {
  writeJson(LOGOUT_KEY, { coordinationTag, until })
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
