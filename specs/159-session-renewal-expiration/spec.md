# Feature Specification: Renew and Expire Authoritative Sessions

**Feature Branch**: `159-session-renewal-expiration`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "https://github.com/PathableAI-org/Pre-ETS/issues/220"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Renew a Still-Usable Session (Priority: P1)

As an authenticated user who is actively using the application, I keep my session when qualifying activity reaches
the server before the session's authoritative idle deadline.

**Why this priority**: Timely renewal is the primary user value of this slice and must remain authoritative across
application instances.

**Independent Test**: Establish a session with a known deadline, submit qualifying activity before that deadline
through an independent session consumer, and observe a later deadline together with the effective timeout and warning
policy used for the renewal.

**Acceptance Scenarios**:

1. **Given** a usable authenticated session and qualifying activity that reaches the server before its authoritative
   deadline, **When** renewal is evaluated, **Then** the session remains usable and receives a new authoritative
   deadline derived from the tenant's effective policy at that time.
2. **Given** a usable session whose tenant timeout or warning policy has changed since its previous refresh, **When**
   qualifying activity arrives before the established deadline, **Then** the renewed session exposes the newly
   effective timeout and warning policy.
3. **Given** two independently active sessions for a tenant whose policy changes, **When** only one receives a
   qualifying refresh, **Then** that session adopts the new policy while the other retains its established policy and
   deadline until its own qualifying refresh.
4. **Given** a usable session whose warning offers Continue or Keep working, **When** that action reaches the server
   before the authoritative deadline, **Then** it qualifies for renewal and returns the renewed deadline and effective
   warning policy.

---

### User Story 2 - Refuse Nonqualifying or Late Renewal (Priority: P2)

As a user whose session has reached its authoritative deadline, I cannot regain authenticated access through late or
incidental activity, even when a timeout was increased or a browser still appears active.

**Why this priority**: Renewal is safe only when expiration cannot be bypassed or reversed.

**Independent Test**: Exercise qualifying and nonqualifying activity immediately before, exactly at, and after a
known deadline and observe that only qualifying activity received before the deadline can renew the session.

**Acceptance Scenarios**:

1. **Given** a usable session, **When** automatic polling, unrelated background traffic, raw pointer movement, or a
   programmatic focus change occurs, **Then** its authoritative deadline is unchanged.
2. **Given** a session at or beyond its authoritative deadline, **When** qualifying activity or Continue reaches the
   server, **Then** no usable authenticated identity is returned and the session is not revived.
3. **Given** a session expired under its established policy and a later tenant timeout increase, **When** activity is
   evaluated, **Then** the increase does not revive the expired session.
4. **Given** browser timers are disabled, delayed, or inaccurate, **When** the authoritative deadline is reached,
   **Then** session consumers can no longer obtain usable authenticated identity.

---

### User Story 3 - Observe One Consistent Session Outcome (Priority: P3)

As an application consumer, I receive a consistent usable-session, no-usable-session, or storage-failure outcome from
shared session state, including when independent consumers race to renew or expire it.

**Why this priority**: Consumers must not grant access from stale state or mistake dependency failure for an absent
session.

**Independent Test**: Use independent clients of the shared session storage to race renewal and expiration at the
authoritative boundary, then confirm that every later read agrees on the outcome authorized by the operation ordering
and that storage failure remains distinguishable.

**Acceptance Scenarios**:

1. **Given** independent consumers of the same usable session, **When** one renews before the deadline, **Then** the
   others observe the renewed deadline and effective warning policy without affinity to the renewing consumer.
2. **Given** independent consumers concurrently evaluate renewal and expiration at the deadline boundary, **When**
   their operations complete, **Then** all later consumers agree on the authoritative winner: a valid pre-deadline
   renewal may remain usable, while an expired result remains unusable and cannot be revived by a stale operation.
3. **Given** missing or expired session state, **When** a consumer reads it, **Then** it receives no usable session
   without requiring a retained record solely to distinguish missing from expired state.
4. **Given** the shared session store cannot complete an operation, **When** a consumer initializes, reads, or renews a
   session, **Then** it receives a storage-failure outcome rather than usable identity or an ordinary no-session
   outcome.

---

### User Story 4 - Reject Invalid Session Policy at Tenant Consumption (Priority: P4)

As an operator, I can rely on invalid tenant timeout or warning policy being rejected when the tenant configuration is
actually consumed, so renewal never proceeds with an invalid effective policy.

**Why this priority**: Renewal must not use policy values outside the accepted tenant configuration domain.

**Independent Test**: Exercise the real tenant-consumption boundary with invalid timeout and warning values and
observe rejection without an effective session policy being supplied for renewal.

**Acceptance Scenarios**:

1. **Given** an explicit timeout or warning value outside its permitted domain, **When** the selected tenant
   configuration is consumed, **Then** the configuration is rejected and does not supply an effective policy for
   session initialization or renewal.

### Edge Cases

- Qualifying activity is received immediately before, exactly at, and immediately after the authoritative deadline.
- A renewal races with expiration through independent consumers of the same shared session.
- Tenant timeout and warning policy change together, including transitions to or from a disabled warning.
- One of several independent sessions refreshes after a policy change while the others remain unrefreshed.
- A timeout increase occurs after the prior authoritative deadline has already passed.
- Continue arrives late after the warning was shown, or is duplicated by independent clients.
- Nonqualifying traffic is interleaved with qualifying activity and ordinary reads.
- Session state is missing, malformed, unavailable, or removed during an operation.
- Explicit configuration values are fractional, nonnumeric, below or above the allowed timeout range, or set a
  nonzero warning equal to or greater than the effective timeout.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Session initialization, read, and successful renewal MUST expose the authoritative idle deadline and the
  effective warning policy together with the usable authenticated identity and tenant association.
- **FR-002**: A usable authenticated session MUST renew only when qualifying activity reaches the authoritative
  session boundary strictly before its current deadline.
- **FR-003**: Successful renewal MUST derive the new deadline from the tenant's effective timeout at that refresh and
  MUST expose the effective warning policy adopted at the same refresh.
- **FR-004**: An unrefreshed session MUST retain its established deadline and warning policy; independent sessions MAY
  adopt changed tenant policy at different qualifying refreshes.
- **FR-005**: Deliberate authenticated page and form requests, Continue or Keep working received before expiration,
  and server communication representing intentional activation, keyboard, text-entry, touch, or user-driven
  meaningful-input focus activity MUST qualify for renewal.
- **FR-006**: Automatic polling, unrelated background traffic, raw pointer movement, and programmatic focus changes
  alone MUST NOT renew the authoritative deadline.
- **FR-007**: At or after the authoritative deadline, activity including Continue MUST NOT revive the session or yield
  usable authenticated identity, including after a tenant timeout increase.
- **FR-008**: Authoritative expiration MUST prevent session consumers from obtaining usable authenticated identity
  independently of browser timer behavior.
- **FR-009**: Renewal and expiration MUST remain consistent across independent consumers of the shared session state;
  consumers MUST converge on the outcome authorized by operation ordering, and a stale operation MUST NOT revive
  state after authoritative expiration.
- **FR-010**: Consumers MUST be able to distinguish a usable session, no usable session, and a storage failure for
  initialization, read, and renewal as applicable.
- **FR-011**: Missing and expired state MAY share the no-usable-session outcome; the feature MUST NOT require retained
  records solely to distinguish those conditions.
- **FR-012**: Invalid explicit timeout and warning values MUST be rejected through actual tenant configuration
  consumption and MUST NOT supply an effective policy for session initialization or renewal.

### Key Entities

- **Authenticated session**: Temporary tenant-bound identity with an authoritative idle deadline and the warning
  policy effective at its most recent initialization or qualifying refresh.
- **Authoritative idle deadline**: The instant before which qualifying activity may renew a still-usable session;
  equality with or passage beyond this instant is expired.
- **Effective session policy**: The accepted tenant timeout and warning settings used to establish a deadline and
  warning behavior at initialization or renewal.
- **Activity classification**: Whether server-received activity represents a qualifying deliberate interaction or
  excluded incidental/background traffic.
- **Session outcome**: One of usable authenticated session, no usable session, or session-storage failure.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In the planned before/equal/after boundary matrix, 100% of qualifying pre-deadline cases renew and 100%
  of at-deadline and post-deadline cases remain unusable.
- **SC-002**: In the planned excluded-traffic matrix, 100% of raw movement, programmatic-focus-only, automatic-polling,
  and unrelated-background cases leave the authoritative deadline unchanged.
- **SC-003**: In the planned policy-change matrix, every refreshed session exposes the then-effective timeout and
  warning policy, while every unrefreshed session retains its previously established deadline and policy.
- **SC-004**: Across the planned independent-consumer and concurrency cases, 100% of consumers converge on the outcome
  authorized by operation ordering, and no stale operation revives state after authoritative expiration.
- **SC-005**: Every planned initialization, read, and renewal failure case yields the correct usable, no-usable, or
  storage-failure outcome without substituting one for another.
- **SC-006**: Every planned invalid timeout/warning case is rejected through tenant consumption without supplying an
  effective session policy.

## Assumptions

- Delivery issue #218 has supplied the public shared-session capability and distributed storage baseline required to
  start this slice.
- Qualifying browser interactions are communicated by downstream browser work; this slice classifies and enforces the
  activity presented to the authoritative session boundary but does not produce browser events.
- Comprehensive application entry-point wiring and protected HTTP outcomes remain downstream work under issue #154.
- Reference consumers from issue #219 may provide bounded integration evidence when available, but are not required
  to start or complete this service/store slice.
- No new absolute maximum session lifetime, old-record retention policy, heartbeat, or connection-loss behavior is
  inferred by this feature.

## Delivery Authority and Scope _(mandatory)_

**Delivery issue**: [#220 — Implement authoritative idle renewal and expiration](https://github.com/PathableAI-org/Pre-ETS/issues/220)

**Originating delivery slice**: [Approved S2 baseline at revision `e206d165f0f30999220922f57a3f92549c15f4cc`](https://github.com/PathableAI-org/Pre-ETS/blob/e206d165f0f30999220922f57a3f92549c15f4cc/docs/delivery/session-management.md#s2--share-session-identity-and-authoritative-idle-state-across-instances), subdivided as [S2-F at current `origin/main` revision `c1d87a22a55cd5190bc702a6a3c33cfed2ca23ef`](https://github.com/PathableAI-org/Pre-ETS/blob/c1d87a22a55cd5190bc702a6a3c33cfed2ca23ef/docs/delivery/session-management-s2-steps.md#s2-f--implement-authoritative-idle-renewal-and-expiration). The issue records maintainer authorization and publication of the seven-step subdivision on 2026-10-17; the supplemental plan's repository review remains pending, so the issue and accepted requirements remain the controlling feature authority.

### Accepted requirement coverage

| Requirement        | Acceptance criteria in this slice                | Feature disposition                                                                                                                                                                      |
| ------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PREETS-SESSION-008 | AC3–5                                            | Specify pre-deadline qualifying renewal, gradual current-policy adoption, excluded traffic, and no revival at or after expiration.                                                       |
| PREETS-SESSION-006 | AC3, service/store portion                       | Specify cross-consumer consistency for activity updates and expiration without instance affinity; application HTTP composition remains #154.                                             |
| PREETS-SESSION-009 | AC1–4, server classification/enforcement portion | Specify qualifying and excluded activity categories presented to the server boundary and reject late activity; browser event production remains #155/#156.                               |
| PREETS-SESSION-011 | AC2–4, server policy/renewal portion             | Specify warning-policy adoption on refresh, pre-deadline Continue as qualifying activity, and rejection of late Continue; warning presentation and cross-tab behavior remain downstream. |

The initial deadline, effective policy value domains/defaults, and usable-session state delivered by #218 are
prerequisites for these scenarios rather than new completion claims. Issue #220 separately requires invalid policy
evidence through the real tenant consumer; this slice does not claim PREETS-TENANT-004's complete HTTP failure
mapping.

### Authorized outcome

Session consumers receive authoritative renewal and expiration behavior from shared session state: qualifying activity
renews only before the current deadline using the then-effective tenant policy, while expiration remains final and
consistent across independent consumers.

### In scope

- Authoritative initialization, read, qualifying renewal, and expiration outcomes at the public session boundary.
- Current timeout and warning-policy adoption on successful refresh while preserving unrefreshed session state.
- Server-side classification of presented qualifying versus excluded activity.
- Before/equal/after deadline behavior, concurrency, independent-consumer consistency, and storage-failure outcomes.
- Invalid session-policy rejection through the real tenant configuration consumer.
- Optional bounded extension of issue #219 reference fixtures when available, with their coverage limits recorded.

### Out of scope

- Comprehensive application-wide protection, request wiring, and protected HTTP enforcement owned by #154.
- Browser activity production, warning presentation, Continue interaction, cross-tab coordination, logout, and final
  recovery owned by #155–#158.
- Backend/domain persistence, backend API expiration-response policy, a new absolute maximum lifetime, cloud/ingress,
  CI cadence, arbitrary application-value storage, heartbeat/connection-loss behavior, and unresolved freshness or
  provider policy.
- Retained records or tombstones solely to distinguish expiration from an unknown unavailable session.

### Dependencies and blockers

- Start prerequisite #218 is closed and its shared-session baseline is available on `origin/main`.
- Issue #219 reference fixtures are optional evidence rather than a start or closure dependency.
- No unresolved product decision blocks this service/store specification. B6 freshness, clock, and provider-support
  decisions gate their affected authentication work, not ordinary idle renewal and expiration.

### Authority findings

None. The subdivision supplement remains pending repository review, but issue #220 directly records the maintainer's
authorization and publication of S2-F and matches the accepted current-`origin/main` requirement scope.
