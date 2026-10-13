---
id: PREETS-HIPAA-002
classifications:
  - Regulatory
---

# Authorized access and authenticated identity

## Owner / responsible boundary

Application authorization and identity owners

## Description

Access to ePHI must be restricted to authorized people and programs with verified identity and individually traceable user identification.

## Rationale

Protecting the assumed PHI boundary requires evidence at the responsible software boundary.

## Sources

- Source: [45 CFR 164.312(a)(1), (a)(2)(i), (d)](https://www.ecfr.gov/current/title-45/section-164.312). Reviewed 2026-10-09; applicability follows the shared HIPAA scope linked below.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09.

## Acceptance criteria

1. Verify identity and enforce the documented user/program rights on direct reads and mutations, including tenant boundaries.
2. Exercise denied and revoked access; no protected contents or mutation is available through bypassing the UI.
3. Assign each human user a unique identifier that identifies and tracks that person's access to ePHI. Access and activity evidence distinguishes different people, including users in the same tenant; a shared account that cannot distinguish its individual users does not satisfy this criterion.

## Open questions

Role grants, revocation propagation, privileged support access, and authentication assurance.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Verification Plan

Application/HTTP evidence demonstrates enforcement for authorized, unauthorized, cross-tenant, and revoked identities on direct reads and mutations. Identity and activity observations distinguish individual human users within one tenant. The selected role, revocation, support-access, and assurance contracts bound the claim; software evidence does not establish operational authorization procedures.

Unresolved verification conditions follow the Open questions and shared context. The plan establishes no executed result or compliance claim.

## Shared context

The [HIPAA scope, regulatory basis, and software boundaries](../context/hipaa.md) qualify this contract.
