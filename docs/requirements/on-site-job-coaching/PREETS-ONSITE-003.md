---
id: PREETS-ONSITE-003
classifications:
  - Functional
---

# Optional visit narratives

## Description

A coach must be able to document purpose of visit, observations, interventions, and next steps as independently optional free-text values on an on-site service record.

## Rationale

These fields preserve familiar visit-log meaning without adding unsupported mandatory documentation gates.

## Sources

- Source: Handoff step 5; Form, visit-log narrative column headings. Source labels refer to the shared source context linked below.
- Product direction: the handoff supplies the proposed product direction.

## Acceptance criteria

1. The record supports separately identifiable free-text values for purpose of visit, observations, interventions, and next steps.
2. The coach can leave any or all four values empty when creating or updating a record.
3. The coach can enter, revise, and clear each narrative value independently without completing the other narratives.
4. A populated narrative is not required to capture service end or retain the record.

## Open questions

The source provider’s mandatory-field expectations remain unvalidated; optionality is the supplied product decision for this slice. Content limits and failure outcomes need design before delivery.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Verification Plan

Application and browser Gherkin/BDD evidence demonstrates independent entry, revision, clearing, and omission of each narrative, including creation and end capture with all narratives empty. Evidence covers the selected content limits and failure outcomes once decided; it does not validate the source provider’s mandatory-field policy.

Unresolved verification conditions follow the Open questions and shared context. The plan establishes no executed result or compliance claim.

## Shared context

The [on-site scope, source review, adoption, and delivery gates](../context/on-site-job-coaching.md) qualify this contract.
