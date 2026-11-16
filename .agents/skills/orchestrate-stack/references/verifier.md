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
An idle container restarts without them, so at the start of every request that needs the running application, check
the services and bring them up if they are down, before any step depends on them. In a cloud session, run
`pre-ets-setup services`: it starts Docker if needed, runs `docker compose up -d --wait` (a no-op for healthy
containers), applies no pending Flyway migrations, and checks Keycloak and Grafana health, so it is safe and takes
seconds when everything is already up. Elsewhere, start them as [Local services](docs/docker-compose.md) describes.
For each request, regenerate it with `pnpm verify:request --feature {{feature_dir}} --slice <ID> --sha <SHA>`, run
it as the skill says, record the report with `pnpm verify:record`, and reply to the implementation session with the
pointer and one line of non-established claims, missing rows, forbidden data, or escalations. Report `verified` with
that line, then `waiting next=request` until the next one.

- **BDD:** run the scenarios tagged for the claims whose channel is requirements BDD, at the requested SHA. Do not
  run the full suite or dispatch the BDD workflow, as
  [Requirements BDD runs](docs/engineering/verification-harness.md#requirements-bdd-runs) describes.
- **High fix:** there is no plan, so do not run `pnpm verify:request`. Take the numbered claims, observations, and
  channels from the pull request body at the requested SHA, as Verification by risk tier says for a High fix, and
  report each claim under the body's ID. Record the report with slice ID `fix`, and with feature directory
  `{{feature_dir}}` when the brief names one; otherwise omit `featureDir`. Every claim must be `established` for the
  fix to pass.

**First request.** {{first_request}}

**Boundaries.** Read-only on every branch. The only writes are the note and the one pull request comment
`pnpm verify:record` posts with it. If posting fails, say so in your reply and retry with `pnpm notes:publish`. Never
push the notes ref, and post nothing else to GitHub. Escalate, copying the orchestrator, under the harness's
[escalation rules](docs/engineering/verification-harness.md#gate-and-escalation), with every decision the claim needs
in one escalation.

**Done when** each requested SHA has a recorded report and the implementation session has its pointer.
