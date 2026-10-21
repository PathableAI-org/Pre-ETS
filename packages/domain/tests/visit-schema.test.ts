import { DateTime, Schema } from "effect"
import { TestSchema } from "effect/testing"
import { describe, expect, it } from "vitest"

import { CreateOnSiteVisit, OnSiteVisit } from "../src/index.ts"

const decoding = new TestSchema.Asserts(OnSiteVisit).decoding()

const openVisit = {
  coachId: "synthetic-coach",
  id: "synthetic-visit",
  participantReference: "synthetic-participant",
  startedAt: DateTime.makeUnsafe("2026-10-14T12:00:00Z"),
  tenantId: "synthetic-tenant"
}

describe("OnSiteVisit", () => {
  it("accepts a participant-associated visit before end or narratives", async () => {
    await decoding.succeed(openVisit)
  })

  it("accepts an end and one narrative without requiring the others", async () => {
    await decoding.succeed({
      ...openVisit,
      endedAt: DateTime.makeUnsafe("2026-10-14T13:00:00Z"),
      interventions: "Synthetic visit note"
    })
  })

  it("rejects a visit without participant association", async () => {
    const missingParticipant: Omit<typeof openVisit, "participantReference"> = {
      coachId: openVisit.coachId,
      id: openVisit.id,
      startedAt: openVisit.startedAt,
      tenantId: openVisit.tenantId
    }

    await decoding.fail(missingParticipant, "Missing key\n  at [\"participantReference\"]")
  })
})

describe("CreateOnSiteVisit", () => {
  it("decodes UTC create input without a generated id or optional fields", () => {
    const visit = Schema.decodeUnknownSync(CreateOnSiteVisit)({
      coachId: "synthetic-coach",
      participantRef: "synthetic-participant",
      startedAt: "2026-10-21T12:00:00Z",
      tenantId: "synthetic-tenant"
    })

    expect(DateTime.formatIso(visit.startedAt)).toBe("2026-10-21T12:00:00.000Z")
    expect("id" in visit).toBe(false)
    expect("endedAt" in visit).toBe(false)
    expect("observations" in visit).toBe(false)
  })

  it("retains independent optional values, including an empty narrative", () => {
    const visit = Schema.decodeUnknownSync(CreateOnSiteVisit)({
      coachId: "synthetic-coach",
      endedAt: "2026-10-21T13:00:00Z",
      observations: "",
      participantRef: "synthetic-participant",
      startedAt: "2026-10-21T12:00:00Z",
      tenantId: "synthetic-tenant"
    })

    expect(visit.endedAt && DateTime.formatIso(visit.endedAt)).toBe("2026-10-21T13:00:00.000Z")
    expect(visit.observations).toBe("")
    expect("interventions" in visit).toBe(false)
  })
})
