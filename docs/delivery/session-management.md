# Delivery plan: Authentication and session management

**Status:** draft
**Planning date:** 2026-10-05; decomposition revised 2026-10-09; policies approved 2026-10-12; execution proposal revised 2026-10-13
**Source revision:** Current implementation and accepted requirements inspected at `33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96` (`origin/main`). Session policy refinements were merged in [PR #185](https://github.com/PathableAI-org/Pre-ETS/pull/185) at `cddbb741e73af8b79cdc699101c08770ddb56096`.
**Approval:** Original decomposition: [PR #114](https://github.com/PathableAI-org/Pre-ETS/pull/114), merged at `6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e`; revised decomposition: [PR #151](https://github.com/PathableAI-org/Pre-ETS/pull/151), merged at `0e0b58b7d7db196dac1a8f71e3c2f8d27dbc12bf`; current policies and six outcomes: PR #185. The 2026-10-13 reconstruction scope and phased sequencing below are a new draft pending renewed PR approval. Existing publication identities and approval history are retained.

## Goal

Deliver protected tenant access, distributed transient sessions, authoritative inactivity, and accessible
warning/expiration recovery across tabs and application instances, starting from the current tenant-only implementation.

## Requirements in scope

All 13 session requirements and their 52 acceptance criteria are accepted in the inspected `origin/main`.
PR #185 resolved B1–B4; its merged contracts govern this proposal even where historical source prose still says
approval is pending. B5 communication/synchronization timing and suspended/resumed behavior, and B6 OIDC freshness
and recognition after old-state removal, remain decisions. This plan changes delivery sequencing, not requirements.

**Revision scope:** Preserve S1–S6 and their existing issues. Make session/OIDC reconstruction and new evidence
fixtures explicit; separate S5 Server Action recovery from its browser synchronization prerequisite; bring S6
freshness/provider and removed-state recognition design into S1/S2 construction; prioritize expiration protection
before warning presentation. Remove assumed availability of legacy recovery, absolute-deadline, and dual-read/drain
implementations. Published issues remain on their approved PR #185 scope until a separately authorized reconciliation.

| Requirement                                                                                                                  | Selected ACs | Qualification                                                       |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------- |
| [PREETS-SESSION-001 — Authentication required by default](../requirements/session/PREETS-SESSION-001.md)                     | 1–3          | Accepted in PR #185; all stated conditions retained.                |
| [PREETS-SESSION-002 — Tenant-configured OIDC authentication](../requirements/session/PREETS-SESSION-002.md)                  | 1–3          | Accepted in inspected main; all stated conditions retained.         |
| [PREETS-SESSION-003 — Authenticated session identity](../requirements/session/PREETS-SESSION-003.md)                         | 1–3          | Accepted in inspected main; all stated conditions retained.         |
| [PREETS-SESSION-004 — Automatic login on fresh protected-page entry](../requirements/session/PREETS-SESSION-004.md)          | 1–2          | Accepted in PR #185; all stated conditions retained.                |
| [PREETS-SESSION-005 — Independent request tenant and session binding](../requirements/session/PREETS-SESSION-005.md)         | 1–4          | Accepted in inspected main; all stated conditions retained.         |
| [PREETS-SESSION-006 — Shared transient session storage](../requirements/session/PREETS-SESSION-006.md)                       | 1–3          | Accepted in PR #185; all stated conditions retained.                |
| [PREETS-SESSION-007 — Explicit recovery for expired or missing sessions](../requirements/session/PREETS-SESSION-007.md)      | 1–4          | Accepted in PR #185; all stated conditions retained.                |
| [PREETS-SESSION-008 — Server-authoritative tenant idle timeout](../requirements/session/PREETS-SESSION-008.md)               | 1–5          | Accepted in PR #185; all stated conditions retained.                |
| [PREETS-SESSION-009 — Qualifying browser activity](../requirements/session/PREETS-SESSION-009.md)                            | 1–4          | Accepted in PR #185; all stated conditions retained.                |
| [PREETS-SESSION-010 — Shared session, idle state, and logout across tabs](../requirements/session/PREETS-SESSION-010.md)     | 1–6          | Accepted in inspected main; all stated conditions retained.         |
| [PREETS-SESSION-011 — Configurable shared pre-expiration warning](../requirements/session/PREETS-SESSION-011.md)             | 1–5          | Accepted in PR #185; all stated conditions retained.                |
| [PREETS-SESSION-012 — Protected content obscured after expiration](../requirements/session/PREETS-SESSION-012.md)            | 1–5          | Accepted in PR #185; all stated conditions retained.                |
| [PREETS-SESSION-013 — New session and fresh OIDC authentication after expiry](../requirements/session/PREETS-SESSION-013.md) | 1–5          | Accepted in PR #185; explicit and automatic expired entry included. |

## Current observations and existing work

**Inspection:** 2026-10-13, read-only implementation and GitHub inspection at `33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96`.
No session behavioral suite was executed or assessed as satisfaction evidence.

- The [proxy](../../packages/frontend/src/proxy.ts) forwards requests and matches only `/` and `/auth/callback`.
  The [app layout](../../packages/frontend/src/app/(app)/layout.tsx) loads tenant configuration; the home page
  renders a welcome screen. Neither establishes authenticated access enforcement.
- [TenantConfigService](../../packages/frontend/src/lib/tenant.ts) supplies independent alias/configuration reads
  in host and static modes. Its schema includes optional OIDC settings and an optional 5–30-minute idle timeout;
  it does not implement warning policy, OIDC transactions, or session storage. Preserve its accepted 404/500
  mappings and use its independently resolved tenant identity when binding sessions.
- OIDC initiation/completion, callback validation, session cookies/records, distributed session operations,
  guards, activity/logout, browser coordination, and recovery components are absent. The
  [callback page](../../packages/frontend/src/app/auth/callback/page.tsx) is a fallback. The current runtime has
  no server-only OIDC secrets provider; S1 must establish one if the selected integration requires secrets.
- [Redis/Keycloak Compose services](../../compose.yaml), the local realm, Playwright library, and tenant
  fixtures remain useful setup. They do not supply an application integration or session evidence. Active
  requirements BDD covers tenant behavior.
  Establish session evidence at the slice that first needs it, then extend those fixtures.
- Tenant issues [#117](https://github.com/PathableAI-org/Pre-ETS/issues/117), [#118](https://github.com/PathableAI-org/Pre-ETS/issues/118), and
  [#119](https://github.com/PathableAI-org/Pre-ETS/issues/119) are closed. Reuse current tenant selection and failure mappings. Closure does not
  establish current availability of removed OIDC/secret-provider implementations or session satisfaction.
- The all-state issue listing returned 22 issues; parent #152 and S1–S6 remain open. Their bodies now pin PR #185,
  B1–B4 are resolved, and S6 has no blanket S5 start prerequisite. Current native relationships were read back.
  Two open PRs were listed (#146 frontend report prototype and #187 backend HTTP foundation); their diffs and
  external planning were not assessed for overlap. No replacement delivery issues are proposed here.

### Historical implementation context

The original implementation inventory is retained at the
[approved PR #185 plan snapshot](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/delivery/session-management.md#current-observations-and-existing-work).
The legacy proxy/auth path and browser specs were removed in `e16ad49efa44381d2b59cdfc5620c5f14692ed81`;
unused session/OIDC libraries were removed in `d0ece0ddfa8c02137510a4f1b8c862af4e381337`.
Historical assertions can inform semantic regression choices, but must be assessed against current accepted
contracts before reuse. [Session-state notes](../session-state.md), the historical capability ledger, and old
SSO/rollout behavior do not prescribe the new implementation or establish its safety.

## Shared-component ownership and handoff (2026-10-17)

#153 owns construction of reusable tenant/OIDC/session capabilities, their public consumer contracts, real service/store lifecycle/race/outage evidence, and bounded reference application consumers. #154 owns comprehensive application integration of those same components: default protection across pages/handlers/actions/new resources, independent request-tenant enforcement, user-facing outcomes, and application-wide/multi-instance HTTP evidence. Shared files and components do not imply duplicate implementation or identical completion claims.

The #153 children deliver reusable schema/configuration (#215), OIDC initiation/transaction (#216), callback validation
(#217), shared session creation/read/record/cookie contract (#218), a reference enforcement consumer and
protected-action fixture (#219), authoritative renewal/expiration/policy adoption (#220), and invalidation/outage
behavior (#221). #154 extends these retained fixtures and components rather than rebuilding them.

The session contract makes usable identity/deadline/effective warning policy, no usable session, and storage/service
failure observable to consumers. Absent/expired/invalidated state cannot yield usable identity; failures cannot silently
create replacement sessions or grant access. Known causes may inform recovery, but no cause-retention mechanism is
required solely for freshness selection. Exact API/representation remains an implementation choice.

#153 child completion rests on their service/store and bounded reference evidence. #154 later supplies comprehensive application enforcement and cross-instance HTTP renewal/expiry evidence; these downstream requirements do not block #153 construction closure. #155/#156 extend activity/logout/warning coordination, #157 recovery, and #158 completed provider freshness. Existing native containment and start dependencies remain unchanged. Remaining B6 clock/comparison/provider gates apply only to affected implementation.

Maintainer expressly requested these ownership/evidence refinements on 2026-10-17. Existing approval/publication history
is retained; local plan refinements await repository PR review and do not claim behavioral verification.

## B6 decision update (2026-10-17)

The maintainer selected fresh provider authentication for every login without a valid application session,
including first-time visits, automatic entry, and explicit recovery. Valid application sessions remain reusable.
SESSION-004 and SESSION-013 contain the working refinement pending Git/PR approval. Prior-expiration recognition
is no longer needed to select freshness after old records disappear; no retention mechanism is required solely
for that choice. This supersedes recognition-as-a-freshness-selection-gate language in the baseline and quoted
issue drafts below, preserving their historical approval/publication records.

B6 remains open for freshness comparison/clock tolerance, provider/broker support, and unsupported-provider
handling. The request/evidence baseline below is selected; detailed validation remains gated. S1 initiation/callback and S2 identity/removal work retain those affected protocol/provider gates.
Server Action HTTP 401/recovery and running-tab modal behavior remain unchanged. Verification must add first-time
entry with existing SSO/no old application record, retain removed-record expiry cases, and preserve valid-session
reuse. No executed freshness evidence has been assessed or claimed.

### B6 protocol baseline (2026-10-17)

The maintainer selected the OIDC protocol baseline on 2026-10-17: every login without a valid
application session requests `max_age=0`; the callback validates the signed ID token and its `auth_time`
as evidence of a fresh authentication event before creating an authenticated application session. Missing
or stale freshness evidence is rejected. A redirect, a new session ID, or `prompt=login` alone is not proof.
The comparison with the authentication transaction and allowed clock tolerance remain to be specified;
provider/broker support and unsupported-provider handling remain open. No tolerance value or provider
compatibility is approved or verified by this selection. Protocol source:
[OIDC Core authorization request](https://openid.net/specs/openid-connect-core-1_0.html#AuthRequest) and
[ID token validation](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation).

### B6 provider-neutral compatibility evidence (2026-10-17)

The maintainer requires provider-neutral, standards-based OIDC integration driven by tenant configuration,
without designing application behavior around a particular vendor. Microsoft identity integration is a
first-class compatibility test scenario. The existing repository Docker Compose Keycloak service and tracked
realm are the current development/test environment; no additional identity stack is introduced.

Run the same initiation, callback validation, `max_age=0` / signed-ID-token `auth_time` freshness, existing-SSO,
missing/stale evidence, failure/cancellation, tenant-isolation, and session-establishment expectations against
each supported integration. Provider-specific setup belongs in configuration and test fixtures rather than
provider-specific application policy. Passing local Keycloak scenarios does not establish Microsoft behavior
or universal OIDC-provider compatibility. Microsoft scenarios remain explicitly outstanding until executed
against a real Microsoft integration; no Microsoft environment access or successful execution is claimed.
The exact Microsoft product/tenant and any direct-versus-broker topology are not yet established. Relevant
broker chains require their own freshness evidence before compatibility is claimed. Clock tolerance and
unsupported-provider handling remain open B6 decisions.

Source: maintainer direction on 2026-10-17. Repository inspection confirmed the Keycloak service in
[compose.yaml](../../compose.yaml) and its tracked realm in
[docker/keycloak/pre-ets-realm.json](../../docker/keycloak/pre-ets-realm.json); containers were not started or assessed.

## Blockers and decisions

| ID | Affected work                                          | Current disposition                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B0 | All SESSION criteria / S1–S6                           | Resolved: accepted requirements and prior decompositions are recorded in PRs #114/#151/#185. This changed execution proposal still needs renewed PR approval.                                                                                                                                                                                                                                                                                             |
| B1 | SESSION-001 / S1                                       | Resolved in PR #185: default frontend protection, explicit public exceptions, public assets without protected information, and diagnostics without session creation. Engineering chooses enforcement.                                                                                                                                                                                                                                                     |
| B2 | SESSION-004/007/012 / S1, S5                           | Resolved in PR #185: fresh page entry starts tenant OIDC; expired/missing-record Server Actions return HTTP 401 with explicit recovery; running tabs conceal content with a blocking modal. No recognition-retention duration is adopted.                                                                                                                                                                                                                 |
| B3 | SESSION-006 / S2                                       | Resolved in PR #185: distributed session storage without affinity; no arbitrary application-value representation or capacity obligation.                                                                                                                                                                                                                                                                                                                  |
| B4 | SESSION-008/009/011 / S2–S4                            | Resolved in PR #185: omitted timeout is 30 minutes; warning defaults to five minutes before expiry except default disabling at a five-minute timeout; explicit 0 disables warning. Reject invalid settings. Adopt current timeout/warning policy on qualifying authoritative refresh; deliberate requests and meaningful input qualify, movement/background traffic do not.                                                                               |
| B5 | SESSION-009/010/011/012 / S3, S4, S5 browser increment | Decide communication delay, synchronization latency, and suspended/resumed protection before affected browser implementation/evidence. Isolation and server authority are required. S5 Server Action recovery is independent of this browser gate. Heartbeat/connection-loss input behavior belongs to a separate pending requirement.                                                                                                                    |
| B6 | SESSION-013 and SESSION-004 / S6, S1/S2 composition    | Partly resolved by maintainer on 2026-10-17: every login without a valid application session requires fresh authentication, including first-time visits; prior-expiration recognition is unnecessary solely to select freshness. Protocol baseline: `max_age=0` and validated signed-ID-token `auth_time`; comparison/clock tolerance, provider/broker support, and unsupported-provider handling remain open. Working refinement awaits Git/PR approval. |

B5/B6 design can proceed independently. Partial increments can merge with explicit limits; final shipping requires
their affected gates and evidence. Engineering experiments do not approve unresolved product policy.

## Delivery slices

Slice IDs preserve published identities, not execution order. All slices exclude backend/domain persistence and
API expiration-response policy, a new absolute maximum-lifetime policy, concrete cloud provider/ingress, CI cadence,
arbitrary application-value storage, and implementation of undecided policy. Heartbeat and connection-loss input
behavior remain a separate pending requirement without a supplied ID or reviewed contract.

Issue-body proposals below use source-pinned accepted requirements. Their plan links identify the approved baseline;
after renewed approval, repin to the approved proposal revision before any separately authorized issue reconciliation.
Historical issue-body drafts remain in the revision-pinned plan snapshot and publication record.

### S1 — Protect application entry points and bind tenant authentication

**Outcome:** Protect application entry points and bind tenant authentication.

**Coverage:** [PREETS-SESSION-001](../requirements/session/PREETS-SESSION-001.md) AC1–3; [PREETS-SESSION-002](../requirements/session/PREETS-SESSION-002.md) AC1–3; [PREETS-SESSION-003](../requirements/session/PREETS-SESSION-003.md) AC1–3; [PREETS-SESSION-004](../requirements/session/PREETS-SESSION-004.md) AC1–2; [PREETS-SESSION-005](../requirements/session/PREETS-SESSION-005.md) AC1–4. SESSION-004 AC1 expired-entry freshness awaits S6; AC2 recovery composition awaits S5.

**Included:** Build tenant-specific OIDC initiation, transaction/callback validation, authenticated session establishment,
and request-session enforcement against S2. Establish vendor-agnostic server-only secret lookup when the integration
needs credentials; tenant files contain non-secret settings/lookup keys only. Protect pages, route handlers, and
Server Actions by default, including direct requests and new resources. Preserve the callback, sign-in error,
`/_test`, recovery-content, and safe public-asset exceptions; diagnostics create no application session.
Independently resolve the request tenant and enforce mismatch HTTP 403 without replacing that tenant with session
identity. Preserve accepted tenant 404/500 outcomes. Build missing-session automatic tenant login and valid-session
joining, then integrate expired new-tab/refresh/history entry with S6 freshness. Construct an actual protected
Server Action and its browser consumer before S5's early recovery increment needs them; the operation must provide
observable side-effect denial without introducing a new domain workflow.

**Excluded:** The common delivery exclusions above apply. Preserve accepted tenant/security constraints and
workspace ownership; no new domain workflow, framework, generic verification issue, or unresolved policy is added.

**Dependencies:** Start: S2's public-service/store increment and the delivered tenant boundaries associated with closed
#117/#119. Preserve #118 failure mappings as an integration gate. S6 freshness design/implementation proceeds
alongside construction; it is not a reverse blanket start dependency. S5 Server Action recovery and S6 verified
expired-entry freshness are shipping gates. S1's valid/missing-session increment does not depend on S3.

**Observable increment:** Actual tenant-provider login establishes identity used by a protected request; valid, absent, and mismatched
sessions have observable HTTP outcomes. Authenticate through app instance A and recognize its identity through
independently running instance B without affinity.

**Evidence progression:** Establish and retain real OIDC, callback, default-protection, protected-action, and multi-instance HTTP
fixtures; prepared records are limited to denial/isolation scenarios. Extend S2's store evidence into real app
composition, including renewal on A and expiry enforcement on B. S5 adds HTTP 401 recovery to the same action
consumer; S6 adds freshness with existing SSO and removed old records. Final SESSION-004 recovery composition
and freshness remain incomplete until those increments.

**Planned evidence:** HTTP/application evidence covers direct pages/handlers/actions, new-resource default protection, public
exceptions, diagnostic requests without session creation, forged context, rejected callbacks, and mismatch HTTP
403 plus forbidden presentation. Real OIDC completion establishes subsequent user/tenant identity; seeded records
cannot establish login. Browser evidence distinguishes valid-session joining from missing/expired entry and tests
history restoration. Public-asset assessment and preserved configuration secrecy remain explicit checks; diagnostic
safety and production ingress require their separate evidence.

**Proposed issue revision:** Protect application entry points and bind tenant authentication — retain [#154](https://github.com/PathableAI-org/Pre-ETS/issues/154).
The existing body remains approved at PR #185; the following is a draft revision for later reconciliation.

> ## Outcome
>
> Protect application entry points and bind tenant authentication.
>
> ## Requirements
>
> [PREETS-SESSION-001](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-001.md) AC1–3; [PREETS-SESSION-002](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-002.md) AC1–3; [PREETS-SESSION-003](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-003.md) AC1–3; [PREETS-SESSION-004](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-004.md) AC1–2; [PREETS-SESSION-005](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-005.md) AC1–4. SESSION-004 AC1 expired-entry freshness awaits [S6](https://github.com/PathableAI-org/Pre-ETS/issues/158); AC2 recovery composition awaits [S5](https://github.com/PathableAI-org/Pre-ETS/issues/157).
>
> ## In scope
>
> Build tenant-specific OIDC initiation, transaction/callback validation, authenticated session establishment,
> and request-session enforcement against [S2](https://github.com/PathableAI-org/Pre-ETS/issues/153). Establish vendor-agnostic server-only secret lookup when the integration
> needs credentials; tenant files contain non-secret settings/lookup keys only. Protect pages, route handlers, and
> Server Actions by default, including direct requests and new resources. Preserve the callback, sign-in error,
> `/_test`, recovery-content, and safe public-asset exceptions; diagnostics create no application session.
> Independently resolve the request tenant and enforce mismatch HTTP 403 without replacing that tenant with session
> identity. Preserve accepted tenant 404/500 outcomes. Build missing-session automatic tenant login and valid-session
> joining, then integrate expired new-tab/refresh/history entry with [S6](https://github.com/PathableAI-org/Pre-ETS/issues/158) freshness. Construct an actual protected
> Server Action and its browser consumer before [S5](https://github.com/PathableAI-org/Pre-ETS/issues/157)'s early recovery increment needs them; the operation must provide
> observable side-effect denial without introducing a new domain workflow.
>
> ## Out of scope
>
> Backend/domain persistence and API expiration-response policy, a new absolute maximum-lifetime policy,
> concrete cloud provider/ingress, CI cadence, arbitrary application-value storage, and undecided policy.
> Heartbeat/connection-loss input behavior belongs to a separate pending requirement.
>
> ## Dependencies
>
> Start: [S2](https://github.com/PathableAI-org/Pre-ETS/issues/153)'s public-service/store increment and the delivered tenant boundaries associated with closed
> [#117](https://github.com/PathableAI-org/Pre-ETS/issues/117)/#119. Preserve [#118](https://github.com/PathableAI-org/Pre-ETS/issues/118) failure mappings as an integration gate. [S6](https://github.com/PathableAI-org/Pre-ETS/issues/158) freshness design/implementation proceeds
> alongside construction; it is not a reverse blanket start dependency. [S5](https://github.com/PathableAI-org/Pre-ETS/issues/157) Server Action recovery and [S6](https://github.com/PathableAI-org/Pre-ETS/issues/158) verified
> expired-entry freshness are shipping gates. [S1](https://github.com/PathableAI-org/Pre-ETS/issues/154)'s valid/missing-session increment does not depend on [S3](https://github.com/PathableAI-org/Pre-ETS/issues/155).
>
> ## Completion evidence
>
> **Observable increment:** Actual tenant-provider login establishes identity used by a protected request; valid, absent, and mismatched
> sessions have observable HTTP outcomes. Authenticate through app instance A and recognize its identity through
> independently running instance B without affinity.
>
> **Evidence progression:** Establish and retain real OIDC, callback, default-protection, protected-action, and multi-instance HTTP
> fixtures; prepared records are limited to denial/isolation scenarios. Extend [S2](https://github.com/PathableAI-org/Pre-ETS/issues/153)'s store evidence into real app
> composition, including renewal on A and expiry enforcement on B. [S5](https://github.com/PathableAI-org/Pre-ETS/issues/157) adds HTTP 401 recovery to the same action
> consumer; [S6](https://github.com/PathableAI-org/Pre-ETS/issues/158) adds freshness with existing SSO and removed old records. Final SESSION-004 recovery composition
> and freshness remain incomplete until those increments.
>
> HTTP/application evidence covers direct pages/handlers/actions, new-resource default protection, public
> exceptions, diagnostic requests without session creation, forged context, rejected callbacks, and mismatch HTTP
> 403 plus forbidden presentation. Real OIDC completion establishes subsequent user/tenant identity; seeded records
> cannot establish login. Browser evidence distinguishes valid-session joining from missing/expired entry and tests
> history restoration. Public-asset assessment and preserved configuration secrecy remain explicit checks; diagnostic
> safety and production ingress require their separate evidence.
>
> Record executed revision, conditions, and limitations; issue closure does not establish requirement verification.
>
> ## Delivery plan
>
> [Approved baseline S1](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/delivery/session-management.md#s1--protect-application-entry-points-and-bind-tenant-authentication).
> This proposed sequencing revision requires renewed approval and repinning before publication.

**Delivery references:** https://github.com/PathableAI-org/Pre-ETS/issues/154

### S2 — Share session identity and authoritative idle state across instances

The maintainer-authorized [seven PR steps](session-management-s2-steps.md) record the 2026-10-17 subdivision
under #153, including coordinated S1 authentication work and verified publication identities. The supplement
preserves this plan's prior approval history and remains draft pending repository review.

**Outcome:** Share session identity and authoritative idle state across instances.

**Coverage:** [PREETS-SESSION-006](../requirements/session/PREETS-SESSION-006.md) AC1–3; [PREETS-SESSION-008](../requirements/session/PREETS-SESSION-008.md) AC1–5. SESSION-006 AC2–3 and protected enforcement in SESSION-008 await S1 application composition; browser claims await S3–S5.

**Included:** Build the public session service, distributed adapter, session-record/cookie-facing contract needed by S1,
and authoritative initialization, read, renewal, expiration, and invalidation capabilities needed by S3/S5.
Implement timeout configuration (whole minutes 5–30; omitted default 30; reject invalid explicit values) and the
warning-policy data/validation needed at each authoritative timer refresh. Adopt the then-effective tenant policy
on qualifying refresh, preserve the established deadline until then, and never revive a session at/after that
deadline, including after a timeout increase. Distinguish qualifying requests from automatic polling/status traffic.
Provide shared user/tenant identity without arbitrary value operations. Build new service/adapter evidence;
no current Redis/session adapter, absolute-expiry implementation, or legacy record parser is assumed.

**Excluded:** The common delivery exclusions above apply. Preserve accepted tenant/security constraints and
workspace ownership; no new domain workflow, framework, generic verification issue, or unresolved policy is added.

**Dependencies:** Start: accepted B3/B4 contracts; no S1 or browser prerequisite for service/real-store work. Coordinate B6
removed-state recognition with S6 before committing the affected state-removal and identity contracts. S1 supplies
later real OIDC/two-app-instance evidence; S3 supplies browser activity, S4 warning presentation, and S5 recovery.
Those are completion/shipping qualifications, not blanket S2 start dependencies.

**Observable increment:** Independent clients of the real distributed adapter retrieve the same identity and honor authoritative
renewal/expiry and invalidation. Public-service calls expose accepted configuration and deadline behavior.

**Evidence progression:** Establish and retain configuration/deadline examples and useful public-service properties plus real-adapter
race/outage scenarios. Prepared records support service/adapter claims only. S1 extends them through independently
running applications; S3–S5 extend activity and presentation. S2 alone does not complete SESSION-006 AC2–3 or
SESSION-008 protected HTTP/browser enforcement.

**Planned evidence:** Observe before/equal/after-deadline behavior, excluded traffic, concurrent renewal/expiration, invalidation,
and enforcement independent of browser timers. Change timeout/warning configuration between refreshes: unrefreshed
sessions retain their established policy/deadline; qualifying refreshes adopt current settings; sessions need not
change simultaneously. Reject invalid timeout and warning configuration through the real tenant consumer without
fallback. Real-store evidence does not establish multi-process authentication or browser coordination.

**Proposed issue revision:** Share session identity and authoritative idle state across instances — retain [#153](https://github.com/PathableAI-org/Pre-ETS/issues/153).
The existing body remains approved at PR #185; the following is a draft revision for later reconciliation.

> ## Outcome
>
> Share session identity and authoritative idle state across instances.
>
> ## Requirements
>
> [PREETS-SESSION-006](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-006.md) AC1–3; [PREETS-SESSION-008](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-008.md) AC1–5. SESSION-006 AC2–3 and protected enforcement in SESSION-008 await [S1](https://github.com/PathableAI-org/Pre-ETS/issues/154) application composition; browser claims await [S3](https://github.com/PathableAI-org/Pre-ETS/issues/155)–[S5](https://github.com/PathableAI-org/Pre-ETS/issues/157).
>
> ## In scope
>
> Build the public session service, distributed adapter, session-record/cookie-facing contract needed by [S1](https://github.com/PathableAI-org/Pre-ETS/issues/154),
> and authoritative initialization, read, renewal, expiration, and invalidation capabilities needed by S3/S5.
> Implement timeout configuration (whole minutes 5–30; omitted default 30; reject invalid explicit values) and the
> warning-policy data/validation needed at each authoritative timer refresh. Adopt the then-effective tenant policy
> on qualifying refresh, preserve the established deadline until then, and never revive a session at/after that
> deadline, including after a timeout increase. Distinguish qualifying requests from automatic polling/status traffic.
> Provide shared user/tenant identity without arbitrary value operations. Build new service/adapter evidence;
> no current Redis/session adapter, absolute-expiry implementation, or legacy record parser is assumed.
>
> ## Out of scope
>
> Backend/domain persistence and API expiration-response policy, a new absolute maximum-lifetime policy,
> concrete cloud provider/ingress, CI cadence, arbitrary application-value storage, and undecided policy.
> Heartbeat/connection-loss input behavior belongs to a separate pending requirement.
>
> ## Dependencies
>
> Start: accepted B3/B4 contracts; no [S1](https://github.com/PathableAI-org/Pre-ETS/issues/154) or browser prerequisite for service/real-store work. Coordinate B6
> removed-state recognition with [S6](https://github.com/PathableAI-org/Pre-ETS/issues/158) before committing the affected state-removal and identity contracts. [S1](https://github.com/PathableAI-org/Pre-ETS/issues/154) supplies
> later real OIDC/two-app-instance evidence; [S3](https://github.com/PathableAI-org/Pre-ETS/issues/155) supplies browser activity, [S4](https://github.com/PathableAI-org/Pre-ETS/issues/156) warning presentation, and [S5](https://github.com/PathableAI-org/Pre-ETS/issues/157) recovery.
> Those are completion/shipping qualifications, not blanket [S2](https://github.com/PathableAI-org/Pre-ETS/issues/153) start dependencies.
>
> ## Completion evidence
>
> **Observable increment:** Independent clients of the real distributed adapter retrieve the same identity and honor authoritative
> renewal/expiry and invalidation. Public-service calls expose accepted configuration and deadline behavior.
>
> **Evidence progression:** Establish and retain configuration/deadline examples and useful public-service properties plus real-adapter
> race/outage scenarios. Prepared records support service/adapter claims only. [S1](https://github.com/PathableAI-org/Pre-ETS/issues/154) extends them through independently
> running applications; [S3](https://github.com/PathableAI-org/Pre-ETS/issues/155)–[S5](https://github.com/PathableAI-org/Pre-ETS/issues/157) extend activity and presentation. [S2](https://github.com/PathableAI-org/Pre-ETS/issues/153) alone does not complete SESSION-006 AC2–3 or
> SESSION-008 protected HTTP/browser enforcement.
>
> Observe before/equal/after-deadline behavior, excluded traffic, concurrent renewal/expiration, invalidation,
> and enforcement independent of browser timers. Change timeout/warning configuration between refreshes: unrefreshed
> sessions retain their established policy/deadline; qualifying refreshes adopt current settings; sessions need not
> change simultaneously. Reject invalid timeout and warning configuration through the real tenant consumer without
> fallback. Real-store evidence does not establish multi-process authentication or browser coordination.
>
> Record executed revision, conditions, and limitations; issue closure does not establish requirement verification.
>
> ## Delivery plan
>
> [Approved baseline S2](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/delivery/session-management.md#s2--share-session-identity-and-authoritative-idle-state-across-instances).
> This proposed sequencing revision requires renewed approval and repinning before publication.

**Delivery references:** https://github.com/PathableAI-org/Pre-ETS/issues/153

### S3 — Coordinate intentional activity and logout across session-sharing tabs

**Outcome:** Coordinate intentional activity and logout across session-sharing tabs.

**Coverage:** [PREETS-SESSION-009](../requirements/session/PREETS-SESSION-009.md) AC1–4; [PREETS-SESSION-010](../requirements/session/PREETS-SESSION-010.md) AC1–6. SESSION-010 AC4 and warning/continuation/expiration conditions of AC6 await S4/S5.

**Included:** Build browser activity communication and session-scoped coordination against S1/S2. Count deliberate
page fetches/form submissions and meaningful controls, typing, keyboard/touch interaction, and user-driven focus
changes; exclude raw movement, programmatic focus alone, and unrelated automatic traffic. Join the existing valid
session in new tabs, synchronize authoritative policy/deadlines, and invalidate shared authenticated access on
logout. Preserve isolation across tenants, sessions, and browser contexts. Compose warning and expired-state
presentation with S4 and S5; choose timing/resume behavior only after B5 resolution.

**Excluded:** The common delivery exclusions above apply. Preserve accepted tenant/security constraints and
workspace ownership; no new domain workflow, framework, generic verification issue, or unresolved policy is added.

**Dependencies:** Start: S1 authenticated entry/action consumer, S2 operations, and B5 for affected communication/synchronization
behavior. S5 Server Action recovery can proceed before S3; S5 browser protection follows this coordination increment.
S4/S5 complete SESSION-010 AC4 and warning/continuation/expiration conditions of AC6, not S3 start prerequisites.

**Observable increment:** Actual sharing tabs join one session, renew through qualifying controls, and lose protected access after
shared logout; other tenant/browser-context sessions remain independent.

**Evidence progression:** Establish and retain multi-page semantic-control fixtures, controllable time, real protected HTTP/actions,
and independent authenticated tenant/browser-context controls. At this increment exercise joining, activity,
logout, exclusions, and late-activity rejection. S5 extends the same fixtures with expiration/concealment before
S4 adds warnings/Continue. No synthetic authentication or disposable presentation suite establishes these claims.

**Planned evidence:** Application evidence distinguishes deliberate page fetches/submissions from automatic traffic. Browser
outcomes establish that activity in one tab keeps another usable beyond its former deadline, new tabs join identity,
and logout denies actual operations in every sharing tab. Observe other-session isolation and B5-approved suspended/
resumed behavior. An event or network call alone does not establish renewal; warning/expiration isolation awaits S4/S5.

**Proposed issue revision:** Coordinate intentional activity and logout across session-sharing tabs — retain [#155](https://github.com/PathableAI-org/Pre-ETS/issues/155).
The existing body remains approved at PR #185; the following is a draft revision for later reconciliation.

> ## Outcome
>
> Coordinate intentional activity and logout across session-sharing tabs.
>
> ## Requirements
>
> [PREETS-SESSION-009](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-009.md) AC1–4; [PREETS-SESSION-010](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-010.md) AC1–6. SESSION-010 AC4 and warning/continuation/expiration conditions of AC6 await S4/S5.
>
> ## In scope
>
> Build browser activity communication and session-scoped coordination against S1/S2. Count deliberate
> page fetches/form submissions and meaningful controls, typing, keyboard/touch interaction, and user-driven focus
> changes; exclude raw movement, programmatic focus alone, and unrelated automatic traffic. Join the existing valid
> session in new tabs, synchronize authoritative policy/deadlines, and invalidate shared authenticated access on
> logout. Preserve isolation across tenants, sessions, and browser contexts. Compose warning and expired-state
> presentation with [S4](https://github.com/PathableAI-org/Pre-ETS/issues/156) and [S5](https://github.com/PathableAI-org/Pre-ETS/issues/157); choose timing/resume behavior only after B5 resolution.
>
> ## Out of scope
>
> Backend/domain persistence and API expiration-response policy, a new absolute maximum-lifetime policy,
> concrete cloud provider/ingress, CI cadence, arbitrary application-value storage, and undecided policy.
> Heartbeat/connection-loss input behavior belongs to a separate pending requirement.
>
> ## Dependencies
>
> Start: [S1](https://github.com/PathableAI-org/Pre-ETS/issues/154) authenticated entry/action consumer, [S2](https://github.com/PathableAI-org/Pre-ETS/issues/153) operations, and B5 for affected communication/synchronization
> behavior. [S5](https://github.com/PathableAI-org/Pre-ETS/issues/157) Server Action recovery can proceed before [S3](https://github.com/PathableAI-org/Pre-ETS/issues/155); [S5](https://github.com/PathableAI-org/Pre-ETS/issues/157) browser protection follows this coordination increment.
> S4/S5 complete SESSION-010 AC4 and warning/continuation/expiration conditions of AC6, not [S3](https://github.com/PathableAI-org/Pre-ETS/issues/155) start prerequisites.
>
> ## Completion evidence
>
> **Observable increment:** Actual sharing tabs join one session, renew through qualifying controls, and lose protected access after
> shared logout; other tenant/browser-context sessions remain independent.
>
> **Evidence progression:** Establish and retain multi-page semantic-control fixtures, controllable time, real protected HTTP/actions,
> and independent authenticated tenant/browser-context controls. At this increment exercise joining, activity,
> logout, exclusions, and late-activity rejection. [S5](https://github.com/PathableAI-org/Pre-ETS/issues/157) extends the same fixtures with expiration/concealment before
> [S4](https://github.com/PathableAI-org/Pre-ETS/issues/156) adds warnings/Continue. No synthetic authentication or disposable presentation suite establishes these claims.
>
> Application evidence distinguishes deliberate page fetches/submissions from automatic traffic. Browser
> outcomes establish that activity in one tab keeps another usable beyond its former deadline, new tabs join identity,
> and logout denies actual operations in every sharing tab. Observe other-session isolation and B5-approved suspended/
> resumed behavior. An event or network call alone does not establish renewal; warning/expiration isolation awaits S4/S5.
>
> Record executed revision, conditions, and limitations; issue closure does not establish requirement verification.
>
> ## Delivery plan
>
> [Approved baseline S3](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/delivery/session-management.md#s3--coordinate-intentional-activity-and-logout-across-session-sharing-tabs).
> This proposed sequencing revision requires renewed approval and repinning before publication.

**Delivery references:** https://github.com/PathableAI-org/Pre-ETS/issues/155

### S4 — Warn before expiration and continue accessibly across tabs

**Outcome:** Warn before expiration and continue accessibly across tabs.

**Coverage:** [PREETS-SESSION-011](../requirements/session/PREETS-SESSION-011.md) AC1–5. Final expired presentation and fresh recovery require S5/S6.

**Included:** Build warning presentation against S2 policy/deadline data and S3 coordination. Omitted warning defaults
to a five-minute lead for idle intervals above five minutes and is disabled by default at five minutes; explicit 0
disables it at any permitted timeout. Nonzero settings are positive whole-minute leads below the effective timeout;
reject invalid tenant configuration without fallback. Show enabled blocking warnings in every sharing tab; Continue
renews via the server and dismisses warnings only on success. Reject late Continue. Provide announcement, focus
entry/containment, visible keyboard focus, blocked background interaction, and appropriate focus restoration.

**Excluded:** The common delivery exclusions above apply. Preserve accepted tenant/security constraints and
workspace ownership; no new domain workflow, framework, generic verification issue, or unresolved policy is added.

**Dependencies:** Start: S2 renewal/policy operations, S3 coordination, and affected B5 decisions. Prioritize S5 expiration
protection before this presentation increment; S5 is a final race/disabled-warning shipping gate rather than a
mandatory start dependency. S6 completes fresh recovery. Warning schema/default data are established in S2 so idle
refresh does not wait for S4 UI.

**Observable increment:** Sharing tabs display an enabled blocking warning; keyboard Continue renews the actual authoritative
deadline and dismisses sharing-tab warnings. Disabled warnings still lead to protected expiration and recovery.

**Evidence progression:** Extend S3/S5 retained tab/isolation and expiration/recovery journeys with warnings/Continue and assistive-
technology observations. Configuration evidence from S2 is extended with browser-policy adoption. Reuse S5 concealment
for late Continue and disabled-warning outcomes; if S4 merges first, those final claims stay explicit shipping gaps.

**Planned evidence:** Observe omitted defaults (including warning at 25 minutes for default 30-minute idle), default/explicit
disabling, invalid settings rejected at tenant consumption, policy changes adopted on individual refreshes, enabled
thresholds, cross-tab dismissal, authoritative renewal, and continuation races. Browser and assistive-technology
evidence establishes announcements, meaningful explanation/action, keyboard operation, and focus behavior. Dialog
strings alone do not establish usability or background protection.

**Proposed issue revision:** Warn before expiration and continue accessibly across tabs — retain [#156](https://github.com/PathableAI-org/Pre-ETS/issues/156).
The existing body remains approved at PR #185; the following is a draft revision for later reconciliation.

> ## Outcome
>
> Warn before expiration and continue accessibly across tabs.
>
> ## Requirements
>
> [PREETS-SESSION-011](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-011.md) AC1–5. Final expired presentation and fresh recovery require S5/S6.
>
> ## In scope
>
> Build warning presentation against [S2](https://github.com/PathableAI-org/Pre-ETS/issues/153) policy/deadline data and [S3](https://github.com/PathableAI-org/Pre-ETS/issues/155) coordination. Omitted warning defaults
> to a five-minute lead for idle intervals above five minutes and is disabled by default at five minutes; explicit 0
> disables it at any permitted timeout. Nonzero settings are positive whole-minute leads below the effective timeout;
> reject invalid tenant configuration without fallback. Show enabled blocking warnings in every sharing tab; Continue
> renews via the server and dismisses warnings only on success. Reject late Continue. Provide announcement, focus
> entry/containment, visible keyboard focus, blocked background interaction, and appropriate focus restoration.
>
> ## Out of scope
>
> Backend/domain persistence and API expiration-response policy, a new absolute maximum-lifetime policy,
> concrete cloud provider/ingress, CI cadence, arbitrary application-value storage, and undecided policy.
> Heartbeat/connection-loss input behavior belongs to a separate pending requirement.
>
> ## Dependencies
>
> Start: [S2](https://github.com/PathableAI-org/Pre-ETS/issues/153) renewal/policy operations, [S3](https://github.com/PathableAI-org/Pre-ETS/issues/155) coordination, and affected B5 decisions. Prioritize [S5](https://github.com/PathableAI-org/Pre-ETS/issues/157) expiration
> protection before this presentation increment; [S5](https://github.com/PathableAI-org/Pre-ETS/issues/157) is a final race/disabled-warning shipping gate rather than a
> mandatory start dependency. [S6](https://github.com/PathableAI-org/Pre-ETS/issues/158) completes fresh recovery. Warning schema/default data are established in [S2](https://github.com/PathableAI-org/Pre-ETS/issues/153) so idle
> refresh does not wait for [S4](https://github.com/PathableAI-org/Pre-ETS/issues/156) UI.
>
> ## Completion evidence
>
> **Observable increment:** Sharing tabs display an enabled blocking warning; keyboard Continue renews the actual authoritative
> deadline and dismisses sharing-tab warnings. Disabled warnings still lead to protected expiration and recovery.
>
> **Evidence progression:** Extend S3/S5 retained tab/isolation and expiration/recovery journeys with warnings/Continue and assistive-
> technology observations. Configuration evidence from [S2](https://github.com/PathableAI-org/Pre-ETS/issues/153) is extended with browser-policy adoption. Reuse [S5](https://github.com/PathableAI-org/Pre-ETS/issues/157) concealment
> for late Continue and disabled-warning outcomes; if [S4](https://github.com/PathableAI-org/Pre-ETS/issues/156) merges first, those final claims stay explicit shipping gaps.
>
> Observe omitted defaults (including warning at 25 minutes for default 30-minute idle), default/explicit
> disabling, invalid settings rejected at tenant consumption, policy changes adopted on individual refreshes, enabled
> thresholds, cross-tab dismissal, authoritative renewal, and continuation races. Browser and assistive-technology
> evidence establishes announcements, meaningful explanation/action, keyboard operation, and focus behavior. Dialog
> strings alone do not establish usability or background protection.
>
> Record executed revision, conditions, and limitations; issue closure does not establish requirement verification.
>
> ## Delivery plan
>
> [Approved baseline S4](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/delivery/session-management.md#s4--warn-before-expiration-and-continue-accessibly-across-tabs).
> This proposed sequencing revision requires renewed approval and repinning before publication.

**Delivery references:** https://github.com/PathableAI-org/Pre-ETS/issues/156

### S5 — Protect expired content and offer explicit accessible recovery

**Outcome:** Protect expired content and offer explicit accessible recovery.

**Coverage:** [PREETS-SESSION-007](../requirements/session/PREETS-SESSION-007.md) AC1–4; [PREETS-SESSION-012](../requirements/session/PREETS-SESSION-012.md) AC1–5. SESSION-007 AC1–4 belong to S5-A; SESSION-012 AC1–5 belong to S5-B. Fresh Login completion requires S6.

**Included:** Deliver two increments under the existing S5 identity. **S5-A — Server Action recovery:** compose S1's
real protected action/consumer with S2 classification; expired/missing-record requests return actual HTTP 401,
perform no protected operation, and expose no protected content. Display dedicated unauthenticated recovery with
an expiration explanation when known, otherwise session-unavailable meaning, and an explicit accessible Login
action; never start OIDC automatically. **S5-B — Browser expiration protection:** after S3, conceal previously
rendered protected information in every sharing tab and show a synchronized blocking expiration modal. Prevent
dismissal/bypass, in-page navigation, keyboard interaction, and assistive-technology reading/navigation of protected
background information. Its known-expiration meaning and explicit recovery match S5-A. Both Login paths use S1's
delivered authentication boundary and S6's fresh-auth capability; no legacy generic recovery is assumed.

**Excluded:** The common delivery exclusions above apply. Preserve accepted tenant/security constraints and
workspace ownership; no new domain workflow, framework, generic verification issue, or unresolved policy is added.

**Dependencies:** S5-A starts after S1's protected-action/authentication consumer and S2 classification; it does not wait
for S3 or B5 browser decisions. S5-B additionally needs S3 propagation and B5 synchronization/suspended-tab decisions.
S4 supplies additional late-Continue cases when available, not a blanket start prerequisite. S6 freshness is a
shipping gate for successful post-expiration Login on either path; partial denial/concealment increments remain
mergeable with that missing recovery claim explicitly recorded.

**Observable increment:** S5-A observes HTTP 401, zero protected side effects/content, and keyboard/assistive-technology recovery
without automatic OIDC. S5-B observes actual cross-tab concealment, blocked background access, and explicit modal recovery.

**Evidence progression:** Establish the S5-A action/recovery journey from S1's actual consumer before multi-tab work; retain HTTP
classification, accessible recovery, and known/unknown-cause cases. S5-B extends S3's tab/isolation fixtures with
concealment/bypass/focus and compares modal meaning with S5-A. S6 extends the same Login journeys through fresh
provider authentication and cancelled/failed/stale outcomes. An incomplete freshness journey cannot ship as final recovery.

**Planned evidence:** Actual Server Action HTTP and application/browser evidence establishes 401, denied side effects, absence
of protected content, removed-record handling, and accessible explanation/Login without automatic OIDC. Browser and
assistive-technology observations separately establish unreadable protected background content, announcement, focus,
keyboard recovery, isolation, and approved resume protection. New-tab/refresh/history evidence follows S1/S6 fresh
entry; server-only denial or modal strings cannot establish concealment. Extend races when S4 Continue is available.

**Proposed issue revision:** Protect expired content and offer explicit accessible recovery — retain [#157](https://github.com/PathableAI-org/Pre-ETS/issues/157).
The existing body remains approved at PR #185; the following is a draft revision for later reconciliation.

> ## Outcome
>
> Protect expired content and offer explicit accessible recovery.
>
> ## Requirements
>
> [PREETS-SESSION-007](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-007.md) AC1–4; [PREETS-SESSION-012](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-012.md) AC1–5. SESSION-007 AC1–4 belong to S5-A; SESSION-012 AC1–5 belong to S5-B. Fresh Login completion requires [S6](https://github.com/PathableAI-org/Pre-ETS/issues/158).
>
> ## In scope
>
> Deliver two increments under the existing [S5](https://github.com/PathableAI-org/Pre-ETS/issues/157) identity. **S5-A — Server Action recovery:** compose [S1](https://github.com/PathableAI-org/Pre-ETS/issues/154)'s
> real protected action/consumer with [S2](https://github.com/PathableAI-org/Pre-ETS/issues/153) classification; expired/missing-record requests return actual HTTP 401,
> perform no protected operation, and expose no protected content. Display dedicated unauthenticated recovery with
> an expiration explanation when known, otherwise session-unavailable meaning, and an explicit accessible Login
> action; never start OIDC automatically. **S5-B — Browser expiration protection:** after [S3](https://github.com/PathableAI-org/Pre-ETS/issues/155), conceal previously
> rendered protected information in every sharing tab and show a synchronized blocking expiration modal. Prevent
> dismissal/bypass, in-page navigation, keyboard interaction, and assistive-technology reading/navigation of protected
> background information. Its known-expiration meaning and explicit recovery match S5-A. Both Login paths use [S1](https://github.com/PathableAI-org/Pre-ETS/issues/154)'s
> delivered authentication boundary and [S6](https://github.com/PathableAI-org/Pre-ETS/issues/158)'s fresh-auth capability; no legacy generic recovery is assumed.
>
> ## Out of scope
>
> Backend/domain persistence and API expiration-response policy, a new absolute maximum-lifetime policy,
> concrete cloud provider/ingress, CI cadence, arbitrary application-value storage, and undecided policy.
> Heartbeat/connection-loss input behavior belongs to a separate pending requirement.
>
> ## Dependencies
>
> S5-A starts after [S1](https://github.com/PathableAI-org/Pre-ETS/issues/154)'s protected-action/authentication consumer and [S2](https://github.com/PathableAI-org/Pre-ETS/issues/153) classification; it does not wait
> for [S3](https://github.com/PathableAI-org/Pre-ETS/issues/155) or B5 browser decisions. S5-B additionally needs [S3](https://github.com/PathableAI-org/Pre-ETS/issues/155) propagation and B5 synchronization/suspended-tab decisions.
> [S4](https://github.com/PathableAI-org/Pre-ETS/issues/156) supplies additional late-Continue cases when available, not a blanket start prerequisite. [S6](https://github.com/PathableAI-org/Pre-ETS/issues/158) freshness is a
> shipping gate for successful post-expiration Login on either path; partial denial/concealment increments remain
> mergeable with that missing recovery claim explicitly recorded.
>
> ## Completion evidence
>
> **Observable increment:** S5-A observes HTTP 401, zero protected side effects/content, and keyboard/assistive-technology recovery
> without automatic OIDC. S5-B observes actual cross-tab concealment, blocked background access, and explicit modal recovery.
>
> **Evidence progression:** Establish the S5-A action/recovery journey from [S1](https://github.com/PathableAI-org/Pre-ETS/issues/154)'s actual consumer before multi-tab work; retain HTTP
> classification, accessible recovery, and known/unknown-cause cases. S5-B extends [S3](https://github.com/PathableAI-org/Pre-ETS/issues/155)'s tab/isolation fixtures with
> concealment/bypass/focus and compares modal meaning with S5-A. [S6](https://github.com/PathableAI-org/Pre-ETS/issues/158) extends the same Login journeys through fresh
> provider authentication and cancelled/failed/stale outcomes. An incomplete freshness journey cannot ship as final recovery.
>
> Actual Server Action HTTP and application/browser evidence establishes 401, denied side effects, absence
> of protected content, removed-record handling, and accessible explanation/Login without automatic OIDC. Browser and
> assistive-technology observations separately establish unreadable protected background content, announcement, focus,
> keyboard recovery, isolation, and approved resume protection. New-tab/refresh/history evidence follows S1/S6 fresh
> entry; server-only denial or modal strings cannot establish concealment. Extend races when [S4](https://github.com/PathableAI-org/Pre-ETS/issues/156) Continue is available.
>
> Record executed revision, conditions, and limitations; issue closure does not establish requirement verification.
>
> ## Delivery plan
>
> [Approved baseline S5](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/delivery/session-management.md#s5--protect-expired-content-and-offer-explicit-accessible-recovery).
> This proposed sequencing revision requires renewed approval and repinning before publication.

**Delivery references:** https://github.com/PathableAI-org/Pre-ETS/issues/157

### S6 — Complete fresh tenant OIDC recovery with a new session

**Outcome:** Complete fresh tenant OIDC recovery with a new session.

**Coverage:** [PREETS-SESSION-013](../requirements/session/PREETS-SESSION-013.md) AC1–5. SESSION-013 AC1–5 are aggregate across S6-A/B/C; freshness also completes SESSION-004 AC1 and S5 post-expiration Login.

**Included:** Deliver freshness in phases under S6. **S6-A — protocol/provider and recognition foundation:** resolve
B6 alongside S1/S2 design, then establish the selected request/response freshness contract, independent callback
validation, provider/broker support evidence, and prior-expiration recognition after old-state removal. Feed these
contracts into S1 initiation/callback construction and S2 state lifecycle before those choices are committed.
**S6-B — automatic expired entry:** integrate new-tab, refresh, and history entry with S1/S2, including removed old
records. **S6-C — explicit recovery:** extend S5-A recovery content and S5-B modal Login. Both completed paths
require a fresh provider event, establish a new user/tenant-bound session, and keep the old session unusable.
Existing SSO alone is insufficient; let the IdP choose its mechanism and deny cancelled/failed/stale/missing or
unconfirmed fresh authentication. No password-specific challenge or recognition-retention duration is adopted.

**Excluded:** The common delivery exclusions above apply. Preserve accepted tenant/security constraints and
workspace ownership; no new domain workflow, framework, generic verification issue, or unresolved policy is added.

**Dependencies:** B6 decisions precede affected freshness implementation. S6-A design/provider capability assessment can
start without S1/S2 or S5; callback/record integration proceeds alongside their construction after B6 resolution.
S6-B needs S1/S2 real application composition. S6-C needs the relevant S5-A/S5-B entry points. Those per-increment
prerequisites are not blanket native start blockers for S6. Both explicit and automatic paths must pass real-provider
freshness evidence before shipping; S1/S5 depend on that evidence as shipping gates, not reverse start dependencies.

**Observable increment:** S6-A establishes selected provider/request/response behavior and independently rejected stale/missing
freshness evidence. S6-B demonstrates fresh automatic expired entry; S6-C demonstrates fresh explicit Login through
actual recovery content/modals. Each completed path grants a new session while denying the old one.

**Evidence progression:** Establish provider/freshness and recognition fixtures early; retain validation, cancellation/failure, clock,
and removed-state examples as S1/S2 integration arrives. Extend S1 real OIDC/HTTP fixtures for S6-B, then S5 keyboard/
assistive-technology recovery journeys for S6-C. Early provider/service observations do not establish application
classification, browser recovery, or final SESSION-013 satisfaction; track each missing composition condition.

**Planned evidence:** Real-provider evidence with existing SSO establishes a fresh event, independent response evidence, new-session
protected access, and continued old-session denial for both paths. Include removed records, history restoration,
clock tolerances, provider/broker limitations, cancellation, failure, and stale/missing evidence after B6 decisions.
A redirect, new application session identifier, or mocked callback alone does not establish freshness.

**Proposed issue revision:** Complete fresh tenant OIDC recovery with a new session — retain [#158](https://github.com/PathableAI-org/Pre-ETS/issues/158).
The existing body remains approved at PR #185; the following is a draft revision for later reconciliation.

> ## Outcome
>
> Complete fresh tenant OIDC recovery with a new session.
>
> ## Requirements
>
> [PREETS-SESSION-013](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-013.md) AC1–5. SESSION-013 AC1–5 are aggregate across S6-A/B/C; freshness also completes SESSION-004 AC1 and [S5](https://github.com/PathableAI-org/Pre-ETS/issues/157) post-expiration Login.
>
> ## In scope
>
> Deliver freshness in phases under [S6](https://github.com/PathableAI-org/Pre-ETS/issues/158). **S6-A — protocol/provider and recognition foundation:** resolve
> B6 alongside S1/S2 design, then establish the selected request/response freshness contract, independent callback
> validation, provider/broker support evidence, and prior-expiration recognition after old-state removal. Feed these
> contracts into [S1](https://github.com/PathableAI-org/Pre-ETS/issues/154) initiation/callback construction and [S2](https://github.com/PathableAI-org/Pre-ETS/issues/153) state lifecycle before those choices are committed.
> **S6-B — automatic expired entry:** integrate new-tab, refresh, and history entry with S1/S2, including removed old
> records. **S6-C — explicit recovery:** extend S5-A recovery content and S5-B modal Login. Both completed paths
> require a fresh provider event, establish a new user/tenant-bound session, and keep the old session unusable.
> Existing SSO alone is insufficient; let the IdP choose its mechanism and deny cancelled/failed/stale/missing or
> unconfirmed fresh authentication. No password-specific challenge or recognition-retention duration is adopted.
>
> ## Out of scope
>
> Backend/domain persistence and API expiration-response policy, a new absolute maximum-lifetime policy,
> concrete cloud provider/ingress, CI cadence, arbitrary application-value storage, and undecided policy.
> Heartbeat/connection-loss input behavior belongs to a separate pending requirement.
>
> ## Dependencies
>
> B6 decisions precede affected freshness implementation. S6-A design/provider capability assessment can
> start without S1/S2 or [S5](https://github.com/PathableAI-org/Pre-ETS/issues/157); callback/record integration proceeds alongside their construction after B6 resolution.
> S6-B needs S1/S2 real application composition. S6-C needs the relevant S5-A/S5-B entry points. Those per-increment
> prerequisites are not blanket native start blockers for [S6](https://github.com/PathableAI-org/Pre-ETS/issues/158). Both explicit and automatic paths must pass real-provider
> freshness evidence before shipping; S1/S5 depend on that evidence as shipping gates, not reverse start dependencies.
>
> ## Completion evidence
>
> **Observable increment:** S6-A establishes selected provider/request/response behavior and independently rejected stale/missing
> freshness evidence. S6-B demonstrates fresh automatic expired entry; S6-C demonstrates fresh explicit Login through
> actual recovery content/modals. Each completed path grants a new session while denying the old one.
>
> **Evidence progression:** Establish provider/freshness and recognition fixtures early; retain validation, cancellation/failure, clock,
> and removed-state examples as S1/S2 integration arrives. Extend [S1](https://github.com/PathableAI-org/Pre-ETS/issues/154) real OIDC/HTTP fixtures for S6-B, then [S5](https://github.com/PathableAI-org/Pre-ETS/issues/157) keyboard/
> assistive-technology recovery journeys for S6-C. Early provider/service observations do not establish application
> classification, browser recovery, or final SESSION-013 satisfaction; track each missing composition condition.
>
> Real-provider evidence with existing SSO establishes a fresh event, independent response evidence, new-session
> protected access, and continued old-session denial for both paths. Include removed records, history restoration,
> clock tolerances, provider/broker limitations, cancellation, failure, and stale/missing evidence after B6 decisions.
> A redirect, new application session identifier, or mocked callback alone does not establish freshness.
>
> Record executed revision, conditions, and limitations; issue closure does not establish requirement verification.
>
> ## Delivery plan
>
> [Approved baseline S6](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/delivery/session-management.md#s6--complete-fresh-tenant-oidc-recovery-with-a-new-session).
> This proposed sequencing revision requires renewed approval and repinning before publication.

**Delivery references:** https://github.com/PathableAI-org/Pre-ETS/issues/158

**Parent delivery reference:** https://github.com/PathableAI-org/Pre-ETS/issues/152

## Cross-cutting concerns and issue structure

Keep parent #152 and the six existing children. Parent containment is organizational; phases within a slice do
not allocate new issue identities. Build evidence with each responsible increment; no separate generic testing slice.
Follow [Testing as evidence](../engineering/testing/README.md) and the requirements BDD skills during engineering.
Retain actual application consumers and fixtures as later slices extend them; prepared records do not prove login,
real-store clients do not prove independent application recognition, and HTTP denial does not prove concealment.

### Proposed execution and prerequisite changes

1. Resolve B6 provider/freshness/removed-state recognition design (S6-A) alongside S2 service/record and S1
   authentication design. B5 browser decisions can be resolved independently.
2. Build S2's service/real-store increment, then S1's real OIDC/default-protection and two-instance composition;
   integrate selected S6-A contracts as those boundaries are constructed.
3. Build S5-A Server Action HTTP 401 and explicit accessible recovery as soon as S1/S2 supply its actual consumer.
   S3 activity/joining/logout and S6-B automatic expired entry can proceed on their own stated prerequisites.
4. After S3/B5, prioritize S5-B content concealment and synchronized modal protection. Complete S6-C explicit
   recovery through each S5 entry point as it becomes available.
5. Extend the working expiration/recovery journeys with S4 warnings/Continue. S4 may start after S2/S3/B5 without
   waiting for S5-B, but final late-Continue and disabled-warning presentation must compose S5/S6 before shipping.

The proposed whole-issue start graph retains S1 blocked by S2/#117/#119, S3 by S1/S2, S4 by S2/S3, and S5 by
S1/S2. Remove the blanket S3 blocker from S5, because it applies only to S5-B. Remove the blanket S1/S2 blockers
from S6 so its foundation can start early; record their per-increment integration prerequisites in S6 instead.
B5 and B6 are decision gates, not fabricated issue identities. Do not add reverse S1/S5 → S6 start edges:
freshness completion is a shipping gate. These changes are proposals; the currently published native edges
remain unchanged and are recorded below.

### Compatibility, ownership, and shipping

Frontend owns tenant configuration, OIDC, transient sessions, and UI; backend owns domain authorization and durable
records. Later protected resources, including separately planned emergency access, must compose the accepted
session safeguards; this effort does not implement those workflows or broaden their authorization.

No existing session/absolute-deadline implementation is available to retain. Absolute maximum-lifetime policy
remains outside the accepted session scope. Before selecting rollout compatibility work, establish whether any
supported deployment actually retains legacy records/cookies or runs mixed versions. If evidence identifies such
a deployment, document its concrete read/write, upgrade, and rollback obligations; otherwise do not mandate the
historical dual-read/drain mechanism. This condition does not justify silently adopting an absolute-lifetime policy.
Update authentication/session/multi-tenancy implementation notes as real behavior is delivered.

Every intermediate increment names incomplete claims. Do not release protection without expired-entry classification
and verified freshness, or expiration UI with incomplete recovery. Final evidence includes tenant/session isolation,
no protected-content leakage, authoritative deadline races, shared-tab concealment, accessible recovery, and actual
fresh provider authentication for both automatic and explicit paths. Preserve diagnostic secrecy and independent
production ingress gates. No runtime verification is claimed by this plan revision.

**Proposed parent issue revision:** Deliver shared tenant authentication and accessible session recovery —
retain #152 and the six existing children. The current approved body remains the publication authority.

> ## Outcome
>
> Deliver shared tenant authentication and accessible session recovery across application instances and browser tabs,
> starting from the current tenant-only implementation.
>
> ## Requirements
>
> [PREETS-SESSION-001](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-001.md) AC1–3; [PREETS-SESSION-002](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-002.md) AC1–3; [PREETS-SESSION-003](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-003.md) AC1–3; [PREETS-SESSION-004](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-004.md) AC1–2; [PREETS-SESSION-005](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-005.md) AC1–4; [PREETS-SESSION-006](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-006.md) AC1–3; [PREETS-SESSION-007](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-007.md) AC1–4; [PREETS-SESSION-008](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-008.md) AC1–5; [PREETS-SESSION-009](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-009.md) AC1–4; [PREETS-SESSION-010](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-010.md) AC1–6; [PREETS-SESSION-011](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-011.md) AC1–5; [PREETS-SESSION-012](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-012.md) AC1–5; [PREETS-SESSION-013](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-013.md) AC1–5. All 52 criteria are accepted; this changed execution proposal still needs renewed approval.
>
> ## In scope
>
> Reconstruct distributed sessions and tenant-bound OIDC/default protection, then compose shared-tab activity/logout,
> expiration protection, warnings/Continue, and verified fresh provider authentication. Keep S1–S6 and existing issue
> identities. Establish their real service/application/browser observation boundaries as each increment is built.
>
> ## Out of scope
>
> Backend/domain persistence and API expiration-response policy, a new absolute maximum-lifetime policy, concrete
> cloud provider/ingress, CI cadence, arbitrary application-value storage, and undecided policy. Heartbeat and
> connection-loss input behavior belong to their separate pending requirement.
>
> ## Dependencies
>
> B1–B4 are resolved by PR #185; B5 browser timing/resume and B6 freshness/provider/recognition decisions remain.
> Start S6 foundation design alongside S2/S1 construction, then integrate automatic expired entry through S1/S2.
> S5 Server Action 401/recovery starts after S1/S2; its synchronized browser increment additionally needs S3/B5.
> Prioritize expiration protection before warning presentation; compose explicit fresh recovery as each S5 entry
> point is available. Integration/shipping gates are distinct from whole-issue start blockers and containment.
>
> ## Completion evidence
>
> Collect revision-attributable slice executions and limitations. Establish actual OIDC login, default-protected
> pages/handlers/actions, public exceptions, diagnostic requests without session creation, and independent tenant/
> session validation. Demonstrate shared identity/renewal/expiration through independently running app instances,
> qualifying activity and shared logout, actual Server Action HTTP 401 without protected effects/content or automatic
> OIDC, synchronized unreadable expired content, and accessible warning/continuation/recovery with isolation.
>
> Real-provider evidence with existing SSO establishes verified freshness for automatic expired entry and explicit
> Login, including removed old records after B6 decisions; history cannot restore usable expired protected content.
> Disabled warnings retain expiration/recovery. Document legacy rollout compatibility only if supported deployment
> state establishes a need. Historical helpers, passing static checks, and issue closure do not verify requirements.
>
> ## Delivery plan
>
> [Approved baseline plan](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/delivery/session-management.md).
> Repin this proposed revision after renewed approval and before separately authorized issue reconciliation.

## Coverage review

All 52 accepted criteria are accounted for below; no row represents executed evidence. SESSION-007 is allocated
to S5-A and SESSION-012 to S5-B. SESSION-013 remains aggregate across S6-A/B/C. Other aggregate integration
conditions remain explicit in each slice. Only the changed delivery sequencing awaits renewed approval.

| Requirement                                                         | AC | Disposition and slice                          | Planned evidence and remaining conditions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------- | -- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [PREETS-SESSION-001](../requirements/session/PREETS-SESSION-001.md) | 1  | Planned — S1; revised sequencing pending       | A request without valid authentication cannot obtain protected content from any protected frontend page, route handler, or Server Action, including `/`. Protection applies at each of these entry points, not only to navigation through another page. See S1 evidence and remaining gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [PREETS-SESSION-001](../requirements/session/PREETS-SESSION-001.md) | 2  | Planned — S1; revised sequencing pending       | Explicitly designated public resources include the OIDC callback, sign-in error page, all routes under `/_test`, and the dedicated expired/missing-session recovery content required by PREETS-SESSION-007. These resources and recovery content are available without authentication; this does not require a separate recovery page or a particular rendering mechanism. The callback must still validate authentication before establishing an authenticated session under PREETS-SESSION-003. Static assets needed to display unauthenticated pages may load without a session only when they contain no protected information. `GET /_test/tenant-config` does not create an application session. These exceptions do not bypass tenant resolution, the non-secret configuration requirement, or production ingress blocking under PREETS-TENANT-006, PREETS-SECURITY-001, and PREETS-INFRA-001. See S1 evidence and remaining gates. |
| [PREETS-SESSION-001](../requirements/session/PREETS-SESSION-001.md) | 3  | Planned — S1; revised sequencing pending       | Adding an application resource leaves it protected unless it is explicitly designated public. See S1 evidence and remaining gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| [PREETS-SESSION-002](../requirements/session/PREETS-SESSION-002.md) | 1  | Planned — S1; policy gates apply               | Tenant configuration contains enough non-secret OIDC integration settings and, when needed, server-only secret lookup keys to initiate and complete authentication under PREETS-SECURITY-001. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| [PREETS-SESSION-002](../requirements/session/PREETS-SESSION-002.md) | 2  | Planned — S1; policy gates apply               | Authentication uses the resolved tenant’s integration rather than another tenant’s configuration. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [PREETS-SESSION-002](../requirements/session/PREETS-SESSION-002.md) | 3  | Planned — S1; policy gates apply               | Users are directed to the identity provider for authentication; the application does not collect local username/password credentials. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [PREETS-SESSION-003](../requirements/session/PREETS-SESSION-003.md) | 1  | Planned — S1; policy gates apply               | Successful OIDC completion establishes a session bound to the authenticated user and authentication tenant. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [PREETS-SESSION-003](../requirements/session/PREETS-SESSION-003.md) | 2  | Planned — S1; policy gates apply               | Failed or rejected authentication does not establish an authenticated application session. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [PREETS-SESSION-003](../requirements/session/PREETS-SESSION-003.md) | 3  | Planned — S1; policy gates apply               | A subsequent protected request uses the established identity and tenant association. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [PREETS-SESSION-004](../requirements/session/PREETS-SESSION-004.md) | 1  | Planned — S1; revised sequencing pending       | A protected page request without an application session initiates the resolved tenant’s OIDC flow automatically. New-tab entry, existing-tab refresh, and browser back/forward navigation to a protected page with an expired session also start tenant OIDC directly rather than redirecting to the session-expired page. These post-expiration flows require fresh authentication and verified provider evidence under PREETS-SESSION-013; existing IdP SSO alone cannot satisfy them. Browser history must not restore usable protected content under an expired session. See S1 evidence and remaining gates.                                                                                                                                                                                                                                                                                                                          |
| [PREETS-SESSION-004](../requirements/session/PREETS-SESSION-004.md) | 2  | Planned — S1; revised sequencing pending       | Fresh entry does not replace the browser expiration modal required by PREETS-SESSION-012 or the expired- or missing-session Server Action recovery content required by PREETS-SESSION-007. See S1 evidence and remaining gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [PREETS-SESSION-005](../requirements/session/PREETS-SESSION-005.md) | 1  | Planned — S1; policy gates apply               | Matching request and session tenants permit tenant-binding validation to succeed, subject to other access checks. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [PREETS-SESSION-005](../requirements/session/PREETS-SESSION-005.md) | 2  | Planned — S1; policy gates apply               | Different request and session tenants forbid access and expose a 403 Forbidden page. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [PREETS-SESSION-005](../requirements/session/PREETS-SESSION-005.md) | 3  | Planned — S1; policy gates apply               | A valid session does not bypass request tenant resolution or substitute the session tenant for the tenant returned by that resolution. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [PREETS-SESSION-005](../requirements/session/PREETS-SESSION-005.md) | 4  | Planned — S1; policy gates apply               | Tenant/session comparison depends on the resolved tenant identity, without imposing a tenant resolution mode or mechanism. See S1 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [PREETS-SESSION-006](../requirements/session/PREETS-SESSION-006.md) | 1  | Planned — S2; revised sequencing pending       | Session state is held in distributed storage shared by application instances; requests can use that state through different instances without affinity to the instance that established it. See S2 evidence and remaining gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [PREETS-SESSION-006](../requirements/session/PREETS-SESSION-006.md) | 2  | Planned — S2; revised sequencing pending       | A session established on one instance is recognized with the same user and tenant state on another instance. See S2 evidence and remaining gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [PREETS-SESSION-006](../requirements/session/PREETS-SESSION-006.md) | 3  | Planned — S2; revised sequencing pending       | An activity update or expiration enforced by one instance is honored by another; requests need not return to the previous instance. See S2 evidence and remaining gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| [PREETS-SESSION-008](../requirements/session/PREETS-SESSION-008.md) | 1  | Planned — S2; revised sequencing pending       | Tenant idle timeout accepts whole minutes 5 through 30 inclusive and rejects explicit values outside that domain. An omitted setting yields an effective 30-minute idle timeout; invalid explicit values do not silently use the default. See S2 evidence and remaining gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| [PREETS-SESSION-008](../requirements/session/PREETS-SESSION-008.md) | 2  | Planned — S2; revised sequencing pending       | A new authenticated session has an idle expiration derived from the configured interval. See S2 evidence and remaining gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [PREETS-SESSION-008](../requirements/session/PREETS-SESSION-008.md) | 3  | Planned — S2; revised sequencing pending       | Before the currently authoritative expiration, receipt of an authenticated request representing qualifying activity refreshes expiration using the tenant’s effective configuration at that time. Timeout and warning policy changes take effect for that session on this refresh; existing sessions need not change simultaneously. See S2 evidence and remaining gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| [PREETS-SESSION-008](../requirements/session/PREETS-SESSION-008.md) | 4  | Planned — S2; revised sequencing pending       | At or after expiration, requests cannot revive the session or obtain protected access, even if browser timers are disabled. See S2 evidence and remaining gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [PREETS-SESSION-008](../requirements/session/PREETS-SESSION-008.md) | 5  | Planned — S2; revised sequencing pending       | Traffic not caused by qualifying user activity does not extend the idle deadline (see PREETS-SESSION-009). See S2 evidence and remaining gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [PREETS-SESSION-009](../requirements/session/PREETS-SESSION-009.md) | 1  | Planned — S3; revised sequencing pending       | Deliberate authenticated requests, including page fetching and form submission, plus intentional control activation, keyboard interaction, text entry, touch interaction, and user-driven focus changes involving meaningful application inputs must count as qualifying activity. When received by the server before expiration, this activity renews the still-valid session. Programmatic focus changes alone do not qualify. See S3 evidence and remaining gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| [PREETS-SESSION-009](../requirements/session/PREETS-SESSION-009.md) | 2  | Planned — S3; revised sequencing pending       | Raw pointer movement alone never renews the idle deadline. See S3 evidence and remaining gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [PREETS-SESSION-009](../requirements/session/PREETS-SESSION-009.md) | 3  | Planned — S3; revised sequencing pending       | Automatic polling or background traffic unrelated to qualifying activity never renews the idle deadline. See S3 evidence and remaining gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [PREETS-SESSION-009](../requirements/session/PREETS-SESSION-009.md) | 4  | Planned — S3; revised sequencing pending       | Qualifying activity communicated after expiration does not revive authenticated access. See S3 evidence and remaining gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [PREETS-SESSION-010](../requirements/session/PREETS-SESSION-010.md) | 1  | Planned — S3; policy gates apply               | All concurrent application tabs for the same resolved tenant in the same browser context use the same application session and common idle state. See S3 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| [PREETS-SESSION-010](../requirements/session/PREETS-SESSION-010.md) | 2  | Planned — S3; policy gates apply               | Opening a new application tab when a session already exists joins that session rather than establishing an independent session. See S3 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| [PREETS-SESSION-010](../requirements/session/PREETS-SESSION-010.md) | 3  | Planned — S3; policy gates apply               | Qualifying activity in one tab renews authoritative expiration and prevents another inactive tab from independently expiring the still-active session. See S3 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [PREETS-SESSION-010](../requirements/session/PREETS-SESSION-010.md) | 4  | Planned — S3; policy gates apply               | Warning and expired states propagate across tabs as required by PREETS-SESSION-011 and PREETS-SESSION-012. See S3 evidence and its policy gates. S4 supplies warning and S5 expiration; S3 alone is partial.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [PREETS-SESSION-010](../requirements/session/PREETS-SESSION-010.md) | 5  | Planned — S3; policy gates apply               | Logging out in any tab ends authenticated access for the shared session and logs out every tab sharing it; no other tab can continue protected use under the logged-out session. See S3 evidence and its policy gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| [PREETS-SESSION-010](../requirements/session/PREETS-SESSION-010.md) | 6  | Planned — S3; policy gates apply               | Activity, continuation, warnings, expiration, and logout affect only the associated session. They must not renew, warn, expire, or log out a different session, including sessions for another resolved tenant or in another browser context. See S3 evidence and its policy gates. Exercise all five operations with S4/S5; synchronization transport tests alone are partial.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [PREETS-SESSION-011](../requirements/session/PREETS-SESSION-011.md) | 1  | Planned — S4; revised sequencing pending       | The warning setting expresses minutes before idle expiration. An explicit `0` disables the warning at any permitted idle timeout. Any nonzero explicit value must be a positive integer strictly less than the effective tenant idle timeout; otherwise the server rejects the tenant configuration as invalid under PREETS-TENANT-004, without substituting the default. When warning configuration is omitted, an effective idle timeout greater than five minutes yields a warning five minutes before expiration; an effective five-minute timeout yields no warning. Disabled warnings do not disable authoritative expiration. See S4 evidence and remaining gates.                                                                                                                                                                                                                                                                  |
| [PREETS-SESSION-011](../requirements/session/PREETS-SESSION-011.md) | 2  | Planned — S4; revised sequencing pending       | When the warning is enabled, all open tabs sharing the session display the blocking warning at its threshold. A server refresh of the authoritative session timer adopts the tenant’s effective warning policy at that time; sharing tabs use the policy and deadline associated with that refresh. Configuration changes need not affect all sessions simultaneously. See S4 evidence and remaining gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [PREETS-SESSION-011](../requirements/session/PREETS-SESSION-011.md) | 3  | Planned — S4; revised sequencing pending       | Activating Continue or Keep working before expiration constitutes qualifying activity, renews the authoritative deadline, and dismisses warnings across the other tabs. See S4 evidence and remaining gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [PREETS-SESSION-011](../requirements/session/PREETS-SESSION-011.md) | 4  | Planned — S4; revised sequencing pending       | A continuation reaching the server at or after expiration cannot restore the expired session. See S4 evidence and remaining gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| [PREETS-SESSION-011](../requirements/session/PREETS-SESSION-011.md) | 5  | Planned — S4; revised sequencing pending       | Assistive-technology users receive an announcement of the warning and can perceive its explanation and Continue action. Focus moves into the warning when it opens; keyboard users can activate Continue with visible focus. While the warning is blocking, focus and interaction cannot reach background application content. After successful continuation, focus returns to an appropriate application control. See S4 evidence and remaining gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [PREETS-SESSION-007](../requirements/session/PREETS-SESSION-007.md) | 1  | Planned — S5-A; revised sequencing pending     | A protected Server Action encountering an expired session or missing session record returns actual HTTP 401, does not execute its protected operation, and displays dedicated unauthenticated recovery content without automatically initiating OIDC. An HTTP redirect is not required. See S5-A HTTP/application and accessibility evidence; no S3/B5 start prerequisite. S6-C completes fresh Login.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| [PREETS-SESSION-007](../requirements/session/PREETS-SESSION-007.md) | 2  | Planned — S5-A; revised sequencing pending     | The recovery content is available without authentication, explains expiration when known or that the session is no longer available when its cause is unknown, and provides an explicit Login action. See S5-A HTTP/application and accessibility evidence; no S3/B5 start prerequisite. S6-C completes fresh Login.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [PREETS-SESSION-007](../requirements/session/PREETS-SESSION-007.md) | 3  | Planned — S5-A; revised sequencing pending     | Protected content is not returned or exposed in the expired- or missing-session recovery response. See S5-A HTTP/application and accessibility evidence; no S3/B5 start prerequisite. S6-C completes fresh Login.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [PREETS-SESSION-007](../requirements/session/PREETS-SESSION-007.md) | 4  | Planned — S5-A; revised sequencing pending     | Keyboard and assistive-technology users can perceive the expiration explanation, locate the authenticate-again action, and activate it with visible focus and appropriate focus movement. See S5-A HTTP/application and accessibility evidence; no S3/B5 start prerequisite. S6-C completes fresh Login.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| [PREETS-SESSION-012](../requirements/session/PREETS-SESSION-012.md) | 1  | Planned — S5-B; revised sequencing pending     | At expiration, protected information already rendered in every session-sharing tab is no longer readable. See S5-B browser evidence and B5; fresh recovery completes in S6-C.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [PREETS-SESSION-012](../requirements/session/PREETS-SESSION-012.md) | 2  | Planned — S5-B; revised sequencing pending     | The blocking expiration modal explains expiration and offers explicit authentication again; protected information cannot be exposed by dismissing or bypassing the modal. In-page navigation is unavailable while the modal is active. Existing-tab refresh and browser back/forward navigation follow PREETS-SESSION-004’s fresh-entry policy. See S5-B browser evidence and B5; fresh recovery completes in S6-C.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| [PREETS-SESSION-012](../requirements/session/PREETS-SESSION-012.md) | 3  | Planned — S5-B; revised sequencing pending     | Expired state propagates across session-sharing tabs. See S5-B browser evidence and B5; fresh recovery completes in S6-C.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| [PREETS-SESSION-012](../requirements/session/PREETS-SESSION-012.md) | 4  | Planned — S5-B; revised sequencing pending     | The modal shown in an already-open authenticated tab and PREETS-SESSION-007’s recovery content displayed after a protected Server Action encounters expiration convey equivalent expiration explanations and explicit recovery actions. See S5-B browser evidence and B5; fresh recovery completes in S6-C.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [PREETS-SESSION-012](../requirements/session/PREETS-SESSION-012.md) | 5  | Planned — S5-B; revised sequencing pending     | Assistive-technology users receive an announcement of expiration and can perceive its explanation and authenticate-again action. Focus moves into the modal; keyboard users can activate reauthentication with visible focus. Protected background information is unavailable to keyboard interaction and assistive-technology reading or navigation while the expired state remains. See S5-B browser evidence and B5; fresh recovery completes in S6-C.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| [PREETS-SESSION-013](../requirements/session/PREETS-SESSION-013.md) | 1  | Planned — S6-A/B/C; revised sequencing pending | Explicit recovery and automatic fresh entry after expiration initiate tenant OIDC authentication; successful fresh authentication establishes a new application session bound to the authenticated user and tenant. S6-A foundation precedes affected S1/S2 choices; S6-B automatic and S6-C explicit recovery complete the application/provider claim after B6 resolution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [PREETS-SESSION-013](../requirements/session/PREETS-SESSION-013.md) | 2  | Planned — S6-A/B/C; revised sequencing pending | The old application session cannot be renewed or reused for protected access. S6-A foundation precedes affected S1/S2 choices; S6-B automatic and S6-C explicit recovery complete the application/provider claim after B6 resolution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| [PREETS-SESSION-013](../requirements/session/PREETS-SESSION-013.md) | 3  | Planned — S6-A/B/C; revised sequencing pending | An existing IdP/SSO session alone cannot silently satisfy either explicit recovery or automatic fresh entry after expiration: the application requests fresh authentication and verifies protocol evidence that a fresh event occurred. S6-A foundation precedes affected S1/S2 choices; S6-B automatic and S6-C explicit recovery complete the application/provider claim after B6 resolution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [PREETS-SESSION-013](../requirements/session/PREETS-SESSION-013.md) | 4  | Planned — S6-A/B/C; revised sequencing pending | The IdP chooses the authentication mechanism; entering a password is not required by this contract. S6-A foundation precedes affected S1/S2 choices; S6-B automatic and S6-C explicit recovery complete the application/provider claim after B6 resolution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [PREETS-SESSION-013](../requirements/session/PREETS-SESSION-013.md) | 5  | Planned — S6-A/B/C; revised sequencing pending | Cancelled, failed, or unconfirmed fresh authentication leaves protected access unavailable. S6-A foundation precedes affected S1/S2 choices; S6-B automatic and S6-C explicit recovery complete the application/provider claim after B6 resolution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Review and planning gaps

The six outcomes and all accepted criteria are retained. Confirmed baseline corrections are explicit reconstruction,
early Server Action recovery, early freshness/recognition design, expiration-first presentation priority, and
conditional deployed-state compatibility. S5-A and S6-A now have useful observation boundaries before browser
coordination/recovery exists; later increments extend their retained evidence. No unexplained AC deferrals remain.

B5 timing/resume and B6 protocol/provider/recognition decisions remain unresolved. Heartbeat/connection-loss input
scope remains deferred to its separate pending requirement. Current tenant boundaries and closed issues supply
context, not session satisfaction. Open PR diffs, external planning, and deployed legacy state were not assessed.
No behavioral execution or requirement-to-evidence relationship is authorized by these document changes.

PR #185 already approved the policy refinements and prior decomposition. This 2026-10-13 change remains draft
pending renewed PR review; historical approvals do not approve its new phase/prerequisite choices. All published
issue identities are preserved. This request authorizes the plan PR; no issue bodies or native relationships are
changed. Later issue reconciliation needs the approved revision and explicit publication authorization.

## Publication history and current inspection

### Reconciliation after PR #185 (2026-10-12)

**Approved revision:** `cddbb741e73af8b79cdc699101c08770ddb56096` ([PR #185](https://github.com/PathableAI-org/Pre-ETS/pull/185), merged).
**Authorization/history:** Maintainer requested revision of existing issues after that merge. Parent #152 and
S1–S6 (#154/#153/#155/#156/#157/#158) were reconciled in place, with all seven bodies pinned to PR #185.
B1–B4 were resolved; B5/B6 and all evidence limitations remained. Six native containment edges and twelve
start-prerequisite edges were verified; the former S6 blocked-by-S5 edge was removed. These are historical
publication results, not approval of the 2026-10-13 proposal.

**Read-back on 2026-10-13:** All seven identities remain open. The inspected bodies retain PR #185 scope;
current blocking edges are:

| Slice     | Current native start blockers           |
| --------- | --------------------------------------- |
| S1 (#154) | S2 (#153), #117 (closed), #119 (closed) |
| S2 (#153) | None                                    |
| S3 (#155) | S2 (#153), S1 (#154)                    |
| S4 (#156) | S2 (#153), S3 (#155)                    |
| S5 (#157) | S1 (#154), S2 (#153), S3 (#155)         |
| S6 (#158) | S1 (#154), S2 (#153)                    |

**Proposal reconciliation:** Not performed. The proposed S5/S6 phase prerequisites differ from those current
edges; retain the live mapping until renewed approval and separately authorized publication. No issue was
created, closed, replaced, or rewritten by this plan update.

### Original publication record (2026-10-09)

The following is the preserved original snapshot. Its statuses, thirteen blocking edges, and B1–B6 language
record that publication date; the PR #185 reconciliation above supersedes its current-scope and edge claims.

**Inspection date:** 2026-10-09
**Approved publication revision:** `0e0b58b7d7db196dac1a8f71e3c2f8d27dbc12bf` ([PR #151](https://github.com/PathableAI-org/Pre-ETS/pull/151), merged into remote `main`).
**Authorization:** Maintainer requested issue creation for this plan on 2026-10-09.
**Assessment:** Complete verified publication; all seven identities issued.

- parent: https://github.com/PathableAI-org/Pre-ETS/issues/152 — open; created.
- S2: https://github.com/PathableAI-org/Pre-ETS/issues/153 — open; created.
- S1: https://github.com/PathableAI-org/Pre-ETS/issues/154 — open; created.
- S3: https://github.com/PathableAI-org/Pre-ETS/issues/155 — open; created.
- S4: https://github.com/PathableAI-org/Pre-ETS/issues/156 — open; created.
- S5: https://github.com/PathableAI-org/Pre-ETS/issues/157 — open; created.
- S6: https://github.com/PathableAI-org/Pre-ETS/issues/158 — open; created.

**Verified native relationships:**

- parent → S1 containment
- S1 blocked by S2
- S1 blocked by 117
- S1 blocked by 119
- parent → S2 containment
- parent → S3 containment
- S3 blocked by S2
- S3 blocked by S1
- parent → S4 containment
- S4 blocked by S2
- S4 blocked by S3
- parent → S5 containment
- S5 blocked by S1
- S5 blocked by S2
- S5 blocked by S3
- parent → S6 containment
- S6 blocked by S1
- S6 blocked by S2
- S6 blocked by S5

**Outstanding relationships:** None.
**Last confirmed action:** All seven bodies, six containment edges and thirteen start-prerequisite edges verified.
**Failed or indeterminate action:** None.
**Deferred/unissued identities:** None within the adopted parent/S1–S6 decomposition. Preserve the approved out-of-scope deferrals and B1–B6 policy gates.
**Inspection limits:** All 15 existing open/closed issues inspected before creation; no session plan identities found. Requirement snapshot matches current remote main. Overlapping PRs and external planning are not assessed. No runtime verification performed.
**Local records:** Publication was initially recorded locally; the maintainer subsequently requested a PR to merge these records.

**Publication validation:** All published bodies and actual links read back; final parent read-back confirmed six open children and thirteen start-prerequisite edges. Initial checks were blocked by missing local dependencies; the follow-up PR installed the locked dependencies and passed `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm check:unused`, `pnpm format:check`, and `git diff --check`. These repository checks do not establish runtime requirement verification.
