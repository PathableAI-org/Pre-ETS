# Delivery plan: On-site job-coaching service records

**Status:** draft
**Planning date:** 2026-10-13
**Source revision:** `33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96` (freshly fetched `origin/main` and inspected worktree).
**Requirement acceptance:** [PR #129](https://github.com/PathableAI-org/Pre-ETS/pull/129), merged into `main` at the source revision.
**Approval:** Delivery decomposition pending maintainer PR review. Requirement acceptance does not approve this plan.

## Goal

Deliver the individual visit-log workflow: start a participant-associated record, return to one's own records,
capture and correct service times, maintain optional narratives, and remove a record with immediate undo.
Successful creation and updates must survive browser, session, and backend-process changes. Server-dependent
inputs must respond accessibly to heartbeat failure without confusing connectivity with save success or valid access.

This is a proposal for application delivery, with separately owned production prerequisites. It does not claim
complete monthly paper-report replacement, executed verification, or regulatory compliance.

## Requirements in scope

The nine on-site IDs include the four adopted shared data-input contracts. Preserve their historical IDs.
Select all 41 on-site criteria, plus 14 application-safeguard criteria applied to this workflow. The safeguard
scope is deliberately partial relative to the whole product: other workflows, outputs, privileged capabilities,
and deployed infrastructure remain separate work. The coverage review accounts for each selected criterion.

| Accepted requirement                                                                                                    | Selected ACs | Qualifications                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| [PREETS-ONSITE-001 — Create a participant-associated record](../requirements/on-site-job-coaching/PREETS-ONSITE-001.md) | 1–3          | Single-participant happy path; participant source/interaction gated by B1.                                                     |
| [PREETS-ONSITE-002 — Capture and correct service times](../requirements/on-site-job-coaching/PREETS-ONSITE-002.md)      | 1–4          | Time interpretation, validation and repeated actions gated by B3. No billable-time calculation.                                |
| [PREETS-ONSITE-003 — Optional visit narratives](../requirements/on-site-job-coaching/PREETS-ONSITE-003.md)              | 1–4          | Independent optional values; content limits and write outcomes gated by B2.                                                    |
| [PREETS-ONSITE-004 — Durable records from creation](../requirements/data-input/PREETS-ONSITE-004.md)                    | 1–6          | Created records and successful updates, including incomplete records. Unsaved keystrokes and backup recovery excluded.         |
| [PREETS-ONSITE-005 — Find and access one's own records](../requirements/on-site-job-coaching/PREETS-ONSITE-005.md)      | 1–6          | Owner-only ordinary reads and every mutation in the authenticated tenant. No supervisor/team grants.                           |
| [PREETS-ONSITE-006 — Update without approval gates](../requirements/on-site-job-coaching/PREETS-ONSITE-006.md)          | 1–4          | Service times and narratives only; participant correction and coach reassignment excluded.                                     |
| [PREETS-ONSITE-007 — Non-destructive workflow deletion](../requirements/data-input/PREETS-ONSITE-007.md)                | 1–4          | Ordinary deletion preserves identity, associations and values; later recovery/direct deleted access undecided.                 |
| [PREETS-ONSITE-008 — Immediate deletion undo](../requirements/data-input/PREETS-ONSITE-008.md)                          | 1–4          | Same-record restoration in the current workflow; interaction and failure outcomes gated by B5.                                 |
| [PREETS-ONSITE-009 — Disable inputs during connectivity failure](../requirements/data-input/PREETS-ONSITE-009.md)       | 1–6          | Explicit heartbeat endpoint; thresholds, initial state and recovery gated by B6.                                               |
| [PREETS-HIPAA-002 — Authorized access and identity](../requirements/security/PREETS-HIPAA-002.md)                       | 1–3          | On-site people/program paths, individual identity and approved revocation behavior; privileged paths outside this plan.        |
| [PREETS-HIPAA-003 — Permitted use and minimum necessary](../requirements/security/PREETS-HIPAA-003.md)                  | 1–3          | On-site forms, API outputs, diagnostics, telemetry and heartbeat; separately approved policy required by B7.                   |
| [PREETS-HIPAA-004 — Audit controls](../requirements/security/PREETS-HIPAA-004.md)                                       | 1–2          | Selected on-site activity and protected audit retrieval, subject to B7; no universal event coverage or narrative-copy mandate. |
| [PREETS-HIPAA-005 — Record and transmission integrity](../requirements/security/PREETS-HIPAA-005.md)                    | 1–2          | On-site writes and application transfers under B2/B7; deployed transport assessment remains B9.                                |
| [PREETS-HIPAA-006 — Application confidentiality](../requirements/security/PREETS-HIPAA-006.md)                          | 1–3          | On-site displays, incomplete input, copies/caches and transfers; no new export capability. B7/B9 constrain protection.         |
| [PREETS-HIPAA-011 — Retention and disposal](../requirements/security/PREETS-HIPAA-011.md)                               | 1            | Protection of retained/ordinarily deleted records only. AC 2–4 final disposal remains separate gated delivery under B8.        |

The [on-site context](../requirements/context/on-site-job-coaching.md),
[shared input context](../requirements/context/data-input-workflows.md), and
[PHI scope](../requirements/context/hipaa.md) qualify these selections. Stale proposal wording in those merged
documents does not undo Git-derived acceptance. Their unresolved decisions remain binding delivery gates.

## Current observations and existing work

Inspection is read-only at the source revision; no application, persistence, browser, or regulatory evidence was
executed or assessed as satisfaction evidence for this plan.

- The [backend entry point](../../packages/backend/src/index.ts) logs a greeting. The
  [backend package](../../packages/backend/package.json) declares Effect/platform dependencies but no record API,
  persistence adapter, token verifier, or dedicated test command. S1 must establish those responsible boundaries;
  a frontend test cannot validate backend authorization or durability.
- [Domain persistence](../domain-persistence.md) assigns durable records and business authorization to the
  separate backend REST process. Local [Postgres/Flyway](../docker-compose.md#postgres-and-flyway) exists, but
  [migrations](../../packages/backend/migrations/README.md) are a synthetic demo. There is no service-record schema.
  Redis/session state is not domain persistence. Use existing engineering ownership without turning incidental
  storage choices into product requirements.
- The current [proxy](../../packages/frontend/src/proxy.ts) is pass-through; the
  [authentication notes](../authentication.md) describe a welcome page and callback fallback. There is no live
  on-site UI or authenticated record workflow in this tree. Tenant-context code does not establish authenticated
  coach identity or backend authority.
- The [active BDD features](../../tests/bdd/requirements/) cover tenant behavior, while
  [E2E](../../e2e/README.md) has no browser specs. Reuse the owned-process/fixture patterns from
  [BDD support](../../tests/bdd/support/), extending lifecycle ownership to the backend and real domain store.
  Existing tenant tests and diagnostic responses do not establish any service-record criteria.
- [PR #146](https://github.com/PathableAI-org/Pre-ETS/pull/146), **feat(frontend): add local on-site report prototype**,
  was confirmed open, unmerged at head `8cf019a6709414fda47589529e448338353ca99e`. Its description says data resets
  on reload, uses synthetic inputs and a public development test route, and includes broader monthly-report
  sections. Its implementation and reported executions were not independently inspected. It may inform UX;
  it is neither a shipping prerequisite nor accepted record implementation/evidence. Production delivery needs
  protected application paths rather than adopting the prototype's public namespace.
- Read-only GitHub all-state issue search (limit 100) returned 22 issues. Searches for `on-site`, `HIPAA`, and
  `service record` identified no dedicated on-site/safeguard delivery issue; the last matched session issue #153.
  This bounded search does not rule out other terminology or external planning. No issue was created or revised.
- The existing [session plan](session-management.md) has published ownership under
  [#152](https://github.com/PathableAI-org/Pre-ETS/issues/152). Current issue bodies and states were read for
  [#153](https://github.com/PathableAI-org/Pre-ETS/issues/153) shared identity/idle state,
  [#154](https://github.com/PathableAI-org/Pre-ETS/issues/154) protected entry and tenant OIDC,
  [#155](https://github.com/PathableAI-org/Pre-ETS/issues/155) meaningful activity/shared-tab logout,
  [#157](https://github.com/PathableAI-org/Pre-ETS/issues/157) expiration concealment/recovery, and
  [#158](https://github.com/PathableAI-org/Pre-ETS/issues/158) fresh OIDC recovery; all were open. They exclude
  backend/domain API expiration policy and heartbeat form behavior. Consume their outcomes, define the backend
  trust/API contract here, and avoid duplicate session implementation. The session plan's stale draft/refinement
  text is not current requirement authority; the fetched main contracts and live issue bodies control this inspection.
- [Tenant-context issue #117](https://github.com/PathableAI-org/Pre-ETS/issues/117) was confirmed closed. Consume
  and test its tenant context in authenticated flows; closure alone does not prove those flows work.

## Blockers and decisions

These are unresolved decisions, not permission requests or inferred defaults. Record a named responsible person,
approved outcome and decision reference before crossing each gate. Source-provider SMEs remain unavailable;
bounded maintainer product decisions can support the selected workflow without claiming source-provider validation.

| ID  | Affected criteria/work                                                           | Decision or prerequisite; responsible role and gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | ONSITE-001 AC 1; S1/S3                                                           | Product maintainer, informed by participant source owner when available: minimal participant source, association identity and interaction, including tenant/authorization bounds. Decide before delivering creation. No participant registry/integration is inferred.                                                                                                                                                                                                                                                                                |
| B2  | ONSITE-001–-004, -006; HIPAA-005 AC 1–2; S1/S3/S4/S5                             | Product maintainer with application/persistence owner: save acknowledgement, failed/interrupted writes, retries/deduplication, concurrent changes, content limits and failure presentation. Define success and integrity outcomes before affected writes; no autosave, per-keystroke durability, universal rollback or conflict strategy is selected.                                                                                                                                                                                                |
| B3  | ONSITE-002 AC 1–4; S1 start capture, S4 corrections                              | Product maintainer with application owner: dates/time zones, overnight visits, ordering/validation and repeated end actions. Decide start-time interpretation for S1, remaining time interactions before S4. No rounding/billing policy.                                                                                                                                                                                                                                                                                                             |
| B4  | ONSITE-001–-008; HIPAA-002 AC 1–3; S1–S6                                         | Application/identity owner with product review: independently verified backend identity/tenant, trusted issuer/audience and user mapping, program rights, revocation and denial/API outcomes, and frontend-to-backend access after session loss. Decide before any record access/mutation; never trust client-supplied coach/tenant or frontend validation alone.                                                                                                                                                                                    |
| B5  | ONSITE-007/-008 and -005 AC 5–6; S5                                              | Product maintainer with UI owner: undo duration, focus/keyboard/announcements, navigation and session-expiry behavior, failed delete/undo and concurrent outcomes. Decide before delivering deletion. Owner direct access to deleted records remains undecided beyond the approved immediate-undo contract.                                                                                                                                                                                                                                          |
| B6  | ONSITE-009 AC 1–6; S2/S3, extended in S4/S5                                      | Product maintainer with UI/application owners: endpoint scope/authentication, intervals/timeouts and failure/recovery thresholds, initial state, which failures count, pending writes/unsaved values, other disabled-state actions and accessible focus/announcements. Decide before heartbeat/form interaction delivery. Offline editing/queuing is not adopted.                                                                                                                                                                                    |
| B7  | HIPAA-003/-004/-005/-006; S1–S6                                                  | Responsible data-handling/audit/application owners with separately authorized policy decision makers: permitted purposes/recipients/fields, telemetry allowlists, risk-based event coverage, audit identity/clock/retention/failure/protection/retrieval contract, browser copies/cache lifecycle, incomplete-input protection and selected encryption/alternative/integrity controls. Decide affected software behavior before implementation; approve and demonstrate applicable safeguards before PHI use. No operational approval is fabricated. |
| B8  | Related HIPAA-008 AC 1–3, -011 AC 2–4, -012 AC 1–4; production release           | Product maintainer and authorization/record-lifecycle owners: separately scoped emergency retrieval, retention/holds/disposal and rights-support delivery with approved policies and applicability. This plan does not implement those capabilities; applicable obligations must be planned, delivered and evidenced before PHI use. Ordinary editing/undo does not satisfy them.                                                                                                                                                                    |
| B9  | Related HIPAA-007 AC 1–4, INFRA-003 AC 1–3, INFRA-004 AC 1–4; production release | Infrastructure owner with approved policy inputs: protected storage/transfers/keys, backup scope/frequency/data-loss/restore targets, protected-copy retention/holds/disposal and restoration handling. Resolve in separate infrastructure delivery planning and verify deployed controls before PHI use. Process-restart durability is not backup recovery.                                                                                                                                                                                         |
| B10 | S2/S3/S4/S5/S6 application composition                                           | Existing session issues #153–#158 and their unresolved timing/freshness gates must deliver applicable authenticated identity, idle enforcement, deliberate activity, warning, logout, expiration concealment and fresh recovery. Frontend session loss must deny backend operations under B4. Use actual executions, not issue closure, before the composed workflow ships.                                                                                                                                                                          |

## Delivery slices

Source-pinned requirement links in the following proposed issue bodies are usable now. The new plan has no
committed remote revision yet. Each body's Delivery plan section records its local identity; publication must
add a full permalink to the approved remotely accessible plan/slice. No URL is fabricated at the requirement
revision, where this new plan does not exist. This is a publication preparation gap, not authorization to commit
or publish. All S1–S6 delivery references are **not published**.

### S1 — Create and retrieve authorized durable records through the backend

**Observable increment:** An owned backend HTTP process creates incomplete records and lists/opens only the
authenticated owner's records in that tenant. Retrieval after process replacement reads the real domain store.

**Evidence progression:** Establish retained public-service authorization/value scenarios, real-adapter
integration and HTTP fixtures with two users in one tenant and a user in a second tenant. The harness owns
process startup/shutdown, isolated synthetic store data and restart without clearing storage. It verifies signed
identity through the real configured verifier; prepared test identities do not prove production OIDC or revocation
propagation beyond the selected B4 contract. S3 adds browser/session-change observations; S4/S5 extend the same
records and denial/state matrix to every mutation. No temporary public diagnostic or record endpoint is needed.

**Proposed issue title:** Create and retrieve authorized durable on-site records through the backend

#### Outcome

Provide backend create/list/read operations with verified individual identity, authenticated tenant ownership,
automatic coach/start capture and process-independent durability from creation.

#### Requirements

[PREETS-ONSITE-001](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/on-site-job-coaching/PREETS-ONSITE-001.md) AC 1–3;
[PREETS-ONSITE-004](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/data-input/PREETS-ONSITE-004.md) AC 1–2, 4–6 (creation/process portion);
[PREETS-ONSITE-005](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/on-site-job-coaching/PREETS-ONSITE-005.md) AC 1–4, 6 (read portion);
[PREETS-HIPAA-002](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/security/PREETS-HIPAA-002.md) AC 1–3 and
[PREETS-HIPAA-005](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/security/PREETS-HIPAA-005.md) AC 1–2, each partial for these operations.

#### In scope

Backend process/API, identity verification and domain authorization, real persistence/migration and its test
boundary; participant association selected under B1; automatic authenticated coach/current start; stable identity
with empty end/narratives; owner-only list/read; approved denied/revoked/invalid identity and write failure outcomes.
Identify public success and typed failure outcomes and decode input at the trust/store boundary during engineering.
Frontend consumes the API; cookies/Redis never become record authority. Include selected per-operation safeguards.

#### Out of scope

Browser creation/find interaction, end/correction/narrative mutations, deletion/undo, OIDC/session implementation,
participant management/correction, on-behalf-of creation, team access, production infrastructure and backup recovery.
This increment does not claim full browser/session durability or all mutation authorization.

#### Dependencies

B1/B2/B4 and start-time part of B3; applicable B7 decisions. Backend evidence can use configured synthetic signed
identities without waiting for frontend #154. Actual frontend integration waits for existing session identity and
protection work. S6 and B8–B10 remain production gates; parent containment is not blocking.

#### Completion evidence

A coach/API consumer would be harmed by a substituted participant/coach, lost incomplete record, unauthorized
disclosure or a successful response preceding persistence. Exercise real create/list/read responses, independent
expected participant/coach/time values, absent optional fields, two same-tenant users and cross-tenant direct reads;
no protected contents on denial. Reopen from a replacement backend process against retained real storage with the
same record identity/associations/values. Exercise approved creation interruption/retry outcomes with real adapters.
Retain this harness for S3–S6. Simulated stores, a reload, and a new session alone cannot establish process durability;
these executions do not establish backup recovery or completed browser experience. Record revision and conditions.

#### Delivery plan

`docs/delivery/on-site-job-coaching.md`, S1. Add the approved remote plan permalink before publication.

<!-- delivery-issue: plan=docs/delivery/on-site-job-coaching.md; slice=S1 -->

### S2 — Observe connectivity without renewing or restoring expired access

**Observable increment:** The running application's heartbeat reports the selected communication/access outcome;
automatic monitoring traffic leaves the authoritative idle deadline unchanged. It is useful before a form exists.

**Evidence progression:** Retain endpoint and session-store observations, using the actual application/session
implementation when available. S3 binds the same monitoring behavior to the real service-record form for browser
disabling/recovery and accessible announcements. Do not create a disposable demonstration form or infer input
protection from a successful HTTP response. S4/S5 extend write-failure and recovery cases on their real controls.

**Proposed issue title:** Add on-site heartbeat communication without session renewal or save acknowledgement

#### Outcome

Supply the explicitly required heartbeat endpoint and reusable form-monitoring capability under the decided
connectivity contract, keeping idle expiration and write acknowledgement independent.

#### Requirements

[PREETS-ONSITE-009](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/data-input/PREETS-ONSITE-009.md) AC 1, 4–6 (endpoint/session portion; form-use, disabling and accessible recovery completed in S3);
[PREETS-HIPAA-003](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/security/PREETS-HIPAA-003.md) AC 2 (heartbeat output portion).
Consume [PREETS-SESSION-009](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/session/PREETS-SESSION-009.md) AC 3–4 via existing session work.

#### In scope

Decided route/response/authentication and monitoring outcomes, thresholds and initial state; controlled
communication failure/recovery; no PHI in heartbeat traffic outside approved need; expiration/logout enforcement;
automatic requests distinguished from intentional form activity. Heartbeat reachability does not establish
storage availability, successful creation/update, or access rights.

#### Out of scope

Record form controls/accessibility execution until S3, offline edits/queues, a new session store or idle policy,
public diagnostics that reveal records, and a storage-health guarantee.

#### Dependencies

B4/B6 and heartbeat-output part of B7. Endpoint/monitor code can begin independently of S1. Actual
deadline/identity/recovery composition requires [#153](https://github.com/PathableAI-org/Pre-ETS/issues/153)
and [#154](https://github.com/PathableAI-org/Pre-ETS/issues/154); these are completion prerequisites for the claimed
application/session increment, not reasons to block design of the endpoint. B10 remains a workflow shipping gate.

#### Completion evidence

For a form user, a reachable server must not silently extend idle access or report a failed write as saved.
Observe real heartbeat responses and authoritative idle deadlines before/after repeated automatic traffic and
after logout/expiration. Control communication failures and recovery according to B6; inspect synthetic traffic
for unapproved protected content. Record the narrower endpoint claim now; S3 supplies actual browser inputs and
S1/S4/S5 supply independent persistence/write-failure observations for AC 6. A polling call or browser timer alone
does not establish idle enforcement. Retain the endpoint and failure controls for the adopting form.

#### Delivery plan

`docs/delivery/on-site-job-coaching.md`, S2. Add the approved remote plan permalink before publication.

<!-- delivery-issue: plan=docs/delivery/on-site-job-coaching.md; slice=S2 -->

### S3 — Start, find and reopen one's own records in the protected application

**Observable increment:** A coach creates an incomplete record, leaves the form, finds it and reopens it through
the authenticated application. The real form responds accessibly to detected heartbeat failure and valid recovery.

**Evidence progression:** Extend S1/S2 fixtures to browser closure, new authenticated sessions, logout/expiry,
backend replacement and heartbeat failure. Use real-provider authentication for the fresh-session journey;
seeded identities may establish narrower HTTP behavior only. Retain this form and its input monitor for S4/S5.
End capture, narrative entry/correction and restored-record editing remain incomplete until those slices.

**Proposed issue title:** Start and reopen one's own on-site records with protected connectivity-aware inputs

#### Outcome

Integrate the backend and existing authentication/session capabilities into participant-associated start,
owner-only discovery and review, with accessible connectivity disabling/recovery on the actual record form.

#### Requirements

[PREETS-ONSITE-001](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/on-site-job-coaching/PREETS-ONSITE-001.md) AC 1–3;
[PREETS-ONSITE-004](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/data-input/PREETS-ONSITE-004.md) AC 1–2, 4–6 (creation/browser/session portion);
[PREETS-ONSITE-005](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/on-site-job-coaching/PREETS-ONSITE-005.md) AC 1–4, 6 (reads);
[PREETS-ONSITE-006](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/on-site-job-coaching/PREETS-ONSITE-006.md) AC 4 (create/review portion);
[PREETS-ONSITE-009](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/data-input/PREETS-ONSITE-009.md) AC 1–6, composed with S2 and later write interactions;
[PREETS-HIPAA-006](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/security/PREETS-HIPAA-006.md) AC 1–3 (form/display/access-loss portion).

#### In scope

Selected participant association and save acknowledgement; coach/start captured without manual entry; no end,
narrative, signature or approval prerequisite; owner record discovery/review; protected direct application paths.
Monitor heartbeat while the form is used, disable editable inputs for pointer/keyboard/touch, announce failure
accessibly and restore usability only with valid authorization. Apply decided cache/copy/incomplete-value protection
on failure, logout/expiration and shared-device use. Use the backend as authority across new sessions.

#### Out of scope

Time/narrative editing until S4; deletion/undo until S5; participant registry, monthly report sections, team access,
approval lifecycle, offline queuing and unapproved unsaved-value retention. Prototype layout is a UX input only.

#### Dependencies

S1/S2; B1/B2/B4/B6 and applicable B7 decisions; actual protected tenant identity from
[#154](https://github.com/PathableAI-org/Pre-ETS/issues/154). Existing
[#155](https://github.com/PathableAI-org/Pre-ETS/issues/155),
[#157](https://github.com/PathableAI-org/Pre-ETS/issues/157) and
[#158](https://github.com/PathableAI-org/Pre-ETS/issues/158) provide activity/logout, expiration concealment and
fresh-session recovery for completed browser/access-loss evidence. Those integrations, S6 and B8–B10 are
shipping gates; synthetic development can remain a bounded partial increment without claiming shipping readiness.

#### Completion evidence

A coach must find the same incomplete record after leaving, browser closure, logout/expiry and new authentication,
and after replacing the backend process. Browser/HTTP observations independently compare participant, coach,
captured start and absent optional values, list omission/direct denial for non-owners and cross-tenant requests.
Inject actual heartbeat communication failure/recovery and show input edits prevented through pointer, keyboard
and touch; demonstrate usable valid recovery and denied recovery after logout/expiry. Manual assistive-technology
evidence checks announcement/focus under B6. Keep heartbeat successful while a controlled creation write fails:
no successful-save claim or durable-created-record claim follows from heartbeat alone. Observe protected display,
cache and incomplete-value handling through access loss. Creation evidence leaves successful-update and
mutation-denial claims for S4/S5; it does not verify every network failure or any other adopting workflow.

#### Delivery plan

`docs/delivery/on-site-job-coaching.md`, S3. Add the approved remote plan permalink before publication.

<!-- delivery-issue: plan=docs/delivery/on-site-job-coaching.md; slice=S3 -->

### S4 — Capture end and update service times and independent optional narratives

**Observable increment:** Through the real form/API, a coach ends a visit, corrects both times and enters,
revises or clears each optional narrative on the same existing record, including after prior end capture.

**Evidence progression:** Extend the retained S1 HTTP/persistence matrix and S3 browser journey to every update;
reopen after new authentication/backend replacement and compare successful values independently. Real-adapter
interruption/conflict cases observe B2 outcomes. Continue heartbeat/access-loss and same-tenant/cross-tenant denial
checks on these new controls. Deletion, undo and audit convergence remain S5/S6.

**Proposed issue title:** Capture and correct on-site times and optional narratives without approval gates

#### Outcome

Add explicit current end capture and later time/narrative updates to the existing durable record, with no
submission, approval, signature or locking prerequisite.

#### Requirements

[PREETS-ONSITE-002](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/on-site-job-coaching/PREETS-ONSITE-002.md) AC 1–4;
[PREETS-ONSITE-003](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/on-site-job-coaching/PREETS-ONSITE-003.md) AC 1–4;
[PREETS-ONSITE-006](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/on-site-job-coaching/PREETS-ONSITE-006.md) AC 1–4;
[PREETS-ONSITE-004](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/data-input/PREETS-ONSITE-004.md) AC 2–6 (successful-update portion);
[PREETS-ONSITE-005](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/on-site-job-coaching/PREETS-ONSITE-005.md) AC 2, 5–6 (end/time/narrative paths);
[PREETS-HIPAA-005](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/security/PREETS-HIPAA-005.md) AC 1–2 (update integrity), with ONSITE-009 and HIPAA-006 safeguards extended to the new inputs.

#### In scope

End capture without manual time; correction of both automatically captured times; four separately identifiable
optional text values, independent omission/revision/clearing; editing before/after end and after reopening;
successful persisted values remain on the same record. Enforce ownership for every direct mutation and preserve
associations/state on unauthorized writes. Apply decided time/content rules, interruption/conflict/retry outcomes,
save presentation and session/connectivity protection.

#### Out of scope

Participant correction, coach reassignment, totals/billable hours, monthly planning/reporting, approval/locking,
delete/undo and unsaved-keystroke durability. Do not choose conflict semantics from incidental adapter behavior.

#### Dependencies

S3 for integrated form evidence; backend operations can be engineered on S1's retained API before browser
integration. B2/B3/B4 and applicable B6/B7 decisions must precede affected interactions; S6/B8–B10 gate PHI use.

#### Completion evidence

A coach would be harmed by reverted corrections, required empty fields, a replacement record or an unauthorized
change. Demonstrate explicit current end, both corrections and independent text entry/revision/clearing, including
all narratives empty at end/save. Leave/reopen and edit after end; compare stable identity/participant/coach and
corrected values after fresh authentication and backend replacement. Bypass the UI for same-tenant non-owner
and cross-tenant mutations; use an authorized observer to establish unchanged associations/times/narratives/status
and denied responses to establish no disclosure. Exercise approved real-store interruption/conflict/retry outcomes,
valid/expired connectivity recovery and reachable-heartbeat/failed-write distinction. Finite cases establish
selected rules only; delete/undo denial remains S5 and full audit/output controls remain S6.

#### Delivery plan

`docs/delivery/on-site-job-coaching.md`, S4. Add the approved remote plan permalink before publication.

<!-- delivery-issue: plan=docs/delivery/on-site-job-coaching.md; slice=S4 -->

### S5 — Remove records from ordinary views and immediately undo deletion

**Observable increment:** A coach removes an owned record without destroying it, receives an immediate usable
undo opportunity and restores that same record for review/editing in the current workflow.

**Evidence progression:** Extend S1 real-store observations to preserved deleted state and S3/S4 browser journeys
to immediate undo and restored editing. Keep direct denial cases for delete and undo, including bypass attempts
against a deleted record. UI absence alone cannot establish non-destructive persistence. S6 completes selected
audit retention/retrieval after ordinary deletion; later recovery and final disposal remain B8/B9.

**Proposed issue title:** Delete on-site records non-destructively with immediate authorized undo

#### Outcome

Provide ordinary owner deletion and immediate same-record restoration without a trash interface, preserving
participant/coach, times, narratives and authorized editing.

#### Requirements

[PREETS-ONSITE-007](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/data-input/PREETS-ONSITE-007.md) AC 1–4;
[PREETS-ONSITE-008](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/data-input/PREETS-ONSITE-008.md) AC 1–4;
[PREETS-ONSITE-005](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/on-site-job-coaching/PREETS-ONSITE-005.md) AC 1, 3, 5–6 (deleted views/delete/undo);
[PREETS-HIPAA-005](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/security/PREETS-HIPAA-005.md) AC 1–2 (delete/undo integrity);
[PREETS-HIPAA-011](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/security/PREETS-HIPAA-011.md) AC 1 (retained-record protection).

#### In scope

Non-destructive backend deletion; omission from ordinary views after reload/new session; preserved underlying
record; immediate authorized undo with decided duration/focus/announcements/failures; restored review/editing
of the same record. Apply approved concurrency, session-expiry and connectivity outcomes. Denial never discloses
contents or changes the targeted record, including its deletion state. No new privilege follows from knowing an ID.

#### Out of scope

General trash, later recovery, undeclared direct deleted-record access, retention duration, purge/final disposal,
backup copy deletion, emergency or rights-fulfillment interfaces.

#### Dependencies

Start after S3; use S1 storage/authorization and S2 monitoring. S4 is a completion prerequisite for proving
restored time/narrative editing, rather than a blanket start dependency for non-destructive deletion.
B2/B4/B5 and applicable B6/B7 decisions; S6/B8–B10 remain production gates.

#### Completion evidence

For an accidental-deletion user, absence alone is insufficient: compare persisted identity/associations/values
before/after deletion and ordinary view absence after reload/new authentication. Demonstrate immediate undo in
the current workflow restores the same record and then successful review/editing; no separate recovery navigation.
Use keyboard and manual assistive-technology evidence for the decided opportunity. Exercise approved expiry,
navigation, concurrency and failure cases. Direct same-tenant non-owner and cross-tenant delete/undo requests,
including deleted targets, reveal no protected contents; authorized persistence observations establish unchanged
associations/values/deletion state on denial. Keep retained-store assertions and audit observations for S6.
These cases do not establish later recovery, retention schedules or permanent disposal.

#### Delivery plan

`docs/delivery/on-site-job-coaching.md`, S5. Add the approved remote plan permalink before publication.

<!-- delivery-issue: plan=docs/delivery/on-site-job-coaching.md; slice=S5 -->

### S6 — Protect and examine selected on-site activity and application outputs

**Observable increment:** Activity selected by the approved audit coverage is recorded and examinable through
a separately authorized protected software path. On-site outputs, copies and application transfers enforce
approved data needs and safeguards, including incomplete/deleted records and access loss.

**Evidence progression:** Develop shared controls after B7; integrate against S1's actual create/read boundary,
then extend with S2–S5 operations as they land. Retain approved-output, real audit-storage and denial tests;
aggregate existing slice executions rather than duplicate the whole workflow in a new verification suite.
This slice implements shared audit/output controls with distinct protected-storage/retrieval observations;
each behavior slice still owns its own completion evidence. Whole-product safeguards and B8/B9 remain incomplete.

**Proposed issue title:** Enforce on-site output safeguards and protected risk-based audit examination

#### Outcome

Implement approved permitted-use/output mappings, selected application confidentiality/integrity controls and
protected audit recording/retrieval for the delivered on-site paths without expanding ordinary coach permissions.

#### Requirements

[PREETS-HIPAA-002](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/security/PREETS-HIPAA-002.md) AC 1–3 (audit identity/access);
[PREETS-HIPAA-003](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/security/PREETS-HIPAA-003.md) AC 1–3;
[PREETS-HIPAA-004](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/security/PREETS-HIPAA-004.md) AC 1–2;
[PREETS-HIPAA-005](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/security/PREETS-HIPAA-005.md) AC 1–2 (selected application/transmission controls);
[PREETS-HIPAA-006](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/security/PREETS-HIPAA-006.md) AC 1–3;
[PREETS-HIPAA-011](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/security/PREETS-HIPAA-011.md) AC 1. Coverage is limited to this workflow and selected audit path, not every product recipient/output.

#### In scope

Approved purposes/recipients/data needs and exceptions enforced through actual record/application paths; approved
fields only in forms/API/diagnostics/logs/traces/heartbeat and any used analytics/support output. Selected event
coverage with actor/target/time/action/outcome and protected retrievable audit records; ordinary deletion cannot
defeat coverage. Individually distinguish people, restrict authorized programs and audit reviewers, and enforce
decided revoked access. Safeguard browser/application copies, incomplete/disabled-form data, keys and transfers
through access loss/recovery and shared-device use. Apply selected record/transmission controls; use real adapters
where claims depend on storage behavior. Selected safeguards belong in S1–S5 as those operations are built.

#### Out of scope

Universal audit event coverage, full narrative-copy/event-sourcing mandate, recurring human review, operational
policy approval, new export/analytics/support features, emergency authority, rights interfaces, final disposal,
and infrastructure backup/storage/key controls. No general HIPAA compliance claim.

#### Dependencies

B4/B7 precede affected controls. Start integration after S1; complete coverage after the actual S2–S5 paths
and B10 session interactions exist. This shipping convergence is not a set of reverse start dependencies:
S1–S5 can land with synthetic bounded evidence, while PHI release requires S6 and applicable B8/B9 outcomes.

#### Completion evidence

Authorized users/reviewers depend on usable audit evidence and protected information. With synthetic marked
data, independently compare selected actor/target/time/action/outcomes to activity through real paths and retrieve
audit records after ordinary deletion. Denied/revoked/cross-tenant reviewer/program requests disclose no protected
contents; unauthorized audit alteration/deletion cannot change retained evidence. Observe real storage protection
and approved failure behavior. Inspect actual application outputs for field/recipient limits and deny unpermitted
uses even where a minimum-necessary exception exists. Observe selected cache/copy/key/transfer protection,
including unsaved input, disabled state, logout/expiry, valid/invalid recovery and subsequent shared-device use.
Extend S1/S4/S5 real-adapter integrity cases and record controls plus limitations. Configuration/allowlists alone
do not establish runtime enforcement; local transport does not verify deployed infrastructure protection.

#### Delivery plan

`docs/delivery/on-site-job-coaching.md`, S6. Add the approved remote plan permalink before publication.

<!-- delivery-issue: plan=docs/delivery/on-site-job-coaching.md; slice=S6 -->

## Cross-cutting concerns and issue structure

Propose one parent containing S1–S6. Containment describes the coordinated outcome and is separate from blockers.
The proposed parent and child identities have no issue numbers; existing session/tenant issues remain their own work.

### Proposed parent — Deliver the protected on-site visit-log workflow

#### Outcome

Deliver participant-associated durable owner records, end/correction/optional narratives, ordinary deletion with
immediate undo, and accessible heartbeat input protection under applicable application safeguards.

#### Requirements

- [PREETS-ONSITE-001](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/on-site-job-coaching/PREETS-ONSITE-001.md) AC 1–3.
- [PREETS-ONSITE-002](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/on-site-job-coaching/PREETS-ONSITE-002.md) AC 1–4.
- [PREETS-ONSITE-003](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/on-site-job-coaching/PREETS-ONSITE-003.md) AC 1–4.
- [PREETS-ONSITE-004](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/data-input/PREETS-ONSITE-004.md) AC 1–6.
- [PREETS-ONSITE-005](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/on-site-job-coaching/PREETS-ONSITE-005.md) AC 1–6.
- [PREETS-ONSITE-006](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/on-site-job-coaching/PREETS-ONSITE-006.md) AC 1–4.
- [PREETS-ONSITE-007](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/data-input/PREETS-ONSITE-007.md) AC 1–4.
- [PREETS-ONSITE-008](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/data-input/PREETS-ONSITE-008.md) AC 1–4.
- [PREETS-ONSITE-009](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/data-input/PREETS-ONSITE-009.md) AC 1–6.
- [PREETS-HIPAA-002](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/security/PREETS-HIPAA-002.md) AC 1–3.
- [PREETS-HIPAA-003](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/security/PREETS-HIPAA-003.md) AC 1–3.
- [PREETS-HIPAA-004](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/security/PREETS-HIPAA-004.md) AC 1–2.
- [PREETS-HIPAA-005](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/security/PREETS-HIPAA-005.md) AC 1–2.
- [PREETS-HIPAA-006](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/security/PREETS-HIPAA-006.md) AC 1–3.
- [PREETS-HIPAA-011](https://github.com/PathableAI-org/Pre-ETS/blob/33a81b55883aa0c11dd0d9b9e1573ed28a0c9c96/docs/requirements/security/PREETS-HIPAA-011.md) AC 1.

Safeguard coverage is limited to these workflow surfaces; whole-product conditions remain outside this plan.

#### In scope

Children: S1 authorized durable backend creation/retrieval; S2 non-renewing heartbeat; S3 protected browser
start/find/reopen and connectivity handling; S4 time/narrative updates; S5 non-destructive delete/undo;
S6 selected protected audit and output controls. Account for all 55 selected criteria and their explicit gates.

#### Out of scope

Participant management/correction, coach reassignment, multiple-participant/group workflow, supervisor/team access,
monthly reports/totals/billing/signatures/approval, later trash recovery, production infrastructure and deferred
operational policy/procedures. Broader application rights/emergency/disposal capabilities require B8 delivery;
these exclusions do not waive applicable obligations before PHI use.

#### Dependencies

B1–B7 gate affected implementation; B8–B10 gate production use. Proposed start dependencies: S3 follows S1/S2
and existing #154; S4 follows S3 for browser integration; S5 follows S3; S6 integrates after S1. S2's authoritative
session evidence consumes existing #153/#154. S4 also enables S5 restored-editing completion; S6 completion
requires all delivered operation paths. Do not publish reverse shipping gates as native start blockers.

#### Completion evidence

Collect attributable child execution revisions/conditions/limitations. Same incomplete record and successful
updates survive browser closure/new authentication/backend replacement; every direct read/mutation protects
owner/tenant scope and preserves state on denial. Demonstrate independent optional narratives, corrected times,
continued editing, preserved deleted data and same-record immediate undo. Real form/browser/session observations
show accessible disabling/recovery without deadline renewal, access resurrection or false save acknowledgement.
Selected audit/output/copy controls are exercised through actual paths and real storage. Parent closure neither
approves requirements nor establishes production readiness: applicable B8/B9 work and B10 composition remain gates.

#### Delivery plan

`docs/delivery/on-site-job-coaching.md`, parent, containing S1–S6. Add the approved remote plan permalink and
actual child URLs during authorized publication; refresh duplicates and external issue relationships then.

<!-- delivery-issue: plan=docs/delivery/on-site-job-coaching.md; slice=parent -->

### Proposed sequencing relationships

| Work | Start prerequisites                                                                | Additional completion or shipping prerequisites                                              |
| ---- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| S1   | B1/B2/B4 and start-time B3; applicable B7 decisions                                | S3 browser/session observations; S4/S5 mutation coverage; S6 and B8–B10 before PHI use.      |
| S2   | B4/B6 and heartbeat-output B7 decisions                                            | #153/#154 for real authoritative-session evidence; S3 actual-form evidence.                  |
| S3   | S1/S2 and #154; affected B decisions                                               | #155/#157/#158 for activity/access-loss/fresh-session journeys; S6 and B8–B10 for release.   |
| S4   | S3 for the browser slice; backend work can start after S1 and affected B decisions | Composed persistence/session/connectivity observations; S6 and B8–B10 for release.           |
| S5   | S3 and affected B decisions                                                        | S4 restored-editing observation; S6 protected audit and B8–B10 for release.                  |
| S6   | S1 for actual-path integration; B4/B7                                              | S2–S5 delivered paths and B10 composition for coverage; B8/B9 remain separate release gates. |

Only genuine issue start prerequisites become native blocking edges during later publication. Decision gates
stay documented until assigned to concrete delivery work. All S1–S6 are parent children, including independently
startable S2. The table describes no cyclic start dependencies and no blanket S6-before-S1 shipping edge.

### Engineering and release boundaries

Keep backend domain operations, verification and durable schema in `packages/backend`; frontend owns the UI,
tenant/OIDC/session adapters and temporary input state. Respect [Effect guidance](../engineering/effect-guidance.md)
and each workspace's agent routing during implementation. This plan introduces no Effect API design, new framework,
generalized cross-service domain model or runtime tool. Backend engineering must define concrete public operations,
typed outcomes, service requirements and implementation/test locations before coding.

S1 brings the missing backend/test boundary forward because restart and authorization evidence depend on it.
S2 establishes real heartbeat/session observations before the form relies on them. S3 then owns real form/browser
interaction; S4/S5 extend that same harness. S6 starts shared controls early and converges their coverage over
actual operations. No separate omnibus verification issue or temporary diagnostic response is proposed.

Use synthetic records/identities for development and executions. Intermediate merges can support narrower claims;
they must remain explicitly gated from PHI use while safeguards are incomplete. Do not expose protected records
through public `/_test` routes or interpret the prototype's synthetic/public behavior as the production contract.
Use incremental migrations and review compatibility/rollback before adopting records; do not alter applied demo
migrations to become the real domain schema. Record schema/test-store lifecycle and cleanup boundaries in S1.

Apply [Testing as evidence](../engineering/testing/README.md). Later BDD authoring/scaffolding/review must use
the repository skills and current main sources with requirement-ID tags and feature-level `@partial` for bounded
claims. This plan adds no scenarios or test implementations. Real process/storage observations establish durability;
real-provider journeys establish new authentication; manual assistive-technology observations address announcement
and focus. Do not repeat private-helper assertions or present discovery/dry-run as executed behavior.

Infrastructure backup recovery, deployed storage/transport/keys and protected-copy retention/disposal stay under
their accepted infrastructure requirements and B9. B8 preserves separate application emergency, rights and final
disposal obligations. Assign and link their delivery work before production review; neither lacks importance merely
because it is outside this application's ordinary visit-log decomposition. Operational approvals/procedures remain
separate from software evidence. New obligations or strengthened policy promises require the requirements workflow.

## Coverage review

Each row accounts for one selected AC at the source revision. All dispositions are planned and conditional on
the named gates; none is evidence-backed or claimed satisfied. Safeguard rows cover this workflow only, leaving
other product surfaces explicitly outside this plan. Criteria whose final observation spans slices remain incomplete
until those increments are composed. No selected criterion is silently deferred.

| Requirement                                                                    | AC | Disposition and slices                                   | Planned evidence and remaining conditions                                                                                                                     |
| ------------------------------------------------------------------------------ | -- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PREETS-ONSITE-001](../requirements/on-site-job-coaching/PREETS-ONSITE-001.md) | 1  | Planned — S1/S3; affected B gates unresolved             | HTTP/browser participant association; B1/B4.                                                                                                                  |
| [PREETS-ONSITE-001](../requirements/on-site-job-coaching/PREETS-ONSITE-001.md) | 2  | Planned — S1/S3; affected B gates unresolved             | Verified individual coach and independent current-start observation; B3/B4.                                                                                   |
| [PREETS-ONSITE-001](../requirements/on-site-job-coaching/PREETS-ONSITE-001.md) | 3  | Planned — S1/S3; affected B gates unresolved             | Real creation with empty end and all narratives; B2.                                                                                                          |
| [PREETS-ONSITE-002](../requirements/on-site-job-coaching/PREETS-ONSITE-002.md) | 1  | Planned — S4; affected B gates unresolved                | Explicit end on a record lacking end; independent current-time observation; B3.                                                                               |
| [PREETS-ONSITE-002](../requirements/on-site-job-coaching/PREETS-ONSITE-002.md) | 2  | Planned — S4; affected B gates unresolved                | Correct both automatically captured times through real API/form; B2/B3.                                                                                       |
| [PREETS-ONSITE-002](../requirements/on-site-job-coaching/PREETS-ONSITE-002.md) | 3  | Planned — S4; affected B gates unresolved                | Reopen corrected values, then new session/backend replacement; B2.                                                                                            |
| [PREETS-ONSITE-002](../requirements/on-site-job-coaching/PREETS-ONSITE-002.md) | 4  | Planned — S4; affected B gates unresolved                | Edit again after end without approval/submission; B2/B3.                                                                                                      |
| [PREETS-ONSITE-003](../requirements/on-site-job-coaching/PREETS-ONSITE-003.md) | 1  | Planned — S1/S3/S4; affected B gates unresolved          | Four distinguishable fields through S4 API/form.                                                                                                              |
| [PREETS-ONSITE-003](../requirements/on-site-job-coaching/PREETS-ONSITE-003.md) | 2  | Planned — S1/S3/S4; affected B gates unresolved          | Create with all empty in S1/S3; update each empty in S4; B2.                                                                                                  |
| [PREETS-ONSITE-003](../requirements/on-site-job-coaching/PREETS-ONSITE-003.md) | 3  | Planned — S1/S3/S4; affected B gates unresolved          | Independent entry/revision/clear of each in S4; B2 content limits/failures.                                                                                   |
| [PREETS-ONSITE-003](../requirements/on-site-job-coaching/PREETS-ONSITE-003.md) | 4  | Planned — S1/S3/S4; affected B gates unresolved          | S1/S3 empty creation and S4 empty end/save remain durable; B2.                                                                                                |
| [PREETS-ONSITE-004](../requirements/data-input/PREETS-ONSITE-004.md)           | 1  | Planned — S1/S3/S4; affected B gates unresolved          | S3 reload/browser closure/new real-provider session; same stored record; B10.                                                                                 |
| [PREETS-ONSITE-004](../requirements/data-input/PREETS-ONSITE-004.md)           | 2  | Planned — S1/S3/S4; affected B gates unresolved          | S1/S3 incomplete creation and S4 incomplete updates persist; B2.                                                                                              |
| [PREETS-ONSITE-004](../requirements/data-input/PREETS-ONSITE-004.md)           | 3  | Planned — S1/S3/S4; affected B gates unresolved          | S4 corrected time/narrative values in a fresh session; B2/B10.                                                                                                |
| [PREETS-ONSITE-004](../requirements/data-input/PREETS-ONSITE-004.md)           | 4  | Planned — S1/S3/S4; affected B gates unresolved          | S3 creation and S4 updates retrieved after logout/expiry; B10.                                                                                                |
| [PREETS-ONSITE-004](../requirements/data-input/PREETS-ONSITE-004.md)           | 5  | Planned — S1/S3/S4; affected B gates unresolved          | S1 creation/S4 updates persist without lifecycle transitions.                                                                                                 |
| [PREETS-ONSITE-004](../requirements/data-input/PREETS-ONSITE-004.md)           | 6  | Planned — S1/S3/S4; affected B gates unresolved          | S1 creation and S4 updates from replacement backend using real retained store; no backup claim.                                                               |
| [PREETS-ONSITE-005](../requirements/on-site-job-coaching/PREETS-ONSITE-005.md) | 1  | Planned — S1/S3/S4/S5; affected B gates unresolved       | S1/S3 owner discovery includes incomplete records; S5 deleted records absent.                                                                                 |
| [PREETS-ONSITE-005](../requirements/on-site-job-coaching/PREETS-ONSITE-005.md) | 2  | Planned — S1/S3/S4/S5; affected B gates unresolved       | S1/S3 reopen associations/start; S4 reopen end/corrections/narratives.                                                                                        |
| [PREETS-ONSITE-005](../requirements/on-site-job-coaching/PREETS-ONSITE-005.md) | 3  | Planned — S1/S3/S4/S5; affected B gates unresolved       | Same-tenant other owner and cross-tenant records absent; S5 deletion visibility.                                                                              |
| [PREETS-ONSITE-005](../requirements/on-site-job-coaching/PREETS-ONSITE-005.md) | 4  | Planned — S1/S3/S4/S5; affected B gates unresolved       | Real direct API/application reads deny non-owner and cross-tenant access; B4.                                                                                 |
| [PREETS-ONSITE-005](../requirements/on-site-job-coaching/PREETS-ONSITE-005.md) | 5  | Planned — S1/S3/S4/S5; affected B gates unresolved       | S4 direct end/time/narrative and S5 direct delete/undo denial matrix; B4/B5.                                                                                  |
| [PREETS-ONSITE-005](../requirements/on-site-job-coaching/PREETS-ONSITE-005.md) | 6  | Planned — S1/S3/S4/S5; affected B gates unresolved       | Denied reads disclose nothing; denied S4/S5 mutations leave every association/value/deletion state unchanged, checked by authorized observer.                 |
| [PREETS-ONSITE-006](../requirements/on-site-job-coaching/PREETS-ONSITE-006.md) | 1  | Planned — S3/S4; affected B gates unresolved             | Leave and reopen same owned non-deleted record; update times/narratives in S4.                                                                                |
| [PREETS-ONSITE-006](../requirements/on-site-job-coaching/PREETS-ONSITE-006.md) | 2  | Planned — S3/S4; affected B gates unresolved             | Independent stable identity observation before/after successful S4 updates.                                                                                   |
| [PREETS-ONSITE-006](../requirements/on-site-job-coaching/PREETS-ONSITE-006.md) | 3  | Planned — S3/S4; affected B gates unresolved             | S4 update again after previously recorded end.                                                                                                                |
| [PREETS-ONSITE-006](../requirements/on-site-job-coaching/PREETS-ONSITE-006.md) | 4  | Planned — S3/S4; affected B gates unresolved             | S1/S3 create/review and S4 edit without draft/submitted/approved states, approval/signatures/locking.                                                         |
| [PREETS-ONSITE-007](../requirements/data-input/PREETS-ONSITE-007.md)           | 1  | Planned — S5; affected B gates unresolved                | Real authorized deletion; B5 save/failure interaction.                                                                                                        |
| [PREETS-ONSITE-007](../requirements/data-input/PREETS-ONSITE-007.md)           | 2  | Planned — S5; affected B gates unresolved                | Deleted record absent after reload/new authenticated session; B10.                                                                                            |
| [PREETS-ONSITE-007](../requirements/data-input/PREETS-ONSITE-007.md)           | 3  | Planned — S5; affected B gates unresolved                | Real persistence compares same identity/associations/times/narratives after deletion.                                                                         |
| [PREETS-ONSITE-007](../requirements/data-input/PREETS-ONSITE-007.md)           | 4  | Planned — S5; affected B gates unresolved                | Persistent underlying record survives ordinary deletion; no final disposal claim.                                                                             |
| [PREETS-ONSITE-008](../requirements/data-input/PREETS-ONSITE-008.md)           | 1  | Planned — S5; affected B gates unresolved                | Immediate current-workflow opportunity; keyboard/assistive-technology evidence under B5.                                                                      |
| [PREETS-ONSITE-008](../requirements/data-input/PREETS-ONSITE-008.md)           | 2  | Planned — S5; affected B gates unresolved                | Undo restores same record/associations/values via real adapter; B2/B5.                                                                                        |
| [PREETS-ONSITE-008](../requirements/data-input/PREETS-ONSITE-008.md)           | 3  | Planned — S5; affected B gates unresolved                | Open/review and S4-style edit after restoration; S4 completion prerequisite.                                                                                  |
| [PREETS-ONSITE-008](../requirements/data-input/PREETS-ONSITE-008.md)           | 4  | Planned — S5; affected B gates unresolved                | Restore in current workflow without navigating a trash/recovery interface; B5.                                                                                |
| [PREETS-ONSITE-009](../requirements/data-input/PREETS-ONSITE-009.md)           | 1  | Planned — S2/S3/S4/S5; affected B gates unresolved       | S2 live endpoint; S3 monitors during actual form use; B6.                                                                                                     |
| [PREETS-ONSITE-009](../requirements/data-input/PREETS-ONSITE-009.md)           | 2  | Planned — S2/S3/S4/S5; affected B gates unresolved       | S3 actual pointer/keyboard/touch edits prevented; S4 additional time/text inputs covered; B6.                                                                 |
| [PREETS-ONSITE-009](../requirements/data-input/PREETS-ONSITE-009.md)           | 3  | Planned — S2/S3/S4/S5; affected B gates unresolved       | S3 manual assistive-technology announcement and accessible state/focus evidence; B6.                                                                          |
| [PREETS-ONSITE-009](../requirements/data-input/PREETS-ONSITE-009.md)           | 4  | Planned — S2/S3/S4/S5; affected B gates unresolved       | S2 access denial; S3 valid recovery and logout/expiry non-recovery, carried to S4/S5; B4/B6/B10.                                                              |
| [PREETS-ONSITE-009](../requirements/data-input/PREETS-ONSITE-009.md)           | 5  | Planned — S2/S3/S4/S5; affected B gates unresolved       | S2/S3 real authoritative idle deadline unchanged by automatic heartbeat; consume #153/#155.                                                                   |
| [PREETS-ONSITE-009](../requirements/data-input/PREETS-ONSITE-009.md)           | 6  | Planned — S2/S3/S4/S5; affected B gates unresolved       | S3/S4 reachable heartbeat with independently failed creation/update and no false acknowledgement; S5 write handling follows B2/B5.                            |
| [PREETS-HIPAA-002](../requirements/security/PREETS-HIPAA-002.md)               | 1  | Planned — S1/S3/S4/S5/S6; affected B gates unresolved    | Verified identity/tenant and approved people/program rights on all real paths; B4/B7.                                                                         |
| [PREETS-HIPAA-002](../requirements/security/PREETS-HIPAA-002.md)               | 2  | Planned — S1/S3/S4/S5/S6; affected B gates unresolved    | Direct denied/revoked/bypass access with no content/mutation; B4 revocation scope, B10 composition.                                                           |
| [PREETS-HIPAA-002](../requirements/security/PREETS-HIPAA-002.md)               | 3  | Planned — S1/S3/S4/S5/S6; affected B gates unresolved    | Distinct people in same tenant remain distinguishable in identity and selected S6 activity evidence; B4/B7.                                                   |
| [PREETS-HIPAA-003](../requirements/security/PREETS-HIPAA-003.md)               | 1  | Planned — S1/S2/S3/S4/S5/S6; affected B gates unresolved | S6 enforces approved purposes/recipient/field mappings on actual on-site outputs; B7.                                                                         |
| [PREETS-HIPAA-003](../requirements/security/PREETS-HIPAA-003.md)               | 2  | Planned — S1/S2/S3/S4/S5/S6; affected B gates unresolved | Synthetic markers inspect actual forms/API/diagnostics/logs/traces/heartbeat and any used analytics/support outputs; B7.                                      |
| [PREETS-HIPAA-003](../requirements/security/PREETS-HIPAA-003.md)               | 3  | Planned — S1/S2/S3/S4/S5/S6; affected B gates unresolved | Real unpermitted-use/recipient denial and applicable minimum-necessary limits/exceptions; B7 policy prerequisite.                                             |
| [PREETS-HIPAA-004](../requirements/security/PREETS-HIPAA-004.md)               | 1  | Planned — S6; affected B gates unresolved                | Real selected access/change/delete/undo/program activity produces independently checked actor/target/time/action/outcome; B7.                                 |
| [PREETS-HIPAA-004](../requirements/security/PREETS-HIPAA-004.md)               | 2  | Planned — S6; affected B gates unresolved                | Real audit-storage integrity and authorized retrieval after deletion; deny unauthorized read/alter/delete; B7.                                                |
| [PREETS-HIPAA-005](../requirements/security/PREETS-HIPAA-005.md)               | 1  | Planned — S1/S4/S5/S6; affected B gates unresolved       | Selected controls exercised with real record adapters and application transfers; B2/B7; deployed transport evidence B9 remains outside this slice.            |
| [PREETS-HIPAA-005](../requirements/security/PREETS-HIPAA-005.md)               | 2  | Planned — S1/S4/S5/S6; affected B gates unresolved       | Unauthorized state unchanged; approved interrupted/conflicting-write outcomes and successful update/delete/undo preserve associations/values; B2/B4/B5.       |
| [PREETS-HIPAA-006](../requirements/security/PREETS-HIPAA-006.md)               | 1  | Planned — S3/S4/S5/S6; affected B gates unresolved       | Actual selected browser/application copy/cache/transfer safeguards; B7; infrastructure interfaces assessed separately under B9. No export feature introduced. |
| [PREETS-HIPAA-006](../requirements/security/PREETS-HIPAA-006.md)               | 2  | Planned — S3/S4/S5/S6; affected B gates unresolved       | Incomplete/disabled input and displays protected through logout/expiry/failure/recovery/shared-device use; B6/B7/B10.                                         |
| [PREETS-HIPAA-006](../requirements/security/PREETS-HIPAA-006.md)               | 3  | Planned — S3/S4/S5/S6; affected B gates unresolved       | Denied application data/key access and protected-interface use; B4/B7, deployed protections prerequisite B9.                                                  |
| [PREETS-HIPAA-011](../requirements/security/PREETS-HIPAA-011.md)               | 1  | Planned — S5/S6; affected B gates unresolved             | Persistent ordinarily deleted records remain identity/tenant protected; no ordinary-delete final disposal. AC 2–4 outside selection, gated by B8.             |

## Review and planning gaps

Delivery-plan drafting and a delivery-review pass are advisory. Maintainer review/merge approves the decomposition;
it does not resolve B1–B10 or grant publication authorization. Every on-site AC and selected safeguard AC has a
planned responsible boundary and named remaining conditions. Existing code, PR descriptions, issue closure and
repository checks are not workflow verification evidence.

The blocking product decisions remain participant association, save/failure/concurrency behavior, time rules,
backend identity/denial/revocation, undo interaction, heartbeat thresholds/recovery, and applicable data-handling/
audit policies. Named individuals and decision references have not been supplied. Broader application safeguards
and infrastructure have no delivery issue assigned by this plan; B8/B9 must be assigned and evidenced before PHI use.

Issue proposals include revision-pinned source links. Their approved plan permalinks and actual child/blocking URLs
can only be finalized after this plan has a remotely accessible approved revision and publication is explicitly
authorized. Read-only issue searches and the identified prototype inspection have the limits recorded above.
No requirement, application code, test, existing plan, issue or approval record is changed by this proposal.

### Draft review and document validation (2026-10-13)

The delivery-review pass checked the current-main promises, selected criteria, slice observations, persistent
harness progression, scope exclusions, genuine start dependencies, security prerequisites and proposed issue
bodies. No confirmed decomposition defect remains within that scope. B1–B10 remain unresolved decisions or
external delivery gates, and the publication permalink gap remains explicit. This was an agent review, not
maintainer approval or an independent runtime assessment.

Validation passed: `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm check:unused`, `pnpm check:changes`,
`pnpm format:check`, and `git diff --check`. A document-integrity check confirmed 55 unique selected AC rows
against `origin/main`, six slices/seven proposal identities, existing local link targets and revision-pinned
source targets. Dependencies were installed using the unchanged frozen lockfile. Formatting used a writable
temporary `DPRINT_CACHE_DIR` after the default cache path was sandbox-restricted. These checks establish
repository/document compatibility only. No workflow suite was executed; requirements evidence is unchanged.
