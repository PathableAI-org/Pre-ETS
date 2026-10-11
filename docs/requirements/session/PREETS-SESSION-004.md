---
id: PREETS-SESSION-004
classifications:
  - Functional
---

# Automatic login for missing sessions

## Description

A user requesting a protected page with no application session must automatically enter the resolved tenant’s OIDC authentication flow.

## Rationale

First access should not require finding a separate login control.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Authentication and protected resources.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

## Acceptance criteria

1. A protected page request without an application session initiates the resolved tenant’s OIDC flow automatically.
2. The missing-session path does not replace the explicit expired-session recovery required by PREETS-SESSION-007.

## Open questions

Distinguish loss of all expiration-identifying state from a known expired session; retention and recognition semantics need design.

## Verification Plan

Actual HTTP redirect evidence and browser Gherkin establish automatic tenant-specific login; distinguish missing, valid, and known-expired sessions.

Evidence assumptions follow the shared session context. Unresolved verification conditions follow the Open questions above; no additional operational monitoring claim is introduced.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
