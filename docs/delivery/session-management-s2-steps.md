# Session management S2 PR steps

**Status:** draft; explicit maintainer authorization to publish these seven steps on 2026-10-17.
**Baseline:** [PR #189 approved plan](https://github.com/PathableAI-org/Pre-ETS/blob/e206d165f0f30999220922f57a3f92549c15f4cc/docs/delivery/session-management.md).
**Inspection:** 2026-10-17; remote main `291f3060d900dd6b25a8869b650eac0341c4cf3a`; all 29 open/closed issues inspected; no matching children. No runtime evidence executed.

The maintainer requested all seven PR divisions as native children of #153. This explicitly authorized revision spans
existing S1 (#154) and S2 (#153) responsibilities. Retain #154 as the owner of comprehensive application integration and enforcement; these seven
children track execution and do not duplicate its completion claims. Prior plan approvals/publication remain intact.
This supplement remains draft pending repository PR review; direct publication authorization is recorded separately from
that review.

Parent: https://github.com/PathableAI-org/Pre-ETS/issues/153

## B6 decision update (2026-10-17)

Maintainer selected fresh provider authentication for every login without a valid application session,
including first-time visits and explicit recovery; valid sessions remain reusable. Recognizing prior expiry
is unnecessary solely to choose freshness, including after old session records disappear. No expiry-recognition
retention mechanism is required solely for that decision. This overrides the recognition-selection gate in
individual step descriptions below; freshness comparison/clock tolerance, provider/broker support, and unsupported-provider
handling remain B6 work. The request/evidence baseline below is selected. Steps B/C/D/E/G and #154/#158 must incorporate the uniform policy; real-provider evidence
must include first-time entry with existing SSO and no old record. Server Action and running-tab recovery entry
behavior remains unchanged. Requirement and plan refinements await repository PR review; no behavior is verified.

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

## Initiation/session boundary refinement (2026-10-18)

Maintainer direction during feature #216 planning: introduce a session-presence capability that reports no usable
session for this increment. The reference root entry checks it first and redirects to `/auth/login`; the login
route then resolves the request tenant before provider work. Remove eager request-tenant reads from the root and
its enclosing layout. Public diagnostics/previews keep their own applicable tenant checks. A future positive
session still requires independent request-tenant resolution and binding before protected access.

S2-B prepares a tenant-bound authorization attempt and demonstrates delegation only. Recoverable transaction
persistence, its browser correlation cookie, and Redis integration move together to S2-C (#217), which must save
context before redirecting and recover/consume it on return. No temporary in-memory store or speculative storage
interface is introduced in S2-B. S2-D (#218) continues to own authenticated application-session establishment.
This refines earlier S2-B wording that said it establishes the authentication transaction; keep the distinction
between preparing an attempt and completing a recoverable round trip explicit.

The [feature specification](../../specs/007-initiate-tenant-oidc/spec.md) and
[implementation plan](../../specs/007-initiate-tenant-oidc/plan.md) record the proposed design. Existing issue
identities/dependency graph and publication history are unchanged. This revision awaits PR review; live issue
bodies have not been republished and no behavior is claimed as executed.

## Steps

### S2-A — Complete tenant authentication and session configuration

**Requirements:**
[PREETS-SESSION-002](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-002.md)
AC1–3 (configuration prerequisite);
[PREETS-SESSION-008](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-008.md)
AC1;
[PREETS-SESSION-011](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-011.md)
AC1 and AC2 policy data only.

**Included:** Complete required non-secret OIDC configuration and server-only credential lookup references where needed.
Validate whole-minute idle timeout 5–30 inclusive, omitted default 30, and warning policy: omitted lead 5 for timeouts
above 5, omitted disabling at timeout 5, explicit 0 disables, other values positive whole minutes below effective
timeout. Reject invalid explicit settings without fallback; preserve tenant failure mappings and secret separation.

Ownership and handoff: Build the reusable tenant configuration/schema and server-only lookup contract that
initiation/session consumers need; #154 owns applying that configuration to the complete application authentication
integration.

**Evidence:** Actual tenant reads accept valid configuration/defaults and reject invalid explicit timeout/warning
settings without fallback. Verify non-secret configuration boundaries. Retain this tenant-consumer evidence for session
refresh and OIDC integration. This step does not establish login, session creation, or warning presentation.

**Start prerequisites:** None.

**Delivery reference:** https://github.com/PathableAI-org/Pre-ETS/issues/215 — open; native containment verified.

### S2-B — Initiate tenant OIDC authentication

**Requirements:**
[PREETS-SESSION-001](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-001.md)
AC1–3 (initiation/public-exception portion);
[PREETS-SESSION-002](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-002.md)
AC1–3 (initiation portion);
[PREETS-SESSION-004](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-004.md)
AC1 (missing-session initiation portion).

**Included:** Check the session-presence boundary (always no usable session in this increment), then redirect
the reference entry to the login route. That route resolves the tenant and prepares the provider authorization
request. Recoverable transaction persistence and its browser cookie are delivered with S2-C. Preserve callback, sign-in error, recovery content, all /_test routes, and
safe public-asset exceptions; diagnostics create no application session. Preserve tenant configuration failure behavior
and server-only secrets. This is the initiation increment; valid-session recognition and full default protection arrive
in S2-E.

Ownership and handoff: Build and demonstrate the reusable tenant OIDC initiation/transaction capability through a
reference entry path; #154 owns complete entry-point coverage and valid/missing-session application composition.

**Evidence:** Real HTTP requests produce the configured tenant-provider redirect and public exceptions remain accessible
without session creation. Retain the transaction/provider fixtures for callback and multi-instance authentication
evidence. No authenticated application access is granted by this increment; expired-entry freshness awaits B6/#158.

**Start prerequisites:** S2-A.

**Delivery reference:** https://github.com/PathableAI-org/Pre-ETS/issues/216 — open; native containment verified.

### S2-C — Validate the OIDC callback

**Requirements:**
[PREETS-SESSION-002](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-002.md)
AC1–3 (callback portion);
[PREETS-SESSION-003](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-003.md)
AC1–2 (validated identity prerequisite).

**Included:** Connect transaction persistence before the initiation redirect with browser correlation and atomic
recovery/consumption on callback, then validate the transaction and provider evidence to produce trusted
user/tenant identity. Reject invalid, failed, or mismatched callbacks. Retain independent tenant resolution and
server-only credential handling. Successful validation alone does not grant authenticated application access; S2-D
creates the application session. Coordinate affected freshness/callback choices with B6/#158 before commitment.

Ownership and handoff: Build and demonstrate reusable transaction/provider-response validation yielding trusted
user/tenant identity; #218 connects it to session creation through a reference callback consumer, and #154 owns complete
application callback/error/access integration.

**Evidence:** Exercise successful real provider exchange and rejected callbacks through the actual callback boundary.
Retain provider and transaction fixtures for session establishment. Mocked or prepared identities alone do not establish
real OIDC completion. Application session/protected access remains incomplete until S2-D/E.

**Start prerequisites:** S2-B.

**Delivery reference:** https://github.com/PathableAI-org/Pre-ETS/issues/217 — open; native containment verified.

### S2-D — Establish distributed application sessions

**Requirements:**
[PREETS-SESSION-006](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-006.md)
AC1 and AC2 (service/store portion);
[PREETS-SESSION-008](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-008.md)
AC2;
[PREETS-SESSION-003](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-003.md)
AC1–3 (session-establishment portion).

**Included:** Build the public session service and Redis adapter; initialize and retrieve shared user/tenant identity,
the authoritative idle deadline, and the effective warning policy associated with that initialization/refresh. Define
the session-record/cookie-facing contract and connect successful validated callbacks to session creation/cookie issuance
through a reference consumer. Failed authentication must not establish an authenticated application session.

The consumer contract must distinguish usable session identity/policy from no usable session and from a storage/service
failure. Absent, expired, or invalidated sessions cannot yield usable authenticated identity; a storage failure cannot
become successful access or silent replacement login/session creation. Expired/invalidation causes need only be exposed
when known: no tombstone, cause-retention duration, or separate missing-versus-expired representation is required solely
for this handoff. Give consumers the authoritative deadline and effective warning policy needed by #154/#155/#156/#157,
without arbitrary application-value operations or secrets.

Ownership: #153 builds and demonstrates these shared capabilities. #154 integrates the same service/cookie contract
throughout application authentication and protected entry points; it does not rebuild the adapter. Initialization/read
evidence is delivered here; #220 completes qualifying renewal/current-policy adoption and expiration race guarantees,
and #221 completes explicit invalidation/outage guarantees. Reference composition does not claim complete application
protection. B6's selected uniform freshness and max_age/auth_time baseline applies; its remaining comparison/clock and
provider-support gates precede affected implementation.

**Evidence:** Independent clients of the real adapter retrieve consistent user/tenant identity, authoritative initial
deadlines, and effective warning policy. Public-service observations establish usable/no-usable-session/store-failure
outcomes and non-disclosure of usable identity for unavailable sessions. Successful real validated callback establishes
a session through the reference consumer; rejected authentication does not.

Retain the service scenarios, real Redis fixture, and provider/callback harness for #219–#221 and #154. Handoff includes
the public operations/results, record/cookie contract, configuration assumptions, and revision-attributable execution
limits. #219 demonstrates reference cross-instance consumption; #154 owns comprehensive application entry-point
integration and its real HTTP evidence. #220/#221 complete the lifecycle guarantees named above. No #154 completion
evidence is required to close this construction increment; no application-wide or browser claim is established here.

Record executed revision, conditions, and limitations; issue closure does not establish requirement verification.

**Start prerequisites:** S2-A, S2-C.

**Delivery reference:** https://github.com/PathableAI-org/Pre-ETS/issues/218 — open; native containment verified.

### S2-E — Enforce sessions across application entry points

**Requirements:**
[PREETS-SESSION-001](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-001.md)
AC1–3 (shared enforcement/reference-consumer support only);
[PREETS-SESSION-003](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-003.md)
AC3 (reference consumption);
[PREETS-SESSION-004](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-004.md)
AC1–2 (reference valid/missing-session support only);
[PREETS-SESSION-005](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-005.md)
AC1–4 (shared independent-tenant/mismatch capability and reference evidence);
[PREETS-SESSION-006](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-006.md)
AC2 (bounded application composition). Comprehensive enforcement and final application-level requirement evidence remain
#154; browser/recovery/freshness composition remains #155–#158.

**Included:** Build the reusable request/session enforcement capability needed by #154: use the independently resolved
request tenant, consume #218 session outcomes and identity/policy, and deny a tenant mismatch without substituting the
session tenant for the request tenant. Demonstrate the capability through a bounded reference protected path and an
observable protected Server Action/browser consumer, preserving documented public exceptions and tenant failure mappings
at those exercised boundaries. The reference operation must permit observation of protected side-effect denial without
introducing a new domain workflow.

Ownership: #153 establishes a usable enforcement contract and reference consumer, including independently running
application-instance evidence for shared identity. #154 owns integration across all application pages, route handlers,
Server Actions, direct/new-resource paths, public exceptions, and user-facing forbidden/recovery behavior. It reuses
these components and retained fixtures. This child does not claim complete default protection, comprehensive entry-point
coverage, or final browser/history behavior.

Specify the handoff from usable identity/deadline/warning policy, no usable session, and store failure into the
reference consumer; do not create a session or grant protected access after a failed store read. #220/#221 extend
lifecycle/race evidence; #157 owns final expired Server Action HTTP 401/recovery and #158 owns completed freshness
journeys. No prior-expiration retention is required solely for freshness selection.

**Evidence:** Authenticate through reference app instance A and consume the same session identity through independently
running reference instance B without affinity. At the exercised reference HTTP/action boundaries observe usable, absent,
mismatched, and forged-context outcomes, preserved tenant failures/public exceptions, and denied protected
effects/content when no usable session is available. Retain the real OIDC/Redis and protected-action/browser-consumer
fixtures for #154/#157 and #220/#221.

Handoff to #154 names the public guard/consumer contract, exercised reference paths, expected HTTP/denial behavior,
reusable fixtures, and unexercised application entry points. #154 must inventory and integrate all remaining
pages/handlers/actions and default protection for new resources. This child closes on reference capability/evidence;
comprehensive application enforcement, final history/recovery composition, and provider freshness remain explicit
downstream claims.

Record executed revision, conditions, and limitations; issue closure does not establish requirement verification.

**Start prerequisites:** S2-D.

**Delivery reference:** https://github.com/PathableAI-org/Pre-ETS/issues/219 — open; native containment verified.

### S2-F — Implement authoritative idle renewal and expiration

**Requirements:**
[PREETS-SESSION-008](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-008.md)
AC3–5;
[PREETS-SESSION-006](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-006.md)
AC3 (service/store portion);
[PREETS-SESSION-009](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-009.md)
AC1–4 (server classification/enforcement portion);
[PREETS-SESSION-011](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-011.md)
AC2–4 (server policy/renewal portion).

**Included:** Renew only for qualifying authenticated activity received before the authoritative deadline. Adopt the
tenant timeout/warning policy effective at that refresh; preserve established policy/deadline until then, and permit
independent sessions to adopt changes at different refreshes. Automatic polling, unrelated background traffic, raw
movement, and programmatic focus alone cannot renew. Never revive at or after expiration, including following timeout
increases or late Continue. Preserve cross-client consistency during concurrent renewal/expiration.

The shared contract exposes the authoritative deadline and effective warning policy after initialization/read/renewal,
together with usable-session, no-usable-session, and storage-failure outcomes. Expiration must stop service/adapter
consumers obtaining usable authenticated identity regardless of browser timers. Do not require retained records solely
to distinguish expiration from an unknown unavailable session.

Ownership: #153 owns service/store operations, policy adoption, and lifecycle guarantees. #154 wires deliberate
application requests to these operations and verifies protected HTTP enforcement across the application; #155/#156
supply browser activity/Continue and coordination. #219's reference fixtures can be extended when available, but #154 or
#219 HTTP composition is not a prerequisite for this child's service/store completion.

**Evidence:** Public-service and real-Redis evidence covers before/equal/after deadline, concurrent renewal/expiration,
excluded traffic, independent timeout/warning-policy adoption, and invalid configuration through real tenant
consumption. Independent adapter clients honor renewal/expiration, never return usable identity after authoritative
expiry, and cannot revive expired state after a timeout increase. Evidence does not depend on browser timers.

Retain service/deadline properties and examples, real-store concurrency fixtures, and configuration-consumer evidence.
Handoff supplies #154 with usable/no-usable-session/failure outcomes plus the policy/deadline returned on refresh. #154
must extend these fixtures into real HTTP activity on app A and protected expiration enforcement on app B; #155/#156 add
browser classification/coordination. Those are downstream obligations and are not required to close this service/store
child. Extend #219 reference HTTP fixtures if available, recording their limited coverage.

Record executed revision, conditions, and limitations; issue closure does not establish requirement verification.

**Start prerequisites:** S2-D. Reference HTTP evidence from S2-E is optional; #154 owns downstream application
verification.

**Delivery reference:** https://github.com/PathableAI-org/Pre-ETS/issues/220 — open; native containment verified.

### S2-G — Complete session invalidation and failure behavior

**Requirements:**
[PREETS-SESSION-006](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-006.md)
AC1–3 (invalidation/consistency support);
[PREETS-SESSION-008](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-008.md)
AC4 (no revival);
[PREETS-SESSION-013](https://github.com/PathableAI-org/Pre-ETS/blob/cddbb741e73af8b79cdc699101c08770ddb56096/docs/requirements/session/PREETS-SESSION-013.md)
AC2 (old-session denial support).

**Included:** Complete explicit shared invalidation, invalidation-versus-renewal race handling, and real-store outage
behavior through the public session service. Independent clients must stop obtaining usable authenticated identity from
invalidated/expired state; concurrent renewal must not restore it. Expose no usable session separately from
storage/service failure, with authoritative policy/deadline only for a usable session. Failures must not silently
create/replace an authenticated session or yield successful authorization.

Ownership: #153 delivers these shared lifecycle/failure guarantees and the consumer contract. #154 maps them to
protected application request enforcement; #155 supplies shared logout interaction/coordination; #157 supplies recovery
presentation; #158 completes fresh-provider recovery. HTTP denial/reference observations can extend #219 when available,
but comprehensive application/browser behavior is downstream.

Uniform fresh authentication removes the need for expiry-recognition retention solely to select freshness. Do not
prescribe cause-retention periods, deletion mechanics, or a distinction between absent/expired/invalidated causes when
the cause is unknown. Remaining B6 comparison/clock/provider gates apply to affected freshness integration, not basic
invalidation/outage operations.

**Evidence:** Independent real-store clients honor invalidation; racing renewal cannot restore invalidated or expired
usable identity. Exercise real-adapter outages through the public service and observe an explicit failure rather than
usable identity, silent replacement, or authorization success. Retain the lifecycle/race/outage harness and outcome
contract for #154/#155/#157/#158. Extend #219 reference denial evidence when available, without requiring it for
service/store completion.

Handoff records which outcomes consumers receive, the state transitions demonstrated, the revision/environment, and
outage/race limitations. #154 owns mapping the same failures to denied protected effects/content throughout the
application; later browser and provider evidence remain separate. Real-store executions alone do not establish
application-wide access denial, browser logout coordination, recovery presentation, or provider freshness.

Record executed revision, conditions, and limitations; issue closure does not establish requirement verification.

**Start prerequisites:** S2-F.

**Delivery reference:** https://github.com/PathableAI-org/Pre-ETS/issues/221 — open; native containment verified.

## Coverage and boundaries

SESSION-006 AC1–3 are split between D (storage/identity), E (bounded reference application composition), F (cross-instance
renewal/expiration), and G (invalidation/failure). SESSION-008 AC1 is A; AC2 is D; AC3–5 are F, with G no-revival races.
SESSION-011 policy is A/F; browser warning/Continue presentation stays #156. Steps A–E establish the shared authentication/session foundation and bounded reference consumers; #154
retains comprehensive application integration/enforcement and final application-level evidence. SESSION-004 expired-entry freshness awaits #158;
SESSION-007 recovery awaits #157; browser SESSION-009/010/011/012 work remains #155–#157. No selected criteria are
silently dropped. Completion of these children does not establish full requirement verification.

Backend/domain persistence, backend API expiration-response policy, new absolute lifetime, cloud/ingress selection, CI
cadence, arbitrary application-value storage, heartbeat/connection-loss behavior, and unresolved policy remain excluded.
B6 protocol/provider freshness decisions gate affected callback/identity contracts; B5 gates
affected browser work. No whole-issue blocker on #158 is added.

## Publication record

**Date:** 2026-10-17. **Assessment:** complete publication verified; repository review of this supplement remains pending.
**Baseline publication revision:** `e206d165f0f30999220922f57a3f92549c15f4cc` (PR #189).
**Authorization:** The maintainer expressly requested all seven divisions as children of #153, selected the B6
policies above, and requested ownership/handoff refinements after coverage review. These revisions were published
under that direct authorization. Earlier baseline approvals and issue identities remain preserved.

| Identity  | Issue                                                        | Verified state    | Native start prerequisites |
| --------- | ------------------------------------------------------------ | ----------------- | -------------------------- |
| S2 parent | [#153](https://github.com/PathableAI-org/Pre-ETS/issues/153) | Open; parent #152 | None                       |
| S2-A      | [#215](https://github.com/PathableAI-org/Pre-ETS/issues/215) | Open; parent #153 | None                       |
| S2-B      | [#216](https://github.com/PathableAI-org/Pre-ETS/issues/216) | Open; parent #153 | #215                       |
| S2-C      | [#217](https://github.com/PathableAI-org/Pre-ETS/issues/217) | Open; parent #153 | #216                       |
| S2-D      | [#218](https://github.com/PathableAI-org/Pre-ETS/issues/218) | Open; parent #153 | #215, #217                 |
| S2-E      | [#219](https://github.com/PathableAI-org/Pre-ETS/issues/219) | Open; parent #153 | #218                       |
| S2-F      | [#220](https://github.com/PathableAI-org/Pre-ETS/issues/220) | Open; parent #153 | #218                       |
| S2-G      | [#221](https://github.com/PathableAI-org/Pre-ETS/issues/221) | Open; parent #153 | #220                       |

Creation read-back verified seven open children, seven containment edges, seven start edges, parent body links,
and existing #152 → #153 containment. S2-F may extend S2-E reference fixtures; comprehensive application-level
verification belongs to #154 and is not a service/store closure prerequisite. Containment, start prerequisites,
and later shipping/requirement qualifications remain distinct.

Subsequent description updates were read back and verified:

- Uniform freshness policy: #152, #153, #154, #157, #158, #216–#219, #221.
- `max_age=0` / signed-ID-token `auth_time` baseline: #152, #153, #154, #158, #216–#218.
- Provider-neutral design and distinct Keycloak/Microsoft test expectations: #152, #153, #154, #158, #215–#218.
- Ownership and evidence handoffs: #153, #154, and all seven children. Titles, states, labels, assignees,
  milestones, all inspected parent/start edges, and the seven-child set were preserved.

**Last confirmed action:** all nine ownership-refined issue descriptions and their parent/start relationships verified.
**Outstanding relationships, failed/indeterminate actions, or unissued adopted children:** none.
**Review limits:** publication and document checks do not establish application behavior or requirement verification.
Microsoft and Keycloak freshness scenarios were not executed. B6 comparison/clock tolerance and provider support
remain explicit gates. This PR records the authorized subdivision and decisions; it does not implement them.
