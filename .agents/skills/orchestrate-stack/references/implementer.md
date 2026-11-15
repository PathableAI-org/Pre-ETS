# Implementation brief

Role: `implementation`. Set `{{fix}}` to `yes` for a one-pull-request fix (High fix, Standard fix, Light), which has
no feature directory or slices; drop the slice lines then.

---

**Task.** Implement {{scope}} for delivery issue #{{issue}}. One-pull-request fix: {{fix}}.

**Identifiers.**

- Feature directory: `{{feature_dir}}`. Run `export SPECIFY_FEATURE_DIRECTORY={{feature_dir}}` in your worktree.
- Slices in order: {{slice_ids}}. Start with `{{slice}}` on branch `{{slice_branch}}`, based on `{{base_branch}}`
  ({{base_state}}). {{branch_rule}}
- Verification and review sessions (High and Standard work, and a High fix): the orchestrator starts them when you
  first report `pushed`, gives them that first request, and then sends you their session IDs. None for Standard
  fixes and Light.

**Read first.**

- The workspace `AGENTS.md` for each workspace you touch, and the owners AGENTS.md routes your code to
- [Git and pull request workflow](docs/engineering/git-workflow.md): slices, commits, Decisions for the reviewer,
  Review, and corrections
- [Verification harness](docs/engineering/verification-harness.md#the-verification-loop): request, gate, recording
- [Code review session](docs/engineering/code-review.md#the-review-loop): requests and responses
- [Testing as evidence](docs/engineering/testing/README.md)
- [Requirements BDD runs](docs/engineering/verification-harness.md#requirements-bdd-runs) and
  [running the scenarios a change touches](features/README.md#run-the-scenarios-a-change-touches)
- `{{feature_dir}}/plan.md`, `contracts/`, and `quickstart.md`

**Do, per slice.**

1. On the first implementation branch, run `speckit-tasks`, then implement only the current slice's planned scope.
   Commit coherent Conventional Commits and run AGENTS.md's Before committing checks. Run only the BDD scenarios the
   change touches, selected by tag. Never run the full suite or dispatch the BDD workflow; it runs nightly on `main`.
2. Before each push that starts or answers a round, once you believe the slice or fix is complete, run the
   [pre-push self-review](docs/engineering/code-review.md#pre-push-self-review): start the `pre-push-reviewer`
   subagent with the Agent tool (never a fork) after `git fetch origin {{base_branch}}`, and pass only the base
   branch, never a description of the change or of what to check. Fix the findings you accept, commit, and re-run the
   checks; note a reason for each you reject. List every finding, accepted or rejected, in your `pushed` report to
   the orchestrator. Never send them to the verification or review session, and never put them in the pull request
   body. It is advisory and never gates.
3. Push as a draft through `speckit-stack`. On the first push, report `pushed` to the orchestrator and end your
   turn; the orchestrator sends the first request. After that, send the verification session and the review session the same request:
   branch, pushed SHA, base SHA, slice ID (`fix` for a one-pull-request fix), feature directory, round, and any
   run-instruction change. Report `pushed` to the orchestrator, saying whether you sent both requests, with the
   self-review findings, and end your turn.
4. Answer every verification result and review finding: fix, run step 2, and push a new SHA with a new request to both, or write a
   justification. Classify Copilot findings as accepted, rejected with a reason, or waiting on a person; they do not
   gate.
5. When `pnpm verify:gate` passes on the branch, run `pnpm verify:render --write`, commit the evidence-only result,
   push, and write the pull request body with Decisions for the reviewer first. The gate syncs the verifier's and
   reviewer's pull request comments into your notes, and checks the latest verification report and code review. It
   also covers a one-pull-request High fix, labelled `risk:high`. A fix renders no quickstart results and needs no
   evidence-only commit. The body names the BDD tags you ran and any failure outside the change's scope.
   Report `verified`.
6. Start the next slice when the orchestrator says the current one is green, stacked on it with `gh stack add`. Fix
   later review findings on the earlier slice and restack upward.
7. Mark the pull request ready once step 5 holds: `gh pr ready` from the slice branch, or in the cloud the GitHub MCP
   tool's `update_pull_request` with `draft: false`. The hook runs the gate either way, and the person confirms; a
   declined prompt means wait. Report `pr-ready`.

**Boundaries.** Never mark a slice ready without a passing gate and no open blocking finding. Escalate instead of
patching for any corrections-table discovery, a claim still failing after three rounds, or a disagreement with the
verifier or reviewer. Never merge.

**Done when** every slice is ready for review with its gates passing, or you are waiting on the person. Report each
slice's pull request number and verified SHA.
