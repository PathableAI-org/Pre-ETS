---
name: speckit-stack
description: Inspect, revise, restack, and validate a Pre-ETS specification, plan, and implementation pull-request stack with gh stack. Does not change requirements or delivery plans.
---

# Spec Kit stack

Follow the [requirements guide](../../../docs/requirements/README.md#public-source-attribution)’s public-source
attribution rule: never name a specific partner or client in public repository artifacts or GitHub titles/bodies.
Use generic attribution and check prose, examples, quotations, filenames, link labels, and URLs for identifying
names or abbreviations.

Read [Git and pull request workflow](../../../docs/engineering/git-workflow.md) before any operation. It owns phase
boundaries, branch names, merge timing, commit titles, artifact retention, and correction ownership. This skill
supplies the commands. It does not reimplement Git, edit requirements, edit delivery plans, or update delivery issues.

Use `gh stack` when `gh stack --help` succeeds. If it is missing, install `github/gh-stack` locally and continue.
Report unavailable GitHub access instead of assuming reviews, checks, or issue state. Use non-interactive commands
only. Do not run `gh stack modify`, interactive `gh stack submit`, `git push --force`, or `git reset --hard`.

`gh stack submit --auto` creates draft pull requests. Copy the matching body from
`.github/PULL_REQUEST_TEMPLATE/` with `gh pr edit --body-file`, and set a Conventional Commit title. Specification
and plan bodies say `Contributes to #<issue>`. An implementation body says `Closes #<issue>` only when that issue's
completion evidence is satisfied.

## Safety

Read-only operations are inspect and validate. Rebase, push, pull-request creation, marking ready, and merge write
state. Do not start a write while a `gh stack` rebase or modify is paused. Resume or abort that operation first,
from the worktree that owns it.

Before rebase, push, or merge:

1. `git status` is clean in this worktree.
2. `git worktree list` shows no affected branch checked out elsewhere.
3. Affected branches have no unpushed commits owned by another worktree.
4. `git fetch` has completed.

Stop when any check fails. A rejected `--force-with-lease` means the remote moved; fetch and inspect, then stop
unless the fetched state is understood and still owned here. Do not declare a restack or merge complete until
`gh stack view --json` shows the expected parents and pull-request bases. If the JSON shape is unfamiliar, confirm
the same facts with `gh pr view --json baseRefName,headRefName,state,isDraft,reviewDecision,statusCheckRollup`.

## Inspect

Identify the delivery issue from the request or from the feature's delivery-authority section. Read it without
editing it. Find the spec directory, then the branches `{number}-{slug}`, `{number}-{slug}-plan`, and
`{number}-{slug}-impl`.

Report, from `gh stack view --json`, `gh pr view`, and `git worktree list`:

- branch order and pull-request bases
- draft, review, and check state
- dirty worktrees and unpushed commits
- whether the local stack catalog matches the open pull requests

Do not adopt or link an untracked stack during inspection.

## Open a phase

Start from current `origin/main` unless the request names an existing feature branch.

1. Run `$speckit-specify` for exactly one delivery issue. Let `speckit.git.feature` create `{number}-{slug}`.
   Clarification stays on that branch. Do not run `$speckit-plan` there.
2. Adopt it with `gh stack init <number>-<slug>` if it is not already in a stack.
3. Submit the draft specification pull request. Its diff may contain `spec.md`, `verification.md`, and
   `specs/<feature>/checklists/**`.
4. After that specification is the approved base, check out its branch and run `gh stack add <number>-<slug>-plan`.
   Run `$speckit-plan` only on the new branch.
5. After the plan is the approved base, run `gh stack add <number>-<slug>-impl` from the plan branch. Run
   `$speckit-tasks` and implementation only there. Further slices use `gh stack add <number>-<slug>-impl-<slice>`.

Inspect `git status` before a Spec Kit auto-commit and unstage generated output, reports, and temporary probes.
Commit implementation work as explicit Conventional Commits. The implementation auto-commit hook is disabled.

For a recorded one-pull-request exception, say which gates are combined in the body and target `main`. Do not
invent an exception because a stack is inconvenient.

Mark a draft ready with `gh pr ready` only after validate passes and the task is to request review. Before more
intermediate pushes, return it to draft with `gh pr ready --undo`. Classify Copilot findings as accepted, rejected
with a reason, or waiting on a human. Do not apply them automatically.

## Revise

Classify the discovery with the workflow's ownership table. Stop when it belongs to the delivery or requirements
workflow, and do not encode the proposed change as an accepted decision.

When the owning pull request is open, check out its branch only if this worktree may own it. Edit that phase's
artifacts, commit, then restack upward. When that phase is already on `main`, branch the correction from `main`
and open a new pull request. Do not rewrite the merged commit. Rebase the open stack after the correction lands,
or insert the correction under an in-progress upper review when that review depends on the old decision.

## Restack

From the changed branch, run `gh stack rebase --upstack`. When `main` itself moved, rebase the whole stack so the
bottom includes it. On a conflict, keep unrelated work. Continue only when the resolution is unambiguous. Otherwise
stop and report the files. Use `gh stack rebase --abort` when abandoning the rebase; it restores the pre-rebase
stack.

After a clean rebase, `gh stack push`. Then validate.

## Validate

For each open layer, compare `gh pr diff` with the paths allowed for that phase in the workflow guide. Report files
that belong to another phase, especially requirement or delivery-plan edits. A specification diff that adds module
contracts, or an implementation diff that changes acceptance criteria, is a phase violation.

Run formatting for a specification or plan change. For implementation, run the affected typecheck, lint, unit,
property, and BDD checks the change claims. Report checks that were not run. Name decisions whose content changed
and which approvals or evidence need another review. A clean rebase does not renew either.

## Merge

Merge only when a person has approved that phase and every open phase below it, and has explicitly asked to merge.
Passing checks are not approval.
Confirm every upper branch is pushed and its worktree is clean. Then merge through that phase:

```sh
gh stack merge <pull-request-number> --yes --squash
```

This merges the chosen pull request and every open layer below it, and leaves layers above it open. Afterward,
fetch and match the rewritten upper branches. Do not replay the old local commits.
