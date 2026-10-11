---
name: requirements-bdd-scaffold
description: Reuse requirements BDD steps and scaffold missing TypeScript bindings for the active application-boundary suite.
---

# Scaffold requirements BDD steps

Read [Requirements-backed BDD](../../../docs/engineering/testing/requirements-bdd.md),
[Testing as evidence](../../../docs/engineering/testing/README.md),
[step guidance](../../../tests/bdd/steps/README.md), and the [BDD command guide](../../../features/README.md).
Follow the requirements register's [public-source attribution rule](../../../docs/requirements/README.md#author-a-requirement).

Read the requested features under `tests/bdd/requirements/`, resolve their requirement tags against current
`origin/main`, and inspect declared slices and accessible linked issues. Report unavailable current baseline
access and defer dependent scaffolding. Flag unsupported scenario promises rather than encoding them in steps.

Inspect `tests/bdd/steps/`, `tests/bdd/support/`, and `cucumber.mjs` for existing bindings and runtime ownership.
Reuse matching steps; add only missing TypeScript bindings under `tests/bdd/steps/`. Keep shared setup and process
support under `tests/bdd/support/` only when needed. Preserve strict TypeScript settings and the existing owned
Next.js HTTP boundary, using a real browser only when the claim requires an existing supported browser path.
Do not open backing-service clients, mock identity providers, invent a new runner, or generate other language stubs.

Bind steps to observations sufficient for the named requirement slice. Avoid hidden product assertions in
helpers, fixtures, or hooks and review shared-step callers before changing semantics. Reuse does not justify
extra assertions. Scaffold unresolved work explicitly rather than supplying canned success; report unfinished
bindings as incomplete work. Undefined, pending, or failing steps must be resolved before claiming an active
feature is complete, including features tagged `@partial`.

Run discovery and applicable static checks; run runtime BDD only with its documented prerequisites when within
the requested scope. Report requirement IDs, baseline revision, reused/new bindings, remaining work, and actual
results. A dry run is discovery evidence only. Do not expand scenarios, implement product behavior, alter
requirements or runner semantics, regenerate the historical ledger, commit implicitly, or write to GitHub.
