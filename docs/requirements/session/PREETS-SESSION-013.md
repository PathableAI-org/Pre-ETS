---
id: PREETS-SESSION-013
classifications:
  - Functional
---

# New session and fresh OIDC authentication without a valid application session

## Description

Every login without a valid application session must complete a fresh authentication event at the tenant’s
OIDC provider before establishing a new application session. This includes first-time visits, explicit
modal/Server Action recovery, and automatic protected-page entry through a new tab, refresh, or browser
back/forward navigation under PREETS-SESSION-004. Expired sessions remain unusable; valid application
sessions remain reusable without starting an independent login.

## Rationale

Existing SSO alone provides weak evidence that the authorized user returned to an unattended workstation.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Reauthentication after expiration.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

- Decision: Maintainer direction on 2026-10-12 confirms that post-expiration fresh-entry authentication must
  also require fresh OIDC authentication. Starting OIDC automatically does not permit existing SSO alone to
  satisfy authentication. This scope clarification is subject to Git/PR approval; protocol and provider
  decisions remain open.

- Decision: Maintainer direction on 2026-10-17 requires a fresh provider authentication event for every
  login without a valid application session, including first-time visits and explicit recovery. Existing IdP
  SSO alone cannot establish a new application session. A valid application session remains reusable.
  Freshness enforcement does not depend on recognizing previous expiration after old records are removed;
  no expiration-recognition retention mechanism is required solely for that decision. Protocol semantics,
  clock tolerance, and provider/broker support remain B6 decisions. This refinement is subject to Git/PR approval.

- Decision: Maintainer direction on 2026-10-17 selects `max_age=0` and validation of signed-ID-token
  `auth_time` as the delivery protocol baseline, rejecting missing or stale freshness evidence. The
  authentication-time comparison, clock tolerance, provider/broker support, and unsupported-provider
  handling remain open. See the [session delivery plan](../../delivery/session-management.md#b6-protocol-baseline-2026-10-17).
  This decision does not establish implemented or verified provider behavior and awaits Git/PR approval.

## Acceptance criteria

1. Every login without a valid application session, including first-time visits, explicit recovery, and
   automatic protected-page entry, initiates tenant OIDC authentication;
   successful fresh authentication establishes a new application session bound to the authenticated user and tenant.
2. The old application session cannot be renewed or reused for protected access.
3. An existing IdP/SSO session alone cannot silently satisfy any login without a valid application session:
   the application requests fresh authentication and verifies protocol evidence that a fresh event occurred.
   This obligation applies even when no prior application session is known or its stored record is gone;
   recognizing previous expiration is not a prerequisite for enforcing freshness.
4. The IdP chooses the authentication mechanism; entering a password is not required by this contract.
5. Cancelled, failed, or unconfirmed fresh authentication leaves protected access unavailable.

## Open questions

The `max_age=0` / signed-ID-token `auth_time` baseline is selected. Define the authentication-time
comparison, clock tolerance, broker/provider support, and unsupported-provider handling before affected
implementation. Prior-expiration recognition is no longer a freshness-selection decision:
all logins without a valid application session require freshness. Do not infer freshness from a new
application session identifier.

## Verification Plan

OIDC contract/integration checks observe the selected `max_age=0` request and validate signed-ID-token
`auth_time` evidence, including stale/missing evidence and cancellation under the comparison/clock policy
once decided. Focused real-provider browser Gherkin with an existing SSO session demonstrates fresh authentication and new-session recovery; a mocked callback alone cannot establish provider behavior. Exercise both explicit recovery and automatic
post-expiration entry through new tabs, refresh, and browser history with existing provider SSO, including
removed old-session records. Also exercise a first-time application visit with an existing provider SSO
session and no prior application-session record: fresh authentication is required. Confirm that an existing
valid application session is reused without starting a new login. Establish fresh-event evidence, denial
for stale/missing evidence, and continued denial of the old session; a redirect alone is insufficient.

Provider behavior must be assessed using the common tenant-configured OIDC contract. The repository
Compose Keycloak environment supports current development/test evidence; Microsoft is a first-class
compatibility scenario with the same freshness and failure expectations. Keycloak results do not establish
Microsoft compatibility. Exercise existing SSO and any relevant broker chain against the actual integration;
record unexecuted provider scenarios as limitations rather than treating them as passing evidence.

Evidence assumptions follow the shared session context. Unresolved verification conditions follow the Open questions above; no additional operational monitoring claim is introduced.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
