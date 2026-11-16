# Code review session

This guide describes the reviewer session: an agent that reviews each pushed implementation slice for correctness
reasoning, maintainability, and readability, with a clean context. It owns the reviewer's scope, its findings and
where they are stored, the review loop, and the advisory pre-push self-review. [The verification harness](verification-harness.md) owns the other
sessions and the runtime verification loop. [Git and pull request workflow](git-workflow.md) owns the review gate
that a person applies. The `code-reviewer` skill supplies the procedure.

The verifier proves what the running application does. Lint, typecheck, and Fallow check what tools can check. The
reviewer covers what neither can: whether the code's reasoning holds, whether it follows the ownership rules no tool
enforces, and whether its tests would notice a regression. Its findings are input to the human review, not approval.

## When a reviewer runs

The reviewer runs on every implementation slice of High and Standard work, and on a High fix's single pull request,
as [risk tiers](git-workflow.md#risk-tiers) define them. Light work gets normal CI and human review only. The
advisory [pre-push self-review](#pre-push-self-review) runs at every tier and is not a review session.

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

Reviews are git notes on the reviewed SHA in `refs/notes/review`. The note keeps every review recorded on that SHA
in order, and the latest is the last one. The gate reads the local notes, so it works with no network.

Sessions do not share a clone: each cloud session has its own container. A review reaches the other clones as a
comment on the pull request. Never push or fetch `refs/notes/review` itself.

- **Publish.** `pnpm review:record` validates the review, appends it to the local note, then posts it as a comment
  on the open pull request whose head branch has the reviewed SHA at its tip, or on `--pr <n>`. The comment starts
  with a hidden marker naming the note kind, SHA, and review ID. A markdown rendering generated from the entry
  follows, so a person reads it without the JSON: each open finding with its severity, a link to its line at the
  reviewed SHA, its summary, and its failure scenario, then the closures and escalations. A verification report
  renders as a claims table, then its escalations, forbidden data, and telemetry rows not present. A later entry also
  links the comment of the entry it supersedes: a review the one it names, or else the same slice's review in the
  round before; a report the run it names, or else the same slice's latest earlier report. That line is omitted when
  no such comment by the same account is on the pull request. The JSON itself
  sits in a collapsed `<details>` block as the comment's last fenced `json` block, and only it is read back; the
  rendering is never written by hand. If no pull request is found or posting fails, the review stays recorded locally and the command
  exits 1 and says why. `pnpm notes:publish review <sha> [--pr <n>]` posts it once the cause is fixed. A pull request
  never gets the same entry twice.
- **Sync.** `pnpm notes:sync [<pr>]` reads the pull request's comments through the REST API, page by page. It
  validates each marked comment with the same schema as `review:record`, and appends the entries missing from the
  local notes, oldest first and once per entry ID. Running it again changes nothing. A marked comment that does not
  parse or validate, whose marker disagrees with its entry, or whose commit this clone lacks is rejected with its
  reason and never written, and the command exits 1.
- **Read.** `pnpm review:show`, `pnpm verify:show`, and `pnpm verify:gate` sync the checked-out branch's pull request
  first. Without a branch, an open pull request, or GitHub, they print one line saying so and read the local notes.
  A desktop clone that every session shares therefore keeps working offline.

Sync imports only comments written by the account `gh` is authenticated as (`gh api user`), because every session
posts as the person who runs it, in the cloud too. Trust is the same as for locally writable notes, and no stronger.
Any session or tool holding that login can post an entry, and a repository maintainer can edit a comment.

```bash
pnpm review:record review.json   # validate, append to the reviewed SHA's note, and post it on the pull request
pnpm review:show <sha>           # sync, then print the latest review; exits 1 while a blocking finding or escalation is open
pnpm notes:sync [<pr>]           # import the pull request's report and review comments into the local notes
```

`review:record` and `review:show` take `--notes-ref <ref>` to use another ref under `refs/notes/`, for trials. A
review recorded in a trial ref is not posted. `notes:sync` takes `--review-ref <ref>` to import into one. The
verification handoff stores its reports the same way in `refs/notes/verification`, through the same git,
schema-check, and sync modules.

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

`pnpm verify:gate` and the ready hook that runs it enforce this on `{number}-{slug}-impl*` branches and on a High
fix's single pull request: a branch whose pull request is labelled `risk:high` and that is neither an implementation
slice nor a specification or plan branch, as
[the verification gate](verification-harness.md#gate-and-escalation) recognises it.
They take the latest review on the nearest commit at or below HEAD in `refs/notes/review`. They fail with a
`code review:` reason for an open blocking finding, an open escalation, a review for another feature or slice (a fix
review must have slice ID `fix`), or a change after the reviewed SHA that is not evidence-only. A fix has no
quickstart results, so for a fix only a commit that changes no path is evidence-only. Only High and Standard work has
implementation-slice branches, and only High fixes carry a review, so the gate needs no other tier.

Escalate to the orchestrator, and through it to a person, instead of continuing the loop when:

- a finding belongs to the specification or plan under the [corrections table](git-workflow.md#corrections)
- the reviewer does not accept a justification, and the implementation session does not accept the finding
- a blocking finding is still open in round three; the schema rejects a round-three review with an open blocking
  finding unless it records a `third round` escalation

## Boundaries

The reviewer is read-only. It edits no branch, pull request, issue, requirement, delivery plan, or `specs/` file,
and does not fix the code or write patches. It names the defect, where it is, and how it fails. It writes only its
note, and the one GitHub write it makes is the note comment `pnpm review:record` posts on the pull request.

## Pre-push self-review

The pre-push self-review is an advisory check the implementation session runs on its own work before an
independent round. It removes local findings first, such as a test title that names behavior the test does not
check, a duplicated helper, a leftover probe, or unused code, so the gating rounds spend their effort on what only an
independent session finds. It is a separate layer: it does not replace or weaken the review session or the
[verification session](verification-harness.md), which stay the only gates.

- **When.** Once the implementation session believes a slice or fix is complete, before each push that starts or
  answers a round. It runs at that milestone only, never from a Git hook; hooks stay deterministic. It also runs on
  Standard fixes and Light work, which get no review or verification session.
- **Who.** A subagent from the [`pre-push-reviewer`](../../.claude/agents/pre-push-reviewer.md) definition, which
  holds its fixed brief, its read-only tools, and its model. It starts with a fresh context, never as a fork of the
  implementation session, on a different model, as [Models and effort](orchestration.md#models-and-effort) sets.
- **Input.** Only the base branch. It reviews `origin/<base>...HEAD` plus uncommitted changes, so an untracked or
  temporary file the push would leave behind or sweep in is a finding. The implementation session never describes
  the change or what to check, because a reviewer handed the author's hypothesis tends to confirm it.
- **Scope.** The [scope](#scope) and finding fields of the review session, plus a `leftover` category for files and
  code that should not be pushed.
- **Unrecorded.** It writes no note, comment, or message, and never counts toward `pnpm verify:gate`. The
  implementation session fixes what it accepts and lists every finding, accepted or rejected, in its `pushed` report
  to the orchestrator, for measurement.
- **No leakage.** Its findings never go to the review or verification session and never appear in a pull request
  body, so the independent review is not anchored on them.

Unlike the review session, it reads uncommitted work, has no rounds or IDs that persist, escalates nothing, and
gates nothing.

## Model choice

Run the reviewer on a different model from the implementation session where one is available, for example another
model family or the other agent harness. A clean context removes anchoring on the implementer's reasoning, but the
same model tends to share the implementer's blind spots and to find its own patterns reasonable. A different model
makes those errors less correlated. Where only one model is available, the clean context still applies. Give High work
the highest reasoning effort available.
