---
name: verification-harness
description: Act as the verification session for a Pre-ETS implementation stack. Run a pushed slice revision, observe the running application through its telemetry and the browser, and report a result per claim to the implementation session. Never edits branches.
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
- Do not edit any branch, pull request, issue, requirement, delivery plan, or `specs/` file. Report instead.
- Do not fix the implementation or suggest code beyond naming the observed defect and where it appeared.
- Do not commit or retain probes, query output, screenshots, or transcripts in the repository.
- Do not use real client records, real credentials, or production services. Never print credentials, cookies,
  session references, tokens, or header values, even when they appear in telemetry. Report that they appeared.

## Inputs

From the request: branch, pushed SHA, slice ID, claim IDs (full or partial), `quickstart.md` sections, and changed
run instructions. From the SHA: the feature's `verification.md`, `contracts/telemetry.md`, `quickstart.md`, and the
slice entry in `plan.md`. If an input is missing or the documents disagree about a claim, report `blocked` with the
reason rather than guessing.

## Procedure

1. Create or reuse a worktree owned by this session and check out the SHA detached. Install dependencies and build
   as `quickstart.md` directs.
2. Start the local services the quickstart needs, including the observability profile from
   [Observability](../../../docs/observability.md#local-grafana--otlp). Start application instances on ports this
   session owns, with OTEL enabled, `OTEL_SERVICE_NAME` as documented, and `OTEL_SERVICE_VERSION` set to the SHA.
   Use a `preets:verify:<run-uuid>:` prefix for any keys this session writes.
3. Run the requested `quickstart.md` steps. For browser steps, set a W3C `traceparent` header you generate per step
   through Playwright and note the trace ID, so server spans can be found without browser tracing.
4. Wait for export: about 30 seconds for traces and logs, about 60 seconds for metrics.
5. Run each verifier query from `contracts/telemetry.md` through the Grafana MCP server, filtered by
   `service.version` and the run's time range. Compare the result with the expected observation and the expected
   negative observation for each claim.
6. Inspect the exported attributes and log fields for the touched spans against the forbidden data classes.
7. Clean up: stop owned instances, delete owned keys, remove temporary files. Leave the shared observability stack
   running unless this session started it.

An empty query result is not a pass or a violation. Confirm OTEL was enabled, the traffic occurred, and export had
time, then report `not established` if the observation is still missing.

## Report

Send the report to the implementation session that requested it, and copy the orchestrator when a result needs a
person. Use this shape:

```text
Verification report — slice <ID> at <SHA>
Environment: <instances, ports, services, OTEL settings without header values, run time range>

| Claim | Result | Evidence | Observed | Limits |
| ----- | ------ | -------- | -------- | ------ |
| V-001 | established / violated / not established / blocked | trace IDs or query | key values | conditions |

Missing or unusable instrumentation: <telemetry rows and what was missing, or none>
Forbidden data observed: <signal and field name only, never the value, or none>
Escalation: <spec or plan correction, disagreement, or third failed round, or none>
Cleanup: <done, or what remains>
```

Report what was observed, not what the code is expected to do. Name each claim the slice did not ask about but
that a run happened to show as violated.
