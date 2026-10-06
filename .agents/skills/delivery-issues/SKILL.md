---
name: delivery-issues
description: Publish approved Pre-ETS delivery plans or explicitly authorized revisions as GitHub issues with native relationships and recoverable publication records. Independent of Spec Kit.
---

# Delivery issues

Read the [delivery guide](../../../docs/delivery/README.md),
[delivery issue template](../../../.github/ISSUE_TEMPLATE/delivery.md), and
[requirements guide](../../../docs/requirements/README.md), then the requested plan and its source entries.
Use the repository delivery template, not a generic GitHub issue template.

## Publication prerequisites

An explicit request to publish authorizes issue creation, publication-related body and relationship updates,
and local plan records. Decomposition approval alone does not authorize GitHub writes. Reuse authorization
already supplied in the session; do not ask again. A request to check an issued plan permits inspection only.

Merge into `main` is the review governance and approves the merged decomposition. Verify the plan's current
proposal is on remote `main` and record its merged PR and revision as approval; stale `draft` status or pending
approval text in that merged revision does not block publication. Normalize those local records to `reviewed`.
For plans not merged into `main`, require `reviewed` status and recorded maintainer approval of the current
decomposition. In either case require completed coverage without unexplained gaps. Resume partial publication;
inspect issued plans and repair publication only when requested. For an expressly authorized pending-PR revision,
use the exception below. Otherwise reject unapproved local draft changes; a prior
merge does not approve later scope changes. Do not adopt or redesign the decomposition.

Resolve the GitHub repository and hostname from the Git remote. Verify the target matches it before every write;
do not guess a repository or use an unrelated CLI default. Determine the full committed revision containing the
approved plan and verify it is accessible on that remote. This publication revision is distinct from the plan's
requirement and implementation source revisions. Ensure local proposal content matches that approved revision;
only publication URLs, publication status, verified relationship records, recovery notes, and approval/status
normalization citing the verified main merge may differ. Slice content, dependency definitions, and approved
deferrals must match. Compare selected criteria with current accepted requirements and stop
on material scope, lifecycle, or promise drift requiring renewed review. Preserve approved blockers and deferrals.

Discover available GitHub tools or `gh` capabilities for issue reads/writes, native sub-issues, and native blocking
relationships before publication. Verify authentication/access using read-only operations; do not probe by creating
issues. If required capability is known to be unavailable, report it before creating anything. Later relationship
failure leaves publication incomplete. Do not silently substitute body links for required native relationships.

## Explicitly authorized revisions

A maintainer may explicitly authorize revising an issued decomposition and its GitHub issues during a pending PR.
For that request, use the committed, remotely accessible revision of the requested proposal rather than requiring
it already on main. Record the authorization, changed scope, previous approval/publication history, and pending PR
review; keep the revised plan draft until renewed approval. This exception requires express authorization for the
revision and external writes; ordinary publication still follows the prerequisites above. Do not infer it from a
planning request or from approval of an earlier decomposition.

Reconcile stable plan/slice identities and reuse mapped issues; add only newly adopted increments. Preserve unrelated
content and relationships. Within the explicitly authorized revision, compare old and proposed blocking edges,
remove only obsolete plan-owned edges, and add the new prerequisites after verifying endpoint identities. Read back
bodies, containment, and blocking edges. Record verified publication separately from decomposition approval; a
fully synchronized pending proposal remains draft. Preserve successes and recovery records on failures as below.

## Prepare and reconcile

Read existing mapped issues and inspect both open and closed issues, following pagination or targeted searches
until all proposed identities are reconciled. Report incomplete access and stop creation for unresolved identities.
Use the repository, repository-relative plan path, and stable slice ID as publication identity. For a proposed
parent use reserved identity `parent`; reject a conflicting slice ID. Include a marker in each body, for example:

`<!-- delivery-issue: plan=docs/delivery/tenant-resolution.md; slice=S1 -->`

The hosting repository supplies the repository part of the identity. Keep the marker stable across revisions.
Verify mapped issues belong to that repository and match the intended plan/slice. For older mapped issues without
a marker, inspect their plan links and scope before adding one within publication authorization. Title similarity
alone never establishes identity. Multiple matching issues or conflicting mappings require reconciliation before
further writes. A closed matching issue is not replaced or reopened; report its state and stop if its scope no
longer represents the approved slice.

Render the approved parent and slice bodies using the delivery template. Preserve proposed titles, exact ACs and
partial coverage, outcomes, scope, completion evidence, decisions, and shipping gates. Preserve pinned requirement
links. Replace draft publication placeholders with full links to the approved publication revision and slice anchors.
Use verified actual issue URLs for dependencies and children as they become available. Do not invent issue numbers,
labels, assignees, milestones, issue types, or Projects assignments.

Separate parent containment, explicit start/sequencing dependencies, and shipping gates. Validate dependency targets
and cycles before creation; do not infer blocking edges from coordination language, containment, or shipping gates.
Create only adopted work; retain explicitly approved unissued/deferred work with its reason.

## Publish and record

Create a proposed parent first, if present, then missing slice issues in dependency order. Reuse verified existing
issues, including closed ones. Use structured tool arguments or exact temporary body files (`--body-file` with
`gh issue`); use JSON input files for API payloads when needed. Discover current API contracts rather than copying
unverified endpoint syntax. Preserve unrelated content when updating existing bodies.

After each confirmed creation or recovered mapping, immediately record its actual URL under the corresponding
slice or parent in the local plan. Preserve approval history, source revisions, and existing issue links. If local
recording fails, stop further writes and report the confirmed URL for recovery. Do not delete successful work.
Use existing slice delivery-reference fields and add a parent delivery-reference field when needed. Maintain a
`Publication record` section with the approved publication SHA, each identity's URL and observed open/closed state,
verified and outstanding native relationship edges, last confirmed action, and any failed or indeterminate action.
Record the inspection date and explicitly approved unissued/deferred identities. Keep these publication records
separate from the approved dependency definitions and requirement verification evidence.

Once endpoints exist, add and verify native parent/sub-issue relationships and explicit prerequisite blocking
relationships. Include readable actual URL links in parent and child bodies, clearly distinguishing containment
from dependencies and shipping gates. Inspect existing relationships before adding them; do not replace an unrelated
parent or remove relationships without explicit authorization covering their revision. Read back issue bodies and native relationships
to confirm the intended result; successful creation alone is insufficient.

On timeout or an ambiguous write result, inspect the issue identity or relationship state before retrying. Never
blindly repeat creation. If the result remains indeterminate, stop dependent writes and report recovery steps.
On a confirmed failure, retain all successes and stop all further external writes; read-only reconciliation and
local recovery records may continue. Reruns reconcile them
before creating missing work. No rollback, issue closure, or duplicate creation is authorized.

For ordinary approved publication, keep status `reviewed` during partial publication, recording outstanding issues/relationships and failure details.
Move to `issued` only when every adopted item has a verified issue URL or explicit maintainer-approved unissued/
deferred disposition, all required native relationships and body links are verified, and coverage is still complete.
An already issued plan with discovered publication gaps must report them and record an incomplete publication
assessment when repair is authorized; do not claim it is verified or erase its prior issuance history.

Report created/reused issue URLs and states, verified relationships, deferred/unissued work, failures and inspection
limits, plan status, and whether local records are uncommitted. Do not alter requirements or verification status,
implement application code/tests, close issues, commit/push automatically, or add Spec Kit/Projects automation.
