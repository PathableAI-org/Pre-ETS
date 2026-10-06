# Authentication and session management

These accepted requirements derive from the maintainer-supplied **Session and Authentication Requirements — Discovery
Summary**, provided on 2026-10-05. Each source attribution below names its relevant section. Maintainer approval on 2026-10-05 accepts PREETS-SESSION-001 through PREETS-SESSION-013.
Acceptance does not establish implementation or behavioral verification; open policy and design questions remain delivery gates.

## Scope and source limitations

The scope covers protected application access, tenant OIDC authentication, transient sessions, idle timeout,
and browser protection. API/backend data-resource expiration responses, absolute maximum session lifetime,
CI scheduling, and implementation mechanisms remain outside these requirements. Redis, browser messaging APIs,
framework files, component reuse, and local Keycloak are context rather than required technologies.

The handoff mentions **Project Reference Links.txt**, but supplies neither its contents nor an accessible
location; it has not been reviewed. Existing tenant-resolution requirements are retained and linked below; no historical specifications are migrated.

## Related accepted requirements

Request tenant resolution follows [PREETS-TENANT-003](tenant-resolution.md#preets-tenant-003), configuration
retrieval follows [PREETS-TENANT-004](tenant-resolution.md#preets-tenant-004), and invalid host-based tenants
retain [PREETS-TENANT-005](tenant-resolution.md#preets-tenant-005)’s HTTP 404 outcome. The 403 below applies
to a resolved request tenant differing from the authenticated session tenant, not an invalid tenant host.
OIDC configuration follows [PREETS-SECURITY-001](security.md#preets-security-001): tenant files contain
non-secret integration settings and lookup keys only; credentials resolve separately on the server.
Diagnostic access remains subject to [PREETS-TENANT-006](tenant-resolution.md#preets-tenant-006) and
[PREETS-INFRA-001](infrastructure.md#preets-infra-001); whether that diagnostic resource is explicitly
unauthenticated under the accepted default-authentication policy remains a product decision.

## Relationship to current contracts

The following are accepted obligations, not descriptions of delivered behavior. Existing implementation notes
remain intact pending delivery:

- [Session state — Loading session state](../session-state.md#loading-session-state) treats a tenant mismatch
  as an empty session; PREETS-SESSION-005 instead forbids authenticated cross-tenant access.
- [Session state — Idle clearance and recovery paths](../session-state.md#idle-clearance-and-recovery-paths)
  starts generic OIDC on fresh document entry after inactivity; PREETS-SESSION-007 requires an explicit
  session-expired page before reauthentication.
- [Authentication — Login again after inactivity](../authentication.md#login-again-after-inactivity)
  permits existing IdP SSO without a fresh challenge; PREETS-SESSION-013 requires fresh authentication.
- [Multi-tenancy — Idle timeout policy](../multi-tenancy.md#idle-timeout-policy) records a default and policy
  snapshot at authentication. This handoff does not decide defaults or live policy-change behavior.
- [Session state](../session-state.md) describes an existing absolute lifetime. This proposal neither adopts
  that lifetime as a product requirement nor removes existing enforcement.

## Verification approach

Plans below identify evidence for individual claims at their responsible boundaries. No behavioral suite
was executed or reviewed to establish these requirements. Follow [Testing as evidence](../engineering/testing/README.md)
and [Property-based testing](../engineering/testing/property-based-testing.md).

Use durable Gherkin scenarios for behavior whose change warrants a product conversation, with Playwright
when browser observation is needed. BDD specification and end-to-end execution are compatible, not opposing
categories; do not require a second standalone Playwright category or one browser test per requirement.

Authentication evidence should cover real OIDC redirects, callbacks, outcomes, session creation, and tenant
binding. Other scenarios may use a controlled authentication seam backed by that independent evidence.
Controllable time is justified for timeout boundaries. Document every seam and its assumptions; never bypass
the behavior a test claims to verify. Directly inserting store records cannot establish successful login.
Property evidence does not establish framework, store concurrency, or browser behavior on its own. CI cadence
will be decided from actual suite costs in later engineering planning.

## PREETS-SESSION-001

**Title:** Authentication required by default
**Classification:** Functional Requirement
**Lifecycle:** accepted
**Verification:** unverified

### Statement

Users must authenticate before accessing any protected application page or resource; only resources explicitly designated unauthenticated may bypass this requirement.

### Rationale and sources

A default protection boundary prevents accidental public exposure.

- Source: Maintainer-supplied discovery summary (2026-10-05), “Authentication and protected resources.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates; verification remains unverified.

### Acceptance criteria

1. A request without valid authentication cannot obtain protected content from any protected application entry point.
2. An explicitly designated public resource, including the session-expired page, is accessible without authentication.
3. Adding an application resource leaves it protected unless it is explicitly designated public.

### Open questions

Inventory public exceptions and the boundary that enforces the default.

### Verification plan

HTTP/application checks of representative entry points and public exceptions, plus route-policy inspection, establish default enforcement; browser Gherkin establishes the protected navigation outcome. A finite route sample alone cannot establish the default for new routes.

### Verification evidence

No reviewed, executed evidence has been recorded. Planned verification does not change the verification value.

## PREETS-SESSION-002

**Title:** Tenant-configured OIDC authentication
**Classification:** Functional Requirement
**Lifecycle:** accepted
**Verification:** unverified

### Statement

Users must authenticate through the OIDC identity provider configured for the resolved tenant; the application must not provide its own username/password login experience.

### Rationale and sources

The tenant identity provider owns authentication mechanisms.

- Source: Maintainer-supplied discovery summary (2026-10-05), “Authentication and protected resources.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates; verification remains unverified.

### Acceptance criteria

1. Tenant configuration contains enough non-secret OIDC integration settings and, when needed, server-only secret lookup keys to initiate and complete authentication under PREETS-SECURITY-001.
2. Authentication uses the resolved tenant’s integration rather than another tenant’s configuration.
3. Users are directed to the identity provider for authentication; the application does not collect local username/password credentials.

### Open questions

None.

### Verification plan

OIDC contract/integration checks establish tenant-specific initiation, callback validation, and failed authentication outcomes. Browser Gherkin establishes delegation and the user journey; configuration-boundary checks establish required integration information.

### Verification evidence

No reviewed, executed evidence has been recorded. Planned verification does not change the verification value.

## PREETS-SESSION-003

**Title:** Authenticated session identity
**Classification:** Functional Requirement
**Lifecycle:** accepted
**Verification:** unverified

### Statement

A successfully authenticated user must receive an application session associated with that user and the tenant under which authentication occurred.

### Rationale and sources

Subsequent access depends on a trustworthy identity and tenant binding.

- Source: Maintainer-supplied discovery summary (2026-10-05), “Authentication and protected resources.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates; verification remains unverified.

### Acceptance criteria

1. Successful OIDC completion establishes a session bound to the authenticated user and authentication tenant.
2. Failed or rejected authentication does not establish an authenticated application session.
3. A subsequent protected request uses the established identity and tenant association.

### Open questions

None.

### Verification plan

Focused OIDC completion integration evidence observes actual session establishment and subsequent protected access, including failures. A fabricated session fixture alone cannot prove this claim.

### Verification evidence

No reviewed, executed evidence has been recorded. Planned verification does not change the verification value.

## PREETS-SESSION-004

**Title:** Automatic login for missing sessions
**Classification:** Functional Requirement
**Lifecycle:** accepted
**Verification:** unverified

### Statement

A user requesting a protected page with no application session must automatically enter the resolved tenant’s OIDC authentication flow.

### Rationale and sources

First access should not require finding a separate login control.

- Source: Maintainer-supplied discovery summary (2026-10-05), “Authentication and protected resources.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates; verification remains unverified.

### Acceptance criteria

1. A protected page request without an application session initiates the resolved tenant’s OIDC flow automatically.
2. The missing-session path does not replace the explicit expired-session recovery required by PREETS-SESSION-007.

### Open questions

Distinguish loss of all expiration-identifying state from a known expired session; retention and recognition semantics need design.

### Verification plan

Actual HTTP redirect evidence and browser Gherkin establish automatic tenant-specific login; distinguish missing, valid, and known-expired sessions.

### Verification evidence

No reviewed, executed evidence has been recorded. Planned verification does not change the verification value.

## PREETS-SESSION-005

**Title:** Independent request tenant and session binding
**Classification:** Functional Requirement
**Lifecycle:** accepted
**Verification:** unverified

### Statement

For every protected request using an authenticated session, the application must compare the tenant returned by independent request tenant resolution with the session tenant and grant access only when they are equal; a mismatch must yield a 403 Forbidden page. This contract applies to the result of tenant resolution regardless of how that result is obtained.

### Rationale and sources

A Tenant A session must not grant access to Tenant B or reinterpret Tenant B as Tenant A.

- Source: Maintainer-supplied discovery summary (2026-10-05), “Tenant/session binding.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates; verification remains unverified.

### Acceptance criteria

1. Matching request and session tenants permit tenant-binding validation to succeed, subject to other access checks.
2. Different request and session tenants forbid access and expose a 403 Forbidden page.
3. A valid session does not bypass request tenant resolution or substitute the session tenant for the tenant returned by that resolution.
4. Tenant/session comparison depends on the resolved tenant identity, without imposing a tenant resolution mode or mechanism.

### Open questions

Whether the 403 page is rendered directly or reached through navigation remains a delivery decision; forbidden access must retain HTTP 403 semantics.

### Verification plan

Generate matching and distinct tenant identities through the public authorization boundary; assert acceptance/rejection independently. Real HTTP integration composes tenant resolution, session state, and 403 responses; browser Gherkin establishes the forbidden experience. Cookie host isolation alone is insufficient.

### Verification evidence

No reviewed, executed evidence has been recorded. Planned verification does not change the verification value.

## PREETS-SESSION-006

**Title:** Shared transient session storage
**Classification:** Functional Requirement
**Lifecycle:** accepted
**Verification:** unverified

### Statement

Application consumers must be able to store arbitrary session-associated values transiently and retrieve consistent session state across horizontally scaled application instances without affinity to one instance.

### Rationale and sources

Session correctness must survive request routing between instances.

- Source: Maintainer-supplied discovery summary (2026-10-05), “Session storage and horizontal scaling.”
- Source clarification: Maintainer direction on 2026-10-05 authorizes cross-instance application-value retrieval, addressing the [Copilot review comment](https://github.com/PathableAI-org/Pre-ETS/pull/112#discussion_r4184264204).
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates; verification remains unverified.

### Acceptance criteria

1. A session-associated application value stored through one application instance can be retrieved with the same value through another instance during the session lifetime, without affinity to the writing instance.
2. A session established on one instance is recognized with the same user and tenant state on another instance.
3. An activity update or expiration enforced by one instance is honored by another; requests need not return to the previous instance.

### Open questions

Supported value representation, capacity, transient retention, and consistency guarantees under concurrent operations need design.

### Verification plan

Store-contract integration checks round-trip representative supported values; multi-instance application integration writes session-associated values through one instance and retrieves them through another, comparing with independently supplied expected values. It also routes authentication, renewal, and protected access across instances. Same-process or test-owned maps do not establish horizontal consistency.

### Verification evidence

No reviewed, executed evidence has been recorded. Planned verification does not change the verification value.

## PREETS-SESSION-007

**Title:** Explicit expired-session page
**Classification:** Functional Requirement
**Lifecycle:** accepted
**Verification:** unverified

### Statement

A user making an SSR protected-page request with an expired application session must be redirected to a dedicated unauthenticated session-expired page explaining expiration and offering explicit reauthentication.

### Rationale and sources

Expiration should be understandable and must not silently send an unattended browser through login.

- Source: Maintainer-supplied discovery summary (2026-10-05), “Authentication and protected resources; Server-authoritative idle timeout.”
- Source clarification: Maintainer direction on 2026-10-05 authorizes accessible expiration recovery, addressing the [Copilot review comment](https://github.com/PathableAI-org/Pre-ETS/pull/112#discussion_r4184264246).
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates; verification remains unverified.

### Acceptance criteria

1. An expired-session SSR page request redirects to the session-expired page without automatically initiating OIDC.
2. The page is accessible unauthenticated, explains that the previous session expired, and provides an explicit authenticate-again action.
3. Protected content is not returned in the expired-session response.
4. Keyboard and assistive-technology users can perceive the expiration explanation, locate the authenticate-again action, and activate it with visible focus and appropriate focus movement.

### Open questions

How long and by what contract a prior expiration remains distinguishable from a missing session needs design; API expiration responses are deferred.

### Verification plan

HTTP checks observe redirect and protected-content denial at and after expiry; browser Gherkin follows the redirect, establishes the accessible explanation and recovery action, and completes keyboard recovery with visible focus and appropriate focus movement. Include assistive-technology observations of the explanation and action; semantic markup alone does not establish the complete experience. Include expired references whose transient state has been removed once recognition semantics are decided.

### Verification evidence

No reviewed, executed evidence has been recorded. Planned verification does not change the verification value.

## PREETS-SESSION-008

**Title:** Server-authoritative tenant idle timeout
**Classification:** Functional Requirement
**Lifecycle:** accepted
**Verification:** unverified

### Statement

Authenticated users must be subject to the tenant’s configured whole-minute idle timeout from 5 through 30 inclusive; the server must enforce expiration independently of browser timers.

### Rationale and sources

A browser cannot grant access after the authoritative deadline.

- Source: Maintainer-supplied discovery summary (2026-10-05), “Server-authoritative idle timeout.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates; verification remains unverified.

### Acceptance criteria

1. Tenant idle timeout accepts whole minutes 5 through 30 inclusive and rejects values outside that domain.
2. A new authenticated session has an idle expiration derived from the configured interval.
3. Before expiration, receipt of an authenticated request representing activity advances expiration by that interval.
4. At or after expiration, requests cannot revive the session or obtain protected access, even if browser timers are disabled.
5. Traffic not caused by qualifying user activity does not extend the idle deadline (see PREETS-SESSION-009).

### Open questions

Default when omitted and policy changes during live sessions remain undecided. Classify authenticated activity requests versus background/status traffic without treating every authenticated network request as activity.

### Verification plan

Configuration-boundary examples include 5, 30, fractions, and out-of-range values. Public-service properties generate before/at/after deadlines and renewal outcomes. Store integration exercises racing renewal/expiration and multiple instances; HTTP evidence establishes server enforcement with no browser timer.

### Verification evidence

No reviewed, executed evidence has been recorded. Planned verification does not change the verification value.

## PREETS-SESSION-009

**Title:** Qualifying browser activity
**Classification:** Functional Requirement
**Lifecycle:** accepted
**Verification:** unverified

### Statement

Users’ intentional interaction with application controls must count as activity and be communicated to the server sufficiently to renew a still-valid session; raw pointer movement and unrelated background traffic must not keep it alive.

### Rationale and sources

Activity should reflect use of the application rather than incidental events.

- Source: Maintainer-supplied discovery summary (2026-10-05), “Browser-side inactivity protection.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates; verification remains unverified.

### Acceptance criteria

1. Intentional control activation, keyboard interaction with application controls, text entry, and touch interaction with application controls must count as qualifying activity and, when communicated to the server before expiration, renew the still-valid session.
2. Raw pointer movement alone never renews the idle deadline.
3. Automatic polling or background traffic unrelated to qualifying activity never renews the idle deadline.
4. Qualifying activity communicated after expiration does not revive authenticated access.

### Open questions

Maximum communication delay and behavior during connectivity loss need design so local activity cannot claim server-authorized access.

### Verification plan

Browser Gherkin exercises semantic controls and raw movement with controllable time, observing authoritative renewal or expiration. HTTP/integration checks distinguish activity from background requests; merely observing a browser event or network call is insufficient.

### Verification evidence

No reviewed, executed evidence has been recorded. Planned verification does not change the verification value.

## PREETS-SESSION-010

**Title:** Shared session, idle state, and logout across tabs
**Classification:** Functional Requirement
**Lifecycle:** accepted
**Verification:** unverified

### Statement

All application tabs for the same resolved tenant within the same browser context must share one application session and its idle state. A newly opened tab must join the existing session when one exists. Qualifying activity in any tab must extend the session and synchronize relevant timeout state across all tabs; logging out in any tab must log out all tabs sharing that session.

### Rationale and sources

Reading a roster in one tab must remain compatible with working in a participant tab.

- Source: Maintainer-supplied discovery summary (2026-10-05), “Multi-tab behavior.”
- Source clarification: Maintainer review direction on 2026-10-05 requires all tabs to share the session, new tabs to join an existing session, and logout to apply across tabs. Session requirements depend on resolved tenant identity rather than the resolution mechanism.
- Source clarification: Maintainer direction on 2026-10-05 authorizes isolation between sessions and resolved tenants, addressing the [Copilot review comment](https://github.com/PathableAI-org/Pre-ETS/pull/112#discussion_r4184264108).
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates; verification remains unverified.

### Acceptance criteria

1. All concurrent application tabs for the same resolved tenant in the same browser context use the same application session and common idle state.
2. Opening a new application tab when a session already exists joins that session rather than establishing an independent session.
3. Qualifying activity in one tab renews authoritative expiration and prevents another inactive tab from independently expiring the still-active session.
4. Warning and expired states propagate across tabs as required by PREETS-SESSION-011 and PREETS-SESSION-012.
5. Logging out in any tab ends authenticated access for the shared session and logs out every tab sharing it; no other tab can continue protected use under the logged-out session.
6. Activity, continuation, warnings, expiration, and logout affect only the associated session. They must not renew, warn, expire, or log out a different session, including sessions for another resolved tenant or in another browser context.

### Open questions

Synchronization timing and suspended/resumed tab behavior need design. Session isolation is required by AC6 and is not an unresolved policy.

### Verification plan

Multi-page browser Gherkin opens a new tab after authentication and establishes that it joins the existing session, drives activity in one tab past another tab’s former deadline, and observes usable protected content in both. Log out in one tab and observe logout and denial of protected use in every other tab, backed by HTTP evidence that the shared session no longer authorizes access. Run separate-browser-context and distinct-resolved-tenant sessions with independently observed deadlines and authentication state; exercise activity, continuation, warning, expiration, and logout in one session and establish that the others are unaffected. Adapter tests alone cannot establish browser synchronization.

### Verification evidence

No reviewed, executed evidence has been recorded. Planned verification does not change the verification value.

## PREETS-SESSION-011

**Title:** Configurable shared pre-expiration warning
**Classification:** Functional Requirement
**Lifecycle:** accepted
**Verification:** unverified

### Statement

Users must receive a blocking warning modal across open session-sharing tabs at the tenant-configured warning threshold before idle expiration, with an explicit action to continue the session.

### Rationale and sources

A person reading without interacting needs an opportunity to keep working.

- Source: Maintainer-supplied discovery summary (2026-10-05), “Pre-expiration warning.”
- Source clarification: Maintainer direction on 2026-10-05 authorizes accessible blocking warning behavior, addressing the [Copilot review comment](https://github.com/PathableAI-org/Pre-ETS/pull/112#discussion_r4184264296).
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates; verification remains unverified.

### Acceptance criteria

1. Tenant warning configuration places the warning strictly before idle expiration; invalid thresholds are rejected.
2. At the warning threshold, all open tabs sharing the session display the blocking warning.
3. Activating Continue or Keep working before expiration constitutes qualifying activity, renews the authoritative deadline, and dismisses warnings across the other tabs.
4. A continuation reaching the server at or after expiration cannot restore the expired session.
5. Assistive-technology users receive an announcement of the warning and can perceive its explanation and Continue action. Focus moves into the warning when it opens; keyboard users can activate Continue with visible focus. While the warning is blocking, focus and interaction cannot reach background application content. After successful continuation, focus returns to an appropriate application control.

### Open questions

Threshold representation, minimum lead time, default/omission behavior, and warning policy changes during a live session need product review.

### Verification plan

Configuration-boundary validation checks warning-before-expiry. Browser Gherkin uses controllable time to establish focus movement into the warning, visible focus, keyboard continuation, blocked background interaction, appropriate focus restoration, cross-tab dismissal, and authoritative renewal. Supplement browser assertions with assistive-technology observations of warning announcement and accessible explanation/action. Integrated boundary checks cover late continuation races.

### Verification evidence

No reviewed, executed evidence has been recorded. Planned verification does not change the verification value.

## PREETS-SESSION-012

**Title:** Protected content obscured after expiration
**Classification:** Functional Requirement
**Lifecycle:** accepted
**Verification:** unverified

### Statement

When inactivity reaches expiration, users’ open application tabs sharing the session must enter a synchronized expired state that obscures previously rendered protected information and presents a blocking expiration modal with explicit reauthentication.

### Rationale and sources

Server rejection alone cannot protect sensitive information already rendered, including PHI.

- Source: Maintainer-supplied discovery summary (2026-10-05), “Browser behavior after expiration.”
- Source clarification: Maintainer direction on 2026-10-05 authorizes accessible expiration recovery, addressing the [Copilot review comment](https://github.com/PathableAI-org/Pre-ETS/pull/112#discussion_r4184264246).
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates; verification remains unverified.

### Acceptance criteria

1. At expiration, protected information already rendered in every session-sharing tab is no longer readable.
2. The blocking expiration modal explains expiration and offers explicit authentication again; protected information cannot be exposed by dismissing or bypassing the modal.
3. Expired state propagates across session-sharing tabs.
4. The modal and PREETS-SESSION-007’s page convey equivalent expiration meaning and recovery actions.
5. Assistive-technology users receive an announcement of expiration and can perceive its explanation and authenticate-again action. Focus moves into the modal; keyboard users can activate reauthentication with visible focus. Protected background information is unavailable to keyboard interaction and assistive-technology reading or navigation while the expired state remains.

### Open questions

Define acceptable synchronization latency and suspended/resumed tab protection. Keyboard and assistive-technology protection is required by AC5.

### Verification plan

Browser Gherkin observes actual rendered-content concealment, blocking behavior, focus movement and visible focus, keyboard recovery, multiple tabs, and explicit recovery with controllable time. Assistive-technology observations establish expiration announcement, explanation/action availability, and inability to read or navigate protected background information. Server-only denial or modal-string assertions cannot establish concealment.

### Verification evidence

No reviewed, executed evidence has been recorded. Planned verification does not change the verification value.

## PREETS-SESSION-013

**Title:** New session and fresh OIDC authentication after expiry
**Classification:** Functional Requirement
**Lifecycle:** accepted
**Verification:** unverified

### Statement

Users choosing authentication again after expiration must complete a fresh authentication event at the tenant’s OIDC provider and receive a new application session; the expired session must remain unusable.

### Rationale and sources

Existing SSO alone provides weak evidence that the authorized user returned to an unattended workstation.

- Source: Maintainer-supplied discovery summary (2026-10-05), “Reauthentication after expiration.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates; verification remains unverified.

### Acceptance criteria

1. Explicit recovery initiates tenant OIDC authentication and successful completion establishes a new application session bound to the authenticated user and tenant.
2. The old application session cannot be renewed or reused for protected access.
3. An existing IdP/SSO session alone cannot silently satisfy recovery: the application requests fresh authentication and verifies protocol evidence that a fresh event occurred.
4. The IdP chooses the authentication mechanism; entering a password is not required by this contract.
5. Cancelled, failed, or unconfirmed fresh authentication leaves protected access unavailable.

### Open questions

Define OIDC request/response freshness semantics, clock tolerance, broker/provider support, and failure behavior before implementation; do not infer freshness from a new application session identifier.

### Verification plan

OIDC contract/integration checks observe freshness request semantics and validate authentication-event evidence, including stale/missing evidence and cancellation. Focused real-provider browser Gherkin with an existing SSO session demonstrates fresh authentication and new-session recovery; a mocked callback alone cannot establish provider behavior.

### Verification evidence

No reviewed, executed evidence has been recorded. Planned verification does not change the verification value.
