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
requirements. The linked software obligations remain **Regulatory Requirements**: they translate cited standards
into proposed software outcomes, rather than claiming that every implementation detail is prescribed by law.
Application obligations live in `security/`; infrastructure obligations are linked from the boundary map below.
Additional audit fields, test scenarios, and client-cache handling are implementation interpretations.
Git and PR review govern acceptance; no implementation or executed verification is established by this source context.

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
Those product choices remain separately classified. Existing accepted [session requirements](../session/)
are preserved; this area supplies regulatory rationale and additional obligations, not duplicate timeout policy.

## Software boundaries and deferred operations

Application criteria are evaluated at the responsible application, identity, persistence-interface, or client-storage
boundary. Infrastructure obligations live in [Infrastructure](../infrastructure); their controls require separate
deployed evidence. Policy approval, operational staffing, and execution of human procedures are separate work.
A software criterion that enforces an approved policy does not decide that policy or prove
its legal sufficiency; unresolved software contracts remain implementation-planning dependencies.

Ordinary coach-only access remains scoped by PREETS-ONSITE-005. Deferred operational needs do not grant coaches,
supervisors, or support staff additional access. Any supporting software access path requires an explicit
scope and authorization contract before delivery.

### Application and infrastructure ownership

| Capability                                                | Application requirement                                                                            | Infrastructure requirement                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Identity, access, permitted outputs, audit, and integrity | PREETS-HIPAA-002–-005                                                                              | Infrastructure protections do not grant application access                                             |
| Confidentiality                                           | [PREETS-HIPAA-006](../security/PREETS-HIPAA-006.md): client/application data handling              | [PREETS-INFRA-003](../infrastructure/PREETS-INFRA-003.md): storage, transport, and key controls        |
| Backup and recovery                                       | [PREETS-ONSITE-004](../data-input/PREETS-ONSITE-004.md): process-independent record durability     | [PREETS-HIPAA-007](../infrastructure/PREETS-HIPAA-007.md): backup restoration after primary-store loss |
| Emergency retrieval                                       | [PREETS-HIPAA-008](../security/PREETS-HIPAA-008.md): authorized record retrieval and session rules | Recovery infrastructure does not establish emergency authorization                                     |
| Retention and disposal                                    | [PREETS-HIPAA-011](../security/PREETS-HIPAA-011.md): application records and holds                 | [PREETS-INFRA-004](../infrastructure/PREETS-INFRA-004.md): infrastructure copies                       |
| Individual-rights support                                 | [PREETS-HIPAA-012](../security/PREETS-HIPAA-012.md): record copy, amendment, and accounting        | Infrastructure recovery does not establish rights fulfillment                                          |

## Deferred operational proposals

The [operational proposal context](hipaa-operational-proposals.md) preserves reserved IDs and sources without creating active software contracts.
