---
name: speckit-plan
description: Execute the implementation planning workflow using the plan template
  to generate design artifacts.
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: github-spec-kit
  source: preset:pre-ets-specification-planning
---

# Speckit Plan Skill

# Pre-ETS phased engineering planning

Apply this project workflow before and while executing the wrapped planning command.

When the wrapped workflow performs setup, run
`uv run --with pyyaml==6.0.3 -- .specify/scripts/bash/setup-plan.sh --json` instead of invoking
the Bash script directly. Preset-aware plan-template composition requires PyYAML that
may not exist in the system Python.

## Planning gate and authority

Load `verification.md` from the feature directory in addition to the wrapped command's
inputs. Re-read the delivery issue and authoritative requirement/delivery sources as
needed, but treat the approved `spec.md` and `verification.md` as the feature contract
for planning. Do not edit those sources to make an architecture convenient.

If behavior, authorized scope, acceptance expectations, or verification obligations are
materially ambiguous or conflict with an authority, stop the affected design and report
the five-part blocking finding. Resolve ordinary technical choices in the plan. Do not
send product questions back merely because multiple sound implementations exist.

Before designing Effect code, read `docs/engineering/effect-guidance.md`, the affected
workspace `AGENTS.md`, the available Effect v4 `LLMS.md` and only its relevant linked
material. Verify every proposed external API against the owning workspace's installed
declarations; local source may be ahead of the product pin.

## Required design order

The wrapped research phase may establish the current implementation and dependency
facts. After that, design in this explicit order and keep the phases reviewable:

### 1. Module architecture

Inspect actual consumers and the current recursive ownership boundaries. For every
affected responsibility, decide whether to preserve the structure, extend an existing
public module, decompose it into private children, extract another public module, or
promote an independently owned concern into a package/workspace. Record the decision and
why a new abstraction is or is not warranted. Size or novelty alone is not a reason.

### 2. Public module contracts

Run
`uv run --with pyyaml==6.0.3 -- .specify/scripts/bash/resolve-template.sh modules-contract-template --json`
and use the returned content to create or update `contracts/modules.md`. Cover every
affected public module, including changed existing contracts. Design from actual
consumers inward and state concrete TypeScript signatures before private implementation.

For each public capability identify inputs, success, expected errors, Effect environment
requirements where applicable, semantic invariants, validation/decoding ownership,
compatibility, and relationships with other public modules. The owning parent controls
its public error vocabulary; translate private failures where consumers need stable
semantics without hiding distinct expected outcomes or confusing defects/interruption
with recoverable failure.

Do not add provider interfaces, services, packages, re-exports, or future-shaped types
without a current consumer. Pure transformations and framework-specific adapters remain
idiomatic when Effect adds no useful semantics.

### 3. Module contract evidence

For each contract claim use the repository sequence: consumer → claim → possible
violation → evidence → limitations. Select the smallest meaningful boundary:

- public-interface Vitest examples or Effect service scenarios;
- Fast-Check properties for useful invariants;
- real integration evidence for distinct infrastructure uncertainty;
- existing evidence that already supports the claim;
- manual or transient probes when they add an observation durable tests should not own.

Manual module evidence is conditional, unlike standard feature manual verification.
Observability remains manual or transient. Temporary code and instrumentation must have
cleanup instructions and must not be committed; retain the claim, revision, environment,
observation, result, and limitation instead. Never expose credentials or raw sensitive
values in output.

### 4. Implementation architecture

Only after phases 1–3, design private children, Effect services and Layers, runtime and
resource composition, external adapters, configuration/infrastructure, thin Next.js
boundaries, telemetry instrumentation, and concrete implementation sequencing. Prefer
Effect ecosystem capabilities when they solve an actual Effect workflow; do not wrap
pure TypeScript or framework behavior for uniformity. Reuse the host-owned runtime
rather than constructing one per operation.

### 5. Feature verification integration

Consume rather than replace `verification.md`. In `quickstart.md`, turn its accepted
claims into an implementation-aware execution guide with exact prerequisites, commands,
manual procedures, expected observations, cleanup, retained records, and limitations.
Distinguish module evidence from feature evidence and avoid duplicate observations that
make the same claim at several layers.

Complete the appended sections in `plan.md`; link rather than duplicate
`contracts/modules.md` and `verification.md`. Generate `data-model.md` and external
interface contracts only when the feature actually needs them.


## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Pre-Execution Checks

**Check for extension hooks (before planning)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_plan` key
- If the YAML cannot be parsed or is invalid, do not skip silently: tell the user that `.specify/extensions.yml` could not be read (include the parser error) and that no hooks were checked, including any mandatory (`optional: false`) hooks registered there, then continue normally
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- When constructing command invocations from hook command names, replace dots (`.`) with hyphens (`-`). For example, `speckit.git.commit` → `$speckit-git-commit`.
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory hook** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the Outline.
    ```
    After emitting the block above you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id shown above, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently

## Outline

1. **Setup**: Run `.specify/scripts/bash/setup-plan.sh --json` from repo root and parse JSON for FEATURE_SPEC, IMPL_PLAN, FEATURE_DIR, BRANCH. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").

2. **Load context**: Read FEATURE_SPEC and `.specify/memory/constitution.md`. Load IMPL_PLAN template (already copied).

3. **Execute plan workflow**: Follow the structure in IMPL_PLAN template to:
   - Fill Technical Context (mark unknowns as "NEEDS CLARIFICATION")
   - Fill Constitution Check section from constitution
   - Evaluate gates (ERROR if violations unjustified)
   - Phase 0: Generate research.md (resolve all NEEDS CLARIFICATION)
   - Phase 1: Generate data-model.md, contracts/, quickstart.md
   - Re-evaluate Constitution Check post-design

## Mandatory Post-Execution Hooks

**You MUST complete this section before reporting completion to the user.**

Check if `.specify/extensions.yml` exists in the project root.
- If it does not exist, or no hooks are registered under `hooks.after_plan`, skip to the Completion Report.
- If it exists, read it and look for entries under the `hooks.after_plan` key.
- If the YAML cannot be parsed or is invalid, do not skip silently: tell the user that `.specify/extensions.yml` could not be read (include the parser error) and that no hooks were checked, including any mandatory (`optional: false`) hooks registered there, then continue to the Completion Report.
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- When constructing command invocations from hook command names, replace dots (`.`) with hyphens (`-`). For example, `speckit.git.commit` → `$speckit-git-commit`.
- For each executable hook, output the following based on its `optional` flag:
  - **Mandatory hook** (`optional: false`) — **You MUST emit `EXECUTE_COMMAND:` for each mandatory hook**:
    ```
    ## Extension Hooks

    **Automatic Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}
    ```
    After emitting the block above you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id shown above, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```

## Completion Report

Command ends after Phase 1 design. Report branch, IMPL_PLAN path, and generated artifacts.

## Phases

### Phase 0: Outline & Research

1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:

   ```text
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

### Phase 1: Design & Contracts

**Prerequisites:** `research.md` complete

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Define interface contracts** (if project has external interfaces) → `/contracts/`:
   - Identify what interfaces the project exposes to users or other systems
   - Document the contract format appropriate for the project type
   - Examples: public APIs for libraries, command schemas for CLI tools, endpoints for web services, grammars for parsers, UI contracts for applications
   - Skip if project is purely internal (build scripts, one-off tools, etc.)

3. **Create quickstart validation guide** → `quickstart.md`:
   - Document runnable validation scenarios that prove the feature works end-to-end
   - Include prerequisites, setup commands, test/run commands, and expected outcomes
   - Use links or references to contracts and data model details instead of duplicating them
   - Do not include full implementation code, model/service/controller bodies, migrations, or complete test suites
   - Keep this artifact as a validation/run guide; implementation details belong in `tasks.md` and the implementation phase

**Output**: data-model.md, /contracts/*, quickstart.md

## Key rules

- Use absolute paths for filesystem operations; use project-relative paths for references in documentation
- ERROR on gate failures or unresolved clarifications

## Done When

- [ ] Plan workflow executed and design artifacts generated
- [ ] Extension hooks dispatched or skipped according to the rules in Mandatory Post-Execution Hooks above
- [ ] Completion reported to user with branch, plan path, and generated artifacts


## Pre-ETS completion rule

Do not report planning complete until the five design phases are explicit,
`contracts/modules.md` covers every affected public module, proposed external APIs were
checked against installed declarations, module evidence is claim-based, and
`quickstart.md` operationalizes the approved feature verification plan. No unresolved
product decision may be hidden as an implementation assumption.
