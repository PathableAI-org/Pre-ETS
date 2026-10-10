---
name: requirements-review
description: Independently review Pre-ETS behavioral contracts, sources, dependencies, observability, verification plans, and evidence implications; report without editing by default.
---

# Requirements review

Read the [requirements guide](../../../docs/requirements/README.md) and
[requirement template](../../../docs/requirements/templates/area.md). They own the shared conventions, including
Git/PR authority and public-source confidentiality. Check identifying prose, examples, quotations, filenames,
link labels, and URLs. Review requested contracts and search the entire active tree for overlapping obligations;
include deprecated history for ID uniqueness, supersession, and dependencies. Account for the documented legacy
migration transition rather than treating unchanged area documents as new-format submissions.

Independently assess:

- Contract clarity and cohesion: consumer, conditions, scope, selectors, mode-specific prerequisites, success
  and failure outcomes, and criteria that distinguish meaningful violations. Split only independently meaningful
  obligations; do not demand fragmentation by component, criterion, or evidence type.
- Sources, rationale, and classifications: distinguish attribution from classification and direct regulatory
  duties from informed product decisions or client practices. Flag unsupported legal assertions. Inaccessible
  sources limit assessment; they do not alone invalidate attribution. Preserve approved design constraints.
- Duplicates, conflicts, and dependencies: hard prerequisites, missing IDs, cycles, deprecated prerequisites,
  hidden cross-domain implications, and effects on dependent contracts. Do not automatically split or relocate.
- Observability: deliberate consideration and meaningful operational obligations, without instrumentation details.
  Assess these as binding acceptance obligations even outside the acceptance-criteria section.
- Verification plans: external claims, evidence categories, assumptions, known limits, unresolved questions,
  and coverage of criteria and observability. Respect explicit human omissions and their supplied rationale;
  do not enforce a formal triviality threshold or repeatedly flag authorized exceptions.
- ID continuity, ID-only filenames, frontmatter, domain ownership, historical content, deprecation reasons,
  replacements, and links. Check Git/PR history for authority; status fields and implementation are not authority.
- Existing evidence potentially affected by changed contracts. Read
  [Testing as evidence](../../../docs/engineering/testing/README.md) and inspect meaningful assertions,
  evaluation conditions, execution boundaries, supported claims, results where available, and limits.
  A reference alone does not prove full support. Distinguish planned from executed evidence and monitoring
  implementation from validated operation. Identify weakened claims, removed references, and newly unsupported
  outcomes. Propose incidental relationships for human approval, without authorizing them.

Return concrete findings with requirement ID, file location, consequence, and suggested correction.
Distinguish confirmed defects/conflicts, possible semantic regressions, potential evidence gaps, legitimate
intentional changes, and unresolved human decisions. Missing implementation or executed evidence is not by itself
an invalid contract. Missing optional references are not defects. State assessment limits and do not invent
execution results; if no defects are found, say so.

Do not edit by default or automatically rewrite accepted behavior to resolve substantive questions.
Requested corrections must preserve IDs, history, and human authority and follow the authoring workflow where
product decisions are needed. Review adds no automatic commits, GitHub mutations, product/test implementation,
structural validators, RTM, or synchronization with historical Spec Kit artifacts.
