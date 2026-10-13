---
id: PREETS-INFRA-004
classifications:
  - Regulatory
---

# Infrastructure enforcement of protected-copy retention and disposal

## Owner / responsible boundary

Deployed storage, backup-retention, and infrastructure deletion controls

## Description

Infrastructure must protect retained ePHI copies and enforce the separately approved retention, hold, and disposal contract for storage and backup copies it owns.

## Rationale

Application removal alone cannot establish removal or continued protection of retained infrastructure copies. This separates infrastructure-copy treatment from PREETS-HIPAA-011.

## Sources

- Source: [45 CFR 164.310(d)](https://www.ecfr.gov/current/title-45/section-164.310) and [HHS record-retention FAQ](https://www.hhs.gov/hipaa/for-professionals/faq/does-hipaa-require-covered-entities-to-keep-medical-records-for-any-period/index.html). Reviewed 2026-10-09; applicability follows the shared PHI-handling assumption.
- Scope decision: Maintainer direction (2026-10-10) retains supporting software capabilities and separates infrastructure from application requirements. This scope decision does not approve the detailed obligation or establish verification.

## Acceptance criteria

1. Storage and backup copies retained by the approved policy remain protected by infrastructure access and confidentiality controls, including after application records are ordinarily or permanently deleted.
2. Infrastructure retention/deletion mechanisms enforce the approved copy-level retention and hold contract: they do not destroy copies still required by that contract, and authorized eligible disposal removes them within the selected infrastructure scope.
3. A retained backup containing records removed from the application remains protected until its policy permits disposal. Recovery applies the approved handling of records disposed of after that backup's recovery point before restored data becomes available for application access; recovery does not silently reintroduce disposed records contrary to policy.
4. Disposal evidence identifies the copy scope and result; application record deletion or an expiry configuration alone does not establish destruction of infrastructure copies or sanitization of physical media.

## Open questions

Infrastructure copy inventory, retention/hold contract and granularity, authorized disposal, deletion failure outcomes, evidence from externally managed storage, and post-restore handling of intervening disposals. Legal/contract retention schedules and physical media sanitization remain deferred operational work; no blanket six-year service-record retention is selected.

## Related requirements

- Separates infrastructure copies from [PREETS-HIPAA-011](../security/PREETS-HIPAA-011.md).
- Applies during restoration under [PREETS-HIPAA-007](PREETS-HIPAA-007.md).
- [PREETS-INFRA-003](PREETS-INFRA-003.md) protects retained copies.

## Observability

Copy-specific disposal scope and results remain observable as required by the acceptance criteria. No additional operator monitoring obligation is introduced by this migration.

## Verification Plan

Deployed storage/backup evidence demonstrates protection of retained copies, hold and retention enforcement, and authorized eligible disposal, including after application deletion. Restoration evidence demonstrates selected handling of intervening disposals before application exposure; copy-specific results bound the disposal claim. Policy, inventory, granularity, failure, and restore-handling decisions remain conditions; application deletion or expiry configuration alone does not establish copy destruction or physical-media sanitization.

Unresolved verification conditions follow the Open questions and shared context. The plan establishes no executed result or compliance claim.

## Shared context

The [HIPAA scope, regulatory basis, and software boundaries](../context/hipaa.md) qualify this contract.
