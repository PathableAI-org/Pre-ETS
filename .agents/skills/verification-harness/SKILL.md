---
name: verification-harness
description: Act as the verification session for a Pre-ETS implementation stack. Run a pushed slice revision, observe the running application through its telemetry and the browser, record a schema-checked report per run in git notes on the verified SHA, and send the implementation session a pointer. Never edits branches.
---

# Verification harness

Follow the [requirements guide](../../../docs/requirements/README.md#public-source-attribution)’s public-source
attribution rule: never name a specific partner or client in reports, artifacts, or GitHub text.

Read [the verification harness](../../../docs/engineering/verification-harness.md) before the first request. It owns
the roles, the request and report shapes, the gate, and escalation. This skill supplies the procedure. Also read the
[verification telemetry conventions](../../../docs/observability.md#verification-telemetry-conventions) and
[Testing as evidence](../../../docs/engineering/testing/README.md).

## Boundaries

- Verify only pushed commits named in a request. Never read or change the implementation session's worktree.
- Do not edit any branch, pull request, issue, requirement, delivery plan, or `specs/` file. Report instead. The
  one write this session makes is the report note under `refs/notes/verification`, through `pnpm verify:record`.
  Never push notes or configure pushing for them.
- Do not fix the implementation or suggest code beyond naming the observed defect and where it appeared.
- Do not commit or retain probes, query output, screenshots, or transcripts in the repository.
- Do not use real client records, real credentials, or production services. Never print credentials, cookies,
  session references, tokens, or header values, even when they appear in telemetry. Report that they appeared.

## Inputs

From the implementation session's message: branch, pushed SHA, slice ID, and changed run instructions. Generate the
request from the SHA yourself rather than trusting a hand-picked claim list:

```sh
pnpm verify:request --feature specs/<number>-<slug> --slice <ID> --sha <SHA>
```

It lists the claims (full or partial), telemetry rows, `quickstart.md` sections, and approved limitation IDs. Also
read the feature's `verification.md`, `contracts/telemetry.md`, and `quickstart.md` at the SHA. If the request has
warnings, an input is missing, or the documents disagree about a claim, report `blocked` with the reason (or
escalate) rather than guessing.

## Procedure

1. Create or reuse a worktree owned by this session and check out the SHA detached. Install dependencies and build
   as `quickstart.md` directs.
2. Start the local services the quickstart needs, including the observability profile from
   [Observability](../../../docs/observability.md#local-grafana--otlp). Generate a run UUID for each verification
   run, including retries. Start application instances on ports this session owns, with OTEL enabled,
   `OTEL_SERVICE_NAME` as documented, `OTEL_SERVICE_VERSION` set to the SHA, and
   `service.version=<SHA>,service.instance.id=<run-uuid>` added to `OTEL_RESOURCE_ATTRIBUTES`, keeping any existing
   entries. Use a `preets:verify:<run-uuid>:` prefix for any keys this session writes.
3. Run the requested `quickstart.md` steps. For browser steps, set a W3C `traceparent` header you generate per step
   through Playwright and note the trace ID, so server spans can be found without browser tracing.
4. Wait for export: about 30 seconds for traces and logs, about 60 seconds for metrics.
5. Run each verifier query from `contracts/telemetry.md` through the Grafana MCP server, filtered by
   `service.version`, `service.instance.id`, and the run's time range. Compare the result with the expected observation and the expected
   negative observation for each claim.
6. Inspect every touched signal against the forbidden data classes: span attributes, log fields, and metric
   labels. Confirm each metric's labels match the contract's metrics-cardinality list and include no session,
   trace, user, or request identifier or timestamp; report any other label as forbidden data.
7. Clean up: stop owned instances, delete owned keys, remove temporary files. Leave the shared observability stack
   running unless this session started it.

An empty query result is not a pass or a violation. Confirm OTEL was enabled, the traffic occurred, and export had
time, then report `not established` if the observation is still missing.

## Report

Write the report as JSON that matches the schema in
[`scripts/verification/report.ts`](../../../scripts/verification/report.ts), one file per run in a scratch
directory outside the repository:

```json
{
  "schemaVersion": 1,
  "verifiedSha": "<full SHA>",
  "featureDir": "specs/<number>-<slug>",
  "sliceId": "<ID>",
  "runId": "<run UUID>",
  "timeRange": { "start": "<ISO time>", "end": "<ISO time>" },
  "environment": "<instances, ports, services, OTEL settings without header values>",
  "claims": [
    {
      "id": "V-001",
      "scope": "full | partial, as the request says",
      "result": "established | violated | not established | blocked",
      "evidence": { "traceIds": ["..."], "queries": ["..."], "procedure": "quickstart step or BDD run" },
      "observed": "key values",
      "conditions": "conditions",
      "limitationId": "approved ID from the request, required unless established"
    }
  ],
  "telemetryRows": [{ "id": "T-001", "status": "present | missing | unusable", "detail": "optional" }],
  "forbiddenData": [{ "signal": "span or log name", "field": "field name only, never the value" }],
  "escalations": [{ "kind": "specification | plan | disagreement | third round", "detail": "..." }],
  "cleanup": { "complete": true },
  "unrequestedViolations": []
}
```

Give one claim entry per requested claim and a status for every requested telemetry row. Put a claim the request
did not name but the run showed violated under `unrequestedViolations`. Then record it:

```sh
pnpm verify:record <report.json>
```

The command validates the report and appends it to the note on the verified SHA. A retry on the same SHA is a new
run UUID; it supersedes the earlier report, which stays in the note. Fix any validation problem and record again.

Send the implementation session only the pointer the command prints, `refs/notes/verification @ <SHA> (run <uuid>)`,
plus one line naming any claim that is not `established`, any telemetry row that is not present, and any
forbidden-data finding or escalation. Copy the orchestrator when a result needs a person. Do not paste the report into
the message; the note is the record, and the implementation session renders it into `quickstart.md` with `pnpm
verify:render --write`.

Report what was observed, not what the code is expected to do.
