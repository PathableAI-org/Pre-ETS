import { Duration } from "effect"

/** The one application-wide tolerance on each bound of the B6 freshness window. */
export const FRESHNESS_TOLERANCE = Duration.seconds(30)

/** Where a provider authentication time falls relative to the freshness window, or that it is absent. */
export type FreshnessPosition = "after_window" | "before_window" | "inside" | "missing"

/**
 * B6: the authentication time is fresh when it lies in
 * [transaction start − tolerance, callback time + tolerance], inclusive. The provider's whole-second value is
 * compared as the exact millisecond instant it denotes, so no value outside either bound is admitted.
 */
export const freshnessPosition = (input: {
  readonly authTimeSeconds: number | undefined
  readonly callbackAtMs: number
  readonly startedAtMs: number
}): FreshnessPosition => {
  if (input.authTimeSeconds === undefined) return "missing"
  const tolerance = Duration.toMillis(FRESHNESS_TOLERANCE)
  const authenticatedAtMs = input.authTimeSeconds * 1_000
  if (authenticatedAtMs < input.startedAtMs - tolerance) return "before_window"
  if (authenticatedAtMs > input.callbackAtMs + tolerance) return "after_window"
  return "inside"
}
