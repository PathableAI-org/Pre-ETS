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

| Tier               | `verification.md`                                                                                                                                                                                                                                                          | Verifier                                                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High, new behavior | Everything above, with every channel available. Each security, tenant, or PHI claim also names its rejection path.                                                                                                                                                         | One report per slice through [the verification loop](#the-verification-loop), including telemetry queries and the forbidden-data check                                                                              |
| High, fix          | None. The pull request body's Evidence section numbers the claims the fix establishes `V-001`, `V-002`, and so on, each with its observation and channel. An ID keeps its claim once a report uses it; a new claim takes the next number.                                  | One report on the pull request for those claims, under the body's IDs, at the verified SHA, with the forbidden-data check. Slice ID `fix`; the feature directory may be omitted. Every claim must be `established`. |
| Standard           | Claims, meaningful violations, observations, and channels limited to browser interaction, assistive technology, module tests, and requirements BDD, plus the planned manual procedure. No server or browser telemetry channel: a claim that needs one makes the work High. | One report per slice through the verification loop, using the browser, BDD, and module evidence. No telemetry queries or forbidden-data check, because Standard work does not change exported telemetry.            |
| Light              | None                                                                                                                                                                                                                                                                       | None. Normal CI and the checks the pull request names.                                                                                                                                                              |

The [gate](#gate-and-escalation) applies to every verified tier. A slice with no assigned telemetry rows meets the
first condition trivially.

## Implementation slices

[Git and pull request workflow](git-workflow.md#implementation-slices) defines slices and their size and independence
rules. Each slice lists the contracts it implements, the telemetry rows it adds, and the claim IDs it advances. Verification is
per slice, so a later slice does not hide an earlier slice's failure.

## Sessions and roles

A stack runs as separate agent sessions with distinct responsibilities:

| Session        | Owns                                                                                                      | Does not                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Orchestrator   | Starting and briefing the other sessions, relaying human decisions and escalations, reporting stack state | Edit, merge, or mark ready any branch, approve a phase, or read code                      |
| Specification  | `spec.md`, `verification.md`, the specification pull request                                              | Plan modules or telemetry                                                                 |
| Plan           | `plan.md`, `contracts/modules.md`, `contracts/telemetry.md`, `quickstart.md`, slices                      | Change acceptance criteria                                                                |
| Implementation | `tasks.md`, the code and instrumentation for each slice, slice pull requests                              | Mark a slice ready without a verification report, or with an open blocking review finding |
| Verification   | Running pushed revisions, inspecting the running application and its telemetry, reports                   | Edit any branch or fix the implementation                                                 |
| Review         | Reviewing pushed revisions for correctness reasoning and maintainability, review notes                    | Edit any branch or fix the implementation                                                 |

The orchestrator starts one verification session and, for High and Standard work, one review session per stack,
when the implementation session first pushes. It gives each of them the implementation session's identifier and the
first request, and then gives the implementation session their identifiers. [Code review session](code-review.md) owns the
reviewer's scope, findings, and loop. Only a person approves and merges a phase, as the Git workflow requires. [Orchestration](orchestration.md) owns
the orchestrator's lifecycle by tier, stop points, concurrency, and each role's model and effort.

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
  enabled and `TELEMETRY_EXPORT_TIMING=immediate`, the verification mode of
  [Operating modes](../observability.md#operating-modes), which a production build must set. Set `LOG_LEVEL=Debug` as
  well, so each request emits the debug log records the telemetry contracts read
  ([Verification](../observability.md#verification)). Generate a run UUID for each verification run, including
  retries. Set `OTEL_SERVICE_VERSION` to the
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
context. Wait for `<html data-preets-browser-tracing="started">` before a sampled step. Under immediate timing the page
exports each span as it ends, so no batch wait is needed before closing it.

### Observation

The verifier runs the requested `quickstart.md` steps and then queries the telemetry with the queries in
`contracts/telemetry.md`. Use the read-only Grafana MCP server configured in `.mcp.json`. Read a record by its trace ID
when the step gives one; a trace search lists a new trace only after the trace store's search delay, as
[Observability](../observability.md#verification) describes. An empty result is inconclusive until the verifier
confirms that OTEL was enabled, traffic occurred, and the records had time to reach the collector.

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

A High fix's report uses slice ID `fix`, takes its claim IDs from the pull request body as
[Verification by risk tier](#verification-by-risk-tier) says, and may omit the feature directory. Every other report
names one.

The verifier records the report with `pnpm verify:record <report.json>`. The command validates it and adds it to the
Git note on the verified SHA under `refs/notes/verification`. A retry on the same SHA is appended and supersedes the
earlier report, which stays in the note. Git also keeps each version of the note in the notes ref's history. The
command then posts the report as a comment on the verified SHA's pull request, so the implementation session's clone
can import it. [Code review storage](code-review.md#storage) owns how entries are published and synced, the author
rule, and the trust model. Do not push or configure pushing for the notes ref itself.

The note is the record. The verification session then sends the implementation session only a pointer, such as
`refs/notes/verification @ <SHA> (run <uuid>)`. `pnpm verify:show <SHA>` syncs the branch's pull request and prints
the report. The report is information for the implementation session and the reviewer. It is not proof by itself.
Raw query output, screenshots, and transcripts are not committed.

The report needs no schema change to be posted later as a GitHub check run: `verifiedSha` is the check's `head_sha`,
the run UUID its `external_id`, the gate's outcome its `conclusion`, and the rendered results its output summary.
The note comment is the only thing posted to GitHub today.

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

`pnpm verify:gate` applies these rules to the checked-out `{number}-{slug}-impl*` branch. It first syncs the
branch's pull request comments into the local notes, as [Code review storage](code-review.md#storage) describes. It
takes the latest report on HEAD, or on the nearest ancestor when the commits since change only the feature's
`quickstart.md` execution-results section. It regenerates the request at the report's SHA, checks the report's slice
against the branch, and exits non-zero with every failing reason. A limitation excuses only a claim the slice
asserts in part. A report with an open escalation does not pass. The gate also applies the
[code review gate](code-review.md#gate-and-escalation) to the nearest reviewed commit.

A High fix's single pull request has no plan, so the gate regenerates no request. A High fix is a branch whose open
pull request is labelled `risk:high` and that is neither an implementation slice nor a Spec Kit specification or plan
branch. A specification branch `{number}-{slug}` and a plan branch `{number}-{slug}-plan` carry the feature's tier
label, `risk:high` included, but have no slice to verify or review, so the gate does not apply to them. A branch
counts as one when it names a feature directory, `specs/{number}-{slug}/`, that exists in the tree at the pull
request's head SHA; the working tree is not consulted. For a High fix, `pnpm verify:gate` requires the following of
the latest report on HEAD or an evidence-only ancestor:

- Slice ID `fix`, at least one claim, and every claim `established`. No limitation is approved for a fix.
- Every telemetry row it lists present.
- No unrequested violation, no forbidden data, and no open escalation.

The gate does not read the pull request body, so the person reviewing the pull request checks that the report's
claims are the body's numbered claims, none missing. It also requires a fix review that passes the code review gate.
A fix has no quickstart results, so for a fix an evidence-only commit changes no path at all. Any change after the
verified SHA needs a new request. The gate reads the label from the pull request, so it cannot judge a fix branch
offline.

A Claude Code `PreToolUse` hook in `.claude/settings.json` runs the gate whenever a session tries to mark a pull
request ready, and blocks the attempt when the gate fails. It covers `gh pr ready` (with no argument, a number, a
URL, or a branch), a `gh api` call that sets `draft` false on a pull request (as `draft=false` or in a JSON body), a
`gh api` or `curl` call to a pull request's `ccr/ready_for_review` route, and the GitHub MCP tool's
`update_pull_request` with `draft: false`. The cloud reaches only REST, so `gh pr ready` fails there, and the MCP tool
or the REST route is how cloud sessions mark a pull request ready; see
[Working without GraphQL](git-workflow.md#working-without-graphql-cloud-sessions). The hook resolves the pull request
over REST and syncs its comments. It then gates its head branch at the pull request's head SHA, which must be in the
clone. It lets a specification or plan pull request through without the gate, even when it is labelled `risk:high`,
and gates an implementation slice and a High fix. When GitHub cannot be reached, it gates a checked-out slice branch on its local notes, and refuses any other
branch it cannot classify. Once the gate passes or does not apply, marking ready needs no person's confirmation:
project settings allow `gh pr ready` and the REST ready route without a prompt, and the hook approves the MCP update.
Removing that prompt does not relax the gate, which still decides every attempt. The hook refuses the paths it cannot
judge, and names the gated way:

- `gh stack submit --open`, which marks every pull request in the stack ready.
- A `gh api graphql` `markPullRequestReadyForReview` mutation, which names no branch.
- The MCP tool's `create_pull_request` for an implementation-slice branch without `draft: true`.

Known limits: the hook cannot see `gh pr create` without `--draft`, any other HTTP client, another GitHub MCP server
name, or a person in the web interface. A fix pull request created ready is not gated, because its `risk:high`
label is not yet set. The hook takes effect in sessions started after it is installed.

A slice pull request cannot create its own exception. A new limitation goes back through the
[corrections](git-workflow.md#corrections) path to the phase that owns it.

Escalate to the orchestrator, and through it to a person, instead of patching the implementation when:

- a finding belongs to the specification or plan under the
  [corrections table](git-workflow.md#corrections), for example a missing telemetry row or a wrong claim
- the same claim is still `violated` or `not established` after three verification rounds
- the verifier and implementation disagree about what a claim means

One escalation covers the whole claim. Before escalating a failing claim, the escalating session analyses every
observation the claim makes, not only the one that failed first, and every other claim in the request that uses the
same observation method, such as the same Tempo search or test channel. It puts every decision those analyses need
into the one escalation, so the person decides once rather than learning of the next failing half only after the
first decision.

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

## Requirements BDD runs

The full requirements suite spends over half an hour waiting in real time for session deadlines, and every session
runs in its own environment. Sessions therefore run only the scenarios that bear on their work, and the full suite
runs nightly on `main`:

| Run                | Owner          | When                                                       | How                                                                                                                     |
| ------------------ | -------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Affected scenarios | Implementation | While changing code, and before each push                  | `pnpm test:bdd:tags`, selected as [BDD commands](../../features/README.md#run-the-scenarios-a-change-touches) describes |
| Claim scenarios    | Verification   | Each request, for claims whose channel is requirements BDD | The claims' tags, at the requested SHA                                                                                  |
| Full suite         | CI             | Nightly on `main`                                          | The `Nightly BDD` workflow (`ci-bdd.yml`) on its schedule                                                               |

- No session runs the full suite, locally or by dispatching the workflow. A person may dispatch it on a branch, for
  example to show a harness fix before it merges.
- The nightly run catches regressions after merge. A nightly failure is a person's to triage, not a running
  session's.
- A scenario outside the change's scope that fails in a session's own run goes in the pull request body and to the
  orchestrator. Do not patch unrelated scenarios in the pull request.

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
