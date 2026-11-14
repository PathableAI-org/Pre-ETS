# Verification harness

This guide describes how a feature's verification plan decides what runtime telemetry the product emits. It also
describes how a verification agent uses that telemetry to check each implementation slice before review.
[Git and pull request workflow](git-workflow.md) owns branches and review gates. [Testing as evidence](testing/README.md)
owns how evidence is chosen and judged. [Observability](../observability.md) owns the telemetry runtime and conventions.

A harness here means the instrumentation, fixtures, and procedures that let an agent see what the running
application did. Telemetry is designed in for verification rather than added afterwards.

## Telemetry follows verification

Each phase adds one layer:

| Phase            | Artifact                 | Adds                                                                                                       |
| ---------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Specification    | `verification.md`        | For each claim, the observation that distinguishes it from its violation, and the evidence channel         |
| Engineering plan | `contracts/telemetry.md` | For each telemetry-channel observation, the span, log, or metric, its attributes, and the verifier's query |
| Engineering plan | `plan.md` slices         | Which slice implements which contracts, instrumentation, and claims                                        |
| Implementation   | Code and `quickstart.md` | The instrumentation itself, and summarized verification results                                            |

The specification names facts, not spans. "The authoritative deadline before and after Continue" is an observation.
"`SessionService.refreshForTenant` sets `preets.session.deadline_ms`" is a telemetry contract row.

Evidence channels are:

- **Server telemetry**: traces, logs, or metrics exported by the server process.
- **Browser telemetry**: traces exported by the browser when `BROWSER_TRACING_ENABLED=true` (see
  [Browser tracing switch](../observability.md#browser-tracing-switch)). Protected documents continue the server trace,
  same-origin requests carry the browser's `traceparent`, and the session coordinator records UI transitions, cross-tab
  sends and receipts, focus moves, form submits, and router transitions as closed-set spans
  ([Browser harness facts](../observability.md#browser-harness-facts)). Public documents run no browser tracing.
- **Browser interaction**: what Playwright observes in the page, such as roles, names, focus, and navigation.
- **Assistive technology**: a manual check with a screen reader or other assistive technology.
- **Module test**: public-interface examples, properties, or integration tests.
- **Requirements BDD**: tagged scenarios under `tests/bdd/`.

Pick the channel that can actually observe the fact. Telemetry does not replace browser interaction for what a
person perceives, and it does not replace module tests for durable regressions.

### What goes in telemetry

When a claim's approved evidence channel in `verification.md` is server or browser telemetry, the telemetry contract
puts the runtime fact it needs in a span, log, or metric. Facts observed through browser interaction, assistive
technology, module tests, or requirements BDD need no committed telemetry. Typical facts are an operation's outcome,
the decision a policy made, a deadline or policy value, which tenant alias was bound, and the causal order of
operations in one journey.

A fact that falls in a forbidden data class in [Observability](../observability.md#verification-telemetry-conventions)
is never emitted. The telemetry contract says how that fact is verified instead.

Instrumentation named in an approved telemetry contract is product code. Commit it with the slice that implements
the behavior. Durable tests still do not assert spans, logs, or attributes. The verification agent observes them.

## Verification by risk tier

The [risk tier](git-workflow.md#risk-tiers) scales what verification needs. The tier sets the minimum. A
`verification.md` may plan more.

| Tier               | `verification.md`                                                                                                                                                                                                                                                          | Verifier                                                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High, new behavior | Everything above, with every channel available. Each security, tenant, or PHI claim also names its rejection path.                                                                                                                                                         | One report per slice through [the verification loop](#the-verification-loop), including telemetry queries and the forbidden-data check                                                                   |
| High, fix          | None. The pull request body lists the claims the fix establishes, each with its observation and channel.                                                                                                                                                                   | One report on the pull request for those claims, at the verified SHA, with the forbidden-data check                                                                                                      |
| Standard           | Claims, meaningful violations, observations, and channels limited to browser interaction, assistive technology, module tests, and requirements BDD, plus the planned manual procedure. No server or browser telemetry channel: a claim that needs one makes the work High. | One report per slice through the verification loop, using the browser, BDD, and module evidence. No telemetry queries or forbidden-data check, because Standard work does not change exported telemetry. |
| Light              | None                                                                                                                                                                                                                                                                       | None. Normal CI and the checks the pull request names.                                                                                                                                                   |

The [gate](#gate-and-escalation) applies to every verified tier. A slice with no assigned telemetry rows meets the
first condition trivially.

## Implementation slices

[Git and pull request workflow](git-workflow.md#implementation-slices) defines slices and their size and independence
rules. Each slice lists the contracts it implements, the telemetry rows it adds, and the claim IDs it advances. Verification is
per slice, so a later slice does not hide an earlier slice's failure.

## Sessions and roles

A stack runs as separate agent sessions with distinct responsibilities:

| Session        | Owns                                                                                         | Does not                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Orchestrator   | Starting the other sessions, passing each the identifiers it needs, relaying human decisions | Edit feature branches                                                                     |
| Specification  | `spec.md`, `verification.md`, the specification pull request                                 | Plan modules or telemetry                                                                 |
| Plan           | `plan.md`, `contracts/modules.md`, `contracts/telemetry.md`, `quickstart.md`, slices         | Change acceptance criteria                                                                |
| Implementation | `tasks.md`, the code and instrumentation for each slice, slice pull requests                 | Mark a slice ready without a verification report, or with an open blocking review finding |
| Verification   | Running pushed revisions, inspecting the running application and its telemetry, reports      | Edit any branch or fix the implementation                                                 |
| Review         | Reviewing pushed revisions for correctness reasoning and maintainability, review notes       | Edit any branch or fix the implementation                                                 |

The orchestrator starts one verification session and, for High and Standard work, one review session per stack,
alongside the implementation session. It gives the implementation session the other two session identifiers, and
gives each of the other two the implementation session's identifier. [Code review session](code-review.md) owns the
reviewer's scope, findings, and loop. Only a person approves and merges a phase, as the Git workflow requires.

## The verification loop

### Request

When a slice is committed and pushed as a draft pull request, the implementation session generates the request
instead of choosing claims by hand:

```sh
pnpm verify:request --slice <ID> --sha <pushed SHA>
```

The command reads the feature's `plan.md`, `verification.md`, `quickstart.md`, and `research.md` at that SHA through
Git, not from the working tree. It prints the slice ID, the pushed SHA, each claim the slice asserts in full or in
part (with the plan's qualifier for a partial claim), the slice's telemetry rows, its `quickstart.md` sections, and
the limitations already approved in `verification.md` and the plan. On an implementation branch it finds the feature
directory from the branch name; elsewhere, pass `--feature specs/{number}-{slug}`.

The request reads the slice's row in the plan's slice table. A plan whose table has ID-only `Full claims`,
`Partial claims`, and `Quickstart sections` columns is read directly. An older plan with a prose `Claim IDs advanced`
cell is read as follows: a bare ID or one marked `(full)` is asserted in full, an ID with any other qualifier or a
`partial` prefix is partial, and ranges such as `V-009–V-018` expand. Quickstart sections are the headings that name
`(slice <ID>)`, plus `(every slice)`. Unnumbered `verification.md` limitations get positional IDs `VL-1`, `VL-2`, and
so on at that SHA, and plan limitations keep their `L-n` IDs. Anything the parser cannot read is listed under
`warnings`. A request with warnings cannot pass the gate, so correct the plan through the
[corrections](git-workflow.md#corrections) path rather than working around it.

The implementation session then sends the verification session the branch, the pushed SHA, the slice ID, and any
change to the run instructions since the last request. The verifier regenerates the request from the SHA itself.

The verifier checks only pushed commits. It never reads the implementation session's uncommitted work.

### Environment

The verification session owns its environment:

- Its own worktree, detached at the requested SHA. It is read-only with respect to the implementation branch.
- Its own ports for application instances, and its own key prefix in shared stores. Use a
  `preets:verify:<run-uuid>:` prefix for Redis and delete the owned keys when finished.
- The shared local observability stack from [Observability](../observability.md#local-grafana--otlp), with OTEL
  enabled. Generate a run UUID for each verification run, including retries. Set `OTEL_SERVICE_VERSION` to the
  requested SHA, and add `service.version=<SHA>,service.instance.id=<run-uuid>` to `OTEL_RESOURCE_ATTRIBUTES`,
  keeping any existing entries. The global Node SDK that exports HTTP, Redis, and runtime signals reads only
  `OTEL_RESOURCE_ATTRIBUTES`, so both settings are needed for every signal to carry the revision and run. Every
  query filters by both `service.version` and `service.instance.id`, so another verifier, a retry, or a developer
  process at the same revision cannot establish or violate a claim for this run.
- Synthetic tenants and fixtures from the repository. No real client records or credentials.

For browser journeys without browser tracing, Playwright adds a W3C `traceparent` header that the verifier generates
for each step. Server spans continue that trace, so each browser step maps to a known trace ID. With browser tracing,
set `BROWSER_TRACING_ENABLED=true` and keep `service.instance.id=<run-uuid>` in `OTEL_RESOURCE_ATTRIBUTES`, so the page
exports under the same run filter. Turn the harness's own `traceparent` injection off for the steps that sample browser
context. Wait for `<html data-preets-browser-tracing="started">` before a sampled step, and keep the page open about
30 seconds after the last step so the batch exports.

### Observation

The verifier runs the requested `quickstart.md` steps and then queries the telemetry with the queries in
`contracts/telemetry.md`. Use the read-only Grafana MCP server configured in `.mcp.json`. The
[Observability](../observability.md#verification) export delays apply. An empty result is inconclusive until the
verifier confirms that OTEL was enabled, traffic occurred, and export had time to complete.

The verifier also checks that no exported attribute or log field falls in a forbidden data class. That finding is
a violation of the slice, whatever the claim results are.

### Report

The verification session records one result per requested claim ID:

| Result            | Meaning                                                                                |
| ----------------- | -------------------------------------------------------------------------------------- |
| `established`     | The required observation was made at the requested revision                            |
| `violated`        | A meaningful violation was observed                                                    |
| `not established` | The procedure ran but did not produce a conclusive observation                         |
| `blocked`         | A prerequisite outside the slice prevented the procedure, such as a missing dependency |

The report is a JSON document checked by the schema in
[`scripts/verification/report.ts`](../../scripts/verification/report.ts). It holds the verified SHA, slice ID,
feature directory, run UUID, time range, and an environment summary without credentials or header values. Per
claim, it holds the scope (`full` or `partial`), the result, the evidence (trace IDs, verifier queries, or the
procedure for non-telemetry channels), the observed values, the conditions, and, for `not established` or `blocked`,
the ID of the approved limitation it falls under. It also gives a status for each of the slice's telemetry rows
(`present`, `missing`, or `unusable`), forbidden-data findings by signal and field name only, escalations, cleanup,
and any unrequested claim the run showed violated. The schema rejects text that looks like a credential.

The verifier records the report with `pnpm verify:record <report.json>`. The command validates it and adds it to the
Git note on the verified SHA under `refs/notes/verification`. A retry on the same SHA is appended and supersedes the
earlier report, which stays in the note. Git also keeps each version of the note in the notes ref's history. Notes
are shared by every worktree of a clone and are not pushed; do not push or configure pushing for them.

The note is the record. The verification session then sends the implementation session only a pointer, such as
`refs/notes/verification @ <SHA> (run <uuid>)`, and `pnpm verify:show <SHA>` prints the report. The report is
information for the implementation session and the reviewer. It is not proof by itself. Raw query output,
screenshots, and transcripts are not committed.

The report needs no schema change to be posted later as a GitHub check run: `verifiedSha` is the check's `head_sha`,
the run UUID its `external_id`, the gate's outcome its `conclusion`, and the rendered results its output summary.
Nothing posts to GitHub today.

### Gate and escalation

The implementation session fixes the slice and requests verification again. A slice may be marked ready for
review only when its latest report shows all of the following:

- Every telemetry row that `plan.md` assigns to the slice is present and usable.
- Every claim the slice asserts in full is `established`.
- Every `not established` or `blocked` result matches a limitation already approved in `verification.md` or
  `plan.md`.
- No `violated` result and no forbidden data finding.

The report covers the verified SHA, which may be older than the pushed tip only through evidence-only commits. An
evidence-only commit changes nothing but the feature's `quickstart.md` execution results, as described under
[Recording](#recording). It needs no new verification request. The report and the pull request body name the
verified SHA, and the reviewer or verifier checks that the diff from the verified SHA to the pushed tip touches only
those results. Any application, instrumentation, test, or run-instruction change after the verified SHA, including
a change to `quickstart.md` steps, needs a new verification request.

`pnpm verify:gate` applies these rules to the checked-out `{number}-{slug}-impl*` branch. It takes the latest
report on HEAD, or on the nearest ancestor when the commits since change only the feature's `quickstart.md`
execution-results section. It regenerates the request at the report's SHA, checks the report's slice against the
branch, and exits non-zero with every failing reason. A limitation excuses only a claim the slice asserts in part. A
report with an open escalation does not pass. The gate also applies the
[code review gate](code-review.md#gate-and-escalation) to the nearest reviewed commit. A Claude Code `PreToolUse` hook in `.claude/settings.json` runs the
gate before `gh pr ready` on those branches and blocks the command when the gate fails. It takes effect in sessions
started after the hook is installed. The hook gates the checked-out branch, so run `gh pr ready` from the slice's
own branch.

A slice pull request cannot create its own exception. A new limitation goes back through the
[corrections](git-workflow.md#corrections) path to the phase that owns it.

Escalate to the orchestrator, and through it to a person, instead of patching the implementation when:

- a finding belongs to the specification or plan under the
  [corrections table](git-workflow.md#corrections), for example a missing telemetry row or a wrong claim
- the same claim is still `violated` or `not established` after three verification rounds
- the verifier and implementation disagree about what a claim means

### Recording

The implementation session does not summarize the report by hand. It runs `pnpm verify:render --write`, which appends
the latest report on HEAD (or on a named commit: `pnpm verify:render <SHA> --write`) to the feature's `quickstart.md`
execution results: revision, run, conditions, result per claim with any limitation ID, telemetry rows, forbidden data,
escalation, and cleanup. The generated section names the slice's earlier results it supersedes, so they stay in place,
marked stale, as earlier features did. Do not edit the generated text; correct the report through a new verification
run. The pull request body names the verified SHA and run UUID and links that section.

Committing that summary creates an evidence-only commit after the verified SHA, which needs no new verification
request under [Gate and escalation](#gate-and-escalation). Commit any other change, including a change to the run
instructions, separately and request verification of the new SHA.

## Known limits

- Claims that need a real tenant login stay `blocked` until a feature provides one, as in #155.
- Browser telemetry records only the closed-set facts in [Browser harness facts](../observability.md#browser-harness-facts).
  Plan anything else a person perceives, such as text, names, and what is visible, through browser interaction.
- Browser telemetry cannot record its own absence. Show that a page sends no context or loads no tracing code through
  browser interaction.
- A request sent before the readiness marker carries no browser context, and a fact recorded before it is replayed as
  a root span. Two form submits, or two router transitions, within 5 seconds leave both requests unparented. Sample
  one interaction of each kind at a time.
- Only documents under the protected `(app)` layout run browser tracing.
- Assistive-technology observations remain a person's manual check. The verifier can report what the accessibility
  tree exposes, which does not establish what a screen reader announces.
