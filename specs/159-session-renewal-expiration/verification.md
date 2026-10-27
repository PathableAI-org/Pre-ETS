# Feature Verification Plan: Renew and Expire Authoritative Sessions

**Feature specification**: [spec.md](spec.md)

**Delivery issue**: [#220](https://github.com/PathableAI-org/Pre-ETS/issues/220)

**Status**: Planned — no execution evidence is recorded by this document

## Authority and scope

This plan covers PREETS-SESSION-008 AC3–5, the service/store portion of PREETS-SESSION-006 AC3, the server
classification/enforcement portion of PREETS-SESSION-009 AC1–4, and the server policy/renewal portion of
PREETS-SESSION-011 AC2–4. It also covers issue #220's narrower completion obligation to exercise invalid session
policy through the real tenant consumer without claiming PREETS-TENANT-004's complete HTTP failure mapping. Sources
are the accepted files at current `origin/main` revision
`c1d87a22a55cd5190bc702a6a3c33cfed2ca23ef`, issue #220, and the approved S2 baseline at
`e206d165f0f30999220922f57a3f92549c15f4cc`.

Evidence is limited to authoritative session initialization/read/renewal/expiration, real distributed-store
consistency, and actual tenant-policy consumption. It does not claim comprehensive application protection, browser
activity production, warning accessibility or coordination, recovery, backend persistence, or freshness/provider
behavior. Issue #219 reference fixtures are optional bounded evidence.

## Claims and traceability

| ID    | Claim to establish                                                                                                                                            | Authoritative source                                                                   | Meaningful violation                                                                                                     | Required observation                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| V-001 | Initialization and usable reads expose one authoritative deadline and effective warning policy with the authenticated user and tenant.                        | #220 in-scope contract and #218 handoff; PREETS-SESSION-011 AC2 after a refresh        | A consumer receives usable identity without the applicable deadline/policy or sees inconsistent state across clients.    | Independent consumers observe the same complete usable-session state before a lifecycle change.                           |
| V-002 | Every claimed qualifying activity category received strictly before the current deadline, including Continue or Keep working, renews the session.             | PREETS-SESSION-008 AC3; PREETS-SESSION-009 AC1; PREETS-SESSION-011 AC3                 | A claimed timely deliberate activity category leaves the session expired or renews without a new authoritative deadline. | Each presented positive category renews and exposes a later deadline derived from effective policy.                       |
| V-003 | A qualifying refresh adopts the then-effective timeout and warning policy; unrefreshed sessions retain established state and may adopt changes independently. | PREETS-SESSION-008 AC3; PREETS-SESSION-011 AC2                                         | Policy changes mutate unrefreshed sessions, fail to apply on refresh, or force simultaneous adoption.                    | Refreshed and unrefreshed sessions expose the expected different policy/deadline states until their respective refreshes. |
| V-004 | Automatic/background traffic, raw movement, and programmatic focus alone never renew.                                                                         | PREETS-SESSION-008 AC5; PREETS-SESSION-009 AC1–3                                       | An excluded activity changes the authoritative deadline.                                                                 | Deadline before and after each excluded category is identical.                                                            |
| V-005 | At or after the deadline, no activity, Continue action, or later timeout increase can revive usable identity.                                                 | PREETS-SESSION-008 AC4; PREETS-SESSION-009 AC4; PREETS-SESSION-011 AC4                 | Equality, late delivery, or a longer current policy restores expired state.                                              | Every at/after-deadline case returns no usable session and remains unusable on later reads.                               |
| V-006 | Independent clients honor renewal/expiration consistently under races and do not require affinity.                                                            | PREETS-SESSION-006 AC3; PREETS-SESSION-008 Verification Plan; #220 completion evidence | Clients disagree on the ordered winner, or a stale operation makes expired state usable after expiration has won.        | Clients converge on renewed usable state when valid pre-deadline renewal wins, otherwise on non-usable expired state.     |
| V-007 | Usable session, no usable session, and storage failure remain distinguishable for the applicable operations.                                                  | #220 in-scope and completion contract; #218 handoff                                    | Missing/expired state is reported as a dependency failure, or a failure yields identity/no-session success.              | Each injected condition produces its specified public outcome and no protected identity on failure.                       |
| V-008 | Missing and expired state need no retained distinction solely for renewal/expiration.                                                                         | #220 in-scope contract                                                                 | Correct behavior depends on an old record or tombstone that is absent after expiration.                                  | Removed/unknown and expired state both remain non-usable without affecting freshness policy claims.                       |
| V-009 | Invalid explicit timeout or warning values are rejected through real tenant consumption and supply no effective session policy.                               | #220 completion evidence; value domains are prerequisite context supplied by #218      | An invalid selected policy reaches session initialization or renewal as an effective policy.                             | Real tenant consumption rejects each invalid domain case before a session policy can be used.                             |
| V-010 | Authoritative expiration does not depend on browser timers.                                                                                                   | PREETS-SESSION-008 AC4; #220 in-scope contract                                         | A consumer can obtain usable identity after the deadline because no browser expiration ran.                              | Server-side/session-consumer evaluation alone returns no usable session after the deadline.                               |

## Automated behavioral evidence

| Claim IDs                                                     | Evidence boundary                                                   | Planned scenario or property                                                                                                                                                                                                                                                                                                                                                                                                    | Why this boundary is meaningful                                                                                      | Known limits                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| V-001, V-002, V-003, V-004, V-005, V-007, V-008, V-010        | Public session capability with deterministic time and policy inputs | Exercise initialization/read; each presented positive category (deliberate page fetch, form submission, activation, keyboard, text entry, touch, user-driven meaningful-input focus, and pre-deadline Continue/Keep working); each excluded category; before/equal/after; policy-change; missing/expired; and controlled dependency-failure matrices. Use generated times around the deadline where they add boundary evidence. | Establishes the contract seen by consumers without testing private transformations.                                  | A deterministic store does not establish real distributed-store ordering or application HTTP protection.         |
| V-002, V-003, V-005, V-006, V-008, V-010                      | Real distributed session adapter with independent clients           | Establish sessions through one client; read/renew through another; control operations around the deadline; race pre-deadline renewal against expiration with bounded synchronization; and remove owned state.                                                                                                                                                                                                                   | Addresses shared-state atomicity and expiration semantics that an in-memory substitute cannot.                       | Finite race schedules do not prove every timing or deployment topology; real-store outage/recovery remains #221. |
| V-003, V-009                                                  | Actual tenant-configuration consumer                                | Exercise current-policy changes and invalid timeout/warning domains using distinguishable synthetic tenants.                                                                                                                                                                                                                                                                                                                    | Establishes that renewal policy comes from the selected real consumer and rejects invalid policy before session use. | Does not reverify omitted defaults, every tenant-selection failure, or PREETS-TENANT-004's HTTP mapping.         |
| V-001–V-010, where the bounded reference fixture is available | Optional issue #219 reference consumer extension                    | Reuse only the delivered bounded fixture to observe returned deadline/policy and non-usable/failure outcomes; record every unexercised application path.                                                                                                                                                                                                                                                                        | Adds limited composition evidence without making #154 a prerequisite.                                                | Does not establish comprehensive HTTP enforcement, browser activity, or protected application coverage.          |

Requirements-backed BDD is not planned as completion evidence for this service/store-only slice. The repository's
requirements BDD boundary is the running application, while comprehensive request wiring and browser production are
owned by #154–#156. Downstream BDD may reuse these fixtures with current-`origin/main` requirement tags and
feature-level `@partial`; a dry run would establish discovery only.

## Agent-executable manual feature verification _(mandatory)_

### Purpose

Directly observe two independently instantiated session clients using the real distributed store while policy changes
and the authoritative deadline advances. This adds live dependency/process independence, actual persisted expiry,
and cleanup observations beyond deterministic public-capability and bounded automated race cases.

### Prerequisites

- A clean checkout at the exact revision under assessment with the delivered public session capability and real-store
  integration available.
- The repository's pinned real distributed session store running with a bounded readiness check.
- Two independently instantiated clients or temporary agent probes, A and B, configured with the same owned synthetic
  key prefix and distinguishable synthetic tenant/session identifiers.
- Valid synthetic tenant configurations for an initial policy and a changed policy, plus one schema-invalid session
  policy; no production credentials, PHI, client data, cookie values, or provider tokens.
- A controllable clock or bounded test-time control supported by the delivered feature, and a way to inspect only the
  public session outcomes and safe deadline/policy values.

### Procedure

1. Record the revision, date/time, store version, client/probe arrangement, owned key prefix, synthetic tenant aliases,
   initial policy, changed policy, and clock-control method. Confirm the store and both clients are ready.
2. Through client A, initialize a synthetic authenticated session under the initial policy. Through client B, read it
   and record matching safe user/tenant labels, authoritative deadline, effective warning policy, and usable outcome.
3. Change the selected synthetic tenant policy without refreshing the session. Read through both clients and confirm
   that the established deadline and warning policy remain unchanged.
4. Advance time to strictly before the established deadline and present Continue or Keep working through client B.
   Record the renewed deadline and changed effective warning policy; read through client A and confirm it observes the
   same renewed state.
5. Establish a second independent session that retains the initial policy. Confirm the first and second sessions expose
   different accepted policies until the second receives its own qualifying refresh.
6. For the first session, record its current deadline, then present one excluded background activity and confirm the
   deadline is unchanged. Advance to exactly the deadline and present qualifying activity, then increase the tenant
   timeout and try again after the deadline. Confirm every attempt yields no usable session through both clients.
7. Consume the schema-invalid synthetic tenant policy through the actual tenant boundary and record rejection before
   an effective session policy is supplied.
8. Remove only scenario-owned session and configuration fixtures, stop probes/processes started by this procedure, and
   confirm cleanup. Never flush or broadly clear a shared store.

### Expected observations

- Both clients initially observe the same complete usable state and, after renewal, the same new authoritative
  deadline and changed effective warning policy (V-001, V-002, V-003, V-006).
- The unrefreshed independent session retains its earlier policy until its own qualifying refresh (V-003).
- Excluded traffic does not change the deadline; equality and later attempts remain non-usable even after a timeout
  increase and without browser timers (V-004, V-005, V-010).
- Invalid selected policy is rejected before it can supply an effective session policy (V-009).
- Cleanup removes only owned fixtures and leaves the shared store healthy.

### Evidence to retain

- Exact revision, date/time, store version, safe synthetic identifiers, policy inputs, deadline/policy observations,
  public outcome categories, client/probe arrangement, claim-level pass/fail disposition, cleanup result, and explicit
  limitations. Do not retain raw store records, credentials, tokens, cookie/session references, PHI, or identifying
  partner data.

## Operational observability verification

No operational observability claim in this slice. The applicable requirement Observability sections introduce no
additional operational monitoring obligation. Public capability, real-store, tenant-consumer, and manual outcome
observations are the planned evidence; an empty log, trace, metric, Loki result, or Prometheus result is not evidence
of renewal or expiration correctness.

If temporary logs or traces are used to diagnose a race, remove the probes before completion and retain only safe,
revision-attributable observations and limitations. Do not add durable tests of log output, spans, telemetry payloads,
or exporter behavior.

## Environment and data controls

- Use only repository-owned synthetic tenant configurations, users, sessions, policies, and owned key prefixes.
- Do not use or retain PHI, production credentials, real client records, tokens, cookie values, session references, raw
  store records, or identifying partner names.
- Make tenant configurations distinguishable so fallback or cross-tenant substitution is observable.
- Bound readiness, race synchronization, and clock advancement; report skipped cases when the required control cannot
  be established.
- Remove only scenario-owned records and temporary probes; never flush or broadly clear a shared store.
- Stop processes and close resources started for the procedure.

## Evidence retention and reporting

Execution results must be recorded separately from this plan with the exact revision, environment and dependency
versions, safe inputs/actions, observed public outcomes by claim ID, pass/fail result, cleanup, and limitations.
Passing static checks, generated tests, issue closure, or pull-request merge are not feature execution evidence.

Retained evidence may name scenarios and safe policy/deadline comparisons, but must not include credentials, tokens,
cookie/session references, raw records, PHI, protected content, or identifying partner data. Temporary probe source and
raw transcripts are not committed.

## Limitations and incomplete claims

- Comprehensive page, route-handler, Server Action, direct/new-resource, and protected HTTP enforcement remain #154.
- Browser activity generation, communication delay, cross-tab synchronization, warning accessibility/interaction,
  Continue presentation, logout, and recovery remain #155–#158.
- A bounded #219 fixture, if used, does not establish complete application coverage.
- Backend/domain persistence, backend API expiration-response policy, absolute maximum lifetime, cloud/ingress,
  heartbeat, connection-loss behavior, and CI cadence are not established.
- Real-store outage, recovery, and their race behavior remain #221; this slice preserves only the public
  storage-failure outcome distinction.
- Fresh-authentication comparison, clock tolerance, provider/broker compatibility, and unsupported-provider handling
  remain B6 work and do not limit ordinary idle service/store evidence here.
- Finite generated examples and controlled races support only the exercised inputs and schedules; they are not a proof
  of every possible timing or deployment topology.
- This document records planned evidence only. No store, application, browser, configuration, accessibility, or
  operational procedure was executed during specification.

## Readiness review

- [x] Every feature claim maps to an authoritative source.
- [x] Successful, failure, rejection, security/privacy, accessibility, and operational outcomes are covered where applicable.
- [x] The manual feature procedure is non-empty, executable by an agent, and adds a distinct observation.
- [x] Environmental prerequisites, evidence retention, cleanup, and limitations are explicit.
- [x] Planned evidence is not described as executed or verified.
- [x] No implementation architecture is required to understand the feature claims.
