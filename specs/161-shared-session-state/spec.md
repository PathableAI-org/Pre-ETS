# Feature Specification: Shared Session State

**Feature Branch**: `161-shared-session-state`

**Created**: 2026-11-05

**Status**: Draft

**Input**: User description: "Use the strict review feedback and GitHub issue #153 to specify the expected shared-session state and its evidence boundaries."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Use one session across independent consumers (Priority: P1)

As an application operator, I need independently running session consumers to recognize the same authenticated user, tenant, idle deadline, and warning policy so that request routing does not depend on the consumer that established the session.

**Why this priority**: Cross-consumer consistency is the central outcome of this delivery slice and the prerequisite for later application-wide enforcement.

**Independent Test**: Establish a session through one independent consumer, use its browser-facing reference through another consumer sharing the same transient state, and observe the same usable user, tenant, idle deadline, and warning policy without affinity to the creator.

**Acceptance Scenarios**:

1. **Given** a trusted user and tenant and valid effective session policy, **When** one consumer establishes a session and another consumer reads the same reference, **Then** both consumers observe the same user, tenant, authoritative idle deadline, and effective warning policy.
2. **Given** a usable session established through one consumer, **When** another consumer updates or ends that session, **Then** subsequent consumers honor the updated or ended state without routing back to the first consumer.
3. **Given** an unknown, expired, or invalidated session reference, **When** any consumer reads it, **Then** no usable user or tenant identity is returned.

---

### User Story 2 - Enforce the authoritative idle deadline (Priority: P1)

As a security stakeholder, I need the server-side session deadline to control renewal and expiration so that background traffic, browser timers, policy changes, or request races cannot keep an ended session usable.

**Why this priority**: A shared identity is safe only when all consumers honor the same authoritative deadline and no request can revive an expired session.

**Independent Test**: Exercise qualifying and excluded activity before, exactly at, and after the current deadline, including concurrent requests and a policy increase, and observe renewal only before the deadline for qualifying activity.

**Acceptance Scenarios**:

1. **Given** a usable session and qualifying authenticated activity received before its deadline, **When** the activity is accepted, **Then** the session receives a new deadline and warning policy derived from the tenant policy effective at that refresh.
2. **Given** a usable session whose tenant policy has changed, **When** no qualifying refresh occurs, **Then** its established deadline and warning policy remain unchanged.
3. **Given** two usable sessions for a tenant whose policy changes, **When** they next receive qualifying activity at different times before their respective deadlines, **Then** each adopts the current policy at its own refresh rather than changing simultaneously.
4. **Given** automatic polling, status traffic, or another request classified as non-qualifying, **When** that traffic occurs, **Then** it does not extend the idle deadline.
5. **Given** activity received exactly at or after the authoritative deadline, **When** renewal is attempted, **Then** the session remains unusable and cannot be revived, including after the configured timeout is increased.

---

### User Story 3 - Reject invalid policy without fallback (Priority: P2)

As a tenant administrator, I need invalid explicit timeout settings to be rejected rather than silently replaced so that the effective session policy is predictable.

**Why this priority**: Session lifecycle behavior cannot be trusted when configuration errors silently change the policy.

**Independent Test**: Read tenant policy with boundary, omitted, fractional, and out-of-range timeout values and observe the accepted effective value or explicit rejection.

**Acceptance Scenarios**:

1. **Given** an explicit whole-minute timeout from 5 through 30 inclusive, **When** the tenant policy is read, **Then** that timeout is accepted.
2. **Given** no timeout setting, **When** the tenant policy is read, **Then** the effective timeout is 30 minutes.
3. **Given** an explicit timeout outside 5 through 30 or not expressed as whole minutes, **When** the tenant policy is read, **Then** the configuration is rejected and the 30-minute default is not substituted.

---

### User Story 4 - Fail closed under invalidation and service failure (Priority: P2)

As an application consumer, I need usable, unavailable, and absent session outcomes to remain distinguishable so that an outage or race cannot become authenticated access or a replacement session.

**Why this priority**: Fail-closed outcomes preserve the security value of the shared session contract during destructive races and infrastructure failures.

**Independent Test**: Race invalidation against renewal and introduce controlled shared-state failures, then observe final invalidation and a distinct failure outcome with no usable identity.

**Acceptance Scenarios**:

1. **Given** a usable shared session, **When** one consumer invalidates it, **Then** all consumers stop obtaining usable identity from that reference.
2. **Given** invalidation and renewal overlap, **When** both operations complete, **Then** renewal does not restore the invalidated session.
3. **Given** the shared session state is unavailable, **When** a consumer attempts to read or change a session, **Then** the consumer receives a service-failure outcome distinct from no usable session and receives no usable identity.
4. **Given** a session operation fails, **When** the outcome is handled by the bounded reference consumer, **Then** it does not grant protected success or silently create a replacement authenticated session.

### Edge Cases

- The minimum timeout of 5 whole minutes and maximum timeout of 30 whole minutes are accepted; fractional, non-numeric, and out-of-range explicit values are rejected.
- An omitted timeout yields 30 minutes, while an explicit invalid timeout never falls back to 30 minutes.
- Qualifying activity immediately before the deadline can renew; activity exactly at or after the deadline cannot.
- A timeout increase after the authoritative deadline cannot revive the session.
- Concurrent renewal and expiration converge on an unusable session once the deadline has been reached.
- Concurrent renewal and explicit invalidation converge on an invalidated session.
- Independent sessions may temporarily carry different deadlines and warning policies while adopting a tenant policy change at different qualifying refreshes.
- Unknown, malformed, expired, and invalidated references yield no usable identity; a shared-state failure remains distinguishable from those outcomes.
- Automatic polling or status traffic does not become qualifying merely because it is authenticated.
- A consumer other than the creator observes the same current identity, policy, renewal, expiration, and invalidation state.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST establish a tenant-bound transient session containing the authenticated user identity, tenant identity, authoritative idle deadline, and effective warning policy required by authorized consumers.
- **FR-002**: The system MUST hold session state in shared transient storage so independent consumers can use the same session without affinity to the consumer that established it.
- **FR-003**: Every consumer of a usable session MUST observe consistent user identity, tenant identity, authoritative idle deadline, and effective warning policy.
- **FR-004**: The system MUST accept explicit idle timeouts expressed as whole minutes from 5 through 30 inclusive, use 30 minutes when the setting is omitted, and reject every invalid explicit value without substituting the default.
- **FR-005**: A newly established session MUST receive an authoritative idle deadline derived from the effective tenant timeout at establishment.
- **FR-006**: Qualifying authenticated activity received before the current authoritative deadline MUST renew the session using the tenant timeout and warning policy effective at that refresh.
- **FR-007**: Until a qualifying refresh occurs, a usable session MUST retain its established deadline and warning policy; different sessions MAY adopt the same policy change at different refreshes.
- **FR-008**: Traffic classified as automatic polling, status traffic, or otherwise non-qualifying MUST NOT extend the idle deadline.
- **FR-009**: At or after the authoritative deadline, the session MUST be unusable and MUST NOT be revived by renewal, concurrent activity, or a later timeout increase.
- **FR-010**: Expiration, renewal, and invalidation performed through one consumer MUST be honored by every other consumer of the same shared session.
- **FR-011**: Explicit invalidation MUST be final for the referenced session, including when invalidation overlaps renewal.
- **FR-012**: Consumers MUST be able to distinguish a usable session from no usable session and from a shared-session service failure.
- **FR-013**: Unknown, expired, or invalidated state and service failures MUST NOT yield usable identity, grant protected success at the bounded reference consumer, or silently create a replacement authenticated session.
- **FR-014**: The shared session contract MUST be limited to the identity and lifecycle state authorized by this slice and MUST NOT become arbitrary application-value storage or durable domain persistence.
- **FR-015**: The feature MUST provide a bounded reference consumption path sufficient to observe the reusable contract and its fail-closed outcomes without claiming comprehensive application entry-point enforcement.

### Key Entities _(include if feature involves data)_

- **Transient session**: A tenant-bound, non-domain record representing authenticated user identity, the authoritative idle deadline, and the effective warning policy for one browser-facing session reference.
- **Session reference**: An opaque browser-held value used to locate a transient session; possession alone does not establish a usable session when the record is absent, expired, invalidated, or unavailable.
- **Effective session policy**: The accepted timeout and warning policy used at session establishment or a qualifying refresh.
- **Session outcome**: One of usable session state, no usable session, or shared-session service failure, with usable identity available only in the first outcome.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Across every planned independent-consumer scenario, a session established by one consumer is read by another with identical user, tenant, deadline, and warning-policy values.
- **SC-002**: All timeout boundary cases accept 5 through 30 whole minutes, omission produces 30 minutes, and every exercised invalid explicit value is rejected without fallback.
- **SC-003**: Every planned before/equal/after-deadline scenario renews only qualifying activity received before the deadline; no scenario revives a session at or after its deadline.
- **SC-004**: In every planned policy-change scenario, an unrefreshed session retains its established state and each qualifying pre-deadline refresh adopts the then-effective policy independently.
- **SC-005**: In every planned renewal/expiration and renewal/invalidation race, the final observable state is unusable when expiration or invalidation wins authority; no later read returns usable identity.
- **SC-006**: Controlled shared-state failures are distinguishable from absent or ended sessions in every exercised operation and never produce usable identity or protected success.
- **SC-007**: Reviewers can identify, from the feature artifacts alone, which service/store and bounded-reference claims this slice supports and which application, browser, recovery, and provider claims remain assigned downstream.

## Assumptions

- Trusted authenticated identity and accepted tenant configuration are inputs to this slice; complete provider authentication and freshness verification remain assigned to adjacent or downstream delivery work.
- Classification of an incoming request as qualifying or non-qualifying is supplied by the authorized activity policy; browser activity detection and coordination are outside this slice.
- The warning policy is carried and updated with authoritative session state, but warning presentation and cross-tab behavior are outside this slice.
- No absolute maximum session lifetime is introduced by this feature.
- The bounded reference consumer demonstrates reusable behavior only; it is not evidence of default protection across all application pages, handlers, actions, or future resources.

## Delivery Authority and Scope _(mandatory)_

**Delivery issue**: [#153 — Share session identity and authoritative idle state across instances](https://github.com/PathableAI-org/Pre-ETS/issues/153)

**Originating delivery slice**: [Authentication and session management, S2 — Share session identity and authoritative idle state across instances](https://github.com/PathableAI-org/Pre-ETS/blob/e206d165f0f30999220922f57a3f92549c15f4cc/docs/delivery/session-management.md#s2--share-session-identity-and-authoritative-idle-state-across-instances), approved by PR #189 at `e206d165f0f30999220922f57a3f92549c15f4cc`

### Accepted requirement coverage

| Requirement                                                                 | Acceptance criteria in this slice | Feature disposition                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PREETS-SESSION-006](../../docs/requirements/session/PREETS-SESSION-006.md) | AC1–3                             | Specifies the shared-store and independent-consumer increment. AC2–3 application-level recognition, protected access, and complete cross-instance enforcement remain incomplete until #154 composes these capabilities through independently running application instances. |
| [PREETS-SESSION-008](../../docs/requirements/session/PREETS-SESSION-008.md) | AC1–5                             | Specifies configuration, deadline, renewal, expiration, policy-adoption, excluded-traffic, race, and fail-closed service/store behavior. Complete protected HTTP and browser enforcement remains assigned to #154–#157.                                                     |

### Authorized outcome

Independent session consumers share the same user and tenant identity and honor one authoritative idle lifecycle, with predictable configuration, final expiration and invalidation, and fail-closed outcomes.

### In scope

- Shared, tenant-bound transient identity and authoritative idle state usable across independent consumers without creator affinity.
- Initialization, read, qualifying renewal, expiration, explicit invalidation, and their concurrency and failure outcomes.
- Timeout configuration and the warning-policy state needed at initialization and qualifying refresh.
- Gradual adoption of current tenant policy at qualifying refresh, with no revival at or after the existing deadline.
- Distinct usable-session, no-usable-session, and service-failure outcomes.
- A bounded reference consumer and retained service/store evidence for the reusable contract.

### Out of scope

- Comprehensive application integration and default protection across all pages, route handlers, server actions, direct resources, or future resources; owned by [#154](https://github.com/PathableAI-org/Pre-ETS/issues/154).
- Browser activity detection, cross-tab coordination, warning presentation, and recovery experiences; owned by [#155](https://github.com/PathableAI-org/Pre-ETS/issues/155)–[#157](https://github.com/PathableAI-org/Pre-ETS/issues/157).
- Completed provider-freshness semantics and provider compatibility; owned by [#158](https://github.com/PathableAI-org/Pre-ETS/issues/158) for the affected integration.
- Backend/domain persistence, API expiration-response policy, a new absolute maximum lifetime, concrete cloud or ingress design, CI cadence, arbitrary application-value storage, and undecided policy.
- Heartbeat and connection-loss input behavior, which awaits a separate accepted requirement.

### Dependencies and blockers

- Accepted B3/B4 contracts are the start authority for the reusable service/store behavior; no #154 or browser increment is a blanket start prerequisite.
- Remaining B6 authentication-freshness decisions gate only affected authentication composition. They do not change this feature's shared-state, deadline, invalidation, or failure contract.
- Downstream #154–#158 evidence is required before claiming the complete application, browser, recovery, or provider outcomes named above.

### Authority findings

None. The live issue identifies one approved S2 slice and explicitly bounds the partial evidence it can establish. Its seven closed child issues are execution history, not proof that the parent requirements are fully verified; the verification plan therefore preserves the issue's downstream limitations and requires revision-attributable evidence for any closure claim.
