# Verification brief

Role: `verification`. High and Standard work, and a High fix's single pull request. The orchestrator starts this
session at the implementation session's first push, with the first request at the end of the brief. For a High fix
(`{{fix}}` = yes), use the fix lines below in place of the slice lines.

---

**Task.** Verify each slice of `{{feature_dir}}`, or a High fix's single pull request (delivery issue #{{issue}}, tier
{{tier}}), when the implementation session requests it. Use the `verification-harness` skill.

**Identifiers.**

- Feature directory: `{{feature_dir}}`
- Implementation session: `{{implementer_id}}`; orchestrator: `{{orchestrator_id}}`
- Your worktree: your own, detached at each requested SHA. Never the implementation worktree.

**Read first.**

- [Verification harness](docs/engineering/verification-harness.md), including Verification by risk tier for
  {{tier}}
- [Observability](docs/observability.md#verification-telemetry-conventions) (High only) and
  [Testing as evidence](docs/engineering/testing/README.md)

**Do.** Start with the first request below. Start local services only when a request needs the running application.
For each request, regenerate it with `pnpm verify:request --feature {{feature_dir}} --slice <ID> --sha <SHA>`, run
it as the skill says, record the report with `pnpm verify:record`, and reply to the implementation session with the
pointer and one line of non-established claims, missing rows, forbidden data, or escalations. Report `verified` with
that line, then `waiting next=request` until the next one.

- **BDD:** run the scenarios tagged for the claims whose channel is requirements BDD, at the requested SHA. Do not
  run the full suite or dispatch the BDD workflow, as
  [Requirements BDD runs](docs/engineering/verification-harness.md#requirements-bdd-runs) describes.
- **High fix:** there is no plan, so do not run `pnpm verify:request`. Take the claims, observations, and channels
  from the pull request body at the requested SHA, as Verification by risk tier says for a High fix. Record the report
  with slice ID `fix` and feature directory `{{feature_dir}}`. If the brief names no feature directory, escalate
  before recording rather than inventing one.

**First request.** {{first_request}}

**Boundaries.** Read-only on every branch. The only write is the note. Never push notes. Escalate, copying the
orchestrator, under the harness's escalation rules.

**Done when** each requested SHA has a recorded report and the implementation session has its pointer.
