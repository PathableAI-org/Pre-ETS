---
id: PREETS-SESSION-001
classifications:
  - Functional
---

# Authentication required by default

## Description

Users must authenticate before accessing any protected application page or resource; only resources explicitly designated unauthenticated may bypass this requirement.

## Rationale

A default protection boundary prevents accidental public exposure.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Authentication and protected resources.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

## Acceptance criteria

1. A request without valid authentication cannot obtain protected content from any protected application entry point.
2. An explicitly designated public resource, including the session-expired page, is accessible without authentication.
3. Adding an application resource leaves it protected unless it is explicitly designated public.

## Open questions

Inventory public exceptions and the boundary that enforces the default.

## Verification Plan

HTTP/application checks of representative entry points and public exceptions, plus route-policy inspection, establish default enforcement; browser Gherkin establishes the protected navigation outcome. A finite route sample alone cannot establish the default for new routes.

Evidence assumptions follow the shared session context. Unresolved verification conditions follow the Open questions above; no additional operational monitoring claim is introduced.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
