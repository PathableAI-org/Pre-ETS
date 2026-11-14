import type { SessionEndCause } from "@pathableai/pre-ets-frontend-services"

/**
 * The gate's `text/plain` 401 body for a denied fetch Server Action, one closed-set token per cause (#157 research
 * D3). Next's client throws the body as the action's rejection message, so the protected form can tell the gate's
 * cause from any other rejection. Never user-visible copy. Not a client module: the host response reads it too.
 */
export const ACTION_DENIAL_BODY: Readonly<Record<SessionEndCause, string>> = {
  expired: "session-expired",
  unknown: "session-unavailable"
}

/** Each body decodes to its cause. The message is a closed-set key here, never human-readable text. */
const CAUSE_BY_BODY: ReadonlyMap<string, SessionEndCause> = new Map([
  [ACTION_DENIAL_BODY.expired, "expired"],
  [ACTION_DENIAL_BODY.unknown, "unknown"]
])

/**
 * The gate's cause when `error` is a rejection whose message is exactly one denial body; otherwise `undefined`. Next
 * gives the rejection no other field, so the message carries the token (research D3, L-4).
 */
export const readActionDenial = (error: unknown): SessionEndCause | undefined =>
  error instanceof Error ? CAUSE_BY_BODY.get(error.message) : undefined
