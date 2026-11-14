# Implementation brief

Role: `implementation`. Set `{{fix}}` to `yes` for a one-pull-request fix (High fix, Standard fix, Light), which has
no feature directory or slices; drop the slice lines then.

---

**Task.** Implement {{scope}} for delivery issue #{{issue}}. One-pull-request fix: {{fix}}.

**Identifiers.**

- Feature directory: `{{feature_dir}}`. Run `export SPECIFY_FEATURE_DIRECTORY={{feature_dir}}` in your worktree.
- Slices in order: {{slice_ids}}. Start with `{{slice}}` on branch `{{slice_branch}}`, based on `{{base_branch}}`
  ({{base_state}}). {{branch_rule}}
- Verification session: `{{verifier_id}}`. Review session: `{{reviewer_id}}` (none for Standard fixes and Light).

**Read first.**

- The workspace `AGENTS.md` for each workspace you touch, and the owners AGENTS.md routes your code to
- [Git and pull request workflow](docs/engineering/git-workflow.md): slices, commits, Decisions for the reviewer,
  Review, and corrections
- [Verification harness](docs/engineering/verification-harness.md#the-verification-loop): request, gate, recording
- [Code review session](docs/engineering/code-review.md#the-review-loop): requests and responses
- [Testing as evidence](docs/engineering/testing/README.md)
- `{{feature_dir}}/plan.md`, `contracts/`, and `quickstart.md`

**Do, per slice.**

1. On the first implementation branch, run `speckit-tasks`, then implement only the current slice's planned scope.
   Commit coherent Conventional Commits and run AGENTS.md's Before committing checks.
2. Push as a draft through `speckit-stack`. Send the verification session and the review session the same request:
   branch, pushed SHA, base SHA, slice ID, feature directory, round, and any run-instruction change. Report
   `pushed` to end your turn.
3. Answer every verification result and review finding: fix and push a new SHA with a new request to both, or write a
   justification. Classify Copilot findings as accepted, rejected with a reason, or waiting on a person; they do not
   gate.
4. When the latest report passes `pnpm verify:gate` and `pnpm review:show <sha>` exits 0 at the same SHA, run
   `pnpm verify:render --write`, commit the evidence-only result, push, and write the pull request body with
   Decisions for the reviewer first. Report `verified`.
5. Start the next slice when the orchestrator says the current one is green, stacked on it with `gh stack add`. Fix
   later review findings on the earlier slice and restack upward.
6. Run `gh pr ready` from the slice branch once step 4 holds. The hook runs the gate and the person confirms the
   command; a declined prompt means wait. Report `pr-ready`.

**Boundaries.** Never mark a slice ready without a passing gate and no open blocking finding. Escalate instead of
patching for any corrections-table discovery, a claim still failing after three rounds, or a disagreement with the
verifier or reviewer. Never merge.

**Done when** every slice is ready for review with its gates passing, or you are waiting on the person. Report each
slice's pull request number and verified SHA.
