import { DateTime, Result, Schema } from "effect"
import assert from "node:assert/strict"
import test from "node:test"

import { OnSiteVisit } from "../dist/onsite/visit-schema.js"

const decode = Schema.decodeUnknownSync(OnSiteVisit)

const openVisit = {
  coachId: "synthetic-coach",
  id: "synthetic-visit",
  participantReference: "synthetic-participant",
  startedAt: DateTime.makeUnsafe("2026-10-14T12:00:00Z"),
  tenantId: "synthetic-tenant"
}

test("a participant-associated visit is valid before its end or narratives are recorded", () => {
  const visit = decode(openVisit)

  assert.equal(visit.participantReference, "synthetic-participant")
  assert.equal("endedAt" in visit, false)
  assert.equal("purposeOfVisit" in visit, false)
})

test("an end time and one narrative can be recorded without requiring the others", () => {
  const visit = decode({
    ...openVisit,
    endedAt: DateTime.makeUnsafe("2026-10-14T13:00:00Z"),
    interventions: "Synthetic visit note"
  })

  assert.ok(visit.endedAt)
  assert.equal(visit.interventions, "Synthetic visit note")
  assert.equal("observations" in visit, false)
  assert.equal("nextSteps" in visit, false)
})

test("a visit cannot omit its participant association", () => {
  const missingParticipant = { ...openVisit }
  delete missingParticipant.participantReference

  const result = Schema.decodeUnknownResult(OnSiteVisit)(missingParticipant)
  assert.ok(Result.isFailure(result))
  assert.match(String(result.failure), /participantReference/u)
})
