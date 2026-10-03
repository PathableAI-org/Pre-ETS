# Delivery plan: Tenant resolution pilot

**Status:** draft
**Planning date:** 2026-10-03
**Source revision:** [31e476c](https://github.com/PathableAI-org/Pre-ETS/commit/31e476c89efbe356c6b59fb75e4ead06d63667ca)
**Approval:** Pending maintainer adoption of decomposition

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

## Blockers and decisions

| ID | Affected work                                                           | Needed decision or prerequisite                                                                                                                                                                            |
| -- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 | TENANT-004 AC5, configured membership in S1, affected S2/S3/S4 failures | Resolve directory/unreadable/corrupt and host-mode missing-file policy; establish how unknown aliases differ from configured tenants with unavailable files. No registry or HTTP outcome is invented here. |
| B2 | SECURITY-001 AC1–2, S4 external provisioning                            | Identify external configuration producers and how they apply shared validation and control secrets placed in allowed text. Repository fixtures cannot establish universal content safety.                  |

B1 requires a linked requirements decision before affected paths are implemented. S3 may deliver approved independent
paths first; that would be partial delivery, not closure of all selected criteria. B2 remains an external-producer safety and
verification gap. Maintainer adoption of this plan does not resolve them.

## Delivery slices and proposed issues

Issue bodies below use the delivery issue template. Links are pinned to the inspected source revision. They are
proposals without GitHub issue numbers. Planned evidence is part of each slice; shared fixtures/harness adaptation
belongs to S4 rather than a separate blanket testing issue.

### S1 — Select and retrieve the intended tenant configuration

**Proposed issue title:** Select and retrieve the intended tenant configuration

**Delivery references:** Not published

#### Outcome

Frontend consumers obtain the intended configuration in host and static modes.

#### Requirements

- [PREETS-TENANT-003](https://github.com/PathableAI-org/Pre-ETS/blob/31e476c89efbe356c6b59fb75e4ead06d63667ca/docs/requirements/tenant-resolution.md#preets-tenant-003) AC 1, 3
- [PREETS-TENANT-004](https://github.com/PathableAI-org/Pre-ETS/blob/31e476c89efbe356c6b59fb75e4ead06d63667ca/docs/requirements/tenant-resolution.md#preets-tenant-004) AC 1–3

#### In scope

Require BASE_HOSTNAME only in host mode; parse the literal alias/base pattern; require the directory in both modes and the static selector only in static mode. Preserve alias-to-file selection and interleaved isolation.

#### Out of scope

Request/auth integration, diagnostics, and undecided failure outcomes.

#### Dependencies

Successful-path work can start independently. B1 gates configured membership classification and affected failure paths.

#### Completion evidence

Public-service and configuration-boundary scenarios with two distinguishable tenants; running HTTP evidence is completed with S2/S4. Verify static selection without BASE_HOSTNAME. Existing helpers are reusable, not accepted execution evidence. Implementation must be merged and its executed evidence recorded with revision, scope, and limitations. Issue closure does not update requirement verification.

#### Delivery plan

Tenant resolution pilot, slice S1. Publication must link the committed plan revision; this new draft has no published URL yet.

### S2 — Establish tenant context before tenant-dependent frontend behavior

**Proposed issue title:** Establish tenant context before tenant-dependent frontend behavior

**Delivery references:** Not published

#### Outcome

Authenticated requests, consuming authentication flows, and diagnostics obtain normal selected tenant context before consuming configuration.

#### Requirements

- [PREETS-TENANT-003](https://github.com/PathableAI-org/Pre-ETS/blob/31e476c89efbe356c6b59fb75e4ead06d63667ca/docs/requirements/tenant-resolution.md#preets-tenant-003) AC 2, 4

#### In scope

Inventory tenant-dependent request paths; integrate the shared selection/retrieval capability and normal context. Ensure the dummy proxy cannot substitute tenant context on accepted delivery paths. Include tenant-independent asset/health controls.

#### Out of scope

Diagnostic response construction and undecided configuration-failure policy.

#### Dependencies

S1 capability required for integration; B1 gates affected failure integration. Coordinate diagnostic context with S4.

#### Completion evidence

Running HTTP/authentication and configuration-consuming frontend observations with interleaved distinguishable tenants. Exercise representative authenticated paths and tenant-independent controls; diagnostic JSON alone cannot prove user behavior. Implementation must be merged and its executed evidence recorded with revision, scope, and limitations. Issue closure does not update requirement verification.

#### Delivery plan

Tenant resolution pilot, slice S2. Publication must link the committed plan revision; this new draft has no published URL yet.

### S3 — Return the approved tenant failure outcomes

**Proposed issue title:** Return the approved tenant failure outcomes

**Delivery references:** Not published

#### Outcome

Invalid host-mode tenants receive ordinary HTTP/browser not-found behavior; absent static configuration receives HTTP 500 without fallback.

#### Requirements

- [PREETS-TENANT-004](https://github.com/PathableAI-org/Pre-ETS/blob/31e476c89efbe356c6b59fb75e4ead06d63667ca/docs/requirements/tenant-resolution.md#preets-tenant-004) AC 4, 5
- [PREETS-TENANT-005](https://github.com/PathableAI-org/Pre-ETS/blob/31e476c89efbe356c6b59fb75e4ead06d63667ca/docs/requirements/tenant-resolution.md#preets-tenant-005) AC 1–5

#### In scope

Implement approved 404/500 outcomes, preserve failure meaning, static host exemption, and ordinary missing-page presentation. Resolve affected policy through requirement decisions before implementing it.

#### Out of scope

Invented outcomes for unreadable/corrupt configuration or a new tenant registry.

#### Dependencies

S1/S2 integration; B1 blocks unknown-alias versus configured-unavailable handling and AC5 response policy. Static missing-file 500 and pattern-mismatch 404 are approved and can proceed independently of that policy.

#### Completion evidence

Actual HTTP 404/500 status and no fallback; browser comparison with ordinary missing-page navigation; static mode repeats invalid hosts successfully. Public failures distinguish known unavailable configuration from unknown aliases after B1 is resolved. Implementation must be merged and its executed evidence recorded with revision, scope, and limitations. Issue closure does not update requirement verification.

#### Delivery plan

Tenant resolution pilot, slice S3. Publication must link the committed plan revision; this new draft has no published URL yet.

### S4 — Expose safe tenant configuration through the normal diagnostic context

**Proposed issue title:** Expose safe tenant configuration through the normal diagnostic context

**Delivery references:** Not published

#### Outcome

The diagnostic endpoint returns full permitted non-secret configuration from normal request resolution with no-store responses.

#### Requirements

- [PREETS-TENANT-006](https://github.com/PathableAI-org/Pre-ETS/blob/31e476c89efbe356c6b59fb75e4ead06d63667ca/docs/requirements/tenant-resolution.md#preets-tenant-006) AC 1–6
- [PREETS-SECURITY-001](https://github.com/PathableAI-org/Pre-ETS/blob/31e476c89efbe356c6b59fb75e4ead06d63667ca/docs/requirements/security.md#preets-security-001) AC 1–3

#### In scope

Enforce explicit permitted Effect Schema fields and unexpected-field rejection at relevant nested boundaries; retain separate server-only secrets. Add GET /_test/tenant-config in all application environments and no-store on success/404/500. Add scoped production configuration Copilot guidance as delivery work.

#### Out of scope

Redaction DTOs, environment gating, production ingress rules, and claims that validation detects secrets inside every allowed string.

#### Dependencies

S1/S2/S3 for complete route behavior; B1 gates affected failures. Implement and verify the security contract before shipping disclosure. Production deployment is outside this effort; future ingress protection remains required before production exposure. B2 identifies external-producer integration still needed.

#### Completion evidence

Vitest with @effect/vitest exercises the real loader with permitted and forbidden nested fields. Compare complete diagnostic JSON with independently parsed expected files. Synthetic secrets from the separate provider never appear. Repeat direct application tests in production mode and check no-store on approved error outcomes; fixture checks do not prove all external content safe. Implementation must be merged and its executed evidence recorded with revision, scope, and limitations. Issue closure does not update requirement verification.

#### Delivery plan

Tenant resolution pilot, slice S4. Publication must link the committed plan revision; this new draft has no published URL yet.

## Cross-cutting concerns and proposed parent

**Proposed parent title:** Deliver the accepted tenant resolution and diagnostic requirements

### Outcome

Coordinate delivery of the selected tenant configuration, request integration, failure behavior, safe diagnostic,
and diagnostic application outcomes.

### Requirements

- [PREETS-TENANT-003](https://github.com/PathableAI-org/Pre-ETS/blob/31e476c89efbe356c6b59fb75e4ead06d63667ca/docs/requirements/tenant-resolution.md#preets-tenant-003) AC 1–4
- [PREETS-TENANT-004](https://github.com/PathableAI-org/Pre-ETS/blob/31e476c89efbe356c6b59fb75e4ead06d63667ca/docs/requirements/tenant-resolution.md#preets-tenant-004) AC 1–5
- [PREETS-TENANT-005](https://github.com/PathableAI-org/Pre-ETS/blob/31e476c89efbe356c6b59fb75e4ead06d63667ca/docs/requirements/tenant-resolution.md#preets-tenant-005) AC 1–5
- [PREETS-TENANT-006](https://github.com/PathableAI-org/Pre-ETS/blob/31e476c89efbe356c6b59fb75e4ead06d63667ca/docs/requirements/tenant-resolution.md#preets-tenant-006) AC 1–6
- [PREETS-SECURITY-001](https://github.com/PathableAI-org/Pre-ETS/blob/31e476c89efbe356c6b59fb75e4ead06d63667ca/docs/requirements/security.md#preets-security-001) AC 1–3

### In scope

Contain proposed children S1–S4 and coordinate decisions B1–B2, compatibility with auth/session consumers, fixture/harness
adaptation, and production configuration review guidance. Verify direct application behavior; cloud infrastructure
and production rollout belong to a later effort.

### Out of scope

Projects automation, RTM generation, requirement approval by issue closure, historical Spec Kit synchronization, and
cloud infrastructure, production rollout, and unrelated session/domain changes.

### Dependencies

Containment: S1–S4 are proposed children. Blocking: S2 integrates S1; S3 integrates S1/S2 with affected paths gated by B1;
S4 integrates S1/S2/S3 and verifies security before disclosure. Direct application verification does not require a
production ingress deployment. This effort does not satisfy the separate production ingress obligation.

### Completion evidence

Actual child issue/PR completion references, reviewed criterion coverage, resolved or explicitly approved remaining scope,
and application/configuration execution records. Completion does not
automatically mark requirements verified. The register's evidence workflow assesses those results separately.

### Delivery plan

This document is the parent proposal. Before issue publication, link its committed revision and replace proposed
relationships with actual issue references. No publication is authorized by this pilot.

## Coverage review

All evidence below is planned. Rows describing partial work retain explicit blockers; no criterion has existing
reviewed execution evidence in this plan.

| Requirement         | AC | Disposition and slices | Planned evidence and remaining conditions                                                         |
| ------------------- | -- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| PREETS-TENANT-003   | 1  | Planned S1/S2/S4       | Two tenants and interleaved HTTP selection; B1 affects configured membership                      |
| PREETS-TENANT-003   | 2  | Planned S2/S4          | Authenticated, consuming-auth, and diagnostic context before behavior                             |
| PREETS-TENANT-003   | 3  | Planned S1/S2/S4       | Static hosts select one alias without BASE_HOSTNAME                                               |
| PREETS-TENANT-003   | 4  | Planned S2             | Configuration-consuming frontend outcomes plus independent-request controls                       |
| PREETS-TENANT-004   | 1  | Planned S1/S2/S4       | Interleaved parsed values and consuming frontend behavior                                         |
| PREETS-TENANT-004   | 2  | Planned S1             | Required directory in both modes; invalid-directory response policy blocked B1                    |
| PREETS-TENANT-004   | 3  | Planned S1/S4          | Usable static file and independently parsed comparison                                            |
| PREETS-TENANT-004   | 4  | Planned S3/S4          | Actual missing-static-file HTTP 500, no fallback                                                  |
| PREETS-TENANT-004   | 5  | Blocked B1; S3         | Public failure classification plus decided HTTP policy; unknown/configured distinction unresolved |
| PREETS-TENANT-005   | 1  | Planned S3             | Pattern mismatch actual HTTP 404                                                                  |
| PREETS-TENANT-005   | 2  | Blocked B1; S3         | Unknown alias HTTP 404 after membership distinction is decided                                    |
| PREETS-TENANT-005   | 3  | Partial plan S3; B1    | No fallback for both categories; unknown-alias case blocked                                       |
| PREETS-TENANT-005   | 4  | Partial plan S3; B1    | Browser ordinary not-found comparison for both categories                                         |
| PREETS-TENANT-005   | 5  | Planned S1/S3/S4       | Static success for varied hosts and missing-file 500                                              |
| PREETS-TENANT-006   | 1  | Planned S4             | Complete JSON equals independently parsed expected file                                           |
| PREETS-TENANT-006   | 2  | Partial plan S4; B1    | Interleaved normal-context responses; configured membership unresolved                            |
| PREETS-TENANT-006   | 3  | Planned S4             | Static complete configuration for varied hosts                                                    |
| PREETS-TENANT-006   | 4  | Partial plan S3/S4; B1 | 404/500 actual statuses; unknown alias distinction blocked                                        |
| PREETS-TENANT-006   | 5  | Planned S4             | Direct production-mode application response; production ingress outside this effort               |
| PREETS-TENANT-006   | 6  | Partial plan S4; B1    | No-store on success/404/500; affected failure cases blocked                                       |
| PREETS-SECURITY-001 | 1  | Partial plan S4; B2    | Nested forbidden-field rejection; external producer/content controls unresolved                   |
| PREETS-SECURITY-001 | 2  | Planned S4; B2         | Separate provider synthetic secrets absent from diagnostic JSON; external safety limits           |
| PREETS-SECURITY-001 | 3  | Planned S4             | Full permitted JSON comparison; no redaction DTO                                                  |

## Review and planning gaps

Applied delivery-review against the source requirements and issue template on 2026-10-03. The coverage review accounts
for all 23 selected criteria. Review corrections distinguish parent containment from blocking, separate direct application
verification from production shipping, retain partial failure coverage, and avoid treating existing service/schema code
as evidence. No confirmed planning defect remains within this local review's scope.

Open decisions B1–B2 remain; the plan is not implementation-ready for those paths. Proposed production configuration
review instructions are S4 delivery work, not implemented workflow guidance. Infrastructure work is deferred. There is no separate
verification issue because the shared diagnostic/fixture infrastructure has a concrete S4 outcome and remaining evidence
belongs to each responsible slice.

Duplicate inspection covers open repository issues only. Runtime behavior, closed delivery history, external producers,
and deployed infrastructure were not verified. Maintainer approval and issue publication are pending. Every requirement
remains at its recorded lifecycle and verification value.
