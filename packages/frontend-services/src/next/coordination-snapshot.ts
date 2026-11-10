import { createHash, timingSafeEqual } from "node:crypto"

import type { UsableSession } from "../session.js"

/** What a tab may know about its usable session. Contains no reference, identity, token, or store key. */
export interface SessionCoordinationSnapshot {
  /** One-way, domain-separated digest of the session reference. Not a credential. */
  readonly coordinationTag: string
  readonly idleDeadlineEpochMilliseconds: number
  /** Redis `TIME` of the atomic store transition that produced this state; diagnostic only, never ordering. */
  readonly observedAtEpochMilliseconds: number
  /** Stored record revision; tabs adopt only a higher revision (research D6). */
  readonly revision: number
  /** Application clock when the response was built; used only to convert the deadline to the tab's clock. */
  readonly serverTimeEpochMilliseconds: number
  readonly warningLeadMinutes: number
}

/** The store key hashes the bare reference; the domain prefix keeps the tag distinct from it. */
const TAG_DOMAIN = "preets:session-coordination:v1\0"

const coordinationTagFor = (reference: string): string =>
  createHash("sha256").update(TAG_DOMAIN).update(reference).digest("base64url")

/** Constant-time comparison of a claimed tag with the tag of `reference`. */
export const isCoordinationTagOf = (reference: string, claimed: string): boolean => {
  const expected = Buffer.from(coordinationTagFor(reference))
  const candidate = Buffer.from(claimed)
  return expected.length === candidate.length && timingSafeEqual(expected, candidate)
}

/** The snapshot for a usable session read with `reference`. A dependency leaf: the read and the handlers share it. */
export const coordinationSnapshot = (
  reference: string,
  session: UsableSession,
  serverTimeEpochMilliseconds: number
): SessionCoordinationSnapshot => ({
  coordinationTag: coordinationTagFor(reference),
  idleDeadlineEpochMilliseconds: session.idleDeadlineEpochMilliseconds,
  observedAtEpochMilliseconds: session.observedAtEpochMilliseconds,
  revision: session.revision,
  serverTimeEpochMilliseconds,
  warningLeadMinutes: session.warningLeadMinutes
})
