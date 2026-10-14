# Requirements migration record

This migration is the second PR in the governance stack, targeting `codex/requirements-governance` (PR #179).
It moves contracts into the conventions established there without changing their behavioral statements,
acceptance criteria, approved design constraints, or unresolved product decisions.

## Preserved contracts

| Former container        | Preserved IDs                  | Destination                                       |
| ----------------------- | ------------------------------ | ------------------------------------------------- |
| `tenant-resolution.md`  | PREETS-TENANT-001 through 006  | `tenant/`; 001 and 002 under `deprecated/tenant/` |
| `infrastructure.md`     | PREETS-INFRA-001 and 002       | `infrastructure/`                                 |
| `security.md`           | PREETS-SECURITY-001            | `security/`                                       |
| `session-management.md` | PREETS-SESSION-001 through 013 | `session/`                                        |

All 22 IDs remain, including 20 active contracts and two previously superseded historical contracts.
This table records the completed migration, not an ongoing requirement index. Former containers remain as
non-normative historical Git pointers; no requirement history is permanently deleted. Git/PR history governs
acceptance: PREETS-INFRA-002 entered main through PR #113, despite its former `proposed` field.

## Content and relationships

Descriptions, acceptance criteria, approved design constraints, source decisions, and open questions retain
their original meaning. Classifications moved into minimal YAML. Legacy generic source labels remain identified
as legacy attribution; actual maintainer decisions and the originating PR remain attributable sources.
Only already explicit hard prerequisites became YAML dependencies: TENANT-003 requires TENANT-004/005;
TENANT-004 requires SECURITY-001; TENANT-006 requires TENANT-003/004/005, SECURITY-001, and INFRA-001.
Other related contracts remain contextual links; no inferred evidence associations were authorized.

Shared session qualifications are preserved in [session context](context/session-management.md), referenced
by every session contract. Live links in delivery documents now target the ID files; revision-pinned historical
references remain unchanged. Delivery conventions, criteria numbering, test artifacts, and application code
are unchanged.

## Observability and verification

Maintainer direction during migration explicitly authorized preserving current obligations only, recording
that sources establish no additional operational obligation, and deferring new observability decisions to a
future requirements PR. Each active contract records that scope; TENANT-006 retains its existing diagnostic
observability obligation. No new monitoring mechanism or failure distinction was invented.

Verification plans now express expected externally meaningful evidence, claims, conditions, and limitations.
Internal service/property strategies and procedural commands are retained in pre-migration Git history rather
than prescribed by contracts. The original Sentinel/Playwright selection and deployment gates in INFRA-001
remain; this migration neither implements nor establishes execution of them. Existing claims about HTTP status,
no fallback, safe full disclosure, ingress rejection before forwarding, tenant isolation, session expiry,
accessibility, and provider freshness retain their distinct evidence needs. Manual status fields and empty
execution inventories were removed; no executed results were available to migrate. Deprecated contracts retain
historical verification notes rather than implying active verification obligations.

## Remaining decisions

Diagnostic access under default session authentication, session defaults and live policy changes, synchronization
timing and suspended tabs, OIDC freshness, and externally supplied secret-content controls remain unresolved as
recorded in the contracts. Current tenant directory/file response decisions are already resolved and remain intact, including the startup configuration-parse prerequisite merged in PR #171.
No new operational observability commitments are made. Missing evidence remains an evidence gap, not a change
to contract authority. Future decisions and new evidence relationships require human review.

## Branch software requirements migration

The on-site service-record branch now follows the same individual-contract strategy. This migration preserves
20 software contracts: PREETS-ONSITE-001 through -009, PREETS-HIPAA-002 through -008 and -011 through -012,
and PREETS-INFRA-003 and -004. On-site contracts live in `on-site-job-coaching/`; shared input behavior lives
in `data-input/` with its historical ONSITE IDs; cross-cutting application safeguards live in `security/`;
backup recovery (PREETS-HIPAA-007) and infrastructure safeguards live in `infrastructure/`.

Shared source qualifications, workflow adoption, PHI assumptions, and unresolved delivery decisions live in
[on-site context](context/on-site-job-coaching.md), [data-input context](context/data-input-workflows.md),
and [HIPAA context](context/hipaa.md). Every software contract links its applicable context. The four wholly
operational proposals (PREETS-HIPAA-001, -009, -010, and -013) remain reserved source/scope notes in
[operational proposal context](context/hipaa-operational-proposals.md). They are not active software contracts,
are not deprecated obligations, and their IDs must not be reused. No operational capability or acceptance
criteria were invented to turn those notes into contracts.

Descriptions, acceptance criteria, approved design constraints, owner boundaries, source decisions, and open
questions retain their meaning. Classifications moved into minimal YAML; manual lifecycle/verification fields
and empty evidence inventories were removed. Only the explicit heartbeat idle-activity prerequisite became a
new YAML dependency (PREETS-ONSITE-009 requires PREETS-SESSION-009). Related safeguards and unresolved policy
contracts remain contextual relationships or delivery gates rather than inferred hard dependencies.

Verification plans now describe external evidence, claims, and limitations, including plans for the six
contracts that previously had none. Process-independent durability, denial without mutation or disclosure,
accessible heartbeat recovery, audit protection, real backup restoration, and application versus infrastructure
copy disposal retain distinct evidence boundaries. No new operator monitoring obligations were introduced;
existing audit-examination and copy-disposal-result obligations remain explicit. No evidence relationship or
execution result was created. Product policy questions and deferred operational decisions still require human
review before the affected delivery work. The former containers preserve revision-pinned Git history only.
