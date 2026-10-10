# Infrastructure requirements

PREETS-INFRA-001 and PREETS-INFRA-002 have moved to individual contracts in `infrastructure/`.
The original content remains in [pre-migration Git history](https://github.com/PathableAI-org/Pre-ETS/blob/ec48e91/docs/requirements/infrastructure.md).

The protected-data entries below retain this branch's proposals. [HIPAA application safeguards](hipaa.md#scope-and-regulatory-basis)
supply the shared PHI-handling assumption and application boundary. Operational programs and human procedures remain deferred.

## PREETS-HIPAA-007

**Title:** Recover protected data from infrastructure backups
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Deployed backup, storage, and recovery infrastructure
**Lifecycle:** proposed
**Verification:** unverified

### Statement

For a deployment storing ePHI, infrastructure must maintain retrievable exact backup copies and support restoration of protected data and its associations after loss of the primary data store.

### Rationale and sources

Users depend on recovery after storage loss, independently of ordinary application-process durability. The historical ID is preserved when moving this proposal from the HIPAA area.

- Source: [45 CFR 164.308(a)(7)(ii)(A)–(C)](https://www.ecfr.gov/current/title-45/section-164.308). Reviewed 2026-10-09; rechecked 2026-10-10. The criteria define infrastructure capability; emergency-mode staffing and procedures remain deferred.
- Scope decision: Maintainer direction (2026-10-10) retains supporting software capabilities and separates infrastructure from application requirements. This scope decision does not approve the detailed obligation or establish verification.

### Acceptance criteria

1. The deployed infrastructure produces and retains retrievable exact copies of the protected datasets identified by the backup-scope contract, including stored incomplete and ordinarily deleted records and their associations where retained by policy.
2. After controlled loss of the primary store, infrastructure can restore an actual backup into a replacement store without relying on the lost store or its application process; restored identities, tenant/owner associations, recorded values, and deletion status match the selected recovery point.
3. Restored data remains protected by the selected infrastructure access and confidentiality controls; recovery does not expand access or turn ordinarily deleted records into visible records.
4. The selected backup frequency, permitted data-loss window, and restore-time target are reflected in infrastructure behavior and supported by measured backup/restore evidence. Targets must be specified before delivering the affected infrastructure.

### Open questions

Backup scope/frequency, retention, acceptable data loss, restore-time targets, recovery-point selection, dependencies such as schema and keys, and infrastructure behavior needed for protected emergency continuity. Provider responsibilities, human recovery procedures, critical-business-operation selection, and contingency review programs remain deferred operational work. No zero-data-loss or continuous-availability guarantee is selected.

Maintainer decision (2026-10-10): choose backup frequency, acceptable data loss, and restore-time targets during
infrastructure delivery planning, before delivering the affected infrastructure.

### Verification plan

Planned evidence only: exercise deployed backup and restore mechanisms with synthetic protected records, incomplete and deleted records, and multiple tenants. Remove access to the original primary store, restore a real backup into a replacement, compare restored contents and associations with the selected recovery point, and measure data-loss/restore-time bounds against approved targets. Verify access restrictions after restoration. Application process restart, ordinary reload, fixtures, and a backup configuration alone do not establish restore capability.

### Related requirements

- [PREETS-ONSITE-004](data-input-workflows.md#preets-onsite-004) covers application-process-independent durability; it does not establish backup recovery.
- [PREETS-INFRA-003](#preets-infra-003) protects infrastructure copies and transfers.
- [PREETS-INFRA-004](#preets-infra-004) applies retention and disposal policy to infrastructure copies.
- Application authorization remains governed by [PREETS-HIPAA-002](hipaa.md#preets-hipaa-002).

### Verification evidence

No reviewed, executed evidence has been recorded. This documentation change does not establish runtime behavior or compliance.

## PREETS-INFRA-003

**Title:** Infrastructure confidentiality for protected storage and transport
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Deployed storage, transport, and platform key-management controls
**Lifecycle:** proposed
**Verification:** unverified

### Statement

Infrastructure storing or transmitting ePHI must enforce the selected confidentiality protections and restrict data and key access to authorized identities.

### Rationale and sources

Protected application behavior cannot establish protection of database volumes, backup copies, infrastructure-managed transfers, or platform key access. This separates the infrastructure portion of PREETS-HIPAA-006.

- Source: [45 CFR 164.312(a)(2)(iv), (e)](https://www.ecfr.gov/current/title-45/section-164.312). Reviewed 2026-10-09; rechecked 2026-10-10. Encryption/alternative approval remains separate operational work.
- Scope decision: Maintainer direction (2026-10-10) retains supporting software capabilities and separates infrastructure from application requirements. This scope decision does not approve the detailed obligation or establish verification.

### Acceptance criteria

1. Deployed database/storage volumes, backup copies, and infrastructure-managed network hops containing ePHI use the selected encryption or approved alternative safeguards, including during backup and restoration.
2. Direct infrastructure access to protected data and keys is restricted to authorized identities; unauthorized and revoked identities cannot obtain protected contents or keys through those interfaces.
3. Replacement storage and recovery environments preserve the selected confidentiality and access protections; successful application authentication alone does not establish access to infrastructure copies.

### Open questions

Selected storage/transport protection contract, infrastructure identities, algorithms, key-access/rotation behavior, and failure outcomes. Human key custody, approval of addressable controls, and provider responsibility allocation remain deferred operational work.

### Verification plan

Planned evidence only: inspect the deployed storage/backup/transport protections and exercise authorized, unauthorized, and revoked infrastructure identities with synthetic PHI. Include a replacement recovery environment and platform key access. Configuration checks and runtime access/transport observations establish different claims; record each boundary and limitation.

### Related requirements

- Separates infrastructure protection from [PREETS-HIPAA-006](hipaa.md#preets-hipaa-006).
- Applies to backups under [PREETS-HIPAA-007](#preets-hipaa-007).

### Verification evidence

No reviewed, executed evidence has been recorded. This documentation change does not establish runtime behavior or compliance.

## PREETS-INFRA-004

**Title:** Infrastructure enforcement of protected-copy retention and disposal
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Deployed storage, backup-retention, and infrastructure deletion controls
**Lifecycle:** proposed
**Verification:** unverified

### Statement

Infrastructure must protect retained ePHI copies and enforce the separately approved retention, hold, and disposal contract for storage and backup copies it owns.

### Rationale and sources

Application removal alone cannot establish removal or continued protection of retained infrastructure copies. This separates infrastructure-copy treatment from PREETS-HIPAA-011.

- Source: [45 CFR 164.310(d)](https://www.ecfr.gov/current/title-45/section-164.310) and [HHS record-retention FAQ](https://www.hhs.gov/hipaa/for-professionals/faq/does-hipaa-require-covered-entities-to-keep-medical-records-for-any-period/index.html). Reviewed 2026-10-09; applicability follows the shared PHI-handling assumption.
- Scope decision: Maintainer direction (2026-10-10) retains supporting software capabilities and separates infrastructure from application requirements. This scope decision does not approve the detailed obligation or establish verification.

### Acceptance criteria

1. Storage and backup copies retained by the approved policy remain protected by infrastructure access and confidentiality controls, including after application records are ordinarily or permanently deleted.
2. Infrastructure retention/deletion mechanisms enforce the approved copy-level retention and hold contract: they do not destroy copies still required by that contract, and authorized eligible disposal removes them within the selected infrastructure scope.
3. A retained backup containing records removed from the application remains protected until its policy permits disposal. Recovery applies the approved handling of records disposed of after that backup's recovery point before restored data becomes available for application access; recovery does not silently reintroduce disposed records contrary to policy.
4. Disposal evidence identifies the copy scope and result; application record deletion or an expiry configuration alone does not establish destruction of infrastructure copies or sanitization of physical media.

### Open questions

Infrastructure copy inventory, retention/hold contract and granularity, authorized disposal, deletion failure outcomes, evidence from externally managed storage, and post-restore handling of intervening disposals. Legal/contract retention schedules and physical media sanitization remain deferred operational work; no blanket six-year service-record retention is selected.

### Verification plan

Planned evidence only: use synthetic protected data to exercise retention, holds, eligible disposal, and denied disposal against actual infrastructure copies. Verify retained-copy access protection after application removal. Restore an older backup and observe the selected handling of subsequent disposals before application exposure. Inspect copy-specific disposal results and state their limits.

### Related requirements

- Separates infrastructure copies from [PREETS-HIPAA-011](hipaa.md#preets-hipaa-011).
- Applies during restoration under [PREETS-HIPAA-007](#preets-hipaa-007).
- [PREETS-INFRA-003](#preets-infra-003) protects retained copies.

### Verification evidence

No reviewed, executed evidence has been recorded. This documentation change does not establish runtime behavior or compliance.
