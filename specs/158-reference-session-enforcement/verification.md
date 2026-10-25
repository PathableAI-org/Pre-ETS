# Feature Verification Plan: Enforce Sessions in Reference Application Paths

**Feature specification**: [spec.md](spec.md)

**Delivery issue**: [#219 — Enforce sessions across application entry points](https://github.com/PathableAI-org/Pre-ETS/issues/219)

**Status**: Planned — no execution evidence is recorded by this document

## Authority and scope

This plan covers only issue #219's bounded S2-E reference enforcement increment. Current accepted authority was read
from `origin/main` at `ace420ae38a7d83f5751e43b818f801c54b587d7`: PREETS-SESSION-001 AC1–3,
PREETS-SESSION-003 AC3, PREETS-SESSION-004 AC1–2, PREETS-SESSION-005 AC1–4, and PREETS-SESSION-006 AC2 with the
qualifications recorded in [spec.md](spec.md). The originating approved S2 baseline is revision
`e206d165f0f30999220922f57a3f92549c15f4cc`; the current issue is the maintainer-authorized S2-E subdivision.

Evidence here may establish the reusable enforcement outcomes and one bounded page/action composition. It may not
claim comprehensive default protection, final forbidden/recovery presentation, completed browser-history or provider-
freshness behavior, renewal/expiration races, invalidation/outage guarantees, or requirement verification. The
unresolved B6/#158 authentication-time comparison, clock tolerance, and provider-support decisions gate successful
real-login evidence; incomplete execution must be reported rather than replaced with fabricated freshness.

## Claims and traceability

| ID    | Claim to establish                                                                                                                     | Authoritative source                                                                                                    | Meaningful violation                                                                                                                                | Required observation                                                                                                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-001 | The reference enforcement boundary resolves the request tenant independently and admits a usable session only when its tenant matches. | PREETS-SESSION-005 AC1, AC3, AC4; issue #219 scope                                                                      | The session tenant bypasses request-tenant resolution, changes the selected tenant, or matching state cannot be consumed.                           | Matching state is admitted after independent resolution; the observed tenant remains the request tenant.                                                                     |
| V-002 | A session established through instance A is consumed through independently running instance B with the same user and tenant identity.  | PREETS-SESSION-003 AC3; PREETS-SESSION-006 AC2; issue #219 completion evidence                                          | Instance B requires affinity to A, cannot read the session, or reports different identity/tenant state.                                             | B returns the same established user/tenant and reference protected result without a request to A.                                                                            |
| V-003 | A tenant mismatch is denied with actual HTTP 403 semantics and no protected content or effect.                                         | PREETS-SESSION-005 AC2–4; issue #219 mismatch evidence                                                                  | A cross-tenant session is accepted, produces a non-403 success/fallback, or executes the protected operation.                                       | The reference boundary returns 403, presents a bounded forbidden indication, preserves the request tenant, and records zero protected effects.                               |
| V-004 | A reference protected page with no usable session withholds protected content and begins the resolved tenant's OIDC flow.              | PREETS-SESSION-001 AC1; PREETS-SESSION-004 AC1–2; issue #219 reference support                                          | Protected content is exposed, another tenant's provider is selected, or automatic login is skipped after valid tenant resolution.                   | No protected content precedes a tenant-specific OIDC initiation from the reference page.                                                                                     |
| V-005 | A reference protected operation with no usable or forged session performs no protected effect and returns no protected result.         | PREETS-SESSION-001 AC1; issue #219 absent/forged-context evidence                                                       | Missing, malformed, forged, expired, or invalidated state executes the operation or returns its protected result.                                   | The denial is observable and the independent safe effect observation remains unchanged.                                                                                      |
| V-006 | Session service/store failure remains distinct from absence and fails closed without replacement login/session creation.               | Issue #219 handoff and failure scope; prerequisite #218 public outcomes                                                 | A store failure is treated as an ordinary missing session, starts silent replacement login, creates a session, or grants access.                    | The consumer observes service failure; no protected response, effect, replacement session, or successful-login outcome occurs.                                               |
| V-007 | Exercised public exceptions remain reachable without a session while separate tenant and configuration constraints remain effective.   | PREETS-SESSION-001 AC2; PREETS-TENANT-003–006; PREETS-SECURITY-001; PREETS-INFRA-001; issue #219 public-exception scope | The guard blocks a public resource, the diagnostic creates a session, tenant failures are rewritten, or a fallback tenant/configuration is exposed. | Public resources bypass only session enforcement; the diagnostic creates no session; applicable 404/500, no-store, content-safety, and ingress qualifications are preserved. |
| V-008 | The reference browser consumer is keyboard-operable and exposes a perceivable success or denial outcome with visible focus.            | Project constitution Principle IV; issue #219 browser-consumer scope                                                    | The operation is unreachable or unusable by keyboard, focus is hidden, or its outcome cannot be perceived.                                          | Keyboard-only interaction reaches and invokes the control with visible focus and yields a perceivable result or denial.                                                      |
| V-009 | The handoff identifies every delivered reference consumer/fixture and every known unexercised application entry-point category.        | Issue #219 handoff requirement and ownership boundaries                                                                 | Reviewers could mistake the bounded reference for comprehensive enforcement or cannot reuse its evidence fixtures.                                  | The handoff accounts for delivered paths/outcomes/fixtures and explicitly lists remaining pages, handlers, actions, direct/new resources, and downstream claims.             |

## Automated behavioral evidence

| Claim IDs                  | Evidence boundary                                                                                    | Planned scenario or property                                                                                                                                                                                                                                                                     | Why this boundary is meaningful                                                                                                                                | Known limits                                                                                                                                                                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-001, V-003, V-005, V-006 | Public enforcement capability with controlled request-tenant and session outcomes                    | Exercise matching, mismatched, absent, malformed/forged, no-record, expired/invalidated, and service-failure outcomes. Assert admission only for matching usable state; 403 for mismatch; and no identity/effect for every denial.                                                               | Establishes the reusable consumer contract and distinguishes security-relevant outcomes before framework composition.                                          | Does not prove framework status mapping, browser presentation, real store behavior, or application-wide coverage.                                                                                                                                                               |
| V-001, V-003, V-004, V-005 | Running reference application HTTP and protected-operation boundary                                  | Directly request the reference page/action with valid matching state, absent state, malformed/forged references, and cross-tenant state. Assert actual status/redirect behavior, protected response absence, and an independent observation that the safe synthetic effect did or did not occur. | Exercises the framework boundary where protected content, HTTP semantics, cookies, redirects, and operation dispatch can diverge from the capability contract. | Covers only the delivered reference page/action, not every page, route handler, Server Action, or new resource.                                                                                                                                                                 |
| V-002                      | Two independently running reference application processes sharing the real distributed session store | Establish the session through A; send the same browser session to B on the same resolved tenant; observe the same user/tenant and protected outcome. Repeat with requests directed to B without returning to A.                                                                                  | Distinguishes true application-instance composition from same-process or adapter-only evidence.                                                                | Successful real-login execution remains incomplete until B6 freshness confirmation is approved and functioning; finite two-instance evidence does not prove every deployment topology.                                                                                          |
| V-003, V-007               | Multi-tenant application HTTP matrix                                                                 | Pair a session established for tenant A with an independently resolved tenant B request; separately exercise invalid host, missing/unreadable/malformed selected configuration, and public reference routes.                                                                                     | Detects tenant substitution and distinguishes session mismatch from tenant-resolution/configuration failures.                                                  | Does not establish every external ingress or configuration producer. Production `/_test/*` ingress blocking retains separate infrastructure evidence.                                                                                                                           |
| V-006                      | Running reference application with a controlled real-store outage after startup                      | Make the store unavailable for the bounded read, observe the reference response/action and zero protected effects, restore the store, and confirm readiness before later cases.                                                                                                                  | A real dependency failure addresses uncertainty that a canned missing record cannot.                                                                           | Does not establish #221's complete outage, recovery, or race guarantees.                                                                                                                                                                                                        |
| V-007                      | Requirements-backed application BDD with feature-level `@partial` and current-main requirement tags  | Cover the exercised PREETS-SESSION-001 public/protected boundary, PREETS-SESSION-004 missing-session reference-page flow, PREETS-SESSION-005 matching/mismatch outcomes, PREETS-SESSION-003 protected identity use, and PREETS-SESSION-006 cross-instance recognition.                           | Supplies stakeholder-readable evidence through the running application for promises already accepted on current `origin/main`.                                 | Scenario assertions must stay within the tagged criteria and bounded reference slice. Issue-only service-failure vocabulary, handoff completeness, and comprehensive/new-resource coverage are not requirements-backed BDD claims. Dry-run discovery is not execution evidence. |
| V-008                      | Browser interaction against the composed reference consumer                                          | Use keyboard-only navigation to reach and invoke the protected operation; observe visible focus and the perceivable protected result or denial.                                                                                                                                                  | Exercises the actual composed browser experience instead of inferring accessibility from markup or component choice.                                           | Does not establish final forbidden/recovery accessibility or broader application accessibility. Assistive-technology recovery remains downstream where required.                                                                                                                |
| V-009                      | Artifact and delivered-route inventory review                                                        | Compare the handoff against the changed reference routes/actions, fixtures, and application entry-point inventory; require an explicit disposition for each delivered and remaining category.                                                                                                    | Prevents a bounded reference demonstration from being reported as comprehensive coverage.                                                                      | An inventory is not behavioral evidence that the listed paths work. #154 must perform and verify the comprehensive integration.                                                                                                                                                 |

## Agent-executable manual feature verification _(mandatory)_

### Purpose

Directly observe one authenticated session crossing from application instance A to independently running instance B,
then use the composed browser consumer by keyboard and inspect a cross-tenant denial. This adds live instance-routing,
cookie transport, rendered identity/result, and keyboard/focus observations that are not established by public-capability
or single-process automated scenarios.

### Prerequisites

- A clean checkout at the exact revision under assessment and the delivered reference protected page/action paths.
- The repository's pinned distributed session store and local OIDC provider running with bounded readiness checks.
- Two independently running frontend/reference application processes, A and B, using the same synthetic tenant files,
  same owned session/transaction key prefixes, and different local ports or another documented routing arrangement.
- Two distinguishable synthetic tenants and a synthetic provider user; no production credentials, PHI, or client data.
- Browser/Playwright control plus HTTP inspection that can direct a request to A or B and can intentionally send a
  tenant-A session reference to the tenant-B application boundary for mismatch evidence.
- An approved, functioning B6 freshness confirmation for the successful login case. If unavailable, record V-002's
  authenticated journey as incomplete; do not manufacture confirmation or treat signed `auth_time` presence as enough.
- A safe, independently observable synthetic effect for the reference protected operation.

### Procedure

1. Record the revision, date/time, application and service versions, synthetic tenant aliases, instance endpoints,
   owned key prefixes, and B6 freshness policy in force. Confirm both instances and external services are ready.
2. In a fresh browser context, begin the tenant-A login through instance A and complete the real local-provider flow.
   Continue the authenticated steps only if freshness is confirmed under the approved policy; otherwise record the
   refusal/no-session outcome and mark V-002 incomplete.
3. Without authenticating again, direct the same browser session to the delivered reference protected page through
   instance B for tenant A. Record the rendered user/tenant identity and confirm it matches the authenticated session.
4. Using keyboard-only navigation, move focus to the reference protected operation, confirm visible focus, invoke it,
   and record the perceivable result. Independently inspect the synthetic effect and confirm exactly one effect.
5. In a separate HTTP request, intentionally pair the tenant-A session reference with a tenant-B resolved request to
   instance B. Record actual HTTP 403, the bounded forbidden indication, absence of tenant-A protected content, and no
   change to the synthetic effect.
6. In a fresh browser context with no session, request the tenant-A reference protected page through instance B.
   Record that protected content is absent and that tenant-A OIDC begins automatically. Stop before completing a
   second login.
7. Exercise one existing public diagnostic in the bounded reference set without a session. Record that it remains
   reachable, returns the expected non-secret/no-store response, and does not create a session. Separately exercise one
   invalid-host or selected-configuration failure and record its approved 404 or 500 class with no fallback tenant.
8. Remove only scenario-owned session and transaction keys, close browser contexts, stop processes started by the
   procedure, and record cleanup completion. Never flush a shared store.

### Expected observations

- Instance B uses the same user and tenant established through A without affinity and exposes the reference protected
  result only for the independently resolved matching tenant (V-001, V-002).
- The keyboard-only operation has visible focus, yields a perceivable result, and produces exactly one safe synthetic
  effect (V-008).
- Cross-tenant use returns actual 403, shows the bounded forbidden indication, reveals no protected content, and
  produces no additional effect (V-003).
- No-session page entry reveals no protected content and starts the resolved tenant's OIDC flow (V-004).
- The public diagnostic remains unauthenticated without creating a session, while tenant failures retain their
  approved class and no fallback (V-007).

### Evidence to retain

- Exact revision, date/time, environment/service versions, safe synthetic aliases/user label, instance endpoints,
  approved freshness policy reference, bounded actions, HTTP statuses/redirect destinations, rendered identity and
  outcome descriptions, cookie-transport observation without the cookie value, keyboard/focus observations, synthetic
  effect counts, cleanup result, claim-level pass/fail disposition, and explicit limitations.

## Operational observability verification

No operational observability claim in this slice. PREETS-SESSION-001, PREETS-SESSION-003, PREETS-SESSION-004,
PREETS-SESSION-005, and PREETS-SESSION-006 introduce no additional operational monitoring obligation for this feature.
Application HTTP, browser, session-store, and independent effect observations remain the planned evidence; an empty log,
trace, metric, Loki result, or Prometheus result is not evidence of correct enforcement.

If implementation work uses temporary log or trace probes to diagnose composition, remove them before completion and
record only safe, revision-attributable observations and limitations. Do not retain durable tests of telemetry output
or exporter behavior.

## Environment and data controls

- Use only repository-owned synthetic tenant/provider fixtures, synthetic users, and a safe synthetic protected
  effect. Do not use PHI, production credentials, real client records, or identifying partner names.
- Use owned session and OIDC transaction key prefixes for every execution. Remove only owned keys; never flush a
  shared store.
- Do not retain cookie values, provider tokens, callback parameters, credentials, session references, or store record
  contents in screenshots, logs, transcripts, or committed artifacts.
- Keep tenant-A and tenant-B fixtures distinguishable so substitution is observable. Cross-tenant requests must use
  controlled synthetic hosts and data.
- A real-store failure exercise must restore the dependency and re-establish readiness before later checks. Record
  skipped cases if recovery cannot be established.
- Local-provider evidence does not establish Microsoft, broker-chain, universal provider compatibility, or the still-
  open B6 comparison/tolerance policy.
- Stop processes and close browser contexts started by the procedure. Preserve only bounded execution summaries, not
  raw temporary probes or generated output.

## Evidence retention and reporting

Execution results must be recorded separately from this plan and identify the exact revision, environment and service
versions, safe inputs/actions, observed outcomes by claim ID, pass/fail result, cleanup, and limitations. Retained
evidence may name scenarios and safe status/result observations but must not include credentials, tokens, cookie
values, session references, PHI, protected content, or identifying partner data. Issue closure, PR merge, generated
scenarios, dry-run discovery, and passing static checks are not requirement verification.

The feature handoff must retain the exercised reference paths, expected HTTP/denial behavior, reusable real-provider,
distributed-store, protected-action, and browser fixtures, plus an explicit list of unexercised pages, route handlers,
Server Actions, direct/new-resource paths, public exceptions, and downstream lifecycle/recovery claims.

## Limitations and incomplete claims

- The feature does not establish comprehensive default protection under PREETS-SESSION-001 or application-wide
  tenant/session binding under PREETS-SESSION-005. #154 owns the complete inventory and integration.
- The feature establishes PREETS-SESSION-003 AC3 and PREETS-SESSION-006 AC2 only through the bounded reference
  application path. It does not establish every deployment topology or later renewal/expiration/invalidation behavior.
- Final forbidden experience, expired/missing-session Server Action HTTP 401 and recovery, running-tab modal behavior,
  refresh/back-forward history behavior, and complete freshness journeys remain #154/#157/#158.
- Authentication-time comparison, clock tolerance, provider/broker support, and unsupported-provider handling remain
  open B6/#158 gates. Until an approved policy functions, successful real-login cross-instance evidence is incomplete.
- Renewal/current-policy adoption and expiration races remain #220; invalidation races and complete outage behavior
  remain #221. A controlled store-failure observation here does not establish those claims.
- Public exception evidence is limited to the exercised reference set. Production ingress blocking for `/_test/*`
  requires separate infrastructure evidence and is not established by direct application access.
- Local OIDC provider execution does not establish Microsoft or universal provider compatibility.
- This plan records planned evidence only. No HTTP, browser, provider, store, accessibility, or cleanup procedure was
  executed during specification.

## Readiness review

- [x] Every feature claim maps to an authoritative source.
- [x] Successful, failure, rejection, security/privacy, accessibility, and operational outcomes are covered where applicable.
- [x] The manual feature procedure is non-empty, executable by an agent, and adds a distinct observation.
- [x] Environmental prerequisites, evidence retention, cleanup, and limitations are explicit.
- [x] Planned evidence is not described as executed or verified.
- [x] No implementation architecture is required to understand the feature claims.
