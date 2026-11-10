import type { SessionCoordinationSnapshot } from "@pathableai/pre-ets-frontend-services"

/**
 * Pure snapshot ordering (research D6, R16): adopt `next` only when its record revision is higher than `held`'s, for
 * the same tag, whatever the deadlines or timestamps. Equal revisions describe the same stored state. A late status
 * read that observed the record before a renewal is rejected; a newer refresh that shortened the timeout is adopted.
 */
export function adoptSnapshot(
  held: SessionCoordinationSnapshot | undefined,
  next: SessionCoordinationSnapshot
): boolean {
  if (held === undefined) return true
  return next.coordinationTag === held.coordinationTag && next.revision > held.revision
}
