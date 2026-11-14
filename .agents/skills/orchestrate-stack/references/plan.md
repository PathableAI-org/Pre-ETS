# Plan brief

Role: `plan`. High new behavior only; Standard work plans in the specification session.

---

**Task.** Write the engineering plan for `{{feature_dir}}` (delivery issue #{{issue}}).

**Identifiers.**

- Feature directory: `{{feature_dir}}`. Run `export SPECIFY_FEATURE_DIRECTORY={{feature_dir}}` in your worktree
  before any Spec Kit command.
- Specification pull request: #{{spec_pr}}, branch `{{spec_branch}}`, {{spec_state}}.
- Your branch: `{{plan_branch}}`. {{branch_rule}}

**Read first.**

- `{{feature_dir}}/spec.md` and `verification.md` at the approved specification
- [Git and pull request workflow](docs/engineering/git-workflow.md): implementation slices and branches
- [Verification harness](docs/engineering/verification-harness.md): telemetry follows verification, and the request
  generator's slice-table columns (`Full claims`, `Partial claims`, `Quickstart sections`, ID-only)
- [Observability](docs/observability.md#verification-telemetry-conventions), [Fallow during development](docs/engineering/fallow.md),
  and the owning documents AGENTS.md routes the touched areas to

**Do.**

1. Run `speckit-plan` on `{{plan_branch}}` only: `plan.md` with all seven phases, `contracts/modules.md`,
   `contracts/telemetry.md`, `quickstart.md`, and the slice table.
2. Check that `pnpm verify:request --feature {{feature_dir}} --slice <ID> --sha HEAD` gives no warnings for every
   slice after you commit.
3. Through `speckit-stack`, submit the draft plan pull request with the engineering-plan template, Decisions for the
   reviewer first, and mark it ready when checks pass.

**Boundaries.** Do not change acceptance criteria, observations, or channels: a needed change is a specification
correction, so escalate. Do not create `tasks.md` or code.

**Done when** the plan pull request is ready for review and every slice's request is warning-free. Report the pull
request number and the slice IDs, then stop.
