---
id: PREETS-HIPAA-006
classifications:
  - Regulatory
---

# Application confidentiality in client storage and data handling

## Owner / responsible boundary

Application, client-storage, and application key-access boundaries

## Description

The application must protect ePHI in its inputs, displays, client storage, exports, and transfers using the selected application safeguards, including when authenticated access is lost.

## Rationale

Client and application data handling can expose protected data even when the backing infrastructure is protected. Platform storage and transport safeguards are owned separately.

## Sources

- Source: [45 CFR 164.312(a)(2)(iv), (e)](https://www.ecfr.gov/current/title-45/section-164.312). Reviewed 2026-10-09; applicability follows the shared HIPAA scope linked below.
- Scope decision: Maintainer direction (2026-10-10) retains supporting software capabilities and separates infrastructure from application requirements. This scope decision does not approve the detailed obligation or establish verification.

## Acceptance criteria

1. The application applies the selected encryption or approved alternative safeguards to ePHI in browser storage/caches, application-managed copies, exports, and transfers. Application connections use the protected infrastructure interfaces; this criterion does not introduce an export feature.
2. Unsaved values and disabled-form data remain subject to the selected confidentiality controls through logout, session expiry, connectivity failure/recovery, and shared-device use; heartbeat recovery does not restore expired authorization.
3. Application access to protected data and any keys it uses is limited to authorized identities and paths; application behavior does not bypass deployed storage/transport protections.

## Open questions

Permitted browser persistence, cache lifecycle, protected-display removal, application key-access behavior, and handling of incomplete values after access loss. Approval of encryption/alternative treatment, key-custody staffing, and human device procedures remain deferred operational work.

## Related requirements

- [PREETS-INFRA-003](../infrastructure/PREETS-INFRA-003.md) owns infrastructure storage, transport, and key-access protection.
- Accepted [session requirements](../session/) define access loss and recovery.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Verification Plan

Application/client and transport observations with synthetic protected data demonstrate the selected safeguards for displays, browser caches/storage, supported exports, transfers, and application key access, including access loss, connectivity recovery, and subsequent shared-device use. Denied identities cannot access protected application contents or keys. Cache lifecycle and access-loss policies bound the claim; this evidence does not establish backup or platform key-management safeguards.

Unresolved verification conditions follow the Open questions and shared context. The plan establishes no executed result or compliance claim.

## Shared context

The [HIPAA scope, regulatory basis, and software boundaries](../context/hipaa.md) qualify this contract.
