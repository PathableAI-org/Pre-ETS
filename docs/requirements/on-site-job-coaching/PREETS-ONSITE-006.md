---
id: PREETS-ONSITE-006
classifications:
  - Functional
---

# Update an existing record without approval gates

## Description

A coach must be able to reopen their own non-deleted on-site service record and update its service times and optional narratives without a submission or approval lifecycle.

## Rationale

The service record can be corrected as understanding develops without importing monthly-report governance.

## Sources

- Source: Handoff steps 7–8. Source labels refer to the shared source context linked below.
- Refinement: PR #129 review follow-up (2026-10-10) limits the editing promise to service times and narratives; participant correction and coach reassignment remain unresolved.
- Product direction: the handoff supplies the proposed product direction.

## Acceptance criteria

1. After creating and leaving a record, the coach can reopen it and update service times and optional narratives.
2. Successful changes update the existing record rather than requiring a replacement record to be created.
3. Editing remains available after an end time is recorded.
4. The workflow does not require draft/submitted/approved states, supervisor approval, signatures, or locking to create, review, or update the record.

## Open questions

Participant-association correction and coach reassignment are not settled. Save, conflict, and failure behavior need decisions before delivery.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Verification Plan

Application and browser Gherkin/BDD evidence demonstrates reopening and updating the same non-deleted record’s times and optional narratives, including after end capture, without submission, approval, signatures, or locking. The save, conflict, and failure contracts must be decided before verification; participant correction and coach reassignment remain outside this claim.

Unresolved verification conditions follow the Open questions and shared context. The plan establishes no executed result or compliance claim.

## Shared context

The [on-site scope, source review, adoption, and delivery gates](../context/on-site-job-coaching.md) qualify this contract.
