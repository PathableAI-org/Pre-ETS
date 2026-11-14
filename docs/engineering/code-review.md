# Code review session

This guide describes the reviewer session: an agent that reviews each pushed implementation slice for correctness
reasoning, maintainability, and readability, with a clean context. It owns the reviewer's scope, its findings and
where they are stored, and the review loop. [The verification harness](verification-harness.md) owns the other
sessions and the runtime verification loop. [Git and pull request workflow](git-workflow.md) owns the review gate
that a person applies. The `code-reviewer` skill supplies the procedure.

The verifier proves what the running application does. Lint, typecheck, and Fallow check what tools can check. The
reviewer covers what neither can: whether the code's reasoning holds, whether it follows the ownership rules no tool
enforces, and whether its tests would notice a regression. Its findings are input to the human review, not approval.

## When a reviewer runs

The reviewer runs on every implementation slice of High and Standard work, and on a High fix's single pull request,
as [risk tiers](git-workflow.md#risk-tiers) define them. Light work gets normal CI and human review only.

The reviewer works independently of Copilot's pull request review. It does not read the
[Copilot lenses](../../.github/instructions/) as input or answer Copilot findings, and Copilot does not read its
findings. It reviews against this repository's owning documents directly. The two can find the same problem; the
implementation session answers each through its own loop.

## Inputs

The reviewer starts with a clean context. It reads only:

- the request: branch, pushed SHA, base SHA, slice ID, feature directory, and round, plus for a repeat round the
  previous review ID and the implementation session's answer to each open finding
- the diff from the base SHA to the pushed SHA, and the files it touches at the pushed SHA
- the feature's approved `spec.md`, `plan.md`, and `contracts/` at the pushed SHA
- [AGENTS.md](../../AGENTS.md), the touched workspaces' `AGENTS.md`, and the owning documents for the code the
  diff changes, as the routing table names them, including [Testing as evidence](testing/README.md)

It never reads the implementation session's transcript, worktree, or uncommitted work. Like the verifier, it reviews
pushed commits only, from its own detached worktree or with `git show` and `git diff` on the SHAs.

## Scope

The reviewer owns what tools cannot check:

| Category              | What it looks for                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `correctness`         | Races, error and edge paths, state transitions, resource cleanup, and assumptions the code does not check                                                      |
| `module-ownership`    | The [module boundaries](../../AGENTS.md#module-boundaries) rule that Fallow does not enforce: a sibling importing another module's child                       |
| `duplication`         | A helper, constant, or type that repeats one the workspace, or the package it shares with, already has                                                         |
| `readability`         | Names that mislead, abstractions that do not fit the problem, and code a maintainer would misread                                                              |
| `complexity`          | Indirection, configuration, or generality the slice does not need ([Principle VI](../../.specify/memory/constitution.md#vi-simplicity-and-verifiable-quality)) |
| `test-meaningfulness` | Tests that would still pass if the behavior they name broke, judged by [Testing as evidence](testing/README.md)                                                |
| `contract-drift`      | Signatures or behavior that differ from `plan.md` and `contracts/` without an approved correction                                                              |

It does not repeat lint, typecheck, or Fallow findings, and does not re-verify runtime claims; those belong to the
checks and the verifier. It does not review pre-existing code the slice did not change, unless the slice makes an
existing defect reachable.

## Findings

Each review is one JSON document that `scripts/review-findings/schema.ts` validates. It names the reviewed SHA, the
base SHA, the slice, the round, every finding still open, the findings this round closes, and any escalations. Each
finding has:

- `severity`: `blocking` when it would let the slice merge with a defect, an ownership violation, a test that cannot
  fail, or unapproved contract drift; otherwise `advisory`
- `category` from the table above
- `file` and `line` at the reviewed SHA
- `summary`: the defect in one sentence
- `failureScenario`: concrete inputs or state and the wrong outcome they produce
- `confidence`: `high` or `medium`; the reviewer drops anything less
- `verification`: how the reviewer confirmed the finding before reporting it

The reviewer verifies every candidate finding before reporting it, by reading the code it depends on, tracing the
path, or running a focused command, and drops what it cannot confirm. A review reports at most ten findings. A
finding keeps its `R-nnn` ID across rounds until a review closes it as `fixed`, `justified`, or `withdrawn`.

## Storage

Reviews are git notes on the reviewed SHA in `refs/notes/review`. All worktrees of a clone share the ref, so the
implementation session reads what the reviewer wrote without a copy. The note keeps every review recorded on that
SHA in order, and the latest is the last one. Notes stay local: never push or fetch `refs/notes/review`.

```bash
pnpm review:record review.json   # validate and append to the reviewed SHA's note
pnpm review:show <sha>           # print the latest review; exits 1 while a blocking finding or escalation is open
```

Both take `--notes-ref <ref>` to use another ref under `refs/notes/`, for trials. The verification handoff stores its
reports the same way in `refs/notes/verification`, through the same git and schema-check modules.

## The review loop

### Request

The implementation session sends the reviewer a request when it sends the verifier one: when a slice is pushed as a
draft pull request. A repeat request after a fix names the new SHA, the previous review ID, and for each open
finding either the fixing commit or a written justification.

### Report

The reviewer records the review with `pnpm review:record` and replies with a pointer only:
`refs/notes/review @ <sha> (review <id>)`, plus the counts of blocking and advisory findings. The note is the record.
Do not paste findings into messages.

On a repeat round the reviewer reviews the commits since the previously reviewed SHA and each open finding. It
closes a finding as `fixed` when the new code removes the failure scenario, `justified` when it accepts the written
justification, and `withdrawn` when it finds its own finding was wrong. It carries forward, with the same ID, any
finding it still holds.

### Responses

The implementation session answers every finding, advisory ones included, with a fix or a written justification. It
does not mark a slice ready while the latest review at the pushed tip has an open blocking finding. A blocking
finding closed as `justified` goes in the pull request body's summary for the human reviewer.

### Gate and escalation

A slice may be marked ready for review only when its latest review shows no open blocking finding and no
unresolved escalation. The review covers the reviewed SHA, which may be older than the pushed tip only through
evidence-only commits as [the verification gate](verification-harness.md#gate-and-escalation) defines them. Any
other change after the reviewed SHA needs a new review request.

`pnpm verify:gate`, and the `gh pr ready` hook that runs it, enforce this on `{number}-{slug}-impl*` branches. They
take the latest review on the nearest commit at or below HEAD in `refs/notes/review`, and fail with a `code review:`
reason for an open blocking finding, an open escalation, a review for another feature or slice, or a change after
the reviewed SHA that is not evidence-only. Only High and Standard work has implementation-slice branches, so the
gate needs no tier. A High fix's single pull request is not an implementation-slice branch; check its review with
`pnpm review:show` before marking it ready.

Escalate to the orchestrator, and through it to a person, instead of continuing the loop when:

- a finding belongs to the specification or plan under the [corrections table](git-workflow.md#corrections)
- the reviewer does not accept a justification, and the implementation session does not accept the finding
- a blocking finding is still open in round three; the schema rejects a round-three review with an open blocking
  finding unless it records a `third round` escalation

## Boundaries

The reviewer is read-only. It edits no branch, pull request, issue, requirement, delivery plan, or `specs/` file,
posts nothing to GitHub, and does not fix the code or write patches. It names the defect, where it is, and how it
fails. The only thing it writes is its note.

## Model choice

Run the reviewer on a different model from the implementation session where one is available, for example another
model family or the other agent harness. A clean context removes anchoring on the implementer's reasoning, but the
same model tends to share the implementer's blind spots and to find its own patterns reasonable. A different model
makes those errors less correlated. Where only one model is available, the clean context still applies. Give High work
the highest reasoning effort available.
