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
- **Browser telemetry**: traces exported by the browser, once browser tracing exists. Until then, plan the browser
  fact through browser interaction and record the gap.
- **Browser interaction**: what Playwright observes in the page, such as roles, names, focus, and navigation.
- **Assistive technology**: a manual check with a screen reader or other assistive technology.
- **Module test**: public-interface examples, properties, or integration tests.
- **Requirements BDD**: tagged scenarios under `tests/bdd/`.

Pick the channel that can actually observe the fact. Telemetry does not replace browser interaction for what a
person perceives, and it does not replace module tests for durable regressions.

### What goes in telemetry

If a verifier needs a runtime fact and the fact is safe to emit, the telemetry contract puts it in a span, log, or
metric. Typical facts are an operation's outcome, the decision a policy made, a deadline or policy value, which
tenant alias was bound, and the causal order of operations in one journey.

A fact that falls in a forbidden data class in [Observability](../observability.md#verification-telemetry-conventions)
is never emitted. The telemetry contract says how that fact is verified instead.

Instrumentation named in an approved telemetry contract is product code. Commit it with the slice that implements
the behavior. Durable tests still do not assert spans, logs, or attributes. The verification agent observes them.

## Implementation slices

The plan divides implementation into slices. Each slice is one stacked pull request and one reviewable decision.
[Git and pull request workflow](git-workflow.md#implementation-slices) sets the size and independence rules. Each
slice lists the contracts it implements, the telemetry rows it adds, and the claim IDs it advances. Verification is
per slice, so a later slice does not hide an earlier slice's failure.

## Sessions and roles

A stack runs as separate agent sessions with distinct responsibilities:

| Session        | Owns                                                                                         | Does not                                         |
| -------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Orchestrator   | Starting the other sessions, passing each the identifiers it needs, relaying human decisions | Edit feature branches                            |
| Specification  | `spec.md`, `verification.md`, the specification pull request                                 | Plan modules or telemetry                        |
| Plan           | `plan.md`, `contracts/modules.md`, `contracts/telemetry.md`, `quickstart.md`, slices         | Change acceptance criteria                       |
| Implementation | `tasks.md`, the code and instrumentation for each slice, slice pull requests                 | Mark a slice ready without a verification report |
| Verification   | Running pushed revisions, inspecting the running application and its telemetry, reports      | Edit any branch or fix the implementation        |

The orchestrator starts one verification session per stack, alongside the implementation session, and gives each
session the other's session identifier. Only a person approves and merges a phase, as the Git workflow requires.

## The verification loop

### Request

When a slice is committed and pushed as a draft pull request, the implementation session sends the verification
session:

- the branch and the pushed commit SHA
- the slice ID from `plan.md`
- the claim IDs the slice claims to establish, and any it claims only in part
- the `quickstart.md` sections to run
- any change to the run instructions since the last request

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

For browser journeys, Playwright adds a W3C `traceparent` header that the verifier generates for each step. Server
spans continue that trace, so each browser step maps to a known trace ID without browser tracing.

### Observation

The verifier runs the requested `quickstart.md` steps and then queries the telemetry with the queries in
`contracts/telemetry.md`. Use the read-only Grafana MCP server configured in `.mcp.json`. The
[Observability](../observability.md#verification) export delays apply. An empty result is inconclusive until the
verifier confirms that OTEL was enabled, traffic occurred, and export had time to complete.

The verifier also checks that no exported attribute or log field falls in a forbidden data class. That finding is
a violation of the slice, whatever the claim results are.

### Report

The verification session replies to the implementation session with one result per requested claim ID:

| Result            | Meaning                                                                                |
| ----------------- | -------------------------------------------------------------------------------------- |
| `established`     | The required observation was made at the requested revision                            |
| `violated`        | A meaningful violation was observed                                                    |
| `not established` | The procedure ran but did not produce a conclusive observation                         |
| `blocked`         | A prerequisite outside the slice prevented the procedure, such as a missing dependency |

Each result includes the revision, the trace IDs or query and time range, the observed values that matter, the
conditions, and the limits. The report also lists missing or unusable instrumentation against
`contracts/telemetry.md` and any forbidden data observed.

The report is information for the implementation session and the reviewer. It is not proof by itself. Raw query
output, screenshots, and transcripts are not committed.

### Gate and escalation

The implementation session fixes the slice and requests verification again. A slice may be marked ready for
review only when its latest report has no `violated` result and no forbidden data finding. `not established` and
`blocked` results are allowed only when the slice's pull request names them as limitations.

Escalate to the orchestrator, and through it to a person, instead of patching the implementation when:

- a finding belongs to the specification or plan under the
  [corrections table](git-workflow.md#corrections), for example a missing telemetry row or a wrong claim
- the same claim is still `violated` or `not established` after three verification rounds
- the verifier and implementation disagree about what a claim means

### Recording

The implementation session summarizes each final report in the `quickstart.md` execution results for the slice:
revision, conditions, result per claim, and limitations. Record superseded results as stale rather than deleting
them, as earlier features did.

## Known limits

- Claims that need a real tenant login stay `blocked` until a feature provides one, as in #155.
- Browser telemetry does not exist yet. Plan browser facts through browser interaction until it does.
- Assistive-technology observations remain a person's manual check. The verifier can report what the accessibility
  tree exposes, which does not establish what a screen reader announces.
