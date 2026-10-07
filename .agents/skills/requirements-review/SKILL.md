---
name: requirements-review
description: Review durable Pre-ETS requirements for clarity, sources, lifecycle consistency, and traceability evidence. Reports findings without editing unless changes are requested; independent of Spec Kit.
---

# Requirements review

Follow the [requirements guide](../../../docs/requirements/README.md#author-a-requirement)’s public-source
attribution rule: never name a specific partner or client in public repository artifacts or GitHub titles/bodies.
Use generic attribution and check prose, examples, quotations, filenames, link labels, and URLs for identifying
names or abbreviations. Preserve evidence meaning and approval boundaries without publishing the identity.

Read the [requirements guide](../../../docs/requirements/README.md) and
[area template](../../../docs/requirements/templates/area.md). Review the requested area or entries;
search the full register when checking ID uniqueness, semantic duplicates, or replacement relationships.
Templates are illustrative and do not allocate IDs or establish product obligations.

Assess whether each statement names a consumer, conditions, and observable outcome; whether its rationale
and attributable sources support the obligation; and whether its acceptance criteria can distinguish a
meaningful violation. Identify conflicting sources, unresolved product decisions, and accidental implementation
constraints. Treat inaccessible sources as an assessment limitation, not proof that attribution is invalid.

Assess whether independent obligations with different owners, failure modes, or evidence boundaries need distinct
IDs without demanding fragmentation. Check classification separately from source attribution and verify that
approved design constraints are identified as such. Distinguish accidental implementation constraints from
explicit maintainer choices; review feedback must not silently override approved intent. Check selectors,
mode-specific prerequisites and failure outcomes, and the request classes covered by broad quantifiers.

Check that acceptance criteria explicitly qualify modes and that failure categories reflect their meaning rather
than sharing an outcome accidentally. Inspect dependency lifecycles: record a decision or delivery gate when an
accepted obligation relies on a proposed prerequisite; never infer approval. Record unresolved failure policy as
an implementation-planning dependency. Keep lifecycle, linked delivery state, and accepted execution evidence
separate; do not mirror the latest CI status into verification. Follow the guide's distinction between requirements
changes and governance changes without introducing RTM tooling or automatic publication.

Check IDs, lifecycle and decision references, retirement history, and replacement links against the guide.
Acceptance and verification are independent. A closed issue or present implementation does not demonstrate
approval or satisfaction. Missing optional delivery/design references are not inherently defects.

Check local links and the relevance of their targets. For verification, read
[Testing as evidence](../../../docs/engineering/testing/README.md) and inspect referenced assertions or manual
observations. Map evidence to acceptance criteria and the responsible boundary. Distinguish planned tests,
static checks, partial runtime evidence, and executed evidence supporting all criteria within stated scope.
Check the recorded execution result, date/revision, and limitations; flag stale evidence when criteria changed.
Do not infer that tests passed from their existence. If execution is unavailable or outside the request,
report that limitation rather than fabricating results. No external access is required for a local review.

Return actionable findings with the requirement ID, file location, consequence, and suggested correction.
Distinguish defects from legitimate unimplemented or unverified gaps, and separate unresolved questions from
confirmed findings. If no defects are found, say so and state the assessment's limits.

Do not edit by default. When corrections are requested, preserve IDs, retirement history, and source approval
boundaries, and follow the shared guide. Do not generate a separate RTM, change Spec Kit artifacts, implement
product behavior, commit automatically, or write to GitHub as part of this review.
