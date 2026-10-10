---
id: PREETS-SESSION-003
classifications:
  - Functional
---

# Authenticated session identity

## Description

A successfully authenticated user must receive an application session associated with that user and the tenant under which authentication occurred.

## Rationale

Subsequent access depends on a trustworthy identity and tenant binding.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Authentication and protected resources.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

## Acceptance criteria

1. Successful OIDC completion establishes a session bound to the authenticated user and authentication tenant.
2. Failed or rejected authentication does not establish an authenticated application session.
3. A subsequent protected request uses the established identity and tenant association.

## Open questions

None.

## Verification Plan

Focused OIDC completion integration evidence observes actual session establishment and subsequent protected access, including failures. A fabricated session fixture alone cannot prove this claim.

Evidence assumptions follow the shared session context. Unresolved verification conditions follow the Open questions above; no additional operational monitoring claim is introduced.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
