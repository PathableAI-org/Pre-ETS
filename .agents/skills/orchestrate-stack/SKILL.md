---
name: orchestrate-stack
description: Act as the orchestrator for one Pre-ETS delivery issue. Start and brief the specification, plan, implementation, verification, and review sessions its risk tier needs, with each role's model and effort; relay approvals and escalations; print stack status from pull request and notes state. Never edits branches, reads code, merges, approves, or marks ready.
---

# Orchestrate a stack

Read [Orchestration](../../../docs/engineering/orchestration.md) first. It owns the lifecycle by tier, the stop
points, the concurrency cap, what you may read, notifications, and the models-and-effort table. This skill supplies
the procedure and the brief templates under `references/`. Also read the
[Risk tiers](../../../docs/engineering/git-workflow.md#risk-tiers) and
[Sessions and roles](../../../docs/engineering/verification-harness.md#sessions-and-roles) sections.

Follow the [requirements guide](../../../docs/requirements/README.md#public-source-attribution)'s public-source
attribution rule in every brief and message.

## Boundaries

- Never edit, commit, push, rebase, merge, approve, or run `gh pr ready`. The owning session does Git work through
  `speckit-stack`.
- Read state only: `gh pr view|list|checks`, `gh issue view`, `gh stack view --json`, `pnpm verify:show`,
  `pnpm review:show`, `git notes --ref=<ref> list`, `git rev-list`, the slice table in `plan.md` through
  `git show <sha>:<path>`, and session status. Never read diffs, source files, or transcripts.
- Never poll, schedule wake-ups, or loop on CI. Act on a session's report, a person's message, or a status request.
- Respect the cap: at most three working sessions, one stack.

## Start

From the person: the delivery issue number. Then:

1. `gh issue view <N>` and read its **Risk tier** section: the tier, its triggers, and whether the work is new
   behavior or a fix inside an approved contract. If the tier is missing or a trigger obviously matches a higher tier,
   stop and ask. Never lower it.
2. Look up the feature directory if one exists (`specs/{number}-{slug}/` naming the issue) and any open stack
   (`gh pr list --state all --search "#<N>"`). Resume from the phase the state shows instead of restarting.
3. Pick the row in the doc's lifecycle table. Tell the person, in a few lines, the sessions you will start, their
   models and efforts, and the stop points. Then start the first phase.

## Starting a role session

For each session:

1. Render its brief: `references/common.md` followed by the role's template, with every `{{slot}}` filled. Take
   `{{model}}` and `{{effort}}` from the doc's models-and-effort table for the role and tier. A slot you cannot fill
   means a missing identifier: get it from state or ask, never guess.
2. Start it in its own worktree, cut from the branch the brief names. When the role's model or effort is above
   yours, start it with the holding prompt `Reply "ready" and wait for your brief.`, raise its model and effort with
   the session tools, then send the brief with `SendMessage`. Otherwise pass `model` and `effort` at start with the
   brief as the prompt.
3. Record its name and session ID. Peers get each other's IDs in their briefs.

## Phases

| Phase                         | Session and template                                                     | Identifiers to pass                                                                                                                | Next trigger                                                             |
| ----------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Specification (High)          | `spec`, `references/spec.md`                                             | Issue, tier and triggers, base `origin/main`                                                                                       | Its report names the draft pull request and the feature directory. Stop. |
| Combined (Standard)           | `spec`, `references/spec.md` with `{{combined}}` = yes                   | Same                                                                                                                               | Same. Stop.                                                              |
| Plan (High)                   | `plan`, `references/plan.md`                                             | Issue, tier, feature directory, `SPECIFY_FEATURE_DIRECTORY`, spec branch and whether it is merged                                  | Its report names the draft plan pull request. Stop.                      |
| Implementation                | `impl`, `references/implementer.md`, with `verify` and `review` sessions | Issue, tier, feature directory, slice table IDs, first slice and its base branch, merged or not, verifier and reviewer session IDs | Each slice's push, results, and readiness, below                         |
| Verification (High, Standard) | `verify`, `references/verifier.md`                                       | Feature directory, tier, implementation session ID, orchestrator ID                                                                | Waits for requests                                                       |
| Review (High, Standard)       | `review`, `references/reviewer.md`                                       | Same                                                                                                                               | Waits for requests                                                       |
| High fix                      | `impl` with `{{fix}}` = yes, plus `verify` and `review`                  | Issue, tier, triggers, base `origin/main`; no feature directory or slices                                                          | One pull request through the same loop                                   |
| Standard fix, Light           | `impl` with `{{fix}}` = yes, no peers                                    | Issue, tier                                                                                                                        | Its pull request is ready. Stop.                                         |

Approval of a stop is the trigger for the next phase: start it without asking again. When the approved predecessor
has not merged, the brief says the new branch is stacked on it with `gh stack add`.

## Per slice

The implementation session sends the verification and review requests itself, on the same pushed SHA, as the
verification harness and code review guides require. Your part:

1. **Pushed.** On the implementation session's report `pushed <slice> @ <sha>`, check that the draft pull request's
   head is that SHA. If its report says it did not send both requests, send them yourself: branch, SHA, base SHA,
   slice ID, feature directory, and round. Keep the verifier's and reviewer's SHAs the same.
2. **Results.** The verifier and reviewer reply to the implementation session with pointers. Their reports reach you
   when they end their turns. Read the notes with the status step, not their messages.
3. **Green.** When the verification gate result passes and the review shows no open blocking finding at the same SHA
   (or only evidence-only commits after it), notify the person that the slice is green. Tell the implementation
   session it may start the next slice, stacked on this one.
4. **Ready.** The implementation session runs `gh pr ready` from the slice branch; the hook runs the gate and the
   settings ask the person. Notify that the slice waits on review.
5. **Fix rounds.** A failing result goes back to the implementation session through its own loop. Count rounds from
   the notes. You step in only for an escalation.

## Escalation

On any stop point in the doc that is not a phase approval (escalation, third round, disagreement, a correction to an
earlier phase, a delivery or requirement discovery, a tier change, forbidden data, or a failed session):

1. Pause the affected sessions by telling them to stop at a clean, pushed state.
2. Notify the person with one line naming the slice, the kind, and the note pointer.
3. Wait for the person's decision and relay it verbatim, in quotes, to the sessions it concerns. A correction to an
   earlier phase is a new session on that phase's branch, or a corrective pull request, under the
   [corrections](../../../docs/engineering/git-workflow.md#corrections) path. Never route it through the
   implementation branch.

## Status

On request, after any session report, and before each notification, print one table per stack. Fetch first
(`git fetch origin --quiet`). For each pull request whose head branch starts with `{number}-{slug}`:

```sh
gh pr list --state all --limit 50 \
  --json number,headRefName,baseRefName,headRefOid,isDraft,state,reviewDecision,statusCheckRollup \
  | jq --arg p '<number>-<slug>' '[.[] | select(.headRefName | startswith($p))]'
```

For each open slice, find the newest commit between its base and head that carries a note, then summarize it:

```sh
newest() { git rev-list "origin/$2..$3" | grep -m1 -F -f <(git notes --ref="$1" list | cut -d' ' -f2); }
v=$(newest verification <base-branch> <head-sha>)
[ -n "$v" ] && pnpm -s verify:show "$v" | jq -r '[.runId[0:8], (.claims | group_by(.result) | map("\(length) \(.[0].result)") | join(", ")), "forbidden \(.forbiddenData | length)", "escalations \(.escalations | length)"] | join("; ")'
r=$(newest review <base-branch> <head-sha>)
[ -n "$r" ] && pnpm -s review:show "$r" 2>/dev/null | jq -r '"round \(.round); blocking \([.findings[] | select(.severity == "blocking")] | length); advisory \([.findings[] | select(.severity == "advisory")] | length); escalations \(.escalations | length)"'
```

Print:

```text
Stack <number>-<slug> (#<issue>, <tier>)
| Slice | PR | Head SHA | Verify (SHA: result) | Review (SHA: result) | PR state | Blockers |
```

PR state is draft, ready, or merged, plus the check rollup and review decision. Blockers name the stop point or
session the slice waits on. A verified or reviewed SHA that is not the head is fine only when the commits after it are
evidence-only; the implementation session's gate run decides that, not you. A merged slice shows `merged` and needs
no note lookup.

## Wrap-up

When the person has merged the last phase:

1. Print the final status.
2. Ask once whether to archive the stack's sessions. Archive only on yes; archiving removes their worktrees. List
   any worktree left over.
3. Match the merged pull requests' changed paths (`gh pr view <n> --json files`) against the area pathspecs in
   [Drift review](../../../docs/engineering/drift-review.md#areas) and report the touched area IDs. File nothing.
