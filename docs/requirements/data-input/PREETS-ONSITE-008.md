---
id: PREETS-ONSITE-008
classifications:
  - Functional
---

# Immediate deletion undo

## Description

Immediately after deleting a workflow record they are permitted to delete, an authorized user must have an opportunity to undo that deletion and restore the record to ordinary views.

## Rationale

An accidental deletion can be reversed in the workflow without introducing a general trash interface.

## Sources

- Source: Handoff step 10. Source labels refer to the source review in [On-site job-coaching service records](../context/on-site-job-coaching.md#sources-and-evidence-limitations).
- Scope refinement: Maintainer request (2026-10-09) separates shared data-input behavior from on-site policies; the historical ID is retained.
- Product direction: the handoff supplies the proposed product direction.

## Acceptance criteria

1. Successful deletion immediately presents an undo opportunity within the current workflow.
2. Using that opportunity restores the same record to ordinary views with its workflow associations and recorded values intact.
3. The restored record can again be opened, reviewed, and edited by an authorized user.
4. Immediate undo does not require finding a separate trash/recovery interface.

## Open questions

Undo duration, interaction and accessibility, navigation/session-expiry behavior, and failed undo outcomes need decisions before delivery. A later recovery interface is out of scope.

## Related requirements

Applied by [On-site job-coaching service records](../context/on-site-job-coaching.md#shared-data-input-requirements).

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Verification Plan

Browser Gherkin/BDD and application/persistence evidence demonstrates the immediate undo opportunity and restoration of the same record, with associations and values intact and authorized review/editing available again. Duration, accessibility, navigation, session-expiry, and failure decisions remain verification conditions; no later recovery interface is implied.

Unresolved verification conditions follow the Open questions and shared context. The plan establishes no executed result or compliance claim.

## Shared context

The [shared data-input applicability and delivery decisions](../context/data-input-workflows.md) qualify this contract.
