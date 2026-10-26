---
name: requirements-bdd-author
description: Author bounded requirements BDD scenarios for main-branch requirement IDs and delivery slices, independently of Spec Kit.
---

# Author requirements BDD

Read [Requirements-backed BDD](../../../docs/engineering/testing/requirements-bdd.md),
[Testing as evidence](../../../docs/engineering/testing/README.md), and the
[BDD command guide](../../../features/README.md). Follow the requirements register's
[public-source attribution rule](../../../docs/requirements/README.md#author-a-requirement).

Resolve the supplied requirement IDs and slice context against current `origin/main` using the guide's baseline
procedure. Inspect existing scenarios and steps before adding evidence. If an ID or slice outcome is missing,
ask for the necessary scope; if current baseline access is unavailable, report the limitation and defer dependent
assertions. Do not substitute Spec Kit sources, PR-only promises, code behavior, or issue text for requirements.
Read explicitly linked delivery issues when accessible; report unavailable context without inventing it.

Write or update only the requested scenarios under `tests/bdd/requirements/`. Use requirement-ID tags inherited
from the feature when every scenario supports the same requirements, otherwise tag scenarios individually.
Describe the claimed outcome and choose distinct observations within the main-branch promise. Use feature-level
`@partial` and a brief evidence/gaps description for intermediate coverage. Flag undocumented desirable behavior
for consideration separately. Do not impose scenario counts, error matrices, or unnecessary example permutations.

Check reused step implementations and relevant helpers for adequate observations and hidden assertions. Identify
missing bindings for scaffolding rather than claiming unwritten steps execute. Run applicable Gherkin lint,
formatting, and discovery checks; report what they establish and any missing executable bindings. Active scenarios
must ultimately execute and pass; `@partial` is not permission to skip them or leave pending steps.

Summarize requirement IDs, baseline revision, evidence slice, remaining gaps, and actual validation results.
Do not change requirements, product code, runner behavior, historical specifications, or the migration ledger;
do not generate a separate matrix, promote verification, commit implicitly, or write to GitHub.
