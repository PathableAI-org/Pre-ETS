# Git and pull request workflow

This guide tells humans and agents how to branch, review, and merge Spec Kit work on a delivery issue.
A pull request should carry one decision a reviewer can accept without also settling an unrelated decision.
Line count is not the measure. A long specification can be easier to review than a short change that mixes
product scope, architecture, and implementation.

Accepted requirements and approved delivery plans stay authoritative. Spec Kit must not silently change them.
[Testing as evidence](testing/README.md) stays the authority for choosing and judging evidence. This guide owns
the Git and review boundaries around those processes.

Use the `speckit-stack` skill for the commands. It is project-owned and uses GitHub stacked pull requests through
the `gh stack` extension. Do not add another stack manager or a custom Git orchestrator.

## When to open a stack

A substantial feature for one delivery issue uses three pull requests:

| Pull request     | Reviewer                        | Typical artifacts                                          | Approval means                                                           |
| ---------------- | ------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| Specification    | Stakeholder or product reviewer | `spec.md`, `verification.md`, specification checklist      | Expectations and verification obligations are defined                    |
| Engineering plan | Architect or technical reviewer | `plan.md`, `contracts/modules.md`, supporting design notes | The proposed architecture and contracts are a fit for that specification |
| Implementation   | Engineer or quality reviewer    | Code, tests, integration, evidence                         | The result matches the approved specification and plan                   |

The specification pull request does not introduce module structure or public types. The plan does not redefine
acceptance criteria. Implementation may use more than one pull request when each increment is its own reviewable
decision. Tasks belong on the implementation branch, after the plan is approved, and are not a fourth gate.

Use one pull request when the change is not that three-part decision. Say which gates are combined, or why a stack
does not apply:

- Requirements and delivery-plan changes use their own workflows and land on `main` directly.
- Dependency updates, generated Spec Kit upgrades, and fixes that stay inside an approved contract use one pull request.
- Combining specification and plan is an explicit review choice for a small, coherent feature. Record that choice in the pull request body. Do not collapse gates only to avoid a pull request.

## Branches

Spec Kit allocates the feature number and creates the specification branch as `{number}-{slug}`. That number must
match `specs/{number}-{slug}/`. Later branches keep the same number so branch validation still finds that directory:

```text
main
  └── 156-distributed-sessions
        └── 156-distributed-sessions-plan
              └── 156-distributed-sessions-impl
```

Add a further implementation slice as `{number}-{slug}-impl-<slice>`. While the predecessor pull request is open,
create the next branch with `gh stack add` from that branch. After the predecessor has merged, its remote branch
is deleted and that completed stack cannot be extended. Create the next branch from updated `origin/main`, keep
the same Spec Kit number and `specs/{number}-{slug}/` directory, and start a new stack with `gh stack init`. Do
not call `speckit.git.feature` for either path, and do not put the GitHub issue number in the branch name. Issue
numbers and Spec Kit numbers are different sequences. Name the issue in the pull request title and body.

Before planning, tasks, or implementation, set `SPECIFY_FEATURE_DIRECTORY` to `specs/{number}-{slug}`. Spec Kit
resolves the feature directory from that variable or from `.specify/feature.json`. That file is per checkout and
is not committed. The branch name does not select the directory. Set the variable again when resuming in another
worktree or switching features, so a missing or stale `feature.json` cannot point at a different spec.

Each pull request targets the branch immediately below it. `gh stack submit` links them so reviewers see that
layer's diff. GitHub still evaluates `main`'s rules for every layer. The final path segment must start with the
Spec Kit number. Names such as `feature/<issue>/spec` fail that check.

Clarification stays on the specification branch. Planning starts only on the plan branch. Task generation and
implementation start only on an implementation branch.

## Merge timing

Merge each phase after it is approved. GitHub squash-merges one commit per pull request onto `main`, deletes the
merged branch, and rebases the remaining stack. Approved artifacts are then available on `main`, and later
corrections are new commits rather than silent edits to an open predecessor.

Keep the rest of the stack open in these cases:

- An upper branch has uncommitted work, or another worktree has it checked out. Merging the lower pull request makes GitHub rewrite the upper branch.
- The plan depends on a feasibility check that is already in progress. Merge the plan when that check supports the contract.
- The author recorded an explicit decision to combine gates.

An agent merges a phase only when a person has approved it and explicitly asked for the merge. Merging a stacked
phase also merges every open phase below it, so those phases need the same approval. Passing checks and Copilot
comments do not approve a pull request. Before that merge, every upper branch in the stack must be pushed and its
worktree clean. After GitHub rebases the remaining branches, fetch and match those remote branches. Do not replay
the pre-rebase commits on top.

Merge a native stack with `gh stack merge --squash`. A specification that is still the only pull request, and a
recorded one-pull-request exception, are not a native stack. Merge those with `gh pr merge --squash`.

The repository squash-merges with the pull request title as the commit subject and a blank body. The title is the
durable history. Put the rationale in the specification, plan, and evidence files. Two repository settings are
recommended and are not in force: store the pull request body as the squash message, and require one human approval
while dismissing stale reviews. Native stack rebases keep approval when the diff is unchanged.

## Commits and pull request text

Use a Conventional Commit title:

```text
docs(spec): specify distributed application sessions for #218
docs(plan): plan distributed session contracts for #218
feat(session): establish distributed application sessions for #218
```

Specification and plan may use the Spec Kit commit hook. Its message style is Conventional Commits, so the commit
matches the decision rather than a fixed `[Spec Kit]` label. Implementation auto-commit is disabled. Make explicit
commits for coherent steps, for example a contract property, the behavior that satisfies it, composition, and the
end-to-end evidence. Fixup commits are acceptable before the first review, and only while this agent owns the branch
and no other work is based on the old commits. After review starts, add commits. The squash merge is what cleans
`main`.

Do not commit generated output, coverage, build directories, tool reports, critique transcripts, or temporary probes.
The Spec Kit auto-commit hook runs `git add .` immediately before committing. Remove those files, or keep them
ignored, before invoking the hook. Unstaging them does not keep them out of the commit.

Pull request bodies use the templates in `.github/PULL_REQUEST_TEMPLATE/`. A specification or plan pull request
associates the delivery issue with `Contributes to #N`. An implementation pull request uses `Closes #N` only when
its completion evidence satisfies that issue. None of these pull requests closes the issue merely by existing.

## Review

Human review is the approval. Copilot advice is input to that review.

Keep a pull request in draft until that phase has passed its local checks and is ready for one review. The
organization requests a Copilot review on every push to a non-draft pull request, including stacked layers, and
skips drafts. Mark a pull request draft again before a series of intermediate pushes, then mark it ready once.
Use the repository's Balanced review effort. Do not request a fresh review for a push that does not change a decision.

Path-scoped instructions in `.github/instructions/` set the review lens:

- Specification files: the delivery issue, accepted requirements, and delivery scope. Module design is out of scope.
- Plan and contract files: boundaries, public contracts, Effect shape, and evidence. Acceptance criteria stay as approved.
- Implementation files: conformance, tests, security, and unapproved contract drift.

Respond to each Copilot finding as accepted, rejected with a reason, or waiting on a human decision. Do not apply
findings automatically.

The organization ruleset does not dismiss stale reviews. A rebase that leaves the diff unchanged can keep approval.
When a decision's content changes, name the changed decision and ask for review again. GitHub's merge rules remain
the authority for whether the pull request can merge.

## Checks

`main` requires these check names on every pull request in a stack:

- `CI / Quality`
- `CI / Build`
- `CI / Fallow`

The jobs always report those names. They skip expensive work when the changed paths do not need it, and a skipped
job still succeeds. Do not add a phase-specific required check. A workflow that does not run leaves a required check
pending. Do not add a structural validator for generated Spec Kit documents.

Requirements BDD stays on its nightly `main` run. An implementation pull request records the BDD command and result
it actually ran. Stacked pull requests run the existing workflows once per layer. Rebasing cancels in-progress runs
and starts them again, so do not restack unless the parent actually changed.

This is a public repository. Standard GitHub-hosted runner minutes are free. Copilot reviews spend AI credits, which
are not covered by that allowance. A Balanced review is the expensive part of an otherwise cheap documentation pull
request. Drafts and single review checkpoints are the cost control.

## Corrections

Change the earliest phase that owns the decision.

| Discovery                                            | Owner                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| Algorithm or private implementation                  | Implementation                                              |
| Public signature, error contract, or module boundary | Engineering plan                                            |
| Acceptance or feature verification                   | Specification                                               |
| Delivery-slice scope                                 | Delivery-planning workflow. Stop the affected feature work. |
| Accepted requirement                                 | Requirements workflow. Stop the affected feature work.      |

When the owning pull request is still open, edit that branch, restack the branches above it, inspect each resulting
diff, rerun the affected checks, and ask for review where a decision changed. Resolve conflicts by keeping unrelated
work. Stop when the correct resolution is ambiguous.

When the owning phase is already on `main`, open a new corrective pull request. Leave the original squash commit in
history. If the correction is small, merge it first and then rebase the open stack onto `main`. If a review already
in progress depends on the old decision, insert the correction as the new bottom of that stack so reviewers see it
before the upper pull request changes. Do not hide the correction inside the implementation branch.

A successful rebase does not renew approval or evidence. Report which decisions changed, which downstream assumptions
and public contracts are affected, which automated or manual verification must be repeated, and which earlier evidence
no longer applies.

## Concurrent work and recovery

One worktree owns one branch. Linked worktrees share the `gh stack` catalog in the Git common directory. Before a
rebase, push, or merge, list worktrees and refuse branches checked out elsewhere or left dirty by another agent.
`gh stack` enforces that for its own commands. Its lock does not cover a raw rebase or `git push --force`. Use
`gh stack push`, which updates each branch with `--force-with-lease`. A rejected lease means the remote moved.
Fetch and inspect before retrying.

A paused `gh stack rebase` is recovered with `--continue` or `--abort` from the worktree that started it. Abort
restores the stack to its pre-rebase state. Do not hard-reset. The operation is complete only when `gh stack view`
shows the expected parents and pull request bases.

## Artifacts

Retain the decision record. Do not treat a merged feature specification or plan as a living description of the
system. Current behavior is the code together with the requirements register, delivery plans, and engineering docs
under `docs/`.

A pull request may change `specs/` only inside the one feature directory it belongs to, `specs/{number}-{slug}/`.
That includes a later correction whose pull request is for that same feature. Every other directory under `specs/`
is a historic artifact. Leave it unchanged when later code, requirements, or documentation move on. Do not revise
an old `plan.md`, `spec.md`, contract, research note, task list, or quickstart so it matches the current system.

| Artifact                                                          | Treatment                                                                                                      |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `spec.md`, `verification.md`                                      | Keep. Historical feature contract for that slice, subordinate to accepted requirements and the delivery issue. |
| `plan.md`, `contracts/modules.md`, `research.md`, `data-model.md` | Keep. Historical architecture decision. Implementation must not silently rewrite it.                           |
| `quickstart.md`                                                   | Keep. The plan records the execution mapping. Implementation adds results, conditions, and limitations.        |
| `checklists/requirements.md`                                      | Keep with the specification pull request.                                                                      |
| `tasks.md`                                                        | Create on the implementation branch. Leave it as history after merge. It is not an ongoing backlog.            |
| Critique transcripts                                              | Do not commit new transcripts. The review thread is the record. Transcripts already on `main` stay.            |
| Temporary probes and raw tool output                              | Do not commit. Summarize meaningful evidence with its conditions and limits.                                   |

## Commands agents may use

Install `gh stack` locally with `gh extension install github/gh-stack` when `gh stack --help` is missing. Do not
commit the extension. Use non-interactive commands: `init`, `add`, `view --json`, `rebase`, `push`, and
`submit --auto`. `submit --auto` opens drafts. Apply the phase template and title with `gh pr edit`. Do not use
`gh stack modify` or an interactive submit. The skill separates read-only inspection from rebase, push, and merge.
