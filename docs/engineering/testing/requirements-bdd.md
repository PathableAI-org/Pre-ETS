# Requirements-backed BDD

Requirements BDD provides bounded evidence for product and system promises in
[`docs/requirements/`](../../requirements/README.md). A feature expresses the semantic meaning of a requirement;
it does not create new obligations. Use [Testing as evidence](README.md) to choose meaningful observations and
the [BDD command guide](../../../features/README.md) for execution.

## Start from main-branch requirements

For BDD authoring and review, approval means the requirement is present in current `origin/main`. Read that
version before adding a feature or expanding a scenario's expected behavior. A requirement introduced or
strengthened only on the PR branch cannot justify new assertions: merge the requirement change first.
Repairs that preserve the main-branch promise can proceed without a requirement change.

Refresh `origin/main` with `git fetch origin main`, then inspect the relevant document with
`git show origin/main:docs/requirements/<area>.md`. In GitHub review, inspect the corresponding current main-branch
document rather than assuming the PR's copy or a non-main target branch is the approved source. Identify the
baseline revision used. If current baseline access is unavailable, report that limitation; do not assume a local
copy is current or author dependent assertions without establishing their requirement basis.

This is the BDD source prerequisite, not an additional lifecycle gate. It does not automatically set a register
entry to `accepted` or `verified`. Preserve the register's lifecycle decisions, retirement history, and evidence
rules. Retired entries explain history; follow their replacement links for current promises.
Specifications, current code, issue descriptions, and reviewer suggestions do not substitute for main-branch
requirements.

## Identify the evidence

Use lowercase requirement-ID tags: `PREETS-TENANT-003` becomes `@preets-tenant-003`. Every scenario must directly
carry or inherit the IDs of the requirements it provides evidence for. Feature-level tags apply to every scenario;
put differing or additional IDs on individual scenarios. Reference existing IDs, and add a tag only when the
scenario contributes evidence for that requirement. An ID establishes traceability, not complete verification.

For each scenario, identify the required conditions, the meaningful outcome, and the violation its assertions
would detect. Justify every product assertion through the referenced requirement's statement, acceptance criteria,
or explicit design constraints. Use the rationale to understand the promise, not to invent extra outcomes.
Technical observations are appropriate when they establish the promised outcome; incidental UI content,
private implementation choices, and setup mechanics do not create promises merely because they exist today.

Review the step bindings and relevant helpers as well as the Gherkin. A step must establish the outcome it names
without silently asserting additional behavior. Inspect shared steps in the context of their callers. Setup can
check harness prerequisites, but product assertions belong in steps, not in fixtures or hooks. Keep observations
at the owned application boundary described in the [step guidance](../../../tests/bdd/steps/README.md).

Add scenarios and example rows when they contribute distinct evidence for a meaningful condition or failure mode.
There is no mandatory happy/edge/error matrix, scenario count, coverage percentage, or requirement to duplicate
module tests in BDD. Flag desirable behavior absent from the requirement as a gap for consideration, separately
from defects; keep it out of the assertions until its requirement basis is merged into main.

## Intermediate slices with `@partial`

A PR may establish an intermediate slice of a requirement. Apply `@partial` at feature level when the feature's
scenarios establish only part of any referenced requirement. Briefly describe the evidence established and the
remaining gaps in the feature description. Scenario-specific limitations can be described locally when useful.
Incomplete requirement coverage is legitimate; the claimed slice still needs convincing evidence.

`@partial` describes evidence scope. It never skips scenarios, relaxes assertions, or permits failing, undefined,
or pending steps. Tagged scenarios remain executable and must pass the same checks as other active scenarios.
The tag is independent of the register's `partial` verification value.

Reviewers, including Copilot, should suggest removing `@partial` when that feature's scenarios and step
implementations establish the full applicable scope of all its referenced requirements, including differing
scenario-level references. A completed issue, evidence in another feature, or a passing slice alone is not a
reason to remove it. Full scenario coverage and tag removal do not automatically establish reviewed runtime
verification; record actual execution and limitations through the requirements register's evidence rules.

## Example: dashboard reachability

The existing [dashboard feature](../../../tests/bdd/requirements/tenant-context.feature) exercises HTTP reachability
under tenant configuration. A slice targeting reachability can be described as follows; this is an illustrative
description, not a migration of that feature or proof of the full
[tenant-selection requirement](../../requirements/tenant-resolution.md#preets-tenant-003).

```gherkin
@preets-tenant-003 @partial
Feature: Dashboard reachability
  This slice establishes that a document request succeeds with usable tenant configuration.
  It does not establish which tenant was selected or configuration use in authenticated requests and flows.

  Scenario: A configured tenant document is reachable
    Given production tenant sites for Springfield and Shelbyville
    And host resolution uses base hostname "example.test"
    When a visitor requests the document at "springfield.example.test"
    Then the response status is 200
```

HTTP success is evidence for that reachability slice. It does not demonstrate tenant identity, tenant isolation,
or all configuration-consuming behavior. Adding “the landing page displays the tenant name” would impose a
presentation obligation absent from this requirement. Hiding that assertion inside the response-status step
would impose the same unsupported promise. If tenant-name presentation seems desirable, flag the requirement
gap for consideration rather than adding it to this feature.

## Review with slice context

Inspect issues explicitly associated with the PR when accessible, including its linked delivery issue and
relevant slice description. They help explain the intended intermediate outcome and remaining work, but cannot
expand or override the main-branch requirement. If issue context is unavailable, report the limitation and use
the declared feature scope and available requirement evidence; do not invent an issue or slice intent.

Report actionable defects with requirement IDs, the affected scenario or step, the consequence, and a bounded
correction. Distinguish requirement gaps and access/evidence limitations. Ground suggestions to add assertions
in requirement IDs just as strictly as assertions already in the change. Neither missing full requirement
coverage nor inability to read an optional issue is itself a product defect.

Use these cases when reviewing changes to this discipline:

| Case                                                                     | Expected review                                                                        |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| A new or stronger promise exists only on the PR branch                   | Defer dependent BDD assertions until the requirement change is merged into main.       |
| A reachability slice asserts a tenant name on the page                   | Flag the unsupported presentation promise; raise a separate requirement gap if useful. |
| A bounded Gherkin step hides a content assertion in its implementation   | Flag the implementation's unsupported assertion.                                       |
| A tagged partial slice has convincing evidence for its declared outcome  | Respect its scope; do not demand full requirement coverage in the PR.                  |
| A feature fully captures its referenced scope but retains `@partial`     | Suggest tag removal without declaring runtime verification.                            |
| A linked issue requests behavior absent from the main-branch requirement | Flag the gap separately; the issue cannot justify an assertion.                        |
| Main-branch requirements or linked-issue context cannot be accessed      | Report the specific limitation without inventing approval or scope.                    |

## Agent workflows

- `$requirements-bdd-author` authors bounded requirements scenarios.
- `$requirements-bdd-scaffold` reuses steps and scaffolds missing bindings in the active suite.
- `$requirements-bdd-review` reviews scenarios and step evidence without editing by default.

These repository-local skills live in [.agents/skills](../../../.agents/skills). The former Spec Kit BDD skills
are retired redirects. The [historical migration ledger](../../../features/TRACEABILITY.md) remains historical;
these workflows do not regenerate it or introduce a separate traceability matrix.
