import { DateTime } from "effect"
import { TestSchema } from "effect/testing"
import { describe, it } from "vitest"

import { OnSiteVisit } from "../src/index.ts"

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
