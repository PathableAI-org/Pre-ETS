# Delivery plan: Tenant resolution pilot

**Status:** issued
**Planning date:** 2026-10-03
**Source revision:** [31e476c](https://github.com/PathableAI-org/Pre-ETS/commit/31e476c89efbe356c6b59fb75e4ead06d63667ca)
**Requirement decision revision:** [4eb0fa5](https://github.com/PathableAI-org/Pre-ETS/commit/4eb0fa5)
**Approval:** [PR #108](https://github.com/PathableAI-org/Pre-ETS/pull/108), merged into `main` at
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

These decisions resolve policy gates without approving this delivery decomposition or establishing runtime verification.

## Delivery slices and proposed issues

Issue bodies below use the delivery issue template. Requirement links are pinned to the decision revision;
implementation observations retain their original source revision. They are
approved proposals with actual GitHub issue mappings below. Planned evidence is part of each slice; shared fixtures/harness adaptation
belongs to S4 rather than a separate blanket testing issue.

### S1 — Select and retrieve the intended tenant configuration

**Proposed issue title:** Select and retrieve the intended tenant configuration

**Delivery references:** https://github.com/PathableAI-org/Pre-ETS/issues/116

#### Outcome

Frontend consumers obtain the intended configuration in host and static modes.

#### Requirements

- [PREETS-TENANT-003](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-003) AC 1, 3
- [PREETS-TENANT-004](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-004) AC 1–3

#### In scope

Require BASE_HOSTNAME only in host mode; parse the literal alias/base pattern; require the directory in both modes and the static selector only in static mode. Preserve alias-to-file selection and interleaved isolation.

#### Out of scope

Request/auth integration, diagnostics, and HTTP failure mapping owned by S3.

#### Dependencies

Selection/retrieval work can start independently; S3 maps directory/file failures. No separate membership registry is required.

#### Completion evidence

Public-service and configuration-boundary scenarios with two distinguishable tenants; running HTTP evidence is completed with S2/S4. Verify static selection without BASE_HOSTNAME. Existing helpers are reusable, not accepted execution evidence. Implementation must be merged and its executed evidence recorded with revision, scope, and limitations. Issue closure does not update requirement verification.

#### Delivery plan

Tenant resolution pilot, slice S1. Published issues link the approved committed plan revision `f80179cbd4faf17ec286f67378db289234310177`.

### S2 — Establish tenant context before tenant-dependent frontend behavior

**Proposed issue title:** Establish tenant context before tenant-dependent frontend behavior

**Delivery references:** https://github.com/PathableAI-org/Pre-ETS/issues/117

#### Outcome

Authenticated requests, consuming authentication flows, and diagnostics obtain normal selected tenant context before consuming configuration.

#### Requirements

- [PREETS-TENANT-003](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-003) AC 2, 4

#### In scope

Inventory tenant-dependent request paths; integrate the shared selection/retrieval capability and normal context. Ensure the dummy proxy cannot substitute tenant context on accepted delivery paths. Include tenant-independent asset/health controls.

#### Out of scope

Diagnostic response construction and HTTP failure mapping owned by S3.

#### Dependencies

S1 capability required for integration; coordinate S3 failure mapping and S4 diagnostic context.

#### Completion evidence

Running HTTP/authentication and configuration-consuming frontend observations with interleaved distinguishable tenants. Exercise representative authenticated paths and tenant-independent controls; diagnostic JSON alone cannot prove user behavior. Implementation must be merged and its executed evidence recorded with revision, scope, and limitations. Issue closure does not update requirement verification.

#### Delivery plan

Tenant resolution pilot, slice S2. Published issues link the approved committed plan revision `f80179cbd4faf17ec286f67378db289234310177`.

### S3 — Return the approved tenant failure outcomes

**Proposed issue title:** Return the approved tenant failure outcomes

**Delivery references:** https://github.com/PathableAI-org/Pre-ETS/issues/118

#### Outcome

Invalid host-mode tenants and unreadable/malformed selected files receive ordinary HTTP/browser not-found behavior. Directory configuration/access failures in either mode and missing static files receive HTTP 500 without fallback.

#### Requirements

- [PREETS-TENANT-004](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-004) AC 2, 4, 5
- [PREETS-TENANT-005](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-005) AC 1–5

#### In scope

Implement directory failures as 500 in both modes; with a usable directory, map missing host files and unreadable/malformed files in either mode to ordinary 404. Preserve missing static-file 500, static host exemption, no fallback, and ordinary missing-page presentation.

#### Out of scope

A separate configured-tenant registry and unrelated authentication failure policy.

#### Dependencies

S1/S2 integration; directory/file response policy is resolved by B1.

#### Completion evidence

Actual HTTP 404/500 status and no fallback; browser comparison with ordinary missing-page navigation; static mode repeats invalid hosts successfully. Exercise missing settings, nonexistent/non-directory/unreadable directories in both modes as 500. With a usable directory, exercise missing host files and unreadable/invalid-JSON/schema-invalid files as 404; verify static missing-file 500 separately. Implementation must be merged and its executed evidence recorded with revision, scope, and limitations. Issue closure does not update requirement verification.

#### Delivery plan

Tenant resolution pilot, slice S3. Published issues link the approved committed plan revision `f80179cbd4faf17ec286f67378db289234310177`.

### S4 — Expose safe tenant configuration through the normal diagnostic context

**Proposed issue title:** Expose safe tenant configuration through the normal diagnostic context

**Delivery references:** https://github.com/PathableAI-org/Pre-ETS/issues/119

#### Outcome

The diagnostic endpoint returns full permitted non-secret configuration from normal request resolution with no-store responses.

#### Requirements

- [PREETS-TENANT-006](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-006) AC 1–6
- [PREETS-SECURITY-001](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/security.md#preets-security-001) AC 1–3

#### In scope

Enforce explicit permitted Effect Schema fields and unexpected-field rejection at relevant nested boundaries; permit non-secret lookup keys and resolve them through a vendor-agnostic server-only provider contract, with a deterministic verification implementation. Add GET /_test/tenant-config in all application environments and no-store on success/404/500. Add scoped production configuration Copilot guidance as delivery work.

#### Out of scope

Concrete cloud/Kubernetes/Docker provider selection or integration, redaction DTOs, environment gating, production ingress rules, and claims that validation detects secrets inside every allowed string.

#### Dependencies

S1/S2/S3 for complete route behavior; directory/file policy is resolved. Implement and verify the security contract before shipping disclosure. Production deployment is outside this effort; future ingress protection remains required before production exposure. Concrete provider integration is deferred; external-content safety remains an explicit evidence limitation.

#### Completion evidence

Vitest with @effect/vitest exercises the real loader with permitted and forbidden nested fields. Compare complete diagnostic JSON with independently parsed expected files. Resolve synthetic lookup keys through the deterministic server-only provider; returned JSON includes the permitted keys but never resolved secret values or provider credentials. Repeat direct application tests in production mode and check no-store on approved error outcomes; fixture checks do not prove all external content safe. Implementation must be merged and its executed evidence recorded with revision, scope, and limitations. Issue closure does not update requirement verification.

#### Delivery plan

Tenant resolution pilot, slice S4. Published issues link the approved committed plan revision `f80179cbd4faf17ec286f67378db289234310177`.

## Cross-cutting concerns and proposed parent

**Proposed parent title:** Deliver the accepted tenant resolution and diagnostic requirements

**Delivery references:** https://github.com/PathableAI-org/Pre-ETS/issues/115

### Outcome

Coordinate delivery of the selected tenant configuration, request integration, failure behavior, safe diagnostic,
and diagnostic application outcomes.

### Requirements

- [PREETS-TENANT-003](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-003) AC 1–4
- [PREETS-TENANT-004](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-004) AC 1–5
- [PREETS-TENANT-005](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-005) AC 1–5
- [PREETS-TENANT-006](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/tenant-resolution.md#preets-tenant-006) AC 1–6
- [PREETS-SECURITY-001](https://github.com/PathableAI-org/Pre-ETS/blob/4eb0fa5/docs/requirements/security.md#preets-security-001) AC 1–3

### In scope

Contain proposed children S1–S4 and apply resolved decisions B1–B2, compatibility with auth/session consumers, fixture/harness
adaptation, and production configuration review guidance. Verify direct application behavior; cloud infrastructure
and production rollout belong to a later effort.

### Out of scope

Projects automation, RTM generation, requirement approval by issue closure, historical Spec Kit synchronization, and
cloud infrastructure, production rollout, and unrelated session/domain changes.

### Dependencies

Containment: S1–S4 are proposed children. Blocking: S2 integrates S1; S3 integrates S1/S2 using the resolved directory/file policy;
S4 integrates S1/S2/S3 and verifies security before disclosure. Direct application verification does not require a
production ingress deployment. This effort does not satisfy the separate production ingress obligation.

### Completion evidence

Actual child issue/PR completion references, reviewed criterion coverage, resolved or explicitly approved remaining scope,
and application/configuration execution records. Completion does not
automatically mark requirements verified. The register's evidence workflow assesses those results separately.

### Delivery plan

This document records the approved parent and slices. Publication was authorized by the maintainer on 2026-10-05; actual issue references and verified relationships are recorded below.

## Coverage review

All evidence below is planned. Rows describing partial work retain explicit blockers; no criterion has existing
reviewed execution evidence in this plan.

| Requirement         | AC | Disposition and slices | Planned evidence and remaining conditions                                                               |
| ------------------- | -- | ---------------------- | ------------------------------------------------------------------------------------------------------- |
| PREETS-TENANT-003   | 1  | Planned S1/S2/S4       | Two tenants and interleaved HTTP selection; approved literal host parsing                               |
| PREETS-TENANT-003   | 2  | Planned S2/S4          | Authenticated, consuming-auth, and diagnostic context before behavior                                   |
| PREETS-TENANT-003   | 3  | Planned S1/S2/S4       | Static hosts select one alias without BASE_HOSTNAME                                                     |
| PREETS-TENANT-003   | 4  | Planned S2             | Configuration-consuming frontend outcomes plus independent-request controls                             |
| PREETS-TENANT-004   | 1  | Planned S1/S2/S4       | Interleaved parsed values and consuming frontend behavior                                               |
| PREETS-TENANT-004   | 2  | Planned S1             | Required directory in both modes; directory configuration/access failures return 500 via S3             |
| PREETS-TENANT-004   | 3  | Planned S1/S4          | Usable static file and independently parsed comparison                                                  |
| PREETS-TENANT-004   | 4  | Planned S3/S4          | Actual missing-static-file HTTP 500, no fallback                                                        |
| PREETS-TENANT-004   | 5  | Planned S3             | Usable directory: missing host file or unreadable/malformed file returns 404; static missing file 500   |
| PREETS-TENANT-005   | 1  | Planned S3             | Pattern mismatch actual HTTP 404                                                                        |
| PREETS-TENANT-005   | 2  | Planned S3             | Unknown alias/missing host file returns actual HTTP 404                                                 |
| PREETS-TENANT-005   | 3  | Planned S3             | No fallback for both categories; unknown alias and file failures exercise approved 404                  |
| PREETS-TENANT-005   | 4  | Planned S3             | Browser ordinary not-found comparison for both categories                                               |
| PREETS-TENANT-005   | 5  | Planned S1/S3/S4       | Static success for varied hosts and missing-file 500                                                    |
| PREETS-TENANT-006   | 1  | Planned S4             | Complete JSON equals independently parsed expected file                                                 |
| PREETS-TENANT-006   | 2  | Planned S4             | Interleaved normal-context responses; no separate configured-membership registry needed                 |
| PREETS-TENANT-006   | 3  | Planned S4             | Static complete configuration for varied hosts                                                          |
| PREETS-TENANT-006   | 4  | Planned S3/S4          | 404/500 actual statuses; directory/file outcomes follow approved policy                                 |
| PREETS-TENANT-006   | 5  | Planned S4             | Direct production-mode application response; production ingress outside this effort                     |
| PREETS-TENANT-006   | 6  | Planned S4             | No-store on success/404/500; all approved directory/file failure outcomes covered                       |
| PREETS-SECURITY-001 | 1  | Planned S4             | Nested forbidden-field rejection; non-secret keys permitted; external content safety limitation remains |
| PREETS-SECURITY-001 | 2  | Planned S4             | Vendor-agnostic deterministic provider resolves keys; values/credentials absent from diagnostic JSON    |
| PREETS-SECURITY-001 | 3  | Planned S4             | Full permitted JSON comparison; no redaction DTO                                                        |

## Review and planning gaps

Applied delivery-review against the source requirements and issue template on 2026-10-03. The coverage review accounts
for all 23 selected criteria. Review corrections distinguish parent containment from blocking, separate direct application
verification from production shipping, retain partial failure coverage, and avoid treating existing service/schema code
as evidence. No confirmed planning defect remains within this local review's scope.

B1 and B2 provider scope are resolved. External producer/content controls remain an evidence limitation; concrete provider integration and cloud infrastructure are deferred. Proposed production configuration
review instructions are S4 delivery work, not implemented workflow guidance. Infrastructure work is deferred. There is no separate
verification issue because the shared diagnostic/fixture infrastructure has a concrete S4 outcome and remaining evidence
belongs to each responsible slice.

Duplicate inspection covers open repository issues only. Runtime behavior, closed delivery history, external producers,
and deployed infrastructure were not verified. Maintainer approval is recorded above; issue publication and native relationships are verified below. Every requirement
remains at its recorded lifecycle and verification value.

## Publication record

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
