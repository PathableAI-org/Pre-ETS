---
id: PREETS-ONSITE-001
classifications:
  - Functional
---

# Create a participant-associated record

## Description

A coach must be able to start an on-site job-coaching service record associated with the participant receiving the service, with the current authenticated user captured as the coach and the current time captured as the service start.

## Rationale

Starting with known identity and time reduces paperwork before documenting the visit.

## Sources

- Source: Handoff steps 1–2; Form, consumer information and visit-log date/coach/start fields. Source labels refer to the shared source context linked below.
- Product direction: the handoff supplies the proposed product direction.

## Acceptance criteria

1. A coach can create an on-site record for the participant receiving the service, and the created record identifies that participant.
2. Starting the record captures the current authenticated user as coach and the current date/time as the service start without requiring manual coach or start-time entry.
3. Creation is possible before an end time or any of the four narrative values has been entered.

## Open questions

Participant source and association interaction are unresolved; multiple participants and on-behalf-of creation remain discovery questions.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Verification Plan

Application Gherkin/BDD evidence demonstrates participant-associated creation, automatic capture of the authenticated coach and current start time, and creation without an end time or narratives. The participant-source and association decisions must be resolved before execution; this evidence does not establish participant-management integration beyond the selected scope.

Unresolved verification conditions follow the Open questions and shared context. The plan establishes no executed result or compliance claim.

## Shared context

The [on-site scope, source review, adoption, and delivery gates](../context/on-site-job-coaching.md) qualify this contract.
