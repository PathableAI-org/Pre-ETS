---
id: PREETS-SESSION-005
classifications:
  - Functional
---

# Independent request tenant and session binding

## Description

For every protected request using an authenticated session, the application must compare the tenant returned by independent request tenant resolution with the session tenant and grant access only when they are equal; a mismatch must yield a 403 Forbidden page. This contract applies to the result of tenant resolution regardless of how that result is obtained.

## Rationale

A Tenant A session must not grant access to Tenant B or reinterpret Tenant B as Tenant A.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Tenant/session binding.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

## Acceptance criteria

1. Matching request and session tenants permit tenant-binding validation to succeed, subject to other access checks.
2. Different request and session tenants forbid access and expose a 403 Forbidden page.
3. A valid session does not bypass request tenant resolution or substitute the session tenant for the tenant returned by that resolution.
4. Tenant/session comparison depends on the resolved tenant identity, without imposing a tenant resolution mode or mechanism.

## Open questions

Whether the 403 page is rendered directly or reached through navigation remains a delivery decision; forbidden access must retain HTTP 403 semantics.

## Verification Plan

HTTP/application and browser/BDD evidence must establish independent request-tenant resolution, matching-tenant access subject to other checks, and actual HTTP 403 plus the forbidden experience for mismatches. Cookie host isolation alone does not establish independent tenant/session comparison. The 403 navigation/rendering choice remains unresolved without changing required HTTP semantics.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
