# Feature Specification: Enforce Sessions in Reference Application Paths

**Feature Branch**: `158-reference-session-enforcement`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "https://github.com/PathableAI-org/Pre-ETS/issues/219"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Continue Authenticated Access Across Application Instances (Priority: P1)

As an authenticated user, I can use a bounded protected application path through a different running application
instance and remain identified as the same user for the same independently resolved tenant.

**Why this priority**: The reusable session capability is valuable to later application integration only when a
protected consumer can use it without affinity to the instance that established the session.

**Independent Test**: Authenticate through reference application instance A, then access the reference protected path
and invoke its frontend Server Action through the rendered browser consumer on independently running instance B.
Observe the same user and tenant identity and the expected protected result without returning to instance A.

**Acceptance Scenarios**:

1. **Given** instance A established a usable session for a user and tenant after successful authentication, **When**
   instance B independently resolves the same request tenant and consumes that session, **Then** instance B grants
   access to the reference protected content for the same user and tenant without instance affinity.
2. **Given** instance B has admitted a usable, tenant-matching session, **When** the user invokes the reference protected
   frontend Server Action through its browser consumer, **Then** its safe, observable effect occurs once and the user
   receives its protected result.
3. **Given** a usable session reports its authoritative idle deadline and effective warning policy, **When** the
   reference consumer admits the matching request, **Then** those values remain available to downstream consumers
   without redefining renewal, warning, or recovery behavior in this feature.

---

### User Story 2 - Deny Unusable, Mismatched, or Unreadable Sessions (Priority: P1)

As a user or application operator, I can rely on the reference protected path and operation to fail closed when the
request has no usable session, presents forged context, belongs to another tenant, or cannot safely read session state.

**Why this priority**: A reusable guard that permits protected content or side effects after a failed validation would
undermine tenant isolation and make later application-wide integration unsafe.

**Independent Test**: Exercise the reference page and protected operation with absent, malformed, missing-record,
tenant-mismatched, forged-context, and store-failure conditions. Confirm that none exposes protected content or
performs the protected effect, while each authoritative HTTP behavior remains distinguishable.

**Acceptance Scenarios**:

1. **Given** a request for the reference protected page has no usable application session and its tenant resolves
   successfully, **When** the request is handled, **Then** protected content is withheld and the resolved tenant's OIDC
   authentication flow begins automatically.
2. **Given** the reference protected Server Action receives no usable session, **When** it is invoked through its
   browser consumer, **Then** the action has no protected side effect and returns no protected result; final recovery
   presentation and comprehensive Server Action integration remain downstream work.
3. **Given** a usable session is bound to a different tenant from the independently resolved request tenant, **When**
   the reference protected page or operation is requested, **Then** access is forbidden with actual HTTP 403 semantics,
   protected content and effects are denied, and the session tenant does not replace the request tenant.
4. **Given** a request uses a malformed reference or forged tenant/session context, **When** the reference boundary
   evaluates it, **Then** the request gains no protected identity, content, or effect and cannot select a fallback
   tenant.
5. **Given** session state cannot be read because the session capability or its store fails, **When** the reference
   protected page or operation is requested, **Then** the failure is not treated as an absent session, successful
   access, or authority to create a replacement session, and no protected content or effect is exposed.

---

### User Story 3 - Preserve Public Exceptions and Tenant Failures (Priority: P2)

As a user beginning or recovering authentication, I can still reach the explicitly public application resources, while
their tenant, configuration-safety, and production-ingress obligations remain intact.

**Why this priority**: Session enforcement must not block login, explainable sign-in failures, recovery content, or
diagnostics, and must not turn their public status into a tenant or security bypass.

**Independent Test**: Without a usable session, exercise the existing callback, sign-in failure, recovery, and
diagnostic categories that are present at the bounded reference boundary. Confirm they remain reachable, that the
diagnostic request creates no application session, and that tenant-dependent requests preserve the approved 404/500
failure mappings.

**Acceptance Scenarios**:

1. **Given** no usable application session, **When** an explicitly public callback, sign-in failure, recovery, or
   `/_test` resource within the exercised reference set is requested, **Then** session enforcement does not require an
   authenticated session for that resource.
2. **Given** an unauthenticated request to `GET /_test/tenant-config`, **When** the diagnostic response completes,
   **Then** no application session is created and the response remains subject to its non-secret configuration and
   no-store obligations.
3. **Given** a tenant-dependent public or protected reference request cannot select or load its tenant configuration,
   **When** the request is handled, **Then** host mode preserves the approved invalid or unknown-host 404 outcomes,
   static mode ignores the request host, and either mode preserves the approved selected-configuration 404 or 500
   outcome without substituting a fallback tenant or converting the condition into a session outcome.

---

### User Story 4 - Hand Off a Bounded Reusable Enforcement Contract (Priority: P3)

As the team integrating comprehensive application protection later, we can identify the enforcement outcomes,
reference paths, reusable evidence fixtures, and application entry points that this feature deliberately did not
exercise.

**Why this priority**: The bounded reference increment must accelerate #154 without being mistaken for complete
application-wide enforcement.

**Independent Test**: Review the feature handoff and compare it with the delivered reference behavior. Every exercised
page and operation, successful and denied outcome, reusable fixture, and remaining page/handler/action category is
explicitly accounted for.

**Acceptance Scenarios**:

1. **Given** the reference capability and consumers are complete, **When** the handoff is reviewed, **Then** it names
   the consumer-visible usable-session, no-usable-session, and service-failure outcomes; the exercised protected and
   public paths; expected denial behavior; and retained fixtures.
2. **Given** only bounded reference consumers were exercised, **When** the handoff is reviewed, **Then** it explicitly
   lists unexercised pages, route handlers, Server Actions, direct/new-resource paths, and final browser/recovery work as
   downstream claims rather than implying complete default protection.

### Edge Cases

- A session is usable but belongs to a tenant other than the independently resolved request tenant: the reference
  boundary returns HTTP 403 and performs no protected effect.
- In host mode, a request host is invalid or unknown: the approved tenant 404 mapping wins. In static mode, the request
  host does not change selection. Missing, unreadable, or malformed selected configuration preserves its approved
  mode-specific 404/500 mapping, and session state cannot supply a fallback tenant.
- A session reference is absent, malformed, forged, or points to no usable record: no identity or protected result is
  exposed. A protected page begins tenant OIDC only after successful request-tenant resolution.
- The session store becomes unavailable after a cookie is received: the reference consumer distinguishes service
  failure from ordinary absence and fails closed without silently beginning replacement login or creating a session.
- An explicitly public resource is requested with a valid, invalid, or absent session cookie: its public status does
  not depend on the cookie, but its separate tenant and content-safety obligations still apply.
- A forged request attempts to pair one tenant's session reference with another tenant's host or context: independent
  request-tenant resolution remains authoritative and no session-supplied tenant is substituted.
- The reference protected operation is submitted twice or retried after denial: denied attempts produce no protected
  side effect; this feature does not define a new domain workflow or its persistence semantics.
- Authentication freshness cannot yet be confirmed under the unresolved B6 comparison/clock policy: no successful
  real-login session is assumed, and planned cross-instance authentication evidence remains incomplete rather than
  treating signed `auth_time` presence as confirmation.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Every exercised protected reference request MUST resolve its request tenant independently before granting
  protected access; the session tenant MUST NOT replace, bypass, or alter that resolved tenant.
- **FR-002**: The reusable enforcement capability MUST consume the established session outcomes of usable session, no
  usable session, and session service/store failure without collapsing service failure into ordinary absence.
- **FR-003**: A usable session whose tenant equals the independently resolved request tenant MUST permit the bounded
  reference protected page and operation to use the established user identity, authoritative idle deadline, and
  effective warning policy, subject to the reference resource's other checks.
- **FR-004**: A session established through reference application instance A MUST be consumable through independently
  running reference instance B with the same user and tenant identity and without affinity to instance A.
- **FR-005**: A request whose resolved tenant differs from its usable session tenant MUST receive actual HTTP 403
  semantics at the exercised reference boundary, MUST expose no protected content, and MUST perform no protected
  effect.
- **FR-006**: The exercised mismatch response MUST provide a bounded forbidden indication without claiming the final
  application-wide forbidden experience owned by #154.
- **FR-007**: A request with no usable session MUST NOT obtain protected content or execute the reference protected
  operation.
- **FR-008**: A request for the reference protected page with no usable session and a successfully resolved tenant MUST
  automatically begin that tenant's OIDC authentication flow. This feature MUST NOT claim the final refresh,
  back/forward, or post-expiration freshness journeys owned by #158.
- **FR-009**: The reference protected operation MUST be an actual frontend Server Action invoked through its browser
  consumer, and a denied invocation MUST make the absence of its safe synthetic effect observable without introducing
  a new domain workflow or durable business record.
- **FR-010**: A malformed, forged, missing-record, expired, or invalidated session reference MUST NOT yield protected
  identity, content, or effects. The feature MUST NOT require retained prior-expiration state solely to choose a
  freshness policy.
- **FR-011**: A session service/store failure MUST fail closed, MUST NOT grant protected access, MUST NOT perform the
  protected effect, and MUST NOT authorize silent replacement login or session creation.
- **FR-012**: Explicitly public callback, sign-in failure, `/_test`, and dedicated recovery resources within the
  exercised reference set MUST remain available without an authenticated application session.
- **FR-013**: Public status MUST NOT bypass request-tenant resolution, approved tenant failure mappings, non-secret
  configuration constraints, or separate production-ingress protection where those obligations apply.
- **FR-014**: `GET /_test/tenant-config` MUST NOT create an application session when exercised without one.
- **FR-015**: The exercised reference browser consumer MUST expose the protected Server Action, successful result, and
  denial indication with meaningful accessible names, keyboard operation, and visible focus.
- **FR-016**: Protected content, session identity, and the protected operation's result MUST NOT appear in a denied
  response or public diagnostic response.
- **FR-017**: The delivery handoff MUST identify the reusable enforcement outcomes, exercised reference paths, expected
  HTTP/denial behavior, retained real-provider/distributed-store/action fixtures, and all known unexercised application
  entry-point categories.
- **FR-018**: This feature MUST NOT claim comprehensive protection of all pages, route handlers, Server Actions,
  direct/new-resource paths, final browser history/recovery behavior, provider freshness, renewal/expiration races,
  invalidation races, or outage recovery.

### Key Entities

- **Resolved Request Tenant**: The tenant selected independently from the incoming request under the accepted tenant
  rules. It remains authoritative for the request and is never replaced by session state.
- **Usable Session State**: The established user identity, authentication tenant, authoritative idle deadline, and
  effective warning policy available only when the session capability reports a usable session.
- **Session Enforcement Outcome**: Admission for a usable tenant-matching session; absence for no usable session;
  forbidden for a tenant mismatch; or fail-closed service failure. The exact internal representation is a planning
  decision.
- **Reference Protected Consumer**: The bounded protected page and browser-invoked frontend Server Action used to
  demonstrate the enforcement contract. Its observable effect is synthetic and creates no new domain workflow.
- **Public Exception**: A specifically designated resource that does not require an application session but retains
  all separately applicable tenant, configuration-safety, and ingress obligations.
- **Enforcement Handoff**: The record of exercised paths and outcomes, reusable fixtures, and unexercised integration
  categories supplied to #154 and later lifecycle/recovery work.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In every exercised same-tenant usable-session case, independently running instance B returns the
  reference protected content and operation result for the same user and tenant established through instance A, while
  preserving the session's authoritative idle deadline and effective warning policy unchanged for downstream use.
- **SC-002**: In 100% of exercised absent, malformed, forged, missing-record, expired, invalidated, mismatched, and
  store-failure cases, no protected content is returned and the reference protected effect does not occur.
- **SC-003**: In 100% of exercised tenant-mismatch cases, the reference HTTP boundary returns actual 403 semantics and
  does not substitute the session tenant for the request tenant.
- **SC-004**: In every exercised no-usable-session reference-page case with a valid resolved tenant, the tenant's OIDC
  flow begins automatically and no protected page content is exposed first.
- **SC-005**: In every exercised session service/store failure, the outcome remains distinguishable from ordinary
  session absence and does not create a replacement authenticated session or grant access.
- **SC-006**: Every exercised public resource remains reachable without an application session; every exercised
  unauthenticated diagnostic request creates zero application sessions and preserves its approved cache/content
  constraints.
- **SC-007**: Every exercised host-mode invalid or unknown host returns 404; static-mode requests do not fail because
  of their host; and every exercised selected-configuration failure returns its approved mode-specific 404 or 500
  class, with no fallback tenant or conversion into a successful or forbidden session outcome.
- **SC-008**: A keyboard-only user can reach, invoke, and observe the reference protected operation and its result or
  denial with visible focus in every exercised browser flow.
- **SC-009**: The delivery handoff accounts for 100% of the bounded reference pages/actions delivered by this feature,
  names every reusable fixture, and explicitly lists the remaining application entry-point categories owned by #154.

## Assumptions

- Closed prerequisite #218 supplies the usable-session, no-usable-session, and service-failure outcomes plus the
  tenant-bound identity/deadline/policy state. Its closed status does not establish requirement verification.
- The reference feature consumes existing tenant selection, configuration failure, OIDC initiation/callback, and
  session capabilities. It does not redefine those contracts or their ownership.
- A successful real authentication through instance A requires an approved and functioning freshness confirmation.
  Authentication-time comparison, clock tolerance, provider/broker support, and unsupported-provider behavior remain
  B6/#158 decisions. Until those gates are resolved, successful authenticated cross-instance execution is an
  explicitly incomplete claim; construction and non-success enforcement evidence may proceed without inventing the
  policy.
- Missing, malformed, expired, and invalidated references may share a no-usable-session outcome when the exact cause is
  not already known. This feature does not add cause-retention or prior-expiration retention.
- The bounded forbidden indication and protected-operation feedback are reference evidence, not the final
  application-wide forbidden or recovery experience.
- #154 will inventory and integrate every remaining application page, route handler, Server Action, direct/new-resource
  path, and public exception. #157 owns final expired/missing-session Server Action HTTP 401 and recovery content;
  #158 owns completed freshness and browser-history journeys; #220/#221 own later lifecycle, race, invalidation, and
  outage guarantees.

## Delivery Authority and Scope _(mandatory)_

**Delivery issue**: [#219 — Enforce sessions across application entry points](https://github.com/PathableAI-org/Pre-ETS/issues/219),
read in its current open state on 2026-10-26

**Originating delivery slice**: [S2 — Share session identity and authoritative idle state across instances](https://github.com/PathableAI-org/Pre-ETS/blob/e206d165f0f30999220922f57a3f92549c15f4cc/docs/delivery/session-management.md#s2--share-session-identity-and-authoritative-idle-state-across-instances),
approved baseline revision `e206d165f0f30999220922f57a3f92549c15f4cc`; issue #219 is the maintainer-authorized
S2-E subdivision. The [S2 step supplement](../../docs/delivery/session-management-s2-steps.md#s2-e--enforce-sessions-across-application-entry-points)
records that subdivision but still identifies repository review as pending. Current `origin/main` authority was
inspected at `f11843150903be95b62a759ea012f1a8bc966e2c`.

### Accepted requirement coverage

| Requirement                                                                                                                                                   | Acceptance criteria in this slice                             | Feature disposition                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PREETS-SESSION-001](https://github.com/PathableAI-org/Pre-ETS/blob/f11843150903be95b62a759ea012f1a8bc966e2c/docs/requirements/session/PREETS-SESSION-001.md) | AC1–3, shared enforcement and reference-consumer support only | The reference page/action deny unauthenticated protected content and preserve the exercised public exceptions. Comprehensive coverage of every current and new entry point remains #154 and is not claimed.                         |
| [PREETS-SESSION-003](https://github.com/PathableAI-org/Pre-ETS/blob/f11843150903be95b62a759ea012f1a8bc966e2c/docs/requirements/session/PREETS-SESSION-003.md) | AC3, reference consumption                                    | The bounded protected consumer uses the established identity and tenant association. Session establishment remains the delivered #218 prerequisite; comprehensive protected consumption remains #154.                               |
| [PREETS-SESSION-004](https://github.com/PathableAI-org/Pre-ETS/blob/f11843150903be95b62a759ea012f1a8bc966e2c/docs/requirements/session/PREETS-SESSION-004.md) | AC1–2, reference valid/missing-session support only           | The no-session reference page begins tenant OIDC and does not replace the separate running-tab or Server Action recovery behavior. Final refresh, history, expiration, and freshness journeys remain #157/#158.                     |
| [PREETS-SESSION-005](https://github.com/PathableAI-org/Pre-ETS/blob/f11843150903be95b62a759ea012f1a8bc966e2c/docs/requirements/session/PREETS-SESSION-005.md) | AC1–4, shared capability and reference evidence               | Matching tenants may pass other checks; mismatch produces reference HTTP 403 denial; request-tenant resolution remains independent; no resolution mechanism is imposed. Comprehensive application-wide integration remains #154.    |
| [PREETS-SESSION-006](https://github.com/PathableAI-org/Pre-ETS/blob/f11843150903be95b62a759ea012f1a8bc966e2c/docs/requirements/session/PREETS-SESSION-006.md) | AC2, bounded application composition                          | The same user/tenant session established through instance A is consumed through independently running instance B. Renewal, expiration, and invalidation consistency remain #220/#221 and broader application evidence remains #154. |

### Authorized outcome

Establish a reusable fail-closed request/session enforcement capability and demonstrate it through one bounded
protected page and one frontend Server Action invoked through its browser consumer, including cross-instance identity
use, independent tenant binding, public exceptions, tenant failures, and explicit handoff limits.

### In scope

- Consume usable-session, no-usable-session, and service-failure outcomes at a reusable enforcement boundary.
- Resolve the request tenant independently and admit only a usable session bound to that tenant.
- Demonstrate same-tenant protected access across two independently running application instances.
- Demonstrate absent, mismatch, forged-context, and store-failure denial through the bounded page and browser-invoked
  frontend Server Action.
- Preserve the exercised public exceptions and approved tenant failure mappings.
- Retain real OIDC/distributed-store and protected-action/browser fixtures for downstream work.
- Provide a complete handoff of exercised behavior, expected denial outcomes, reusable evidence, and remaining entry
  points.

### Out of scope

- Comprehensive application-wide protection, default integration for all current/new resources, and final user-facing
  forbidden behavior owned by #154.
- Final expired/missing-session Server Action HTTP 401 and recovery content owned by #157.
- Completed first-time/expired freshness, browser history, and provider compatibility journeys owned by #158.
- Renewal/current-policy adoption and expiration races owned by #220; invalidation/outage guarantees owned by #221.
- Browser activity, logout, warning coordination, and running-tab expiration presentation owned by #155–#157.
- Backend/domain persistence, backend API expiration policy, a new absolute maximum lifetime, cloud/ingress delivery,
  CI cadence, arbitrary application-value storage, heartbeat/connection-loss behavior, and undecided policy.

### Dependencies and blockers

- Start prerequisite #218 is closed as completed as of 2026-10-24. Closure is a delivery coordination fact, not
  verification of the requirements it cites.
- Successful real-login evidence through instance A remains gated by the unresolved B6/#158 authentication-time
  comparison, clock tolerance, provider/broker support, and unsupported-provider behavior. This specification neither
  chooses those decisions nor treats signed `auth_time` presence as confirmation. Planning may separate construction
  and fail-closed evidence from the still-incomplete authenticated journey, but feature completion may not claim the
  cross-instance authentication outcome until the gate is satisfied.
- #154, #157, #158, #220, and #221 are downstream owners of the excluded completion claims; they are not authority to
  broaden this feature.

### Authority findings

None. The pending repository review of the supplemental S2 step record does not create a scope ambiguity because the
current delivery issue itself records the maintainer-authorized S2-E subdivision and preserves the approved S2 baseline.
The remaining B6 decisions are explicit execution gates owned by #158, not decisions this specification may make.
