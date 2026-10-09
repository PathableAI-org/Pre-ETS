# HIPAA protection of product data

## Scope and regulatory basis

Maintainer direction on 2026-10-09 establishes a conservative product assumption: all non-trivial product data
is handled as PHI, and its electronic forms as ePHI. This includes identities, service records, narratives,
associations, drafts, deleted records, exports, backups, and identifying telemetry. Treat uncertain data as
protected until the privacy/security owner documents an exclusion. The inventory must define exclusions;
“non-trivial” is not a legal classification or an exemption test. This direction does not by itself establish
that every tenant is a covered entity or that every datum meets HIPAA’s legal definition.

This area applies across [generalized data input](data-input-workflows.md),
[on-site service recording](on-site-job-coaching.md), persistence, infrastructure, and operational support.
The working operating model is a business associate serving covered entities; record the actual role and
contract for each deployment. The requirements below are **Regulatory Requirements**, not functional features.
Criteria translate the cited standards into this product’s proposed evidence and operating boundaries;
additional audit fields, test scenarios, and client-cache handling are implementation interpretations, not
verbatim statutory prescriptions. This is an initial product/operations register, not an exhaustive HIPAA
compliance assessment; tenant-specific Privacy Rule duties, state law, funder terms, and other applicable
regimes require separate applicability review. All remain proposed and unverified. Their source obligations
are binding where legally applicable; register
status does not suspend the law. No implementation, signed agreement, or compliance certification is claimed.

Research was performed on 2026-10-09 using eCFR Title 45 displayed as current through 2026-10-07 and HHS guidance.
The [HHS Security Rule summary](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html)
and [NPRM fact sheet](https://www.hhs.gov/hipaa/for-professionals/security/hipaa-security-rule-nprm/factsheet/index.html)
identify the cybersecurity changes as proposed; those proposals are not adopted here as effective law.

Under [45 CFR 164.306(d)](https://www.ecfr.gov/current/title-45/section-164.306), required specifications must
be implemented. Addressable specifications require assessment, implementation when reasonable and appropriate,
or documented justification and an equivalent alternative when reasonable and appropriate. Addressable does
not mean discretionary omission. Encryption and automatic logoff are addressable under the current rule;
there is no universal HIPAA idle-timeout value, heartbeat endpoint, immediate-undo interaction, or mandate
for a particular database, audit architecture, MFA implementation, or signature/approval workflow.
Those product choices remain separately classified. Existing accepted [session requirements](session-management.md)
are preserved; this area supplies regulatory rationale and additional obligations, not duplicate timeout policy.

## Ownership and delivery gates

Name the security official, privacy/contract owner, operations owner, and implementation owners before production
PHI is handled. Record risk decisions, tenant/provider responsibilities, and evidence for applicable controls.
The requirements cover software and operational boundaries; application tests cannot prove training, physical
security, executed BAAs, or notification procedures. Provider safeguards do not by themselves verify our
configuration or tenant responsibilities. Unresolved decisions below gate the affected production capability.

Ordinary coach-only views remain scoped by PREETS-ONSITE-005. Authorized emergency access, individual-rights
fulfillment, incident investigation, and contract-required access need separately authorized operational paths;
they do not silently grant coaches or supervisors access to other users’ records. A documented and exercised
operational process may satisfy a requirement without adding a new end-user interface.

## PREETS-HIPAA-001

**Title:** Risk analysis, management, and accountable safeguards
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Security official and product/platform owners
**Lifecycle:** proposed
**Verification:** unverified

### Statement

The operator must assess and manage risks to the confidentiality, integrity, and availability of protected product data and periodically evaluate safeguards.

### Rationale and sources

Protecting the assumed PHI boundary requires evidence at the responsible software or operational boundary.

- Source: [45 CFR 164.308(a)(1), (2), (8)](https://www.ecfr.gov/current/title-45/section-164.308). Reviewed 2026-10-09; applicability follows the scope above.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09; detailed obligations await review and acceptance.

### Acceptance criteria

1. Maintain a data-flow/risk assessment covering client drafts, storage, deleted records, integrations, diagnostics, and backups, with a named security official.
2. Record mitigation owners and decisions, including addressable assessments; reassess after material operational or security changes.

### Open questions

Inventory exclusions, review cadence, and residual-risk acceptance authority.

### Verification plan

Planned evidence only: Review the actual deployment inventory and risk records against representative data flows; record unresolved risks.

### Verification evidence

No reviewed, executed evidence has been recorded. Research does not establish implementation or compliance.

## PREETS-HIPAA-002

**Title:** Authorized access and authenticated identity
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Application authorization and identity owners
**Lifecycle:** proposed
**Verification:** unverified

### Statement

Access to ePHI must be restricted to authorized people and programs with verified identity and individually traceable user identification.

### Rationale and sources

Protecting the assumed PHI boundary requires evidence at the responsible software or operational boundary.

- Source: [45 CFR 164.312(a)(1), (a)(2)(i), (d)](https://www.ecfr.gov/current/title-45/section-164.312). Reviewed 2026-10-09; applicability follows the scope above.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09; detailed obligations await review and acceptance.

### Acceptance criteria

1. Verify identity and enforce the documented user/program rights on direct reads and mutations, including tenant boundaries.
2. Exercise denied and revoked access; no protected contents or mutation is available through bypassing the UI.

### Open questions

Role grants, revocation propagation, privileged support access, and authentication assurance.

### Verification plan

Planned evidence only: Exercise real application paths with authorized, unauthorized, cross-tenant, and revoked identities.

### Verification evidence

No reviewed, executed evidence has been recorded. Research does not establish implementation or compliance.

## PREETS-HIPAA-003

**Title:** Permitted use and minimum necessary exposure
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Privacy owner and all data-handling owners
**Lifecycle:** proposed
**Verification:** unverified

### Statement

PHI use and disclosure must have a permitted basis and be limited to the minimum necessary where that standard applies.

### Rationale and sources

Protecting the assumed PHI boundary requires evidence at the responsible software or operational boundary.

- Source: [45 CFR 164.502(a), (b)](https://www.ecfr.gov/current/title-45/section-164.502) and [HHS minimum necessary guidance](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/minimum-necessary-requirement/index.html). Reviewed 2026-10-09; applicability follows the scope above.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09; detailed obligations await review and acceptance.

### Acceptance criteria

1. Document permitted purposes, recipients, role-based data needs, and applicable minimum-necessary exceptions.
2. Inspect forms, exports, diagnostics, logs, traces, heartbeat traffic, analytics, and support tooling for unnecessary PHI; exclude it or document the permitted necessity and safeguards.

### Open questions

Field inventory, disclosure authority, telemetry allowlists, and recipient approval.

### Verification plan

Planned evidence only: Trace synthetic protected fields through actual outputs and recipients; review purpose/exception records.

### Verification evidence

No reviewed, executed evidence has been recorded. Research does not establish implementation or compliance.

## PREETS-HIPAA-004

**Title:** Audit controls and activity examination
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Application audit and security operations owners
**Lifecycle:** proposed
**Verification:** unverified

### Statement

Activity in systems using ePHI must be recorded and examinable through audit controls and regular operational review.

### Rationale and sources

Protecting the assumed PHI boundary requires evidence at the responsible software or operational boundary.

- Source: [45 CFR 164.312(b)](https://www.ecfr.gov/current/title-45/section-164.312) and [164.308(a)(1)(ii)(D)](https://www.ecfr.gov/current/title-45/section-164.308). Reviewed 2026-10-09; applicability follows the scope above.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09; detailed obligations await review and acceptance.

### Acceptance criteria

1. Define risk-based audit coverage for access, changes, deletion, undo, and privileged actions; evidence identifies actor, target, time, action, and outcome as needed for examination.
2. Protect audit records and exercise a documented review process; ordinary record deletion must not defeat the selected audit coverage.

### Open questions

Event coverage, clock handling, retention, audit failure outcomes, and tamper protections; HIPAA does not specifically mandate event sourcing or full narrative copies.

### Verification plan

Planned evidence only: Exercise selected actions and examine real audit output and review records; test unauthorized alteration.

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

Protecting the assumed PHI boundary requires evidence at the responsible software or operational boundary.

- Source: [45 CFR 164.312(c), (e)](https://www.ecfr.gov/current/title-45/section-164.312). Reviewed 2026-10-09; applicability follows the scope above.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09; detailed obligations await review and acceptance.

### Acceptance criteria

1. Evaluate record-integrity and transmission-integrity mechanisms under the addressable process.
2. Exercise unauthorized, interrupted, and conflicting writes against the chosen controls; successful updates and deletion/undo preserve the intended record and associations.

### Open questions

Atomicity, concurrency, retry/deduplication, failure outcomes, and integrity verification mechanisms.

### Verification plan

Planned evidence only: Inject meaningful write/transmission failures through actual adapters and observe authorized record state.

### Verification evidence

No reviewed, executed evidence has been recorded. Research does not establish implementation or compliance.

## PREETS-HIPAA-006

**Title:** Confidentiality in storage and transmission
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Platform, client-storage, and key-management owners
**Lifecycle:** proposed
**Verification:** unverified

### Statement

Stored and transmitted ePHI must be safeguarded against unauthorized access, with documented encryption decisions.

### Rationale and sources

Protecting the assumed PHI boundary requires evidence at the responsible software or operational boundary.

- Source: [45 CFR 164.312(a)(2)(iv), (e)](https://www.ecfr.gov/current/title-45/section-164.312) and [HHS Security Rule summary](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html). Reviewed 2026-10-09; applicability follows the scope above.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09; detailed obligations await review and acceptance.

### Acceptance criteria

1. Assess encryption for databases, browser storage/caches, backups, exports, and network hops; implement reasonable and appropriate measures or document justified alternatives.
2. Verify deployed protections and access to keys; protect unsaved and disabled-form data throughout logout, session expiry, connectivity recovery, and shared-device use.

### Open questions

Algorithms, key custody/rotation, permitted browser persistence, cache lifecycle, and removal of protected display.

### Verification plan

Planned evidence only: Inspect deployment and client storage/network behavior with synthetic PHI, including loss and recovery of access.

### Verification evidence

No reviewed, executed evidence has been recorded. Research does not establish implementation or compliance.

## PREETS-HIPAA-007

**Title:** Backup, disaster recovery, and emergency continuity
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Operations and business-continuity owners
**Lifecycle:** proposed
**Verification:** unverified

### Statement

The operator must maintain retrievable exact ePHI backups and procedures for recovery and protected continuation of critical operations.

### Rationale and sources

Protecting the assumed PHI boundary requires evidence at the responsible software or operational boundary.

- Source: [45 CFR 164.308(a)(7)](https://www.ecfr.gov/current/title-45/section-164.308) and [HHS contingency guidance summary](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html). Reviewed 2026-10-09; applicability follows the scope above.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09; detailed obligations await review and acceptance.

### Acceptance criteria

1. Document backup, recovery, and emergency-mode plans and assess testing/revision and data criticality.
2. Exercise restore of representative records and associations from actual backups; document outcomes and unresolved failures.

### Open questions

Backup scope/frequency, recovery objectives, provider responsibilities, and critical operations during outage. Heartbeat disabling and process-restart persistence alone do not establish contingency readiness.

### Verification plan

Planned evidence only: Review plan ownership and perform a controlled restore/continuity exercise; record deployment and scope.

### Verification evidence

No reviewed, executed evidence has been recorded. Research does not establish implementation or compliance.

## PREETS-HIPAA-008

**Title:** Emergency access and session safeguards
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Security official, identity, and operations owners
**Lifecycle:** proposed
**Verification:** unverified

### Statement

The operator must establish necessary emergency ePHI access and assess automatic logoff without bypassing authorization.

### Rationale and sources

Protecting the assumed PHI boundary requires evidence at the responsible software or operational boundary.

- Source: [45 CFR 164.312(a)(2)(ii), (iii)](https://www.ecfr.gov/current/title-45/section-164.312). Reviewed 2026-10-09; applicability follows the scope above.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09; detailed obligations await review and acceptance.

### Acceptance criteria

1. Document and exercise authorized emergency retrieval, including scope, actor identification, and audit coverage.
2. Record the automatic-logoff assessment and apply accepted session rules; heartbeat recovery cannot restore expired authorization.

### Open questions

Emergency authority/path and access to incomplete work after session interruption; owner-only ordinary views require a separately authorized operational route.

### Verification plan

Planned evidence only: Exercise emergency retrieval and session loss/recovery, referencing existing session evidence without claiming it already passed.

### Verification evidence

No reviewed, executed evidence has been recorded. Research does not establish implementation or compliance.

## PREETS-HIPAA-009

**Title:** Business associate and subcontractor arrangements
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Contract/privacy owner and vendor management
**Lifecycle:** proposed
**Verification:** unverified

### Statement

PHI processing by business associates and subcontractors must be governed by applicable written arrangements before the processing begins.

### Rationale and sources

Protecting the assumed PHI boundary requires evidence at the responsible software or operational boundary.

- Source: [45 CFR 164.504(e)](https://www.ecfr.gov/current/title-45/section-164.504) and [HHS cloud guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html). Reviewed 2026-10-09; applicability follows the scope above.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09; detailed obligations await review and acceptance.

### Acceptance criteria

1. Inventory hosting, backup, monitoring, support, and other PHI processors; record actual roles and applicable executed BAAs and permitted uses.
2. Enforce contract obligations for safeguards, reporting, rights support, subcontractors, and return/destruction at termination, including continued protection when destruction is infeasible.

### Open questions

Executed terms, approved service tiers, contract-specific deadlines, and vendor responsibilities; encrypted cloud storage does not remove business-associate status.

### Verification plan

Planned evidence only: Review signed agreements and actual recipient/data flows; a vendor’s HIPAA marketing statement is not evidence of an executed BAA.

### Verification evidence

No reviewed, executed evidence has been recorded. Research does not establish implementation or compliance.

## PREETS-HIPAA-010

**Title:** Incident handling and business-associate breach reporting
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Security incident and privacy/contract owners
**Lifecycle:** proposed
**Verification:** unverified

### Statement

Suspected security incidents must be addressed and documented, and discovered breaches of unsecured PHI reported under applicable law and agreements.

### Rationale and sources

Protecting the assumed PHI boundary requires evidence at the responsible software or operational boundary.

- Source: [45 CFR 164.308(a)(6)](https://www.ecfr.gov/current/title-45/section-164.308), [164.410](https://www.ecfr.gov/current/title-45/section-164.410), and [HHS breach guidance](https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html). Reviewed 2026-10-09; applicability follows the scope above.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09; detailed obligations await review and acceptance.

### Acceptance criteria

1. Exercise incident intake, containment, mitigation, evidence preservation, and documented outcomes; evaluate whether breach notification is required.
2. As a business associate, notify the covered entity without unreasonable delay and no later than 60 calendar days after discovery, subject to applicable law-enforcement delay and stricter contract terms; supply affected identities and available required information.

### Open questions

Discovery/escalation owners, recipient contacts, contractual clocks, and covered-entity notification allocation. A network outage is not automatically a breach.

### Verification plan

Planned evidence only: Run a tabletop incident with a simulated discovery date and affected data; review clock, content, and delivery evidence.

### Verification evidence

No reviewed, executed evidence has been recorded. Research does not establish implementation or compliance.

## PREETS-HIPAA-011

**Title:** Secure retention, disposal, and compliance documentation
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Privacy, operations, and records owners
**Lifecycle:** proposed
**Verification:** unverified

### Statement

Protected data must remain safeguarded through retention and disposal, and required Security Rule documentation must be retained and maintained.

### Rationale and sources

Protecting the assumed PHI boundary requires evidence at the responsible software or operational boundary.

- Source: [45 CFR 164.310(d)](https://www.ecfr.gov/current/title-45/section-164.310), [164.316](https://www.ecfr.gov/current/title-45/section-164.316), and [HHS record-retention FAQ](https://www.hhs.gov/hipaa/for-professionals/faq/does-hipaa-require-covered-entities-to-keep-medical-records-for-any-period/index.html). Reviewed 2026-10-09; applicability follows the scope above.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09; detailed obligations await review and acceptance.

### Acceptance criteria

1. Define record, deleted-record, backup, media-reuse, and disposal rules using applicable law and contracts; protect retained copies.
2. Retain required Security Rule documentation for six years after creation or last effectiveness, whichever is later; make it available to implementers and update it.

### Open questions

State/funder/contract retention, holds, audit retention, and approved purge authority. Six years is not a blanket HIPAA service-record retention mandate; soft deletion is not final disposal.

### Verification plan

Planned evidence only: Review schedules and documentation dates; exercise authorized disposal and media-reuse procedures with synthetic records.

### Verification evidence

No reviewed, executed evidence has been recorded. Research does not establish implementation or compliance.

## PREETS-HIPAA-012

**Title:** Support individual access, amendment, and disclosure accounting
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Privacy/contract owner and authorized records operations
**Lifecycle:** proposed
**Verification:** unverified

### Statement

Where the product maintains a designated record set or accountable disclosures for a covered entity, it must support the entity’s applicable individual-rights obligations.

### Rationale and sources

Protecting the assumed PHI boundary requires evidence at the responsible software or operational boundary.

- Source: [45 CFR 164.504(e)(2)(ii)(E)–(G)](https://www.ecfr.gov/current/title-45/section-164.504), [164.524](https://www.ecfr.gov/current/title-45/section-164.524), [164.526](https://www.ecfr.gov/current/title-45/section-164.526), and [164.528](https://www.ecfr.gov/current/title-45/section-164.528). Reviewed 2026-10-09; applicability follows the scope above.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09; detailed obligations await review and acceptance.

### Acceptance criteria

1. Document designated-record-set scope and contract allocation; exercise authorized retrieval/copy and accepted amendment incorporation or linkage, including retained records hidden by ordinary deletion.
2. Preserve and supply information for disclosures subject to accounting, including date, recipient, data description, and purpose; respect statutory exceptions and the applicable six-year accounting window.

### Open questions

Request verification, responsible covered-entity decision maker, format, response deadlines, and disclosure categories. No participant portal or routine supervisor sharing is implied.

### Verification plan

Planned evidence only: Exercise representative access/amendment/accounting requests through the approved operational process, with tenant isolation.

### Verification evidence

No reviewed, executed evidence has been recorded. Research does not establish implementation or compliance.

## PREETS-HIPAA-013

**Title:** Workforce, workstation, and physical safeguards
**Classification:** Regulatory Requirement
**Owner / responsible boundary:** Security official and workforce/facility/device owners
**Lifecycle:** proposed
**Verification:** unverified

### Statement

The operator must implement applicable workforce, training, workstation, facility, and device safeguards for ePHI.

### Rationale and sources

Protecting the assumed PHI boundary requires evidence at the responsible software or operational boundary.

- Source: [45 CFR 164.308(a)(1)(ii)(C), (3)–(5)](https://www.ecfr.gov/current/title-45/section-164.308) and [164.310(a)–(c)](https://www.ecfr.gov/current/title-45/section-164.310). Reviewed 2026-10-09; applicability follows the scope above.
- Decision: Maintainer PHI-handling assumption supplied 2026-10-09; detailed obligations await review and acceptance.

### Acceptance criteria

1. Document authorization/termination, security training, sanctions, workstation use/security, and facility responsibilities, including assessed addressable controls.
2. Record evidence of personnel procedures and physical/provider safeguards for the actual deployment and support environment.

### Open questions

Customer-versus-provider workstation responsibilities and approved shared/mobile-device use.

### Verification plan

Planned evidence only: Inspect training, access termination, facility/provider records and a representative device scenario; software tests alone are insufficient.

### Verification evidence

No reviewed, executed evidence has been recorded. Research does not establish implementation or compliance.
