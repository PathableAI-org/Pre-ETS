---
id: PREETS-HIPAA-005
classifications:
  - Regulatory
---

# Protect record and transmission integrity

## Owner / responsible boundary

Application/persistence and transport owners

## Description

ePHI must be protected from improper alteration or destruction, including during transmission.

## Rationale

Protecting the assumed PHI boundary requires evidence at the responsible software boundary.

## Sources

- Source: [45 CFR 164.312(c), (e)](https://www.ecfr.gov/current/title-45/section-164.312). Reviewed 2026-10-09; applicability follows the shared HIPAA scope linked below.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09.

## Acceptance criteria

1. The software applies the selected record-integrity and transmission-integrity controls to protect ePHI from improper alteration or destruction; operational assessment of addressable specifications is deferred separately.
2. Unauthorized writes leave protected records and their associations unchanged. Interrupted and conflicting writes preserve record and association integrity under the separately approved failure and concurrency outcomes; successful updates and deletion/undo preserve the intended record and associations.

## Open questions

Atomicity, concurrency, retry/deduplication, failure outcomes, and integrity verification mechanisms. The responsible
application/persistence and transport owners, with product maintainer review, must define interruption, conflict,
and retry outcomes before delivering the affected writes. This contract does not select universal rollback,
atomicity, or a conflict-resolution strategy.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Verification Plan

Application/persistence and transmission evidence demonstrates that unauthorized writes leave protected records and associations unchanged, and that interrupted and conflicting writes preserve integrity under the approved failure and concurrency outcomes. It also demonstrates preservation of intended record state and associations through successful updates, deletion, and undo. Real adapters are needed for claims about their behavior. The atomicity, concurrency, retry, and failure contracts remain unresolved and must be defined before delivering the affected writes; software evidence does not establish addressable-safeguard assessment.

Unresolved verification conditions follow the Open questions and shared context. The plan establishes no executed result or compliance claim.

## Shared context

The [HIPAA scope, regulatory basis, and software boundaries](../context/hipaa.md) qualify this contract.
