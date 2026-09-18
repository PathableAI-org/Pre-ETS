# Problem Definition: Tenant Role Mapping

- **Slug**: tenant-role-mapping
- **Created**: 2026-09-18
- **Updated**: 2026-09-18 — incorporates explicit ownership and configurable-foundation clarification
- **Inputs used**: intake.md | research.md | user clarification in this conversation

## Problem Statement

Clients need platform access to reflect their existing staff responsibilities while retaining their own user administration, but the meaning and availability of provider metadata can vary by tenant and the platform's eventual roles are still being discovered. The platform needs to accommodate those differences and evolving responsibilities without requiring every client to reorganize its existing assignments around a fixed platform role catalog. — [Source: intake, Scope clarification](intake.md#scope-clarification-2026-09-18); [provider evidence](research.md#provider-follow-up-metadata-and-assignment-ownership).

This is a stated product requirement, not evidence of measured administrative cost or verified client interoperability. Microsoft remains the leading provider assumption; Google and Cognito are candidates, not support commitments. — [Sources: intake](intake.md), [research, Evidence Quality](research.md#evidence-quality).

## Affected Users & Stakeholders

- **Users: client staff** — need appropriate access as responsibilities vary; lesson delivery to student groups and collecting lesson data for billing remain known examples, not fixed roles. — [Source: intake](intake.md).
- **Users: clients administering their own users** — should be able to continue using existing account and responsibility arrangements where those arrangements provide suitable evidence. The actual operator and available metadata are unverified. — [Source: intake, Scope clarification](intake.md#scope-clarification-2026-09-18).
- **Stakeholder: requester and platform team** — need a bounded foundation that supports discovery of roles without prematurely specifying all business permissions. — [Source: intake, Scope clarification](intake.md#scope-clarification-2026-09-18).
- **Stakeholders to identify** — client access-policy owners and people authorized to approve tenant configuration; their exact responsibilities remain Q1. — [NEEDS CLARIFICATION: Named ownership and approval rights are not established.]

## Goals

1. Clients retain user administration and can reuse suitable existing responsibility information without mandatory adoption of new provider-side assignment conventions. — [Source: intake, Scope clarification](intake.md#scope-clarification-2026-09-18).
2. Different tenants can express how their available identity information relates to platform access, while preserving tenant boundaries. — [Sources: intake](intake.md), [research, Data & Constraints](research.md#data--constraints).
3. Newly discovered application roles can be accommodated without requiring completion of the entire role catalog first or unintentionally changing established tenant interpretation. This does not imply that new business permissions require no implementation. — [Source: intake](intake.md); outcome inference from extensibility requirement.
4. Access distinctions can be explained using trustworthy evidence; an identity label, successful login, or provider capability claim alone is insufficient proof of an individual's authority. — [Source: research, Scope Clarification](research.md#scope-clarification-after-provider-research-2026-09-18).

The requester has selected platform-owned tenant configuration as a constraint for subsequent shaping. This definition records the underlying outcomes; it does not choose a configuration structure, rule language, or authorization mechanism.

## Initial Access Needs

Site administration versus more targeted access is the latest illustrative distinction. Lesson delivery and billing-data collection remain useful discovery examples. None establishes a named production role, a complete permission set, or that job title is available or authoritative in a particular client's login metadata. — [Source: intake, Scope clarification](intake.md#scope-clarification-2026-09-18).

The initial assessment concerns the configurable interpretation foundation. Concrete student-group record boundaries, billing actions, and each deployed tenant's allow/deny policies must be established before those business permissions are enabled; they are not prerequisites for recognizing the foundation's stated need. — Scope clarification from [intake](intake.md#scope-clarification-2026-09-18), preserving [research constraints](research.md#data--constraints).

## Non-Goals

- Finalizing production roles or business permissions for lessons, billing, student groups, or site administration during this assessment.
- Requiring clients to reorganize their users or assignments to fit platform-specific provider roles; clients already using such roles remain compatible with the stated goal.
- Treating job title, domain, or another profile field as automatically trustworthy for privileged access.
- Claiming support for every provider or obtaining unavailable role information through interpretation alone.
- Defining directory integrations, provisioning, user-management workflows, or configuration administration screens.
- Replacing backend domain authorization or treating interpretation as proof that record-level access is enforced.
- Defining a configuration data model, APIs, mapping syntax, or implementation tasks at this stage.

These boundaries derive from the [clarified scope](intake.md#scope-clarification-2026-09-18) and the [research's limits of provider metadata](research.md#data--constraints).

## Success Metrics

These are proposed measures of the stated goals, with unknown baselines and no invented acceptance thresholds. Specification must establish the evaluation examples and targets. Illustrative examples can assess the foundation; only client-verified examples can establish deployment suitability.

| Signal                           | Measurement                                                                                                                                                     | Baseline / target status                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Reuse of existing administration | Changes required to a tenant's existing account/assignment practices for an agreed supported case                                                               | Unknown; objective is minimizing avoidable changes, per intake    |
| Tenant-specific interpretation   | Agreed examples where differing tenant metadata meanings produce the intended role interpretation, including examples that must not grant a role                | Unknown; examples and targets to define                           |
| Extensibility                    | Effort to accommodate an additional illustrative role and number of previously correct interpretations changed unintentionally                                  | Unknown; role names do not imply implemented business permissions |
| Explainability and boundaries    | Reviewed examples whose role interpretation can be traced to authoritative tenant context and supporting metadata, including unavailable or unsuitable evidence | Unknown; target to define                                         |

Grounding: [intake goals and clarification](intake.md), [research metadata limits and tenant constraints](research.md#data--constraints). These measures assess the foundation; production authorization requires separate capability and denial evidence.

## Cost of Inaction

Without this capability, the platform may require clients to align upstream assignments with a fixed vocabulary or rely on ad hoc tenant adaptations as roles emerge. That is a risk inferred from the stated requirement, not a measured client cost. Provider-managed application roles may already make some integrations simple, but do not satisfy the clarified requirement to accommodate existing tenant arrangements generally. — [Sources: intake, Scope clarification](intake.md#scope-clarification-2026-09-18), [research comparison](research.md#where-application-mapping-could-add-value).

The repository observations recorded in research describe identity-focused authentication and tenant configuration without role-mapping fields. They are source-inspection evidence, not a claim that runtime authorization has been audited. — [Source: research, Current repository](research.md#current-repository).

## Open Questions

These questions are carried forward to specification or client deployment as indicated. None requires a complete client role catalog before conceptual shaping. Existing identifiers are retained for traceability; their scope has been revised.

1. **Q1 — Ownership (specification):** [NEEDS CLARIFICATION: Who is authorized to approve tenant interpretation and the platform's role vocabulary? Clients own user administration; named operators and approval boundaries remain undefined.]
2. **Q2 — Business permissions (later capability/deployment):** [NEEDS CLARIFICATION: What do site administration, targeted access, lesson delivery, and billing collection actually permit, including student-group boundaries and overlapping responsibilities?]
3. **Q3 — Extensibility (specification):** [NEEDS CLARIFICATION: How are supported role identifiers introduced and retired, and how are new permissions distinguished from additional assignments to existing permissions?]
4. **Q4 — Identity evidence (specification and deployment):** [NEEDS CLARIFICATION: Which metadata forms bound the initial foundation, and which issuer, claim source, administrators, and editable attributes establish trustworthy evidence for a real tenant?]
5. **Q5 — Incomplete or conflicting evidence (specification):** [NEEDS CLARIFICATION: What interpretation outcomes apply to missing, malformed, incomplete, contradictory, unmatched, or cross-tenant evidence and multiple applicable roles?]
6. **Q6 — Changes over time (specification and deployment):** [NEEDS CLARIFICATION: When must metadata/configuration changes affect interpreted roles, and which removal/freshness expectations must be met before production access relies on them?]
7. **Q7 — Accountability (specification):** [NEEDS CLARIFICATION: What validation, explanation, review, and correction are required for tenant interpretation changes, without presupposing an administration UI?]
8. **Q8 — Existing arrangements (client validation):** [NEEDS CLARIFICATION: Which actual assignment examples demonstrate friction avoided, and does each client expose authoritative responsibility information without changing its existing conventions? This validates value; it no longer reopens whether platform configuration is required.]
9. **Q9 — Scope limits (specification/deployment):** [NEEDS CLARIFICATION: Which metadata sizes and structural limits bound the first supported scope, and which tenant-specific obligations apply before deployment?]
10. **Q10 — Evaluation and appetite (shape/specification):** [NEEDS CLARIFICATION: Which representative examples, success targets, and effort budget bound the configurable foundation? A provisional appetite can guide shaping without inventing client adoption metrics.]

## Assessment Status

The user's clarification resolves the earlier ownership/scope blocker: clients administer users, and the platform must support tenant-specific interpretation. Shape and decide should reassess the configurable foundation on that basis. Provider adoption, exact roles, and concrete business permission policies remain unverified and must not be presented as implemented or approved. The current concept and decision incorporate this clarification; client deployment and actual business permissions remain separate validation concerns.
