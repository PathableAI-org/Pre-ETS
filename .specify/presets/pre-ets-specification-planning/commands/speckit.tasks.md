# Pre-ETS contract- and evidence-driven tasks

Apply these rules throughout the wrapped task-generation workflow.

When the wrapped workflow performs setup, run
`uv run --with pyyaml==6.0.3 -- .specify/scripts/bash/setup-tasks.sh --json` instead of invoking
the Bash script directly. Preset-aware tasks-template composition requires PyYAML that
may not exist in the system Python.

Load `verification.md`, `contracts/modules.md`, `contracts/telemetry.md`, and the
implementation slices in `plan.md` as required inputs in addition to the wrapped documents. If either is missing, incomplete, or inconsistent with `spec.md` and
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

## Slices and verification handoff

Group tasks under the implementation slices from `plan.md`, in slice order. Each slice's
tasks implement its module contracts, its telemetry rows from `contracts/telemetry.md`, and
the evidence for its claim IDs. Do not move work between slices; a slice that cannot be
completed as planned is a plan correction. End each slice with these tasks:

1. Run the repository checks, commit, and push the slice as a draft pull request.
2. Request verification from the verification session with the branch, pushed SHA, slice
   ID, claim IDs, and `quickstart.md` sections, as described in
   `docs/engineering/verification-harness.md`.
3. Address the report, repeat verification as needed, and summarize the final report in
   `quickstart.md` and the pull request before marking it ready. Commit the summary as an
   evidence-only commit that changes only the `quickstart.md` execution results, so it needs
   no new verification, and name the verified SHA in the pull request body. Any other change
   after the verified SHA, including to `quickstart.md` steps, needs a new verification request.

Instrumentation tasks name the telemetry row they implement. They never add durable tests
that assert telemetry output.

## Task ordering

Within each slice, preserve independently deliverable user-story phases, but order work
inside the real dependency graph:

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

Before reporting completion, trace every feature verification claim, affected module
contract, and telemetry row to implementation and/or evidence tasks in its planned slice, identify intentionally reused existing
evidence, and list any approved limitation. A checklist-shaped task list is not complete
when it omits standard manual feature verification or sequences implementation before
the contract it implements. Generate `tasks.md` on the implementation branch described in
`docs/engineering/git-workflow.md`. Do not add it to the engineering-plan branch.
