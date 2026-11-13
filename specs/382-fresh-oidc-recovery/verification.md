# Feature Verification Plan: Complete Fresh Tenant OIDC Recovery With a New Session

**Feature specification**: [spec.md](spec.md)

**Delivery issue**: https://github.com/PathableAI-org/Pre-ETS/issues/158

**Status**: Planned — no execution evidence is recorded by this document

## Authority and scope

Claims derive from PREETS-SESSION-013 AC1–5 and its Observability obligation, the freshness portion of
PREETS-SESSION-004 AC1, issue #158's completion evidence, and the 2026-11-09 B6 decision, all read at `origin/main`
`2e6142e2c15caed4d630019be834fe627fe5beed`. This plan refines evidence for S6 and creates no product obligation.

Out of verification scope: #157's recovery content, Server Action 401, concealment, and modal; #156 warnings;
identity-provider logout; Microsoft and broker compatibility, which are recorded as limitations. A redirect, a new
application session identifier, or a mocked callback alone never establishes freshness.

Unlike #154 and #155, this feature's live claims need no external gate: confirming freshness is what lets the running
application establish a real session. Only V-014 waits on #157.

## Claims and traceability

| ID    | Claim to establish                                                                                                        | Authoritative source                                  | Meaningful violation                                                                                                       | Required observation                                                                                                                                                                  | Evidence channel                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| V-001 | Every login without a valid session asks the tenant's provider for fresh authentication.                                  | SESSION-013 AC1, AC3; B6 protocol baseline            | A login request omits the fresh-authentication demand, or one tenant's login reaches another tenant's provider.            | The authorization request the browser is sent to, per tenant, carries the fresh-authentication demand.                                                                                | Requirements BDD; browser interaction                   |
| V-002 | With an existing provider SSO session, a first-time visit requires a fresh provider authentication step before a session. | SESSION-013 AC1, AC3; SESSION-004 AC1; issue B6 notes | The provider returns silently on SSO and the application establishes a session.                                            | With provider SSO already held, the provider presents an authentication step, and a session exists only after it; the confirmed event falls inside the window.                        | Browser interaction; server telemetry                   |
| V-003 | A confirmed fresh login establishes a new session bound to the authenticated user and resolved tenant.                    | SESSION-013 AC1                                       | No session results, or the session names another user or tenant, or the next protected request is denied.                  | After login, the next protected request is granted and the session's bound tenant matches the resolved tenant.                                                                        | Requirements BDD; server telemetry                      |
| V-004 | Freshness is confirmed exactly within [transaction start − 30 s, callback time + 30 s], inclusive.                        | SESSION-013 AC3; B6 2026-11-09                        | A value outside either bound is admitted, a value inside is denied, or the window is measured from callback time only.     | Outcome for authentication times just inside and just outside each bound, and for a time between the transaction start and callback time.                                             | Module test                                             |
| V-005 | Missing authentication-time evidence is denied: transaction consumed, no session, new login possible.                     | SESSION-013 AC3, AC5; B6 2026-11-09                   | A session is established, the transaction can be replayed, or the user cannot start a new login.                           | No session cookie and no session record after the callback; replaying the same return is denied; a new login can then start.                                                          | Module test; requirements BDD                           |
| V-006 | Stale authentication-time evidence is denied with the same outcome as V-005.                                              | SESSION-013 AC3, AC5; B6 2026-11-09                   | As V-005, for a stale or future-beyond-tolerance time.                                                                     | As V-005.                                                                                                                                                                             | Module test; requirements BDD                           |
| V-007 | Cancelled or failed provider authentication leaves protected access unavailable.                                          | SESSION-013 AC5                                       | A cancelled or error return establishes a session or grants a protected request.                                           | After cancelling at the provider and after a provider error, no session exists and the next protected page request starts login again.                                                | Requirements BDD; browser interaction                   |
| V-008 | A provider that cannot supply fresh evidence fails closed, with no opt-out or fallback.                                   | B6 2026-11-09                                         | A tenant setting, re-prompt, or metadata substitute lets such a provider establish sessions.                               | Logins from a provider configured to omit or not refresh the authentication time are denied for every tenant using it, and no configuration path admits them.                         | Module test; manual inspection                          |
| V-009 | The authentication mechanism is the provider's choice; only freshness evidence is judged.                                 | SESSION-013 AC4                                       | The application demands or inspects a password or a specific mechanism.                                                    | The login request names no mechanism, and a fresh event confirmed by time alone is accepted.                                                                                          | Browser interaction; module test                        |
| V-010 | After expiration, new-tab, refresh, and back/forward entry each require fresh authentication and yield a new session.     | SESSION-004 AC1; SESSION-013 AC1, AC3; issue S6-B     | Any entry path reuses provider SSO silently, restores the old session, or grants access without a new confirmed login.     | For each path with provider SSO held: login starts, the provider presents an authentication step, the confirmed event is inside the window, and the session differs from the old one. | Browser interaction; server telemetry; requirements BDD |
| V-011 | Fresh authentication is required even when the old session's record has been removed.                                     | SESSION-013 AC3; SESSION-004 AC1                      | With the record gone, entry is treated as a first visit that SSO can satisfy, or the old reference regains access.         | As V-010, with the old record deleted before entry.                                                                                                                                   | Browser interaction; server telemetry                   |
| V-012 | The old session stays unusable after a fresh login.                                                                       | SESSION-013 AC2                                       | A request with the old session reference reaches protected content or renews anything.                                     | A protected request replaying the old reference after the new login is denied and no session deadline changes for it.                                                                 | Requirements BDD; server telemetry                      |
| V-013 | History restoration without a valid session shows no usable protected content.                                            | SESSION-004 AC1                                       | Back/forward displays a previously viewed protected page that can be read or operated before a new session.                | After expiration, history navigation shows no readable or operable protected content before fresh login completes.                                                                    | Browser interaction                                     |
| V-014 | Explicit Log in from each delivered entry point requires fresh authentication and yields a new session.                   | SESSION-013 AC1; issue S6-C                           | Log in from a notice, recovery content, or modal reuses SSO silently or revives the old session.                           | From the signed-out notice, and from #157's recovery content and modal once present, keyboard Log in leads to a provider authentication step and a new session.                       | Browser interaction; server telemetry                   |
| V-015 | A valid session is reused without a new login.                                                                            | SESSION-013 description; SESSION-004 description      | A new tab with a valid session starts a login or receives a different session.                                             | A new tab with a valid session issues no provider request and is served by the same session.                                                                                          | Browser interaction; server telemetry                   |
| V-016 | The user-facing denial is the safe authentication-failure outcome and leaks nothing.                                      | SESSION-013 AC5; issue completion evidence            | The page shows a token, code, claim, or a different outcome from other failures.                                           | The page after a freshness denial matches the other authentication-failure outcome and shows no token, code, or identity data.                                                        | Browser interaction                                     |
| V-017 | Operator diagnostics distinguish missing from stale evidence per tenant without tokens, codes, or claims.                 | SESSION-013 Observability                             | The two cases are indistinguishable, are confused with provider unavailability, lack the tenant, or include identity data. | For one missing and one stale denial, real diagnostics show the tenant and the category, differ from a provider-unavailable case, and contain no token, code, or claim.               | Server telemetry (manual inspection)                    |

## Automated behavioral evidence

| Claim IDs                                | Evidence boundary                                                     | Planned scenario or property                                                                                                                                                                                                                                                           | Why this boundary is meaningful                                                                          | Known limits                                                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| V-004, V-005, V-006, V-008, V-009        | Callback boundary with signed ID tokens from a controlled test issuer | Examples just inside and outside each bound and between them, a future time beyond tolerance, and a missing time; a property that admission holds exactly when the time lies in the window, for arbitrary transaction starts and callback times; no tenant setting changes the result. | Real signature validation with controlled times reaches cases a real provider cannot be made to produce. | Does not establish real-provider behavior or browser flow.                                                                     |
| V-001, V-003, V-005, V-006, V-007, V-012 | Requirements BDD against the running application and local provider   | Tagged `@preets-session-013` scenarios: fresh-auth request per tenant; successful fresh login and granted next request; cancelled and failed returns; replayed callback denied; old reference denied after new login. Feature-level `@partial` until V-014 composes #157.              | Stakeholder-readable evidence through the actual application boundary.                                   | Missing and stale cases at this boundary need a provider fixture able to produce them; otherwise covered by module tests only. |
| V-010, V-011, V-013                      | Requirements BDD with browser context and controllable expiry         | Tagged `@preets-session-004` and `@preets-session-013` scenarios: expire a real session (and separately delete its record), then new tab, refresh, and back/forward with provider SSO held.                                                                                            | Browser history and caching behave differently from direct HTTP requests.                                | Local provider only.                                                                                                           |

Requirements-backed BDD uses requirement versions from current `origin/main` with requirement-ID tags. A dry run
establishes discovery only.

## Agent-executable manual feature verification _(mandatory)_

### Purpose

Observe, in one composed real-provider journey, that existing provider SSO never silently produces a session: on a
first visit and again after expiration, the provider visibly asks for authentication, the confirmed event time falls
inside the window, a new session results, and the old one stays dead. Also inspect the freshness diagnostics for
missing and stale denials, which no durable test asserts.

### Prerequisites

- The repository's local services, including the local identity provider with its tracked realm, Redis, and the
  shared local observability stack, with OTEL enabled and the run filters from the verification harness.
- Two synthetic tenants from the repository fixtures; a synthetic provider user from the tracked realm.
- Playwright with one browser context; Grafana MCP read access.
- A way to make the provider omit and to make it return a stale authentication time for one test client, if the plan
  supplies one; otherwise steps 7–8 use the callback-boundary fixture and record the limitation.
- Owned Redis key prefix `preets:verify:<run-uuid>:`.

### Procedure

1. Start the application at the requested revision with the harness settings. Record the revision and run UUID.
2. In the browser context, sign in directly at the provider so that a provider SSO session exists. Confirm that no
   application session cookie exists.
3. Request a protected page for tenant A. Observe the login redirect, whether the provider presents an authentication
   step despite SSO, and complete it. Record the outcome and the freshness decision for that callback.
4. Confirm the next protected request is granted for tenant A and that tenant B still requires its own login.
5. Record the current session reference. Advance or force expiry, then separately delete the session record. For
   each of new tab, refresh, and back/forward: observe what is shown before login, whether the provider presents an
   authentication step, and the resulting session.
6. Replay a protected request with the old session reference. Observe denial and that no deadline changed.
7. Produce one missing-evidence and one stale-evidence denial. Observe the user-facing page and that a new login can
   start afterwards.
8. In Grafana, query the run's diagnostics for steps 3 and 7 and for one provider-unavailable login. Inspect every
   exported field for tokens, codes, and identity claims.
9. From the signed-out notice after logout, activate Log in by keyboard and repeat step 3's observations. If #157 is
   present at the revision, repeat from its recovery content and modal.
10. Clean up: close the browser context, end the provider session, delete owned Redis keys, stop processes.

### Expected observations

- Steps 3 and 5: the provider presents an authentication step every time; each confirmed event is inside the window;
  each login yields a session different from the old one (V-002, V-003, V-010, V-011).
- Step 5: no readable or operable protected content appears before login (V-013).
- Step 6: the old reference is denied (V-012).
- Step 7: no session; same safe page as other failures; new login possible (V-005, V-006, V-016).
- Step 8: tenant and missing-versus-stale category visible and distinct from provider unavailability; no tokens,
  codes, or claims anywhere (V-017).
- Step 9: fresh authentication and a new session from each present entry point (V-014).

### Evidence to retain

Revision, run UUID, tenants and synthetic user, per-step outcome and freshness decision, trace IDs and query time
ranges, the result per claim, and limitations. No screenshots, tokens, codes, or raw query output are committed.

## Harness observations

- V-002, V-010, V-011, V-014: for each callback, whether freshness was confirmed, missing, or stale, and whether the
  event time fell inside the window, attributable to the tenant and the browser step.
- V-003, V-010, V-012, V-015: which session served a protected request and its bound tenant, so a verifier can tell a
  new session from the old one and a joined tab from a new login.
- V-017: the freshness denial category per tenant, distinct from provider unavailability.

Never emitted: ID tokens, authorization codes, access or refresh tokens, the raw authentication-time claim or any
other identity claim, subject identifiers, session references or cookie values, state, nonce, and PKCE values. The
window comparison is verified through the outcome and module tests; session identity is compared through the
non-secret identifiers the observability conventions already allow.

## Operational observability verification

PREETS-SESSION-013 establishes one obligation: freshness denials distinguish missing from stale evidence for the
tenant without exposing tokens, codes, or identity claims. Verify it by manual inspection of real exported logs or
telemetry (procedure step 8). Durable tests do not assert log or telemetry output.

## Environment and data controls

- Synthetic tenants and the tracked realm's synthetic user only; no real client records or credentials.
- Provider test credentials stay in the repository's fixtures and are never recorded in evidence.
- Controlled provider failure, cancellation, and missing/stale evidence use local fixtures only.
- The run owns its Redis prefix, ports, and browser context and cleans them up.

## Evidence retention and reporting

Execution results go in the feature's `quickstart.md` per slice: revision, environment, conditions, observations by
claim ID, result, cleanup, and limitations, as the verification harness requires. This document records plans only.

## Limitations and incomplete claims

- V-014 through #157's recovery content and modal stays incomplete until #157 delivers them; #158 does not close
  before that composition is verified.
- Microsoft identity integration and any broker chain are unexecuted; local provider results do not establish them.
- If no provider fixture can produce missing or stale evidence, V-005 and V-006 at the application boundary rest on
  module tests, and V-017 uses the same fixture at the callback boundary.
- Pixels painted before page scripts run on history restoration are outside application control (B5 limitation).
- V-002, V-010, and V-011 hold only when the previous provider authentication precedes the login by more than the
  window's lower tolerance or the provider's timestamp resolution. A provider authentication no more than 30 seconds
  before the transaction's start is inside the window and may be admitted without a new provider step, including the
  local provider's same-second case (spec edge cases, FR-007). Journeys wait past that resolution before each entry
  so the provider step is observable.
- Assistive-technology observation of explicit Log in belongs to #155's and #157's journeys; this feature observes
  keyboard activation only.

## Readiness review

- [x] Every feature claim maps to an authoritative source.
- [x] Every claim states the observation that distinguishes it and an evidence channel able to make it.
- [x] Successful, failure, rejection, security/privacy, accessibility, and operational outcomes are covered where applicable.
- [x] The manual feature procedure is non-empty, executable by an agent, and adds a distinct observation.
- [x] Environmental prerequisites, evidence retention, cleanup, and limitations are explicit.
- [x] Planned evidence is not described as executed or verified.
- [x] No implementation architecture is required to understand the feature claims.
