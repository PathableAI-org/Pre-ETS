import { Schema } from "effect"

const VisitId = Schema.NonEmptyString.pipe(Schema.brand("@pathableai/pre-ets-backend/OnSiteVisit/Id"))
const TenantId = Schema.NonEmptyString.pipe(Schema.brand("@pathableai/pre-ets-backend/OnSiteVisit/TenantId"))
const ParticipantReference = Schema.NonEmptyString.pipe(
  Schema.brand("@pathableai/pre-ets-backend/OnSiteVisit/ParticipantReference")
)
const CoachId = Schema.NonEmptyString.pipe(Schema.brand("@pathableai/pre-ets-backend/OnSiteVisit/CoachId"))

/**
 * A single on-site service visit, not a monthly report or a create-request payload.
 * References are opaque until their authoritative sources and authorization rules
 * are selected. Times are instants; correction and ordering policy is separate.
 */
export const OnSiteVisit = Schema.Struct({
  coachId: CoachId,
  endedAt: Schema.optionalKey(Schema.DateTimeUtc),
  id: VisitId,
  interventions: Schema.optionalKey(Schema.String),
  nextSteps: Schema.optionalKey(Schema.String),
  observations: Schema.optionalKey(Schema.String),
  participantReference: ParticipantReference,
  purposeOfVisit: Schema.optionalKey(Schema.String),
  startedAt: Schema.DateTimeUtc,
  tenantId: TenantId
})
