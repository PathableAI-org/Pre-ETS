---
id: PREETS-SESSION-004
classifications:
  - Functional
---

# Automatic login on fresh protected-page entry

## Description

A user requesting a protected page with no application session must automatically enter the resolved tenant’s
OIDC authentication flow. Fresh protected-page entry through a new tab, an existing-tab refresh, or browser
back/forward navigation starts that flow directly without a valid session, including when the previous
session expired. Opening a tab while a valid session exists still joins that session under
PREETS-SESSION-010.

## Rationale

First access should not require finding a separate login control.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Authentication and protected resources.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

- Decision: Maintainer direction on 2026-10-12 replaces the originally accepted expired-SSR redirect policy.
  Fresh protected-page entry through a new tab, refresh, or browser back/forward navigation without a valid
  session starts tenant OIDC directly. Already-open authenticated tabs retain the blocking expiration modal.
  Expired or missing-record protected Server Actions return HTTP 401 and display dedicated unauthenticated
  recovery content with an explanation and Login action, without automatic OIDC. Explain expiration when
  known and an unavailable session when its cause is unknown. The active modal blocks in-page navigation;
  its expiration explanation and recovery are equivalent to the Server Action recovery content.
  Rendering mechanisms belong to engineering. No expiration-recognition retention period is required by
  this policy. This refinement is subject to Git/PR approval.

## Acceptance criteria

1. A protected page request without an application session initiates the resolved tenant’s OIDC flow automatically.
   New-tab entry, existing-tab refresh, and browser back/forward navigation to a protected page with an
   expired session also start tenant OIDC directly rather than redirecting to the session-expired page.
   These post-expiration flows require fresh authentication and verified provider evidence under
   PREETS-SESSION-013; existing IdP SSO alone cannot satisfy them.
   Browser history must not restore usable protected content under an expired session.
2. Fresh entry does not replace the browser expiration modal required by PREETS-SESSION-012 or the
   expired- or missing-session Server Action recovery content required by PREETS-SESSION-007.

## Open questions

Fresh-authentication protocol semantics and recognition of previous expiration after stored state is
removed remain B6 decisions under PREETS-SESSION-013. Automatic entry does not exempt expired sessions
from freshness. Server Action failure/status and recovery presentation are governed by PREETS-SESSION-007.

## Verification Plan

Actual HTTP redirect evidence and browser Gherkin establish tenant-specific automatic login for missing
sessions and fresh entry after expiration through new tabs, existing-tab refresh, and browser back/forward
navigation, including when the old stored record has been removed. Browser-history evidence must establish
that an expired session cannot regain protected use through restored page state.
A new tab with a still-valid session must join it under PREETS-SESSION-010 rather than start independent login.
Separate running-tab and Server Action evidence must establish the explicit recovery paths without treating
all requests as fresh entry. Real-provider evidence with an existing SSO session must establish fresh
authentication for expired fresh entry and denial for stale or unconfirmed freshness under PREETS-SESSION-013.
Automatic redirects or a newly created application session alone do not establish authentication freshness.

Evidence assumptions follow the shared session context. No additional operational monitoring claim is introduced.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
