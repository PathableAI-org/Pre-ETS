import type { SessionRecord } from "./types.ts"

/** Inclusive minimum idle duration (whole minutes). */
export const MIN_IDLE_DURATION_MINUTES = 5
/** Inclusive maximum idle duration (whole minutes). */
export const MAX_IDLE_DURATION_MINUTES = 30
/** Effective idle duration when tenant omits `idleTimeoutMinutes`. */
export const DEFAULT_IDLE_DURATION_MINUTES = 30

export type AccessEndClassification =
  | "absolute"
  | "idle"
  | "missing"
  | "still-valid"

/**
 * Classify whether authenticated access remains valid, ended for idle, ended for absolute
 * expiry, or the store is missing (missing ≠ inactivity claim).
 *
 * Equality pin: when `idleExpiresAt === expiresAt` and `now >=` that instant → `"idle"`.
 * Absolute-only when `now >= expiresAt` and `now < idleExpiresAt`.
 * Authenticated records without idle fields are `"missing"` (force reauth) — never
 * `"still-valid"` — so setup reuse cannot disagree with later idle enforcement.
 */
export function classifyAccessEnd(
  now: number,
  record: SessionRecord | undefined
): AccessEndClassification {
  if (record === undefined) {
    return "missing"
  }

  const idleExpiresAt = record.idleExpiresAt
  const expiresAt = record.expiresAt

  if (record.userId === undefined) {
    if (isAbsoluteDeadlineElapsed(now, expiresAt)) {
      return "absolute"
    }
    return "still-valid"
  }

  if (idleExpiresAt === undefined) {
    return "missing"
  }

  if (!isIdleDeadlineElapsed(now, idleExpiresAt) && !isAbsoluteDeadlineElapsed(now, expiresAt)) {
    return "still-valid"
  }

  // Idle binds when the idle deadline has elapsed and idleExpiresAt <= expiresAt
  // (covers idle-first and the equality pin when both deadlines share an instant).
  if (isIdleDeadlineElapsed(now, idleExpiresAt) && idleExpiresAt <= expiresAt) {
    return "idle"
  }

  if (isAbsoluteDeadlineElapsed(now, expiresAt)) {
    return "absolute"
  }

  return "still-valid"
}

/**
 * Authoritative idle deadline: `lastActivityAt + idleDurationMinutes * 60` (Unix seconds).
 */
export function computeIdleExpiresAt(
  lastActivityAt: number,
  idleDurationMinutes: number
): number {
  return lastActivityAt + idleDurationMinutes * 60
}

/**
 * Shape an anonymous end-for-inactivity record: clear auth/idle fields, set
 * `accessEndedCause: "inactivity"`, retain the same absolute `expiresAt`, and set/increment
 * `sessionEndGeneration` (latch retained until that `expiresAt`).
 */
export function endAuthenticatedForInactivity(
  record: SessionRecord,
  generation?: number
): SessionRecord {
  const sessionEndGeneration = generation
    ?? ((record.sessionEndGeneration ?? 0) + 1)

  return {
    accessEndedCause: "inactivity",
    expiresAt: record.expiresAt,
    sessionEndGeneration,
    tenantId: record.tenantId
  }
}

export function isAbsoluteDeadlineElapsed(now: number, expiresAt: number): boolean {
  return now >= expiresAt
}

export function isIdleDeadlineElapsed(now: number, idleExpiresAt: number): boolean {
  return now >= idleExpiresAt
}

/** True only when classification is confirmed idle clearance — not missing/absolute. */
export function isInactivityClaim(classification: AccessEndClassification): boolean {
  return classification === "idle"
}

/**
 * Stamp qualifying activity: refresh idle fields from `now` without extending absolute
 * `expiresAt` or changing `idleDurationMinutes`.
 */
export function stampQualifyingActivity(
  record: SessionRecord,
  now: number
): SessionRecord {
  const idleDurationMinutes = record.idleDurationMinutes
  if (idleDurationMinutes === undefined) {
    return record
  }

  return {
    ...record,
    idleExpiresAt: computeIdleExpiresAt(now, idleDurationMinutes),
    lastActivityAt: now
  }
}
