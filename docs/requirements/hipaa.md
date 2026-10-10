# HIPAA protection of product data

## Scope and regulatory basis

Maintainer direction on 2026-10-09 establishes a conservative product assumption: all non-trivial product data
is handled as PHI, and its electronic forms as ePHI. This includes identities, service records, narratives,
associations, drafts, deleted records, exports, backups, and identifying telemetry. Software treats uncertain
data as protected unless a separately approved policy establishes an exclusion. Inventory and exclusion approval
are deferred operational work.
“Non-trivial” is not a legal classification or an exemption test. This direction does not by itself establish
that every tenant is a covered entity or that every datum meets HIPAA’s legal definition.

This area proposes software safeguards across [generalized data input](data-input-workflows.md),
[on-site service recording](on-site-job-coaching.md), persistence, and deployed software interfaces.
Maintainer direction on 2026-10-10 keeps PR #129 focused on software requirements and defers operational
requirements. The software obligations below remain **Regulatory Requirements**: they translate cited standards
into proposed software outcomes, rather than claiming that every implementation detail is prescribed by law.
Application obligations are owned here; infrastructure obligations are linked from the boundary map below.
Additional audit fields, test scenarios, and client-cache handling are implementation interpretations.
All active obligations remain proposed and unverified.

Risk-management programs, recurring human reviews, contracts, incident/breach procedures, workforce training,
and physical device/media handling are deferred to separate operational requirements work. Historical IDs
for wholly operational proposals are retained as deferred entries, without active acceptance criteria in this
software proposal. Operational portions of mixed requirements are identified separately from software outcomes.
Applicable legal obligations remain outside this PR's scope decision; software evidence alone does not establish
HIPAA compliance. The working business-associate model, deployment roles, and contract applicability still
need separate assessment.

Research was performed on 2026-10-09 using eCFR Title 45 displayed as current through 2026-10-07 and HHS guidance.
The [HHS Security Rule summary](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html)
and [NPRM fact sheet](https://www.hhs.gov/hipaa/for-professionals/security/hipaa-security-rule-nprm/factsheet/index.html)
identify the cybersecurity changes as proposed; those proposals are not adopted here as effective law.

PR #129 review follow-up on 2026-10-10 strengthens software acceptance criteria for unique identification and
permitted-use enforcement, and narrows operational scope under maintainer direction. The cited risk-management,
evaluation, unique-identification, permitted-use, minimum-necessary, and device/media sources were rechecked.
Those sources do not establish acceptance, implementation, or executed verification.

Under [45 CFR 164.306(d)](https://www.ecfr.gov/current/title-45/section-164.306), required specifications must
be implemented. Addressable specifications require assessment, implementation when reasonable and appropriate,
or documented justification and an equivalent alternative when reasonable and appropriate. Addressable does
not mean discretionary omission. Encryption and automatic logoff are addressable under the current rule;
there is no universal HIPAA idle-timeout value, heartbeat endpoint, immediate-undo interaction, or mandate
for a particular database, audit architecture, MFA implementation, or signature/approval workflow.
Those product choices remain separately classified. Existing accepted [session requirements](session-management.md)
are preserved; this area supplies regulatory rationale and additional obligations, not duplicate timeout policy.

## Software boundaries and deferred operations

Application criteria are evaluated at the responsible application, identity, persistence-interface, or client-storage
boundary. Infrastructure obligations live in [Infrastructure](infrastructure.md); their controls require separate
deployed evidence. Policy approval, operational staffing, and execution of human procedures are separate work.
A software criterion that enforces an approved policy does not decide that policy or prove
its legal sufficiency; unresolved software contracts remain implementation-planning dependencies.

Ordinary coach-only access remains scoped by PREETS-ONSITE-005. Deferred operational needs do not grant coaches,
supervisors, or support staff additional access. Any supporting software access path requires an explicit
scope and authorization contract before delivery.

### Application and infrastructure ownership

| Capability                                                | Application requirement                                                                               | Infrastructure requirement                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Identity, access, permitted outputs, audit, and integrity | PREETS-HIPAA-002–-005                                                                                 | Infrastructure protections do not grant application access                                          |
| Confidentiality                                           | [PREETS-HIPAA-006](#preets-hipaa-006): client/application data handling                               | [PREETS-INFRA-003](infrastructure.md#preets-infra-003): storage, transport, and key controls        |
| Backup and recovery                                       | [PREETS-ONSITE-004](data-input-workflows.md#preets-onsite-004): process-independent record durability | [PREETS-HIPAA-007](infrastructure.md#preets-hipaa-007): backup restoration after primary-store loss |
| Emergency retrieval                                       | [PREETS-HIPAA-008](#preets-hipaa-008): authorized record retrieval and session rules                  | Recovery infrastructure does not establish emergency authorization                                  |
| Retention and disposal                                    | [PREETS-HIPAA-011](#preets-hipaa-011): application records and holds                                  | [PREETS-INFRA-004](infrastructure.md#preets-infra-004): infrastructure copies                       |
| Individual-rights support                                 | [PREETS-HIPAA-012](#preets-hipaa-012): record copy, amendment, and accounting                         | Infrastructure recovery does not establish rights fulfillment                                       |

## PREETS-HIPAA-001

**Title:** Risk analysis, management, and accountable safeguards
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Security official and product/platform owners
**Lifecycle:** proposed
**Verification:** unverified
**Scope:** deferred operational proposal

### Deferred scope and sources

The risk-management program, mitigation accountability, residual-risk authority, and periodic technical/nontechnical evaluations are deferred. Their review cadences and evidence requirements are not software acceptance conditions in this PR.

- Source: [45 CFR 164.308(a)(1), (2), (8)](https://www.ecfr.gov/current/title-45/section-164.308). Reviewed 2026-10-09; applicability follows the scope above.
- Scope decision: Maintainer direction (2026-10-10) defers operational requirements from PR #129. This ID is retained for continuity; its operational obligation and acceptance criteria require separate review. No software acceptance criteria or verification claim is introduced by this entry.

## PREETS-HIPAA-002

**Title:** Authorized access and authenticated identity
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Application authorization and identity owners
**Lifecycle:** proposed
**Verification:** unverified

### Statement

Access to ePHI must be restricted to authorized people and programs with verified identity and individually traceable user identification.

### Rationale and sources

Protecting the assumed PHI boundary requires evidence at the responsible software boundary.

- Source: [45 CFR 164.312(a)(1), (a)(2)(i), (d)](https://www.ecfr.gov/current/title-45/section-164.312). Reviewed 2026-10-09; applicability follows the scope above.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09; detailed obligations await review and acceptance.

### Acceptance criteria

1. Verify identity and enforce the documented user/program rights on direct reads and mutations, including tenant boundaries.
2. Exercise denied and revoked access; no protected contents or mutation is available through bypassing the UI.
3. Assign each human user a unique identifier that identifies and tracks that person's access to ePHI. Access and activity evidence distinguishes different people, including users in the same tenant; a shared account that cannot distinguish its individual users does not satisfy this criterion.

### Open questions

Role grants, revocation propagation, privileged support access, and authentication assurance.

### Verification plan

Planned evidence only: Exercise real application paths with authorized, unauthorized, cross-tenant, and revoked
identities. Use two distinct human users in the same tenant and inspect identity and activity evidence to
establish that each person's access remains individually traceable.

### Verification evidence

No reviewed, executed evidence has been recorded. Research does not establish implementation or compliance.

## PREETS-HIPAA-003

**Title:** Permitted use and minimum necessary exposure
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Application and software data-handling owners
**Lifecycle:** proposed
**Verification:** unverified

### Statement

Software must enforce the separately approved permitted-use and disclosure policy for PHI and limit exposure to the minimum necessary where that standard applies.

### Rationale and sources

Protecting the assumed PHI boundary requires evidence at the responsible software boundary.

- Source: [45 CFR 164.502(a), (b)](https://www.ecfr.gov/current/title-45/section-164.502) and [HHS minimum necessary guidance](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/minimum-necessary-requirement/index.html). Reviewed 2026-10-09; applicability follows the scope above.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09; detailed obligations await review and acceptance.

### Acceptance criteria

1. Application access and outputs follow the separately approved purposes, recipients, role-based data needs, and applicable minimum-necessary exceptions; software enforcement does not establish legal approval of that policy.
2. Forms, exports, diagnostics, logs, traces, heartbeat traffic, analytics, and support tooling exclude PHI outside the approved data needs for their purpose and recipient; approved inclusions remain subject to the applicable software safeguards.
3. Enforce the documented permitted-use and disclosure boundaries through the responsible software path. Unpermitted uses or recipients are denied, and outputs and access are limited to the minimum necessary where that standard applies. A documented exception to minimum necessary does not by itself permit an otherwise unpermitted use or disclosure.

### Open questions

Software field/recipient mapping, telemetry allowlists, and behavior when an approved policy is unavailable or changes. Approval of purposes, recipients, disclosure authority, and legal exceptions is deferred operational work; implementation needs the applicable approved policy.

### Verification plan

Planned evidence only: Trace synthetic protected fields through actual outputs and recipients; review
purpose/exception records. Exercise permitted and unpermitted purposes or recipients and verify enforcement
at the responsible software boundary. Inspect the permitted output for unnecessary data
where minimum necessary applies, and establish the documented basis of any exception. Documentation or
inspection alone does not establish enforcement.

### Verification evidence

No reviewed, executed evidence has been recorded. Research does not establish implementation or compliance.

## PREETS-HIPAA-004

**Title:** Audit controls and activity examination
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Application audit and audit-storage owners
**Lifecycle:** proposed
**Verification:** unverified

### Statement

Software activity involving ePHI must be recorded and available for examination by authorized reviewers through protected audit controls.

### Rationale and sources

Protecting the assumed PHI boundary requires evidence at the responsible software boundary.

- Source: [45 CFR 164.312(b)](https://www.ecfr.gov/current/title-45/section-164.312) and [164.308(a)(1)(ii)(D)](https://www.ecfr.gov/current/title-45/section-164.308). Reviewed 2026-10-09; applicability follows the scope above.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09; detailed obligations await review and acceptance.

### Acceptance criteria

1. Define risk-based audit coverage for access, changes, deletion, undo, and privileged actions; evidence identifies actor, target, time, action, and outcome as needed for examination.
2. Audit records remain protected from unauthorized access, alteration, and deletion, and can be retrieved for examination through an authorized software path; ordinary record deletion must not defeat the selected audit coverage.

### Open questions

Event coverage, clock handling, retention enforcement, audit failure outcomes, tamper protections, and authorized
audit-retrieval behavior require software contracts. Reviewer assignment, recurring review cadence, and human
follow-up/escalation are deferred operational work. No event-sourcing architecture or full narrative copies are selected.

### Verification plan

Planned evidence only: Exercise selected application actions and retrieve their actual audit output through
the authorized software path. Verify actor, target, time, action, and outcome against the selected coverage.
Attempt unauthorized access, alteration, and deletion, and verify that ordinary service-record deletion
preserves the selected audit evidence. This does not establish recurring human review.

### Verification evidence

No reviewed, executed evidence has been recorded. Research does not establish implementation or compliance.

## PREETS-HIPAA-005

**Title:** Protect record and transmission integrity
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Application/persistence and transport owners
**Lifecycle:** proposed
**Verification:** unverified

### Statement

ePHI must be protected from improper alteration or destruction, including during transmission.

### Rationale and sources

Protecting the assumed PHI boundary requires evidence at the responsible software boundary.

- Source: [45 CFR 164.312(c), (e)](https://www.ecfr.gov/current/title-45/section-164.312). Reviewed 2026-10-09; applicability follows the scope above.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09; detailed obligations await review and acceptance.

### Acceptance criteria

1. The software applies the selected record-integrity and transmission-integrity controls to protect ePHI from improper alteration or destruction; operational assessment of addressable specifications is deferred separately.
2. Exercise unauthorized, interrupted, and conflicting writes against the chosen controls; successful updates and deletion/undo preserve the intended record and associations.

### Open questions

Atomicity, concurrency, retry/deduplication, failure outcomes, and integrity verification mechanisms.

### Verification plan

Planned evidence only: Inject meaningful write/transmission failures through actual adapters and observe authorized record state.

### Verification evidence

No reviewed, executed evidence has been recorded. Research does not establish implementation or compliance.

## PREETS-HIPAA-006

**Title:** Application confidentiality in client storage and data handling
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Application, client-storage, and application key-access boundaries
**Lifecycle:** proposed
**Verification:** unverified

### Statement

The application must protect ePHI in its inputs, displays, client storage, exports, and transfers using the selected application safeguards, including when authenticated access is lost.

### Rationale and sources

Client and application data handling can expose protected data even when the backing infrastructure is protected. Platform storage and transport safeguards are owned separately.

- Source: [45 CFR 164.312(a)(2)(iv), (e)](https://www.ecfr.gov/current/title-45/section-164.312). Reviewed 2026-10-09; applicability follows the scope above.
- Scope decision: Maintainer direction (2026-10-10) retains supporting software capabilities and separates infrastructure from application requirements. This scope decision does not approve the detailed obligation or establish verification.

### Acceptance criteria

1. The application applies the selected encryption or approved alternative safeguards to ePHI in browser storage/caches, application-managed copies, exports, and transfers. Application connections use the protected infrastructure interfaces; this criterion does not introduce an export feature.
2. Unsaved values and disabled-form data remain subject to the selected confidentiality controls through logout, session expiry, connectivity failure/recovery, and shared-device use; heartbeat recovery does not restore expired authorization.
3. Application access to protected data and any keys it uses is limited to authorized identities and paths; application behavior does not bypass deployed storage/transport protections.

### Open questions

Permitted browser persistence, cache lifecycle, protected-display removal, application key-access behavior, and handling of incomplete values after access loss. Approval of encryption/alternative treatment, key-custody staffing, and human device procedures remain deferred operational work.

### Verification plan

Planned evidence only: inspect actual application displays, browser storage/caches, exports where supported, and network transfers with synthetic PHI. Exercise logout, expiry, connectivity failure/recovery, and subsequent use by another user; establish that the selected access-loss controls are enforced. Inspect denied application/key access. This evidence does not verify infrastructure backups or platform key-management controls.

### Related requirements

- [PREETS-INFRA-003](infrastructure.md#preets-infra-003) owns infrastructure storage, transport, and key-access protection.
- Accepted [session requirements](session-management.md) define access loss and recovery.

### Verification evidence

No reviewed, executed evidence has been recorded. This documentation change does not establish runtime behavior or compliance.

<a id="preets-hipaa-007"></a>

## Backup and recovery infrastructure

[PREETS-HIPAA-007](infrastructure.md#preets-hipaa-007) now lives in the infrastructure area, retaining its
historical ID. That area owns backup production and restoration after primary-store loss. Ordinary application
persistence and reloads do not establish that infrastructure capability. Operational contingency programs and
human emergency-mode procedures remain deferred.

## PREETS-HIPAA-008

**Title:** Authorized application emergency retrieval and session safeguards
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Application authorization, identity, and record-access boundaries
**Lifecycle:** proposed
**Verification:** unverified

### Statement

The application must support separately authorized emergency retrieval of ePHI while identifying the requester, enforcing tenant and permitted scope, and preserving accepted session safeguards.

### Rationale and sources

Emergency retrieval needs a defined software authorization path; its existence does not grant emergency rights to ordinary coaches or supervisors.

- Source: [45 CFR 164.312(a)(2)(ii), (iii)](https://www.ecfr.gov/current/title-45/section-164.312). Reviewed 2026-10-09; rechecked 2026-10-10.
- Scope decision: Maintainer direction (2026-10-10) retains supporting software capabilities and separates infrastructure from application requirements. This scope decision does not approve the detailed obligation or establish verification.

### Acceptance criteria

1. A requester with the separately approved emergency authorization can retrieve the protected data within that authorization's tenant and record scope through the application path, with individually traceable identity and selected audit coverage.
2. Requests without that authorization, outside its permitted scope, or after its expiry/revocation are denied without revealing protected contents; emergency retrieval does not expand ordinary owner-only permissions.
3. The application applies accepted protected-access and session-expiration requirements to the emergency path. Heartbeat recovery cannot restore expired authorization.

### Open questions

Emergency authorization contract, grant/revocation propagation, eligible records including incomplete/deleted records, access to incomplete work after interruption, and the retrieval interface. Human emergency authority, request approval, and automatic-logoff assessment are deferred operational work; no new end-user emergency interface is selected.

### Verification plan

Planned evidence only: exercise actual application retrieval with authorized and unauthorized emergency identities, out-of-scope and cross-tenant requests, and expired/revoked access. Inspect returned data, denial behavior, actor identification, and selected audit output. Exercise session loss/recovery without claiming existing session evidence already passed.

### Related requirements

- [PREETS-HIPAA-002](#preets-hipaa-002) and [PREETS-HIPAA-004](#preets-hipaa-004) define identity/access and software audit safeguards.
- [PREETS-ONSITE-005](on-site-job-coaching.md#preets-onsite-005) retains owner-only ordinary access.
- [Session requirements](session-management.md) remain authoritative for session behavior.

### Verification evidence

No reviewed, executed evidence has been recorded. This documentation change does not establish runtime behavior or compliance.

## PREETS-HIPAA-009

**Title:** Business associate and subcontractor arrangements
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Contract/privacy owner and vendor management
**Lifecycle:** proposed
**Verification:** unverified
**Scope:** deferred operational proposal

### Deferred scope and sources

Deployment-role assessment, executed business-associate arrangements, vendor approval, and contract administration are deferred. This entry does not add a contract-management feature.

- Source: [45 CFR 164.504(e)](https://www.ecfr.gov/current/title-45/section-164.504) and [HHS cloud guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html). Reviewed 2026-10-09; applicability follows the scope above.
- Scope decision: Maintainer direction (2026-10-10) defers operational requirements from PR #129. This ID is retained for continuity; its operational obligation and acceptance criteria require separate review. No software acceptance criteria or verification claim is introduced by this entry.

## PREETS-HIPAA-010

**Title:** Incident handling and business-associate breach reporting
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Security incident and privacy/contract owners
**Lifecycle:** proposed
**Verification:** unverified
**Scope:** deferred operational proposal

### Deferred scope and sources

Incident-response operations, breach assessment, notification authority and deadlines, and tabletop exercises are deferred. Software audit and confidentiality safeguards remain independently scoped by PREETS-HIPAA-004–-006.

- Source: [45 CFR 164.308(a)(6)](https://www.ecfr.gov/current/title-45/section-164.308), [164.410](https://www.ecfr.gov/current/title-45/section-164.410), and [HHS breach guidance](https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html). Reviewed 2026-10-09; applicability follows the scope above.
- Scope decision: Maintainer direction (2026-10-10) defers operational requirements from PR #129. This ID is retained for continuity; its operational obligation and acceptance criteria require separate review. No software acceptance criteria or verification claim is introduced by this entry.

## PREETS-HIPAA-011

**Title:** Application enforcement of protected-record retention and disposal
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Application record lifecycle and persistence interfaces
**Lifecycle:** proposed
**Verification:** unverified

### Statement

The application must safeguard retained protected records and enforce separately approved retention, hold, and disposal rules at its record-lifecycle boundary.

### Rationale and sources

Ordinary deletion hides a record while preserving it; final disposal is a separate authorized software capability governed by an approved policy.

- Source: [45 CFR 164.310(d)](https://www.ecfr.gov/current/title-45/section-164.310) and [HHS record-retention FAQ](https://www.hhs.gov/hipaa/for-professionals/faq/does-hipaa-require-covered-entities-to-keep-medical-records-for-any-period/index.html). Reviewed 2026-10-09; applicability follows the scope above.
- Scope decision: Maintainer direction (2026-10-10) retains supporting software capabilities and separates infrastructure from application requirements. This scope decision does not approve the detailed obligation or establish verification.

### Acceptance criteria

1. Retained records, including records hidden by ordinary deletion, remain protected by tenant, identity, and authorized-access rules; ordinary deletion does not trigger final disposal.
2. The application denies disposal that conflicts with the separately approved retention policy or an applicable hold, including direct requests that bypass ordinary views.
3. An authorized disposal request satisfying the approved policy removes the targeted application record/copies within the defined application scope and produces the selected audit evidence. A denied request leaves the record and its associations unchanged.
4. Application disposal does not claim removal of infrastructure backups or other retained copies; their treatment follows the separately owned infrastructure policy-enforcement requirement.

### Open questions

Approved retention/hold contract, disposal authority, application copy scope, interaction, failure outcomes, and effect on retained audit information. Setting legal/contract retention schedules, maintaining Security Rule compliance documents under 45 CFR 164.316, and physical media sanitization are deferred operational work. No retention duration or general trash interface is selected.

### Verification plan

Planned evidence only: exercise retained, ordinarily deleted, held, and eligible-for-disposal synthetic records through actual application/persistence paths. Attempt unauthorized or policy-conflicting disposal, compare retained state, and observe permitted disposal and audit output. Distinguish application removal from deletion of infrastructure copies.

### Related requirements

- [PREETS-ONSITE-007](data-input-workflows.md#preets-onsite-007) preserves ordinary deletion's non-destructive behavior.
- [PREETS-INFRA-004](infrastructure.md#preets-infra-004) owns retention/disposal of infrastructure copies.
- [PREETS-HIPAA-012](#preets-hipaa-012) covers authorized access to retained records.

### Verification evidence

No reviewed, executed evidence has been recorded. This documentation change does not establish runtime behavior or compliance.

## PREETS-HIPAA-012

**Title:** Application support for access, amendment, and disclosure accounting
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Application record retrieval, amendment, and disclosure-information boundaries
**Lifecycle:** proposed
**Verification:** unverified

### Statement

Where the product maintains a designated record set or accountable disclosures for a covered entity, the application must support authorized retrieval/copy, incorporation or linkage of accepted amendments, and retrieval of applicable disclosure-accounting information.

### Rationale and sources

The software supplies the records and amendment/accounting capability needed for separately authorized rights fulfillment; ordinary coach editing and undo do not satisfy that broader contract.

- Source: [45 CFR 164.504(e)(2)(ii)(E)–(G)](https://www.ecfr.gov/current/title-45/section-164.504), [164.524](https://www.ecfr.gov/current/title-45/section-164.524), [164.526](https://www.ecfr.gov/current/title-45/section-164.526), and [164.528](https://www.ecfr.gov/current/title-45/section-164.528). Reviewed 2026-10-09; amendment/accounting and business-associate sources rechecked 2026-10-10.
- Scope decision: Maintainer direction (2026-10-10) retains supporting software capabilities and separates infrastructure from application requirements. This scope decision does not approve the detailed obligation or establish verification.

### Acceptance criteria

1. A requester with the separately approved rights-fulfillment authorization can retrieve/copy the records within the approved designated-record-set and tenant scope, including retained records hidden by ordinary deletion; out-of-scope and unauthorized requests disclose no protected contents.
2. The application incorporates or links an amendment accepted by the authorized decision maker to the affected records so later authorized retrieval includes the amendment; unauthorized amendment attempts leave those records unchanged.
3. For disclosures subject to accounting, the application preserves and supplies date, recipient, data description, and purpose within the applicable accounting window, including the six-year statutory window where applicable and its exceptions.
4. These capabilities enforce the approved authorization and selected audit contracts without expanding ordinary coach access or requiring a participant portal.

### Open questions

Designated-record-set and disclosure-category contract, authorized retrieval/amendment/accounting interface, copy format, amendment linkage, and failure outcomes. Human request verification, rights decisions, response deadlines, and contract allocation are deferred operational work; no participant portal or routine supervisor-sharing policy is selected.

### Verification plan

Planned evidence only: exercise actual application retrieval/copy, accepted amendment incorporation/linkage, and disclosure-information retrieval with synthetic records, including ordinarily deleted retained records. Observe later retrieval of accepted amendments, denied unauthorized/cross-tenant requests, and unchanged state after denied amendments. Verify accounting fields and applicable window/exception behavior; operational response compliance is outside this evidence.

### Related requirements

- [PREETS-HIPAA-002](#preets-hipaa-002) and [PREETS-HIPAA-004](#preets-hipaa-004) define access and audit safeguards.
- [PREETS-HIPAA-011](#preets-hipaa-011) defines application retention/disposal.
- [PREETS-ONSITE-005](on-site-job-coaching.md#preets-onsite-005) retains owner-only ordinary access.

### Verification evidence

No reviewed, executed evidence has been recorded. This documentation change does not establish runtime behavior or compliance.

## PREETS-HIPAA-013

**Title:** Workforce, workstation, and physical safeguards
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Security official and workforce/facility/device owners
**Lifecycle:** proposed
**Verification:** unverified
**Scope:** deferred operational proposal

### Deferred scope and sources

Workforce authorization/termination procedures, training, sanctions, facility safeguards, and physical device/media receipt, movement, disposal, and reuse are deferred. Device/media accountability and pre-movement backup assessments belong to that operational work. Software protection of client data remains independently scoped by PREETS-HIPAA-006.

- Source: [45 CFR 164.308(a)(1)(ii)(C), (3)–(5)](https://www.ecfr.gov/current/title-45/section-164.308) and [164.310(a)–(d)](https://www.ecfr.gov/current/title-45/section-164.310). Device/media subsection (d) rechecked 2026-10-10. Reviewed 2026-10-09; applicability follows the scope above.
- Scope decision: Maintainer direction (2026-10-10) defers operational requirements from PR #129. This ID is retained for continuity; its operational obligation and acceptance criteria require separate review. No software acceptance criteria or verification claim is introduced by this entry.
