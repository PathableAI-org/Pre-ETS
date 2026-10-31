# Feature Verification Plan: Complete Session Invalidation and Failure Behavior

**Feature specification**: [spec.md](spec.md)

**Delivery issue**: [#221](https://github.com/PathableAI-org/Pre-ETS/issues/221)

**Status**: Planned — no execution evidence is recorded by this document

## Authority and scope

This plan covers the invalidation/consistency support assigned from PREETS-SESSION-006 AC1–3, the no-revival race
support assigned from PREETS-SESSION-008 AC4, and the old-session denial support assigned from PREETS-SESSION-013
AC2. Sources are the accepted requirement files at current `origin/main` revision
`c62c521152c7c8e3869a1575c4c1b3b07c481e8b`, issue #221, the approved S2 baseline at
`e206d165f0f30999220922f57a3f92549c15f4cc`, and S2-G at current `origin/main`.

Evidence is limited to explicit invalidation, independent session consumers, lifecycle races, public outcome
distinctions, and controlled real-store failure. It does not claim comprehensive application protection, browser
logout coordination, recovery presentation, fresh-provider behavior, backend persistence, or a general revocation
policy. Issue #219's bounded reference consumer adds limited manual composed evidence without replacing #154's
ownership.

## Claims and traceability

| ID    | Claim to establish                                                                                                              | Authoritative source                                 | Meaningful violation                                                                                           | Required observation                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| V-001 | Successful explicit invalidation makes the old session reference unusable to every independent consumer.                        | PREETS-SESSION-006 AC1–3; #221 in-scope contract     | Another consumer reads usable authenticated identity after invalidation completes.                             | Reads through each independent consumer return no usable session after invalidation.                           |
| V-002 | An invalidated old session cannot be renewed, reused, or silently replaced by a later lifecycle operation.                      | PREETS-SESSION-013 AC2; #221 completion evidence     | Renewal of the old reference returns identity or creates a replacement authenticated session.                  | Later renewal and reuse attempts remain non-usable and no replacement session is observed.                     |
| V-003 | Invalidation remains final when it races with renewal, including when a stale consumer previously observed usable state.        | PREETS-SESSION-006 AC3; PREETS-SESSION-013 AC2; #221 | A racing or stale renewal leaves usable state after invalidation completes.                                    | Every completed race ends with all later consumers observing no usable session.                                |
| V-004 | Authoritative expiration remains final when renewal and other lifecycle activity race at the deadline.                          | PREETS-SESSION-008 AC4; #221 no-revival race scope   | A session at or after its deadline becomes usable again.                                                       | At/after-deadline races and all later reads return no usable identity.                                         |
| V-005 | Usable session, no usable session, and service failure are distinct, and authoritative session details appear only when usable. | #221 in-scope and handoff contract                   | Failure is mistaken for absence or success, or identity/policy/deadline is supplied with a non-usable outcome. | Each condition produces its distinct public outcome; only usable state includes authoritative session details. |
| V-006 | Real shared-store failure during read, renewal, or invalidation fails explicitly without authorization success.                 | #221 in-scope and completion evidence                | An unavailable operation returns usable identity, authorization success, or ordinary no-session.               | Each controlled outage returns service failure and no usable or successful protected outcome.                  |
| V-007 | A failed lifecycle operation does not claim completion or silently create or replace an authenticated session.                  | #221 in-scope failure contract                       | An indeterminate invalidation/renewal is reported as successful or creates new authenticated state.            | Failure remains explicit; no successful lifecycle result or new session is observed.                           |
| V-008 | Correct denial does not require retained cause information or a distinct missing/expired/invalidated result.                    | #221 scope boundary; PREETS-SESSION-013 AC2          | Old identity becomes usable because no tombstone or cause record exists.                                       | Missing, expired, invalidated, and removed-state cases remain non-usable without a cause-retention dependency. |

## Automated behavioral evidence

| Claim IDs                         | Evidence boundary                                            | Planned scenario or property                                                                                                                                                                                              | Why this boundary is meaningful                                                                  | Known limits                                                                                                     |
| --------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| V-001, V-002, V-005, V-007, V-008 | Public session capability with controlled dependencies       | Exercise successful invalidation; reads and renewals before and after invalidation; stale prior observations; missing/expired/invalidated/removed states; and controlled read/change failures.                            | Establishes the complete outcome contract seen by a consumer without asserting private steps.    | Controlled dependencies do not establish real shared-store ordering or real outage behavior.                     |
| V-001–V-004, V-008                | Real shared session store with independent clients           | Establish through client A; read and invalidate through client B; race renewal against invalidation and expiration with bounded synchronization; then read and renew through both clients after each operation ordering.  | Addresses cross-client visibility, atomic lifecycle ordering, and revival risks in real storage. | Finite schedules do not prove every possible timing, load pattern, topology, or deployment.                      |
| V-005, V-006, V-007               | Real shared-store outage through the public session boundary | Make a dedicated real store unreachable before and during read, renewal, and invalidation; distinguish failure from no usable session and success; restore access only for owned cleanup and authoritative re-evaluation. | Establishes the actual adapter/service failure contract rather than a simulated failure alone.   | A local controlled outage does not establish every network partition, managed-service failure, or recovery mode. |

Requirements-backed BDD is not planned as completion evidence for this service/store slice. The repository's BDD
boundary is the running application, while comprehensive request enforcement, browser logout coordination, recovery,
and provider freshness are owned by #154–#158. Downstream scenarios may reuse these outcomes only with accepted
current-`origin/main` requirement tags and feature-level `@partial`; a dry run would establish discovery only.

## Agent-executable manual feature verification _(mandatory)_

### Purpose

Directly inspect the delivered bounded reference consumer while real shared session state is invalidated and made
unavailable. This adds a composed consumer observation—success before invalidation, denial afterward, and explicit
failure during outage—without claiming the comprehensive application coverage owned by #154. This composed journey
is reserved for manual verification and is not duplicated in the automated evidence table.

### Prerequisites

- A clean checkout at the exact revision under assessment with the delivered public session capability, real-store
  integration, and issue #219 bounded reference consumer available.
- A dedicated repository-pinned shared session store isolated by project/port and an owned synthetic key prefix, with
  a bounded readiness check and permission to stop or isolate only that dedicated store.
- Two independently instantiated session clients or temporary probes, A and B, using the same isolated store and
  owned prefix.
- One synthetic tenant-bound identity and session established through the delivered public capability. Its owned
  synthetic reference and cookie value may exist transiently inside the clients, probes, and bounded consumer only;
  they must not be logged, published, or retained. Do not use production credentials, provider tokens, PHI, client
  data, or identifying partner information.
- The delivered bounded synchronization mechanism for lifecycle races, or an equivalent temporary agent probe that
  can pause and release owned renewal/invalidation operations without changing production code.

### Procedure

1. Record the revision, date/time, store version, client/probe arrangement, isolated endpoint and key prefix, safe
   synthetic tenant label, synchronization method, and bounded reference consumer entry point. Confirm readiness.
2. Through client A, establish one synthetic usable session. Through client B, read the same reference and invoke the
   bounded reference consumer. Record only the public usable outcome and safe comparisons showing that identity,
   tenant, deadline, and warning policy are present.
3. Arrange a controlled renewal through client B concurrently with invalidation through client A. Release both,
   await completion, then read and attempt renewal through both clients. Invoke the bounded reference consumer again
   and confirm that no operation obtains usable identity or a successful protected outcome.
4. Establish a separate owned synthetic session for the outage observation. Stop or network-isolate only the
   dedicated store, then attempt read, renewal, and invalidation through the public boundary and invoke the bounded
   reference consumer. Record explicit service-failure outcomes distinct from no usable session and success, with no
   identity, deadline, warning policy, authorization success, or replacement session.
5. Restore the dedicated store for cleanup. Re-evaluate each owned reference rather than assuming a failed
   invalidation completed; explicitly invalidate any remaining usable owned session, remove only owned fixtures,
   stop temporary probes/processes, and confirm cleanup without flushing a shared store.

### Expected observations

- Before invalidation, both independent clients and the bounded consumer observe the same usable session details
  (V-005).
- After the invalidation/renewal race completes, both clients return no usable session for read and renewal, and the
  bounded consumer yields no successful protected outcome (V-001, V-002, V-003).
- During the dedicated-store outage, read, renewal, invalidation, and the bounded consumer produce explicit failure
  rather than ordinary absence, usable identity, authorization success, or a replacement session (V-005, V-006,
  V-007).
- Cleanup re-evaluates authoritative state, removes only owned fixtures, and leaves the dedicated store healthy.

### Evidence to retain

- Exact revision, date/time, store version, safe synthetic labels, operation ordering, public outcome categories,
  safe deadline/policy presence or absence, bounded consumer result, claim-level pass/fail disposition, cleanup
  result, and explicit limitations. Do not retain raw records, credentials, provider tokens, cookie/session
  references, PHI, protected content, or identifying partner data.

## Operational observability verification

No operational observability claim in this slice. PREETS-SESSION-006, PREETS-SESSION-008, and PREETS-SESSION-013
introduce no additional operational monitoring obligation. Public capability, real-store, and manual bounded-consumer
outcomes are the planned evidence; an empty log, trace, metric, Loki result, or Prometheus result is not evidence of
invalidation or failure correctness.

Temporary logs or traces may diagnose a race or outage only when removed before completion. Retain safe,
revision-attributable outcome observations and limitations, not durable telemetry-output tests, probe source, raw
transcripts, credentials, references, or session data.

## Environment and data controls

- Use only repository-owned synthetic tenants, identities, sessions, and isolated key prefixes.
- Owned synthetic cookie/session references may be used transiently in memory by the clients, probes, and bounded
  consumer required by this procedure. Never log, publish, or retain their values.
- Do not use or retain PHI, production credentials, provider tokens, production cookie/session references, raw store
  records, protected content, or identifying partner names.
- Run destructive outage control only against a dedicated local store instance; never interrupt or flush a shared or
  non-test environment.
- Bound readiness, race synchronization, and outage duration. Report skipped or indeterminate cases when the required
  control cannot be established.
- Restore controlled dependencies, re-evaluate authoritative state, remove only owned fixtures, and stop all
  temporary probes/processes during cleanup.

## Evidence retention and reporting

Execution results must be recorded separately from this plan with the exact revision, environment and dependency
versions, safe inputs/actions, operation ordering, observed public outcomes by claim ID, pass/fail result, cleanup,
and limitations. Passing static checks, generated tests, issue closure, or pull-request merge are not feature
execution evidence.

Retained evidence may name scenarios and safe outcome categories but must not include credentials, provider tokens,
cookie/session references, raw records, PHI, protected content, or identifying partner data. Temporary probe source
and raw transcripts are not committed.

## Limitations and incomplete claims

- Comprehensive page, Route Handler, Server Action, direct/new-resource, and protected HTTP enforcement remain #154.
- Browser logout, activity, warning, and cross-tab coordination remain #155/#156; recovery presentation remains #157.
- Fresh-provider recovery, authentication-time comparison, clock tolerance, provider/broker compatibility, and
  unsupported-provider handling remain #158/B6.
- A bounded #219 reference observation does not establish application-wide access denial or browser behavior.
- Backend/domain persistence, backend API expiration-response policy, a new absolute lifetime, cloud/ingress,
  heartbeat, connection-loss behavior, CI cadence, user/account/provider-wide revocation, and cause-retention policy
  are not established.
- A controlled local outage does not establish every network partition, managed-store failure, or recovery pattern.
- Finite race schedules support only the exercised operation orderings and are not a proof of every possible timing or
  deployment topology.
- This document records planned evidence only. No store, application, browser, provider, accessibility, or
  operational procedure was executed during specification.

## Readiness review

- [x] Every feature claim maps to an authoritative source.
- [x] Successful, failure, rejection, security/privacy, accessibility, and operational outcomes are covered where applicable.
- [x] The manual feature procedure is non-empty, executable by an agent, and adds a distinct observation.
- [x] Environmental prerequisites, evidence retention, cleanup, and limitations are explicit.
- [x] Planned evidence is not described as executed or verified.
- [x] No implementation architecture is required to understand the feature claims.
