# Feature Verification Plan: Shared Session State

**Feature specification**: [spec.md](spec.md)

**Delivery issue**: [#153 — Share session identity and authoritative idle state across instances](https://github.com/PathableAI-org/Pre-ETS/issues/153)

**Status**: Planned — no execution evidence is recorded by this document

## Authority and scope

This plan covers PREETS-SESSION-006 AC1–3 and PREETS-SESSION-008 AC1–5 only to the extent authorized for S2 by issue #153 and the [PR #189 S2 plan revision](https://github.com/PathableAI-org/Pre-ETS/blob/e206d165f0f30999220922f57a3f92549c15f4cc/docs/delivery/session-management.md#s2--share-session-identity-and-authoritative-idle-state-across-instances). It plans reusable session-contract, real shared-state, lifecycle, race, outage, configuration-consumer, and bounded-reference evidence. It does not treat child-issue closure, checked task lists, test counts, prior reports, or issue closure as executed evidence.

The requirements' complete verification plans call for independently running application instances, protected HTTP enforcement, and browser-independent outcomes. Issue #153 expressly assigns comprehensive application evidence to #154 and browser/recovery evidence to #155–#157. Accordingly, this plan records those claims as incomplete rather than overstating what the parent slice can establish.

## Claims and traceability

| ID    | Claim to establish                                                                                                                    | Authoritative source                                                                                              | Meaningful violation                                                                                           | Required observation                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| V-001 | Independent consumers use the same transient session without creator affinity.                                                        | PREETS-SESSION-006 AC1; issue #153 observable increment                                                           | A session is visible only to its creator or requires affinity.                                                 | A second independent consumer reads the session created by the first from shared transient state.                    |
| V-002 | Shared consumers observe consistent user and tenant identity.                                                                         | PREETS-SESSION-006 AC2; issue #153 scope                                                                          | Different consumers return different identity or tenant state for one reference.                               | Both consumers return identical user and tenant state for the same usable session.                                   |
| V-003 | Activity, expiration, and invalidation performed through one consumer are honored by another.                                         | PREETS-SESSION-006 AC3; issue #153 scope                                                                          | A later consumer sees stale state or restores ended access.                                                    | Cross-consumer reads reflect renewal, authoritative expiration, and invalidation.                                    |
| V-004 | Timeout configuration accepts only whole minutes 5–30, defaults omission to 30, and rejects invalid explicit values without fallback. | PREETS-SESSION-008 AC1; issue #153 completion evidence                                                            | An invalid value is accepted or silently replaced by 30.                                                       | Valid boundaries and omission resolve as specified; invalid explicit values produce configuration failure.           |
| V-005 | New sessions receive a deadline derived from the effective timeout.                                                                   | PREETS-SESSION-008 AC2                                                                                            | The initial deadline uses the wrong interval or no authoritative deadline.                                     | Establishment returns the expected deadline for the effective policy and controlled time.                            |
| V-006 | A qualifying request before the current deadline renews using the then-effective timeout and warning policy.                          | PREETS-SESSION-008 AC3; issue #153 scope                                                                          | Renewal uses stale policy or changes sessions without their own refresh.                                       | A pre-deadline qualifying refresh adopts current policy while unrefreshed sessions retain established state.         |
| V-007 | At or after the deadline, no request, race, or later timeout increase revives the session.                                            | PREETS-SESSION-008 AC4; issue #153 scope                                                                          | A late request returns usable identity or extends ended state.                                                 | Equal/after-deadline and concurrent cases remain unusable across consumers.                                          |
| V-008 | Non-qualifying traffic does not extend the deadline.                                                                                  | PREETS-SESSION-008 AC5; issue #153 scope                                                                          | Polling or status traffic renews the session.                                                                  | The deadline remains unchanged after classified non-qualifying traffic.                                              |
| V-009 | Explicit invalidation remains final when raced with renewal.                                                                          | Issue #153 in-scope lifecycle and completion evidence; supports PREETS-SESSION-006 AC3 and PREETS-SESSION-008 AC4 | Renewal recreates or restores the invalidated session.                                                         | All post-race consumers observe no usable session.                                                                   |
| V-010 | No usable session and service failure are distinct, fail-closed outcomes.                                                             | Issue #153 shared-component handoff and completion evidence                                                       | An outage is treated as absence, login success, replacement session, or usable identity.                       | Consumers receive the correct distinct outcome and no usable identity or protected success.                          |
| V-011 | The bounded reference consumer demonstrates the reusable contract without implying comprehensive application protection.              | Issue #153 shared-component ownership and evidence progression                                                    | Reference success is reported as complete application enforcement or a failed session operation grants access. | The exercised path denies unavailable sessions and the evidence record names every unexercised application category. |

## Automated behavioral evidence

| Claim IDs                         | Evidence boundary                                                     | Planned scenario or property                                                                                                                                                                          | Why this boundary is meaningful                                                                      | Known limits                                                                                                                                |
| --------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| V-004, V-005, V-006, V-007, V-008 | Public session-policy consumer                                        | Boundary examples and generated cases cover valid, omitted, fractional, out-of-range, initial-deadline, refresh, excluded-traffic, and before/equal/after-deadline behavior under a controlled clock. | Establishes the reusable consumer contract and broad policy invariants.                              | Does not establish shared-state semantics, concurrent ordering, protected HTTP access, or browser behavior.                                 |
| V-001, V-002, V-003               | Delivered real distributed session state with two independent clients | One client establishes or changes a session and the other reads identical identity and current lifecycle state without affinity.                                                                      | Exercises the actual shared-state boundary rather than a test-owned map or same-client cache.        | Independent clients are not independently running authenticated applications and do not establish real OIDC.                                |
| V-003, V-006, V-007, V-009        | Real distributed state under controlled concurrency                   | Renewal/expiration and renewal/invalidation races cover both operation orderings and verify final no-revival behavior across clients.                                                                 | Concurrent store behavior is a distinct uncertainty not established by pure transformations.         | Finite schedules do not prove every production interleaving or deployment failure.                                                          |
| V-010                             | Public session operations with controlled real-store failures         | Read, establishment, renewal, and invalidation are exercised during connection refusal, interruption, and unavailable-state conditions.                                                               | Establishes that the real adapter preserves distinct fail-closed outcomes.                           | Controlled failures do not establish every infrastructure or recovery mode.                                                                 |
| V-004, V-006                      | Real tenant-configuration consumer plus session refresh               | Invalid configuration is rejected without fallback; a valid change is adopted only by each qualifying pre-deadline refresh.                                                                           | Demonstrates the configuration handoff through the actual consumer rather than only a policy helper. | Does not establish configuration distribution across a production fleet.                                                                    |
| V-010, V-011                      | Bounded reference application consumer                                | Usable, absent/ended, tenant-mismatched where applicable, and service-failure outcomes deny or allow the reference effect as specified.                                                               | Tests the first real consumer handoff and catches fail-open mapping defects.                         | Does not establish default protection, all pages/handlers/actions, final user-facing recovery, or application-wide cross-instance behavior. |

No new requirements-backed BDD is required for the service/store-only claims above. If a retained scenario exercises the bounded running-application reference as requirements evidence, it must use current `origin/main` requirement tags and feature-level `@partial`. Comprehensive SESSION-006 AC2–3 and SESSION-008 protected HTTP/browser scenarios belong to #154–#157. A BDD dry run would establish discovery only, not behavior.

## Agent-executable manual feature verification _(mandatory)_

### Purpose

Observe the delivered reusable session capability as one composed lifecycle across two independent consumers: establish, cross-consumer read, policy change, qualifying refresh, excluded activity, final invalidation, and fail-closed outage. This adds an operator-visible handoff observation across the component boundaries rather than repeating one automated property or claiming comprehensive application protection.

### Prerequisites

- The exact implementation revision under review and its supported local reference harness or public consumer entry point.
- The delivered shared-state service running in an isolated local environment with two independently configured consumers using the same store.
- Synthetic tenant and user identifiers, a valid 5–30 minute policy, a second changed policy, and a controlled way to advance time or use a short evidence-only clock without changing product policy.
- A supported way to classify one action as qualifying and another as non-qualifying.
- A controlled, reversible way to make the shared-state service unavailable.
- No real credentials, provider tokens, production session references, PHI, or client-identifying data.

### Procedure

1. Record the revision, environment, consumer identifiers, synthetic tenant/user labels, initial policy, and evidence commands without recording the opaque session reference or shared-state key.
2. Establish one session through consumer A and read it through consumer B. Compare the safe user/tenant labels, authoritative deadline, and effective warning policy.
3. Change the tenant timeout and warning policy. Before any refresh, read the session again and confirm that its established deadline and policy have not changed.
4. Send one classified non-qualifying action through consumer B and confirm the deadline is unchanged. Then send qualifying activity before the deadline and confirm both consumers observe the new deadline and current warning policy.
5. Establish a second synthetic session before the policy change or refresh it at a different time, and confirm the two sessions adopt the policy independently rather than simultaneously.
6. Invalidate the first session through consumer A while issuing a controlled renewal attempt through consumer B. After both complete, confirm neither consumer can obtain usable identity from the reference.
7. Make the shared-state service unavailable, exercise the bounded reference consumer, and confirm the result is a distinct failure that grants no protected success and creates no replacement session.
8. Restore the shared-state service, remove all synthetic records and fixtures owned by this run, stop the two consumers, and record cleanup completion and any residual uncertainty.

### Expected observations

- V-001–V-003: both consumers observe identical safe identity and lifecycle state, including cross-consumer changes.
- V-006 and V-008: excluded activity leaves the deadline unchanged; qualifying pre-deadline activity adopts current policy.
- V-009: invalidation remains final despite the overlapping renewal attempt.
- V-010 and V-011: an outage is distinguishable, fail closed, and is reported only as bounded reference evidence.

### Evidence to retain

- Revision, environment, prerequisite versions, safe synthetic labels, commands or tool actions, timestamps, observed semantic outcomes, pass/fail result per claim, cleanup result, and limitations.
- Redacted screenshots or transcripts only when they add reviewable semantic evidence; never retain opaque references, store keys, cookies, credentials, tokens, raw records, or telemetry payloads.

## Operational observability verification

No operational observability claim is established by PREETS-SESSION-006 or PREETS-SESSION-008, and issue #153 adds none. Temporary log or trace inspection may help diagnose a failed verification run but cannot become durable telemetry-output evidence or satisfy the session claims by itself.

## Environment and data controls

- Use isolated synthetic tenant and user labels; do not use production identities or partner/client names.
- Keep credentials, provider tokens, cookie values, opaque session references, store keys, and raw session records out of retained artifacts and logs.
- Use the delivered real shared-state adapter for integration, race, and outage evidence; deterministic doubles remain appropriate only for controlled policy and time examples.
- Own and document cleanup of synthetic sessions, configuration fixtures, failure injection, consumer processes, and local services.
- Keep outage injection local and reversible. Do not use production infrastructure or broaden the test to cloud/ingress behavior.

## Evidence retention and reporting

Execution results must be recorded separately from this planned document and attributed to an exact revision. The record must state the environment, inputs and actions, semantic observations, pass/fail result for each claim, cleanup, and known limitations. Existing child-issue reports or test runs may be referenced only after their revision, boundary, assertions, and retained results are reviewed against these claims; closed issues and passing counts alone are insufficient.

## Limitations and incomplete claims

- This feature does not complete PREETS-SESSION-006 AC2–3 at the independently running authenticated-application and protected-access boundary; #154 owns that evidence.
- This feature does not complete PREETS-SESSION-008 protected HTTP enforcement or browser-timer independence across the application; #154–#157 own the composed evidence.
- Browser activity detection, cross-tab synchronization, warning presentation, and recovery are not established by classified service inputs or returned warning-policy data.
- Real provider authentication, freshness validation, Microsoft compatibility, and universal OIDC-provider compatibility are not established by prepared identity or session fixtures; affected work remains with #158 and its unresolved B6 decisions.
- Real-store examples and finite race/outage runs do not prove every possible interleaving, infrastructure failure, or deployment topology.
- The current parent review found substantial component evidence but fragmented closure records and explicit child limitations. No prior run is treated as satisfying this plan until its exact revision, boundary, result, and limitations are attributable.

## Readiness review

- [x] Every feature claim maps to an authoritative source.
- [x] Successful, failure, rejection, security/privacy, accessibility, and operational outcomes are covered where applicable.
- [x] The manual feature procedure is non-empty, executable by an agent, and adds a distinct observation.
- [x] Environmental prerequisites, evidence retention, cleanup, and limitations are explicit.
- [x] Planned evidence is not described as executed or verified.
- [x] No implementation architecture is required to understand the feature claims.
