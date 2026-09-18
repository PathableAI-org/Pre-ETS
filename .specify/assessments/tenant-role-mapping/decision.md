# Decision: Tenant Role Mapping

- **Slug**: tenant-role-mapping
- **Decided**: 2026-09-18
- **Reassessed**: 2026-09-18 — explicit platform Tenant Configuration requirement
- **Verdict**: go
- **Artifacts reviewed**: intake.md | research.md | problem.md | concept.md
- **Gate scope**: Ready to specify the configurable interpretation foundation; not approval for production authorization or implementation.

## Scorecard

| Criterion              | Rating   | Justification                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Problem validity       | strong   | The requester explicitly requires tenant configuration to interpret existing provider metadata while clients retain user administration and roles evolve through discovery. [Intake clarification](intake.md#scope-clarification-2026-09-18).                                                                                               |
| Evidence strength      | adequate | Direct product clarification establishes the need and ownership boundary; documented provider differences support configurable interpretation. This supports a foundation specification, not claims of client interoperability or measured demand. [Research](research.md#scope-clarification-after-provider-research-2026-09-18).          |
| Value vs. inaction     | adequate | The required outcome is less pressure to reorganize client assignments and fewer ad hoc tenant adaptations. Provider-only conventions cannot satisfy the clarified configuration requirement generally. Benefits are qualitative; no savings are claimed. [Problem](problem.md#cost-of-inaction).                                           |
| Feasibility / appetite | adequate | Concept A bounds the capability to interpretation of available metadata and excludes general policy, enrichment, and full authorization. The provisional medium appetite is a scoping ceiling; actual delivery fit remains unknown until specification and planning. [Concept](concept.md#options).                                         |
| Strategic fit          | strong   | Tenant-specific configuration, evolving roles, client-owned accounts, and retained domain-authorization boundaries align with the recorded product and repository constraints. [Problem](problem.md#goals), [research](research.md#current-repository).                                                                                     |
| Risk posture           | adequate | Missing or untrustworthy attributes, tenant mismatch, ambiguous mappings, and stale assignments are recognized. Bounded scope and separation from actual privilege enforcement permit specification; explicit failure/change behavior must be resolved before implementation and deployment. [Concept](concept.md#assumptions-to-validate). |

## Verdict & Rationale

**Go to specification for bounded tenant-configured metadata interpretation.** The latest clarification resolves the central product-direction blocker: clients own users and existing responsibility arrangements; the platform must own the tenant-specific interpretation configuration. Exact business roles are intentionally undiscovered, so requiring a complete permission catalog or a selected client's production metadata before specifying this foundation would evaluate a broader scope than the user requested.

The recommendation is **Concept A — Bounded tenant-configured metadata interpretation**. Option letters refer to the current concept: the previous provider-only Option A recommendation is superseded. Provider-managed roles remain useful inputs and may simplify a particular tenant's interpretation; they are not a replacement for the required Tenant Configuration capability. — [Concept](concept.md#recommendation).

Evidence is adequate for this bounded specification because it combines an explicit requirement with researched metadata variability and existing tenant/authentication boundaries. It is not evidence that job title is present, safely administrator-controlled, or sufficient to grant site administration for a real client. Microsoft-first remains a hypothesis; Google and Cognito remain candidates. Actual integration facts, quantitative value, and implementation effort are still unknown and are not concealed by this go.

## Required Clarifications

The former B1–B6 identifiers are retained for historical links. None currently blocks starting the foundation specification; material behavior must be resolved at the indicated later stage.

| Earlier blocker                             | Disposition                                                                                                                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 — Concrete staff permissions             | Deferred to the relevant business capability and deployment. The foundation can use clearly illustrative role examples without claiming their permissions are implemented.                               |
| B2 — Actual client metadata                 | Provider differences are researched; actual issuer, claim availability, and attribute authority remain deployment evidence. Specification must bound supported inputs and trust assumptions.             |
| B3 — Ownership and value of mapping         | Resolved by explicit user clarification: platform Tenant Configuration must describe interpretation, and clients continue existing user administration.                                                  |
| B4 — Missing/conflicting inputs and removal | Specification must establish deterministic, safe outcomes and when configuration/metadata changes affect interpretation. No silent privilege grant or revocation guarantee is inferred.                  |
| B5 — Policy/change accountability           | Client account ownership is established. Authorization to change tenant interpretation and configuration validation remain specification concerns; no new administration interface is presumed.          |
| B6 — Scope/appetite/evaluation              | Bounded foundation selected; concept supplies a provisional medium appetite and outcome measures. Numerical targets and effort validation belong in specification/planning before a delivery commitment. |

## Handoff to `$speckit-specify`

- **Problem**: Clients need platform roles to reflect suitable existing provider metadata without reorganizing their users or waiting for the complete platform role catalog.
- **Chosen approach**: Bounded tenant-configured metadata interpretation, with interpretation information contained in the platform's Tenant Configuration type as explicitly requested.
- **In scope**: Tenant-specific interpretation of supported, validated provider metadata into extensible application role identifiers; compatibility with existing upstream app roles or other suitable attributes; configuration validation, predictable interpretation outcomes, tenant isolation, and bounded change behavior. This is a capability boundary, not a chosen schema or mapping syntax.
- **Out of scope**: Client user management/provisioning, a complete production role/permission catalog, record-level authorization implementation, directory enrichment, arbitrary executable policy, administration screens, and universal provider compatibility.
- **Success metrics**: Representative tenant configurations yield the intended role interpretation from differing supported metadata; adding an illustrative role preserves prior interpretation cases; invalid/missing/unsuitable evidence cannot silently grant a role; interpretation remains tenant-bound and explainable. Specification defines the exact cases and acceptance targets. Synthetic examples validate the foundation, not a real client's suitability.
- **Carried-forward questions**: Supported metadata sources/forms and limits; permitted mapping expressiveness; role identifier lifecycle; multiple-match/conflict behavior; missing/invalid/unmatched outcomes; change/freshness effects; configuration authority and validation; representative acceptance cases and effort review. Preserve separation between assigning role identifiers and enforcing their future permissions.
- **Deployment evidence**: Verify actual provider/broker claims, who can modify candidate attributes, and the intended business permissions before production access depends on them. A job-title example must remain illustrative until verified.

## Workflow Completion

The assessment workflow is complete with a go-to-specify handoff. Earlier needs-clarification decisions are superseded for this clarified foundation scope; their client-deployment and business-authorization concerns remain tracked above. The next lifecycle command is `$speckit-specify` using this handoff. This assessment does not itself create a feature specification or implement code.
