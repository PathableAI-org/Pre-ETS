---
name: requirements-author
description: Interactively create or update durable Pre-ETS behavioral requirements from supplied intent and sources; independent of Spec Kit.
---

# Requirements author

Read the [requirements guide](../../../docs/requirements/README.md) and
[requirement template](../../../docs/requirements/templates/area.md). The guide owns format, Git/PR authority,
ID continuity, confidentiality, observability, verification, and evidence ownership. Apply its public-source
attribution safeguards to prose, examples, filenames, quotations, link labels, and URLs.

## Develop the contract

1. Understand supplied intent and sources. Inspect relevant engineering documentation and existing contracts.
   Implementation explains current behavior; it does not establish required behavior. Attribute inaccessible
   sources and explain the access limitation without inventing facts.
2. Search the entire active requirements tree for overlapping obligations, conflicts, and prerequisites. Include
   deprecated history for ID allocation, supersession, and dependency checks; consult the guide's migration note
   for legacy area documents. Reuse an ID for refinement of the same contract.
3. Develop a working draft collaboratively. Ask one question at a time when meaningful ambiguity exists.
   Stop and ask the human before resolving a conflict with an accepted requirement, material ambiguity affecting
   behavior, failure policy, scope or conditions needing a product decision, or alteration of an established
   obligation. Independent work may continue, but do not resolve the affected contract silently.
4. Incorporate human decisions. Check success and failure outcomes, selectors, mode qualifiers, prerequisites,
   and broad quantifiers. Preserve explicitly approved design choices and scope. Split only independently
   meaningful obligations; technical or evidence boundaries alone do not justify fragmentation.
5. Assess sources and multiple classifications separately, hard dependencies, cross-domain implications,
   observability obligations, and high-level external verification expectations. Read
   [Testing as evidence](../../../docs/engineering/testing/README.md) to assess claims; leave internal testing
   strategies to engineering. Honor documented human verification-plan exceptions without inventing reasons.
6. Recognize sufficient clarity. Proactively recommend finalizing and identify non-blocking uncertainties;
   do not keep asking speculative questions. Present the completed draft for human review.
7. Write according to original task authorization and human direction after drafting and human review are
   complete. A create/update request already authorizes writing; do not impose a second authorization ceremony.
   Discussion or draft-only requests do not authorize repository writes.

## Revise and finish

Before modifying an existing requirement, explain material impacts on its behavioral contract, dependent
requirements, observability, verification expectations, existing evidence relationships, and other domains.
Normally update the verification plan alongside changed criteria or observability, respecting human exceptions.
Identify evidence potentially invalidated by revision. Group logically dependent changes; avoid unrelated bundles.

Use one ID-named file per contract and minimal frontmatter. Check ID uniqueness across active and deprecated
history, missing/circular/deprecated prerequisites, source accuracy, and relative links. Propose deprecation by
moving the historical contract with reason and replacement links; never independently authorize permanent deletion.
Do not add manual status fields or evidence inventories. Inferred evidence relationships may be proposed in a PR
for human approval; do not silently make them authoritative. Never invent results, approval, or legal authority.

Review the diff and formatting, including changed skill files. Report contracts changed, human decisions still
needed, evidence implications, and limitations. This skill adds no automatic commits, GitHub writes, product/test
implementation, automation, RTM, or Spec Kit synchronization.
