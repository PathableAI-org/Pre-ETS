# Feature Verification Plan: Configurable Telemetry Export Timing

**Feature specification**: [spec.md](spec.md)

**Delivery issue**: [#475 — Make telemetry export timing configurable for agent and developer feedback loops](https://github.com/PathableAI-org/Pre-ETS/issues/475)

**Status**: Planned — no execution evidence is recorded by this document

## Authority and scope

This plan covers issue #475, read on 2026-11-15, with current `origin/main` at
`6c326576bde033ee13cd85d283743c8367927405`. No accepted requirement or delivery-plan slice applies (spec Authority
finding 1). Claims trace to the issue's In scope and Completion evidence sections, bounded by
[Observability](../../docs/observability.md), its [data classes](../../docs/observability.md#data-classes), and
[Observe telemetry, do not test it](../../docs/engineering/testing/README.md#observe-telemetry-do-not-test-it).

The tier is High, new behavior, so every evidence channel is available and each confidentiality claim names its
rejection path.

Evidence may establish when records leave a locally running server process and a locally running page under each
timing, the defaults by mode, that the exported content is the same under both timings, that nothing is exported
with telemetry off or under the CI configuration, that a test run can export to the local stack, and that an orderly
exit delivers pending records. It may not establish the behavior of a deployed environment, export throughput, or
the absence of every possible sensitive value.

Telemetry cannot record its own absence or its own timing. A claim about when an export request leaves a process, or
about no request being made, is observed at the network boundary: at a temporary local receiver for the server and
for test processes, and through browser interaction for the page. A claim that records arrive and can be queried is
observed in the local stack.

## Claims and traceability

| ID    | Claim to establish                                                                                                                             | Authoritative source                                                | Meaningful violation                                                                                                                  | Required observation                                                                                                                                                                                                                                                            | Evidence channel                                                   |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| V-001 | Under immediate timing, the server's trace records of a request leave the process when the request finishes.                                   | Issue In scope (immediate mode); spec FR-002                        | Records are held for a batch interval, or leave only when later requests arrive.                                                      | For each of five requests sent three seconds apart, an export request carrying trace records reaches the collector address within 1 second of that response, before the next request is sent.                                                                                   | Server telemetry (temporary local receiver)                        |
| V-002 | Under immediate timing, a server log record leaves the process when it is emitted.                                                             | Issue In scope (immediate mode); spec FR-002                        | Log records are held for a batch interval.                                                                                            | For each of five actions that make the server emit a log record, an export request carrying log records reaches the collector address within 1 second of the action.                                                                                                            | Server telemetry (temporary local receiver)                        |
| V-003 | With immediate timing and the local stack, a request's trace and log records can be queried without a batch-interval wait.                     | Issue Completion evidence (first item); spec FR-016                 | A query made right after the request finds nothing until a batch interval has passed.                                                 | For each of five sampled requests in a production build started as the verification harness documents, a trace-store query and a log-store query filtered by the run find that request's records within 10 seconds of the response.                                             | Server telemetry                                                   |
| V-004 | With browser tracing effective and immediate timing, a browser record leaves the page when it finishes and can be queried right after.         | Issue In scope (browser SDK); Completion evidence; spec FR-013      | The page holds the record for its batch delay, or batches although the server's timing is immediate.                                  | For each sampled interaction, the page's export request to the collector leaves within 1 second of the interaction, and the browser record is found in the trace store within 10 seconds, without keeping the page open for a batch delay.                                      | Browser interaction; browser telemetry                             |
| V-005 | A production-mode server process with no export-timing setting batches, as before this feature. An explicit `batch` does the same in any mode. | Issue In scope (defaults); Completion evidence; spec FR-003, FR-015 | A production process with no setting sends one export request per record, or `batch` does not batch.                                  | For a burst of 20 requests sent within 1 second, fewer than 20 trace export requests reach the collector address, and the same count and delay pattern is seen at the base revision. The same holds in development mode with `batch` set.                                       | Server telemetry (temporary local receiver)                        |
| V-006 | With browser tracing effective and batch timing, the page batches as it does today.                                                            | Issue In scope (existing batch mode); spec FR-003, FR-013           | The page sends one request per record under batch timing.                                                                             | For a burst of at least five browser records made within 1 second, the page sends fewer export requests than records, none within the first second.                                                                                                                             | Browser interaction                                                |
| V-007 | The effective timing follows the setting, and the mode's default when the setting is absent.                                                   | Issue Completion evidence (unit tests); spec FR-001, FR-004         | A production process with no setting gets `immediate`, a development process with no setting gets `batch`, or a set value is ignored. | For every combination of mode (production, development, test) and setting (absent, `immediate`, `batch`), startup decoding yields the timing FR-004 states. One development-mode start with no setting shows the V-001 observation.                                             | Module test; server telemetry (temporary local receiver)           |
| V-008 | An unrecognized setting value refuses startup and names the setting. Rejection path: startup configuration decoding fails.                     | Spec FR-005, FR-006                                                 | An unrecognized value silently selects a timing, or the error does not name the setting.                                              | For generated unrecognized values, with telemetry on and with telemetry off, startup decoding fails and the failure names `TELEMETRY_EXPORT_TIMING`. The manual procedure adds one real start per case, which exits with that error and serves no request.                      | Module test                                                        |
| V-009 | With telemetry off, the setting has no effect: nothing starts and nothing is exported.                                                         | Issue Completion evidence (CI configuration); spec FR-006           | A process with telemetry off and `immediate` set sends export requests.                                                               | With telemetry off, each timing value, and an endpoint that names the receiver, the receiver gets zero requests while the application serves traffic, and a protected document carries no telemetry configuration.                                                              | Server telemetry (temporary local receiver); browser interaction   |
| V-010 | Under the CI configuration, the application and every test suite make no export request, and no telemetry starts.                              | Issue In scope (CI); Completion evidence; spec FR-017, FR-020       | A CI job starts telemetry, or a suite run without the switch exports.                                                                 | Each CI workflow that starts the application or runs a suite sets its telemetry mode explicitly. Each suite's CI command, run under that workflow's environment, starts successfully with no collector endpoint supplied and sends zero requests to the local stack's address.  | Server telemetry (temporary local receiver on the stack's address) |
| V-011 | With the one test-telemetry switch, a requirements BDD run exports the owned application's traces and logs to the local stack.                 | Issue In scope (test suites); Completion evidence; spec FR-018      | The switch alone is not enough, or the run's records never reach the local stack.                                                     | In an environment with no other telemetry setting, a tagged selection run with the switch is found in the trace store and the log store, selected by the run's identifiers, within 10 seconds of the command returning.                                                         | Server telemetry                                                   |
| V-012 | With the same switch, a unit suite run and an integration suite run export the traces and logs of the code they exercise.                      | Issue In scope ("unit, integration, BDD"); spec FR-019              | Unit or integration runs export nothing with the switch on.                                                                           | For one unit selection and one integration selection, records of the operations those tests exercise are found in the local stack, selected by the run's identifiers, within 10 seconds of the command returning.                                                               | Server telemetry                                                   |
| V-013 | Turning telemetry on does not change any test's result, with the local stack reachable or not.                                                 | Spec FR-022                                                         | A test passes with telemetry off and fails with it on, or a run hangs when the local stack is down.                                   | The same selection of each suite kind has identical per-test results with the switch off, with it on, and with it on while the collector address refuses connections. Each run ends.                                                                                            | Module test (suite results compared across runs)                   |
| V-014 | Explicit telemetry settings take precedence over the switch's defaults, and the off switch wins.                                               | Spec FR-021, FR-023                                                 | A supplied run identifier is ignored, or a run with both switches set exports.                                                        | A run with the switch and a supplied revision and run identifier is selected by exactly those values, and a concurrent run with other values is not. A run with the switch and the telemetry off switch sends zero export requests.                                             | Server telemetry; module test                                      |
| V-015 | An orderly stop delivers the server's pending trace and log records under both timings.                                                        | Issue In scope (flush or shutdown); spec FR-024                     | Records of a request made just before the stop never arrive.                                                                          | Under each timing, for a request sent less than 1 second before an orderly stop, the receiver holds that request's trace and log export before the process ends.                                                                                                                | Server telemetry (temporary local receiver)                        |
| V-016 | A test run with telemetry on has delivered its records when its command returns, under both timings.                                           | Issue In scope (flush or shutdown); spec FR-025                     | The last tests' records are missing because the test process ended first.                                                             | Under each timing, records of the last test in a selection are at the receiver when the command returns.                                                                                                                                                                        | Server telemetry (temporary local receiver)                        |
| V-017 | Records a page makes just before it is hidden or navigates away are still sent, under both timings.                                            | Spec FR-026                                                         | An interaction that navigates loses its record under one timing.                                                                      | Under each timing, the record of an interaction that immediately navigates is found in the trace store.                                                                                                                                                                         | Browser telemetry; browser interaction                             |
| V-018 | An unreachable collector does not keep a stopping process from ending, and does not change request handling or the page.                       | Spec FR-012, FR-027; observability export policy                    | A stop hangs, a response fails or stalls, or the page behaves differently when the collector is down under immediate timing.          | With immediate timing and the collector address refusing connections, a fixed journey's responses and visible outcomes match the same journey with a reachable collector, and an orderly stop ends the process.                                                                 | Browser interaction                                                |
| V-019 | The exported content is the same under both timings.                                                                                           | Issue Requirements ("changes no signal ..."); spec FR-009, FR-011   | A record, attribute, or resource attribute appears under one timing only, a record is exported twice, or a header is missing.         | For a fixed journey run once under each timing, the sets of record names, attribute names, and resource attributes are equal for server and browser records, no record is duplicated, and export requests under both timings go to the same endpoint with the synthetic header. | Server telemetry; browser telemetry; temporary local receiver      |
| V-020 | No forbidden data is exported under immediate timing. Rejection path: the existing query removal and browser export filter run before export.  | Spec FR-010; observability data classes                             | A query string, a filtered browser record, or a host or process attribute is exported under immediate timing.                         | In a journey with a seeded query value and a seeded fragment, every exported field of every server and browser record of the run contains no probe value and no value in a forbidden class, and no record or attribute outside the documented export sets is present.           | Server telemetry; browser telemetry (exhaustive inspection)        |
| V-021 | Metrics keep their periodic interval under both timings.                                                                                       | Issue In scope (traces and logs only); spec FR-008                  | Under immediate timing, metrics are exported per record or stop arriving.                                                             | Under each timing, over two metric intervals with traffic, metric export requests arrive at the existing interval and the count per interval is the same.                                                                                                                       | Server telemetry (temporary local receiver)                        |
| V-022 | The page's export timing is the server's, and the page receives no other new telemetry setting.                                                | Spec FR-013, FR-014                                                 | The page receives collector headers or another server setting, or receives configuration with browser tracing off.                    | The configuration in a received protected document holds only the four existing values and the export timing, with collector headers configured on the server. With browser tracing off it holds none.                                                                          | Browser interaction                                                |
| V-023 | The documentation states the three modes once, and a developer can reach immediate local export from the documentation alone.                  | Issue In scope (documentation); spec FR-028 to FR-030               | A document restates or contradicts the modes, or a fresh setup following the documentation still waits for a batch interval.          | Following only the repository documentation from a clean checkout yields the V-001 and V-003 observations. One section of `docs/observability.md` states the three modes, and the other named documents link to it and no longer tell the reader to wait for a batch interval.  | Server telemetry; browser interaction (documentation followed)     |

Each required observation is a fact about the running product. Which existing records serve as the sampled trace
and log records, the verifier's queries, and how the temporary receiver is run belong to the engineering plan's
`contracts/telemetry.md` and `quickstart.md`.

## Automated behavioral evidence

| Claim IDs    | Evidence boundary                                                              | Planned scenario or property                                                                                                                                                                                                                                                                                         | Why this boundary is meaningful                                                                                        | Known limits                                                                          |
| ------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| V-007, V-008 | Startup configuration decoding, at its public interface                        | Examples for every combination of mode and setting. A property that the effective timing is `immediate` exactly when the setting is `immediate`, or the setting is absent and the mode is not production. Generated unrecognized values refuse startup and the failure names the setting, with telemetry on and off. | The timing rule is a pure decision. This is the cheapest boundary that fails for a wrong default or a silent fallback. | Does not establish that either exporter honors the decision (V-001 to V-006).         |
| V-014        | The decision whether a test run's telemetry is on, at its public interface     | Examples for the switch absent, the switch alone, the switch with explicit settings, and the switch with the telemetry off switch.                                                                                                                                                                                   | Precedence is a pure decision that a wrong default would break silently.                                               | Does not establish that a suite's processes export (V-011, V-012).                    |
| V-013        | The existing suites, run by the verifier with the switch off, on, and stranded | A fixed selection of each suite kind, compared per test across the three runs.                                                                                                                                                                                                                                       | Only the suites themselves can show that telemetry leaves their results alone.                                         | A selection, not the full suites. The nightly run on `main` stays with telemetry off. |

No requirements-backed BDD applies, because no accepted requirement covers this feature. No scenario is added or
retagged. Durable tests do not assert spans, log records, export requests, or exporter wiring. The verification
agent observes them (spec L1).

## Agent-executable manual feature verification _(mandatory)_

### Purpose

Observe what no module test can: when export requests actually leave a running server and a running page under each
timing, that the same journey exports the same content either way, that nothing leaves with telemetry off or under
the CI configuration, that a test run reaches the local stack through one switch, and that an orderly exit loses
nothing. The issue's completion evidence is these observations.

### Prerequisites

- A clean checkout at the exact revision under assessment, built for local production-like serving, and a second
  checkout at the base revision for the V-005 comparison.
- The local stack from `docs/docker-compose.md` running and healthy, and the read-only Grafana MCP server from
  `.mcp.json`.
- Playwright able to capture a page's requests with their times, received documents, and navigation.
- A temporary local receiver the verifier runs for the run: a listener that records, for each export request, its
  arrival time, signal path, and size, whether the synthetic collector header is present, and never a header value.
  It can forward to the local stack, answer without forwarding, or refuse connections. It is a verification aid and
  is not committed.
- Synthetic tenants, users, and fixtures from the repository, and a session established through the local identity
  provider's synthetic users for the browser steps. No real client records or credentials.
- A run UUID per run. Set the revision and run identifier as the
  [verification harness](../../docs/engineering/verification-harness.md#environment) requires, so every query filters
  by both.
- Probe values seeded for this run: a distinctive query-string value and a distinctive fragment, both synthetic, and
  a synthetic collector header value that is never a real credential.

### Procedure

1. Record the revision, base revision, date and time, run UUID, local stack image, application port, and the
   telemetry settings of each start.
2. **Immediate, server (V-001, V-002, V-003).** Start the production build exactly as the verification harness
   documentation says, with the endpoint naming the receiver in forwarding mode. Send five requests three seconds
   apart, each with its own trace context, and perform five actions that make the server emit a log record. For each,
   record the time from the response to the first trace export and log export at the receiver. Right after each
   response, query the trace store and the log store through the Grafana MCP server, filtered by revision and run
   identifier, and record the time until the request's records are found.
3. **Defaults (V-005, V-007).** Start in development mode with telemetry on and no export-timing setting, send one
   request, and record the V-001 observation. Start the production build with no export-timing setting, send 20
   requests within 1 second, and record the number and arrival times of trace export requests. Repeat that burst at
   the base revision and compare. Repeat it in development mode with `batch` set.
4. **Refusal (V-008).** Start with an unrecognized setting value, once with telemetry on and once with it off.
   Record the exit, that the error names the setting, and that no request is served.
5. **Browser (V-004, V-006, V-017, V-022).** With browser tracing effective and collector headers configured on the
   server, load a protected page and record the telemetry configuration the document carries. Under immediate timing,
   perform five sampled interactions and record, from Playwright, the time from each interaction to the page's export
   request, then query the trace store for each record. Perform one interaction that navigates at once and query for
   its record. Restart with batch timing, make at least five browser records within 1 second, and record the number
   and times of the page's export requests. Repeat the navigating interaction.
6. **Same content, no forbidden data (V-019, V-020).** Run one fixed journey under each timing, with the synthetic
   collector header configured and the seeded query value and fragment in a followed link. From the trace and log
   stores, collect the set of record names, attribute names, and resource attributes of each run and compare the two
   sets, for server and browser records. Check for duplicated records. From the receiver, record that both runs
   exported to the same endpoint with the header present. Search every exported field of both runs for the probe
   values, for any query string or fragment, for host, operating-system, and process attributes, and for each
   forbidden data class. Do not copy a matched value into the report; record only where it was found.
7. **Telemetry off and CI (V-009, V-010).** Start the application with telemetry off, each timing value in turn, and
   the endpoint naming the receiver. Serve traffic, load a protected document, and record the receiver's request
   count and the document's telemetry configuration. Read each CI workflow at the revision and record where it sets
   its telemetry mode. Run each suite's CI command under that workflow's environment, with the receiver listening on
   the address the test-telemetry switch would use, and record that each starts and that the receiver's request count
   is zero.
8. **Test runs (V-011, V-012, V-013, V-014, V-016).** In an environment with no other telemetry setting, run with the
   switch: a tagged selection of requirements BDD, a unit selection, and an integration selection. As soon as each
   command returns, query the trace and log stores for the run and record the time until its records are found.
   Repeat one selection with a supplied revision and run identifier while a second run uses other values, and record
   that each query returns only its own run. Repeat with the telemetry off switch also set and record zero export
   requests. Run each selection three ways (switch off, switch on, switch on with the receiver refusing connections)
   and compare per-test results and that each run ends. Under each timing, with the receiver in place, record that
   the last test's records are at the receiver when the command returns.
9. **Orderly exit and unreachable collector (V-015, V-018).** Under each timing, send one request and stop the server
   in an orderly way less than 1 second later. Record that the receiver holds that request's trace and log export and
   that the process ended. Then, under immediate timing, set the receiver to refuse connections, run the fixed
   journey through the browser, and compare responses and visible outcomes with step 6. Stop the server in an orderly
   way and record that it ends.
10. **Metrics (V-021).** Under each timing, serve traffic for two metric intervals and record the times and count of
    metric export requests at the receiver.
11. **Documentation (V-023).** In a fresh worktree, follow only the repository documentation to start the local stack
    and the application, and record whether the V-001 and V-003 observations hold and any step the documentation did
    not supply. Record the section that states the three modes, and any other document that restates them or still
    requires a batch-interval wait.
12. **Cleanup.** Stop the application instances and the receiver, delete Redis keys under this run's prefix, remove
    the extra worktrees, and leave the shared local stack running unless this run started it.

### Expected observations

- V-001, V-002: every sampled trace export and log export reaches the receiver within 1 second.
- V-003, V-004, V-011, V-012: the sampled records are found in the local stack within 10 seconds, with no
  batch-interval wait.
- V-005, V-006: fewer export requests than records under batch timing, matching the base revision for the server.
- V-007, V-008: the default for each mode, and a refusal that names the setting.
- V-009, V-010: zero export requests and no telemetry configuration in the document.
- V-013: identical per-test results across the three runs, and every run ends.
- V-014: explicit identifiers select exactly the run, and the off switch wins.
- V-015, V-016, V-017: records made just before an orderly stop, a command's return, or a navigation are delivered.
- V-018: the same responses and visible outcomes with the collector unreachable, and the process ends.
- V-019, V-020: equal sets under both timings, the header present, no duplicate, and zero forbidden values.
- V-021: the same periodic metric export under both timings.
- V-022: the four existing values and the export timing, and nothing with browser tracing off.
- V-023: the documentation alone is enough, and the modes are stated once.

### Evidence to retain

- Revision, base revision, run UUID, telemetry settings of each start, local stack image, and date and time.
- For each timing claim, the sample count and the longest observed time, and the queries and time ranges used.
- Export request counts for the batch, off, and CI steps.
- The compared sets' sizes and any difference, and the forbidden-data search scope and result, without matched
  values.
- Per-test result comparisons for the three test runs, by test name only.
- Each claim's result as `established`, `violated`, `not established`, or `blocked`, with conditions and limits.

## Harness observations

Claims observed through server telemetry: V-003, V-011, V-012, V-014, V-019, V-020, V-023. For each, the verifier
must be able to learn from records in the local stack:

- which run and revision produced a record, for an application process and for a test run alike (V-003, V-011,
  V-012, V-014)
- which request or test-exercised operation a trace record belongs to, so a sampled request or test can be matched
  to its records (V-003, V-011, V-012)
- that a log record of the sampled action exists for the run (V-003, V-011)
- the record names, attribute names, and resource attributes of a run, to compare two runs (V-019, V-020)

Claims observed through browser telemetry: V-004, V-017, V-019, V-020. The existing
[browser records](../../docs/observability.md#browser-export) and
[harness facts](../../docs/observability.md#browser-harness-facts) supply them. The verifier must be able to match a
sampled interaction to its browser record and to learn the run and revision that produced it.

This feature adds no signal, attribute, or resource attribute. The engineering plan's telemetry contract references
existing records for these observations instead of defining new ones. If an observation above cannot be made from
existing records, that is a finding for the specification, because the issue excludes new signals.

Facts that are never emitted as telemetry, and how they are verified instead:

- The time at which an export request leaves a process, and the number of export requests: not telemetry. Observed
  at the temporary local receiver (V-001, V-002, V-005, V-015, V-016, V-021) and through browser interaction
  (V-004, V-006).
- The absence of export with telemetry off, under the CI configuration, and without the test-telemetry switch: not
  observable in telemetry. Observed at the receiver and in the received document (V-009, V-010, V-014).
- The effective export timing itself is a non-secret configuration value. It is established by module tests (V-007)
  and by its effect, not by a new telemetry attribute.
- Collector header values, query strings, fragments, and every forbidden data class: never emitted under either
  timing (V-020). The receiver records only whether the synthetic header is present.

## Operational observability verification

No operational observability claim in this slice. No accepted requirement places an operational obligation on export
timing. V-005 observes the production default on a production-mode build running locally; it is not an observation
of a deployed environment (spec L5). The harness observations above are not operational obligations.

## Environment and data controls

- Synthetic tenants, users, and fixtures only. Probe values and the collector header value are synthetic strings
  chosen for the run, and the report never repeats the header value.
- The shared local stack is used. Every query filters by revision and run UUID. Redis keys use the
  `preets:verify:<run-uuid>:` prefix and are deleted at cleanup.
- The temporary receiver listens on loopback only, stores no request bodies beyond what the comparison needs during
  the run, and is removed at cleanup.
- The collector is made unreachable for this run only, by pointing this run's processes at the receiver in refusing
  mode. The shared local stack is not stopped.
- No staging, production, or third-party collector is contacted.

## Evidence retention and reporting

The verification agent records one schema-checked report per run, as the
[verification harness](../../docs/engineering/verification-harness.md#report) describes. The implementation session
renders each report into the feature's `quickstart.md` execution results. Raw query output, receiver logs, exported
records, and transcripts are not committed. Planned procedures in this document are not executed evidence.

## Limitations and incomplete claims

- **L-stack**: a 10-second query bound (V-003, V-004, V-011, V-012) includes the local stack's own delay, which this
  feature does not control. When a record left its process within 1 second but is found later than 10 seconds, the
  claim is `not established`, not `violated`, and the report says which delay was observed.
- **L-sample**: timing claims are established for the sampled requests, interactions, and test selections, not for
  every route or every test. V-013 compares a selection, not the full suites.
- **L-absence**: V-009, V-010, and V-020 establish absence for the observed runs and the seeded probes. They cannot
  prove the absence of every possible request or sensitive value.
- No deployed environment is observed. The production default is established for a production-mode build running
  locally (spec L5).
- A kill, a crash, and an abruptly closed page are outside V-015 to V-017 (spec L2).
- Steps that need an application session are `blocked` if the local identity provider cannot establish one at the
  revision under assessment.
- Export throughput under immediate timing is not measured (spec L3).

## Readiness review

- [x] Every feature claim maps to an authoritative source.
- [x] Every claim states the observation that distinguishes it and an evidence channel able to make it.
- [x] Successful, failure, rejection, security/privacy, accessibility, and operational outcomes are covered where applicable.
- [x] The manual feature procedure is non-empty, executable by an agent, and adds a distinct observation.
- [x] Environmental prerequisites, evidence retention, cleanup, and limitations are explicit.
- [x] Planned evidence is not described as executed or verified.
- [x] No implementation architecture is required to understand the feature claims.
