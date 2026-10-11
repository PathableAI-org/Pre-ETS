---
id: PREETS-HIPAA-004
classifications:
  - Regulatory
---

# Audit controls and activity examination

## Owner / responsible boundary

Application audit and audit-storage owners

## Description

Software activity involving ePHI must be recorded and available for examination by authorized reviewers through protected audit controls.

## Rationale

Protecting the assumed PHI boundary requires evidence at the responsible software boundary.

## Sources

- Source: [45 CFR 164.312(b)](https://www.ecfr.gov/current/title-45/section-164.312) and [164.308(a)(1)(ii)(D)](https://www.ecfr.gov/current/title-45/section-164.308). Reviewed 2026-10-09; applicability follows the shared HIPAA scope linked below.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09.

## Acceptance criteria

1. Define risk-based audit coverage for access, changes, deletion, undo, and privileged actions; evidence identifies actor, target, time, action, and outcome as needed for examination.
2. Audit records remain protected from unauthorized access, alteration, and deletion, and can be retrieved for examination through an authorized software path; ordinary record deletion must not defeat the selected audit coverage.

## Open questions

Event coverage, clock handling, retention enforcement, audit failure outcomes, tamper protections, and authorized
audit-retrieval behavior require software contracts. Reviewer assignment, recurring review cadence, and human
follow-up/escalation are deferred operational work. No event-sourcing architecture or full narrative copies are selected.

## Observability

The activity-examination and protected audit-retrieval obligations are defined in the acceptance criteria. No additional operator monitoring or recurring human review obligation is introduced by this migration.

## Verification Plan

Application and audit-storage evidence demonstrates selected activity coverage and authorized retrieval with actor, target, time, action, and outcome, including preservation through ordinary record deletion. Access and integrity evidence demonstrates protection against unauthorized audit retrieval, alteration, and deletion. Coverage, retention, clock, and failure contracts remain verification conditions; this evidence does not establish recurring human examination.

Unresolved verification conditions follow the Open questions and shared context. The plan establishes no executed result or compliance claim.

## Shared context

The [HIPAA scope, regulatory basis, and software boundaries](../context/hipaa.md) qualify this contract.
