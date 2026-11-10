/** B5-W window length: measured from the session's most recent in-page activity communication by any tab. */
export const ACTIVITY_WINDOW_MILLISECONDS = 60_000

export type ActivityFlushDecision =
  | { readonly _tag: "Nothing" }
  | { readonly _tag: "Reschedule"; readonly sendAt: number }
  | { readonly _tag: "Send"; readonly record: ActivityWindowRecord }

export type ActivityWindowDecision =
  | { readonly _tag: "Coalesce"; readonly record: ActivityWindowRecord; readonly sendAt: number }
  | { readonly _tag: "SendNow"; readonly record: ActivityWindowRecord }

/** One session's window record, stored under that session's tag so a stale tab never writes another's (R20). */
export interface ActivityWindowRecord {
  readonly lastCommunicatedAt: number | undefined
  readonly pendingSince: number | undefined
}

/**
 * Pure B5-W decision (research D5). Times are local epoch milliseconds. A window-end flush or a near-deadline check
 * calls this again with the pending record.
 */
export function decideActivityCommunication(
  record: ActivityWindowRecord | undefined,
  input: { readonly deadline: number; readonly now: number }
): ActivityWindowDecision {
  const last = record?.lastCommunicatedAt
  const windowOpen = last !== undefined && input.now - last < ACTIVITY_WINDOW_MILLISECONDS
  const nearDeadline = input.deadline - input.now < ACTIVITY_WINDOW_MILLISECONDS
  if (!windowOpen || nearDeadline) {
    return { _tag: "SendNow", record: { lastCommunicatedAt: input.now, pendingSince: undefined } }
  }
  return {
    _tag: "Coalesce",
    record: { lastCommunicatedAt: last, pendingSince: record?.pendingSince ?? input.now },
    sendAt: last + ACTIVITY_WINDOW_MILLISECONDS
  }
}

/**
 * Window-end flush under the lock on this tag's record (research D5, R8): sends only with pending activity once the
 * current window is due. A timer that fires for a window a later communication moved reschedules instead.
 */
export function flushActivityCommunication(
  record: ActivityWindowRecord | undefined,
  input: { readonly now: number }
): ActivityFlushDecision {
  if (record?.pendingSince === undefined) return { _tag: "Nothing" }
  const due = (record.lastCommunicatedAt ?? Number.NEGATIVE_INFINITY) + ACTIVITY_WINDOW_MILLISECONDS
  if (input.now < due) return { _tag: "Reschedule", sendAt: due }
  return { _tag: "Send", record: { lastCommunicatedAt: input.now, pendingSince: undefined } }
}
