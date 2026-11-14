import type { SessionCoordinationSnapshot } from "@pathableai/pre-ets-frontend-services"

const MINUTE_MILLISECONDS = 60_000

/**
 * The server-clock time the warning period starts: the deadline minus the lead (#156 research D2). A lead of 0 has no
 * warning, so no threshold.
 */
export const warningThreshold = (
  snapshot: Pick<SessionCoordinationSnapshot, "idleDeadlineEpochMilliseconds" | "warningLeadMinutes">
): number | undefined =>
  snapshot.warningLeadMinutes > 0 ?
    snapshot.idleDeadlineEpochMilliseconds - snapshot.warningLeadMinutes * MINUTE_MILLISECONDS :
    undefined

/**
 * True when the lead is positive and `serverTime` is at or after the threshold and before the deadline. Only the
 * deadline and the lead adopted with it are read.
 */
export const inWarningPeriod = (
  snapshot: Pick<SessionCoordinationSnapshot, "idleDeadlineEpochMilliseconds" | "warningLeadMinutes">,
  serverTime: number
): boolean => {
  const threshold = warningThreshold(snapshot)
  return threshold !== undefined && serverTime >= threshold && serverTime < snapshot.idleDeadlineEpochMilliseconds
}
