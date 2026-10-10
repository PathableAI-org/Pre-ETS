---
name: requirements-bdd-review
description: Review requirements BDD scenarios, step implementations, and slice evidence against main-branch requirements; report findings without editing by default.
---

# Review requirements BDD

Read [Requirements-backed BDD](../../../docs/engineering/testing/requirements-bdd.md),
[Testing as evidence](../../../docs/engineering/testing/README.md), and
[step guidance](../../../tests/bdd/steps/README.md). Follow the requirements register's
[public-source attribution rule](../../../docs/requirements/README.md#author-a-requirement).

Inspect the requested changes, their scenario callers, inherited/direct requirement tags, step bindings, and
relevant helpers. Resolve IDs against current `origin/main` and report the baseline revision. PR-only requirement
additions or expansions cannot justify assertions. If current baseline access is unavailable, report that
limitation without pretending approval is established. Consult explicitly associated PR issues for slice context
when accessible; issue text cannot expand the promise and missing optional context alone is not a defect.

Assess whether every product assertion serves a referenced requirement and whether actual observations establish
the declared slice. Inspect steps and helpers for hidden presentation or technical obligations and setup hooks
for product assertions. Require distinct evidence rather than exhaustive permutations. Ground proposed additions
in requirement IDs; flag desirable undocumented behavior separately for consideration.

Respect feature-level `@partial` and its stated evidence/gaps. Partial coverage is legitimate, but executable
scenarios must pass and substantiate their claimed outcomes. Suggest tag removal only when that feature and
its step implementations establish the full applicable scope of all feature/scenario references. Do not
equate completeness, issue closure, discovery, or tag removal with reviewed runtime verification.

Return actionable findings with requirement IDs, scenario/step locations, consequences, and bounded corrections.
Separate defects, requirement gaps, and access/evidence limitations. If no defects are found, say so and state
the review's limits and what execution evidence was actually inspected.

Do not edit by default. When corrections are requested, preserve the main-branch promise and slice boundaries.
Do not generate a traceability matrix, rewrite historical artifacts, change requirement status, implement
product behavior, commit implicitly, or write to GitHub.
