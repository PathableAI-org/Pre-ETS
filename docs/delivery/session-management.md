# Delivery plan: Authentication and session management

**Status:** draft
**Planning date:** 2026-10-05
**Source revision:** `c03c173139724f4f0090bf2d60c15de820dbba13` (local HEAD; session requirements merged in PR #112)
**Approval:** Pending

## Goal

Prepare a reviewable decomposition for protected tenant access, shared transient sessions, authoritative inactivity,
and accessible warning/expiration recovery across tabs and application instances.

## Requirements in scope

All 13 session requirements and their 52 criteria were accepted by explicit maintainer direction on
2026-10-05. B0 is resolved. The decomposition remains draft pending separate maintainer approval;
B1–B6 retain the unresolved policy and design gates. Accepted tenant/security requirements constrain
this work rather than being newly claimed as delivered by this plan.

**Source update:** Requirement lifecycle approval is a local documentation update after the inspected
revision. Existing pinned links show the pre-acceptance snapshot; replace them with the committed
accepted revision before publication.

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

## Blockers and decisions

| ID | Affected work                                                                      | Decision or prerequisite                                                                                                                                                                                                     |
| -- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B0 | All SESSION criteria / S1–S6                                                       | Resolved: explicit maintainer approval on 2026-10-05 accepts SESSION-001–013 and all 52 criteria. Decomposition approval remains pending.                                                                                    |
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

**Included:** Inventory pages, resource handlers, Server Actions, and public exceptions; enforce protection by default, including new resources. Compose independent tenant resolution with authenticated-session validation, tenant-specific OIDC initiation/completion, and HTTP 403 for a resolved-tenant mismatch. Preserve invalid-host HTTP 404 and configuration failures from the accepted tenant contract. Review the dummy proxy bypass against default protection. Retain server-only secret resolution.

**Excluded:** Backend/domain persistence and API expiration policy, new absolute lifetime policy, concrete cloud provider/ingress, CI cadence, and implementation of undecided policy.

**Dependencies:** B1 gate production scope; S2 supplies authoritative session operations. Missing-versus-expired classification depends on B2 and S5; that path cannot ship independently.

**Planned evidence:** Public authorization scenarios cover matching/distinct resolved identities and rejected callbacks. Real HTTP checks cover public exceptions, representative protected entry points, forged context, missing sessions, and 403 status/content. Route-policy inspection and a newly added representative resource establish the default. Real OIDC completion must establish user/tenant identity used by subsequent protected requests; seeded records cannot establish login.

**Proposed issue title:** Protect application entry points and bind tenant authentication

Conditional issue-body draft; do not publish before decomposition approval.

> ## Outcome
>
> Protect application entry points and bind tenant authentication.
>
> ## Requirements
>
> [PREETS-SESSION-001](https://github.com/PathableAI-org/Pre-ETS/blob/c03c173139724f4f0090bf2d60c15de820dbba13/docs/requirements/session-management.md#preets-session-001) AC1–3; [PREETS-SESSION-002](https://github.com/PathableAI-org/Pre-ETS/blob/c03c173139724f4f0090bf2d60c15de820dbba13/docs/requirements/session-management.md#preets-session-002) AC1–3; [PREETS-SESSION-003](https://github.com/PathableAI-org/Pre-ETS/blob/c03c173139724f4f0090bf2d60c15de820dbba13/docs/requirements/session-management.md#preets-session-003) AC1–3; [PREETS-SESSION-004](https://github.com/PathableAI-org/Pre-ETS/blob/c03c173139724f4f0090bf2d60c15de820dbba13/docs/requirements/session-management.md#preets-session-004) AC1–2; [PREETS-SESSION-005](https://github.com/PathableAI-org/Pre-ETS/blob/c03c173139724f4f0090bf2d60c15de820dbba13/docs/requirements/session-management.md#preets-session-005) AC1–4. Requirements are accepted locally; update this pinned link to the committed accepted revision before publication.
>
> ## In scope
>
> Inventory pages, resource handlers, Server Actions, and public exceptions; enforce protection by default, including new resources. Compose independent tenant resolution with authenticated-session validation, tenant-specific OIDC initiation/completion, and HTTP 403 for a resolved-tenant mismatch. Preserve invalid-host HTTP 404 and configuration failures from the accepted tenant contract. Review the dummy proxy bypass against default protection. Retain server-only secret resolution.
>
> ## Out of scope
>
> Backend/domain persistence and API expiration policy, new absolute lifetime policy, concrete cloud provider/ingress, CI cadence, and implementation of undecided policy.
>
> ## Dependencies
>
> B1 gate production scope; S2 supplies authoritative session operations. Missing-versus-expired classification depends on B2 and S5; that path cannot ship independently. Parent containment supplies no blocking relationship.
>
> ## Completion evidence
>
> Public authorization scenarios cover matching/distinct resolved identities and rejected callbacks. Real HTTP checks cover public exceptions, representative protected entry points, forged context, missing sessions, and 403 status/content. Route-policy inspection and a newly added representative resource establish the default. Real OIDC completion must establish user/tenant identity used by subsequent protected requests; seeded records cannot establish login. Include implementation review and applicable repository checks; issue closure does not verify requirements.
>
> ## Delivery plan
>
> Local draft: docs/delivery/session-management.md, S1. Publication must replace this text with a full source-pinned URL to the committed plan revision and slice anchor. The plan does not exist at the inspected source revision; no resolving URL can yet be supplied.

**Delivery references:** Not published.

### S2 — Share transient values and authoritative idle state across instances

**Outcome:** Share transient values and authoritative idle state across instances.

**Coverage:** [PREETS-SESSION-006](../requirements/session-management.md#preets-session-006) AC1–3; [PREETS-SESSION-008](../requirements/session-management.md#preets-session-008) AC1–5. Accepted criterion coverage; decomposition approval remains pending. Cross-slice qualifications appear below.

**Included:** Define the application-value storage contract, implement shared transient value operations, and retain authenticated identity across instances. Validate whole-minute timeout values 5 through 30, initialize and renew idle state on qualifying requests, and prevent revival at or after the deadline. Distinguish activity from polling/status traffic. Preserve existing absolute expiry without adopting a new maximum-lifetime policy.

**Excluded:** Backend/domain persistence and API expiration policy, new absolute lifetime policy, concrete cloud provider/ingress, CI cadence, and implementation of undecided policy.

**Dependencies:** B3 and B4 gate contract implementation. Integrate with S1 for protected access; no need to wait for browser presentation.

**Planned evidence:** Public-service deadline properties and examples cover before/equal/after expiry, non-activity traffic, and no revival. Real store integration covers renewal/expiration races and outages. Two independently running application instances share the same store: write independently chosen supported values on A, retrieve on B, authenticate on A, read identity on B, renew on A, and enforce expiration on B without affinity. A test-owned map or same-process fixture is insufficient.

**Proposed issue title:** Share transient values and authoritative idle state across instances

Conditional issue-body draft; do not publish before decomposition approval.

> ## Outcome
>
> Share transient values and authoritative idle state across instances.
>
> ## Requirements
>
> [PREETS-SESSION-006](https://github.com/PathableAI-org/Pre-ETS/blob/c03c173139724f4f0090bf2d60c15de820dbba13/docs/requirements/session-management.md#preets-session-006) AC1–3; [PREETS-SESSION-008](https://github.com/PathableAI-org/Pre-ETS/blob/c03c173139724f4f0090bf2d60c15de820dbba13/docs/requirements/session-management.md#preets-session-008) AC1–5. Requirements are accepted locally; update this pinned link to the committed accepted revision before publication.
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
> B3 and B4 gate contract implementation. Integrate with S1 for protected access; no need to wait for browser presentation. Parent containment supplies no blocking relationship.
>
> ## Completion evidence
>
> Public-service deadline properties and examples cover before/equal/after expiry, non-activity traffic, and no revival. Real store integration covers renewal/expiration races and outages. Two independently running application instances share the same store: write independently chosen supported values on A, retrieve on B, authenticate on A, read identity on B, renew on A, and enforce expiration on B without affinity. A test-owned map or same-process fixture is insufficient. Include implementation review and applicable repository checks; issue closure does not verify requirements.
>
> ## Delivery plan
>
> Local draft: docs/delivery/session-management.md, S2. Publication must replace this text with a full source-pinned URL to the committed plan revision and slice anchor. The plan does not exist at the inspected source revision; no resolving URL can yet be supplied.

**Delivery references:** Not published.

### S3 — Coordinate intentional activity and logout across session-sharing tabs

**Outcome:** Coordinate intentional activity and logout across session-sharing tabs.

**Coverage:** [PREETS-SESSION-009](../requirements/session-management.md#preets-session-009) AC1–4; [PREETS-SESSION-010](../requirements/session-management.md#preets-session-010) AC1–6. Accepted criterion coverage; decomposition approval remains pending. Cross-slice qualifications appear below.

**Included:** Restrict qualifying events to intentional control activation, control keyboard interaction, text entry, and control touch interaction; exclude raw pointer movement and unrelated background traffic. Communicate activity to authoritative renewal. New tabs join the existing session. Synchronize authoritative deadlines and logout across tabs, with messages scoped to the associated session and resolved tenant. Compose warning and expiration synchronization from S4/S5.

**Excluded:** Backend/domain persistence and API expiration policy, new absolute lifetime policy, concrete cloud provider/ingress, CI cadence, and implementation of undecided policy.

**Dependencies:** B5; S2 renewal and shared-state operations are start prerequisites. S1 supplies authenticated entry. S4/S5 are shipping gates for SESSION-010 AC4; S4 also supports continuation isolation under AC6.

**Planned evidence:** Multi-page browser Gherkin uses semantic controls and controllable time; activity in one tab keeps another usable beyond its former deadline. Open a tab after login and prove shared identity/state. Logout must deny actual protected operations in all sharing tabs, backed by HTTP denial. Exercise activity, continuation, warning, expiration, and logout while observing independently authenticated other-tenant and separate-context sessions remain unaffected. Check delayed/offline and suspended/resumed cases after B5 resolution.

**Proposed issue title:** Coordinate intentional activity and logout across session-sharing tabs

Conditional issue-body draft; do not publish before decomposition approval.

> ## Outcome
>
> Coordinate intentional activity and logout across session-sharing tabs.
>
> ## Requirements
>
> [PREETS-SESSION-009](https://github.com/PathableAI-org/Pre-ETS/blob/c03c173139724f4f0090bf2d60c15de820dbba13/docs/requirements/session-management.md#preets-session-009) AC1–4; [PREETS-SESSION-010](https://github.com/PathableAI-org/Pre-ETS/blob/c03c173139724f4f0090bf2d60c15de820dbba13/docs/requirements/session-management.md#preets-session-010) AC1–6. Requirements are accepted locally; update this pinned link to the committed accepted revision before publication.
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
> B5; S2 renewal and shared-state operations are start prerequisites. S1 supplies authenticated entry. S4/S5 are shipping gates for SESSION-010 AC4; S4 also supports continuation isolation under AC6. Parent containment supplies no blocking relationship.
>
> ## Completion evidence
>
> Multi-page browser Gherkin uses semantic controls and controllable time; activity in one tab keeps another usable beyond its former deadline. Open a tab after login and prove shared identity/state. Logout must deny actual protected operations in all sharing tabs, backed by HTTP denial. Exercise activity, continuation, warning, expiration, and logout while observing independently authenticated other-tenant and separate-context sessions remain unaffected. Check delayed/offline and suspended/resumed cases after B5 resolution. Include implementation review and applicable repository checks; issue closure does not verify requirements.
>
> ## Delivery plan
>
> Local draft: docs/delivery/session-management.md, S3. Publication must replace this text with a full source-pinned URL to the committed plan revision and slice anchor. The plan does not exist at the inspected source revision; no resolving URL can yet be supplied.

**Delivery references:** Not published.

### S4 — Warn before expiration and continue accessibly across tabs

**Outcome:** Warn before expiration and continue accessibly across tabs.

**Coverage:** [PREETS-SESSION-011](../requirements/session-management.md#preets-session-011) AC1–5. Accepted criterion coverage; decomposition approval remains pending. Cross-slice qualifications appear below.

**Included:** Validate warning thresholds strictly before idle expiry. Show a blocking warning in every sharing tab; Continue renews through the server and dismisses all warnings only on successful continuation. Reject continuation at/after expiration. Announce the warning, move focus inside, contain keyboard/background interaction, show visible focus, and restore appropriate focus after continuation.

**Excluded:** Backend/domain persistence and API expiration policy, new absolute lifetime policy, concrete cloud provider/ingress, CI cadence, and implementation of undecided policy.

**Dependencies:** B4 warning policy and B5 timing; S2 supplies renewal and S3 synchronization. S5 handles continuation that loses the expiration race.

**Planned evidence:** Configuration examples reject invalid warning thresholds. Browser Gherkin covers all sharing tabs, keyboard continuation, focus entry/containment/restoration, blocked background interaction, cross-tab dismissal, and authoritative renewal. Integrated race checks cover late Continue. Record assistive-technology announcement and explanation/action observations with browser and assistive-technology versions; dialog strings alone are insufficient.

**Proposed issue title:** Warn before expiration and continue accessibly across tabs

Conditional issue-body draft; do not publish before decomposition approval.

> ## Outcome
>
> Warn before expiration and continue accessibly across tabs.
>
> ## Requirements
>
> [PREETS-SESSION-011](https://github.com/PathableAI-org/Pre-ETS/blob/c03c173139724f4f0090bf2d60c15de820dbba13/docs/requirements/session-management.md#preets-session-011) AC1–5. Requirements are accepted locally; update this pinned link to the committed accepted revision before publication.
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
> B4 warning policy and B5 timing; S2 supplies renewal and S3 synchronization. S5 handles continuation that loses the expiration race. Parent containment supplies no blocking relationship.
>
> ## Completion evidence
>
> Configuration examples reject invalid warning thresholds. Browser Gherkin covers all sharing tabs, keyboard continuation, focus entry/containment/restoration, blocked background interaction, cross-tab dismissal, and authoritative renewal. Integrated race checks cover late Continue. Record assistive-technology announcement and explanation/action observations with browser and assistive-technology versions; dialog strings alone are insufficient. Include implementation review and applicable repository checks; issue closure does not verify requirements.
>
> ## Delivery plan
>
> Local draft: docs/delivery/session-management.md, S4. Publication must replace this text with a full source-pinned URL to the committed plan revision and slice anchor. The plan does not exist at the inspected source revision; no resolving URL can yet be supplied.

**Delivery references:** Not published.

### S5 — Protect expired content and offer explicit accessible recovery

**Outcome:** Protect expired content and offer explicit accessible recovery.

**Coverage:** [PREETS-SESSION-007](../requirements/session-management.md#preets-session-007) AC1–4; [PREETS-SESSION-012](../requirements/session-management.md#preets-session-012) AC1–5. Accepted criterion coverage; decomposition approval remains pending. Cross-slice qualifications appear below.

**Included:** Recognize known-expired SSR requests and redirect to an unauthenticated session-expired page without automatic OIDC or protected content. In running tabs, conceal protected information and show a synchronized blocking expiration modal. Page and modal convey equivalent meaning and explicit recovery. Protect against modal dismissal/bypass, keyboard interaction, and assistive-technology reading of background information.

**Excluded:** Backend/domain persistence and API expiration policy, new absolute lifetime policy, concrete cloud provider/ingress, CI cadence, and implementation of undecided policy.

**Dependencies:** B2 recognition/retention and B5 synchronization; S1/S2 supply denial/classification and S3 propagation. S6 is a shipping gate for completed recovery.

**Planned evidence:** HTTP checks establish expired SSR redirect, unauthenticated page access, and absence of protected content, including removed transient state after B2 is decided. Multi-tab browser Gherkin observes actual concealment, bypass attempts, focus entry and visible focus, keyboard recovery, and consistent page/modal meaning. Assistive-technology observations establish announcements and background information being unavailable for reading/navigation. Server-only denial cannot establish concealment.

**Proposed issue title:** Protect expired content and offer explicit accessible recovery

Conditional issue-body draft; do not publish before decomposition approval.

> ## Outcome
>
> Protect expired content and offer explicit accessible recovery.
>
> ## Requirements
>
> [PREETS-SESSION-007](https://github.com/PathableAI-org/Pre-ETS/blob/c03c173139724f4f0090bf2d60c15de820dbba13/docs/requirements/session-management.md#preets-session-007) AC1–4; [PREETS-SESSION-012](https://github.com/PathableAI-org/Pre-ETS/blob/c03c173139724f4f0090bf2d60c15de820dbba13/docs/requirements/session-management.md#preets-session-012) AC1–5. Requirements are accepted locally; update this pinned link to the committed accepted revision before publication.
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
> B2 recognition/retention and B5 synchronization; S1/S2 supply denial/classification and S3 propagation. S6 is a shipping gate for completed recovery. Parent containment supplies no blocking relationship.
>
> ## Completion evidence
>
> HTTP checks establish expired SSR redirect, unauthenticated page access, and absence of protected content, including removed transient state after B2 is decided. Multi-tab browser Gherkin observes actual concealment, bypass attempts, focus entry and visible focus, keyboard recovery, and consistent page/modal meaning. Assistive-technology observations establish announcements and background information being unavailable for reading/navigation. Server-only denial cannot establish concealment. Include implementation review and applicable repository checks; issue closure does not verify requirements.
>
> ## Delivery plan
>
> Local draft: docs/delivery/session-management.md, S5. Publication must replace this text with a full source-pinned URL to the committed plan revision and slice anchor. The plan does not exist at the inspected source revision; no resolving URL can yet be supplied.

**Delivery references:** Not published.

### S6 — Complete fresh tenant OIDC recovery with a new session

**Outcome:** Complete fresh tenant OIDC recovery with a new session.

**Coverage:** [PREETS-SESSION-013](../requirements/session-management.md#preets-session-013) AC1–5. Accepted criterion coverage; decomposition approval remains pending. Cross-slice qualifications appear below.

**Included:** Implement approved OIDC freshness request and callback-evidence validation. Explicit recovery creates a new user/tenant-bound session; the old session remains unusable. Existing SSO alone cannot satisfy recovery. Let the IdP choose its mechanism and deny protected access for cancelled, failed, stale, missing, or unconfirmed freshness evidence.

**Excluded:** Backend/domain persistence and API expiration policy, new absolute lifetime policy, concrete cloud provider/ingress, CI cadence, and implementation of undecided policy.

**Dependencies:** B6 freshness policy gate implementation. S1/S2 provide authentication and session operations; S5 provides recovery entry points. Provider capability must be demonstrated before shipping.

**Planned evidence:** OIDC integration observes request freshness parameters and validates independent response evidence, tolerances, stale/missing evidence, cancellation, and failure. Real-provider browser Gherkin begins with an existing SSO session, demonstrates a fresh event and successful recovery, then proves old-session denial. New sid or a mocked callback alone does not establish freshness; provider-specific limits must be recorded.

**Proposed issue title:** Complete fresh tenant OIDC recovery with a new session

Conditional issue-body draft; do not publish before decomposition approval.

> ## Outcome
>
> Complete fresh tenant OIDC recovery with a new session.
>
> ## Requirements
>
> [PREETS-SESSION-013](https://github.com/PathableAI-org/Pre-ETS/blob/c03c173139724f4f0090bf2d60c15de820dbba13/docs/requirements/session-management.md#preets-session-013) AC1–5. Requirements are accepted locally; update this pinned link to the committed accepted revision before publication.
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
> B6 freshness policy gate implementation. S1/S2 provide authentication and session operations; S5 provides recovery entry points. Provider capability must be demonstrated before shipping. Parent containment supplies no blocking relationship.
>
> ## Completion evidence
>
> OIDC integration observes request freshness parameters and validates independent response evidence, tolerances, stale/missing evidence, cancellation, and failure. Real-provider browser Gherkin begins with an existing SSO session, demonstrates a fresh event and successful recovery, then proves old-session denial. New sid or a mocked callback alone does not establish freshness; provider-specific limits must be recorded. Include implementation review and applicable repository checks; issue closure does not verify requirements.
>
> ## Delivery plan
>
> Local draft: docs/delivery/session-management.md, S6. Publication must replace this text with a full source-pinned URL to the committed plan revision and slice anchor. The plan does not exist at the inspected source revision; no resolving URL can yet be supplied.

**Delivery references:** Not published.

## Cross-cutting concerns and issue structure

Propose one parent container, **Deliver shared tenant authentication and accessible session recovery**, containing
S1–S6. Containment is organizational. The real dependency chain is shared server state/access (S1/S2), browser
activity and synchronization (S3), warning and expiration presentation (S4/S5), and fresh recovery (S6).
S1 and S2 contracts can be developed together; S6 protocol design can proceed independently after its decisions.
Do not ship default protection without correct expired-entry classification, or recovery UI without working fresh recovery.

**Proposed parent issue body (pending decomposition approval):**

> ## Outcome
>
> Deliver shared tenant authentication and accessible session recovery across instances and tabs.
>
> ## Requirements
>
> [Session requirements at the inspected revision](https://github.com/PathableAI-org/Pre-ETS/blob/c03c173139724f4f0090bf2d60c15de820dbba13/docs/requirements/session-management.md): SESSION-001 AC1–3; 002 AC1–3; 003 AC1–3; 004 AC1–2; 005 AC1–4; 006 AC1–3; 007 AC1–4; 008 AC1–5; 009 AC1–4; 010 AC1–6; 011 AC1–5; 012 AC1–5; 013 AC1–5. All are accepted locally; replace this link with the committed accepted revision before publication.
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
> docs/delivery/session-management.md; replace with a full source-pinned URL to the committed plan before publication. This new document has no resolving URL at the inspected revision.

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

Before adoption/publication, resolve affected policies, refresh the register and source revision,
complete remote duplicate-work inspection, coordinate tenant-pilot ownership, commit the approved documentation,
and replace each issue-body plan reference with the resulting full pinned URL. Requirement links above are already
pinned to the inspected revision; update them to the accepted revision before publication. Source changes can alter
AC numbering/scope and require a new coverage review. Approval remains pending; no issues were published and no
runtime evidence or requirement verification status was changed.
