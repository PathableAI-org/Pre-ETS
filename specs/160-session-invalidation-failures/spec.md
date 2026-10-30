# Feature Specification: Complete Session Invalidation and Failure Behavior

**Feature Branch**: `160-session-invalidation-failures`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "https://github.com/PathableAI-org/Pre-ETS/issues/221"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Invalidate a Shared Session (Priority: P1)

As an application consumer ending an authenticated session, I can invalidate that session once and rely on every
independent session consumer treating its old reference as unusable afterward.

**Why this priority**: Shared invalidation is the primary outcome of this slice. Without it, a session ended by one
consumer can continue supplying authenticated identity through another.

**Independent Test**: Establish one usable tenant-bound session, invalidate it through one session consumer, then use
an independent consumer to read and renew the old reference and observe no usable authenticated identity.

**Acceptance Scenarios**:

1. **Given** a usable authenticated session visible to two independent consumers, **When** one consumer completes
   explicit invalidation, **Then** neither consumer can subsequently obtain usable authenticated identity from that
   session reference.
2. **Given** a successfully invalidated session, **When** a consumer later attempts to renew or reuse its old
   reference, **Then** the session remains unusable and no replacement authenticated session is created.
3. **Given** a session whose stored cause is not available to the consumer, **When** the old reference is read after
   invalidation, expiration, or removal, **Then** the consumer may receive the same no-usable-session outcome without
   a retained cause record.

---

### User Story 2 - Keep Invalidation and Expiration Final During Races (Priority: P2)

As a user whose session is being invalidated or has expired, I cannot regain authenticated identity because another
consumer was renewing the same session concurrently.

**Why this priority**: Invalidation is safe only when stale or racing renewal cannot restore ended access.

**Independent Test**: Use independent consumers and controlled operation ordering to race renewal with invalidation
and expiration, then confirm that every later read and renewal observes no usable session once invalidation completes
or authoritative expiration wins.

**Acceptance Scenarios**:

1. **Given** a usable session and independent consumers concurrently attempting renewal and invalidation, **When**
   both operations complete, **Then** the final shared outcome is no usable session and later renewal cannot restore
   it.
2. **Given** a session at or after its authoritative deadline, **When** renewal races with expiration handling,
   **Then** the old session remains unusable and cannot be revived.
3. **Given** a consumer that previously observed usable state, **When** another consumer completes invalidation,
   **Then** the first consumer's next read or renewal does not recreate or return the previously observed identity.

---

### User Story 3 - Fail Closed When Shared Session State Is Unavailable (Priority: P3)

As an application consumer, I receive an explicit service-failure outcome when shared session state cannot be read or
changed, rather than an ordinary absent-session result or an authorization success.

**Why this priority**: Dependency failure must not be mistaken for either a safe completed lifecycle operation or a
usable authenticated session.

**Independent Test**: Make the real shared session store unavailable during read, renewal, and invalidation, then
observe a distinct failure outcome with no usable identity, successful authorization, or silent replacement session.

**Acceptance Scenarios**:

1. **Given** a session operation whose shared state cannot be read or changed, **When** the operation is attempted,
   **Then** the consumer receives an explicit service-failure outcome distinct from no usable session.
2. **Given** a shared-store failure during read, renewal, or invalidation, **When** the failure is returned, **Then**
   it contains no usable authenticated identity, authoritative deadline, or effective warning policy and cannot be
   treated as authorization success.
3. **Given** invalidation cannot establish an authoritative result because the shared store is unavailable, **When**
   the operation returns, **Then** it reports failure rather than claiming completed invalidation or silently creating
   or replacing a session.

### Edge Cases

- Invalidation completes while another consumer is preparing or committing renewal.
- Renewal completes immediately before invalidation, while invalidation still determines the final shared outcome.
- A stale consumer attempts another read or renewal after invalidation completed elsewhere.
- The session reaches its authoritative deadline during an invalidation-versus-renewal race.
- The old reference is missing, expired, invalidated, or removed and no authoritative cause is retained.
- Shared storage becomes unavailable before an operation starts or while read, renewal, or invalidation is in flight.
- Shared storage recovers after a failed invalidation; the earlier failure did not prove invalidation completed.
- Storage becomes available again after a failure; consumers must not reuse a prior successful observation as proof
  that the session is still usable.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: An application consumer MUST be able to request explicit invalidation of an identified shared session.
- **FR-002**: After explicit invalidation completes successfully, every independent consumer of the old session
  reference MUST receive no usable authenticated identity from subsequent reads or renewals.
- **FR-003**: Renewal racing with invalidation MUST NOT leave or recreate a usable session after invalidation
  completes, regardless of which independent consumer initiated either operation.
- **FR-004**: At or after authoritative expiration, renewal or other lifecycle activity MUST NOT restore usable
  authenticated identity, including when expiration and renewal are concurrent.
- **FR-005**: A consumer that previously observed usable state MUST re-evaluate shared session state for a later read
  or renewal and MUST NOT restore invalidated or expired identity from its stale observation.
- **FR-006**: Independent consumers MUST observe a consistent final no-usable-session outcome after successful
  invalidation or authoritative expiration without affinity to the consumer that enforced it.
- **FR-007**: Consumers MUST be able to distinguish a usable session, no usable session, and a session-service failure
  wherever those outcomes apply to read, renewal, and invalidation.
- **FR-008**: Only a usable-session outcome MAY include authenticated identity, tenant association, authoritative
  deadline, or effective warning policy; no-usable-session and service-failure outcomes MUST NOT expose those values.
- **FR-009**: When shared session state cannot be read or changed, the operation MUST return an explicit service
  failure and MUST NOT return usable identity, successful authorization, or an ordinary no-usable-session result.
- **FR-010**: A failed lifecycle operation MUST NOT be reported as a successful invalidation or renewal and MUST NOT
  silently create or replace an authenticated session.
- **FR-011**: Missing, expired, invalidated, and otherwise unavailable state MAY share the no-usable-session outcome
  when the authoritative cause is unknown.
- **FR-012**: Correct denial MUST NOT require retention of an invalidation or expiration cause, a prescribed retention
  period, or a specific deletion mechanism.

### Key Entities

- **Authenticated session**: Temporary tenant-bound identity that is usable only while its shared state remains valid
  and strictly before its authoritative deadline.
- **Session reference**: The opaque identifier an application consumer presents to read, renew, or invalidate the
  corresponding authenticated session.
- **Invalidation**: The successful shared lifecycle transition after which the identified old session can no longer
  provide or regain usable authenticated identity.
- **Session outcome**: One of usable authenticated session, no usable session, or explicit session-service failure.
- **Authoritative session details**: Tenant-bound identity, idle deadline, and effective warning policy supplied only
  with a usable-session outcome.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In 100% of the planned two-consumer invalidation cases, every read and renewal after successful
  invalidation returns no usable authenticated identity.
- **SC-002**: Across every planned invalidation-versus-renewal and expiration-versus-renewal ordering, the final state
  is unusable once invalidation completes or authoritative expiration wins, and no later renewal revives it.
- **SC-003**: In 100% of the planned real-store outage cases, read, renewal, and invalidation return an explicit
  service-failure outcome with zero authorization successes and zero silent session creations or replacements.
- **SC-004**: In every planned outcome-contract case, usable session, no usable session, and service failure are
  distinguishable, and authoritative identity, deadline, and warning policy appear only with usable sessions.
- **SC-005**: Every planned missing, expired, invalidated, and removed-state case denies usable identity without
  requiring the observer to distinguish an unavailable cause or find a retained cause record.

## Assumptions

- Issue #220 has delivered authoritative renewal, expiration, and current public outcome behavior on `origin/main`;
  this feature extends that lifecycle rather than redefining renewal policy.
- Issue #219's bounded reference consumer and retained fixtures are available for limited composed observations, but
  comprehensive application entry-point enforcement remains owned by #154.
- Explicit invalidation addresses one existing session reference. User-wide, account-wide, provider-wide, and
  tenant-wide revocation are not authorized by this slice.
- Successful invalidation means the authoritative operation completed. If the service cannot establish that result,
  it reports failure and makes no claim that the pre-existing session was removed.
- No requirement in this slice distinguishes missing, expired, invalidated, or removed causes when shared state does
  not authoritatively supply that distinction.

## Delivery Authority and Scope _(mandatory)_

**Delivery issue**: [#221 — Complete session invalidation and failure behavior](https://github.com/PathableAI-org/Pre-ETS/issues/221)

**Originating delivery slice**: [Approved S2 baseline at revision `e206d165f0f30999220922f57a3f92549c15f4cc`](https://github.com/PathableAI-org/Pre-ETS/blob/e206d165f0f30999220922f57a3f92549c15f4cc/docs/delivery/session-management.md#s2--share-session-identity-and-authoritative-idle-state-across-instances), subdivided as [S2-G at current `origin/main` revision `db4b5615c10aa3948ea91919a524a3ed6b743cb2`](https://github.com/PathableAI-org/Pre-ETS/blob/db4b5615c10aa3948ea91919a524a3ed6b743cb2/docs/delivery/session-management-s2-steps.md#s2-g--complete-session-invalidation-and-failure-behavior). Issue #221 records the maintainer-authorized seven-step subdivision and publication on 2026-10-17.

### Accepted requirement coverage

| Requirement        | Acceptance criteria in this slice       | Feature disposition                                                                                                                                                                    |
| ------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PREETS-SESSION-006 | AC1–3, invalidation/consistency support | Specify shared invalidation and consistent post-invalidation outcomes across independent consumers; comprehensive cross-instance application HTTP recognition remains #154.            |
| PREETS-SESSION-008 | AC4, no-revival race support            | Specify that expiration remains final when lifecycle operations race; comprehensive protected-access and browser-timer evidence remains downstream.                                    |
| PREETS-SESSION-013 | AC2, old-session denial support         | Specify that an old invalidated or expired session cannot be renewed or reused through the public session boundary; fresh-provider recovery and new-session establishment remain #158. |

### Authorized outcome

Application consumers can explicitly invalidate shared session state and distinguish no usable session from a real
session-service failure. Independent consumers cannot restore invalidated or expired authenticated identity through
concurrent renewal or stale state.

### In scope

- Explicit invalidation through the public shared-session boundary.
- Consistent post-invalidation read and renewal outcomes across independent clients.
- Invalidation-versus-renewal and expiration-versus-renewal race outcomes that prevent revival.
- Distinct usable-session, no-usable-session, and service-failure outcomes, with policy and deadline supplied only for
  usable sessions.
- Controlled real-store outage behavior that returns explicit failure without authorization success or silent
  session creation/replacement.
- Retained lifecycle, race, and outage evidence for downstream application, browser coordination, recovery, and
  fresh-authentication work.
- Bounded extension of issue #219's reference consumer when available, with its incomplete coverage recorded.

### Out of scope

- Comprehensive application-wide protection, entry-point integration, and protected-request enforcement owned by
  #154.
- Browser logout/activity/warning coordination, recovery presentation, and provider-fresh recovery owned by
  #155–#158.
- User-wide, account-wide, provider-wide, or tenant-wide revocation semantics.
- Cause-retention periods, deletion mechanics, or a required distinction among missing, expired, invalidated, and
  removed state when the cause is unknown.
- Backend/domain persistence, backend API expiration-response policy, a new absolute maximum lifetime, cloud/ingress,
  CI cadence, arbitrary application-value storage, heartbeat/connection-loss behavior, and undecided policy.

### Dependencies and blockers

- Start prerequisite #220 is closed, and its implementation is present at current `origin/main` revision
  `db4b5615c10aa3948ea91919a524a3ed6b743cb2`.
- Issue #219's bounded reference consumer is available for limited evidence but does not establish comprehensive
  application enforcement.
- No unresolved product decision blocks basic invalidation, race, or outage behavior. B6 authentication-time
  comparison, clock tolerance, and provider-support decisions gate affected freshness integration, not this
  service/store slice.

### Authority findings

None. The accepted requirements, issue #221, approved S2 baseline, and current-`origin/main` S2-G subdivision agree on
the feature's service/store scope and downstream ownership.
