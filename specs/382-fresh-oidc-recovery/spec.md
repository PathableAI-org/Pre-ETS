# Feature Specification: Complete Fresh Tenant OIDC Recovery With a New Session

**Feature Branch**: `382-fresh-oidc-recovery`

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "https://github.com/PathableAI-org/Pre-ETS/issues/158"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Sign In Freshly on a First Visit Despite Existing Provider SSO (Priority: P1)

As a job coach who is already signed in to my organization's identity provider, when I open the application for the
first time in this browser I am asked by the provider to authenticate again, and only after that fresh
authentication does the application give me a session for my tenant.

**Why this priority**: This is the smallest end-to-end login the application can complete. Until a fresh
authentication event can be confirmed, the running application cannot establish any session, so no other session
behavior can be observed live.

**Independent Test**: With an existing provider SSO session and no application session for the tenant, request a
protected page. Confirm that the provider performs an authentication step rather than returning silently, that the
returned evidence falls inside the freshness window, and that a new session bound to the authenticated user and the
resolved tenant grants the next protected request.

**Acceptance Scenarios**:

1. **Given** no application session and an existing provider SSO session, **When** the user requests a protected
   page, **Then** the application starts the resolved tenant's OIDC login and asks the provider for fresh
   authentication.
2. **Given** that login, **When** the provider completes a fresh authentication event whose time is within the
   freshness window, **Then** the application establishes a new session bound to the authenticated user and the
   resolved tenant, and the next protected request is granted.
3. **Given** an existing provider SSO session, **When** the provider returns to the application without performing a
   fresh authentication event, **Then** no application session is established.
4. **Given** a login, **When** the provider authenticates the user with any mechanism it chooses, **Then** the
   application accepts the result based on freshness evidence alone and does not require a password.

---

### User Story 2 - Re-Enter After Expiration Only With Fresh Authentication (Priority: P1)

As a security stakeholder, I can rely on an expired session never being restored, and on a person returning to an
unattended workstation having to authenticate again at the provider before reaching protected content through a new
tab, a refresh, or browser history.

**Why this priority**: This is the workstation-protection purpose of fresh authentication. Existing provider SSO
alone is weak evidence that the authorized person returned.

**Independent Test**: Hold a real session, let it expire (including with its stored record removed), keep the
provider SSO session, then enter a protected page by a new tab, by refreshing an open tab, and by back/forward
navigation. Confirm that each entry starts tenant login, requires fresh provider authentication, and results in a new
session, and that the old session stays unusable.

**Acceptance Scenarios**:

1. **Given** an expired session and an existing provider SSO session, **When** the user opens a protected page in a
   new tab, refreshes an open protected page, or navigates back or forward to one, **Then** the application starts
   tenant login directly and requires fresh provider authentication before granting access.
2. **Given** an expired session whose stored record has been removed, **When** the user enters a protected page,
   **Then** the same fresh authentication is required; the application does not need to recognize the earlier
   expiration to require it.
3. **Given** a completed fresh login after expiration, **When** a request presents the old session reference,
   **Then** that reference grants no protected access and cannot be renewed.
4. **Given** an expired session, **When** the browser restores a protected page from history, **Then** no usable
   protected content is restored before a new session exists.

---

### User Story 3 - Deny Login Without Confirmed Freshness (Priority: P1)

As a security stakeholder, I can rely on the application refusing any login whose freshness is missing, stale,
cancelled, failed, or unconfirmable, while still letting the user try again.

**Why this priority**: The freshness policy is only as strong as its denials. A fail-open path would let existing
SSO or a misconfigured provider establish sessions silently.

**Independent Test**: Complete logins whose returned authentication time is missing, falls just outside either
bound, or falls just inside each bound, and logins the user cancels or the provider fails. Confirm that only the
inside cases establish a session, every other case leaves protected access unavailable, and the user can start a new
login afterwards.

**Acceptance Scenarios**:

1. **Given** a login, **When** the returned identity carries no authentication time, **Then** no session is
   established, the login transaction is consumed, and a new login can begin afterwards.
2. **Given** a login, **When** the returned authentication time is more than 30 seconds before the login transaction
   started, or more than 30 seconds after the callback time, **Then** no session is established, the transaction is
   consumed, and a new login can begin afterwards.
3. **Given** a login, **When** the returned authentication time is no earlier than 30 seconds before the transaction
   started and no later than 30 seconds after the callback time, **Then** freshness is confirmed.
4. **Given** a login, **When** the user cancels at the provider or the provider returns an error, **Then** protected
   access stays unavailable and no session is established.
5. **Given** a provider or broker that ignores the fresh-authentication request or cannot supply a fresh
   authentication time, **When** any login completes there, **Then** it is denied as unconfirmed; there is no
   per-tenant opt-out or weaker fallback.
6. **Given** a freshness denial, **When** the user sees the result, **Then** it is the same safe outcome as other
   authentication failures and reveals no token, code, or identity information.

---

### User Story 4 - Diagnose Missing Versus Stale Freshness Evidence (Priority: P2)

As an operator, when logins for a tenant are denied for freshness, I can tell whether the provider supplied no
authentication time or a stale one, without seeing tokens, authorization codes, or identity claims.

**Why this priority**: An unsupported provider fails closed for every user. Operators need to tell a provider that
never supplies the evidence from one supplying stale evidence, without the diagnostic itself leaking identity data.

**Independent Test**: Cause one missing-evidence denial and one stale-evidence denial for a tenant, then inspect the
real operator diagnostics.

**Acceptance Scenarios**:

1. **Given** a freshness denial, **When** an operator inspects the diagnostics, **Then** they can identify the tenant
   and whether the evidence was missing or stale.
2. **Given** any freshness denial, **When** an operator inspects the diagnostics, **Then** no ID token,
   authorization code, or identity claim appears.
3. **Given** a freshness denial and a provider or network failure, **When** an operator compares them, **Then** they
   are distinguishable.

---

### User Story 5 - Keep Using a Valid Session Without a New Login (Priority: P2)

As a job coach with a valid session, opening another protected tab or page reuses that session and does not send me
to the provider again.

**Why this priority**: Requiring fresh authentication for every entry would make the application unusable; the
policy applies only when no valid application session exists.

**Independent Test**: With a valid session, open a new protected tab and navigate between protected pages. Confirm
that no login starts and that the same session serves every request.

**Acceptance Scenarios**:

1. **Given** a valid session for the tenant, **When** the user opens a protected page in a new tab, **Then** the tab
   joins that session without starting a login.

---

### User Story 6 - Explicit Log In Follows the Same Freshness Policy (Priority: P3)

As a job coach who chose Log in from an application notice after my session ended, I get the same fresh provider
authentication and a new session as automatic entry gives.

**Why this priority**: Every login path without a valid session must meet the same policy. The current explicit
entry point is the signed-out notice delivered by #155; the expired-session recovery content and expiration modal
that also offer Log in are delivered by [#157](https://github.com/PathableAI-org/Pre-ETS/issues/157), so composing
fresh login through them completes after #157.

**Independent Test**: After logout or expiration, activate Log in by keyboard from the explicit entry points that
exist at the tested revision, with an existing provider SSO session. Confirm that fresh authentication is required
and a new session is established.

**Acceptance Scenarios**:

1. **Given** the signed-out notice after logout and an existing provider SSO session, **When** the user activates
   Log in, **Then** login requires fresh provider authentication and establishes a new session.
2. **Given** #157's expired-session recovery content or expiration modal, **When** the user activates Log in,
   **Then** the same fresh authentication and new session follow. This scenario is completed once #157 supplies those
   entry points.

---

### Edge Cases

- The provider's clock and the application's clock differ: only the fixed 30-second tolerance on each bound absorbs
  the difference. A login whose authentication time falls outside it is denied even if the person did authenticate.
- The user takes longer than the login transaction allows at the provider: the existing transaction lifetime still
  applies, and the authentication time is compared with the consumed transaction's start.
- Two tabs each start a login without a valid session: each completed login must pass freshness on its own; neither
  grants access through the other's evidence.
- A login completes while an older session for the same tenant is already expired and its record removed: the new
  session is established and the old reference stays unusable.
- A provider returns an authentication time in the future beyond the callback-time tolerance: the login is denied as
  stale.
- The provider or network is unavailable during login: this remains the existing provider-unavailable outcome, not a
  freshness denial.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Every login started without a valid application session, including a first-time visit, automatic
  protected-page entry through a new tab, refresh, or browser history, and explicit Log in, MUST request fresh
  authentication from the tenant's provider.
- **FR-002**: The application MUST establish a new session only after confirming, from the signed ID token's
  authentication time, that a fresh authentication event occurred within the freshness window.
- **FR-003**: The freshness window MUST be bounded below by the consumed login transaction's start minus 30 seconds
  and above by the callback time plus 30 seconds. The tolerance MUST be one fixed application-wide value. A window
  measured only from callback time MUST NOT be used.
- **FR-004**: Missing authentication-time evidence MUST deny the login: the transaction is consumed, no session is
  established, and a new login can begin afterwards.
- **FR-005**: Stale authentication-time evidence, outside either bound, MUST deny the login with the same outcome as
  FR-004.
- **FR-006**: Cancelled or failed provider authentication MUST leave protected access unavailable and establish no
  session.
- **FR-007**: A provider or broker that cannot supply fresh authentication-time evidence MUST fail closed through
  FR-004 or FR-005, with no per-tenant opt-out, re-prompt fallback, or substitute evidence from provider metadata.
- **FR-008**: The application MUST evaluate the authentication time issued by the tenant's configured issuer and MUST
  NOT accept a redirect, a new application session identifier, or a re-prompt request alone as freshness evidence.
- **FR-009**: The application MUST NOT require a particular authentication mechanism, such as a password, from the
  provider.
- **FR-010**: A confirmed login MUST establish a new session bound to the authenticated user and the resolved tenant,
  used by the next protected request.
- **FR-011**: After a fresh login, an earlier expired or removed session MUST remain unusable: presenting its reference
  grants no protected access and renews nothing.
- **FR-012**: Fresh authentication MUST be required whether or not an earlier session is known or its record still
  exists.
- **FR-013**: A protected page restored from browser history without a valid session MUST NOT present usable protected
  content before a new session exists.
- **FR-014**: A valid application session MUST continue to be reused for new tabs and later protected requests
  without starting a login.
- **FR-015**: A freshness denial MUST show the user the same safe outcome as other authentication failures, revealing
  no token, code, or identity information.
- **FR-016**: Operator diagnostics for a freshness denial MUST identify the tenant and distinguish missing from stale
  evidence, MUST be distinguishable from provider or network unavailability, and MUST NOT expose ID tokens,
  authorization codes, or identity claims.

### Key Entities

- **Login transaction**: One login attempt for a resolved tenant. Its start time bounds the freshness window, and it
  is consumed once when the provider returns.
- **Authentication event time**: The time the tenant's provider says the user last authenticated, carried in the
  signed ID token. It is the only freshness evidence.
- **Application session**: The tenant- and user-bound session established only after confirmed freshness. A new
  session never revives an expired one.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In every exercised first-time visit and post-expiration entry with an existing provider SSO session, the
  provider performs an authentication step before a session is established.
- **SC-002**: Every exercised login whose authentication time lies inside the window establishes a session; every
  exercised login with missing evidence or an authentication time outside either bound establishes none, including
  values just inside and just outside each bound.
- **SC-003**: Zero exercised requests presenting an expired or removed session's reference after a fresh login reach
  protected content or renew it.
- **SC-004**: Zero exercised cancelled, failed, missing-evidence, stale-evidence, or unsupported-provider logins leave
  protected access available.
- **SC-005**: Every exercised history restoration without a valid session shows no usable protected content.
- **SC-006**: Every exercised new tab with a valid session joins it without a provider round trip.
- **SC-007**: An operator can classify every exercised freshness denial as missing or stale for its tenant, and no
  inspected diagnostic contains a token, code, or identity claim.

## Assumptions

- S1 ([#154](https://github.com/PathableAI-org/Pre-ETS/issues/154)) already requests fresh authentication on every
  login, validates the signed ID token, and fails closed after a trusted identity until freshness is confirmed. S2
  ([#153](https://github.com/PathableAI-org/Pre-ETS/issues/153)) already supplies session establishment, and S3
  ([#155](https://github.com/PathableAI-org/Pre-ETS/issues/155)) the signed-out notice with Log in. This feature
  supplies the freshness confirmation that those slices leave fail-closed.
- The comparison is inclusive at both bounds, as the decision states. How the provider's whole-second authentication
  time is compared with sub-second application instants is an engineering choice, and it must not admit a value
  outside either bound.
- The existing login transaction lifetime, safe authentication-failure outcome, and provider-unavailable outcome are
  retained unchanged.
- The repository's local identity provider is the current integration for real-provider evidence. Local results do
  not establish Microsoft or universal OIDC compatibility.
- Once this feature lets the running application establish sessions, live evidence that S1 and S3 recorded as gated
  can be executed. Those claims remain owned by #154 and #155; this feature does not re-verify them.

## Delivery Authority and Scope _(mandatory)_

**Delivery issue**: [#158 — Complete fresh tenant OIDC recovery with a new session](https://github.com/PathableAI-org/Pre-ETS/issues/158),
read in its current open state on 2026-11-12, including its B6 decision notes of 2026-10-17 and 2026-11-09.

**Originating delivery slice**: [S6 — Complete fresh tenant OIDC recovery with a new session](https://github.com/PathableAI-org/Pre-ETS/blob/e206d165f0f30999220922f57a3f92549c15f4cc/docs/delivery/session-management.md#s6--complete-fresh-tenant-oidc-recovery-with-a-new-session),
approved by the merge of PR #189 at `e206d165f0f30999220922f57a3f92549c15f4cc`. The
[B6 freshness comparison and provider handling decision](https://github.com/PathableAI-org/Pre-ETS/blob/2e6142e2c15caed4d630019be834fe627fe5beed/docs/delivery/session-management.md#b6-freshness-comparison-and-provider-handling-2026-11-09)
was merged by PR #359. Current `origin/main` authority was inspected at `2e6142e2c15caed4d630019be834fe627fe5beed`.

### Accepted requirement coverage

| Requirement                                                                                                                                                   | Acceptance criteria in this slice | Feature disposition                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [PREETS-SESSION-013](https://github.com/PathableAI-org/Pre-ETS/blob/2e6142e2c15caed4d630019be834fe627fe5beed/docs/requirements/session/PREETS-SESSION-013.md) | AC1–5                             | Specified in full (FR-001–FR-012, FR-015). AC1's explicit-recovery path is specified for the signed-out notice now; composition through #157's recovery content and modal completes after #157 delivers them (US6 scenario 2). Observability obligation specified in FR-016.   |
| [PREETS-SESSION-004](https://github.com/PathableAI-org/Pre-ETS/blob/2e6142e2c15caed4d630019be834fe627fe5beed/docs/requirements/session/PREETS-SESSION-004.md) | AC1 (freshness portion)           | Fresh authentication for first-time and expired entry through new tab, refresh, and history, including removed records, and no usable history-restored content (FR-001, FR-012, FR-013). Automatic redirect to login is delivered by #154 and not re-specified. AC2 is #157's. |

### Authorized outcome

Every login without a valid application session completes a confirmed fresh authentication event at the tenant's
provider before a new user- and tenant-bound session is established; the old session stays unusable, and missing,
stale, cancelled, failed, or unsupported freshness leaves protected access unavailable.

### In scope

- S6-A: the `max_age=0` request and signed-ID-token `auth_time` confirmation within the B6 window, missing/stale
  denial, fail-closed unsupported providers, and the missing-versus-stale operator diagnostic.
- S6-B: fresh automatic entry after expiration through new tab, refresh, and browser history, including removed old
  records, and first-time visits with existing provider SSO.
- S6-C: fresh explicit Log in through the entry points that exist at each revision: the signed-out notice now, and
  #157's recovery content and modal once delivered.
- Real local-provider evidence with an existing SSO session.

### Out of scope

- Expired-session recovery content, Server Action HTTP 401 recovery, concealment, and the expiration modal (#157).
- Warnings and Continue (#156).
- Identity-provider logout and provider-specific application policy.
- Executing Microsoft or broker-chain compatibility scenarios (recorded as limitations).
- Backend/domain persistence and API expiration-response policy, absolute maximum lifetime, concrete cloud
  provider/ingress, CI cadence, arbitrary application-value storage, and heartbeat/connection-loss behavior.
- A password-specific challenge or an expiration-recognition retention period.

### Dependencies and blockers

- B6 is resolved (PR #359); no decision gate remains for S6-A or S6-B.
- S6-B composes S1 (#154) and S2 (#153), both delivered.
- S6-C through #157's recovery content and modal needs #157. Under the delivery plan this is a per-increment
  prerequisite, not a start blocker. #158's completion evidence, and so its closure, waits for that composition.

### Authority findings

None. The 2026-11-09 B6 decision resolves the comparison, tolerance, provider handling, and diagnostic obligation;
the remaining S6-C composition is an authorized per-increment prerequisite recorded above.
