# Delivery plan: Tenant resolution pilot

**Status:** draft
**Planning date:** 2026-10-06
**Source revision:** [6058d10](https://github.com/PathableAI-org/Pre-ETS/commit/6058d1010dfc7a6f6800ac3d30cd6b6b1c61485e)
**Original implementation inspection revision:** [31e476c](https://github.com/PathableAI-org/Pre-ETS/commit/31e476c89efbe356c6b59fb75e4ead06d63667ca)
**Requirement decision revision:** [4eb0fa5](https://github.com/PathableAI-org/Pre-ETS/commit/4eb0fa5)
**Approval:** Pending renewed PR review. Original approval: [PR #108](https://github.com/PathableAI-org/Pre-ETS/pull/108), merged into `main` at
[f80179c](https://github.com/PathableAI-org/Pre-ETS/commit/f80179cbd4faf17ec286f67378db289234310177),
approves the parent and S1–S4 decomposition. Status normalized 2026-10-05 under the maintainer's direction that
merge into `main` is the review governance; the subsequent instruction to mark this plan reviewed is retained
as approval history. Documented deferrals and evidence limitations remain in effect.

## Goal

Deliver tenant-dependent frontend behavior with the intended configuration, approved failure outcomes, safe full
configuration diagnostics at the application boundary.

## Requirements in scope

All active tenant and security criteria are selected. Cloud infrastructure delivery is deferred because work on it
has not started. PREETS-INFRA-001 remains accepted but is outside this delivery effort; no ingress implementation,
Sentinel gate, deployed ingress suite, or infrastructure review instructions are proposed here. Production exposure
of diagnostics still depends on that separate future infrastructure work; this plan covers direct application
behavior, including production application mode, rather than a production deployment.

| Accepted requirement                                                        | Selected ACs |
| --------------------------------------------------------------------------- | ------------ |
| [PREETS-TENANT-003](../requirements/tenant-resolution.md#preets-tenant-003) | 1–4          |
| [PREETS-TENANT-004](../requirements/tenant-resolution.md#preets-tenant-004) | 1–5          |
| [PREETS-TENANT-005](../requirements/tenant-resolution.md#preets-tenant-005) | 1–5          |
| [PREETS-TENANT-006](../requirements/tenant-resolution.md#preets-tenant-006) | 1–6          |
| [PREETS-SECURITY-001](../requirements/security.md#preets-security-001)      | 1–3          |

TENANT-001/002 are superseded history, not delivery scope. No proposed requirement is promoted to accepted work.

## Current observations and existing work

Inspection on the source revision above found:

- [Tenant service](../../packages/frontend/src/lib/tenant/service.ts) already exposes alias and file retrieval;
  [loader](../../packages/frontend/src/lib/tenant/config.ts) uses Effect Schema. Reuse these boundaries where suitable.
- [Host parsing](../../packages/frontend/src/lib/tenant/alias.ts) currently takes the first dot-delimited label and
  lowercases it. [Mode configuration](../../packages/frontend/src/lib/config/tenant-config.ts) lacks `BASE_HOSTNAME`.
  These observations identify work against the accepted literal-pattern contract.
- [Proxy](../../packages/frontend/src/proxy.ts) matches only root and auth callback, contains a dummy anonymous
  springfield path, and retains tenant failure 403 handling. [Compatibility operations](../../packages/frontend/src/lib/tenant/index.ts)
  are marked as refactoring, report host-associated origin, and do not translate all service failures into public outcomes.
  Inspect current request consumers before expanding integration; do not widen resolution to tenant-independent requests.
- [Tenant schema](../../packages/frontend/src/lib/tenant/schema.ts) has explicit fields; [OIDC secrets](../../packages/frontend/src/lib/oidc/secrets.ts)
  already use a separate server-only provider. Neither observation proves rejection of all forbidden configuration content.
- [Public tenant tests](../../packages/frontend/tests/unit/tenant-public.test.ts) and
  [host-isolation scenarios](../../features/capabilities/tenant-access/host-isolation.feature) are existing assets.
  No runtime execution is claimed here; their coverage must be reassessed against active criteria.
- Repository search found no diagnostic route, Terraform/Sentinel assets, or production ingress implementation.
  External infrastructure existence and ownership remain unknown.
- Read-only `gh issue list --state open --limit 100` on 2026-10-03 returned only
  [Dependency Dashboard #5](https://github.com/PathableAI-org/Pre-ETS/issues/5). No duplicate open tenant delivery issue
  was found within that repository listing. Closed issues and external project work were not audited.

No criterion is classified as already verified. Runtime evidence and deployed infrastructure were not inspected.
Documentation pins still mention Effect RC113 while the source manifest pins 4.0.0; future code work must verify installed
APIs and resolve relevant guidance drift without changing approved requirements.

## Decisions and remaining limits

- **B1 resolved — maintainer direction, 2026-10-03:** directory configuration/access failures return HTTP 500 in
  both modes. With a usable directory, missing host files and unreadable/malformed selected files in either mode
  return ordinary HTTP 404 without fallback. Missing static files retain HTTP 500. See
  [TENANT-004](../requirements/tenant-resolution.md#preets-tenant-004). No configured-tenant registry is needed.
- **B2 provider scope resolved — maintainer direction, 2026-10-03:** avoid secret dependencies where possible;
  permitted tenant files contain non-secret lookup keys when needed. A vendor-agnostic server-only provider resolves
  those keys; credentials and resolved values remain outside configuration and diagnostics. See
  [SECURITY-001](../requirements/security.md#preets-security-001). Concrete provider selection/integration is deferred
  until cloud infrastructure work begins. A deterministic provider supports current contract verification.
- **Remaining external-content limit:** shared schema checks cannot detect all secrets pasted into allowed text.
  Producer controls and their evidence remain an open requirement question, not a concrete provider selection blocker.

These decisions resolve policy gates without establishing runtime verification.

## Revision authorization and inspection

The maintainer explicitly authorized this revised sequence, three new child issues, revisions to #115–#119,
and replacement of obsolete plan-owned blocking relationships during the pending PR on 2026-10-06.
The prior PR #108 approval applies to the original S1–S4 decomposition. This changed proposal awaits renewed PR review.
Requirement promises, lifecycle, and verification values are unchanged.

Current inspection found all five mapped issues open, with no completion checkboxes selected. The full repository
issue listing included open and closed issues; no competing tenant plan/slice identities were found. Native
containment and the original S1–S4 dependency edges matched the publication record. Current tenant service still
exposes alias and file retrieval, mode configuration still lacks BASE_HOSTNAME, and no diagnostic route exists.
These are implementation observations, not runtime verification. The old Effect version observation is historical;
current manifests pin 4.0.1. This revision introduces no Effect code or production behavior.

## Delivery sequence

S5 → S6 → S7 → S1 → S2 → S3. S4 can start independently and must complete before S1 discloses configuration.
Slice IDs preserve existing publication identities; their numeric order does not define execution order.

Temporary JSON in S5–S7 is construction evidence only. S1 replaces it with the complete parsed tenant configuration,
without a metadata envelope, mode field, or path field added to the final contract. Keep the same running-application
harness, independent fixtures, host/static scenarios, and no-store assertions as the observations evolve.
No full configuration disclosure ships before S4 controls are implemented and verified. Production deployment and
ingress protection remain outside this effort.

## Delivery slices and proposed issues

### S5 — Establish the tenant diagnostic HTTP observation boundary

**Proposed issue title:** Establish the tenant diagnostic HTTP observation boundary

**Delivery references:** https://github.com/PathableAI-org/Pre-ETS/issues/125

#### Outcome

A running frontend exposes GET /_test/tenant-config with HTTP 200 and Cache-Control: no-store.

#### Requirements

- [PREETS-TENANT-006](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-006) AC 5, 6 (enabling; final configuration and errors remain S1/S3)

#### In scope

Add the route in all application environments, including production application mode, and the reusable running-HTTP harness. Use temporary empty JSON; do not read or disclose tenant files yet.

#### Out of scope

Mode reading, alias/file selection, configuration disclosure, tenant request integration, and failure policy.

#### Dependencies

Can start independently.

#### Completion evidence

**Observable increment:** Actual route availability, status, and no-store header from a running application.

**Evidence progression:** Run the HTTP harness in development and production application modes; assert 200 and no-store. Preserve route invocation and header assertions for later slices. Empty JSON is an enabling response, not final tenant configuration evidence; S6/S7 evolve it and S1 replaces it.

Implementation must be merged and executed evidence recorded with revision, covered conditions, and limitations. Issue closure does not update requirement verification.

#### Delivery plan

Tenant resolution pilot, slice S5. Revised proposal pending PR review; prior PR #108 approved the original decomposition.

### S6 — Observe the effective tenant resolution mode

**Proposed issue title:** Observe the effective tenant resolution mode

**Delivery references:** https://github.com/PathableAI-org/Pre-ETS/issues/126

#### Outcome

The diagnostic response reports the effective mode read from actual application configuration.

#### Requirements

- [PREETS-TENANT-003](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-003) AC 1, 3 (mode configuration only; selection remains S7)
- [PREETS-TENANT-006](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-006) AC 1–3 (enabling only)

#### In scope

Wire the diagnostic consumer to the shared application configuration boundary and temporarily return JSON with resolutionMode equal to host or static. Observe each mode through separately configured running applications. Preserve existing configuration prerequisites; do not invent defaults or new invalid-setting policy.

#### Out of scope

File selection/loading, secret disclosure, and final configuration response.

#### Dependencies

[S5 #125](https://github.com/PathableAI-org/Pre-ETS/issues/125)

#### Completion evidence

**Observable increment:** Mode changes follow application settings rather than a fixture echo or independent diagnostic lookup.

**Evidence progression:** Extend S5 scenarios to assert resolutionMode for host and static applications while retaining 200/no-store checks. Use valid prerequisites for each application. Mode assertions establish this increment only; S7 extends the response and S1 removes metadata assertions in favor of independent full-file comparison.

Implementation must be merged and executed evidence recorded with revision, covered conditions, and limitations. Issue closure does not update requirement verification.

#### Delivery plan

Tenant resolution pilot, slice S6. Revised proposal pending PR review; prior PR #108 approved the original decomposition.

### S7 — Observe the selected tenant configuration file

**Proposed issue title:** Observe the selected tenant configuration file

**Delivery references:** https://github.com/PathableAI-org/Pre-ETS/issues/127

#### Outcome

Normal request selection identifies the intended tenant configuration path in both modes.

#### Requirements

- [PREETS-TENANT-003](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-003) AC 1, 3 (selection only)
- [PREETS-TENANT-004](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-004) AC 2, 3 (directory/selector only; loading and failures remain S1/S3)
- [PREETS-TENANT-006](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-006) AC 2, 3 (enabling selection evidence only)

#### In scope

Require BASE_HOSTNAME only in host mode and TENANT_STATIC_ALIAS only in static mode; require TENANT_CONFIG_DIR in both. Apply literal alias/base parsing and shared alias-to-file selection. Temporarily return resolutionMode and configPath from that normal selection without reading file content. No separate tenant registry or diagnostic-only selector.

#### Out of scope

Full file disclosure, HTTP failure matrix, and integration into remaining frontend/auth consumers.

#### Dependencies

[S6 #126](https://github.com/PathableAI-org/Pre-ETS/issues/126)

#### Completion evidence

**Observable increment:** Actual requests select independently expected {TENANT_CONFIG_DIR}/{alias}.json paths.

**Evidence progression:** Extend the same harness with two distinguishable tenants, interleaved host requests, and varied static hosts without BASE_HOSTNAME. Calculate expected paths directly from supplied fixtures/settings, not application helpers or responses. Add public configuration-boundary prerequisite checks where they provide distinct evidence. Keep host/static scenarios; S1 replaces path assertions with parsed-content equality. File presence and retrieval remain unproven.

Implementation must be merged and executed evidence recorded with revision, covered conditions, and limitations. Issue closure does not update requirement verification.

#### Delivery plan

Tenant resolution pilot, slice S7. Revised proposal pending PR review; prior PR #108 approved the original decomposition.

### S4 — Establish the non-secret tenant configuration contract before disclosure

**Proposed issue title:** Establish the non-secret tenant configuration contract before disclosure

**Delivery references:** https://github.com/PathableAI-org/Pre-ETS/issues/119

#### Outcome

The real loader enforces permitted non-secret configuration and required secrets remain server-only.

#### Requirements

- [PREETS-SECURITY-001](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/security.md#preets-security-001) AC 1, 2; 3 enabling preservation of full permitted schema (diagnostic comparison remains S1)

#### In scope

Explicit permitted Effect Schema fields reject unexpected fields at relevant nested boundaries. Permit non-secret lookup keys; implement a vendor-agnostic server-only provider contract and deterministic verification implementation. Add scoped production configuration Copilot guidance covering field meaning, nested flow, tenant Config.secret fields, separate secret resolution, and full diagnostic JSON.

#### Out of scope

Diagnostic route construction, concrete cloud/Kubernetes/Docker provider integration, redaction DTOs, ingress, and claims that schema detects every secret in allowed text.

#### Dependencies

Can start independently.

#### Completion evidence

**Observable increment:** Real loader rejection and public server-only provider outcomes are observable without waiting for the diagnostic route.

**Evidence progression:** Vitest with @effect/vitest exercises the real loader with permitted/forbidden nested fields and a deterministic provider with synthetic secrets. Assert configuration values contain permitted keys but no resolved values or provider credentials. Retain these tests; S1 adds actual diagnostic absence and full-JSON comparisons. Schema/fixtures and advisory review do not establish all external content safe. S4 implementation and its executed controls are a prerequisite to S1 disclosure.

Implementation must be merged and executed evidence recorded with revision, covered conditions, and limitations. Issue closure does not update requirement verification.

#### Delivery plan

Tenant resolution pilot, slice S4. Revised proposal pending PR review; prior PR #108 approved the original decomposition.

### S1 — Load and expose the selected non-secret tenant configuration

**Proposed issue title:** Load and expose the selected non-secret tenant configuration

**Delivery references:** https://github.com/PathableAI-org/Pre-ETS/issues/116

#### Outcome

Normal diagnostic request context returns the complete parsed selected configuration.

#### Requirements

- [PREETS-TENANT-003](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-003) AC 1, 3
- [PREETS-TENANT-004](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-004) AC 1–3 (successful retrieval; directory failure outcomes remain S3)
- [PREETS-TENANT-006](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-006) AC 1–3, 5; 6 success only
- [PREETS-SECURITY-001](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/security.md#preets-security-001) AC 2 diagnostic absence; 3 full configuration

#### In scope

Connect normal request selection to the real loader, reuse shared configuration/context boundaries, and return full permitted parsed JSON. Replace all intermediate mode/path fields and the temporary response shape; no envelope or redaction DTO. Verify direct production application availability. Security controls must already be implemented and verified.

#### Out of scope

Remaining frontend/auth consumer integration, final failure matrix, production deployment/ingress, and concrete provider selection.

#### Dependencies

[S7 #127](https://github.com/PathableAI-org/Pre-ETS/issues/127); [S4 #119](https://github.com/PathableAI-org/Pre-ETS/issues/119)

#### Completion evidence

**Observable increment:** Diagnostic JSON equals independently parsed expected files for the actual request tenant.

**Evidence progression:** Extend S5–S7 HTTP scenarios and fixtures to compare complete parsed values for two tenants/interleaved requests and static mode with varied hosts and no BASE_HOSTNAME. Independently parse files; never derive expected values from selection helpers or the response. Repeat production mode and retain success/no-store assertions. Supply synthetic secrets through the deterministic provider and verify credentials/resolved values never appear. Keep useful loader tests from S4. Failure matrix remains S3; diagnostic JSON does not prove user behavior.

Implementation must be merged and executed evidence recorded with revision, covered conditions, and limitations. Issue closure does not update requirement verification.

#### Delivery plan

Tenant resolution pilot, slice S1. Revised proposal pending PR review; prior PR #108 approved the original decomposition.

### S2 — Establish tenant context before remaining tenant-dependent frontend behavior

**Proposed issue title:** Establish tenant context before remaining tenant-dependent frontend behavior

**Delivery references:** https://github.com/PathableAI-org/Pre-ETS/issues/117

#### Outcome

Authenticated requests and configuration-consuming authentication/frontend flows establish normal tenant context before using it.

#### Requirements

- [PREETS-TENANT-003](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-003) AC 2, 4

#### In scope

Inventory remaining tenant-dependent paths and integrate the same selection/retrieval context used by diagnostics. Eliminate dummy proxy substitution on accepted paths. Preserve authentication/session compatibility and tenant-independent asset/framework/health controls.

#### Out of scope

Separate diagnostic lookup, unrelated authentication policy, and final browser failure presentation.

#### Dependencies

[S1 #116](https://github.com/PathableAI-org/Pre-ETS/issues/116)

#### Completion evidence

**Observable increment:** Actual frontend/auth consumers use the selected values before tenant-dependent behavior.

**Evidence progression:** Retain S1 diagnostic suite; add distinct running HTTP/authentication and configuration-consuming frontend evidence using interleaved distinguishable tenants and independent-request controls. Identify seeded versus real authentication limitations. Diagnostic context was established in S7/S1; diagnostic JSON alone does not prove these consumer behaviors.

Implementation must be merged and executed evidence recorded with revision, covered conditions, and limitations. Issue closure does not update requirement verification.

#### Delivery plan

Tenant resolution pilot, slice S2. Revised proposal pending PR review; prior PR #108 approved the original decomposition.

### S3 — Complete approved tenant HTTP and browser failure outcomes

**Proposed issue title:** Complete approved tenant HTTP and browser failure outcomes

**Delivery references:** https://github.com/PathableAI-org/Pre-ETS/issues/118

#### Outcome

Tenant-dependent requests and diagnostics return approved 404/500 outcomes without fallback and ordinary browser not-found presentation.

#### Requirements

- [PREETS-TENANT-004](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-004) AC 2, 4, 5
- [PREETS-TENANT-005](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-005) AC 1–5
- [PREETS-TENANT-006](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-006) AC 4; 6 failed responses

#### In scope

Map directory configuration/access failures to 500 in both modes; with usable directory, missing host files and unreadable/invalid-JSON/schema-invalid selected files in either mode to ordinary 404. Missing static file is 500. Host pattern mismatch is 404; static hosts are exempt. Apply no-store to diagnostic errors and ordinary missing-page browser presentation.

#### Out of scope

Configured-tenant membership registry, unrelated auth policy, and infrastructure ingress.

#### Dependencies

[S1 #116](https://github.com/PathableAI-org/Pre-ETS/issues/116); [S2 #117](https://github.com/PathableAI-org/Pre-ETS/issues/117)

#### Completion evidence

**Observable increment:** Actual HTTP statuses and no-store on diagnostic failures, plus browser presentation matching an ordinary absent page.

**Evidence progression:** Extend the retained HTTP suite with missing directory setting, nonexistent/non-directory/unreadable directories in both modes as 500. Establish usable directory before missing host file or unreadable/malformed file cases as 404; separately verify static missing-file 500. Detect fallback with distinguishable tenants; repeat invalid hosts successfully in static mode. Compare invalid-tenant navigation with ordinary missing-page navigation on valid tenant. Retain success/content tests; domain errors alone do not prove HTTP status.

Implementation must be merged and executed evidence recorded with revision, covered conditions, and limitations. Issue closure does not update requirement verification.

#### Delivery plan

Tenant resolution pilot, slice S3. Revised proposal pending PR review; prior PR #108 approved the original decomposition.

## Cross-cutting concerns and proposed parent

**Proposed parent title:** Deliver the accepted tenant resolution and diagnostic requirements

**Delivery references:** https://github.com/PathableAI-org/Pre-ETS/issues/115

Containment: S1–S7 are children of this parent. Blocking edges: S6 by S5; S7 by S6; S1 by S7 and S4;
S2 by S1; S3 by S1 and S2. Parent containment is not blocking. S4 has no start prerequisite.

Shared HTTP harness/fixtures start in S5 and evolve in S6/S7/S1/S3. S2 adds distinct consumer evidence rather
than repeating the diagnostic matrix. Final shipping requires all selected criteria, security controls before
full disclosure, ordinary failure behavior, production application verification, and attributable completion
references. Production deployment/ingress is deferred; this effort cannot establish ingress protection.

## Coverage review

All evidence is planned; no reviewed runtime execution is claimed. Early slices support criteria without completing
them. The following rows identify final responsible work as well as enabling increments.

| Requirement         | AC | Disposition and slices | Planned evidence and remaining conditions                                  |
| ------------------- | -- | ---------------------- | -------------------------------------------------------------------------- |
| PREETS-TENANT-003   | 1  | Planned S6/S7/S1       | Mode, literal host selection, interleaved configuration HTTP comparison    |
| PREETS-TENANT-003   | 2  | Planned S7/S1/S2       | Normal diagnostic context plus authenticated/consuming-auth behavior       |
| PREETS-TENANT-003   | 3  | Planned S6/S7/S1       | Static selection for varied hosts without BASE_HOSTNAME                    |
| PREETS-TENANT-003   | 4  | Planned S2             | Configuration-consuming frontend outcomes and independent controls         |
| PREETS-TENANT-004   | 1  | Planned S1/S2          | Independent parsed values and consuming frontend behavior                  |
| PREETS-TENANT-004   | 2  | Planned S7/S1/S3       | Required directory; actual directory-failure 500 in both modes             |
| PREETS-TENANT-004   | 3  | Planned S7/S1          | Static path then actual parsed file content                                |
| PREETS-TENANT-004   | 4  | Planned S3             | Missing static file actual 500 without fallback                            |
| PREETS-TENANT-004   | 5  | Planned S3             | Usable directory file failures actual 404; static missing exception        |
| PREETS-TENANT-005   | 1  | Planned S7/S3          | Literal pattern selection then mismatch actual 404                         |
| PREETS-TENANT-005   | 2  | Planned S3             | Unknown alias/missing host file actual 404                                 |
| PREETS-TENANT-005   | 3  | Planned S3             | No fallback for invalid host and missing tenant                            |
| PREETS-TENANT-005   | 4  | Planned S3             | Browser ordinary missing-page comparison                                   |
| PREETS-TENANT-005   | 5  | Planned S7/S1/S3       | Static host exemption; approved directory/file errors                      |
| PREETS-TENANT-006   | 1  | Planned S5/S6/S7/S1    | Temporary observations replaced by full independently parsed JSON          |
| PREETS-TENANT-006   | 2  | Planned S7/S1          | Interleaved requests through normal shared context                         |
| PREETS-TENANT-006   | 3  | Planned S7/S1          | Static full configuration for varied hosts                                 |
| PREETS-TENANT-006   | 4  | Planned S3             | Actual approved 404/500 outcomes                                           |
| PREETS-TENANT-006   | 5  | Planned S5/S1          | Production route availability then final production JSON                   |
| PREETS-TENANT-006   | 6  | Planned S5/S1/S3       | No-store retained on success and extended to all failures                  |
| PREETS-SECURITY-001 | 1  | Planned S4             | Real loader permitted/nested forbidden fields; external content limitation |
| PREETS-SECURITY-001 | 2  | Planned S4/S1          | Server-only provider; actual diagnostic absence of values/credentials      |
| PREETS-SECURITY-001 | 3  | Planned S4/S1          | Permitted schema preserved; full JSON without redaction                    |

## Review and planning gaps

Applied the revised delivery-plan skill to regenerate this decomposition and delivery-review to walk the execution
order on 2026-10-06. All 23 selected criteria have responsible final evidence; every intermediate slice names its
available observation, carried-forward harness/tests, and unfinished claims. Review moved diagnostic context into
S7/S1, kept full disclosure behind S4, and assigned final diagnostic equality/secret-absence checks to S1 so S4 does
not depend on its own disclosure consumer. The graph is acyclic and S4 can execute independently.

The mode/path metadata is explicitly temporary and removed by S1. S5–S7 evidence does not establish the final
configuration response or failure contract. No extra permanent helper tests are mandated. No unexplained coverage
gap remains within this planning review. External content controls remain unresolved evidence limitations, and
cloud ingress/concrete provider integration remain deferred. Current proposal awaits renewed PR review.

## Current revision publication

**Authorization:** Maintainer implementation request, 2026-10-06, explicitly includes live issue and edge revisions.
**Proposal revision:** [2f63a9846f52330c0385c3a26651d17967e5678a](https://github.com/PathableAI-org/Pre-ETS/blob/2f63a9846f52330c0385c3a26651d17967e5678a/docs/delivery/tenant-resolution.md)
**Inspection date:** 2026-10-06
**Publication assessment:** All eight bodies, seven native containment edges, and seven blocking edges verified. Revised proposal remains draft pending PR review.

| Identity | Issue URL                                            | Observed state |
| -------- | ---------------------------------------------------- | -------------- |
| S4       | https://github.com/PathableAI-org/Pre-ETS/issues/119 | open           |
| S3       | https://github.com/PathableAI-org/Pre-ETS/issues/118 | open           |
| S2       | https://github.com/PathableAI-org/Pre-ETS/issues/117 | open           |
| S1       | https://github.com/PathableAI-org/Pre-ETS/issues/116 | open           |
| parent   | https://github.com/PathableAI-org/Pre-ETS/issues/115 | open           |
| S5       | https://github.com/PathableAI-org/Pre-ETS/issues/125 | open           |
| S6       | https://github.com/PathableAI-org/Pre-ETS/issues/126 | open           |
| S7       | https://github.com/PathableAI-org/Pre-ETS/issues/127 | open           |

**Confirmed actions:**

- Created S5 https://github.com/PathableAI-org/Pre-ETS/issues/125
- Created S6 https://github.com/PathableAI-org/Pre-ETS/issues/126
- Created S7 https://github.com/PathableAI-org/Pre-ETS/issues/127
- Updated S5 body and links
- Updated S6 body and links
- Updated S7 body and links
- Updated S4 body and links
- Updated S1 body and links
- Updated S2 body and links
- Updated S3 body and links
- Updated parent body and child links
- Removed obsolete S4 blocked by S1
- Removed obsolete S4 blocked by S2
- Removed obsolete S4 blocked by S3
- Added parent containment for S5
- Added parent containment for S6
- Added parent containment for S7
- Added S6 blocked by S5
- Added S7 blocked by S6
- Added S1 blocked by S7
- Added S1 blocked by S4
- Read back all eight issue bodies/states, seven containment edges, and seven blocking edges

**Verified native containment:** Parent #115 contains S1–S7.

**Verified native blocking relationships:** S6 blocked by S5; S7 blocked by S6; S1 blocked by S7; S1 blocked by S4; S2 blocked by S1; S3 blocked by S1; S3 blocked by S2.

**Outstanding actions:** None for GitHub synchronization; renewed decomposition review remains pending.
**Failed or indeterminate action:** None.

## Original publication history

### Publication record

**Approved publication revision:** [f80179cbd4faf17ec286f67378db289234310177](https://github.com/PathableAI-org/Pre-ETS/blob/f80179cbd4faf17ec286f67378db289234310177/docs/delivery/tenant-resolution.md)
**Inspection date:** 2026-10-05
**Approval:** [Merged PR #108](https://github.com/PathableAI-org/Pre-ETS/pull/108)

Publication inspected all six existing repository issues, open and closed, on 2026-10-05 before creation;
no duplicate tenant delivery issue was found. Current `main` tenant/security requirements match the approved
criteria. External producers, runtime behavior, and deployed infrastructure remain outside this inspection.

| Identity | Issue URL                                            | Observed state |
| -------- | ---------------------------------------------------- | -------------- |
| parent   | https://github.com/PathableAI-org/Pre-ETS/issues/115 | open           |
| S1       | https://github.com/PathableAI-org/Pre-ETS/issues/116 | open           |
| S2       | https://github.com/PathableAI-org/Pre-ETS/issues/117 | open           |
| S3       | https://github.com/PathableAI-org/Pre-ETS/issues/118 | open           |
| S4       | https://github.com/PathableAI-org/Pre-ETS/issues/119 | open           |

**Verified native relationships:** parent contains S1; parent contains S2; parent contains S3; parent contains S4; S2 blocked by S1; S3 blocked by S1; S3 blocked by S2; S4 blocked by S1; S4 blocked by S2; S4 blocked by S3.

**Outstanding native relationships:** None.

**Last confirmed action:** Verified S4 body and links

**Failed or indeterminate action:** None

**Approved deferrals:** Cloud infrastructure/production ingress and concrete secrets-provider integration remain outside this effort. No adopted parent or slice is deferred or left unissued.
