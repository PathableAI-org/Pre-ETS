import { describe, expect, it } from "vitest"

import type { SessionRecord } from "../../src/lib/session/types.ts"

import {
  classifyAccessEnd,
  computeIdleExpiresAt,
  endAuthenticatedForInactivity,
  isInactivityClaim,
  stampQualifyingActivity
} from "../../src/lib/session/idle.ts"

function authenticatedIdleRecord(
  overrides: Partial<SessionRecord> = {}
): SessionRecord {
  const lastActivityAt = 1_700_000_000
  const idleDurationMinutes = 30
  const idleExpiresAt = computeIdleExpiresAt(lastActivityAt, idleDurationMinutes)
  return {
    expiresAt: lastActivityAt + 86_400,
    idleDurationMinutes,
    idleExpiresAt,
    lastActivityAt,
    tenantId: "springfield",
    userId: "user-1",
    userName: "Demo User",
    ...overrides
  }
}

describe("session idle helpers", () => {
  describe("computeIdleExpiresAt", () => {
    it("equals lastActivityAt + idleDurationMinutes * 60", () => {
      expect(computeIdleExpiresAt(1_700_000_000, 30)).toBe(1_700_000_000 + 30 * 60)
      expect(computeIdleExpiresAt(1_700_000_000, 5)).toBe(1_700_000_000 + 5 * 60)
      expect(computeIdleExpiresAt(1_700_000_000, 15)).toBe(1_700_000_000 + 900)
    })
  })

  describe("activity must not extend absolute expiresAt", () => {
    it("leaves expiresAt unchanged when stamping qualifying activity", () => {
      const record = authenticatedIdleRecord({
        expiresAt: 1_700_086_400,
        idleDurationMinutes: 10,
        idleExpiresAt: 1_700_000_000 + 600,
        lastActivityAt: 1_700_000_000
      })
      const now = 1_700_000_100
      const renewed = stampQualifyingActivity(record, now)

      expect(renewed.expiresAt).toBe(record.expiresAt)
      expect(renewed.idleDurationMinutes).toBe(record.idleDurationMinutes)
      expect(renewed.lastActivityAt).toBe(now)
      expect(renewed.idleExpiresAt).toBe(computeIdleExpiresAt(now, 10))
      expect(renewed.idleExpiresAt).not.toBe(record.expiresAt)
    })
  })

  describe("classifyAccessEnd", () => {
    it.each([-1, 0, 1])("classifies access at deadline offset %i", (offset) => {
      const deadline = 1_700_001_800
      const idleRecord = authenticatedIdleRecord({ expiresAt: deadline + 100, idleExpiresAt: deadline })
      const absoluteRecord = authenticatedIdleRecord({ expiresAt: deadline, idleExpiresAt: deadline + 100 })
      expect(classifyAccessEnd(deadline + offset, idleRecord)).toBe(offset < 0 ? "still-valid" : "idle")
      expect(classifyAccessEnd(deadline + offset, absoluteRecord)).toBe(offset < 0 ? "still-valid" : "absolute")
    })

    it("missing store is not an inactivity claim", () => {
      const classification = classifyAccessEnd(1_700_000_000, undefined)
      expect(classification).toBe("missing")
      expect(isInactivityClaim(classification)).toBe(false)
    })

    it("authenticated without idle fields is missing (not still-valid)", () => {
      const record: SessionRecord = {
        expiresAt: 1_700_086_400,
        tenantId: "springfield",
        userId: "user-1",
        userName: "Demo User"
      }
      expect(classifyAccessEnd(1_700_000_060, record)).toBe("missing")
      expect(isInactivityClaim(classifyAccessEnd(1_700_000_060, record))).toBe(false)
    })

    it("returns still-valid when now is before both deadlines", () => {
      const record = authenticatedIdleRecord()
      const lastActivityAt = record.lastActivityAt ?? 0
      const now = lastActivityAt + 60
      expect(classifyAccessEnd(now, record)).toBe("still-valid")
      expect(isInactivityClaim(classifyAccessEnd(now, record))).toBe(false)
    })

    it("deadline wins: now >= idleExpiresAt and now < expiresAt → idle", () => {
      const record = authenticatedIdleRecord({
        expiresAt: 1_700_086_400,
        idleExpiresAt: 1_700_001_800
      })
      const now = 1_700_001_800
      expect(classifyAccessEnd(now, record)).toBe("idle")
      expect(isInactivityClaim(classifyAccessEnd(now, record))).toBe(true)
    })

    it("equality pin: idleExpiresAt === expiresAt and now >= that instant → idle", () => {
      const deadline = 1_700_001_800
      const record = authenticatedIdleRecord({
        expiresAt: deadline,
        idleExpiresAt: deadline
      })
      expect(classifyAccessEnd(deadline, record)).toBe("idle")
      expect(classifyAccessEnd(deadline + 5, record)).toBe("idle")
      expect(isInactivityClaim(classifyAccessEnd(deadline, record))).toBe(true)
    })

    it("absolute-only when now >= expiresAt and now < idleExpiresAt", () => {
      const record = authenticatedIdleRecord({
        expiresAt: 1_700_000_500,
        idleExpiresAt: 1_700_001_800
      })
      const now = 1_700_000_500
      const idleExpiresAt = record.idleExpiresAt ?? 0
      expect(now).toBeGreaterThanOrEqual(record.expiresAt)
      expect(now).toBeLessThan(idleExpiresAt)
      expect(classifyAccessEnd(now, record)).toBe("absolute")
      expect(isInactivityClaim(classifyAccessEnd(now, record))).toBe(false)
    })

    it("both past with idleExpiresAt > expiresAt → absolute (not inactivity)", () => {
      const record = authenticatedIdleRecord({
        expiresAt: 1_700_000_500,
        idleExpiresAt: 1_700_001_800
      })
      const now = 1_700_002_000
      expect(classifyAccessEnd(now, record)).toBe("absolute")
      expect(isInactivityClaim(classifyAccessEnd(now, record))).toBe(false)
    })
  })

  describe("endAuthenticatedForInactivity", () => {
    it("clears auth/idle fields, sets inactivity cause, retains expiresAt and generation latch", () => {
      const record = authenticatedIdleRecord({
        expiresAt: 1_700_086_400
      })
      const ended = endAuthenticatedForInactivity(record)

      expect(ended).toEqual({
        accessEndedCause: "inactivity",
        expiresAt: 1_700_086_400,
        sessionEndGeneration: 1,
        tenantId: "springfield"
      })
      expect(ended.userId).toBeUndefined()
      expect(ended.userName).toBeUndefined()
      expect(ended.idleDurationMinutes).toBeUndefined()
      expect(ended.lastActivityAt).toBeUndefined()
      expect(ended.idleExpiresAt).toBeUndefined()
    })

    it("uses an explicit generation when provided", () => {
      const record = authenticatedIdleRecord()
      const ended = endAuthenticatedForInactivity(record, 7)
      expect(ended.sessionEndGeneration).toBe(7)
      expect(ended.expiresAt).toBe(record.expiresAt)
    })

    it("increments an existing sessionEndGeneration when present on the record", () => {
      const withLatch: SessionRecord = {
        ...authenticatedIdleRecord(),
        sessionEndGeneration: 3
      }
      const ended = endAuthenticatedForInactivity(withLatch)
      expect(ended.sessionEndGeneration).toBe(4)
    })
  })
})
