---
id: PREETS-ONSITE-007
classifications:
  - Functional
---

# Delete from ordinary workflow without destroying the record

## Description

An authorized user must be able to delete a workflow record they are permitted to delete from the normal workflow, removing it from ordinary views while preserving the underlying record.

## Rationale

Users can remove unwanted records while preserving the possibility of undo and future recovery decisions.

## Sources

- Source: Handoff step 10. Source labels refer to the source review in [On-site job-coaching service records](../context/on-site-job-coaching.md#sources-and-evidence-limitations).
- Scope refinement: Maintainer request (2026-10-09) separates shared data-input behavior from on-site policies; the historical ID is retained.
- Product direction: the handoff supplies the proposed product direction.

## Acceptance criteria

1. The authorized user can delete the record from the normal record workflow.
2. After successful deletion, the record is absent from the authorized user’s ordinary record views, including after reload or a new authenticated session.
3. Deletion preserves the record and its workflow associations and recorded values.
4. Normal workflow deletion does not permanently destroy the underlying record.

## Open questions

Direct access to a deleted record, retention, later recovery, and permanent deletion policy remain unresolved. Immediate undo is specified separately in PREETS-ONSITE-008.

## Related requirements

Applied by [On-site job-coaching service records](../context/on-site-job-coaching.md#shared-data-input-requirements).

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Verification Plan

Application/persistence evidence demonstrates that ordinary deletion removes a record from ordinary views across reload and a fresh session while preserving its identity, associations, and values in persistent storage. UI absence alone cannot establish preservation. This evidence does not decide direct deleted-record access, retention duration, later recovery, or final disposal.

Unresolved verification conditions follow the Open questions and shared context. The plan establishes no executed result or compliance claim.

## Shared context

The [shared data-input applicability and delivery decisions](../context/data-input-workflows.md) qualify this contract.
