import type { SessionCoordinationSnapshot } from "@pathableai/pre-ets-frontend-services"

/**
 * Pure snapshot ordering (research D6, R6, R13): adopt `next` only when its store observation is later than `held`'s,
 * whatever the deadlines. A late status read that observed the record before a renewal is rejected; a newer refresh
 * that shortened the timeout is adopted.
 */
export function adoptSnapshot(
  held: SessionCoordinationSnapshot | undefined,
  next: SessionCoordinationSnapshot
): boolean {
  return held === undefined || next.observedAtEpochMilliseconds > held.observedAtEpochMilliseconds
}
