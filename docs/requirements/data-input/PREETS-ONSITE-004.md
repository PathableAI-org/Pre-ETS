---
id: PREETS-ONSITE-004
classifications:
  - Functional
---

# Durable records from creation

## Description

An authorized user’s created workflow record and its successful updates must remain retrievable independently of the browser, authentication session, or application process in which they were created.

## Rationale

Once a workflow record has been successfully created, incomplete optional values must not make that record temporary.

## Sources

- Source: Handoff steps 6–7; current domain-persistence context, “When the line is crossed.” Source labels refer to the source review in [On-site job-coaching service records](../context/on-site-job-coaching.md#sources-and-evidence-limitations).
- Refinement: Maintainer-requested assessment changes (2026-10-09) clarify process-independent durability.
- Scope refinement: Maintainer request (2026-10-09) separates shared data-input behavior from on-site policies; the historical ID is retained.
- Product direction: the handoff supplies the proposed product direction.

## Acceptance criteria

1. A successfully created record remains retrievable after reload, browser closure, and a new authenticated session by the same authorized user in the same tenant.
2. That durability applies when the record has incomplete optional workflow values.
3. Successfully updated workflow values remain available after reopening in a new authenticated session.
4. Session expiry or logout does not delete the created record or its successful updates.
5. For workflows adopting durability from creation, no submission, approval, or completed-form transition is required to make the created record durable; later workflow approval rules remain separately defined.
6. Successfully created records and successful updates remain retrievable by an authorized user in the same tenant after a backend restart or equivalent replacement of the application process, including records with incomplete optional workflow values.

## Open questions

Save interaction and failure/retry outcomes need decisions before delivery. This promise does not establish durability for every unsaved keystroke. Deletion visibility follows PREETS-ONSITE-007.

## Related requirements

Applied by [On-site job-coaching service records](../context/on-site-job-coaching.md#shared-data-input-requirements).

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Verification Plan

Application/persistence evidence demonstrates retrieval of successfully created and updated records, including incomplete records, after browser closure, a fresh authenticated session, and a backend restart or equivalent process replacement. Identity, associations, and recorded values must survive without submission or approval. Real persistence is needed for the process-boundary claim; browser reloads, simulated adapters, and session changes alone do not establish it. This evidence does not establish durability of unsaved input, backup recovery, or disaster tolerance.

Unresolved verification conditions follow the Open questions and shared context. The plan establishes no executed result or compliance claim.

## Shared context

The [shared data-input applicability and delivery decisions](../context/data-input-workflows.md) qualify this contract.
