# Delivery planning

Delivery plans turn accepted requirements into coherent proposals for GitHub delivery issues. The
[requirements register](../requirements/README.md) remains the product-contract authority. Plans describe work
with a shorter lifetime; retain completed plans as historical context, not new obligations.

## Create and review a plan

1. Select accepted requirements and acceptance criteria (ACs). Read their dependencies and approved design
   constraints. Proposed requirements may be noted as dependencies, but are not authorized delivery scope.
2. Inspect relevant architecture, implementation, tests, executed evidence, and existing issues. Record the source
   revision and inspection date. Code observations inform remaining work; code or tests alone do not prove satisfaction.
   If issue access is unavailable, record that duplicate-work checking is incomplete rather than assuming no issues exist.
3. Copy the [plan template](templates/plan.md) to a coherent effort under this directory. Replace placeholders,
   omit unused optional sections, and index the plan below. Use relative repository links in the plan.
4. Group work by independently understandable outcomes, not filenames or one issue per requirement. Give each
   slice a local ID such as S1. A slice can support several requirements, and a requirement can span several slices.
   Enabling work must name the accepted criteria it supports. Explain why substantial shared verification work
   needs its own slice; otherwise include verification in each slice's completion evidence.
5. Identify scope boundaries, genuine sequencing dependencies, decision blockers, and planned evidence at the
   responsible boundary using [Testing as evidence](../engineering/testing/README.md). Do not invent policy to unblock work.
6. Account for every selected AC in the coverage review: planned work, existing executed evidence with limitations,
   explicit blocker, or justified deferral. Partial coverage must name the uncovered conditions. This table is a
   planning completeness check, not an RTM or a verification-status register.
7. Draft issue bodies using the [delivery issue template](../../.github/ISSUE_TEMPLATE/delivery.md). For issue-ready
   links use full repository URLs pinned to the recorded source revision; local relative links do not resolve in
   GitHub issue bodies. Keep parent containment separate from blocking dependencies. Use a parent for a substantial
   coordinated effort; smaller efforts can propose standalone issues. Do not invent issue numbers or relationships.
8. Review coverage, outcomes, scope, dependencies, duplication, and evidence boundaries. Record findings and
   unresolved decisions. Merge into `main` through a PR approves the merged decomposition; the PR is the review
   governance. Record the merged PR and revision as approval. Agent review alone does not approve it.

## Plan states

| Status      | Required record                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| `draft`     | A proposal, including inspection limits and unresolved decisions.                                      |
| `reviewed`  | Maintainer approval reference for the decomposition and completed coverage review.                     |
| `issued`    | Actual issue URLs mapped to slices; record any approved unissued or deferred work.                     |
| `completed` | Attributable issue/PR completion references for adopted work; unresolved or withdrawn scope explained. |

A reviewed plan may include explicit blocked or deferred work, but must have no unexplained coverage gaps.
Plans merged into `main` are reviewed even when their committed status or approval text has not yet been updated.
Normalize those records when publishing. Later local scope changes are not approved by the earlier merge.
Approval of a decomposition does not settle an unresolved product policy. Later publication must preserve the gates.
When revising an adopted plan, retain issue links and approval history, identify changed scope, and return the changed
proposal to `draft` pending renewed approval. Existing published work remains linked.

Issue closure, PR merge, and plan completion do not approve or verify a requirement. Execution evidence is recorded
through the requirements workflow after assessment of its scope. A future publication operation may add actual
issue/PR URLs to requirement delivery references; drafting a plan does not fabricate those references.

## Agent use and boundaries

- `$delivery-plan Plan delivery for <requirement IDs>` creates or updates a draft plan.
- `$delivery-review Review docs/delivery/<effort>.md` reports findings without editing by default.
- `$delivery-issues Publish docs/delivery/<effort>.md` publishes a reviewed, maintainer-approved plan, creates native
  parent/child and explicit blocking relationships, and records verified issue URLs. It can resume partial publication.

The repository-local skills live in [.agents/skills](../../.agents/skills). Planning permits read-only issue inspection
when available; it does not require external access or imply GitHub writes. These skills do not change requirements,
implement code/tests or commit automatically. `delivery-plan` and `delivery-review` do not publish issues.
`delivery-issues` requires an explicit publishing request in addition to decomposition approval. A verified merge
into `main` supplies that approval; stale draft metadata does not block it. It verifies the remotely accessible
approved plan revision and reconciles open and
closed issues by plan/slice identity before writing. Partial publication retains URLs and `reviewed` status; `issued`
requires complete verified publication or explicitly approved unissued/deferred work, including required native
relationships. Publication records remain local until separately committed and pushed.

No active Spec Kit state, synchronization, Projects
automation, RTM generator, or new runtime tool is required. Historical specifications do not override accepted register
decisions. Read architecture for ownership and implementation context, not to demand synchronization of old specs.

## Plans

- [Tenant resolution pilot](tenant-resolution.md)
