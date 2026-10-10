---
applyTo: ".agents/skills/requirements-bdd-*/**,.agents/skills/speckit-bdd-*/**,.cursor/skills/speckit-bdd-*/**"
---

# Requirements BDD skill review

Review against [Requirements-backed BDD](../../docs/engineering/testing/requirements-bdd.md), keeping shared policy
in that guide. Check concise skill descriptions, frontmatter names, relative links, and retirement redirects.

Preserve distinct workflows: author writes bounded requirement-tagged scenarios; scaffold reuses existing TypeScript
steps and adds missing bindings in the active suite; review reports findings without editing by default. All inspect
current main-branch requirements and report unavailable baseline access. Slice/issue context cannot add obligations.
Check semantic assertions, feature-level `@partial`, continued execution, and separation of completeness from runtime
verification. Steps and relevant helpers need review, not only Gherkin prose.

Retired Spec Kit skills must direct callers to the corresponding repository-local replacement in `.agents/skills`.
Neither active skills nor redirects may restore Spec Kit source authority, write features into the retired directory,
invent requirement IDs, require comprehensive matrices or coverage percentages, or overwrite the historical ledger.
Do not add implicit commits, GitHub writes, product changes, approval promotion, or generated traceability matrices.
