/** B5-W window length: measured from the session's most recent in-page activity communication by any tab. */
export const ACTIVITY_WINDOW_MILLISECONDS = 60_000

export type ActivityWindowDecision =
  | { readonly _tag: "Coalesce"; readonly record: ActivityWindowRecord; readonly sendAt: number }
  | { readonly _tag: "SendNow"; readonly record: ActivityWindowRecord }

export interface ActivityWindowRecord {
  readonly coordinationTag: string
  readonly lastCommunicatedAt: number | undefined
  readonly pendingSince: number | undefined
}

/**
 * Pure B5-W decision (research D5). Times are local epoch milliseconds. A record for another session is treated as
 * absent. A window-end flush or a near-deadline check calls this again with the pending record.
 */
export function decideActivityCommunication(
  record: ActivityWindowRecord | undefined,
  input: { readonly coordinationTag: string; readonly deadline: number; readonly now: number }
): ActivityWindowDecision {
  const own = record?.coordinationTag === input.coordinationTag ? record : undefined
  const last = own?.lastCommunicatedAt
  const windowOpen = last !== undefined && input.now - last < ACTIVITY_WINDOW_MILLISECONDS
  const nearDeadline = input.deadline - input.now < ACTIVITY_WINDOW_MILLISECONDS
  if (!windowOpen || nearDeadline) {
    return {
      _tag: "SendNow",
      record: { coordinationTag: input.coordinationTag, lastCommunicatedAt: input.now, pendingSince: undefined }
    }
  }
  return {
    _tag: "Coalesce",
    record: {
      coordinationTag: input.coordinationTag,
      lastCommunicatedAt: last,
      pendingSince: own?.pendingSince ?? input.now
    },
    sendAt: last + ACTIVITY_WINDOW_MILLISECONDS
  }
}
