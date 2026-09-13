---
name: speckit-analyze
description: Perform a non-destructive cross-artifact consistency and quality analysis
  across spec.md, plan.md, and tasks.md after task generation.
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: github-spec-kit
  source: preset:closed-vocabulary
---

# Speckit Analyze Skill

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Pre-Execution Checks

**Check for extension hooks (before analysis)**:

- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_analyze` key
- If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- When constructing command invocations from hook command names, replace dots (`.`) with hyphens (`-`). For example, `speckit.git.commit` → `/speckit-git-commit`.
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

    Wait for the result of the hook command before proceeding to the Goal.
    ```
    After emitting the block above you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id shown above, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently

## Goal

Identify inconsistencies, duplications, ambiguities, and underspecified items across the three core artifacts (`spec.md`, `plan.md`, `tasks.md`) before implementation. This command MUST run only after `/speckit-tasks` has successfully produced a complete `tasks.md`.

## Operating Constraints

**STRICTLY READ-ONLY**: Do **not** modify any files. Output a structured analysis report. Offer an optional remediation plan (user must explicitly approve before any follow-up editing commands would be invoked manually).

**Constitution Authority**: The project constitution (`.specify/memory/constitution.md`) is **non-negotiable** within this analysis scope. Constitution conflicts are automatically CRITICAL and require adjustment of the spec, plan, or tasks—not dilution, reinterpretation, or silent ignoring of the principle. If a principle itself needs to change, that must occur in a separate, explicit constitution update outside `/speckit-analyze`.

## Execution Steps

### 1. Initialize Analysis Context

Run `.specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks` once from repo root and parse JSON for FEATURE_DIR and AVAILABLE_DOCS. Derive absolute paths:

- SPEC = FEATURE_DIR/spec.md
- PLAN = FEATURE_DIR/plan.md
- TASKS = FEATURE_DIR/tasks.md

Abort with an error message if any required file is missing (instruct the user to run missing prerequisite command).
For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").

### 2. Load Artifacts (Progressive Disclosure)

Load only the minimal necessary context from each artifact:

**From spec.md:**

- Overview/Context
- Functional Requirements
- Success Criteria (measurable outcomes — e.g., performance, security, availability, user success, business impact)
- User Stories
- Edge Cases (if present)

**From plan.md:**

- Architecture/stack choices
- Data Model references
- Phases
- Technical constraints

**From tasks.md:**

- Task IDs
- Descriptions
- Phase grouping
- Parallel markers [P]
- Referenced file paths

**From constitution:**

- Load `.specify/memory/constitution.md` for principle validation

### 3. Build Semantic Models

Create internal representations (do not include raw artifacts in output):

- **Requirements inventory**: For each Functional Requirement (FR-###) and Success Criterion (SC-###), record a stable key. Use the explicit FR-/SC- identifier as the primary key when present, and optionally also derive an imperative-phrase slug for readability (e.g., "User can upload file" → `user-can-upload-file`). Include only Success Criteria items that require buildable work (e.g., load-testing infrastructure, security audit tooling), and exclude post-launch outcome metrics and business KPIs (e.g., "Reduce support tickets by 50%").
- **User story/action inventory**: Discrete user actions with acceptance criteria
- **Task coverage mapping**: Map each task to one or more requirements or stories (inference by keyword / explicit reference patterns like IDs or key phrases)
- **Constitution rule set**: Extract principle names and MUST/SHOULD normative statements

### 4. Detection Passes (Token-Efficient Analysis)

Focus on high-signal findings. Limit to 50 findings total; aggregate remainder in overflow summary.

#### A. Duplication Detection

- Identify near-duplicate requirements
- Mark lower-quality phrasing for consolidation

#### B. Ambiguity Detection

- Flag vague adjectives (fast, scalable, secure, intuitive, robust) lacking measurable criteria
- Flag unresolved placeholders (TODO, TKTK, ???, `<placeholder>`, etc.)

#### C. Underspecification

- Requirements with verbs but missing object or measurable outcome
- User stories missing acceptance criteria alignment
- Tasks referencing files or components not defined in spec/plan

#### D. Constitution Alignment

- Any requirement or plan element conflicting with a MUST principle
- Missing mandated sections or quality gates from constitution

#### E. Coverage Gaps

- Requirements with zero associated tasks
- Tasks with no mapped requirement/story
- Success Criteria requiring buildable work (performance, security, availability) not reflected in tasks

#### F. Inconsistency

- Terminology drift (same concept named differently across files)
- Data entities referenced in plan but absent in spec (or vice versa)
- Task ordering contradictions (e.g., integration tasks before foundational setup tasks without dependency note)
- Conflicting requirements (e.g., one requires Next.js while other specifies Vue)

### 5. Severity Assignment

Use this heuristic to prioritize findings:

- **CRITICAL**: Violates constitution MUST, missing core spec artifact, or requirement with zero coverage that blocks baseline functionality
- **HIGH**: Duplicate or conflicting requirement, ambiguous security/performance attribute, untestable acceptance criterion
- **MEDIUM**: Terminology drift, missing non-functional task coverage, underspecified edge case
- **LOW**: Style/wording improvements, minor redundancy not affecting execution order

### 6. Produce Compact Analysis Report

Output a Markdown report (no file writes) with the following structure:

## Specification Analysis Report

| ID | Category    | Severity | Location(s)      | Summary                      | Recommendation                       |
| -- | ----------- | -------- | ---------------- | ---------------------------- | ------------------------------------ |
| A1 | Duplication | HIGH     | spec.md:L120-134 | Two similar requirements ... | Merge phrasing; keep clearer version |

(Add one row per finding; generate stable IDs prefixed by category initial.)

**Coverage Summary Table:**

| Requirement Key | Has Task? | Task IDs | Notes |
| --------------- | --------- | -------- | ----- |

**Constitution Alignment Issues:** (if any)

**Unmapped Tasks:** (if any)

**Metrics:**

- Total Requirements
- Total Tasks
- Coverage % (requirements with >=1 task)
- Ambiguity Count
- Duplication Count
- Critical Issues Count

### 7. Provide Next Actions

At end of report, output a concise Next Actions block:

- If CRITICAL issues exist: Recommend resolving before `/speckit-implement`
- If only LOW/MEDIUM: User may proceed, but provide improvement suggestions
- Provide explicit command suggestions: e.g., "Run /speckit-specify with refinement", "Run /speckit-plan to adjust architecture", "Manually edit tasks.md to add coverage for 'performance-metrics'"

### 8. Offer Remediation

Ask the user: "Would you like me to suggest concrete remediation edits for the top N issues?" (Do NOT apply them automatically.)

### 9. Check for extension hooks

After reporting, check if `.specify/extensions.yml` exists in the project root.

- If it exists, read it and look for entries under the `hooks.after_analyze` key
- If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- When constructing command invocations from hook command names, replace dots (`.`) with hyphens (`-`). For example, `speckit.git.commit` → `/speckit-git-commit`.
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory hook** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}
    ```
    After emitting the block above you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id shown above, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently

## Operating Principles

### Context Efficiency

- **Minimal high-signal tokens**: Focus on actionable findings, not exhaustive documentation
- **Progressive disclosure**: Load artifacts incrementally; don't dump all content into analysis
- **Token-efficient output**: Limit findings table to 50 rows; summarize overflow
- **Deterministic results**: Rerunning without changes should produce consistent IDs and counts

### Analysis Guidelines

- **NEVER modify files** (this is read-only analysis)
- **NEVER hallucinate missing sections** (if absent, report them accurately)
- **Prioritize constitution violations** (these are always CRITICAL)
- **Use examples over exhaustive rules** (cite specific instances, not generic patterns)
- **Report zero issues gracefully** (emit success report with coverage statistics)

## Context

$ARGUMENTS

---

## Additional pass: closed-set divergence

This pass runs after the analysis above. It only adds findings. It never removes,
downgrades, or overrides anything the core analysis produced.

### What this pass looks for

A **closed set** is a named set of admissible values enumerated in prose inside a
spec artifact: statuses, categories, kinds, roles, admissible types. Spec languages
usually have nowhere to declare such a set once, so it gets restated wherever it is
needed — and the restatements drift.

This pass finds the case where the same named set is enumerated in more than one
place and the enumerations do not agree on their members.

It is not a coverage gap: every requirement can be covered. It is not a structural
inconsistency between spec, plan and tasks: the artifacts can agree about what
exists. It is two statements of the same closed set that disagree about its members,
sitting inert until an execution path finally traverses it.

### Detection

**1. Collect declarations.** A declaration is a fragment that names a set and then
enumerates it. Recognise it by an introducer followed by two or more values:

```
introducers   :   is one of   must be one of   are   in   ∈   belongs to
separators    ,   |   /   or   and
```

Record for each declaration: the **name** that precedes the introducer, the member
list, the file, and the line.

**2. Group by name, not by content.** Two declarations belong to the same group only
when the name preceding the introducer is the same or an obvious morphological
variant (`order status` / `order statuses`).

> **Calibration rule — this is where the false positives come from.** Do not group
> declarations because they happen to share member values, and do not treat a bare
> word appearing somewhere in a sentence as a declaration of that set. Grouping on
> loose content similarity is the single largest source of noise in this check: in
> the reference calibration it produced 72 findings where 7 were real, and the 65
> extra were all triggered by a word appearing anywhere in the surrounding text.
> Require the name. If there is no name in front of the introducer, the fragment is
> not a declaration.

**3. Compare members within each group.** Order does not matter. Case and
surrounding punctuation do not matter.

### What to report

For each group holding two or more declarations whose member sets differ:

```
set name
  declaration A   file:line   members
  declaration B   file:line   members
  in A not in B   <members>
  in B not in A   <members>
```

Report the difference in both directions. "They disagree" is not actionable; which
member each side omits is.

### Coverage — required, and required even when nothing is found

Every run of this pass reports two numbers:

```
declarations inspected      NON-EMPTY LINES read across the artifacts
declarations recognised     how many yielded an enumeration this pass could parse
```

**The unit of `inspected` is the non-empty line, and it is fixed.** Not sentences, not
fragments that look like candidates. The figure exists so a zero is not read as a clean
corpus, and only a denominator anyone can recount without judgement can serve as a floor.
A denominator that depends on what the reader considers a candidate can be argued with,
and a figure that can be argued with bounds nothing. It reads low — most lines could
never carry a declaration — and that is correct: the low number is the honest one.

**A zero-divergence result without these two numbers does not state anything about
the spec.** It states something about what the pass managed to read.

This is not tidiness. In the reference implementation the extractor reported zero
divergences across a corpus that contained a real divergence in plain sight, because
it did not recognise one introducer and one separator; of 112 declarations inspected
it parsed 4. Read without the coverage figure, that zero says "the corpus is clean."
Read with it, it says "the instrument reached 4 per cent of the corpus."

A finding without declared coverage is not a finding about the system. It is a claim
about what the instrument looked at, wearing the costume of a claim about the system.

### Severity and behaviour

**WARNING. This pass never blocks and never fails a run.**

Two declarations that enumerate differently may be a defect, or may be two
legitimately different sets that happen to share a name — one section intending a
subset of another, two lifecycle stages with different admissible states. This pass
cannot tell those apart. Distinguishing them needs human judgement, and halting work
on something that needs judgement costs more than it saves.

Report it, put the evidence next to it, and continue.

### Do not report

- Enumerations that agree, in any order.
- A set enumerated exactly once.
- A declaration that explicitly states it is a subset, superset, or extension of
  another named set. The relation is declared, so the difference is intended.

  **This exclusion is evaluated before grouping and takes precedence over any
  ambiguity in the name.** In `The shipment status is a subset of the order status:
  pending, shipped, delivered`, the phrase before the introducer is _order status_
  while the subject is _shipment status_ — two defensible readings, two different
  groupings. Neither changes the outcome, because a declared relation removes the
  declaration from comparison whichever group it would land in. Stated here so the
  stability is by rule rather than by luck.
- Examples introduced as partial: `such as`, `for example`, `e.g.`, `including`,
  `among others`. These are open lists, not closed sets.
- Values differing only in case, whitespace, or surrounding punctuation.

### What this pass does not do

It compares declarations against each other, inside the spec. It cannot tell whether
a set that every declaration agrees on is the _right_ set. A specification that is
internally consistent and uniformly mis-transcribed from its source is
indistinguishable, to this pass, from a correct one. That gap is not a defect of this
check — it is outside what any comparison internal to the spec can reach, and it is
stated here so a clean result is not read as more than it is.
