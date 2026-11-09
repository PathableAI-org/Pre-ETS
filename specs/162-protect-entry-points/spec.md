# Feature Specification: Protect Application Entry Points and Bind Tenant Authentication

**Feature Branch**: `162-protect-entry-points`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "https://github.com/PathableAI-org/Pre-ETS/issues/154"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Deny Unauthenticated Access at Every Protected Entry Point (Priority: P1)

As a tenant's users and operators, we can rely on every frontend page, route handler, and Server Action, including
`/` and resources added later, to withhold protected content and effects from a request without a usable application
session, whether the request arrives by in-app navigation or directly.

**Why this priority**: Default protection prevents accidental public exposure. It is valuable on its own, does not
depend on a successful login, and every other story builds on it.

**Independent Test**: Without a session, request every inventoried protected page, route handler, and Server Action
directly, then add a new resource that has no public designation. Confirm that none returns protected content or
performs a protected effect, and that the new resource is protected without any per-resource opt-in.

**Acceptance Scenarios**:

1. **Given** a request with no usable application session and a successfully resolved tenant, **When** it directly
   requests any protected page, including `/`, **Then** no protected content is returned and that tenant's OIDC
   authentication flow begins automatically.
2. **Given** a request with no usable application session, **When** it directly requests a protected route handler,
   **Then** no protected content or protected effect is produced.
3. **Given** a request with no usable application session, **When** the actual protected Server Action is invoked
   through its browser consumer or by a direct request, **Then** its protected side effect does not occur, no
   protected result is returned, and the denial is observable.
4. **Given** a page, route handler, or Server Action is added without an explicit public designation, **When** it is
   requested without a usable session, **Then** it is protected exactly as existing protected resources are.
5. **Given** a request presents a malformed, forged, missing-record, expired, or invalidated session reference, or a
   forged tenant or identity context, **When** any protected entry point handles it, **Then** it gains no protected
   identity, content, or effect.

---

### User Story 2 - Sign In Through the Tenant's Provider and Use the Application (Priority: P1)

As a user of a tenant, I am sent to my tenant's configured identity provider when I need to sign in, never asked for
a local username and password, and after a successful, confirmed-fresh authentication my subsequent protected
requests use my identity and that tenant, including through a different running application instance.

**Why this priority**: Actual tenant-provider login that establishes a usable identity is the slice's core
observable increment. Its successful completion is gated on the unresolved freshness confirmation decision owned by
[#158](https://github.com/PathableAI-org/Pre-ETS/issues/158) (see Dependencies and blockers).

**Independent Test**: On tenant A with no application session, request a protected page, complete authentication at
tenant A's provider, and confirm that a subsequent protected request uses the authenticated user and tenant A. Send
later protected requests through an independently running second application instance without affinity and observe
the same identity. Repeat with a failed, cancelled, or rejected provider return and confirm no session results.

**Acceptance Scenarios**:

1. **Given** a request for tenant A with no application session, **When** login begins, **Then** the user is directed
   to tenant A's configured OIDC provider (never another tenant's), the request asks for fresh authentication, and the
   application presents no local username/password form.
2. **Given** tenant A's provider returns a valid authentication whose freshness is confirmed under the B6 policy,
   **When** the callback completes, **Then** an application session is established bound to the authenticated user
   and tenant A, and the next protected request uses that user and tenant.
3. **Given** the provider return is failed, cancelled, rejected, forged, replayed, for another tenant, or lacks
   confirmed freshness evidence, **When** the callback handles it, **Then** no authenticated application session is
   established, protected access stays unavailable, and the sign-in failure is explained without authenticated
   access.
4. **Given** a session established through application instance A, **When** later protected requests reach
   independently running instance B without affinity, **Then** B recognizes the same user and tenant.
5. **Given** a session established through instance A, **When** qualifying renewal occurs through A and later
   expiration is enforced through B, **Then** each instance honors the other's authoritative outcome.

---

### User Story 3 - Forbid Cross-Tenant Use of a Session (Priority: P1)

As a tenant and its users, we can rely on a session from one tenant never granting access under another tenant: each
protected request resolves its tenant independently, and a mismatch yields an HTTP 403 Forbidden experience.

**Why this priority**: Tenant isolation is a constitutional obligation. A session-derived tenant replacing the
request tenant would expose one tenant's application to another tenant's users.

**Independent Test**: Present a usable tenant-A session on requests that independently resolve tenant B, across
pages, route handlers, and the protected Server Action. Confirm HTTP 403 semantics, a forbidden presentation for
document requests, no protected content or effect, and no substitution of tenant A.

**Acceptance Scenarios**:

1. **Given** a usable session whose tenant equals the independently resolved request tenant, **When** a protected
   entry point is requested, **Then** tenant binding succeeds and access depends only on the resource's other checks.
2. **Given** a usable session bound to a different tenant than the independently resolved request tenant, **When**
   any protected page, route handler, or Server Action is requested, **Then** access is forbidden with HTTP 403
   semantics, a document request presents an accessible forbidden page, and no protected content or effect occurs.
3. **Given** a usable session, **When** a protected request is handled, **Then** request tenant resolution still runs
   and its result is never replaced by, or derived from, the session tenant.
4. **Given** host-based or static tenant resolution, **When** tenant binding is evaluated, **Then** it compares the
   resolved tenant identity regardless of which resolution mode produced it.

---

### User Story 4 - Keep Public Resources, Diagnostics, and Tenant Failures Intact (Priority: P2)

As a user starting or recovering sign-in, and as an operator verifying a deployment, I can reach the explicitly
public resources without a session, while their tenant, configuration-safety, and production-ingress obligations
remain intact and accepted tenant failures keep their outcomes.

**Why this priority**: Default protection must not block login completion, sign-in error explanation, recovery
content, or diagnostics, and public status must not become a tenant or security bypass.

**Independent Test**: Without a session, request the OIDC callback, sign-in error page, every `/_test` route, the
dedicated expired/missing-session recovery content, and the static assets needed to display those pages. Confirm
reachability, that `GET /_test/tenant-config` creates no session, that public assets carry no protected information,
and that invalid tenants retain their accepted 404/500 outcomes.

**Acceptance Scenarios**:

1. **Given** no application session, **When** the OIDC callback, sign-in error page, any route under `/_test`, or the
   dedicated expired/missing-session recovery content is requested, **Then** it is reachable without authentication.
2. **Given** no application session, **When** `GET /_test/tenant-config` completes, **Then** no application session is
   created and its no-store and non-secret configuration obligations still apply.
3. **Given** a static asset needed to display an unauthenticated page, **When** it is requested without a session,
   **Then** it loads only if it contains no protected information; any other asset remains protected.
4. **Given** a tenant-dependent request whose tenant cannot be selected or whose configuration cannot be loaded,
   **When** it is handled, public or protected, **Then** the accepted tenant 404/500 outcome applies, no fallback
   tenant is substituted, and the condition is not converted into a login, forbidden, or success outcome.
5. **Given** a tenant integration that needs a credential, **When** authentication runs, **Then** the credential is
   obtained server-side from a non-secret lookup key, and neither tenant configuration nor diagnostic responses
   contain credentials or resolved secrets.

---

### User Story 5 - Join a Valid Session or Start Fresh Entry Without One (Priority: P2)

As a signed-in user, opening another tab joins my existing session; as a user without a valid session, opening a new
tab, refreshing, or using browser back/forward on a protected page takes me directly to my tenant's sign-in instead
of a session-expired page, and browser history never restores usable protected content.

**Why this priority**: Distinguishing joining from fresh entry prevents both needless re-login and protected use
after a session has ended. Final freshness confirmation for these entries completes under #158.

**Independent Test**: With a valid session, open a new tab on a protected page and confirm it joins without a new
login. Let the session expire or remove its record, then open a new tab, refresh, and navigate back/forward to a
protected page; confirm each starts the tenant's OIDC flow directly and that no restored page permits protected use.

**Acceptance Scenarios**:

1. **Given** a valid application session, **When** the user opens a new tab on a protected page of the same tenant,
   **Then** the tab joins that session and no independent login starts.
2. **Given** an expired session or a session whose record no longer exists, **When** the user enters a protected page
   through a new tab, an existing-tab refresh, or browser back/forward navigation, **Then** the tenant's OIDC flow
   starts directly rather than a session-expired page, regardless of whether the previous expiration is recognized.
3. **Given** a protected page was viewed under a session that has since expired, **When** browser history restores
   that page, **Then** no usable protected content or protected action is available under the expired session.
4. **Given** fresh-entry behavior is in place, **When** a running authenticated tab expires or a protected Server
   Action meets an expired or missing session, **Then** fresh entry does not replace the running-tab expiration modal
   or the Server Action recovery path owned by later slices.

### Edge Cases

- A protected page request whose tenant cannot be resolved: the accepted tenant 404/500 outcome wins; automatic login
  begins only after successful tenant resolution, and session state never supplies a fallback tenant.
- A session for tenant A is replayed on tenant B's host or with forged tenant context: tenant B remains the request
  tenant and the request is forbidden with HTTP 403; tenant A is never substituted.
- A public resource is requested with a valid, mismatched, invalid, or absent session reference: its public status
  does not depend on the session, but its tenant, configuration-safety, and ingress obligations still apply.
- A provider return arrives for a login attempt begun on another tenant or another application instance: it is
  validated under the request's independently resolved tenant and never establishes a session for another tenant.
- An attacker submits a crafted callback without a matching login attempt, or replays a consumed one: no session is
  established and the sign-in failure is explained without exposing provider or storage details.
- The provider has an existing single sign-on session: login still requests fresh authentication, and no application
  session is established without confirmed freshness evidence; a redirect or new session identifier alone is not
  proof.
- Session state cannot be read because the session service or store fails: protected access fails closed, the failure
  is not treated as an absent session or success, and no replacement login or session is silently created.
- The protected Server Action is retried after denial: no denied attempt produces its protected side effect.
- A route handler, Server Action, or page is added under an existing or new path without explicit public designation:
  it is protected by default.
- A user signs in successfully, then the tenant configuration changes: subsequent tenant binding still uses the
  independently resolved request tenant; lifecycle policy adoption remains owned by the delivered renewal behavior.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Every frontend page, route handler, and Server Action, including `/`, MUST be protected unless it is
  explicitly designated public; protection MUST apply at each entry point, including direct requests, not only to
  navigation through another page.
- **FR-002**: A resource added to the application MUST be protected by default without any per-resource opt-in, and
  the default MUST be demonstrable for resources beyond any finite sample.
- **FR-003**: A request without a usable application session MUST NOT obtain protected content or cause a protected
  effect at any protected entry point.
- **FR-004**: A protected page request without an application session and with a successfully resolved tenant MUST
  automatically begin that tenant's OIDC authentication flow without first exposing protected content.
- **FR-005**: The application MUST provide an actual protected Server Action with a browser consumer whose denied
  invocation makes the absence of its safe side effect observable, without introducing a new domain workflow or
  durable business record.
- **FR-006**: The explicitly public resources MUST be exactly the OIDC callback, the sign-in error page, all routes
  under `/_test`, the dedicated expired/missing-session recovery content, and static assets needed to display those
  unauthenticated pages that contain no protected information.
- **FR-007**: `GET /_test/tenant-config` MUST NOT create an application session.
- **FR-008**: Public status MUST NOT bypass request tenant resolution, the non-secret configuration obligation,
  diagnostic no-store behavior, or separate production-ingress blocking of `/_test`.
- **FR-009**: Login MUST use the OIDC integration configured for the independently resolved request tenant, never
  another tenant's, and MUST NOT couple application behavior to a particular identity-provider vendor.
- **FR-010**: The application MUST NOT collect local username/password credentials; users MUST be directed to the
  tenant's identity provider.
- **FR-011**: Tenant configuration MUST contain only non-secret integration settings and, when needed, non-secret
  lookup keys; required credentials MUST be resolved server-side and MUST NOT appear in tenant configuration or
  diagnostic responses.
- **FR-012**: Every login without a valid application session MUST request fresh authentication from the provider,
  and the callback MUST NOT establish an application session unless the authentication is validated and its
  freshness is confirmed under the B6 policy owned by #158. This feature MUST NOT choose the freshness comparison,
  clock tolerance, provider/broker support, or unsupported-provider handling.
- **FR-013**: Successful, confirmed-fresh OIDC completion MUST establish an application session bound to the
  authenticated user and the tenant under which authentication occurred.
- **FR-014**: Failed, cancelled, rejected, forged, replayed, cross-tenant, or freshness-unconfirmed authentication
  MUST NOT establish an authenticated application session, and the user MUST be able to understand the failure
  through the public sign-in error experience without authenticated access.
- **FR-015**: A subsequent protected request MUST use the established user identity and tenant association.
- **FR-016**: A session established through one application instance MUST be recognized with the same user and tenant
  by an independently running instance without affinity, and renewal through one instance and expiration enforced
  through another MUST be honored across instances at the application boundary.
- **FR-017**: Every protected request using a session MUST compare the independently resolved request tenant with
  the session tenant and MUST grant tenant binding only when they are equal, regardless of tenant resolution mode.
- **FR-018**: A tenant mismatch MUST forbid access with HTTP 403 semantics at every protected entry point, MUST
  expose no protected content or effect, and document requests MUST present an accessible forbidden experience.
- **FR-019**: A valid session MUST NOT bypass request tenant resolution, and the session tenant MUST NOT replace or
  alter the resolved request tenant.
- **FR-020**: Accepted tenant failure outcomes (invalid or unknown host 404, selected-configuration 404/500) MUST be
  preserved for public and protected requests and MUST NOT be converted into login, forbidden, or session outcomes.
- **FR-021**: A malformed, forged, missing-record, expired, or invalidated session reference, and a session service
  or store failure, MUST fail closed; a service failure MUST NOT be treated as success or authorize silent replacement
  login or session creation. No prior-expiration retention MAY be required solely to select freshness.
- **FR-022**: Opening a protected page in a new tab while a valid session exists MUST join that session rather than
  start an independent login.
- **FR-023**: Protected-page entry through a new tab, existing-tab refresh, or browser back/forward navigation without
  a valid session, including after expiration or record removal, MUST start the tenant's OIDC flow directly rather
  than show a session-expired page.
- **FR-024**: Browser history MUST NOT restore usable protected content or protected actions under an expired session.
- **FR-025**: Fresh-entry behavior MUST NOT replace or pre-empt the running-tab expiration modal or the expired- and
  missing-session Server Action recovery path; those presentations remain owned by later slices.
- **FR-026**: The sign-in error page, forbidden page, and protected-action browser consumer MUST be operable by
  keyboard with visible focus and meaningful accessible names, and their outcomes MUST be perceivable.
- **FR-027**: Denied, forbidden, sign-in failure, and public diagnostic responses MUST NOT reveal protected content,
  session identity, tokens, credentials, or provider/storage internals.
- **FR-028**: The delivered application MUST maintain an inventory of public designations and protected entry-point
  categories sufficient for a reviewer to confirm FR-001, FR-002, and FR-006.

### Key Entities

- **Resolved Request Tenant**: The tenant selected independently from each request under the accepted tenant rules.
  It remains authoritative for that request and is never replaced by session state.
- **Application Session**: The temporary, server-authoritative association of an authenticated user with the tenant
  under which authentication occurred, usable only while unexpired and valid.
- **Protected Entry Point**: Any frontend page, route handler, or Server Action, current or future, that is not an
  explicitly designated public resource.
- **Public Resource**: One of the explicitly designated exceptions in FR-006. It needs no application session but
  retains its tenant, configuration-safety, content-safety, and ingress obligations.
- **Login Attempt**: A tenant-bound, fresh-authentication request to the tenant's provider whose return is validated
  before any session is established.
- **Protected Server Action**: The actual browser-invoked operation with a safe, observable side effect used to show
  denial and later recovery, without a domain workflow.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of inventoried protected pages, route handlers, and Server Actions, plus at least one newly added
  undesignated resource of each kind, return no protected content and produce no protected effect when requested
  directly without a usable session.
- **SC-002**: In every exercised no-session protected page request with a resolvable tenant, the tenant's own
  provider sign-in begins and no protected content is displayed first.
- **SC-003**: 100% of exercised cross-tenant session uses are forbidden with HTTP 403 semantics, show a forbidden
  experience for document requests, and never act under the session's tenant.
- **SC-004**: 100% of exercised failed, cancelled, rejected, forged, replayed, cross-tenant, and freshness-unconfirmed
  provider returns establish zero application sessions.
- **SC-005**: Once freshness confirmation is available, every exercised successful tenant login yields a subsequent
  protected request that shows the authenticated user and tenant, through both the originating and an independently
  running second instance.
- **SC-006**: Every designated public resource is reachable without a session; every unauthenticated diagnostic
  request creates zero sessions; every publicly loadable asset is assessed to contain no protected information.
- **SC-007**: Every exercised invalid-tenant or configuration-failure request keeps its accepted 404 or 500 outcome
  with no fallback tenant.
- **SC-008**: A new tab with a valid session joins it in every exercised case; new-tab, refresh, and back/forward
  entry without a valid session start tenant sign-in in every exercised case, and no history-restored page permits
  protected use.
- **SC-009**: A keyboard-only user can reach and operate the sign-in error page, forbidden page, and protected action
  consumer with visible focus and a perceivable outcome.
- **SC-010**: No exercised tenant configuration, diagnostic response, denial, or sign-in failure contains credentials,
  resolved secrets, tokens, or protected content.

## Assumptions

- Closed #153 and its closed children #215–#221 supply the reusable configuration, OIDC initiation, callback
  validation, session, reference enforcement, renewal/expiration, and invalidation/outage capabilities and fixtures.
  This feature integrates and extends them application-wide; closure does not establish requirement verification.
- The bounded reference page and protected Server Action delivered by #219 are the starting consumers; this feature
  extends them to comprehensive coverage rather than rebuilding them.
- Route handlers and direct Server Action requests without a usable session must deny without protected content or
  effect. The accepted requirements establish no specific denial status for these; the final expired/missing Server
  Action HTTP 401 and recovery content belong to #157, and backend/API expiration responses are out of scope.
- Whether the HTTP 403 forbidden page is rendered directly or reached through navigation is left to planning, as
  PREETS-SESSION-005 permits, provided HTTP 403 semantics and the absence of protected content hold.
- The repository's local identity provider is the current development and test integration. Microsoft integration is
  a first-class compatibility scenario whose execution remains outstanding; local results do not establish it.
- Missing, malformed, expired, and invalidated session references may share a no-usable-session outcome when the
  cause is unknown; this feature adds no cause or prior-expiration retention.
- Production ingress blocking of `/_test` and diagnostic configuration safety have their own evidence; application
  public access does not establish them.

## Delivery Authority and Scope _(mandatory)_

**Delivery issue**: [#154 — Protect application entry points and bind tenant authentication](https://github.com/PathableAI-org/Pre-ETS/issues/154),
read in its current open state on 2026-11-08, including its 2026-10-17 B6 and shared-component ownership sections.

**Originating delivery slice**: [S1 — Protect application entry points and bind tenant authentication](https://github.com/PathableAI-org/Pre-ETS/blob/e206d165f0f30999220922f57a3f92549c15f4cc/docs/delivery/session-management.md#s1--protect-application-entry-points-and-bind-tenant-authentication),
approved by the merge of PR #189 at `e206d165f0f30999220922f57a3f92549c15f4cc`. The 2026-10-17 B6 and ownership
refinements were merged by PR #222 and are present in
[the current plan](https://github.com/PathableAI-org/Pre-ETS/blob/43215557c35380322d759d2918456e02c3a0c7b2/docs/delivery/session-management.md#s1--protect-application-entry-points-and-bind-tenant-authentication).
Current `origin/main` authority was inspected at `43215557c35380322d759d2918456e02c3a0c7b2`.

### Accepted requirement coverage

| Requirement                                                                                                                                                   | Acceptance criteria in this slice | Feature disposition                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PREETS-SESSION-001](https://github.com/PathableAI-org/Pre-ETS/blob/43215557c35380322d759d2918456e02c3a0c7b2/docs/requirements/session/PREETS-SESSION-001.md) | AC1–3                             | Specified in full (FR-001–FR-008, FR-028). The recovery-content exception is preserved as public; the recovery content itself is #157's. Production ingress and diagnostic safety retain separate evidence.                                                                                                                                                   |
| [PREETS-SESSION-002](https://github.com/PathableAI-org/Pre-ETS/blob/43215557c35380322d759d2918456e02c3a0c7b2/docs/requirements/session/PREETS-SESSION-002.md) | AC1–3                             | Specified (FR-009–FR-011). A completed provider round trip that yields a session is gated on #158 freshness confirmation. Microsoft and broker-chain compatibility remain explicitly unexecuted limitations.                                                                                                                                                  |
| [PREETS-SESSION-003](https://github.com/PathableAI-org/Pre-ETS/blob/43215557c35380322d759d2918456e02c3a0c7b2/docs/requirements/session/PREETS-SESSION-003.md) | AC1–3                             | AC2 specified and completable now (FR-014). AC1 and AC3 specified (FR-013, FR-015, FR-016) but **incomplete** until B6/#158 freshness confirmation permits live session establishment; seeded records cannot establish them.                                                                                                                                  |
| [PREETS-SESSION-004](https://github.com/PathableAI-org/Pre-ETS/blob/43215557c35380322d759d2918456e02c3a0c7b2/docs/requirements/session/PREETS-SESSION-004.md) | AC1–2                             | AC1 missing-session automatic login, expired/removed-record fresh entry, joining, and history protection specified (FR-004, FR-022–FR-024); verified freshness for first-time and expired entry is **deferred to #158**. AC2 non-replacement specified (FR-025); recovery composition is **deferred to #157** (Server Action recovery and running-tab modal). |
| [PREETS-SESSION-005](https://github.com/PathableAI-org/Pre-ETS/blob/43215557c35380322d759d2918456e02c3a0c7b2/docs/requirements/session/PREETS-SESSION-005.md) | AC1–4                             | Specified in full (FR-017–FR-020). AC2–4 are completable with prepared denial/isolation records; AC1 matching-tenant admission through real login is **incomplete** until #158 permits live session establishment.                                                                                                                                            |

Related constraints, not coverage claims: [PREETS-SESSION-013](https://github.com/PathableAI-org/Pre-ETS/blob/43215557c35380322d759d2918456e02c3a0c7b2/docs/requirements/session/PREETS-SESSION-013.md)
(uniform fresh authentication; `max_age=0` and signed-ID-token `auth_time` baseline; owned by #158),
[PREETS-SESSION-006](https://github.com/PathableAI-org/Pre-ETS/blob/43215557c35380322d759d2918456e02c3a0c7b2/docs/requirements/session/PREETS-SESSION-006.md)
and [PREETS-SESSION-010](https://github.com/PathableAI-org/Pre-ETS/blob/43215557c35380322d759d2918456e02c3a0c7b2/docs/requirements/session/PREETS-SESSION-010.md)
AC2 (cross-instance recognition and new-tab joining, exercised here as application evidence the issue requires),
PREETS-TENANT-003–006, PREETS-SECURITY-001, and PREETS-INFRA-001.

### Authorized outcome

Protect every frontend application entry point by default, preserve the explicit public exceptions and tenant
failure outcomes, bind authenticated sessions to the independently resolved request tenant with HTTP 403 on
mismatch, and integrate tenant-provider login, valid-session joining, and fresh entry application-wide with
multi-instance HTTP evidence.

### In scope

- Default protection of all current and future pages, route handlers, and Server Actions, including direct requests.
- The explicit public exceptions, diagnostics without session creation, and safe public-asset assessment.
- Application-wide tenant-provider login initiation, callback outcomes, and session establishment using the
  delivered #215–#218 capabilities, with fresh-authentication requests preserved.
- Independent request-tenant enforcement and HTTP 403 with a forbidden experience at every protected entry point.
- Preservation of accepted tenant 404/500 outcomes and configuration secrecy.
- Missing-session automatic login, valid-session joining, expired/removed-record new-tab, refresh, and history entry,
  and history protection.
- An actual protected Server Action and browser consumer ready for #157's recovery increment.
- Application-level multi-instance evidence: login through one instance, recognition, renewal, and expiry enforcement
  through another.

### Out of scope

- Freshness comparison, clock tolerance, provider/broker support, unsupported-provider handling, and verified
  existing-SSO freshness evidence for first-time and expired entry (#158).
- Expired/missing-session Server Action HTTP 401, recovery content, and the running-tab expiration modal (#157).
- Activity, logout, and warning coordination across tabs (#155, #156).
- Reconstruction of the reusable components delivered by #153 and its children #215–#221.
- Backend/domain persistence and API expiration-response policy, a new absolute maximum lifetime, concrete cloud
  provider/ingress, CI cadence, arbitrary application-value storage, heartbeat/connection-loss input behavior, and
  undecided policy.

### Dependencies and blockers

- Start prerequisites #153, #117, and #119 are closed. Closure is a delivery coordination fact, not requirement
  verification. The accepted #118 tenant failure mappings are an integration gate.
- #158's B6 freshness confirmation is an execution gate for every success-path claim: the current callback
  establishes no session because the freshness comparison and clock tolerance are unresolved. Planning may separate
  default protection, denial, forbidden, public-exception, tenant-failure, and fresh-entry redirection work from the
  gated authenticated journeys, but completion may not claim live login, matching-tenant admission, or
  cross-instance recognition/renewal/expiry until that gate is satisfied.
- #157 Server Action recovery and #158 verified expired-entry freshness are shipping gates for SESSION-004.
- The valid/missing-session increment does not depend on #155.

### Authority findings

1. **Freshness gate on the core increment (open; execution gate, not a specification blocker).**
   - _Source_: Issue #154 B6 sections; [PREETS-SESSION-013](https://github.com/PathableAI-org/Pre-ETS/blob/43215557c35380322d759d2918456e02c3a0c7b2/docs/requirements/session/PREETS-SESSION-013.md)
     Open questions; plan B6 row; current authentication and session-state documentation on `origin/main`.
   - _Ambiguity_: The issue's observable increment requires actual login establishing identity used through two
     instances, but the authentication-time comparison and clock tolerance remain undecided, and the delivered
     callback therefore establishes no session.
   - _Impact_: SESSION-002/003 success outcomes, SESSION-005 AC1 real-login admission, and multi-instance
     renewal/expiry evidence cannot be executed or completed; everything else can proceed.
   - _Decision required_: Maintainer resolution of B6 comparison, tolerance, and provider handling under #158, and
     confirmation that #154 may plan with these claims explicitly incomplete.
   - _Proposals_: (A) Plan #154 in increments, completing non-success work now and success-path evidence after #158.
     (B) Resolve B6 under #158 before #154 planning so one plan covers the full journey.
2. **Ownership of first-time-visit freshness evidence (open; non-blocking, interpretation applied).**
   - _Source_: Issue #154 Requirements line ("SESSION-004 AC1 expired-entry freshness awaits S6") versus its later
     B6 decision and handoff ("#158 completed provider freshness").
   - _Ambiguity_: Uniform freshness now applies to first-time visits, but the baseline text defers only
     expired-entry freshness to #158.
   - _Impact_: Determines whether #154 must deliver real-provider existing-SSO first-time freshness evidence.
   - _Decision required_: Confirm the owner of first-time existing-SSO freshness evidence.
   - _Proposals_: (A) #158 owns all freshness verification (applied here, consistent with the handoff, #216/#217
     records, and current documentation). (B) #154 owns first-time freshness evidence once #158 decides the policy.
3. **Stale approval prose in the current plan (open; non-blocking).**
   - _Source_: Current plan header and B6 text still describe the reconstruction scope and 2026-10-17 refinements as
     awaiting PR approval, although PR #189 and PR #222 merged them to `main`.
   - _Ambiguity_: Whether merged-but-"pending" prose is approved authority.
   - _Impact_: None on behavior if merged content is authoritative, which this specification assumes.
   - _Decision required_: None for specification; a later plan-maintenance PR may refresh the status prose.
   - _Proposals_: (A) Treat merged `main` content as approved (applied). (B) Refresh status prose separately.
