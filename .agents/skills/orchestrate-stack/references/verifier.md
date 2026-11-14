# Verification brief

Role: `verification`. High and Standard work.

---

**Task.** Verify each slice of `{{feature_dir}}` (delivery issue #{{issue}}, tier {{tier}}) when the implementation
session requests it. Use the `verification-harness` skill.

**Identifiers.**

- Feature directory: `{{feature_dir}}`
- Implementation session: `{{implementer_id}}`; orchestrator: `{{orchestrator_id}}`
- Your worktree: your own, detached at each requested SHA. Never the implementation worktree.

**Read first.**

- [Verification harness](docs/engineering/verification-harness.md), including Verification by risk tier for
  {{tier}}
- [Observability](docs/observability.md#verification-telemetry-conventions) (High only) and
  [Testing as evidence](docs/engineering/testing/README.md)

**Do.** Wait for a request; end your turn with `blocked next=request` if none came with this brief. For each request,
regenerate it with `pnpm verify:request --feature {{feature_dir}} --slice <ID> --sha <SHA>`, run it as the skill
says, record the report with `pnpm verify:record`, and reply to the implementation session with the pointer and one
line of non-established claims, missing rows, forbidden data, or escalations. Report `verified` with that line.

**Boundaries.** Read-only on every branch. The only write is the note. Never push notes. Escalate, copying the
orchestrator, under the harness's escalation rules.

**Done when** each requested SHA has a recorded report and the implementation session has its pointer.
