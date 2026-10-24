# Pre-ETS contract- and evidence-driven tasks

Apply these rules throughout the wrapped task-generation workflow.

When the wrapped workflow performs setup, run
`uv run --with pyyaml==6.0.3 -- .specify/scripts/bash/setup-tasks.sh --json` instead of invoking
the Bash script directly. Preset-aware tasks-template composition requires PyYAML that
may not exist in the system Python.

Load `verification.md` and `contracts/modules.md` as required inputs in addition to the
wrapped documents. If either is missing, incomplete, or inconsistent with `spec.md` and
`plan.md`, stop and return the work to specification or planning rather than inventing
the missing contract in `tasks.md`.

Requirements, delivery plans, and GitHub issues remain read-only authorities. Tasks may
implement the authorized slice and record evidence, but must not edit or synchronize
those source artifacts. A newly discovered product or scope decision is a blocker or a
proposal for its owning workflow, not an implementation task.

The wrapped rule that test tasks are optional is satisfied here by the approved
`verification.md`: generate the durable, manual, transient, BDD, integration, and
observability tasks it actually requires. Do not manufacture one test per operation or
force a fixed suite. Do not omit evidence merely because the core template calls tests
optional.

## Task ordering

Preserve independently deliverable user-story phases, but order work inside the real
dependency graph:

1. Baseline and declaration inspection needed to validate planned APIs.
2. Shared module boundaries and public contracts that genuinely block several stories.
3. Within each story: establish its public contract and consumer-facing evidence before
   private implementation, then implement private children/composition, integrate
   framework adapters, and execute the applicable feature verification.
4. Cross-cutting completion: agent-executable manual feature verification, required
   transient or operational inspection, quality gates, cleanup, and evidence recording.

Each task must name exact paths and cite the contract, invariant, feature claim, or
verification procedure it realizes. Carry exact public signatures and important semantic
constraints from `contracts/modules.md`; do not defer them to implementation-time
discretion. Use the public parent in tests and consumers, never private descendants.

Evidence tasks must distinguish planned procedures from execution records. Temporary
probes require setup and cleanup and must explicitly avoid committing generated output,
temporary instrumentation, transcripts containing sensitive data, or credentials.
Observability tasks inspect real logs/exported OTel data manually or transiently; do not
add durable assertions over log, span, attribute, telemetry-payload, or exporter output.

Do not create generic setup, logging, security-hardening, or documentation tasks unless
the feature plan names a concrete obligation. Do not label work parallel when it depends
on an unfinished public contract, shares a file, or consumes an incomplete capability.

{CORE_TEMPLATE}

## Pre-ETS completion rule

Before reporting completion, trace every feature verification claim and affected module
contract to implementation and/or evidence tasks, identify intentionally reused existing
evidence, and list any approved limitation. A checklist-shaped task list is not complete
when it omits standard manual feature verification or sequences implementation before
the contract it implements. Generate `tasks.md` on the implementation branch described in
`docs/engineering/git-workflow.md`. Do not add it to the engineering-plan branch.
