import type { InPageSessionActivity } from "@pathableai/pre-ets-frontend-services"

import type { ActivityWindowRecord } from "./activity-window.ts"

import { IN_PAGE_ACTIVITIES } from "./activity-classification.ts"

const CHANNEL = "preets-session-coordination"
const RECORD_KEY = "preets-session-activity:v1"
const LOCK = "preets-session-activity"

export interface TabChannel {
  readonly close: () => void
  readonly post: (message: TabMessage) => void
}

/**
 * Messages between tabs of one origin and storage partition. Each carries only the coordination tag, times, and the
 * warning lead or activity kind; never protected content, identity, or the session reference.
 */
export type TabMessage =
  | {
    readonly activity: InPageSessionActivity
    readonly coordinationTag: string
    readonly sendAt: number
    readonly type: "pending"
  }
  | { readonly coordinationTag: string; readonly type: "logged-out" }
  | {
    readonly coordinationTag: string
    readonly localDeadline: number
    readonly type: "renewed"
    readonly warningLeadMinutes: number
  }

type UnknownRecord = Readonly<Record<string, unknown>>

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null
const isTime = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const isOptionalTime = (value: unknown): value is number | undefined => value === undefined || isTime(value)
const isActivity = (value: unknown): value is InPageSessionActivity =>
  typeof value === "string" && IN_PAGE_ACTIVITIES.has(value)

const pendingMessage = (data: UnknownRecord, coordinationTag: string): TabMessage | undefined =>
  isTime(data.sendAt) && isActivity(data.activity) ?
    { activity: data.activity, coordinationTag, sendAt: data.sendAt, type: "pending" } :
    undefined

const renewedMessage = (data: UnknownRecord, coordinationTag: string): TabMessage | undefined =>
  isTime(data.localDeadline) && isTime(data.warningLeadMinutes) ?
    {
      coordinationTag,
      localDeadline: data.localDeadline,
      type: "renewed",
      warningLeadMinutes: data.warningLeadMinutes
    } :
    undefined

/** Malformed messages are ignored. */
const parseMessage = (data: unknown): TabMessage | undefined => {
  if (!isRecord(data) || typeof data.coordinationTag !== "string") return undefined
  switch (data.type) {
    case "logged-out":
      return { coordinationTag: data.coordinationTag, type: "logged-out" }
    case "pending":
      return pendingMessage(data, data.coordinationTag)
    case "renewed":
      return renewedMessage(data, data.coordinationTag)
    default:
      return undefined
  }
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

/** The shared B5-W record. Unavailable storage or a malformed value reads as absent. */
export const readWindowRecord = (): ActivityWindowRecord | undefined => {
  try {
    const raw = localStorage.getItem(RECORD_KEY)
    const value: unknown = raw === null ? undefined : JSON.parse(raw)
    if (!isRecord(value) || typeof value.coordinationTag !== "string") return undefined
    const { lastCommunicatedAt, pendingSince } = value
    if (!isOptionalTime(lastCommunicatedAt) || !isOptionalTime(pendingSince)) return undefined
    return { coordinationTag: value.coordinationTag, lastCommunicatedAt, pendingSince }
  } catch {
    return undefined
  }
}

export const writeWindowRecord = (record: ActivityWindowRecord): void => {
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(record))
  } catch {
    // Unavailable storage leaves each tab deciding alone; it never delays a communication.
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
