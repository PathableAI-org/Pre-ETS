---
id: PREETS-HIPAA-007
classifications:
  - Regulatory
---

# Recover protected data from infrastructure backups

## Owner / responsible boundary

Deployed backup, storage, and recovery infrastructure

## Description

For a deployment storing ePHI, infrastructure must maintain retrievable exact backup copies and support restoration of protected data and its associations after loss of the primary data store.

## Rationale

Users depend on recovery after storage loss, independently of ordinary application-process durability. The historical ID is preserved when moving this proposal from the HIPAA area.

## Sources

- Source: [45 CFR 164.308(a)(7)(ii)(A)–(C)](https://www.ecfr.gov/current/title-45/section-164.308). Reviewed 2026-10-09; rechecked 2026-10-10. The criteria define infrastructure capability; emergency-mode staffing and procedures remain deferred.
- Scope decision: Maintainer direction (2026-10-10) retains supporting software capabilities and separates infrastructure from application requirements. This scope decision does not approve the detailed obligation or establish verification.

## Acceptance criteria

1. The deployed infrastructure produces and retains retrievable exact copies of the protected datasets identified by the backup-scope contract, including stored incomplete and ordinarily deleted records and their associations where retained by policy.
2. After controlled loss of the primary store, infrastructure can restore an actual backup into a replacement store without relying on the lost store or its application process; restored identities, tenant/owner associations, recorded values, and deletion status match the selected recovery point.
3. Restored data remains protected by the selected infrastructure access and confidentiality controls; recovery does not expand access or turn ordinarily deleted records into visible records.
4. The selected backup frequency, permitted data-loss window, and restore-time target are reflected in infrastructure behavior and supported by measured backup/restore evidence. Targets must be specified before delivering the affected infrastructure.

## Open questions

Backup scope/frequency, retention, acceptable data loss, restore-time targets, recovery-point selection, dependencies such as schema and keys, and infrastructure behavior needed for protected emergency continuity. Provider responsibilities, human recovery procedures, critical-business-operation selection, and contingency review programs remain deferred operational work. No zero-data-loss or continuous-availability guarantee is selected.

Maintainer decision (2026-10-10): choose backup frequency, acceptable data loss, and restore-time targets during
infrastructure delivery planning, before delivering the affected infrastructure.

## Related requirements

- [PREETS-ONSITE-004](../data-input/PREETS-ONSITE-004.md) covers application-process-independent durability; it does not establish backup recovery.
- [PREETS-INFRA-003](PREETS-INFRA-003.md) protects infrastructure copies and transfers.
- [PREETS-INFRA-004](PREETS-INFRA-004.md) applies retention and disposal policy to infrastructure copies.
- Application authorization remains governed by [PREETS-HIPAA-002](../security/PREETS-HIPAA-002.md).

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Verification Plan

Deployed backup and restoration evidence with synthetic protected datasets demonstrates exact copies and restoration into replacement storage after primary-store loss, preserving identities, associations, values, and deletion state. Measured recovery-point and restore-time evidence establishes the selected bounds, and access observations demonstrate protection after restoration. Scope, retention, keys/schema, and recovery targets must be decided before execution; configuration, reloads, and ordinary process restart alone do not establish backup recovery.

Unresolved verification conditions follow the Open questions and shared context. The plan establishes no executed result or compliance claim.

## Shared context

The [HIPAA scope, regulatory basis, and software boundaries](../context/hipaa.md) qualify this contract.
