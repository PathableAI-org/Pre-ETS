---
name: test-implement
description: Implement bodyless TODO test outlines selected by test file, fully qualified test title, or line number. Choose meaningful properties, parameterized cases, or examples with Effect or ordinary execution; change tests only. Works independently of Spec Kit.
---

# Test implement

Turn selected pending expectations into executable evidence for public behavior.
Implement tests, not production behavior. This is a companion to
[test-outline](../test-outline/SKILL.md), but does not require that skill to have run
or any Spec Kit state, commands, or artifacts.

## Select pending expectations

Accept these invocation forms:

- `$test-implement <test-file>`
- `$test-implement <test-file> "<fully qualified test title>"`
- `$test-implement <test-file>:<line>`

For a whole file, select only bodyless TODO declarations, including equivalent
`test.todo` or aliased bindings supported by its runner. Resolve bindings rather
than matching the spelling `it` alone. Read implemented tests, parameterized rows,
helpers, and hooks for context and duplicate claims; do not select them for revision.
Skipped tests, empty callbacks, and placeholder bodies are not bodyless TODOs.
Do not activate declarations inside skipped suites as an incidental change.

A fully qualified title includes its enclosing suite titles. A line selector must
identify one test declaration, not an enclosing suite or a nearby test. Require a
unique match; ask for clarification when ambiguous. If the selected test already
has a body, report that it is outside this workflow without rewriting it. If no
eligible TODO exists, report a no-op. Repeating a completed request should make no
further changes.

Read applicable repository and workspace instructions,
[Testing as evidence](../../../docs/engineering/testing/README.md), relevant
contracts, public interfaces, and callers. Resolve unclear or conflicting
expectations before implementing the affected test; continue independent selections.
If existing tests already establish a pending claim, report the overlap and leave
the TODO unchanged rather than silently deleting it or adding duplicate evidence.

## Decide the evidence before writing each test

Identify the consumer, claim, conditions, meaningful violation, and public boundary
responsible for the outcome. Then choose the data technique and execution mode
separately. Briefly explain those choices; no separate planning artifact is needed.

| Choice                 | When it provides useful evidence                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Property               | First choice when the contract supplies a genuine law, a meaningful generated domain, and an independent observation. |
| Parameterized examples | A finite decision table or named cases share setup and assertions.                                                    |
| Single example         | A distinct scenario gains nothing from generation or a table.                                                         |
| Effect execution       | The test exercises Effect operations, services, resource scopes, or test services.                                    |
| Ordinary execution     | The public behavior is synchronous or Promise-based without an Effect requirement.                                    |

A property is authoritative only for the claim and boundary it actually exercises;
a finite run is not a proof. Do not turn a small enumeration into random sampling
or invent laws merely to prefer properties. Retain deliberate boundary examples
when generation cannot guarantee them. A scenario can contain a property, including
one exercised through a public Effect service.

Treat a directory with an `index.ts` or `index.tsx` as one module whose entry point
defines the public interface. Follow re-exports, and exercise public exports rather
than importing private siblings for convenience. Do not move to a private helper
to make a property easier. If the needed public capability is missing, preserve
the TODO and report the gap; do not add exports or substitute a different claim.

## Implement the selected evidence

Preserve outlined claims, meaningful grouping, and all existing implemented test
bodies and helpers. Keep tests in their owning file. Add only the imports,
generators, fixtures, and test helpers needed by the selected expectations. Use
aliases or local setup when changing a shared binding or hook would affect existing
tests. Parameterization may expand a selected expectation into clearly named cases;
do not absorb unselected declarations or erase distinctions between their claims.

Exercise the real implementation under test. Supply controlled dependencies rather
than replacing the subject with a canned implementation or mocking private calls.
Assert observable values, distinguishable public failures, and contractual state
changes. A generic failure assertion is insufficient when the claim names a
particular failure. Fixture contents, private call counts, or merely executing code
do not establish a consumer outcome. For UI claims, observe semantic interaction
and the resulting capability rather than just text presence.

Ask whether a plausible broken implementation would fail the test. Keep expected
results independent of production calculations. Avoid copying the algorithm into
an oracle, tautological assertions, and broad snapshots of incidental structure.
Do not extend into unrelated coverage just because another branch exists.

### Runner and Effect decisions

For Effect work, read [Effect guidance](../../../docs/engineering/effect-guidance.md)
and the owning workspace's instructions. Inspect its manifest, installed declarations,
runner configuration, and existing examples. Prefer installed `@effect/vitest`
helpers for Effect tests and the existing fast-check Vitest connector for ordinary
properties. Verify the exact property and parameterization signatures before using
them; do not assume adapters share APIs or combine connectors mechanically.

Consult the matching version of the official
[@effect/vitest documentation](https://github.com/Effect-TS/effect/blob/main/packages/vitest/README.md).
Current upstream examples can differ from an installed RC. Report documentation
drift rather than inventing APIs or changing unrelated version policy. This skill
permits using the workspace's existing adapter, not adopting it in other workspaces.
Do not import undeclared transitive packages or package-manager store paths.

Provide the real service Layer with scenario dependencies and call its public
operations. Prefer deterministic test services, including controlled time; use live
services only when the claim requires them. Preserve typed failures and defects as
distinct outcomes. Ensure scopes release resources even when assertions fail.

### Property decisions

Read [Property-based testing](../../../docs/engineering/testing/property-based-testing.md)
and consult the official [fast-check properties](https://fast-check.dev/docs/core-blocks/properties/)
and [Vitest connector](https://fast-check.dev/docs/tutorials/setting-up-your-test-environment/property-based-testing-with-vitest/)
documentation as needed, checking installed APIs.

State the law and domain before constructing arbitraries. Construct valid input
relationships with useful shrinking rather than excessive filtering, unchecked
casts, or early returns that make the assertion vacuous. Make important boundaries
reachable and deliberately exercise exact limits when the claim depends on them.
Test invalid inputs at the boundary that owns their rejection.

Create fresh mutable state and acquire/release scoped resources inside every
generated attempt, including shrinking attempts. A test-level hook or shared Layer
does not by itself establish per-attempt isolation. Await asynchronous operations
and the property runner. Avoid hidden randomness, wall-clock dependence, and shared
state that prevent replay. Do not assume fast-check seed/path settings apply to a
different property engine; use the selected runner's actual replay mechanism.

Keep configuration local and justified by the claim and cost, without global run
quotas. Preserve counterexamples and reported replay information when diagnosing a
failure. Do not narrow valid inputs or disable shrinking to hide a defect. Remove
temporary replay restrictions after diagnosis; retain a concrete regression example
when it contributes a meaningful boundary alongside the property.

## Validate and report

Run the selected tests with runner filters, then the owning file and applicable
workspace checks using repository scripts. Avoid committed `.only` selectors.
Review the diff for changes to existing behavior, unrelated TODOs, production files,
or configuration. Test discovery and typechecking are not evidence that assertions
passed; report execution separately.

Fix defects in the new test setup or assertions. If a sound test reveals incorrect
production behavior, leave it as an ordinary failing test and report the production
gap. Do not change application code, weaken expectations, mark it as expected to
fail, skip it, or revert it to TODO merely to obtain green checks.

If a required interface or tooling is missing, leave the affected TODO pending and
report the blocker. Check tool availability before running commands that might
automatically install dependencies. Do not install packages, change runner
configuration, suppress checks, or claim unverified adapter compatibility. Preserve
completed independent tests and distinguish environmental failures from assertion
failures.

Report each selected expectation's location, technique, execution mode, and outcome:
passing evidence, meaningful failure, or still-pending blocker. Include commands
actually run and the limitations of the exercised boundary. Identify preserved
counterexamples and unresolved contract conflicts where relevant. Do not create
traceability artifacts, run Spec Kit integration, commit, or publish automatically.
