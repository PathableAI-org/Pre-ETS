---
id: PREETS-ONSITE-005
classifications:
  - Functional
---

# Find and access one’s own records

## Description

A coach must be able to see their previously created, non-deleted on-site service records and open an individual non-deleted record for review; this slice must limit record visibility, access, and mutation to the user’s own records in the authenticated tenant.

## Rationale

Coaches need continuity across visits; deferring team access must not silently grant access to others’ records.

## Sources

- Source: Handoff steps 8–9. Source labels refer to the shared source context linked below.
- Refinement: Maintainer-requested assessment changes (2026-10-09) clarify non-deleted scope and authorization across reads and mutations.
- Product direction: the handoff supplies the proposed product direction.

## Acceptance criteria

1. The coach can find their previously created, non-deleted on-site records, including records without an end time or narratives.
2. The coach can open an individual non-deleted record and review its participant, coach, service times, and any recorded narratives.
3. Another user’s records are absent from the coach’s ordinary views.
4. A user cannot obtain another user’s record by opening it directly or requesting it through an application access path, even within the same tenant; access to records in another tenant is also denied.
5. Application access paths deny attempts by a same-tenant non-owner or a cross-tenant user to capture service end, change times or narratives, delete, or undo deletion of a record, including direct requests that bypass ordinary views.
6. A denied operation does not alter the targeted record’s participant/coach association, times, narratives, or deletion status and does not disclose its contents.

## Open questions

Record-list presentation and navigation need design. Supervisor/team visibility and organizational authorization models are deferred; no such access is granted by this slice.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Verification Plan

Application/HTTP Gherkin evidence demonstrates owner-only discovery and direct access within the authenticated tenant, and denial for same-tenant non-owners and cross-tenant users. It covers reads, end capture, time/narrative changes, deletion, and undo, including bypass of ordinary views. Authorized observations of state after denied mutations establish unchanged associations, values, and deletion status; responses establish no content disclosure. Deleted-record undo denial does not decide owner access outside immediate undo.

Unresolved verification conditions follow the Open questions and shared context. The plan establishes no executed result or compliance claim.

## Shared context

The [on-site scope, source review, adoption, and delivery gates](../context/on-site-job-coaching.md) qualify this contract.
