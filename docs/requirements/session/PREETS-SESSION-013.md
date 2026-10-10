---
id: PREETS-SESSION-013
classifications:
  - Functional
---

# New session and fresh OIDC authentication after expiry

## Description

Users choosing authentication again after expiration must complete a fresh authentication event at the tenant’s OIDC provider and receive a new application session; the expired session must remain unusable.

## Rationale

Existing SSO alone provides weak evidence that the authorized user returned to an unattended workstation.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Reauthentication after expiration.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

## Acceptance criteria

1. Explicit recovery initiates tenant OIDC authentication and successful completion establishes a new application session bound to the authenticated user and tenant.
2. The old application session cannot be renewed or reused for protected access.
3. An existing IdP/SSO session alone cannot silently satisfy recovery: the application requests fresh authentication and verifies protocol evidence that a fresh event occurred.
4. The IdP chooses the authentication mechanism; entering a password is not required by this contract.
5. Cancelled, failed, or unconfirmed fresh authentication leaves protected access unavailable.

## Open questions

Define OIDC request/response freshness semantics, clock tolerance, broker/provider support, and failure behavior before implementation; do not infer freshness from a new application session identifier.

## Verification Plan

OIDC contract/integration checks observe freshness request semantics and validate authentication-event evidence, including stale/missing evidence and cancellation. Focused real-provider browser Gherkin with an existing SSO session demonstrates fresh authentication and new-session recovery; a mocked callback alone cannot establish provider behavior.

Evidence assumptions follow the shared session context. Unresolved verification conditions follow the Open questions above; no additional operational monitoring claim is introduced.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
