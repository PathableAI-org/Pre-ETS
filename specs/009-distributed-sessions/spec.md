# Feature Specification: Establish Distributed Application Sessions

**Feature Branch**: `156-distributed-sessions`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "https://github.com/PathableAI-org/Pre-ETS/issues/218"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Establish a Tenant-Bound Session (Priority: P1)

As an authenticated user, after the application has successfully validated my provider return, I receive an
application session bound to my authenticated identity and the tenant where authentication occurred.

**Why this priority**: A trusted callback must become a reusable application session before any later protected
application integration can rely on it.

**Independent Test**: Complete a real validated callback whose authentication event has been confirmed fresh through
the bounded reference consumer and observe that it creates a tenant-bound session, derives its initial idle deadline
and warning policy, and issues the session cookie. A trusted result without that confirmation creates neither.

**Acceptance Scenarios**:

1. **Given** a callback has successfully produced a trusted user and authentication tenant, freshness of that
   authentication event has been confirmed, and the tenant has a valid effective session policy, **When** the reference
   consumer establishes the application session, **Then** the session is bound to that user and tenant, has an
   authoritative initial idle deadline derived from the effective timeout, retains the effective warning policy, and
   the browser receives a host-only session cookie.
2. **Given** authentication is failed or rejected, **When** the callback reaches the reference consumer, **Then** no
   authenticated application session is established and no authenticated session cookie is issued.
3. **Given** a callback produced a trusted user and authentication tenant but freshness of that authentication event
   has not been confirmed, **When** the reference consumer handles the result, **Then** no application session is
   established and no authenticated session cookie is issued.
4. **Given** a valid callback whose freshness has been confirmed but an unavailable session store, **When** session
   establishment is attempted, **Then** the failure is observable as a service failure and neither a usable session nor
   a successful session cookie is produced.

---

### User Story 2 - Retrieve Consistent Shared Session State (Priority: P2)

As an application consumer, I can use the session cookie's reference to retrieve the same authenticated identity,
tenant association, authoritative idle deadline, and effective warning policy through independent session clients.

**Why this priority**: Later application integration, warnings, and expiration behavior need one shared session state
that does not depend on the client or instance that established it.

**Independent Test**: Establish one session, then use two independent clients of the real distributed session store to
read it and compare every consumer-visible identity and policy value.

**Acceptance Scenarios**:

1. **Given** a usable session established by one client, **When** another independent client reads the same session,
   **Then** it receives the same user identity, authentication tenant, authoritative idle deadline, and effective
   warning policy.
2. **Given** a usable session and repeated reads by independent clients, **When** no lifecycle operation changes the
   session, **Then** each read reports the same consumer-visible session state without requiring affinity to the client
   that created it.

---

### User Story 3 - Fail Closed for Unavailable Sessions (Priority: P3)

As a session consumer, I can distinguish a usable session from no usable session and from a session service failure,
so unavailable state never becomes authenticated identity or a silent replacement login.

**Why this priority**: Consumers must not grant access or create a replacement session when authenticated state is
missing, expired, invalidated, or unreadable.

**Independent Test**: Observe the public session outcomes for usable, absent, expired, invalidated, and store-failure
conditions and confirm that only the usable outcome exposes identity and policy.

**Acceptance Scenarios**:

1. **Given** no session exists for the supplied reference, **When** a consumer reads it, **Then** it receives a no-usable-
   session outcome with no authenticated identity or session policy.
2. **Given** the referenced session is expired or invalidated, **When** a consumer reads it, **Then** it receives no
   usable authenticated identity; an exact unavailability cause is reported only when already known.
3. **Given** the session service cannot determine session state because storage failed, **When** a consumer reads it,
   **Then** it receives a service-failure outcome distinct from no usable session and cannot treat that outcome as
   successful access, login, or replacement session creation.

### Edge Cases

- A trusted callback result lacks freshness confirmation: the reference consumer does not create a session or issue
  a cookie. This feature does not choose the authentication-time comparison or clock tolerance used for that
  confirmation.
- A freshness-confirmed callback reaches session establishment while the distributed store is unavailable:
  establishment fails closed and does not issue a successful authenticated-session cookie.
- A cookie is absent, malformed, or references no available record: the consumer receives no usable session and no
  identity or policy.
- A session is already expired or invalidated when read: it cannot yield usable identity even when the precise cause is
  no longer retained.
- An unavailable session has no retained tombstone or reason: the public outcome may be the common no-usable-session
  result; this feature does not require missing, expired, and invalidated records to remain distinguishable.
- A tenant's effective warning lead is disabled: the session retains the disabled warning policy alongside its
  authoritative deadline.
- Independent clients read the same usable session without a lifecycle change: each client receives the same
  consumer-visible identity and policy state.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The feature MUST establish an authenticated application session, and issue its cookie, only after a
  callback outcome has been successfully validated as trusted and freshness of that authentication event has been
  confirmed. A trusted identity alone is not authority to create the session.
- **FR-002**: A newly established session MUST be bound to the authenticated user and the tenant under which
  authentication occurred.
- **FR-003**: Failed or rejected authentication MUST NOT establish an authenticated application session or issue an
  authenticated-session cookie.
- **FR-004**: Authenticated session state MUST be held in distributed transient storage usable by independent session
  clients without affinity to the client that created the session.
- **FR-005**: Independent clients reading the same usable session MUST obtain the same user identity and authentication
  tenant.
- **FR-006**: A newly established session MUST have an authoritative idle deadline derived from the tenant's effective
  idle-timeout policy at establishment.
- **FR-007**: A usable session result MUST provide the authoritative idle deadline and effective warning policy needed
  by later application, warning, and lifecycle consumers.
- **FR-008**: The public session outcome MUST distinguish a usable session from no usable session and from a session
  storage or service failure.
- **FR-009**: Only a usable-session outcome MAY expose authenticated identity, tenant association, authoritative
  deadline, or effective warning policy.
- **FR-010**: An absent, expired, or invalidated session MUST NOT yield usable authenticated identity. The feature MAY
  report a specific cause when it is already known, but MUST NOT require a tombstone, cause-retention period, or
  distinct missing-versus-expired representation solely for this handoff.
- **FR-011**: A storage or service failure MUST NOT be interpreted as successful access, no-risk anonymous access, a
  successful login, or authorization to silently create or replace an authenticated session.
- **FR-012**: The session cookie-facing contract MUST use a host-only browser cookie that refers to server-held session
  state; the cookie MUST NOT contain provider tokens, credentials, or other secrets.
- **FR-013**: The session state and consumer contract MUST be limited to the identity, tenant association, authoritative
  deadline, effective warning policy, and session-reference information authorized by this slice; it MUST NOT expose
  arbitrary application-value operations.
- **FR-014**: The bounded reference callback consumer MUST demonstrate session creation and cookie issuance without
  claiming comprehensive protection of application entry points.
- **FR-015**: The feature MUST preserve the distinction between establishing/reading initial session state here and
  later renewal, expiration-race, invalidation-race, outage, protected-entry, browser-warning, and recovery guarantees
  owned by the cited downstream delivery issues.

### Key Entities

- **Trusted Authentication Result**: The successfully validated user identity and authentication tenant supplied by
  the callback capability. It does not by itself confirm that the authentication event is fresh. Failed, rejected, or
  freshness-unconfirmed results contain no authority to create a session.
- **Application Session**: Transient authenticated state associated with one user, one authentication tenant, one
  authoritative idle deadline, and one effective warning policy.
- **Session Reference**: The browser-held value used to identify server-held session state. Its exact representation is
  a planning decision, but it cannot contain provider tokens, credentials, or other secrets.
- **Effective Session Policy**: The already validated idle-timeout and warning settings used when the session is
  established.
- **Session Read Outcome**: One of usable session, no usable session, or session service failure. Identity and policy
  are present only for the usable outcome.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In every exercised confirmed-fresh real-callback case, exactly one usable application session is
  established for the validated user and tenant, with a corresponding host-only session cookie. A trusted result whose
  freshness is unconfirmed is not a successful case and produces neither a session nor a cookie.
- **SC-002**: In 100% of exercised failed or rejected authentication cases, no authenticated application session and
  no authenticated-session cookie are produced.
- **SC-003**: Two independent clients reading each exercised usable session report identical user, tenant, authoritative
  deadline, and effective warning-policy values.
- **SC-004**: In 100% of exercised absent, expired, and invalidated session cases, consumers receive no usable identity
  or policy.
- **SC-005**: In 100% of exercised storage-failure cases, the public outcome is distinguishable from no usable session
  and is never accepted as authenticated access or replacement session creation.
- **SC-006**: For every exercised accepted effective timeout/warning combination, the established session exposes the
  corresponding initial deadline and warning policy without adding arbitrary application values or secrets.

## Assumptions

- Issue #215 supplies valid effective timeout and warning-policy values; this feature consumes those values and does
  not redefine tenant configuration validation.
- Issue #217 supplies either a trusted validated user/tenant result or a rejected/failed result. Its trusted result
  validates signed `auth_time` presence and does not compare that time for staleness. This feature does not perform or
  redefine OIDC transaction, token, clock-tolerance, or provider-compatibility validation, and it does not choose the
  unresolved authentication-time comparison. The reference consumer does not create a session or issue its cookie until
  freshness has been confirmed.
- The closed status of prerequisite issues is a delivery coordination signal, not proof that their requirements are
  verified.
- The session reference identifies server-held transient state. The exact record encoding, operation signatures, and
  internal composition belong to planning rather than this stakeholder contract.
- A common no-usable-session outcome is sufficient when absence, expiry, or invalidation cause is not already known.
- Initial establishment and read behavior are delivered here. Qualifying renewal/current-policy adoption and
  expiration races remain with #220; explicit invalidation, invalidation races, and completed outage guarantees remain
  with #221.
- The reference consumer proves the callback-to-session handoff only. #219 and #154 own reference and comprehensive
  protected-entry consumption, respectively.

## Delivery Authority and Scope _(mandatory)_

**Delivery issue**: [#218 — Establish distributed application sessions](https://github.com/PathableAI-org/Pre-ETS/issues/218),
read in its current open state on 2026-10-23

**Originating delivery slice**: [S2 — Share session identity and authoritative idle state across instances](https://github.com/PathableAI-org/Pre-ETS/blob/e206d165f0f30999220922f57a3f92549c15f4cc/docs/delivery/session-management.md#s2--share-session-identity-and-authoritative-idle-state-across-instances),
approved baseline revision `e206d165f0f30999220922f57a3f92549c15f4cc`; issue #218 is the explicitly authorized
S2-D subdivision. Current `origin/main` authority inspected at
`9a5da820b9fd99039857f89606b469446d39412f`. The cited requirement files are unchanged from the earlier inspection at
`f43cbef2f426bf59cf2bade4cc2534231676b4cc`.

### Accepted requirement coverage

| Requirement                                                                                                                                                   | Acceptance criteria in this slice    | Feature disposition                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PREETS-SESSION-003](https://github.com/PathableAI-org/Pre-ETS/blob/9a5da820b9fd99039857f89606b469446d39412f/docs/requirements/session/PREETS-SESSION-003.md) | AC1–3, session-establishment portion | AC1 and AC2 are specified directly. The session makes the established identity/tenant available for later protected consumers under AC3; protected-request use is deferred to #219/#154.                                                             |
| [PREETS-SESSION-006](https://github.com/PathableAI-org/Pre-ETS/blob/9a5da820b9fd99039857f89606b469446d39412f/docs/requirements/session/PREETS-SESSION-006.md) | AC1 and AC2, service/store portion   | This feature specifies distributed storage and consistent independent-client reads. Independently running application-instance recognition is deferred to #219/#154 and is not claimed here.                                                         |
| [PREETS-SESSION-008](https://github.com/PathableAI-org/Pre-ETS/blob/9a5da820b9fd99039857f89606b469446d39412f/docs/requirements/session/PREETS-SESSION-008.md) | AC2                                  | This feature specifies the initial authoritative idle deadline derived from the effective tenant policy. Renewal and no-revival guarantees remain with #220.                                                                                         |
| [PREETS-SESSION-013](https://github.com/PathableAI-org/Pre-ETS/blob/9a5da820b9fd99039857f89606b469446d39412f/docs/requirements/session/PREETS-SESSION-013.md) | AC3, issuance prerequisite only      | This feature refuses session and cookie creation when freshness is unconfirmed. It does not choose the authentication-time comparison, clock tolerance, or provider support, and it does not claim AC1, AC2, AC4, or AC5. Those remain with B6/#158. |

### Authorized outcome

Establish the reusable distributed session capability, consumer-visible session/cookie contract, initial identity and
policy state, and bounded validated-callback handoff needed by later application integration without claiming that
later integration or lifecycle behavior is complete.

### In scope

- Establish a user- and tenant-bound session after a successfully validated callback whose authentication event has
  been confirmed fresh.
- Issue the host-only session reference used to recover server-held state.
- Initialize and read the authoritative idle deadline and effective warning policy.
- Retrieve consistent identity and policy state through independent clients of the real distributed store.
- Expose usable-session, no-usable-session, and service-failure outcomes that fail closed.
- Retain bounded reference consumers and evidence fixtures for downstream delivery work.

### Out of scope

- Comprehensive application-wide protection, default entry-point enforcement, and protected-request integration
  owned by #219/#154.
- Qualifying activity renewal, current-policy adoption, and expiration-race guarantees owned by #220.
- Explicit invalidation, invalidation-race, and completed outage guarantees owned by #221.
- Browser activity, warning presentation, logout, recovery coordination, and final freshness journeys owned by
  #155–#158.
- Backend/domain persistence, backend API expiration-response policy, a new absolute maximum lifetime, cloud/ingress,
  CI cadence, arbitrary application-value storage, heartbeat/connection-loss behavior, and undecided policy.
- A retained tombstone or exact missing-versus-expired reason solely for this handoff.

### Dependencies and blockers

- Start prerequisites #215 and #217 are closed. Their closure does not establish requirement verification.
- The feature consumes a successfully validated callback result as identity and tenant input. Session creation and
  cookie issuance additionally require confirmation that the authentication event is fresh. Authentication-time
  comparison, clock tolerance, provider/broker support, and unsupported-provider handling remain B6/#158 gates and
  MUST NOT be decided or claimed by this feature. Service and store construction can proceed before that policy is
  chosen.
- The approved architecture assigns frontend transient sessions to Redis, but adapter design, public signatures, and
  runtime composition remain planning decisions rather than stakeholder requirements in this specification.

### Authority findings

The remaining B6 comparison, clock-tolerance, and provider-support decisions are not chosen here. They gate session
issuance: #217's trusted handoff confirms signed `auth_time` presence only, so the reference consumer must not create
a session or cookie until freshness is confirmed. Service and store construction is not blocked by that unresolved
policy.
