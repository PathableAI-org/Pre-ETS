# Orchestration

A Spec Kit feature runs as separate agent sessions: specification, plan, implementation, verification, and review.
The orchestrator is the session that starts them, briefs them, and relays what needs a person. This guide owns the
orchestrator's lifecycle by risk tier, its stop points, its concurrency limits, what it may read, and the model and
effort each role runs on. The `orchestrate-stack` skill supplies the procedure and the brief templates.

[Git and pull request workflow](git-workflow.md) owns phases, branches, merges, and corrections.
[The verification harness](verification-harness.md) owns the roles table and the verification loop.
[Code review session](code-review.md) owns the reviewer's loop. This guide does not restate them.

## What the orchestrator does

The orchestrator coordinates sessions. It never edits a branch, commits, pushes, rebases, merges, approves, or marks a
pull request ready. Every Git and pull request operation is done by the session that owns the branch, through the
`speckit-stack` skill, because the Git workflow forbids a custom Git orchestrator.

It reads state, not code. It may read pull request metadata (`gh pr view`, `gh pr list`, `gh pr checks`), the
verification and review notes (`pnpm verify:show`, `pnpm review:show`), the delivery issue, the feature's slice table
in `plan.md`, and session status. It does not read diffs, source files, or other sessions' transcripts. A question
that needs code goes to the session that owns it.

Sessions report back on their own when they end a turn, so the orchestrator never polls, schedules wake-ups, or loops
on CI. It acts when a session reports, when a person messages it, or when it is asked for status.

## Lifecycle by tier

The [risk tier](git-workflow.md#risk-tiers) on the delivery issue decides the phases:

| Work                    | Sessions the orchestrator starts                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| High, new behavior      | Specification; after approval, plan; after approval, one implementation, one verification, and one review session for the stack's slices |
| High, fix               | One implementation, one verification, and one review session for the single pull request                                                 |
| Standard, new behavior  | One combined specification-and-plan session; after approval, implementation, verification, and review sessions for the slices            |
| Standard fix, and Light | One implementation session. No verifier or reviewer; normal CI and human review apply                                                    |

A tier that rises during the work changes the sessions from the next phase on, as the Git workflow's tier rules
require. The orchestrator never lowers a tier.

## Autonomy and stop points

A person's approval of a phase is the trigger for the next one. Approval reaches the orchestrator as the person's
message, an approving review on the pull request, or the phase having merged. The orchestrator then starts the next
phase's session without asking again.

Within a stack, the implementation session may start slice N+1 once slice N's latest verification report passes the
[verification gate](verification-harness.md#gate-and-escalation), without waiting for slice N's code review. It cuts
N+1 from N's unmerged branch with `gh stack add`. Review findings on N are then fixed on N and restacked upward, so
N+1's evidence is regenerated for its new SHA.

The orchestrator always stops and waits for a person at these points:

- A specification, plan, or combined pull request is ready for review. Only a person approves it.
- Any merge. Only a person asks for a merge, under [Merge timing](git-workflow.md#merge-timing).
- `gh pr ready` on a slice. The implementation session runs it after the gates pass, and the project settings make it
  prompt the person.
- An escalation from the verifier or reviewer: a specification or plan correction under the
  [corrections table](git-workflow.md#corrections), a claim still failing after three verification rounds, a blocking
  finding open in round three, or a disagreement between the implementation session and the verifier or reviewer.
- Any correction that goes back to an earlier phase, a delivery-slice or requirement discovery, or a tier change.
- A forbidden-data finding.
- A session that failed, stopped, or hit a usage limit.

## Concurrency

- **Cap:** one feature stack at a time, with at most three working sessions (implementation, verification, review).
  The orchestrator does not count. Every session shares the person's usage limits.
- **One writer per set of files.** One implementation session owns a stack's branches at a time. A fresh
  implementation session per slice is allowed once the previous one has finished.
- **Unmerged predecessors.** A phase or slice branch cut from an open predecessor says so in its brief, names the
  predecessor branch, and uses `gh stack add`. After the predecessor merges, the next branch starts from
  `origin/main` with `gh stack init`, as the Git workflow describes.
- **Shared hot spots** such as the [AGENTS.md](../../AGENTS.md) routing table, root `package.json` scripts, and
  `.fallowrc.json` entries: one writing session at a time, or expect a merge conflict and say so in the brief.
- **No polling.** See [What the orchestrator does](#what-the-orchestrator-does).

## Other agents and Copilot

The orchestrated flow runs only Claude Code sessions, because the project's hooks, the `gh pr ready` gate, and the
permission rules in `.claude/settings.json` run only there. Codex and Cursor stay available to a person outside the
flow. Their work enters it only as a pushed SHA that a Claude Code verifier and reviewer check, and its `gh pr ready`
runs from a Claude Code session.

Copilot's pull request review stays advisory, on its [path-scoped lenses](../../.github/instructions/). It is not a
gate. The implementation session classifies its findings as the Git workflow's [Review](git-workflow.md#review)
section requires. Revisit it with the metrics under [Models and effort](#models-and-effort).

## Notifications

The orchestrator sends a push notification when:

- a phase or slice is waiting on the person: review, approval, a merge request, or a decision
- a session escalated or is blocked
- a session failed, stopped, or hit a usage limit
- a slice is green: its verification gate passes and its review has no open blocking finding

A notification reaches a phone only while the orchestrator session has Remote Control connected. Each message is one
line that leads with what to act on.

## Models and effort

This table is the one place a role's model and effort are set. The briefs and the skill read it. Change a role by
editing its row.

| Role                         | Model                                                                      | Effort                        |
| ---------------------------- | -------------------------------------------------------------------------- | ----------------------------- |
| Specification, plan          | `claude-opus-5-5`; `claude-fable-5-2` for High work                        | `high`                        |
| Implementation               | `claude-opus-5-5`                                                          | `high`; `xhigh` for High work |
| Verification                 | `claude-opus-5-5`                                                          | `medium`                      |
| Review                       | `claude-fable-5-2`, a different and stronger model than the implementation | `high`                        |
| Orchestrator                 | `claude-sonnet-5-5`                                                        | `medium`                      |
| Drift review                 | `claude-opus-5-5`                                                          | `high`                        |
| Lookups, read-only subagents | `claude-haiku-5-5`, or `claude-sonnet-5-5` when the lookup needs judgment  | `low`                         |

Set effort explicitly. `claude-opus-5-5` defaults to `medium`.

### How a session gets its model and effort

- **Desktop app.** A session started from another session takes `model` and `effort`, but only the starting
  session's model or a cheaper one, and only its effort or lower. A higher model or effort is set afterwards with the
  app's set-model and set-effort session tools, which apply from the target's next turn and ask the person first. A
  `claude-sonnet-5-5` orchestrator at `medium` therefore starts each role session with a one-line holding prompt,
  raises its model and effort, and only then sends the brief, so the brief's first turn runs on the right model.
- **Command line.** `claude --model <id> --effort <level> -n <name> "<brief>"` sets both at start with no ceiling.
- **Skills.** A skill's `model` and `effort` frontmatter applies only to the turn that invokes it, so it does not set
  a role session's model. Role skills do not carry it.
- **Subagents.** A lookup subagent takes the Agent tool's per-call `model`, or the `model` and `effort` frontmatter
  of a `.claude/agents/` definition, for its whole run. Use the built-in Explore agent with a `haiku` model for
  lookups; the repository has no project subagent definitions.
- **Overrides.** `CLAUDE_CODE_EFFORT_LEVEL` overrides session, skill, and subagent effort. Do not set it in a shell
  that starts role sessions.

### Revisiting the table

Revisit a row when these measures move:

- verification rounds to a passing gate, per slice (the reports in each slice's verification note)
- reviewer findings accepted versus dismissed (closures `fixed` against `justified` and `withdrawn` in review notes)
- defects that escaped to `main` or were first found in human review
- usage-limit pressure: sessions stopped by limits, and time spent waiting for them to reset

Tune it with a replay test: run candidate configurations against past slices with known defects, such as the early
401 that #406 fixed and the failed T-005 run at `99b2261`, and compare what each configuration catches and what it
costs.

## Wrap-up

After a person merges the last phase, the orchestrator asks once to archive the stack's sessions, which also removes
their worktrees, and lists any leftover worktrees for the person. It reports which [drift review](drift-review.md)
areas the merged pull requests touched, by matching their changed paths against each area's pathspecs, so a person
can choose whether to review one early. It files nothing.
