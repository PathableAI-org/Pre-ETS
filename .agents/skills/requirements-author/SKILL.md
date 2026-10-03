---
name: requirements-author
description: Create or update durable Pre-ETS requirements from supplied intent and sources using the repository requirements register. Works independently of Spec Kit.
---

# Requirements author

Read the [requirements guide](../../../docs/requirements/README.md) and
[area template](../../../docs/requirements/templates/area.md). They own the format, ID allocation,
lifecycle, and evidence conventions; do not duplicate a register in another artifact.

Accept notes, a requested behavior change, or source documents. Inspect the existing register for matching
obligations and IDs before drafting. Read relevant supplied sources and current contracts to identify conflicts,
but do not promote incidental code behavior or interesting discovery facts into product obligations.
Ask about material intent conflicts before changing a dependent promise; independent proposals may proceed
with explicitly recorded questions. Attribute inaccessible sources and report the access limitation.

Consider separate obligations when they can change independently or have different owners, failure modes, or
verification boundaries; avoid fragmentation without a useful distinction. Record classification separately
from source attribution according to the guide. Keep supplied source labels and approval boundaries intact.
Separate explicitly approved design constraints from behavioral promises rather than removing those constraints.
Check selectors, prerequisites in each mode, failure outcomes, and the intended classes behind broad claims such
as “all requests.” Ask about material gaps instead of importing policy from incidental implementation behavior.

Check that acceptance criteria explicitly qualify modes and that failure categories reflect their meaning rather
than sharing an outcome accidentally. Inspect dependency lifecycles: record a decision or delivery gate when an
accepted obligation relies on a proposed prerequisite; never infer approval. Record unresolved failure policy as
an implementation-planning dependency. Keep lifecycle, linked delivery state, and accepted execution evidence
separate; do not mirror the latest CI status into verification. Follow the guide's distinction between requirements
changes and governance changes without introducing RTM tooling or automatic publication.

Create or extend a coherent area document and link new areas from the register index. Express the consumer,
conditions, observable outcome, rationale, sources, and acceptance criteria. Replace template placeholders;
omit optional references when absent. Default new entries to `proposed` and `unverified`. Record acceptance
only when approval is explicitly supplied or documented; this skill does not approve requirements.

Preserve IDs for the same obligation. Search all area documents for collisions and semantic duplicates,
including deprecated and superseded entries. For replacements, retain the old entry, allocate fresh IDs,
and record forward replacement links and backlinks as described in the guide. Explain changes to accepted
promises and identify any decision still needed. Reassess evidence after changing criteria.

When recording verification, read [Testing as evidence](../../../docs/engineering/testing/README.md), inspect
the referenced assertions or manual observations, and identify the execution result and scope. Planned tests,
TODOs, links alone, and static checks do not establish a behavioral claim. Do not invent execution results,
delivery references, source approvals, or satisfaction claims.

Review the resulting diff for coherent obligations, unique stable IDs, complete criteria, accurate lifecycle
and verification, and valid relative links. Check formatting of changed Markdown, including skill files when
applicable. Report changed requirements, unresolved decisions, and evidence limitations.

Stay within the requested documentation changes. No active Spec Kit feature, automatic integration,
production/test implementation, commit, GitHub mutation, or external account access is required or implied.
