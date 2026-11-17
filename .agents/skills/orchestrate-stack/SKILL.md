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

- Never edit, commit, push, rebase, merge, approve, or mark a pull request ready. The owning session does Git work
  through `speckit-stack`.
- Read state only: REST reads through `gh api` (issues, pulls, check runs, reviews, changed files) or the GitHub
  tools, `gh stack view --json`, `pnpm notes:sync <pr>` (it writes only local notes), `pnpm verify:show`,
  `pnpm review:show`, `git notes --ref=<ref> list`, `git rev-list`, the slice table in `plan.md` through
  `git show <sha>:<path>`, and session status. Never read diffs, source files, or transcripts. That rules out
  grepping or opening source files and running `git diff` or `git diff --stat` in any form; send a question about
  code to the session that owns it.
- Never poll or loop on CI. Act on a session's report message, a person's message, a status request, or the one
  fallback check-in under [Starting a role session](#starting-a-role-session). Sessions report by messaging you; you
  are not told when a session ends a turn.
- Respect the cap: at most three working sessions, one stack.
- Use `gh api` with REST paths, never `gh pr` or `gh issue` subcommands: they use GraphQL, which cloud sessions block.
  `gh api` fills `{owner}/{repo}` from the checkout.

## Start

From the person: the delivery issue number. Then:

1. `gh api repos/{owner}/{repo}/issues/<N> --jq .body` and read its **Risk tier** section: the tier, its triggers, and whether the work is new
   behavior or a fix inside an approved contract. If the tier is missing or a trigger obviously matches a higher tier,
   stop and ask. Never lower it.
2. Look up the feature directory if one exists (`specs/{number}-{slug}/` naming the issue) and any open stack:

   ```sh
   gh api "repos/{owner}/{repo}/pulls?state=all&per_page=100" \
     | jq --arg n '#<N>' '[.[] | select((.body // "") | contains($n)) | {number, head: .head.ref, state, draft}]'
   ```

   Resume from the phase the state shows instead of restarting.
3. Pick the row in the doc's lifecycle table. Tell the person, in a few lines, the sessions you will start, their
   models and efforts, when each starts (verification and review at the first push), and the stop points. Then start
   the first phase.

## Starting a role session

For each session:

1. Render its brief: `references/common.md` followed by the role's template, with every `{{slot}}` filled. Never
   write a brief freehand or shorten the templates: a freehand brief drops the rules sessions depend on.
   `{{orchestrator_id}}` is mandatory in every brief, because a session can report only by messaging that ID; take it
   from your own session status. Take `{{model}}` and `{{effort}}` from the doc's models-and-effort table for the
   role and tier. A slot you cannot fill means a missing identifier: get it from state or ask, never guess.
2. Start it in its own worktree, cut from the branch the brief names. When the role's model or effort is above
   yours, start it with the holding prompt `Reply "ready" and wait for your brief.`, raise its model and effort with
   the session tools, then send the brief with the session messaging tool (`send_message` in cloud sessions). Otherwise pass `model` and `effort` at start with the
   brief as the prompt.
3. Record its name and session ID. Peers get each other's IDs in their briefs.
4. Schedule one fallback check-in, about two hours out (`send_later` in cloud sessions), whenever you start or brief
   a session that owes you a report. Record the scheduled task's ID (`send_later` returns a `trigger_id`) next to
   that session's name, ID, and the brief it follows. When that session's matching report arrives first, cancel that
   ID (`delete_trigger` in cloud sessions) before acting on the report. When it fires, read the pull request and
   session status once and act on what they show; if the session finished without reporting, treat its state as its
   report. Do not reschedule it as a loop: schedule a new one only after briefing a session again, and record its ID
   the same way.

## Phases

| Phase                         | Session and template                                        | Identifiers to pass                                                                                                        | Next trigger                                                             |
| ----------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Specification (High)          | `spec`, `references/spec.md`                                | Issue, tier and triggers, base `origin/main`                                                                               | Its report names the draft pull request and the feature directory. Stop. |
| Combined (Standard)           | `spec`, `references/spec.md` with `{{combined}}` = yes      | Same                                                                                                                       | Same. Stop.                                                              |
| Plan (High)                   | `plan`, `references/plan.md`                                | Issue, tier, feature directory, `SPECIFY_FEATURE_DIRECTORY`, spec branch and whether it is merged                          | Its report names the draft plan pull request. Stop.                      |
| Implementation                | `impl`, `references/implementer.md`                         | Issue, tier, feature directory, slice table IDs, first slice and its base branch, merged or not                            | Each slice's push, results, and readiness, below                         |
| Verification (High, Standard) | `verify`, `references/verifier.md`, at the first `pushed`   | Feature directory, tier, implementation session ID, orchestrator ID, first request                                         | Its pointer to the implementation session; later requests come from it   |
| Review (High, Standard)       | `review`, `references/reviewer.md`, at the first `pushed`   | Same                                                                                                                       | Same                                                                     |
| High fix                      | All three with `{{fix}}` = yes; peers at the first `pushed` | Issue, tier, triggers, base `origin/main`; no slices. `{{feature_dir}}` is the feature the fix records evidence in, if any | One pull request through the same loop                                   |
| Standard fix, Light           | `impl` with `{{fix}}` = yes, no peers                       | Issue, tier                                                                                                                | Its pull request is ready. Stop.                                         |

Approval of a stop is the trigger for the next phase: start it without asking again. When the approved predecessor
has not merged, the brief says the new branch is stacked on it with `gh stack add`.

## Per slice

The implementation session sends the verification and review requests itself, on the same pushed SHA, as the
verification harness and code review guides require. Your part:

1. **Pushed.** On the implementation session's report message `pushed <slice> @ <sha>`, check that the draft pull request's
   head is that SHA.
   - **First push** (High and Standard): start the verification and review sessions now, each brief ending with the
     first request: branch, SHA, base SHA, slice ID (`fix` for a High fix), feature directory, and round 1, all from
     the pull request's metadata. Then send the implementation session both session IDs; it sends later requests
     itself.
   - **Later pushes:** if the report says it did not send both requests, send them yourself. Keep the verifier's and
     reviewer's SHAs the same.
   - The report lists the [pre-push self-review](../../../docs/engineering/code-review.md#pre-push-self-review)
     findings for measurement. Keep them out of every verification and review brief and request.
2. **Results.** The verifier and reviewer reply to the implementation session with pointers, and message you only to
   escalate or report `blocked` or `failed`. The implementation session reports `verified` when the gate passes.
   Read the notes with the status step, not their messages.
3. **Green.** When the verification gate result passes and the review shows no open blocking finding at the same SHA
   (or only evidence-only commits after it), notify the person that the slice is green. Tell the implementation
   session it may start the next slice, stacked on this one.
4. **Ready.** The implementation session marks the pull request ready with `gh pr ready` or, in the cloud, the GitHub
   MCP tool's `update_pull_request` with `draft: false`. The hook runs the gate and blocks the attempt when it fails;
   no person confirms the ready step itself. Notify that the slice waits on review.
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
gh api "repos/{owner}/{repo}/pulls?state=all&per_page=100" | jq --arg p '<number>-<slug>' \
  '[.[] | select(.head.ref | startswith($p)) | {number, head: .head.ref, base: .base.ref, sha: .head.sha, draft, state, merged: (.merged_at != null)}]'
checks() { gh api "repos/{owner}/{repo}/commits/$1/check-runs" --jq '[.check_runs[] | .conclusion // .status] | group_by(.) | map("\(length) \(.[0])") | join(", ")'; }
decision() { gh api "repos/{owner}/{repo}/pulls/$1/reviews" --jq '[.[] | select(.state != "COMMENTED")] | last | .state // "none"'; }
```

For each open slice, import its pull request's note comments with `pnpm notes:sync <pr>`, because the verifier and
reviewer record in their own clones. Then find the newest commit between its base and head that carries a note, and
summarize it:

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

PR state is draft, ready, or merged, plus `checks <head-sha>` and `decision <number>`. Blockers name the stop point or
session the slice waits on. A verified or reviewed SHA that is not the head is fine only when the diff from it to the
head is evidence-only, including a SHA a restack left off the branch; the implementation session's gate run decides
that, not you. After a restack, report per slice whether that gate run kept its evidence or needs new rounds. A merged slice shows `merged` and needs
no note lookup.

End every status you print, and every notification that waits on the person, with an **Open decisions** list: each
question you have put to the person, with the slice or phase and the note pointer or message it came from. Carry
each one into every later status until the person answers it or you withdraw it, and say which when you drop it. An
empty list prints as `Open decisions: none`.

A bare approval such as "proceed" that arrives while a question is open approves only the phase or stop it plainly
answers. It does not answer the open questions. Act on the approval, then ask each open question again, by name, in
the same reply.

## Wrap-up

When the person has merged the last phase:

1. Print the final status.
2. Ask once whether to archive the stack's sessions. Archive only on yes; archiving removes their worktrees. List
   any worktree left over.
3. Match the merged pull requests' changed paths
   (`gh api --paginate repos/{owner}/{repo}/pulls/<n>/files --jq '.[].filename'`) against the area pathspecs in
   [Drift review](../../../docs/engineering/drift-review.md#areas) and report the touched area IDs. File nothing.
