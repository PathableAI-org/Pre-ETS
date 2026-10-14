---
id: PREETS-INFRA-003
classifications:
  - Regulatory
---

# Infrastructure confidentiality for protected storage and transport

## Owner / responsible boundary

Deployed storage, transport, and platform key-management controls

## Description

Infrastructure storing or transmitting ePHI must enforce the selected confidentiality protections and restrict data and key access to authorized identities.

## Rationale

Protected application behavior cannot establish protection of database volumes, backup copies, infrastructure-managed transfers, or platform key access. This separates the infrastructure portion of PREETS-HIPAA-006.

## Sources

- Source: [45 CFR 164.312(a)(2)(iv), (e)](https://www.ecfr.gov/current/title-45/section-164.312). Reviewed 2026-10-09; rechecked 2026-10-10. Encryption/alternative approval remains separate operational work.
- Scope decision: Maintainer direction (2026-10-10) retains supporting software capabilities and separates infrastructure from application requirements. This scope decision does not approve the detailed obligation or establish verification.

## Acceptance criteria

1. Deployed database/storage volumes, backup copies, and infrastructure-managed network hops containing ePHI use the selected encryption or approved alternative safeguards, including during backup and restoration.
2. Direct infrastructure access to protected data and keys is restricted to authorized identities; unauthorized and revoked identities cannot obtain protected contents or keys through those interfaces.
3. Replacement storage and recovery environments preserve the selected confidentiality and access protections; successful application authentication alone does not establish access to infrastructure copies.

## Open questions

Selected storage/transport protection contract, infrastructure identities, algorithms, key-access/rotation behavior, and failure outcomes. Human key custody, approval of addressable controls, and provider responsibility allocation remain deferred operational work.

## Related requirements

- Separates infrastructure protection from [PREETS-HIPAA-006](../security/PREETS-HIPAA-006.md).
- Applies to backups under [PREETS-HIPAA-007](PREETS-HIPAA-007.md).

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Verification Plan

Deployed configuration assessments and runtime storage/transport/key-access evidence demonstrate the selected confidentiality protections across primary storage, backups, infrastructure transfers, and replacement recovery environments. Authorized, unauthorized, and revoked identity observations establish access restrictions. Configuration and runtime observations support distinct claims; chosen safeguards, identities, rotation, and failure policy remain unresolved, and software evidence does not establish operational approval or provider responsibility allocation.

Unresolved verification conditions follow the Open questions and shared context. The plan establishes no executed result or compliance claim.

## Shared context

The [HIPAA scope, regulatory basis, and software boundaries](../context/hipaa.md) qualify this contract.
