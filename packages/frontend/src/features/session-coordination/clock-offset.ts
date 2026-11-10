/** A tab's estimate of the server clock minus its own clock, and the round trip of the response it came from. */
export interface ClockOffset {
  readonly offset: number
  readonly roundTrip: number
}

/** One response: the server's clock when it built the response, and the local times the request left and it arrived. */
export interface ClockSample {
  readonly receivedAt: number
  readonly sentAt: number
  readonly serverTime: number
}

/**
 * Pure offset estimator (research D6, R29). A sample places the server time at the local midpoint of its round trip, so
 * snapshot age, delivery, and hydration never enter the estimate; only half the round trip remains as uncertainty. The
 * held estimate is replaced by a sample with an equal or smaller round trip, and also by any sample whose uncertainty
 * interval does not overlap the held one, because then the local clock has stepped and the held estimate is stale.
 */
export function calibrateClockOffset(held: ClockOffset | undefined, sample: ClockSample): ClockOffset {
  const roundTrip = Math.max(0, sample.receivedAt - sample.sentAt)
  const candidate = { offset: sample.serverTime - (sample.sentAt + roundTrip / 2), roundTrip }
  if (held === undefined || candidate.roundTrip <= held.roundTrip) return candidate
  const disjoint = Math.abs(candidate.offset - held.offset) > (candidate.roundTrip + held.roundTrip) / 2
  return disjoint ? candidate : held
}
