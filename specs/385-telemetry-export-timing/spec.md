# Feature Specification: Configurable Telemetry Export Timing

**Feature Branch**: `385-telemetry-export-timing`

**Created**: 2026-11-15

**Status**: Draft

**Input**: User description: "https://github.com/PathableAI-org/Pre-ETS/issues/475"

**Risk tier**: High, new behavior, under the [Git workflow's triggers](../../docs/engineering/git-workflow.md#triggers).
Trigger 4: the feature changes the telemetry exporter configuration in both processes, the server and the browser. The
delivery issue records the same tier and trigger. The issue also names a startup-configuration file that lies on
trigger 3's path list; the feature changes no authentication, session, authorization, or tenant-binding behavior, and
the tier is High either way (Authority finding 2).

## Clarifications

### Session 2026-11-15

- Q: Issue #475 says no durable requirement covers telemetry export timing. Does this work need a requirement entry
  before the specification proceeds? → A: No entry is needed. Issue #475 and `docs/observability.md` are the
  authority, as for browser tracing (Authority finding 1).
- Q: When `TELEMETRY_EXPORT_TIMING` is not set, which export timing takes effect? → A: By mode. A production-mode
  process batches, and development and test mode export immediately. The verification harness runs a production
  build, so its documented environment sets `immediate` explicitly (FR-004, FR-016).
- Q: Which test suites must the one test-telemetry switch cover? → A: All three kinds, as the issue says:
  requirements BDD, and the unit and integration suites, which export the traces and logs of the code they exercise.
  Test processes start telemetry only behind the switch (FR-019, FR-020).

## User Scenarios & Testing _(mandatory)_

The consumers of this feature are the verification agent described in the
[verification harness](../../docs/engineering/verification-harness.md), the developer who runs the application or its
tests locally, the operator of a deployed environment, and the reviewer who must trust that exported telemetry is
unchanged apart from when it leaves the process. No end user of the product sees any change.

Three terms are used throughout:

- **Export timing** is when a finished trace record or an emitted log record leaves the process that produced it.
  `immediate` sends each record when it finishes. `batch` holds records and sends them in groups, as the application
  does today.
- **Telemetry on** and **telemetry off** mean the existing all-or-nothing switch described in
  [Observability](../../docs/observability.md#environment-variables).
- The **local stack** is the repository's local collector with its trace, log, and metric stores, described in
  [Local Grafana / OTLP](../../docs/observability.md#local-grafana--otlp).

### User Story 1 - See Server Traces and Logs as Soon as They Happen (Priority: P1)

As a verification agent or a developer working locally, I find the server's trace and log records of a request in
the local stack right after the request, without waiting for a batch interval.

**Why this priority**: This is the issue's outcome. Today a verifier waits about 30 seconds after every step before
a query can be trusted, and an empty result inside that window is inconclusive.

**Independent Test**: With the local stack running and immediate timing in effect, send one request to the
application and query the trace and log stores for it. The records are there within seconds, and each left the
server when it finished rather than with a later group.

**Acceptance Scenarios**:

1. **Given** telemetry is on and immediate timing is in effect, **When** the server finishes handling a request,
   **Then** the trace records of that request leave the server process within 1 second, without waiting for a batch
   interval or for other requests.
2. **Given** telemetry is on and immediate timing is in effect, **When** the server emits a log record, **Then** that
   record leaves the server process within 1 second.
3. **Given** the local stack and immediate timing, **When** a verifier queries the trace and log stores for a request
   it just made, **Then** the request's trace and log records are found within 10 seconds of the response.
4. **Given** a developer starts the application in development mode with telemetry on and no export-timing setting,
   **When** it handles a request, **Then** immediate timing is in effect.
5. **Given** the verification harness's documented environment, which runs a production build, **When** a verifier
   starts the application as that documentation says, **Then** immediate timing is in effect because that
   environment sets it.
6. **Given** immediate timing and a collector that is unreachable or rejects export, **When** the server handles
   requests, **Then** every response and outcome is the same as with a reachable collector, apart from the lost
   telemetry.

---

### User Story 2 - Production Keeps Batching and Nothing Else About Telemetry Changes (Priority: P1)

As an operator or a reviewer, I can rely on a production process batching its export exactly as it does today, and on
the export-timing setting changing only when records leave the process, never what they contain or where they go.

**Why this priority**: Telemetry is a confidentiality boundary. A second export path that skipped the existing
redaction, or a production process that silently sent one request per record, would turn a feedback aid into a
regression.

**Independent Test**: Run the same journey once under each timing against the local stack. Compare what was
exported, and count how the records left the process.

**Acceptance Scenarios**:

1. **Given** a production-mode process with telemetry on and no export-timing setting, **When** it handles a burst of
   requests, **Then** it exports their records in groups, as it does before this feature.
2. **Given** `batch` is set explicitly, in any mode, **When** the process handles requests, **Then** it batches.
3. **Given** the same journey run once under each timing, **When** the exported records are compared, **Then** both
   runs hold the same signals, record names, attributes, and resource attributes, sent to the same collector endpoint
   with the same collector headers. Only the time at which records leave differs.
4. **Given** a request whose URL carries a query string, **When** its records are exported under immediate timing,
   **Then** no exported field contains the query string, exactly as under batch timing.
5. **Given** either timing, **When** metrics are exported, **Then** they leave on the existing periodic interval. The
   export-timing setting does not apply to metrics.
6. **Given** the export-timing setting holds a value that is not `immediate` or `batch`, **When** the application
   starts, **Then** startup fails with an error that names the setting, and no timing is chosen silently.
7. **Given** telemetry is off, **When** the export-timing setting holds either value, **Then** no telemetry runs and
   nothing is exported.

---

### User Story 3 - Browser Tracing Follows the Same Timing (Priority: P1)

As a verification agent using [browser tracing](../../docs/observability.md#browser-tracing-switch), I find a
browser record in the trace store right after the interaction that produced it, without keeping the page open for a
batch interval.

**Why this priority**: The browser is the slower half of today's loop: the harness keeps every page open about 30
seconds after its last step. The issue names both processes.

**Independent Test**: With browser tracing effective and immediate timing in effect, perform one interaction on a
protected page and watch the page's requests to the collector. Repeat with batch timing.

**Acceptance Scenarios**:

1. **Given** browser tracing is effective and immediate timing is in effect, **When** a browser record finishes,
   **Then** the page sends it to the collector within 1 second.
2. **Given** browser tracing is effective and batch timing is in effect, **When** browser records finish, **Then** the
   page batches them as it does today.
3. **Given** browser tracing is effective, **When** a protected document is rendered, **Then** the page's export
   timing is the server's effective timing. The page cannot choose its own, and it receives no telemetry setting
   beyond the four values it receives today and the export timing.
4. **Given** either timing, **When** the page exports, **Then** every record passes the existing browser export
   filter first.
5. **Given** either timing, **When** the page is hidden or navigates away, **Then** records made just before are still
   sent, as today.
6. **Given** browser tracing is off, **When** the export-timing setting holds either value, **Then** the page receives
   no telemetry configuration and sends nothing to the collector.

---

### User Story 4 - CI Runs With Telemetry Off (Priority: P2)

As a maintainer of the CI workflows, I can rely on every CI job running with telemetry off, because nothing in CI
reads it.

**Why this priority**: CI has no collector. Export attempts there cost time and produce connection errors that hide
real failures.

**Independent Test**: Run each suite's CI command under its workflow's environment with a listener on the address a
collector would use, and count the requests it receives.

**Acceptance Scenarios**:

1. **Given** the CI configuration, **When** a CI job starts the application or runs a test suite, **Then** no
   telemetry starts and nothing is sent to any collector address.
2. **Given** a test run started without the test-telemetry switch of User Story 5, **When** it runs, **Then** its
   telemetry behavior is what it is today: unit and integration test processes export nothing, and an application
   process a suite owns follows its environment.

---

### User Story 5 - Turn Telemetry On for Any Test Run (Priority: P2)

As a developer or an agent investigating a test, I can run any test suite with telemetry on by using one documented
command or environment switch, and then read that run's traces and logs in the local stack.

**Why this priority**: A failing test is where an agent most needs to see what the code did. It depends on immediate
timing and on delivery at exit, so it follows the first three stories.

**Independent Test**: With the local stack running and no other telemetry setting in the environment, run a small
selection of each suite kind with the switch. Query the local stack for the run as soon as the command returns.

**Acceptance Scenarios**:

1. **Given** the local stack is running and the environment holds no other telemetry setting, **When** a developer
   runs requirements BDD scenarios with the switch, **Then** the application process the suite owns exports its
   traces and logs to the local stack with immediate timing.
2. **Given** the same conditions, **When** a developer runs a unit suite or an integration suite with the switch,
   **Then** the traces and logs produced by the code those tests exercise are exported to the local stack.
3. **Given** a test run with the switch, **When** its command returns, **Then** every record the run produced has
   already left the test processes, so a query made right after finds them.
4. **Given** the switch and explicitly supplied telemetry settings, such as a revision and a run identifier, **When**
   the run starts, **Then** the supplied settings take precedence over the switch's local defaults.
5. **Given** the switch and the telemetry off switch are both set, **When** the run starts, **Then** telemetry stays
   off, and the documentation says so.
6. **Given** the switch is on and the local stack is not running, **When** the suite runs, **Then** every test has the
   result it has with the switch off. Only the telemetry is lost.

---

### User Story 6 - Pending Telemetry Survives an Orderly Exit (Priority: P2)

As a verification agent or a developer, when I stop a process in an orderly way, the records it had not yet sent are
delivered before it ends, whichever timing is in effect.

**Why this priority**: Short-lived processes are the common case in a feedback loop: a test run, or an application
instance stopped right after the step under observation. Losing their last records makes an empty result
inconclusive again.

**Independent Test**: Under each timing, send one request, stop the server in an orderly way within a second, and
check that the request's trace and log records reached the collector.

**Acceptance Scenarios**:

1. **Given** either timing, **When** the server process is stopped in an orderly way right after it produced trace
   and log records, **Then** those records are delivered before the process ends.
2. **Given** either timing and a collector that is unreachable, **When** the server process is stopped in an orderly
   way, **Then** the process still ends, and only the undelivered records are lost.
3. **Given** a process that is killed or crashes, **When** it ends, **Then** records it had not yet sent may be lost.
   This is an acknowledged limitation, smaller under immediate timing than under batch timing.

---

### User Story 7 - One Place States the Three Modes (Priority: P3)

As a developer or an agent new to the repository, I find the three operating modes, what selects each, and how to
turn telemetry on for a test run, stated once in the observability documentation.

**Why this priority**: The setting is only useful if the harness, local services, CI, and test guides agree about it.
Today each of those documents describes export delays in its own words.

**Independent Test**: From a clean checkout, follow only the repository documentation to start the local stack and
the application, and observe immediate export.

**Acceptance Scenarios**:

1. **Given** the observability documentation, **When** a reader looks for the operating modes, **Then** one section
   states all three (production, local development and verification, CI), what selects each, and the export-timing
   setting's name, values, and defaults. Other documents link to it instead of restating it.
2. **Given** the verification harness documentation and the verifier's instructions, **When** a verifier prepares its
   environment, **Then** they state the export-timing setting to use and no longer require a batch-interval wait
   before a query.
3. **Given** the test guides, **When** a developer wants telemetry from a test run, **Then** they name the one
   supported command or environment switch.

---

### Edge Cases

- The export-timing setting is absent: the default for the process's mode applies (FR-004).
- The setting holds an unrecognized value, including a recognized value in different letter case: startup fails and
  names the setting. Whether an empty value counts as absent follows the application's existing configuration
  decoding and is recorded by the engineering plan.
- Telemetry is off and the setting holds a recognized value: nothing runs. Telemetry is off and the setting holds an
  unrecognized value: startup fails, as it does today for other telemetry settings supplied while telemetry is off.
- Immediate timing is set in a production build: it takes effect. The verification harness needs exactly that. The
  application does not refuse it, and production configuration never sets it (Assumptions).
- Batch timing is set in development mode: the process batches, so a developer can reproduce production timing
  locally.
- Standard batching settings that the batch exporters already honor continue to apply under batch timing and have no
  effect under immediate timing.
- Browser tracing is effective and the collector is unreachable under immediate timing: each record's export fails
  on its own and the page behaves as it does with browser tracing off.
- A burst of records under immediate timing: each record still leaves on its own. Immediate timing is a local
  feedback mode and makes no throughput promise.
- A record finishes while the process is already stopping: it is delivered if the stop is orderly.
- The test-telemetry switch is used where the local stack is not running: tests keep their results, and the run's
  telemetry is lost.
- The test-telemetry switch is used for a suite whose exercised code produces no telemetry: the run succeeds and
  exports nothing.
- Two test runs, or a test run and an interactive application, export to the local stack at the same time: each run's
  records can be selected apart from the other's.

## Requirements _(mandatory)_

### Functional Requirements

#### The export-timing setting

- **FR-001**: The application MUST have one export-timing setting, named `TELEMETRY_EXPORT_TIMING`, with exactly two
  values: `immediate` and `batch`.
- **FR-002**: Under `immediate`, each finished trace record and each emitted log record MUST leave the process that
  produced it when it finishes, without waiting for a batch interval or for other records.
- **FR-003**: Under `batch`, export timing MUST be what it is before this feature, including every batching setting
  the application honors today.
- **FR-004**: When the setting is absent, the effective timing MUST be `batch` for a process running in production
  mode and `immediate` for a process running in development or test mode. A production build that needs immediate
  timing, such as the one the verification harness runs, sets it explicitly.
- **FR-005**: A value other than `immediate` or `batch` MUST fail startup with an error that names the setting. The
  application MUST NOT fall back to either timing.
- **FR-006**: With telemetry off, the setting MUST have no effect. A supplied value MUST still be a recognized one,
  as the existing rule for telemetry settings supplied while telemetry is off requires.
- **FR-007**: The one setting MUST govern server traces, server logs, and browser traces together. There MUST be no
  per-signal or per-process timing.
- **FR-008**: Metric export MUST keep its existing periodic interval under both timings.

#### What must not change

- **FR-009**: Apart from the time at which records leave the process, exported telemetry MUST be the same under both
  timings: the same signals, record names, attributes, resource attributes, collector endpoint, protocol, and
  collector headers. The feature MUST NOT add or change a signal, an attribute, or a resource attribute.
- **FR-010**: Every exclusion applied before export today MUST apply under both timings: the removal of query strings
  from server records, the browser export filter, and the limits on resource attributes. No value in a forbidden
  [data class](../../docs/observability.md#data-classes) may be exported under either timing.
- **FR-011**: Each record MUST be exported once under either timing. A change of timing MUST NOT duplicate or drop
  records that an orderly run produces.
- **FR-012**: Delivery MUST stay best-effort under both timings. A collector that is unreachable, slow, or rejecting
  MUST NOT change how the server handles a request or what a user can see or do in a page.

#### Browser tracing

- **FR-013**: When browser tracing is effective, the page MUST export with the server's effective timing. The page
  MUST NOT choose its own timing.
- **FR-014**: The page MAY receive the effective export timing as one more non-secret configuration value beside the
  four it receives today. It MUST receive no other new telemetry setting. With browser tracing off, the page MUST
  receive no telemetry configuration, as today.

#### Operating modes

- **FR-015**: A production process MUST batch by default. Production configuration never sets `immediate`.
- **FR-016**: Local development MUST export immediately by default. The verification harness's documented environment
  MUST put `immediate` in effect for the production build it runs.
- **FR-017**: Every CI workflow that starts the application or runs a test suite MUST run with telemetry off. In CI,
  no telemetry starts and no export request is made.

#### Telemetry for test runs

- **FR-018**: There MUST be one supported command or environment switch that, on its own in an environment holding no
  other telemetry setting, makes a test run export traces and logs to the local stack with immediate timing.
- **FR-019**: The switch MUST work for requirements BDD, including its smoke suite, and for the unit and integration
  suites of the workspaces that make up the instrumented application process. For the unit and integration suites,
  the exported records are the traces and logs produced by the code those tests exercise. Test processes start
  telemetry only behind the switch.
- **FR-020**: Without the switch, a test run's telemetry behavior MUST be what it is today: unit and integration test
  processes start no telemetry, and an application process a suite owns follows its environment.
- **FR-021**: Telemetry settings supplied explicitly alongside the switch MUST take precedence over the switch's
  local defaults. When the telemetry off switch is also set, telemetry MUST stay off.
- **FR-022**: Turning telemetry on for a test run MUST NOT change any test's result, whether or not the local stack
  is reachable.
- **FR-023**: A test run's records MUST be selectable apart from other telemetry in the local stack. The run MUST
  accept a revision and a run identifier by the means the verification harness already uses, and the documentation
  MUST say how to select a run's records.

#### Delivery at exit

- **FR-024**: When a server process stops in an orderly way, the trace and log records it has not yet sent MUST be
  delivered before it ends, under both timings.
- **FR-025**: When a test run with telemetry on finishes, every record it produced MUST have left its processes
  before the run's command returns.
- **FR-026**: When a page is hidden or navigates away, records made just before MUST still be sent under both
  timings, as today.
- **FR-027**: An unreachable collector MUST NOT keep a stopping process from ending.

#### Documentation and configuration

- **FR-028**: `docs/observability.md` MUST state the three operating modes once: production (telemetry on, batch),
  local development and verification (telemetry on, immediate), and CI (telemetry off). It MUST state what selects
  each, the setting's name, values, and defaults, that metrics keep their periodic interval, and that immediate
  timing is for local feedback and is assumed never to be set in production.
- **FR-029**: The local services documentation, the verification harness documentation, the verifier's instructions,
  the test guides, and the committed environment example MUST agree with that section and link to it instead of
  restating it. Guidance to wait for a batch interval before a query MUST be replaced where immediate timing makes
  it unnecessary.
- **FR-030**: The CI configuration MUST state its telemetry mode where it sets it, so the off mode is set by its
  owner and not by an accident of missing settings.

### Acknowledged limitations

- **L1**: Durable tests do not assert spans, log records, or exporter wiring. Exported telemetry is observed by the
  verification agent, as [Testing as evidence](../../docs/engineering/testing/README.md#observe-telemetry-do-not-test-it)
  requires. Durable tests cover only how the setting and the test-telemetry switch are decoded.
- **L2**: A process that is killed or crashes, and a page that closes abruptly, may lose records not yet sent, under
  either timing.
- **L3**: Immediate timing sends one export request per record. It is meant for local feedback loops. The
  application does not refuse it in a production build.
- **L4**: How fast the local stack makes a delivered record queryable is outside this feature. The 10-second bound
  in User Story 1 includes it.
- **L5**: No deployed environment is observed. Production behavior is established only for a production-mode build
  running locally.

### Key Entities

- **Export timing**: `immediate` or `batch`. The time at which finished trace records and emitted log records leave
  a process.
- **Export-timing setting**: `TELEMETRY_EXPORT_TIMING`, the one runtime setting that selects the export timing, with
  a default that depends on the process's mode.
- **Operating mode**: One of production (telemetry on, batch), local development and verification (telemetry on,
  immediate), and CI (telemetry off).
- **Test-telemetry switch**: The one supported command or environment switch that turns telemetry on for a test run.
- **Local stack**: The repository's local collector and its trace, log, and metric stores.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: With immediate timing, for every one of at least five sampled server requests, the request's trace
  records and a log record leave the server process within 1 second of the response.
- **SC-002**: With immediate timing and the local stack, a verifier finds a sampled request's trace and log records
  within 10 seconds of the response, in 100% of at least five samples, without a batch-interval wait.
- **SC-003**: With browser tracing effective and immediate timing, every sampled browser record leaves the page
  within 1 second of the interaction that produced it, and the verifier no longer keeps a page open for 30 seconds
  before querying.
- **SC-004**: A production-mode process with no export-timing setting sends a burst of 20 requests' trace records in
  fewer than 20 export requests, as it does before this feature.
- **SC-005**: The same journey run under each timing yields the same set of record names, attribute names, and
  resource attributes, and inspection of every exported field of both runs finds zero forbidden values.
- **SC-006**: Under the CI configuration, the application and every test suite make zero export requests.
- **SC-007**: With the one test-telemetry switch and no other telemetry setting, a run of each suite kind (unit,
  integration, requirements BDD) is queryable in the local stack within 10 seconds of its command returning.
- **SC-008**: A selection of tests has identical results with the switch off, with the switch on, and with the switch
  on while the local stack is unreachable.
- **SC-009**: Under each timing, a server process stopped in an orderly way within 1 second of a request delivers
  100% of that request's trace and log records.
- **SC-010**: A developer following only the repository documentation, from a clean checkout, observes immediate
  export locally, and finds the three operating modes stated in one section.

## Assumptions

- **The setting's name and values are decided here**, as the issue asks: `TELEMETRY_EXPORT_TIMING` with `immediate`
  and `batch`. The name carries no `OTEL_` prefix because that prefix belongs to OpenTelemetry's own settings, and
  this is an application setting, like the existing browser-tracing switch.
- **Immediate timing is assumed never to be set in production.** Production batches by default, and production
  configuration never sets `immediate`. The application does not refuse `immediate` in a production build, because
  the verification harness runs a production build and needs it. This matches how
  [browser tracing](../../docs/observability.md#browser-tracing-switch) is treated.
- A process's mode is the one the application already derives at startup: production, development, or test. This
  feature adds no new notion of environment.
- "Leaves the process within 1 second" and "found within 10 seconds" are the bounds that make "immediate" testable.
  They are observation bounds for a local run, not performance promises for a deployed environment.
- An orderly stop is one the process is told about and completes, such as a termination signal or a test run
  finishing. A kill, a crash, and an abruptly closed page are not orderly.
- Metrics stay periodic because the issue scopes the setting to traces and logs for the server and to traces for the
  browser.
- The form of the test-telemetry switch (a command or an environment switch) and its name are engineering-plan
  decisions. This specification requires only that there is one, that it is sufficient on its own, and that it is
  documented.
- The suites of workspaces with no telemetry of their own, such as the domain schema tests and the backend smoke
  test, accept the switch and export nothing. `packages/backend` instrumentation does not exist and is not added.
- Delivery stays best-effort, as the existing
  [startup and export policy](../../docs/observability.md#startup-and-export-policy) says.

## Delivery Authority and Scope _(mandatory)_

**Delivery issue**: [#475 — Make telemetry export timing configurable for agent and developer feedback loops](https://github.com/PathableAI-org/Pre-ETS/issues/475),
read in its open state on 2026-11-15.

**Originating delivery slice**: None. The issue's Delivery plan section says "Not yet planned", and it is not a slice
of a reviewed delivery plan. It is engineering and tooling work behind the existing observability strategy
(Authority finding 1). Current `origin/main` was inspected at `6c326576bde033ee13cd85d283743c8367927405`.

**Risk tier**: High, new behavior, trigger 4, as the header states and as the issue's Risk tier section records.

### Accepted requirement coverage

| Requirement | Acceptance criteria in this slice | Feature disposition                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| None        | None                              | No durable requirement covers telemetry export timing. The feature adds no stakeholder-observable product behavior and changes no signal, attribute, or resource attribute. Its authority is the issue, constrained by [Observability](https://github.com/PathableAI-org/Pre-ETS/blob/6c326576bde033ee13cd85d283743c8367927405/docs/observability.md). The decision that no requirement entry is needed is in Authority finding 1. |

Related constraints, not coverage claims: the
[data classes](https://github.com/PathableAI-org/Pre-ETS/blob/6c326576bde033ee13cd85d283743c8367927405/docs/observability.md#data-classes),
the existing export exclusions in
[Required span attributes and redaction](https://github.com/PathableAI-org/Pre-ETS/blob/6c326576bde033ee13cd85d283743c8367927405/docs/observability.md#required-span-attributes-and-redaction)
and [Browser export](https://github.com/PathableAI-org/Pre-ETS/blob/6c326576bde033ee13cd85d283743c8367927405/docs/observability.md#browser-export),
and [Observe telemetry, do not test it](https://github.com/PathableAI-org/Pre-ETS/blob/6c326576bde033ee13cd85d283743c8367927405/docs/engineering/testing/README.md#observe-telemetry-do-not-test-it).

### Authorized outcome

Telemetry export timing becomes a configuration choice. Agents and developers get traces and logs exported
immediately while they work, in the server and in the browser. Production keeps batching. CI runs with telemetry off.
Any test run can turn telemetry on with one documented command or switch, and pending records are delivered when a
process exits in an orderly way.

### In scope

- One export-timing setting for server traces, server logs, and browser traces, with `immediate` and `batch`.
- Defaults by operating mode: batch in production, immediate in local development and for the verification harness,
  telemetry off in CI.
- One supported command or environment switch that runs any test suite with telemetry on.
- Delivery of pending records at an orderly exit under both timings.
- Updates to `docs/observability.md`, the local services and verification harness documentation, the test guides,
  the committed environment example, and the CI configuration, so the three modes are stated once by their owner.
- Module tests of how the setting and the switch are decoded.

### Out of scope

- New signals, attributes, resource attributes, or metrics, and any change to the data classes forbidden from
  telemetry.
- Changing the telemetry backends or the local stack.
- Tail sampling, sampling-rate changes, or other production tuning beyond keeping today's batch behavior.
- A timing choice for metrics, per-signal timing, and per-process timing.
- Instrumentation for `packages/backend`.
- Durable tests that assert telemetry output or exporter wiring.
- A refusal of `immediate` in production builds.

### Dependencies and blockers

- The observability runtime, browser tracing, and the verification harness are on `main`. Not blockers.
- None blocking.

### Authority findings

1. **No durable requirement or delivery-plan slice (resolved on 2026-11-15).**
   - _Source_: Issue #475, Requirements: "No durable requirement covers this ... The specification must say so
     explicitly and name the maintainer's decision on whether a requirement entry is needed." The `speckit-specify`
     intake gate, which expects a delivery-plan slice and accepted requirements.
   - _Ambiguity_: Whether engineering and tooling work with no requirement may proceed on the issue's authority alone,
     or needs a requirement entry first. None remaining.
   - _Impact_: Claims trace to the issue's scope and to `docs/observability.md`, not to requirement IDs. No
     requirements BDD applies.
   - _Decision required_: None. **No requirement entry is needed.** This was decided in the specification session's
     clarification on 2026-11-15 (Clarifications, first answer). Approving this specification confirms it as the
     maintainer's decision.
   - _Proposals_: (A) No requirement entry; issue #475 and `docs/observability.md` are the authority, as for the
     browser-tracing feature (**chosen**). (B) A requirement entry is authored through the requirements workflow
     first, and this feature stops until it is accepted (not chosen).
2. **Trigger 3's path list (informational, not blocking).**
   - _Source_: Issue #475, Risk tier, which names trigger 4 and lists a startup-configuration file among the changed
     paths. The [Git workflow's triggers](../../docs/engineering/git-workflow.md#triggers), whose trigger 3 counts
     changes under the frontend services' configuration directory.
   - _Ambiguity_: Whether the issue should also record trigger 3.
   - _Impact_: None on process. The tier is High either way, and the feature changes no authentication, session,
     authorization, or tenant-binding behavior.
   - _Decision required_: None for this specification. The maintainer may record trigger 3 on the issue. This session
     does not edit the issue.
   - _Proposals_: (A) Leave the issue as published. (B) The maintainer adds trigger 3 to the issue's Risk tier
     section.
