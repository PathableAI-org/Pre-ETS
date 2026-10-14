---
id: PREETS-HIPAA-003
classifications:
  - Regulatory
---

# Permitted use and minimum necessary exposure

## Owner / responsible boundary

Application and software data-handling owners

## Description

Software must enforce the separately approved permitted-use and disclosure policy for PHI and limit exposure to the minimum necessary where that standard applies.

## Rationale

Protecting the assumed PHI boundary requires evidence at the responsible software boundary.

## Sources

- Source: [45 CFR 164.502(a), (b)](https://www.ecfr.gov/current/title-45/section-164.502) and [HHS minimum necessary guidance](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/minimum-necessary-requirement/index.html). Reviewed 2026-10-09; applicability follows the shared HIPAA scope linked below.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09.

## Acceptance criteria

1. Application access and outputs follow the separately approved purposes, recipients, role-based data needs, and applicable minimum-necessary exceptions; software enforcement does not establish legal approval of that policy.
2. Forms, exports, diagnostics, logs, traces, heartbeat traffic, analytics, and support tooling exclude PHI outside the approved data needs for their purpose and recipient; approved inclusions remain subject to the applicable software safeguards.
3. Enforce the documented permitted-use and disclosure boundaries through the responsible software path. Unpermitted uses or recipients are denied, and outputs and access are limited to the minimum necessary where that standard applies. A documented exception to minimum necessary does not by itself permit an otherwise unpermitted use or disclosure.

## Open questions

Software field/recipient mapping, telemetry allowlists, and behavior when an approved policy is unavailable or changes. Approval of purposes, recipients, disclosure authority, and legal exceptions is deferred operational work; implementation needs the applicable approved policy.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Verification Plan

Application/output evidence with synthetic protected data demonstrates permitted-use and recipient enforcement and minimum-necessary exposure where applicable across the named software outputs. Policy assessment supplies the basis for purposes and exceptions; inspection alone does not establish runtime enforcement. The approved policy and field/recipient mappings are prerequisites to execution, and software evidence does not establish legal approval of that policy.

Unresolved verification conditions follow the Open questions and shared context. The plan establishes no executed result or compliance claim.

## Shared context

The [HIPAA scope, regulatory basis, and software boundaries](../context/hipaa.md) qualify this contract.
