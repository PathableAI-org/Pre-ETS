# Git and pull request workflow

This guide tells humans and agents how to branch, review, and merge Spec Kit work on a delivery issue.
A pull request should carry one decision a reviewer can accept without also settling an unrelated decision.
Line count is not the measure. A long specification can be easier to review than a short change that mixes
product scope, architecture, and implementation. Implementation also has a size limit, described under
[Implementation slices](#implementation-slices), because a reviewer cannot hold a large implementation diff at once.

Accepted requirements and approved delivery plans stay authoritative. Spec Kit must not silently change them.
[Testing as evidence](testing/README.md) stays the authority for choosing and judging evidence. This guide owns
the Git and review boundaries around those processes.

Use the `speckit-stack` skill for the commands. It is project-owned and uses GitHub stacked pull requests through
the `gh stack` extension. Do not add another stack manager or a custom Git orchestrator.

## Risk tiers

Process weight follows risk. Each delivery issue, and each pull request outside the requirements and delivery-plan
workflows, has one tier: High, Standard, or Light. The tier decides what evidence the work needs. Whether the work
adds behavior or fixes it inside an approved contract decides how many pull requests it uses.

### Triggers

Work is **High** when any of these holds:

1. A linked requirement is classified `Regulatory` or `Security`, or its ID is in the `HIPAA`, `SECURITY`, `SESSION`,
   or `TENANT` area.
2. It changes how participant records or other protected health information (PHI) are stored, transmitted, accessed,
   exported, retained, or deleted. Any change under `packages/backend/`, `packages/domain/`, or a database migration
   counts. So does a frontend Server Action, route handler, or form that adds or changes the record data it reads or
   sends. UI work on participant records that leaves that data flow unchanged does not count.
3. It changes authentication, sessions, authorization, or tenant binding. Changes under
   `packages/frontend-services/src/` in `authentication`, `session`, `tenant`, `config`, `request-host.ts`, or
   `opaque-token.ts`, or under `packages/frontend/src/` in `proxy.ts` or `shared/session-recovery`, count.
4. It adds or changes an exported telemetry signal, attribute, resource attribute, or exporter, in either process.
   Changes under `packages/frontend-services/src/observability`, `packages/frontend/src/instrumentation*.ts`, or
   `packages/frontend/src/shared/browser-tracing` count.

Otherwise, work is **Standard** when it adds or changes behavior a stakeholder can observe, and **Light** when it
does not: refactors, tooling, documentation, dependency updates, generated Spec Kit upgrades, and fixes that stay
inside an approved contract. When it is unclear whether a trigger matches, use the higher tier.

### Process by tier

| Tier     | New behavior or contract                                                                                                                                              | Fix inside an approved contract                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | A specification pull request, an engineering-plan pull request with a telemetry contract, and verified implementation slices, as in [the full stack](#the-full-stack) | One pull request that names its triggers and [numbers its claims](verification-harness.md#verification-by-risk-tier) for a verification report |
| Standard | One combined specification-and-plan pull request without a telemetry contract, then verified implementation slices, as in [the combined stack](#the-combined-stack)   | One pull request with normal CI, naming the tests that cover the fix                                                                           |
| Light    | Not applicable: new behavior is Standard or High                                                                                                                      | One pull request with normal CI. No `verification.md` and no verification report.                                                              |

[The verification harness](verification-harness.md#verification-by-risk-tier) owns what `verification.md` contains
and what the verifier does at each tier. Requirements and delivery-plan changes are not tiered. They use their own
workflows and land on `main` directly.

### Recording and changing a tier

- The delivery issue's **Risk tier** section names the tier and every trigger that matched, or the condition that
  makes the work Standard or Light. An agent drafting the issue proposes the tier. The maintainer sets it when the
  issue is published.
- `spec.md` repeats the tier and its triggers in its header. Each pull request carries the matching
  `risk:high`, `risk:standard`, or `risk:light` label and states the tier in its body. A one-pull-request change
  without a delivery issue sets its tier in the pull request body by the same triggers.
- Anyone, including an agent, may raise a tier at any phase by recording the trigger in the issue, or in the pull
  request when there is no issue. Approved phases stay approved. Add what the higher tier requires through the
  [corrections](#corrections) path before the next phase starts, for example a corrective plan pull request that
  adds the telemetry contract.
- Only the maintainer may lower a tier below what the triggers produce, with the reason recorded in the delivery
  issue. A trigger from a requirement classified `Regulatory` or `Security` cannot be lowered that way. It needs a
  feature-specific exception under the
  [constitution's governance](../../.specify/memory/constitution.md#governance).
- An agent never lowers a tier, and never chooses a lower tier when a trigger matches.

## When to open a stack

### The full stack

A High feature for one delivery issue uses a specification pull request, an engineering-plan pull request, and one
or more implementation-slice pull requests:

| Pull request         | Reviewer                        | Typical artifacts                                                                                     | Approval means                                                           |
| -------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Specification        | Stakeholder or product reviewer | `spec.md`, `verification.md`, specification checklist                                                 | Expectations, observations, and verification obligations are defined     |
| Engineering plan     | Architect or technical reviewer | `plan.md`, `contracts/modules.md`, `contracts/telemetry.md`, `quickstart.md`, supporting design notes | The architecture, telemetry, and slices are a fit for that specification |
| Implementation slice | Engineer or quality reviewer    | Code, instrumentation, tests, evidence for one planned slice                                          | The slice matches the approved specification and plan                    |

The specification pull request does not introduce module structure, public types, or telemetry names. The plan does
not redefine acceptance criteria. Tasks belong on the first implementation branch, after the plan is approved, and
are not a separate gate. [The verification harness](verification-harness.md) describes how telemetry is planned and
how each slice is verified.

A High feature combines specification and plan only as the maintainer's explicit review choice for a small, coherent
feature. Record that choice in the pull request body. Do not collapse gates only to avoid a pull request.

### The combined stack

A Standard feature puts `spec.md`, `verification.md`, the specification checklist, `plan.md`, `contracts/modules.md`,
and `quickstart.md` in one pull request on the specification branch, using the specification template. Approval
means both that the expectations are defined and that the architecture and slices fit them. The plan has no
`contracts/telemetry.md`. A claim that needs server or browser telemetry is trigger 4 and makes the work High.
Implementation slices follow as in the full stack, starting at `{number}-{slug}-impl` on top of the specification
branch.

### Implementation slices

The engineering plan divides implementation into slices. Each slice is one pull request in the stack:

- **One decision.** A reviewer can accept the slice without also accepting a later one.
- **About 15 changed files at most.** Count hand-written files. Lockfile changes and generated output are listed
  separately. When no coherent stopping point exists below that size, the plan and the pull request body say why.
  Do not split a single decision across pull requests only to meet the number.
- **Vertical.** Each slice passes CI, `pnpm check:unused`, and `pnpm check:health` on its own. A public contract
  lands with its first consumer and its evidence, not ahead of them.
- **Verified.** A slice is marked ready for review only after the verification agent's latest report passes the
  [verification gate](verification-harness.md#gate-and-escalation) for its tier.

If implementation shows that the planned slices cannot meet these rules, change the plan's slices through the
[corrections](#corrections) path rather than letting one slice grow.

A fix inside an approved contract, and Light work, use one pull request with the
[change template](../../.github/PULL_REQUEST_TEMPLATE/change.md). Say why a stack does not apply.

## Branches

Spec Kit allocates the feature number and creates the specification branch as `{number}-{slug}`. That number must
match `specs/{number}-{slug}/`. Later branches keep the same number so branch validation still finds that directory:

```text
main
  └── 156-distributed-sessions
        └── 156-distributed-sessions-plan
              └── 156-distributed-sessions-impl
                    └── 156-distributed-sessions-impl-<slice>
```

The first implementation slice uses `{number}-{slug}-impl`. Add each further slice as `{number}-{slug}-impl-<slice>`,
using the slice ID from `plan.md`. While the predecessor pull request is open,
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
one-pull-request change, are not a native stack. Merge those with `gh pr merge --squash`. Where GraphQL is blocked,
use the merge routes in [Working without GraphQL](#working-without-graphql-cloud-sessions).

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

### Decisions for the reviewer

Every pull request body opens with a **Decisions for the reviewer** section, before the evidence. It names what a
person must actually decide to approve this pull request, so a long body or a stack approved together is not
approved without reading it:

- A first line naming the pull requests approved with this one, when a stack is approved or merged together.
- Then three to five bullets, each starting with one of these labels: **Tradeoff**, **Contract change**,
  **Accepted limitation**, **Beyond plan**, **Evidence substitution**, or **Outstanding manual check**. Each bullet
  says what was chosen or left undone and links where the full evidence is.
- Every `not established` or `blocked` result, accepted or approved limitation, library workaround, change beyond the
  plan's text, substituted observation, and manual check still waiting for a person appears there. Group related
  items rather than dropping one.
- More than five bullets usually means the pull request carries more than one decision. Consider splitting it.
- When there is nothing to decide, write `None: conforms to the approved specification and plan, with no
  limitations.` Do not use that line when the body below records a limitation.

The rest of the body is the evidence for those decisions. A worked example, from slice B of #157 (#406):

```markdown
## Decisions for the reviewer

Approve together with: #403, #404, #405, #407 (the stack merges together).

- **Accepted limitation, L-1 (#400):** `Modal` cannot be made non-dismissible. The workaround leaves a visible
  Close modal button that does nothing, an outside click can move focus to `body`, and the page has no `h1` while
  the modal shows. Re-run V-011, V-013, and V-014 when #400 lands.
- **Beyond plan:** the tab confirms again at the server's deadline, within 300 ms, which the B5 bound needs. No
  contract changes.
- **Evidence substitution:** the step 3 sequence in quickstart §B is produced with a renewal from a second browser,
  because a broadcast renewal reaches S2 and it never conceals.
- **Accepted limitation:** suspension is emulated with Playwright's clock and a visibility change, as
  `verification.md` "emulated freeze" approves, so the paint before script runs is not observed.
- **Outstanding manual check:** the screen-reader items in quickstart §B.6 need a person. V-019 to V-022 stay
  incomplete until slice C.
```

### Visual review

A pull request that changes what a user sees or how they interact links a **visual review page**: screenshots and GIFs
of the changed flow. It lets a person judge whether the change is the product they meant without reading code. It is
not evidence that the change is correct. It does not gate, and it does not replace the verification report or any
claim.

**When.** Publish one when the change adds or alters a page, flow, form, dialog, message, error or recovery page, or
focus and keyboard behavior that a user meets. Do not publish one for tests, tooling, documentation, refactors with no
visible change, or behavior observable only over HTTP or in telemetry.

**Attach** these, and nothing else:

- One GIF per changed user flow, from start to finish as a user does it. When the change affects focus or keyboard
  interaction, record a keyboard-only run.
- One screenshot of each distinct state the change produces or alters, such as success, a validation error, the
  recovery page, or an empty state.
- When the change alters existing UI, a "before" screenshot of each altered state, captured at the base revision,
  beside its "after".
- A caption for each item: the requirement ID and criterion it illustrates, or the documented contract the change
  stays inside when no requirement applies; the revision it was captured at; the synthetic tenant and fixture; and the
  viewport.
- For a criterion with an observability obligation, a short excerpt of the telemetry fact it names, with the query
  that found it, only when it helps a reviewer judge the change.

Keep the page small enough to take in within a couple of minutes.

**Keep transient,** and never upload: captures made while debugging, failed or intermediate attempts, Playwright
traces, raw logs, raw query output or telemetry dumps, captures of any revision other than the head and, for
"before" screenshots, the base, per-step captures beyond the states above, and transcripts.

**Capture** with Playwright against the application running locally at the pull request's head revision, using only
synthetic tenants and fixtures. Follow the steps of the requirements BDD scenarios that cover the change, and locate
controls by role and accessible name as those steps do. Reach every state through user interaction or the scenario's
own setup; never edit the page or inject state to stage one. Record video with Playwright and convert it to GIF with
`ffmpeg`, trimmed to the flow and kept under about 10 MB. Cloud agent images include `ffmpeg`; elsewhere, install it
with the system package manager. Use a 1280×800 viewport, and add a narrow one only when the
change targets layout at that size. Capture after the last push you are asking a person to review, and capture again
if a later commit changes what users see.

**Check for forbidden data** before publishing. Synthetic fixture names, emails, and page text are expected and
fine. Look at every image, frame, and excerpt for anything else: credentials, cookies, session references, tokens,
OIDC codes, state or nonces in URLs, fields, or developer tools; telemetry attributes that
[Observability's data classes](../observability.md#data-classes) forbid; and any real personal data or protected
health information, which must never appear. Recapture rather than redact.

**Publish.** A Claude Code session publishes the page as a private Claude artifact, one per pull request,
republishes it to the same link when it recaptures, and links it in the pull request body. The artifact belongs to the
account that ran the session, so share it with any other reviewer before asking for their review; whether and with
whom to share is that person's decision. A person, or an agent that cannot publish an artifact, attaches the same
images in the pull request body through GitHub's web editor instead. Never commit captures to the repository;
[the verification harness](verification-harness.md) keeps screenshots out of git.

## Review

Human review is the approval. Copilot advice is input to that review.

Keep a pull request in draft until that phase has passed its local checks and is ready for one review. An
implementation slice also needs a verification report first, and for High and Standard work a
[code review](code-review.md#gate-and-escalation) with no open blocking finding. The
organization requests a Copilot review on every push to a non-draft pull request, including stacked layers, and
skips drafts. Mark a pull request draft again before a series of intermediate pushes, then mark it ready once.
Use the repository's Balanced review effort. Do not request a fresh review for a push that does not change a decision.

Path-scoped instructions in `.github/instructions/` set the review lens:

- Specification files: the delivery issue, accepted requirements, and delivery scope. Module design is out of scope.
- Plan and contract files: boundaries, public contracts, Effect shape, telemetry contract, slices, and evidence. Acceptance criteria stay as approved.
- Implementation files: conformance, tests, security, telemetry data classes, and unapproved contract drift.
- Every phase: the [Decisions for the reviewer](#decisions-for-the-reviewer) section is present and honest, and the
  stated risk tier matches its triggers.

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
| Telemetry contract row or implementation slice       | Engineering plan                                            |
| Acceptance, observation, or evidence channel         | Specification                                               |
| Delivery-slice scope                                 | Delivery-planning workflow. Stop the affected feature work. |
| Accepted requirement                                 | Requirements workflow. Stop the affected feature work.      |

When the owning pull request is still open, edit that branch, restack the branches above it, inspect each resulting
diff, rerun the affected checks, and ask for review where a decision changed. Resolve conflicts by keeping unrelated
work. Stop when the correct resolution is ambiguous. A correction moves upward only by rebasing: never merge the
lower branch into a branch above it. A merge commit in an upper branch leaves the stack's history non-linear, and a
later `gh stack rebase --upstack` then rewrites that branch unpredictably. The
[`speckit-stack` skill](../../.agents/skills/speckit-stack/SKILL.md#restack) gives the rebase commands, including the
fallback when `gh stack rebase --upstack` cannot be used.

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
When later work changes behavior, record the current behavior in `docs/`.

| Artifact                                                    | Treatment                                                                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `spec.md`, `verification.md`                                | Keep. Historical feature contract for that slice, subordinate to accepted requirements and the delivery issue. |
| `plan.md`, `contracts/*.md`, `research.md`, `data-model.md` | Keep. Historical architecture decision. Implementation must not silently rewrite it.                           |
| `quickstart.md`                                             | Keep. The plan records the execution mapping. Implementation adds results, conditions, and limitations.        |
| `checklists/requirements.md`                                | Keep with the specification pull request.                                                                      |
| `tasks.md`                                                  | Create on the first implementation branch. Leave it as history after merge. It is not an ongoing backlog.      |
| Critique transcripts                                        | Do not commit new transcripts. The review thread is the record. Transcripts already on `main` stay.            |
| Temporary probes and raw tool output                        | Do not commit. Summarize meaningful evidence with its conditions and limits.                                   |

## Commands agents may use

Install `gh stack` locally with `gh extension install github/gh-stack` when `gh stack --help` is missing. Do not
commit the extension. Use non-interactive commands: `init`, `add`, `view --json`, `rebase`, `push`, and
`submit --auto`. `submit --auto` opens drafts. Apply the phase template and title with `gh pr edit`. Do not use
`gh stack modify` or an interactive submit. The skill separates read-only inspection from rebase, push, and merge.
Where GitHub GraphQL is blocked, as in Claude Code cloud sessions, use
[Working without GraphQL](#working-without-graphql-cloud-sessions) for the steps that need it.

## Working without GraphQL (cloud sessions)

Claude Code cloud sessions reach GitHub's REST API but not GraphQL. The platform proxy answers every GraphQL request
with HTTP 403, "GitHub GraphQL is not available from Claude Code sessions", and no environment setting allows it.
`gh stack` uses GraphQL to find a branch's pull request, to create pull requests in `submit`, to mark them ready, to
disable auto-merge, and to read titles, so those paths fail there. `gh pr` and `gh issue` subcommands fail the same
way. `gh stack init`, `add`, `rebase`, and `push` are local Git, with `push` updating each branch with
`--force-with-lease`, and work unchanged. Stacks themselves are a REST API, so the steps that fail have REST or GitHub
MCP tool replacements. Every gate in this guide applies to them unchanged.

**Detect it.** A command fails with that 403, or with another error that names GraphQL. Do not retry it or ask for a
network change. Use the replacements below for the rest of the session. `gh stack` may also be missing from a new
session; `pre-ets-setup deps` builds it.

**Status.** _Verified_ means the call was made from a cloud session against this repository and returned what the
table says. _Expected_ means the request shape comes from the `github/gh-stack` source or the proxy's error message
and has not yet been run from a cloud session: confirm it on first use, then mark it verified here or correct it.
`{owner}/{repo}` is `PathableAI-org/Pre-ETS`; `gh api` fills those placeholders itself.

| Step with GraphQL                                       | Replacement                                                                                                                                                                                                                                                                                                                       | Status                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `gh stack view --json`                                  | `gh api repos/{owner}/{repo}/stacks` lists stacks, each with `number`, `base.ref`, `open`, and `pull_requests` from bottom to top (`number`, `state`, `draft`, `merged_at`, `head.ref`, `head.sha`). Filter with `gh api "repos/{owner}/{repo}/stacks?pull_request=N"`, or read one with `gh api repos/{owner}/{repo}/stacks/{n}` | Verified                                     |
| `gh pr view` for draft, base, and review state          | `gh api repos/{owner}/{repo}/pulls/N` (`draft`, `base.ref`, `mergeable_state`, `node_id`) and `gh api repos/{owner}/{repo}/pulls/N/ccr/review_threads`; the MCP tool `pull_request_read` for reviews, comments, and check runs                                                                                                    | Verified for the `gh api` reads              |
| `gh stack submit --auto`                                | Push the branches, create each pull request with the MCP tool `create_pull_request` as below, then `gh api -X POST repos/{owner}/{repo}/stacks --input -` with `{"pull_requests":[<bottom>, ..., <top>]}`                                                                                                                         | MCP creation in use; stack creation expected |
| `gh stack submit` after `gh stack add` on an open stack | Create the new pull request as below, then `gh api -X POST repos/{owner}/{repo}/stacks/{n}/add --input -` with `{"pull_requests":[<new numbers only, upward from the current top>]}`                                                                                                                                              | Expected                                     |
| `gh pr edit` for title, body, or base                   | The MCP tool `update_pull_request` (`title`, `body`, `base`), or `gh api -X PATCH repos/{owner}/{repo}/pulls/N -f base=<branch>`                                                                                                                                                                                                  | MCP in use; `PATCH` expected                 |
| `gh pr ready`                                           | `gh api -X POST repos/{owner}/{repo}/pulls/N/ccr/ready_for_review`, or the MCP tool `update_pull_request` with `draft: false`                                                                                                                                                                                                     | MCP in use; route expected                   |
| `gh pr ready --undo`                                    | `gh api -X POST repos/{owner}/{repo}/pulls/N/ccr/convert_to_draft`, or `update_pull_request` with `draft: true`                                                                                                                                                                                                                   | MCP in use; route expected                   |
| Resolving a review thread                               | The MCP tools `resolve_review_thread` and `unresolve_review_thread`, or `gh api -X POST repos/{owner}/{repo}/pulls/N/ccr/comments/{comment_id}/resolve` (or `/unresolve`)                                                                                                                                                         | Expected                                     |
| Auto-merge                                              | The MCP tools `enable_pr_auto_merge` and `disable_pr_auto_merge`, or `gh api -X PUT` (enable) or `-X DELETE` (disable) `repos/{owner}/{repo}/pulls/N/ccr/auto_merge`                                                                                                                                                              | Expected                                     |
| `gh stack merge N --yes --squash`                       | `gh api -X PUT repos/{owner}/{repo}/pulls/N/merge-async --input -` with `{"merge_method":"squash","merge_action":"default"}`, then `gh api repos/{owner}/{repo}/pulls/N/merge-async/{uuid}` with the returned `details.uuid`                                                                                                      | Expected                                     |
| `gh pr merge N --squash`                                | The MCP tool `merge_pull_request` with `merge_method: squash`                                                                                                                                                                                                                                                                     | Expected                                     |
| `gh stack unstack`                                      | `gh api -X POST repos/{owner}/{repo}/stacks/{n}/unstack`                                                                                                                                                                                                                                                                          | Expected                                     |

**Open pull requests in order.** Push every branch first: `gh stack push`, or `git push -u origin <branch>` for a new
branch. Create the pull requests from the bottom up, each as a draft (`draft: true`) whose `base` is the branch
immediately below it, and `main` for the bottom one. Give each the Conventional Commit title and the matching
template body from [Commits and pull request text](#commits-and-pull-request-text) when you create it. Then link them:
create the stack with `POST .../stacks` once two or more open pull requests form an unbroken base-to-head chain, listed
bottom to top, or extend an open stack with `POST .../stacks/{n}/add`, listing only the new pull requests. A single
pull request has no native stack. A completed stack cannot be extended; start a new one as [Branches](#branches)
describes. The work is linked only when `gh api "repos/{owner}/{repo}/stacks?pull_request=N"` shows the expected
order and every pull request's base is the branch below it.

**Merge.** The merge routes need the same approval as [Merge timing](#merge-timing): a person has approved the phase
and every open phase below it and has explicitly asked for the merge. Enabling auto-merge is a merge decision too.
`merge-async` on a stacked pull request merges it and every open layer below it, like `gh stack merge`. `merge_action`
`default` lets GitHub choose a direct merge or the merge queue; `direct_merge` and `merge_queue` force one. The
response's `status` is `merged`, `enqueued`, `failed` (with `details.message`), or `pending`. Read the result route
again later for a pending merge rather than polling in a loop. The repository allows squash merges only. Project
settings prompt before each merge, auto-merge, and unstack route.

**Ready for review.** The project's ready hook gates the REST route and the MCP update with `draft: false` exactly as it
gates `gh pr ready`; see [the verification gate](verification-harness.md#gate-and-escalation).
