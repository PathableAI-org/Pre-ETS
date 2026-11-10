# Pre-ETS slice-scoped implementation

Apply these rules throughout the wrapped implementation workflow. They limit one run to one implementation
slice from `plan.md`, as described in `docs/engineering/git-workflow.md#implementation-slices`.

## Resolve the current slice

Before loading `tasks.md`, read the current branch with `git branch --show-current` and the implementation slices
in `plan.md`. Branch names follow `docs/engineering/git-workflow.md#branches`:

- `{number}-{slug}-impl` is the first slice listed in `plan.md`.
- `{number}-{slug}-impl-<slice>` is the slice whose ID is `<slice>`.

Stop and ask the user which slice to implement when the branch matches neither form, its number and slug do not
match the feature directory, the slice ID is not in `plan.md`, or `tasks.md` has no section for that slice. Do not
infer a slice from unchecked tasks.

## Slice scope

- Execute only the tasks in the current slice's section of `tasks.md`. Do not execute, mark, or edit tasks that
  belong to another slice.
- Earlier slices are complete on the base branch. If an earlier slice's task is unchecked, stop and report it
  rather than finishing it here.
- Wherever the wrapped workflow refers to all tasks, the task list, or completion, read it as the current slice's
  tasks. Unchecked tasks in later slices never block this slice's completion.
- Do not move work between slices. When a task cannot be completed inside the slice as planned, stop and report a
  plan correction through `docs/engineering/git-workflow.md#corrections`.
- Requirements, delivery plans, GitHub issues, `spec.md`, `verification.md`, `plan.md`, and `contracts/` remain
  read-only. Mark completed tasks in `tasks.md` only.

## File count before handoff

In the slice's commit-and-push task, count files after committing and before pushing. First confirm the worktree
is clean (`git status --porcelain` prints nothing), so no staged, unstaged, or untracked change escapes the count.
Then list the files the slice changes against its base branch with `git diff --name-only <base>...HEAD`, where
`<base>` is the branch below this one in the stack. Count hand-written files, and list lockfile changes and
generated output separately. Compare the count with the slice's estimate in `plan.md` and the limit of about 15
hand-written files. When the count exceeds either without a reason that `plan.md` already states, stop before
pushing and report it as a plan correction. Otherwise record the count, and any reason `plan.md` gives, for the
pull request body.

## Verification handoff and stop

The slice ends with its verification-handoff tasks from `tasks.md`: run the repository checks, commit, and push the
slice as a draft pull request; request verification as described in `docs/engineering/verification-harness.md`;
then address the report, repeat verification as needed, and record the final report in `quickstart.md` and the
pull request. Wait for each report before continuing. Do not proceed while a requested report is outstanding.
The slice passes only when the report meets the gate in `docs/engineering/verification-harness.md#gate-and-escalation`.
A result that needs a limitation not already approved in `verification.md` or `plan.md` is a correction for the
owning phase; stop and report it rather than naming a new limitation in the pull request.

Record the final report in `quickstart.md` as an evidence-only commit. Before pushing it, confirm that
`git diff <verified-SHA>..HEAD` touches only the feature's `quickstart.md` execution results; such a commit needs no
new verification. Name the verified SHA in the pull request body. Any other change after the verified SHA, including
application code, instrumentation, tests, run instructions, or `quickstart.md` steps, needs a new verification
request.

After the final report is recorded, stop. Do not create the next slice's branch, start its tasks, or mark the
pull request ready unless the user asks.

{CORE_TEMPLATE}

## Pre-ETS completion rule

Completion means the current slice, not the feature. Report the slice ID and branch, the slice tasks completed,
the hand-written file count against the plan's estimate, the pushed SHA, the final verification result for each of
the slice's claim IDs with the approved limitation in `verification.md` or `plan.md` that covers any result other
than `established`, and the next slice in `plan.md` without starting it.
