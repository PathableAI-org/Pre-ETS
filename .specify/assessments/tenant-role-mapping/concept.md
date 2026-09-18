# Concept: Tenant Role Mapping

- **Slug**: tenant-role-mapping
- **Created**: 2026-09-18
- **Updated**: 2026-09-18 — reshaped for explicit platform Tenant Configuration ownership
- **Recommended option**: A — Bounded tenant-configured metadata interpretation
- **Inputs used**: [clarified intake](intake.md), [research](research.md), [revised problem](problem.md)

## Scope and Evidence

Clients retain account and assignment administration. The platform's Tenant Configuration type must contain the information needed to interpret provider metadata into application roles. This is a user-specified boundary, not an architecture invented during assessment. Exact role names and business permissions remain intentionally unknown. — [Intake clarification](intake.md#scope-clarification-2026-09-18).

Provider-managed roles can be inputs to this capability. They cannot replace the required platform configuration or force clients to adopt new assignment conventions. The earlier provider-only recommendation is superseded. Microsoft-first is an assumption; Google and Cognito remain candidate environments. Provider metadata availability and trustworthiness must be established for each real integration. — [Research clarification](research.md#scope-clarification-after-provider-research-2026-09-18).

## Options

### Option A — Bounded tenant-configured metadata interpretation

- **Sketch**: A tenant's configuration describes how supported provider metadata corresponds to platform roles while the client continues maintaining users and responsibilities in its existing system. Existing app-role assignments can pass through an agreed interpretation; other suitable attributes, such as an administrator-controlled job title if actually supplied, can support a tenant-specific association. Newly discovered roles can be incorporated without finalizing the whole catalog now. The capability interprets roles; it does not itself establish every business action those roles permit.
- **Appetite**: **medium (weeks), provisional budget ceiling**, not an estimate or an approved delivery commitment. Scope is limited to bounded interpretation of already available, validated identity metadata. Specification must establish the supported forms and evaluation examples before implementation sizing.
- **Trade-offs**: Directly satisfies the clarified requirement and minimizes pressure to reorganize client assignments. Restricting supported interpretation reduces complexity but may leave some client data forms unsupported initially. It cannot create missing membership information, make a self-editable attribute authoritative, or infer permission meanings from labels. Configuration errors and changes to metadata remain access risks requiring explicit behavior in specification. — [Problem goals](problem.md#goals), [research](research.md#data--constraints).
- **Rabbit holes**: Arbitrary scripts or policy expressions, a universal provider adapter, nested organizational policy, complete role-management interfaces, metadata enrichment integrations, and a full application authorization engine.

### Option B — General attribute-based policy capability

- **Sketch**: Tenants describe richer combinations of identity attributes and contextual conditions to express both role assignment and more targeted access policies. This could accommodate complex future needs but extends beyond simply interpreting existing provider metadata into roles.
- **Appetite**: **large (months), provisional budget category**; neither demand nor delivery fit is evidenced. It is a comparison option, not an approved investment.
- **Trade-offs**: Greater expressiveness could cover more future cases, at the cost of harder explanation, validation, administration, and policy-change control. The present request does not establish a need to configure business permissions through a general policy system. — Inference from [intake](intake.md) and [problem non-goals](problem.md#non-goals).
- **Rabbit holes**: A custom policy language, record-level policy evaluation, policy conflict resolution, role hierarchies, simulation tooling, and an entire administration product.

### Option C — Defer the foundation and rely on upstream conventions

- **Sketch**: Continue using identity information without adding platform interpretation configuration, asking future clients to supply agreed application-role values or delaying their access integration until requirements settle. This captures the do-nothing-for-now alternative; it does not satisfy the clarified platform-configuration requirement.
- **Appetite**: **small (days), provisional** for documenting accepted upstream conventions or the deferral; no foundation-delivery budget is implied.
- **Trade-offs**: Avoids immediate configuration complexity and may suit a tenant already supplying suitable app roles. It can impose the client changes the requester wants to avoid and leaves heterogeneous interpretation to later work. Upstream support remains useful evidence for simplifying Option A, rather than a replacement for it. — [Research](research.md#scope-clarification-after-provider-research-2026-09-18).
- **Rabbit holes**: Bespoke upstream changes per tenant, repeated deferral until all roles are known, and treating provider examples as proof of client readiness.

## Recommendation

Recommend **Option A**, the smallest option that meets the explicit platform-configuration requirement. The product need is now established by the requester, and documented provider differences support the need for tenant-specific interpretation. A full client role catalog is not necessary to specify this foundation. — [Intake clarification](intake.md#scope-clarification-2026-09-18), [research](research.md#provider-follow-up-metadata-and-assignment-ownership).

Evaluate it through representative interpretation outcomes: tenant-specific meanings, unchanged behavior when another role is introduced, unsuitable/missing evidence, and clear separation between role interpretation and business permission enforcement. These are foundation examples, not proof that a real client exposes a job-title claim or that site administration is safely implemented. — [Problem metrics](problem.md#success-metrics).

Scope discipline provides the basis for progressing to specification: bounded available metadata, configured interpretation, extensible role vocabulary, and defined failure outcomes. Expression syntax, claim source, multiple matches, freshness, and validation belong in specification and planning. Where they expose material product choices, clarify them then; do not silently expand to directory lookups or general authorization.

## Out of Scope (for the recommended option)

- Defining the final production role catalog or the permissions of site administrators, lesson staff, billing staff, or student-group assignments.
- Replacing client account administration, provisioning, or forcing clients to reorganize assignments.
- Assuming job title is present in OIDC responses or authoritative enough for privileged access.
- Fetching additional directory data, introducing new brokers, or implementing provider-specific enrichment unless separately scoped.
- Universal provider compatibility or production validation of all Microsoft, Google, and Cognito configurations.
- Arbitrary executable rules, a general policy engine, role hierarchies, or configuration administration screens.
- Replacing backend domain authorization or claiming a mapped role alone enforces student-record access.
- Concrete configuration schemas, storage, APIs, and implementation tasks during assessment.

## Assumptions to Validate

1. Bounded interpretation of already available metadata offers a useful first foundation; unavailable attributes will not trigger automatic enrichment work. — Problem Q4, Q9.
2. Representative synthetic examples can validate the foundation's behavior; actual tenant data and authority checks remain deployment prerequisites. — Problem Q4, Q8.
3. Role identifiers can evolve independently of completion of the business permission catalog; naming a role does not implement its powers. — Problem Q2–Q3.
4. Specification can define safe missing/invalid/unmatched/conflicting-input behavior and tenant isolation without a general policy language. — Problem Q5.
5. Configuration ownership, validation, and change effects can be bounded within existing operational practices; an administration UI is not assumed. — Problem Q1, Q6–Q7.
6. The provisional medium appetite is subject to specification-level scope and effort review; no delivery date or measured savings are established. — Problem Q10.

## Assessment Status

This concept supersedes the earlier preference for provider-only assignments and the requirement to settle one tenant's complete business access needs first. It preserves client-specific verification before real privileges depend on the interpretation. The next decision should assess readiness to specify this foundation, not readiness to deploy a complete permission system.
