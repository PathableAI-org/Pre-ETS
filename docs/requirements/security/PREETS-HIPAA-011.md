---
id: PREETS-HIPAA-011
classifications:
  - Regulatory
---

# Application enforcement of protected-record retention and disposal

## Owner / responsible boundary

Application record lifecycle and persistence interfaces

## Description

The application must safeguard retained protected records and enforce separately approved retention, hold, and disposal rules at its record-lifecycle boundary.

## Rationale

Ordinary deletion hides a record while preserving it; final disposal is a separate authorized software capability governed by an approved policy.

## Sources

- Source: [45 CFR 164.310(d)](https://www.ecfr.gov/current/title-45/section-164.310) and [HHS record-retention FAQ](https://www.hhs.gov/hipaa/for-professionals/faq/does-hipaa-require-covered-entities-to-keep-medical-records-for-any-period/index.html). Reviewed 2026-10-09; applicability follows the shared HIPAA scope linked below.
- Scope decision: Maintainer direction (2026-10-10) retains supporting software capabilities and separates infrastructure from application requirements. This scope decision does not approve the detailed obligation or establish verification.

## Acceptance criteria

1. Retained records, including records hidden by ordinary deletion, remain protected by tenant, identity, and authorized-access rules; ordinary deletion does not trigger final disposal.
2. The application denies disposal that conflicts with the separately approved retention policy or an applicable hold, including direct requests that bypass ordinary views.
3. An authorized disposal request satisfying the approved policy removes the targeted application record/copies within the defined application scope and produces the selected audit evidence. A denied request leaves the record and its associations unchanged.
4. Application disposal does not claim removal of infrastructure backups or other retained copies; their treatment follows the separately owned infrastructure policy-enforcement requirement.

## Open questions

Approved retention/hold contract, disposal authority, application copy scope, interaction, failure outcomes, and effect on retained audit information. Setting legal/contract retention schedules, maintaining Security Rule compliance documents under 45 CFR 164.316, and physical media sanitization are deferred operational work. No retention duration or general trash interface is selected.

## Related requirements

- [PREETS-ONSITE-007](../data-input/PREETS-ONSITE-007.md) preserves ordinary deletion's non-destructive behavior.
- [PREETS-INFRA-004](../infrastructure/PREETS-INFRA-004.md) owns retention/disposal of infrastructure copies.
- [PREETS-HIPAA-012](PREETS-HIPAA-012.md) covers authorized access to retained records.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Verification Plan

Application/persistence evidence demonstrates protection of retained and ordinarily deleted records, enforcement of holds and retention policy, and permitted final disposal with selected audit output. Denied or policy-conflicting disposal leaves records and associations unchanged. Approved policy and copy scope bound the claim; application removal does not establish destruction of infrastructure copies or physical media.

Unresolved verification conditions follow the Open questions and shared context. The plan establishes no executed result or compliance claim.

## Shared context

The [HIPAA scope, regulatory basis, and software boundaries](../context/hipaa.md) qualify this contract.
