# Delivery plan: Authentication and session management

**Status:** draft
**Planning date:** 2026-10-05; revised 2026-10-09
**Source revision:** Accepted requirements and original plan at `6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e` (PR #114); current implementation and related plan inspected at `0dd1f59f79d7c2298db9d930a8ab346e76c4031e`.
**Approval:** Original decomposition approved by [PR #114](https://github.com/PathableAI-org/Pre-ETS/pull/114), merged at `6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e`. Revised proposal is draft pending renewed PR approval; that approval does not resolve B1–B6.

## Goal

Prepare a reviewable decomposition for protected tenant access, shared transient sessions, authoritative inactivity,
and accessible warning/expiration recovery across tabs and application instances.

## Requirements in scope

All 13 session requirements and their 52 criteria were accepted by explicit maintainer direction on
2026-10-05. B0 is resolved. The revised decomposition remains draft pending renewed maintainer approval;
B1–B6 retain the unresolved policy and design gates. Accepted tenant/security requirements constrain
this work rather than being newly claimed as delivered by this plan.

**Revision scope:** Preserve the accepted promises and original six outcomes. Clarify start prerequisites,
mergeable evidence increments and later integration ownership, and allocate tenant prerequisites to existing issues.
Prior approval remains historical authority for the original decomposition, not approval of these revisions.

| Accepted requirement                                                                                                                    | Selected ACs | Qualification                                           |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------- |
| [PREETS-SESSION-001 — Authentication required by default](../requirements/session-management.md#preets-session-001)                     | 1–3          | Accepted on 2026-10-05. All stated conditions retained. |
| [PREETS-SESSION-002 — Tenant-configured OIDC authentication](../requirements/session-management.md#preets-session-002)                  | 1–3          | Accepted on 2026-10-05. All stated conditions retained. |
| [PREETS-SESSION-003 — Authenticated session identity](../requirements/session-management.md#preets-session-003)                         | 1–3          | Accepted on 2026-10-05. All stated conditions retained. |
| [PREETS-SESSION-004 — Automatic login for missing sessions](../requirements/session-management.md#preets-session-004)                   | 1–2          | Accepted on 2026-10-05. All stated conditions retained. |
| [PREETS-SESSION-005 — Independent request tenant and session binding](../requirements/session-management.md#preets-session-005)         | 1–4          | Accepted on 2026-10-05. All stated conditions retained. |
| [PREETS-SESSION-006 — Shared transient session storage](../requirements/session-management.md#preets-session-006)                       | 1–3          | Accepted on 2026-10-05. All stated conditions retained. |
| [PREETS-SESSION-007 — Explicit expired-session page](../requirements/session-management.md#preets-session-007)                          | 1–4          | Accepted on 2026-10-05. All stated conditions retained. |
| [PREETS-SESSION-008 — Server-authoritative tenant idle timeout](../requirements/session-management.md#preets-session-008)               | 1–5          | Accepted on 2026-10-05. All stated conditions retained. |
| [PREETS-SESSION-009 — Qualifying browser activity](../requirements/session-management.md#preets-session-009)                            | 1–4          | Accepted on 2026-10-05. All stated conditions retained. |
| [PREETS-SESSION-010 — Shared session, idle state, and logout across tabs](../requirements/session-management.md#preets-session-010)     | 1–6          | Accepted on 2026-10-05. All stated conditions retained. |
| [PREETS-SESSION-011 — Configurable shared pre-expiration warning](../requirements/session-management.md#preets-session-011)             | 1–5          | Accepted on 2026-10-05. All stated conditions retained. |
| [PREETS-SESSION-012 — Protected content obscured after expiration](../requirements/session-management.md#preets-session-012)            | 1–5          | Accepted on 2026-10-05. All stated conditions retained. |
| [PREETS-SESSION-013 — New session and fresh OIDC authentication after expiry](../requirements/session-management.md#preets-session-013) | 1–5          | Accepted on 2026-10-05. All stated conditions retained. |

## Current observations and existing work

Inspection was read-only at the source revision. No behavioral suite was executed or reviewed as satisfaction evidence.
GitHub issue listing (all states, limit 100) and PR #112 inspection failed with `error connecting to api.github.com`;
The initial remote merge confirmation and duplicate-work checks were incomplete. Local history records the merged PR.

Publication refresh on 2026-10-05: read-only GitHub access succeeded. PR #112 is confirmed merged.
The all-state issue listing (limit 100) returned six issues, with no session delivery duplicates identified.
This inspection does not establish absence of overlapping pull requests or external planning work.

- [Proxy](../../packages/frontend/src/proxy.ts) matches only `/` and `/auth/callback` and includes an opt-in synthetic anonymous bypass. This is insufficient evidence of default protection for new resources.
- [Session guard](../../packages/frontend/src/lib/session/guard.ts) re-reads stored state, checks tenant binding and deadlines, and clears inactivity. The [session contract](../session-state.md) treats tenant mismatch as missing and fresh document inactivity entry as generic login; these conflict with candidate 403 and explicit-expiration behavior.
- [Store](../../packages/frontend/src/lib/session/store.ts) and [record types](../../packages/frontend/src/lib/session/types.ts) provide Redis-backed identity/idle state. The current record contract does not establish arbitrary application-value storage or cross-instance correctness.
- [Activity island](../../packages/frontend/src/components/session/idle-activity-island.tsx) listens at window level to trusted key/pointer/touch/wheel events; control-specific qualification needs review against SESSION-009.
- [Recovery](../../packages/frontend/src/lib/session/login-again.ts) rotates a session and starts generic OIDC. [Authentication notes](../authentication.md#login-again-after-inactivity) allow existing SSO; new-session rotation does not establish a fresh authentication event.
- Existing [recovery components](../../packages/frontend/src/components/session/inactivity-recovery-island.tsx), [idle/CAS tests](../../packages/frontend/tests/unit/session-store-idle-cas.test.ts), [capability evidence ledger](../../features/TRACEABILITY.md), and [real-Keycloak E2E](../../e2e/README.md) are reuse candidates. Their existence does not establish these new criteria. Inspect surviving assertions and execute revised evidence during delivery rather than wholesale replacement.
- [Tenant pilot](tenant-resolution.md) overlaps tenant configuration and vendor-agnostic secret resolution. Coordinate ownership and inspect actual issued work before publication; avoid duplicate tenant/security implementation issues. Concrete cloud provider and ingress work remain deferred under that plan.

Revision inspection on 2026-10-09: read-only GitHub access via the parent agent confirmed PR #114 merged
at the accepted revision above. The all-state issue listing (limit 100) returned 15 issues and no session delivery
issues; overlapping PRs and external planning remain unassessed. Verified tenant ownership is
[#117](https://github.com/PathableAI-org/Pre-ETS/issues/117) (open): tenant consumer/context integration and dummy
proxy removal; [#118](https://github.com/PathableAI-org/Pre-ETS/issues/118) (open): tenant frontend/diagnostic 404/500
outcomes; [#119](https://github.com/PathableAI-org/Pre-ETS/issues/119) (closed): non-secret schema and vendor-agnostic
server-only provider. Closure is not runtime verification. S1 consumes these tenant-owned outcomes rather than
duplicating them; S1 owns authentication, default protection and resolved-tenant/session mismatch 403.
The current local [tenant plan](tenant-resolution.md) also records that ownership. Initial restricted-network
inspection failed before the parent completed the remote refresh. No session publication or runtime verification is claimed.

## Blockers and decisions

| ID | Affected work                                                                      | Decision or prerequisite                                                                                                                                                                                                     |
| -- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B0 | All SESSION criteria / S1–S6                                                       | Resolved: explicit maintainer approval on 2026-10-05 accepts SESSION-001–013 and all 52 criteria. Renewed decomposition approval remains pending.                                                                            |
| B1 | SESSION-001 AC1–3 / S1                                                             | Approve public exceptions and enforcement inventory, including diagnostic access and authentication support resources; define application-resource scope without absorbing deferred backend expiration policy.               |
| B2 | SESSION-004 AC2; SESSION-007 AC1–4 / S1, S5                                        | Decide known-expired versus missing recognition, retention after stored state disappears, and the recovery contract for stale references. Existing tombstones expire at absolute expiry; do not invent indefinite retention. |
| B3 | SESSION-006 AC1–3 / S2                                                             | Decide supported value representation/capacity, transient retention, and concurrent consistency guarantees. Select storage mechanics during engineering; Redis is existing context, not a new product obligation.            |
| B4 | SESSION-008 AC1–5; SESSION-011 AC1–5 / S2, S4                                      | Decide omitted timeout policy and live-policy changes; warning representation, minimum lead time and omission/default behavior. Classify qualifying requests versus background traffic.                                      |
| B5 | SESSION-009 AC1,4; SESSION-010 AC1–6; SESSION-011 AC2–5; SESSION-012 AC1–5 / S3–S5 | Decide communication delay, connectivity loss, synchronization latency, and suspended/resumed tab behavior. Preserve required isolation and server authority; they are not undecided policy.                                 |
| B6 | SESSION-013 AC1–5 / S6                                                             | Approve fresh-auth request/response semantics, clock tolerance, broker/provider support, and failures before implementation.                                                                                                 |

These decisions can be developed independently of runtime changes. B0 is resolved;
implementation still requires approved decomposition and resolution of affected policy gates. No invented defaults unblock delivery.

## Delivery slices

### S1 — Protect application entry points and bind tenant authentication

**Outcome:** Protect application entry points and bind tenant authentication.

**Coverage:** [PREETS-SESSION-001](../requirements/session-management.md#preets-session-001) AC1–3; [PREETS-SESSION-002](../requirements/session-management.md#preets-session-002) AC1–3; [PREETS-SESSION-003](../requirements/session-management.md#preets-session-003) AC1–3; [PREETS-SESSION-004](../requirements/session-management.md#preets-session-004) AC1–2; [PREETS-SESSION-005](../requirements/session-management.md#preets-session-005) AC1–4. Accepted criterion coverage; decomposition approval remains pending. Cross-slice qualifications appear below.

**Included:** Inventory pages, resource handlers, Server Actions, and public exceptions; enforce protection by default, including new resources. Compose independent tenant resolution with authenticated-session validation, tenant-specific OIDC initiation/completion, and HTTP 403 for a resolved-tenant mismatch. Preserve invalid-host HTTP 404 and configuration failures from the accepted tenant contract. Consume tenant-context integration and dummy proxy removal from #117; enforce session protection after that tenant prerequisite. Review any remaining synthetic authentication bypass against default protection. Retain server-only secret resolution.

**Excluded:** Backend/domain persistence and API expiration policy, new absolute lifetime policy, concrete cloud provider/ingress, CI cadence, and implementation of undecided policy.

**Dependencies:** Start: B1, the mergeable S2 public-service/store increment, and tenant-context integration #117 with its prerequisite #119 non-secret/server-only configuration contract. #118 owns tenant-resolution failure mappings and is an integration gate for preserving those outcomes. B2 and S5 are shipping gates for missing-versus-known-expired entry; S1 does not wait for S5 to establish valid/missing-session protection.

**Observable increment:** Real tenant-bound OIDC login creates identity consumed by an actual protected request; valid, absent and mismatched sessions produce observable HTTP outcomes.

**Evidence progression:** Retain route/default-protection, callback and HTTP fixtures. After the S2 mergeable increment, S1 adds two independently running application instances sharing the real store: authenticate on A, read identity/protected access on B, write independently supplied supported values on A and retrieve on B, renew on A and enforce expiry on B without affinity. These scenarios carry S2 adapter evidence into application composition. Seeded records only support denial/isolation scenarios. Known-expired presentation remains incomplete until S5; final recovery remains S6.

**Planned evidence:** Public authorization scenarios cover matching/distinct resolved identities and rejected callbacks. Real HTTP checks cover public exceptions, representative protected entry points, forged context, missing sessions, and 403 status/content. Route-policy inspection and a newly added representative resource establish the default. Real OIDC completion must establish user/tenant identity used by subsequent protected requests; seeded records cannot establish login.

**Proposed issue title:** Protect application entry points and bind tenant authentication

Conditional issue-body draft; do not publish before decomposition approval.

> ## Outcome
>
> Protect application entry points and bind tenant authentication.
>
> ## Requirements
>
> [PREETS-SESSION-001](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/requirements/session-management.md#preets-session-001) AC1–3; [PREETS-SESSION-002](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/requirements/session-management.md#preets-session-002) AC1–3; [PREETS-SESSION-003](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/requirements/session-management.md#preets-session-003) AC1–3; [PREETS-SESSION-004](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/requirements/session-management.md#preets-session-004) AC1–2; [PREETS-SESSION-005](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/requirements/session-management.md#preets-session-005) AC1–4. Requirements are accepted at the pinned revision.
>
> ## In scope
>
> Inventory pages, resource handlers, Server Actions, and public exceptions; enforce protection by default, including new resources. Compose independent tenant resolution with authenticated-session validation, tenant-specific OIDC initiation/completion, and HTTP 403 for a resolved-tenant mismatch. Preserve invalid-host HTTP 404 and configuration failures from the accepted tenant contract. Consume tenant-context integration and dummy proxy removal from #117; enforce session protection after that tenant prerequisite. Review any remaining synthetic authentication bypass against default protection. Retain server-only secret resolution.
>
> ## Out of scope
>
> Backend/domain persistence and API expiration policy, new absolute lifetime policy, concrete cloud provider/ingress, CI cadence, and implementation of undecided policy.
>
> ## Dependencies
>
> Start: B1, the mergeable S2 public-service/store increment, and tenant-context integration #117 with its prerequisite #119 non-secret/server-only configuration contract. #118 owns tenant-resolution failure mappings and is an integration gate for preserving those outcomes. B2 and S5 are shipping gates for missing-versus-known-expired entry; S1 does not wait for S5 to establish valid/missing-session protection. Parent containment supplies no blocking relationship.
>
> ## Completion evidence
>
> **Observable increment:** Real tenant-bound OIDC login creates identity consumed by an actual protected request; valid, absent and mismatched sessions produce observable HTTP outcomes.
>
> **Evidence progression:** Retain route/default-protection, callback and HTTP fixtures. After the S2 mergeable increment, S1 adds two independently running application instances sharing the real store: authenticate on A, read identity/protected access on B, write independently supplied supported values on A and retrieve on B, renew on A and enforce expiry on B without affinity. These scenarios carry S2 adapter evidence into application composition. Seeded records only support denial/isolation scenarios. Known-expired presentation remains incomplete until S5; final recovery remains S6.
>
> Public authorization scenarios cover matching/distinct resolved identities and rejected callbacks. Real HTTP checks cover public exceptions, representative protected entry points, forged context, missing sessions, and 403 status/content. Route-policy inspection and a newly added representative resource establish the default. Real OIDC completion must establish user/tenant identity used by subsequent protected requests; seeded records cannot establish login. Include implementation review and applicable repository checks; issue closure does not verify requirements.
>
> ## Delivery plan
>
> [Plan S1](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/delivery/session-management.md#s1--protect-application-entry-points-and-bind-tenant-authentication). This resolving snapshot records the original approved proposal; replace with the remotely accessible revised proposal revision before publication. Revised dependencies and evidence progression above supersede that historical snapshot.

**Delivery references:** Not published.

### S2 — Share transient values and authoritative idle state across instances

**Outcome:** Share transient values and authoritative idle state across instances.

**Coverage:** [PREETS-SESSION-006](../requirements/session-management.md#preets-session-006) AC1–3; [PREETS-SESSION-008](../requirements/session-management.md#preets-session-008) AC1–5. Accepted criterion coverage; decomposition approval remains pending. Cross-slice qualifications appear below.

**Included:** Define the application-value storage contract, implement shared transient value operations, and retain authenticated identity across instances. Validate whole-minute timeout values 5 through 30, initialize and renew idle state on qualifying requests, and prevent revival at or after the deadline. Distinguish activity from polling/status traffic. Preserve existing absolute expiry without adopting a new maximum-lifetime policy.

**Excluded:** Backend/domain persistence and API expiration policy, new absolute lifetime policy, concrete cloud provider/ingress, CI cadence, and implementation of undecided policy.

**Dependencies:** Start: B3 and B4 for affected contracts. No S1 or browser prerequisite for public session operations or real-store integration. S1 owns the later two-application-instance authentication/protected-request composition; that integration is a shipping gate for SESSION-006 AC2–3 and SESSION-008 protected HTTP enforcement, not an S2 start dependency.

**Observable increment:** The public session service performs value round trips, identity retrieval and authoritative renewal/expiry, with real-store integration across independent clients.

**Evidence progression:** Retain public-service configuration/deadline examples and properties and real-adapter race/outage scenarios. Independently supplied supported values and prepared records establish service/adapter behavior; they do not establish OIDC login or multi-process application recognition. S1 extends this evidence through two real application instances; S3 extends qualifying browser activity. S2 is mergeable with those narrower claims and does not claim all SESSION-006/008 verification complete.

**Planned evidence (including later integration at S1/S4/S5 as allocated above):** Public-service deadline properties and examples cover before/equal/after expiry, non-activity traffic, and no revival. Real store integration covers renewal/expiration races and outages. Later S1 application-composition evidence uses two independently running application instances sharing the same store: write independently chosen supported values on A, retrieve on B, authenticate on A, read identity on B, renew on A, and enforce expiration on B without affinity. A test-owned map or same-process fixture is insufficient.

**Proposed issue title:** Share transient values and authoritative idle state across instances

Conditional issue-body draft; do not publish before decomposition approval.

> ## Outcome
>
> Share transient values and authoritative idle state across instances.
>
> ## Requirements
>
> [PREETS-SESSION-006](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/requirements/session-management.md#preets-session-006) AC1–3; [PREETS-SESSION-008](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/requirements/session-management.md#preets-session-008) AC1–5. Requirements are accepted at the pinned revision.
>
> ## In scope
>
> Define the application-value storage contract, implement shared transient value operations, and retain authenticated identity across instances. Validate whole-minute timeout values 5 through 30, initialize and renew idle state on qualifying requests, and prevent revival at or after the deadline. Distinguish activity from polling/status traffic. Preserve existing absolute expiry without adopting a new maximum-lifetime policy.
>
> ## Out of scope
>
> Backend/domain persistence and API expiration policy, new absolute lifetime policy, concrete cloud provider/ingress, CI cadence, and implementation of undecided policy.
>
> ## Dependencies
>
> Start: B3 and B4 for affected contracts. No S1 or browser prerequisite for public session operations or real-store integration. S1 owns the later two-application-instance authentication/protected-request composition; that integration is a shipping gate for SESSION-006 AC2–3 and SESSION-008 protected HTTP enforcement, not an S2 start dependency. Parent containment supplies no blocking relationship.
>
> ## Completion evidence
>
> **Observable increment:** The public session service performs value round trips, identity retrieval and authoritative renewal/expiry, with real-store integration across independent clients.
>
> **Evidence progression:** Retain public-service configuration/deadline examples and properties and real-adapter race/outage scenarios. Independently supplied supported values and prepared records establish service/adapter behavior; they do not establish OIDC login or multi-process application recognition. S1 extends this evidence through two real application instances; S3 extends qualifying browser activity. S2 is mergeable with those narrower claims and does not claim all SESSION-006/008 verification complete.
>
> Public-service deadline properties and examples cover before/equal/after expiry, non-activity traffic, and no revival. Real store integration covers renewal/expiration races and outages. Later S1 application-composition evidence uses two independently running application instances sharing the same store: write independently chosen supported values on A, retrieve on B, authenticate on A, read identity on B, renew on A, and enforce expiration on B without affinity. A test-owned map or same-process fixture is insufficient. Include implementation review and applicable repository checks; issue closure does not verify requirements.
>
> ## Delivery plan
>
> [Plan S2](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/delivery/session-management.md#s2--share-transient-values-and-authoritative-idle-state-across-instances). This resolving snapshot records the original approved proposal; replace with the remotely accessible revised proposal revision before publication. Revised dependencies and evidence progression above supersede that historical snapshot.

**Delivery references:** Not published.

### S3 — Coordinate intentional activity and logout across session-sharing tabs

**Outcome:** Coordinate intentional activity and logout across session-sharing tabs.

**Coverage:** [PREETS-SESSION-009](../requirements/session-management.md#preets-session-009) AC1–4; [PREETS-SESSION-010](../requirements/session-management.md#preets-session-010) AC1–6. Accepted criterion coverage; decomposition approval remains pending. Cross-slice qualifications appear below.

**Included:** Restrict qualifying events to intentional control activation, control keyboard interaction, text entry, and control touch interaction; exclude raw pointer movement and unrelated background traffic. Communicate activity to authoritative renewal. New tabs join the existing session. Synchronize authoritative deadlines and logout across tabs, with messages scoped to the associated session and resolved tenant. Compose warning and expiration synchronization from S4/S5.

**Excluded:** Backend/domain persistence and API expiration policy, new absolute lifetime policy, concrete cloud provider/ingress, CI cadence, and implementation of undecided policy.

**Dependencies:** Start: B5, S2 operations and S1 authenticated entry/protected request boundary. S4 and S5 extend the retained isolation scenarios for continuation, warning and expiration; they are aggregate shipping gates for SESSION-010 AC4 and those conditions of AC6, not S3 start or merge dependencies.

**Observable increment:** Real sharing tabs join an authenticated session, renew it through qualifying controls, and deny protected use after shared logout; unrelated sessions retain independent state.

**Evidence progression:** Retain multi-page semantic-control fixtures, controllable time, protected HTTP operations and independent tenant/browser-context sessions. At S3 completion exercise activity, joining and logout isolation, raw movement/background exclusions and late-activity rejection. Warning/expired presentation and continuation isolation are intentionally incomplete. S4 extends the same fixtures for warning/Continue and S5 for expiration; no synthetic warning or disposable presentation suite is required.

**Planned evidence (including later integration at S1/S4/S5 as allocated above):** Multi-page browser Gherkin uses semantic controls and controllable time; activity in one tab keeps another usable beyond its former deadline. Open a tab after login and prove shared identity/state. Logout must deny actual protected operations in all sharing tabs, backed by HTTP denial. At S3 exercise activity and logout while independently authenticated other-tenant and separate-context sessions remain unaffected; S4 adds continuation/warning and S5 adds expiration to these retained scenarios. Check delayed/offline and suspended/resumed cases after B5 resolution.

**Proposed issue title:** Coordinate intentional activity and logout across session-sharing tabs

Conditional issue-body draft; do not publish before decomposition approval.

> ## Outcome
>
> Coordinate intentional activity and logout across session-sharing tabs.
>
> ## Requirements
>
> [PREETS-SESSION-009](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/requirements/session-management.md#preets-session-009) AC1–4; [PREETS-SESSION-010](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/requirements/session-management.md#preets-session-010) AC1–6. Requirements are accepted at the pinned revision.
>
> ## In scope
>
> Restrict qualifying events to intentional control activation, control keyboard interaction, text entry, and control touch interaction; exclude raw pointer movement and unrelated background traffic. Communicate activity to authoritative renewal. New tabs join the existing session. Synchronize authoritative deadlines and logout across tabs, with messages scoped to the associated session and resolved tenant. Compose warning and expiration synchronization from S4/S5.
>
> ## Out of scope
>
> Backend/domain persistence and API expiration policy, new absolute lifetime policy, concrete cloud provider/ingress, CI cadence, and implementation of undecided policy.
>
> ## Dependencies
>
> Start: B5, S2 operations and S1 authenticated entry/protected request boundary. S4 and S5 extend the retained isolation scenarios for continuation, warning and expiration; they are aggregate shipping gates for SESSION-010 AC4 and those conditions of AC6, not S3 start or merge dependencies. Parent containment supplies no blocking relationship.
>
> ## Completion evidence
>
> **Observable increment:** Real sharing tabs join an authenticated session, renew it through qualifying controls, and deny protected use after shared logout; unrelated sessions retain independent state.
>
> **Evidence progression:** Retain multi-page semantic-control fixtures, controllable time, protected HTTP operations and independent tenant/browser-context sessions. At S3 completion exercise activity, joining and logout isolation, raw movement/background exclusions and late-activity rejection. Warning/expired presentation and continuation isolation are intentionally incomplete. S4 extends the same fixtures for warning/Continue and S5 for expiration; no synthetic warning or disposable presentation suite is required.
>
> Multi-page browser Gherkin uses semantic controls and controllable time; activity in one tab keeps another usable beyond its former deadline. Open a tab after login and prove shared identity/state. Logout must deny actual protected operations in all sharing tabs, backed by HTTP denial. At S3 exercise activity and logout while independently authenticated other-tenant and separate-context sessions remain unaffected; S4 adds continuation/warning and S5 adds expiration to these retained scenarios. Check delayed/offline and suspended/resumed cases after B5 resolution. Include implementation review and applicable repository checks; issue closure does not verify requirements.
>
> ## Delivery plan
>
> [Plan S3](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/delivery/session-management.md#s3--coordinate-intentional-activity-and-logout-across-session-sharing-tabs). This resolving snapshot records the original approved proposal; replace with the remotely accessible revised proposal revision before publication. Revised dependencies and evidence progression above supersede that historical snapshot.

**Delivery references:** Not published.

### S4 — Warn before expiration and continue accessibly across tabs

**Outcome:** Warn before expiration and continue accessibly across tabs.

**Coverage:** [PREETS-SESSION-011](../requirements/session-management.md#preets-session-011) AC1–5. Accepted criterion coverage; decomposition approval remains pending. Cross-slice qualifications appear below.

**Included:** Validate warning thresholds strictly before idle expiry. Show a blocking warning in every sharing tab; Continue renews through the server and dismisses all warnings only on successful continuation. Reject continuation at/after expiration. Announce the warning, move focus inside, contain keyboard/background interaction, show visible focus, and restore appropriate focus after continuation.

**Excluded:** Backend/domain persistence and API expiration policy, new absolute lifetime policy, concrete cloud provider/ingress, CI cadence, and implementation of undecided policy.

**Dependencies:** Start: B4 warning policy, B5 timing, S2 renewal and S3 synchronization. Late continuation is rejected through the existing S2 server boundary; S5 supplies final expired UI after the race and is a shipping gate, not a start dependency.

**Observable increment:** Sharing tabs display a blocking warning and keyboard Continue renews the real server deadline and dismisses warnings; late Continue is denied.

**Evidence progression:** Extend S3 retained multi-tab/isolation scenarios for warning and continuation with configuration examples and focused assistive-technology observations. Observe late Continue denial at S2 even before S5; S5 adds final expired presentation/concealment to that same race scenario. Final expiration and fresh recovery remain incomplete until S5/S6.

**Planned evidence:** Configuration examples reject invalid warning thresholds. Browser Gherkin covers all sharing tabs, keyboard continuation, focus entry/containment/restoration, blocked background interaction, cross-tab dismissal, and authoritative renewal. Integrated race checks cover late Continue. Record assistive-technology announcement and explanation/action observations with browser and assistive-technology versions; dialog strings alone are insufficient.

**Proposed issue title:** Warn before expiration and continue accessibly across tabs

Conditional issue-body draft; do not publish before decomposition approval.

> ## Outcome
>
> Warn before expiration and continue accessibly across tabs.
>
> ## Requirements
>
> [PREETS-SESSION-011](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/requirements/session-management.md#preets-session-011) AC1–5. Requirements are accepted at the pinned revision.
>
> ## In scope
>
> Validate warning thresholds strictly before idle expiry. Show a blocking warning in every sharing tab; Continue renews through the server and dismisses all warnings only on successful continuation. Reject continuation at/after expiration. Announce the warning, move focus inside, contain keyboard/background interaction, show visible focus, and restore appropriate focus after continuation.
>
> ## Out of scope
>
> Backend/domain persistence and API expiration policy, new absolute lifetime policy, concrete cloud provider/ingress, CI cadence, and implementation of undecided policy.
>
> ## Dependencies
>
> Start: B4 warning policy, B5 timing, S2 renewal and S3 synchronization. Late continuation is rejected through the existing S2 server boundary; S5 supplies final expired UI after the race and is a shipping gate, not a start dependency. Parent containment supplies no blocking relationship.
>
> ## Completion evidence
>
> **Observable increment:** Sharing tabs display a blocking warning and keyboard Continue renews the real server deadline and dismisses warnings; late Continue is denied.
>
> **Evidence progression:** Extend S3 retained multi-tab/isolation scenarios for warning and continuation with configuration examples and focused assistive-technology observations. Observe late Continue denial at S2 even before S5; S5 adds final expired presentation/concealment to that same race scenario. Final expiration and fresh recovery remain incomplete until S5/S6.
>
> Configuration examples reject invalid warning thresholds. Browser Gherkin covers all sharing tabs, keyboard continuation, focus entry/containment/restoration, blocked background interaction, cross-tab dismissal, and authoritative renewal. Integrated race checks cover late Continue. Record assistive-technology announcement and explanation/action observations with browser and assistive-technology versions; dialog strings alone are insufficient. Include implementation review and applicable repository checks; issue closure does not verify requirements.
>
> ## Delivery plan
>
> [Plan S4](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/delivery/session-management.md#s4--warn-before-expiration-and-continue-accessibly-across-tabs). This resolving snapshot records the original approved proposal; replace with the remotely accessible revised proposal revision before publication. Revised dependencies and evidence progression above supersede that historical snapshot.

**Delivery references:** Not published.

### S5 — Protect expired content and offer explicit accessible recovery

**Outcome:** Protect expired content and offer explicit accessible recovery.

**Coverage:** [PREETS-SESSION-007](../requirements/session-management.md#preets-session-007) AC1–4; [PREETS-SESSION-012](../requirements/session-management.md#preets-session-012) AC1–5. Accepted criterion coverage; decomposition approval remains pending. Cross-slice qualifications appear below.

**Included:** Recognize known-expired SSR requests and redirect to an unauthenticated session-expired page without automatic OIDC or protected content. In running tabs, conceal protected information and show a synchronized blocking expiration modal. Page and modal convey equivalent meaning and explicit recovery. Protect against modal dismissal/bypass, keyboard interaction, and assistive-technology reading of background information.

**Excluded:** Backend/domain persistence and API expiration policy, new absolute lifetime policy, concrete cloud provider/ingress, CI cadence, and implementation of undecided policy.

**Dependencies:** Start: B2 recognition/retention, B5 synchronization, S1 entry protection, S2 authoritative classification and S3 propagation. Extend S4 late-continuation scenarios when S4 exists; S4 is not a start prerequisite. S6 completes fresh recovery and is a shipping gate.

**Observable increment:** Actual expired SSR requests reach the public expired page without protected content or automatic OIDC; sharing tabs conceal already rendered information and expose explicit recovery.

**Evidence progression:** Extend S1 HTTP classification and S3 tab/isolation fixtures, plus S4 late-Continue scenarios when available. Retain browser bypass/focus and assistive-technology procedures. At this step the recovery action can be observed initiating the existing real recovery boundary, but existing generic SSO recovery does not establish freshness. S6 replaces its generic OIDC semantics with approved fresh-auth semantics and extends the same page/modal keyboard journeys through successful and failed recovery. This intermediate implementation cannot ship as final recovery.

**Planned evidence:** HTTP checks establish expired SSR redirect, unauthenticated page access, and absence of protected content, including removed transient state after B2 is decided. Multi-tab browser Gherkin observes actual concealment, bypass attempts, focus entry and visible focus, keyboard recovery, and consistent page/modal meaning. Assistive-technology observations establish announcements and background information being unavailable for reading/navigation. Server-only denial cannot establish concealment.

**Proposed issue title:** Protect expired content and offer explicit accessible recovery

Conditional issue-body draft; do not publish before decomposition approval.

> ## Outcome
>
> Protect expired content and offer explicit accessible recovery.
>
> ## Requirements
>
> [PREETS-SESSION-007](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/requirements/session-management.md#preets-session-007) AC1–4; [PREETS-SESSION-012](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/requirements/session-management.md#preets-session-012) AC1–5. Requirements are accepted at the pinned revision.
>
> ## In scope
>
> Recognize known-expired SSR requests and redirect to an unauthenticated session-expired page without automatic OIDC or protected content. In running tabs, conceal protected information and show a synchronized blocking expiration modal. Page and modal convey equivalent meaning and explicit recovery. Protect against modal dismissal/bypass, keyboard interaction, and assistive-technology reading of background information.
>
> ## Out of scope
>
> Backend/domain persistence and API expiration policy, new absolute lifetime policy, concrete cloud provider/ingress, CI cadence, and implementation of undecided policy.
>
> ## Dependencies
>
> Start: B2 recognition/retention, B5 synchronization, S1 entry protection, S2 authoritative classification and S3 propagation. Extend S4 late-continuation scenarios when S4 exists; S4 is not a start prerequisite. S6 completes fresh recovery and is a shipping gate. Parent containment supplies no blocking relationship.
>
> ## Completion evidence
>
> **Observable increment:** Actual expired SSR requests reach the public expired page without protected content or automatic OIDC; sharing tabs conceal already rendered information and expose explicit recovery.
>
> **Evidence progression:** Extend S1 HTTP classification and S3 tab/isolation fixtures, plus S4 late-Continue scenarios when available. Retain browser bypass/focus and assistive-technology procedures. At this step the recovery action can be observed initiating the existing real recovery boundary, but existing generic SSO recovery does not establish freshness. S6 replaces its generic OIDC semantics with approved fresh-auth semantics and extends the same page/modal keyboard journeys through successful and failed recovery. This intermediate implementation cannot ship as final recovery.
>
> HTTP checks establish expired SSR redirect, unauthenticated page access, and absence of protected content, including removed transient state after B2 is decided. Multi-tab browser Gherkin observes actual concealment, bypass attempts, focus entry and visible focus, keyboard recovery, and consistent page/modal meaning. Assistive-technology observations establish announcements and background information being unavailable for reading/navigation. Server-only denial cannot establish concealment. Include implementation review and applicable repository checks; issue closure does not verify requirements.
>
> ## Delivery plan
>
> [Plan S5](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/delivery/session-management.md#s5--protect-expired-content-and-offer-explicit-accessible-recovery). This resolving snapshot records the original approved proposal; replace with the remotely accessible revised proposal revision before publication. Revised dependencies and evidence progression above supersede that historical snapshot.

**Delivery references:** Not published.

### S6 — Complete fresh tenant OIDC recovery with a new session

**Outcome:** Complete fresh tenant OIDC recovery with a new session.

**Coverage:** [PREETS-SESSION-013](../requirements/session-management.md#preets-session-013) AC1–5. Accepted criterion coverage; decomposition approval remains pending. Cross-slice qualifications appear below.

**Included:** Implement approved OIDC freshness request and callback-evidence validation. Explicit recovery creates a new user/tenant-bound session; the old session remains unusable. Existing SSO alone cannot satisfy recovery. Let the IdP choose its mechanism and deny protected access for cancelled, failed, stale, missing, or unconfirmed freshness evidence.

**Excluded:** Backend/domain persistence and API expiration policy, new absolute lifetime policy, concrete cloud provider/ingress, CI cadence, and implementation of undecided policy.

**Dependencies:** Start: B6 freshness policy, S1/S2 authentication/session operations and S5 explicit recovery entry points. Provider capability must be demonstrated before shipping.

**Observable increment:** Explicit page/modal recovery completes a demonstrably fresh tenant-provider authentication and grants a new session while the prior session remains denied.

**Evidence progression:** Extend S5 recovery journeys and S1 real OIDC/HTTP fixtures, retaining independent freshness-response validation and cancelled/failed/stale cases. Execute with existing SSO and record provider/clock limitations. Close aggregate recovery gates only with application/browser and provider evidence; a new session ID or mock callback is insufficient.

**Planned evidence:** OIDC integration observes request freshness parameters and validates independent response evidence, tolerances, stale/missing evidence, cancellation, and failure. Real-provider browser Gherkin begins with an existing SSO session, demonstrates a fresh event and successful recovery, then proves old-session denial. New sid or a mocked callback alone does not establish freshness; provider-specific limits must be recorded.

**Proposed issue title:** Complete fresh tenant OIDC recovery with a new session

Conditional issue-body draft; do not publish before decomposition approval.

> ## Outcome
>
> Complete fresh tenant OIDC recovery with a new session.
>
> ## Requirements
>
> [PREETS-SESSION-013](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/requirements/session-management.md#preets-session-013) AC1–5. Requirements are accepted at the pinned revision.
>
> ## In scope
>
> Implement approved OIDC freshness request and callback-evidence validation. Explicit recovery creates a new user/tenant-bound session; the old session remains unusable. Existing SSO alone cannot satisfy recovery. Let the IdP choose its mechanism and deny protected access for cancelled, failed, stale, missing, or unconfirmed freshness evidence.
>
> ## Out of scope
>
> Backend/domain persistence and API expiration policy, new absolute lifetime policy, concrete cloud provider/ingress, CI cadence, and implementation of undecided policy.
>
> ## Dependencies
>
> Start: B6 freshness policy, S1/S2 authentication/session operations and S5 explicit recovery entry points. Provider capability must be demonstrated before shipping. Parent containment supplies no blocking relationship.
>
> ## Completion evidence
>
> **Observable increment:** Explicit page/modal recovery completes a demonstrably fresh tenant-provider authentication and grants a new session while the prior session remains denied.
>
> **Evidence progression:** Extend S5 recovery journeys and S1 real OIDC/HTTP fixtures, retaining independent freshness-response validation and cancelled/failed/stale cases. Execute with existing SSO and record provider/clock limitations. Close aggregate recovery gates only with application/browser and provider evidence; a new session ID or mock callback is insufficient.
>
> OIDC integration observes request freshness parameters and validates independent response evidence, tolerances, stale/missing evidence, cancellation, and failure. Real-provider browser Gherkin begins with an existing SSO session, demonstrates a fresh event and successful recovery, then proves old-session denial. New sid or a mocked callback alone does not establish freshness; provider-specific limits must be recorded. Include implementation review and applicable repository checks; issue closure does not verify requirements.
>
> ## Delivery plan
>
> [Plan S6](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/delivery/session-management.md#s6--complete-fresh-tenant-oidc-recovery-with-a-new-session). This resolving snapshot records the original approved proposal; replace with the remotely accessible revised proposal revision before publication. Revised dependencies and evidence progression above supersede that historical snapshot.

**Delivery references:** Not published.

## Cross-cutting concerns and issue structure

Propose one parent container, **Deliver shared tenant authentication and accessible session recovery**, containing
S1–S6. Containment is organizational. The real dependency chain is shared server state/access (S1/S2), browser
activity and synchronization (S3), warning and expiration presentation (S4/S5), and fresh recovery (S6).
Execution order: S2 public-service/store increment → S1 application composition → S3 activity/logout → S4 warning and S5 expiration (independent start after S3) → S6 recovery. Policy/design work can proceed independently; no later integration is a start dependency of earlier slices.
Do not ship default protection without correct expired-entry classification, or recovery UI without working fresh recovery.

**Proposed parent issue body (pending decomposition approval):**

> ## Outcome
>
> Deliver shared tenant authentication and accessible session recovery across instances and tabs.
>
> ## Requirements
>
> [Session requirements at the inspected revision](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/requirements/session-management.md): SESSION-001 AC1–3; 002 AC1–3; 003 AC1–3; 004 AC1–2; 005 AC1–4; 006 AC1–3; 007 AC1–4; 008 AC1–5; 009 AC1–4; 010 AC1–6; 011 AC1–5; 012 AC1–5; 013 AC1–5. All are accepted at the pinned revision.
>
> ## In scope
>
> Proposed children: S1 protected entry and tenant authentication; S2 shared transient state and idle enforcement; S3 activity and logout across tabs; S4 warning and continuation; S5 expired-content protection and explicit recovery; S6 fresh OIDC recovery. Containment does not imply blocking.
>
> ## Out of scope
>
> Backend domain persistence, API expiration responses, a new absolute-lifetime policy, concrete cloud providers/ingress, CI cadence, and undecided product policy.
>
> ## Dependencies
>
> B0 is resolved; decomposition approval precedes publication; resolve B1–B6 for affected work. Follow slice start prerequisites and shipping gates. Children are listed separately above; no issue numbers are allocated.
>
> ## Completion evidence
>
> Collect the slice executions and limitations, including composed multi-instance and multi-tab workflows, real OIDC freshness, deadline races, tenant/session isolation, HTTP denial, and accessible browser/assistive-technology recovery. Review migration and rollback compatibility. Issue closure does not establish requirement verification.
>
> ## Delivery plan
>
> [Original approved plan](https://github.com/PathableAI-org/Pre-ETS/blob/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e/docs/delivery/session-management.md). This historical snapshot does not contain these revised proposals; replace with the remotely accessible revised proposal revision before publication.

Keep meaningful verification in each slice: no separate generic testing issue. Use durable Gherkin for product
behaviors, Playwright where browser interaction is necessary, public-service scenarios for module contracts,
and real-store/multi-instance execution for distribution claims. Document controllable clocks and authentication
seams; never bypass the behavior being claimed. Read the property-testing guide before designing properties.
Record assistive-technology procedures, observed outcomes, and limitations alongside browser execution.

Frontend owns tenant configuration, OIDC, temporary session values, and UI. Backend owns durable domain records
and business authorization. Retain existing absolute-deadline enforcement without broadening the new product scope.
Plan compatibility for live legacy/idle-shaped records and changed transient value schemas, including rolling
instance upgrades and rollback; use the existing dual-read/drain contract as context, not proof of rollout safety.
Update session/authentication/multi-tenancy implementation notes with delivered behavior and approved policy.
Runtime release gates include no protected-content leaks, tenant/session isolation, deadline races, and complete
accessible recovery. Disable synthetic bypasses in those executions. Use installed framework/library declarations
and required workspace guidance during engineering; this plan selects no unverified APIs or new frameworks.

## Coverage review

All criteria are accepted and B0 is resolved. Planned work remains subject to decomposition approval
and the policy gates identified for each slice; no row represents executed evidence.

| Requirement                                                                    | AC | Disposition and slice            | Planned evidence and remaining conditions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------ | -- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PREETS-SESSION-001](../requirements/session-management.md#preets-session-001) | 1  | Planned — S1; policy gates apply | A request without valid authentication cannot obtain protected content from any protected application entry point. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                  |
| [PREETS-SESSION-001](../requirements/session-management.md#preets-session-001) | 2  | Planned — S1; policy gates apply | An explicitly designated public resource, including the session-expired page, is accessible without authentication. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                 |
| [PREETS-SESSION-001](../requirements/session-management.md#preets-session-001) | 3  | Planned — S1; policy gates apply | Adding an application resource leaves it protected unless it is explicitly designated public. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                       |
| [PREETS-SESSION-002](../requirements/session-management.md#preets-session-002) | 1  | Planned — S1; policy gates apply | Tenant configuration contains enough non-secret OIDC integration settings and, when needed, server-only secret lookup keys to initiate and complete authentication under PREETS-SECURITY-001. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                       |
| [PREETS-SESSION-002](../requirements/session-management.md#preets-session-002) | 2  | Planned — S1; policy gates apply | Authentication uses the resolved tenant’s integration rather than another tenant’s configuration. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                   |
| [PREETS-SESSION-002](../requirements/session-management.md#preets-session-002) | 3  | Planned — S1; policy gates apply | Users are directed to the identity provider for authentication; the application does not collect local username/password credentials. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                               |
| [PREETS-SESSION-003](../requirements/session-management.md#preets-session-003) | 1  | Planned — S1; policy gates apply | Successful OIDC completion establishes a session bound to the authenticated user and authentication tenant. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                         |
| [PREETS-SESSION-003](../requirements/session-management.md#preets-session-003) | 2  | Planned — S1; policy gates apply | Failed or rejected authentication does not establish an authenticated application session. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                          |
| [PREETS-SESSION-003](../requirements/session-management.md#preets-session-003) | 3  | Planned — S1; policy gates apply | A subsequent protected request uses the established identity and tenant association. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                                |
| [PREETS-SESSION-004](../requirements/session-management.md#preets-session-004) | 1  | Planned — S1; policy gates apply | A protected page request without an application session initiates the resolved tenant’s OIDC flow automatically. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                    |
| [PREETS-SESSION-004](../requirements/session-management.md#preets-session-004) | 2  | Planned — S1; policy gates apply | The missing-session path does not replace the explicit expired-session recovery required by PREETS-SESSION-007. See S1 evidence and its policy gates. S5 supplies the distinct expired path; S1 alone is partial.                                                                                                                                                                                                                                                                                                         |
| [PREETS-SESSION-005](../requirements/session-management.md#preets-session-005) | 1  | Planned — S1; policy gates apply | Matching request and session tenants permit tenant-binding validation to succeed, subject to other access checks. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                   |
| [PREETS-SESSION-005](../requirements/session-management.md#preets-session-005) | 2  | Planned — S1; policy gates apply | Different request and session tenants forbid access and expose a 403 Forbidden page. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                                |
| [PREETS-SESSION-005](../requirements/session-management.md#preets-session-005) | 3  | Planned — S1; policy gates apply | A valid session does not bypass request tenant resolution or substitute the session tenant for the tenant returned by that resolution. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                              |
| [PREETS-SESSION-005](../requirements/session-management.md#preets-session-005) | 4  | Planned — S1; policy gates apply | Tenant/session comparison depends on the resolved tenant identity, without imposing a tenant resolution mode or mechanism. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                          |
| [PREETS-SESSION-006](../requirements/session-management.md#preets-session-006) | 1  | Planned — S2; policy gates apply | A session-associated application value stored through one application instance can be retrieved with the same value through another instance during the session lifetime, without affinity to the writing instance. See S2 evidence and its policy gates.                                                                                                                                                                                                                                                                 |
| [PREETS-SESSION-006](../requirements/session-management.md#preets-session-006) | 2  | Planned — S2; policy gates apply | A session established on one instance is recognized with the same user and tenant state on another instance. See S2 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                        |
| [PREETS-SESSION-006](../requirements/session-management.md#preets-session-006) | 3  | Planned — S2; policy gates apply | An activity update or expiration enforced by one instance is honored by another; requests need not return to the previous instance. See S2 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                 |
| [PREETS-SESSION-008](../requirements/session-management.md#preets-session-008) | 1  | Planned — S2; policy gates apply | Tenant idle timeout accepts whole minutes 5 through 30 inclusive and rejects values outside that domain. See S2 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                            |
| [PREETS-SESSION-008](../requirements/session-management.md#preets-session-008) | 2  | Planned — S2; policy gates apply | A new authenticated session has an idle expiration derived from the configured interval. See S2 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                            |
| [PREETS-SESSION-008](../requirements/session-management.md#preets-session-008) | 3  | Planned — S2; policy gates apply | Before expiration, receipt of an authenticated request representing activity advances expiration by that interval. See S2 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                  |
| [PREETS-SESSION-008](../requirements/session-management.md#preets-session-008) | 4  | Planned — S2; policy gates apply | At or after expiration, requests cannot revive the session or obtain protected access, even if browser timers are disabled. See S2 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                         |
| [PREETS-SESSION-008](../requirements/session-management.md#preets-session-008) | 5  | Planned — S2; policy gates apply | Traffic not caused by qualifying user activity does not extend the idle deadline (see PREETS-SESSION-009). See S2 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                          |
| [PREETS-SESSION-009](../requirements/session-management.md#preets-session-009) | 1  | Planned — S3; policy gates apply | Intentional control activation, keyboard interaction with application controls, text entry, and touch interaction with application controls must count as qualifying activity and, when communicated to the server before expiration, renew the still-valid session. See S3 evidence and its policy gates.                                                                                                                                                                                                                |
| [PREETS-SESSION-009](../requirements/session-management.md#preets-session-009) | 2  | Planned — S3; policy gates apply | Raw pointer movement alone never renews the idle deadline. See S3 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [PREETS-SESSION-009](../requirements/session-management.md#preets-session-009) | 3  | Planned — S3; policy gates apply | Automatic polling or background traffic unrelated to qualifying activity never renews the idle deadline. See S3 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                            |
| [PREETS-SESSION-009](../requirements/session-management.md#preets-session-009) | 4  | Planned — S3; policy gates apply | Qualifying activity communicated after expiration does not revive authenticated access. See S3 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                             |
| [PREETS-SESSION-010](../requirements/session-management.md#preets-session-010) | 1  | Planned — S3; policy gates apply | All concurrent application tabs for the same resolved tenant in the same browser context use the same application session and common idle state. See S3 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                    |
| [PREETS-SESSION-010](../requirements/session-management.md#preets-session-010) | 2  | Planned — S3; policy gates apply | Opening a new application tab when a session already exists joins that session rather than establishing an independent session. See S3 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                     |
| [PREETS-SESSION-010](../requirements/session-management.md#preets-session-010) | 3  | Planned — S3; policy gates apply | Qualifying activity in one tab renews authoritative expiration and prevents another inactive tab from independently expiring the still-active session. See S3 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                              |
| [PREETS-SESSION-010](../requirements/session-management.md#preets-session-010) | 4  | Planned — S3; policy gates apply | Warning and expired states propagate across tabs as required by PREETS-SESSION-011 and PREETS-SESSION-012. See S3 evidence and its policy gates. S4 supplies warning and S5 expiration; S3 alone is partial.                                                                                                                                                                                                                                                                                                              |
| [PREETS-SESSION-010](../requirements/session-management.md#preets-session-010) | 5  | Planned — S3; policy gates apply | Logging out in any tab ends authenticated access for the shared session and logs out every tab sharing it; no other tab can continue protected use under the logged-out session. See S3 evidence and its policy gates.                                                                                                                                                                                                                                                                                                    |
| [PREETS-SESSION-010](../requirements/session-management.md#preets-session-010) | 6  | Planned — S3; policy gates apply | Activity, continuation, warnings, expiration, and logout affect only the associated session. They must not renew, warn, expire, or log out a different session, including sessions for another resolved tenant or in another browser context. See S3 evidence and its policy gates. Exercise all five operations with S4/S5; synchronization transport tests alone are partial.                                                                                                                                           |
| [PREETS-SESSION-011](../requirements/session-management.md#preets-session-011) | 1  | Planned — S4; policy gates apply | Tenant warning configuration places the warning strictly before idle expiration; invalid thresholds are rejected. See S4 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                   |
| [PREETS-SESSION-011](../requirements/session-management.md#preets-session-011) | 2  | Planned — S4; policy gates apply | At the warning threshold, all open tabs sharing the session display the blocking warning. See S4 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                           |
| [PREETS-SESSION-011](../requirements/session-management.md#preets-session-011) | 3  | Planned — S4; policy gates apply | Activating Continue or Keep working before expiration constitutes qualifying activity, renews the authoritative deadline, and dismisses warnings across the other tabs. See S4 evidence and its policy gates.                                                                                                                                                                                                                                                                                                             |
| [PREETS-SESSION-011](../requirements/session-management.md#preets-session-011) | 4  | Planned — S4; policy gates apply | A continuation reaching the server at or after expiration cannot restore the expired session. See S4 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                       |
| [PREETS-SESSION-011](../requirements/session-management.md#preets-session-011) | 5  | Planned — S4; policy gates apply | Assistive-technology users receive an announcement of the warning and can perceive its explanation and Continue action. Focus moves into the warning when it opens; keyboard users can activate Continue with visible focus. While the warning is blocking, focus and interaction cannot reach background application content. After successful continuation, focus returns to an appropriate application control. See S4 evidence and its policy gates.                                                                  |
| [PREETS-SESSION-007](../requirements/session-management.md#preets-session-007) | 1  | Planned — S5; policy gates apply | An expired-session SSR page request redirects to the session-expired page without automatically initiating OIDC. See S5 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                    |
| [PREETS-SESSION-007](../requirements/session-management.md#preets-session-007) | 2  | Planned — S5; policy gates apply | The page is accessible unauthenticated, explains that the previous session expired, and provides an explicit authenticate-again action. See S5 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                             |
| [PREETS-SESSION-007](../requirements/session-management.md#preets-session-007) | 3  | Planned — S5; policy gates apply | Protected content is not returned in the expired-session response. See S5 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| [PREETS-SESSION-007](../requirements/session-management.md#preets-session-007) | 4  | Planned — S5; policy gates apply | Keyboard and assistive-technology users can perceive the expiration explanation, locate the authenticate-again action, and activate it with visible focus and appropriate focus movement. See S5 evidence and its policy gates. Include assistive-technology observation where required; browser automation alone is partial.                                                                                                                                                                                             |
| [PREETS-SESSION-012](../requirements/session-management.md#preets-session-012) | 1  | Planned — S5; policy gates apply | At expiration, protected information already rendered in every session-sharing tab is no longer readable. See S5 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                           |
| [PREETS-SESSION-012](../requirements/session-management.md#preets-session-012) | 2  | Planned — S5; policy gates apply | The blocking expiration modal explains expiration and offers explicit authentication again; protected information cannot be exposed by dismissing or bypassing the modal. See S5 evidence and its policy gates.                                                                                                                                                                                                                                                                                                           |
| [PREETS-SESSION-012](../requirements/session-management.md#preets-session-012) | 3  | Planned — S5; policy gates apply | Expired state propagates across session-sharing tabs. See S5 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [PREETS-SESSION-012](../requirements/session-management.md#preets-session-012) | 4  | Planned — S5; policy gates apply | The modal and PREETS-SESSION-007’s page convey equivalent expiration meaning and recovery actions. See S5 evidence and its policy gates. Include assistive-technology observation where required; browser automation alone is partial.                                                                                                                                                                                                                                                                                    |
| [PREETS-SESSION-012](../requirements/session-management.md#preets-session-012) | 5  | Planned — S5; policy gates apply | Assistive-technology users receive an announcement of expiration and can perceive its explanation and authenticate-again action. Focus moves into the modal; keyboard users can activate reauthentication with visible focus. Protected background information is unavailable to keyboard interaction and assistive-technology reading or navigation while the expired state remains. See S5 evidence and its policy gates. Include assistive-technology observation where required; browser automation alone is partial. |
| [PREETS-SESSION-013](../requirements/session-management.md#preets-session-013) | 1  | Planned — S6; policy gates apply | Explicit recovery initiates tenant OIDC authentication and successful completion establishes a new application session bound to the authenticated user and tenant. See S6 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                  |
| [PREETS-SESSION-013](../requirements/session-management.md#preets-session-013) | 2  | Planned — S6; policy gates apply | The old application session cannot be renewed or reused for protected access. See S6 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                                       |
| [PREETS-SESSION-013](../requirements/session-management.md#preets-session-013) | 3  | Planned — S6; policy gates apply | An existing IdP/SSO session alone cannot silently satisfy recovery: the application requests fresh authentication and verifies protocol evidence that a fresh event occurred. See S6 evidence and its policy gates.                                                                                                                                                                                                                                                                                                       |
| [PREETS-SESSION-013](../requirements/session-management.md#preets-session-013) | 4  | Planned — S6; policy gates apply | The IdP chooses the authentication mechanism; entering a password is not required by this contract. See S6 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                 |
| [PREETS-SESSION-013](../requirements/session-management.md#preets-session-013) | 5  | Planned — S6; policy gates apply | Cancelled, failed, or unconfirmed fresh authentication leaves protected access unavailable. See S6 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                         |

## Review and planning gaps

All accepted ACs are accounted for; none are claimed verified or silently deferred. SESSION-010 spans synchronization,
warning, and expiration; SESSION-004 spans missing-entry and expired-entry handling. These are explicit aggregate
shipping gates rather than independently complete partial slices. Existing code only reduces possible remaining work.

Before publication, obtain renewed PR approval of this revised decomposition, refresh remote issue inspection,
and replace historical issue-body plan links with the remotely accessible revised proposal revision. B1–B6 remain
affected implementation/shipping gates, not invented policy or evidence. All requirement links pin the accepted
revision; a later requirement change requires a new coverage review. Prior PR #114 approval is preserved above.
No session issues were published, no runtime evidence was executed, and requirement verification is unchanged.
