# Research: Configurable Telemetry Export Timing

**Plan**: [plan.md](plan.md)

**Inputs**: [spec.md](spec.md) and [verification.md](verification.md) at spec commit `371a385`, with the V-012
correction of `136548c`; `origin/main` at
`6c32657`; installed packages `effect` 4.1.4, `@effect/opentelemetry` 4.1.4, `@effect/vitest` (catalog),
`@opentelemetry/sdk-trace-base` 2.12.0 (a shim over `@opentelemetry/sdk-trace` 2.12.0), `sdk-logs` 0.223.0,
`otlp-exporter-base` 0.223.0, `sdk-trace-web` 2.12.0, `next` 16.4.6, and `vitest` 5.1.0.

Every decision below was checked against the installed declarations or source, not against documentation from
memory. An open Renovate branch (`renovate/opentelemetry-stack`) may move these versions; the implementation session
re-checks the named behaviors if it lands first.

## Probes

Six transient probes ran on 2026-11-15 against the code at `371a385`, which equals `origin/main` for every package.
They used a production build (`next start`) with the repository's synthetic `springfield` tenant, local Redis, and a
temporary loopback receiver that recorded only each export request's arrival time, path, and size. Probes P3 and P4
used a temporary, uncommitted change to `src/observability/sdk.ts` that selected the simple processors from a probe
variable. The change, the receiver, and two scratch test files were removed, and `git status` showed only this
feature's files afterwards. Nothing from the probes is committed. They are feasibility evidence for the design, not
verification of any claim.

| Probe | What was run                                                                                          | Observation                                                                                                                                                                                              |
| ----- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1    | `Config.option(Config.Literals(["immediate", "batch"], "TELEMETRY_EXPORT_TIMING"))` with eight values | Absent and empty decode to none. `immediate` and `batch` decode. `Immediate`, `BATCH`, a padded value, and `now` fail with an error that names `TELEMETRY_EXPORT_TIMING`.                                |
| P2    | Base revision, batch: one request, then `SIGTERM` 0.3 s after the response                            | The process exited with code 143 after 23 ms and the receiver got **no** export request. With `NEXT_MANUAL_SIG_HANDLE=true` it exited with code 0 after 28 ms and the trace export arrived first.        |
| P3    | Simple span and log processors, `LOG_LEVEL=Debug`: three requests three seconds apart, then a burst   | Each request produced 7 trace export requests and 1 log export request, all within about 1 ms of the response. A burst of 20 requests produced 140 trace export requests; batch produced 1.              |
| P4    | The same burst with the exporter's `concurrencyLimit` set to 2                                        | 31 of 140 trace export requests arrived. The exporter drops a record when its in-flight limit is reached.                                                                                                |
| P5    | No listener on the collector address, then `SIGTERM` (manual signal handling), under each processor   | Every response was unchanged. The process exited with code 0 after 3.0 s, the Effect OpenTelemetry layer's shutdown timeout.                                                                             |
| P6    | Two Vitest files providing a context built from `observabilityLayer`, disposed in `afterAll`          | A span and a log from an `it.effect` test and from a plain `Effect.runPromise` test of each file were at the receiver when the command returned. With no listener the tests passed, 3 s slower per file. |
| P7    | `pnpm test:telemetry` over a live-clock unit suite, an `it.effect` suite, and the integration suites  | The live-clock suite's spans were listed by the trace search about 30 s after the return, and by trace ID from its log record at once. No span of the `it.effect` suite was listed. Details below.       |

`next dev` was probed once under batch: `SIGTERM` ended it with code 0 after about 0.1 s and the pending trace, log,
and metric exports arrived, without manual signal handling.

A seventh probe, P7, ran on 2026-11-16 as a plan correction, after the implementation session found during slice
E that the spans of `tests/lib/session.test.ts` could not be found in the local stack by time. P6 had observed the
receiver only. P7 ran at the slice E head `1ae2b82` in a detached worktree, with local Redis, the local stack
(`grafana/otel-lgtm` 0.41.0, Tempo 3.1.1), and a loopback receiver that recorded each request's arrival time, path,
and size and forwarded it to the stack. The worktree and the receiver were removed afterwards and nothing from the
probe is committed. Its details:

- **Clock.** Effect stamps a span's start and end, and a log record, from the fiber's `Clock`, and `it.effect`
  provides `TestClock`, which starts at 1970 and which `tests/lib/session.test.ts` sets to January 2027. No span of
  that run was listed in the default search range, in the run's hour, or in the days those two times name. The
  session integration suite runs its `readAt` and `refreshAt` programs under a fixed `Clock`. The probe did not
  identify the 22 of its 114 spans that were not listed, which is what those programs would explain; its
  `SessionService.establish` spans run under the wall clock and were listed.
- **Search delay.** A trace search by the run identifier listed the live-clock spans 30.6 to 31.2 s after the unit
  command returned (four runs) and 28.1 to 28.2 s after the integration command returned (two runs). The stack's
  Tempo reports `max_trace_live: 30s` and `max_block_duration: 30s`, which matches; the probe did not change them.
  A lookup by trace ID answered while a search naming the same trace ID was still empty.
- **Log records.** The live-clock unit suite emits two `Tenant configuration request failed` warnings, each with the
  trace ID of its `TenantConfigService.getConfigFromAlias` span and the run's `service.instance.id`. A test process
  does not apply `LOG_LEVEL`, so the debug record of T-002 is not emitted there. `tests/lib/session.test.ts` and
  the integration suites sent no log export.

The search-delay finding is the basis of a specification rule. The specification's correction of 2026-11-16 (spec L4
and SC-007; `verification.md` V-012 and L-stack) keeps the 10-second bound for a record the verifier reaches
directly, and bounds a record only a trace search can reach by the search delay the trace store reports: found
within 10 seconds after that delay has passed, counted from the command's return. In this plan only the integration
selection of V-012 is reached by search alone, because the integration suites send no log export. The verifier reads
the delay from Tempo's effective configuration, which reports the two values P7 recorded. On 2026-11-16 a read of
`/status/config` through the Tempo datasource of the local stack's Grafana, as the anonymous viewer, returned
`max_trace_live: 30s` and `max_block_duration: 30s` under `live_store` for the pinned image; only the `otel-lgtm`
container ran, no application or test did, and nothing was changed. P7 did not separate the two values, so the
[quickstart](quickstart.md#telemetry-queries) takes the larger as the reported delay. The verification reports of
slices A and B show the direct reads the other 10-second claims use: the trace ID of the `traceparent` the verifier
sent (V-003), and the trace ID of the `traceparent` on the RSC request a router navigation sends (V-004).

## Decisions

### D1 — Setting decoding and the default rule

- **Decision**: `config/otel.ts` reads the setting as an optional `Config.Literals` of `immediate` and `batch` in
  its one `Config.all`. The effective timing is the supplied value, or `batch` when the decoded `NODE_ENV` is
  `production` and `immediate` otherwise. `config.ts` passes its existing `NODE_ENV` recipe
  to the child builder, as it already passes `withoutEcho`. `OtelEnabled.exportTiming` holds the effective value.
- **Rationale**: The process's mode is the one `StartupConfig` already derives (spec Assumptions), and an absent
  `NODE_ENV` already means development. The raw recipe decodes before the disabled branch, so an unrecognized value
  fails startup with telemetry off too, as `BROWSER_TRACING_ENABLED` does today (FR-006). P1 shows the decoder is
  case-sensitive and names the setting (FR-005).
- **Empty value**: An empty `TELEMETRY_EXPORT_TIMING` counts as absent. That is how `ConfigProvider.fromEnv` treats
  every other setting, including `OTEL_SDK_DISABLED` (P1). The specification leaves this to the plan.
- **Alternatives considered**: A second `Config.map` over the whole `StartupConfig` (changes the shape every consumer
  reads). Reading `NODE_ENV` in `observability.ts` (a second environment read, which lint forbids). `Config.orElse`
  to a default on a bad value (forbidden by the Effect guidance, and by FR-005).

### D2 — The server's immediate pipeline

- **Decision**: `observability/sdk.ts` picks the span and log processors from `settings.exportTiming`. `batch`
  constructs exactly what it constructs today. `immediate` constructs `SimpleSpanProcessor` (from
  `@opentelemetry/sdk-trace-base`, single-exporter constructor) and `SimpleLogRecordProcessor({ exporter })` (from
  `@opentelemetry/sdk-logs`) over the same OTLP protobuf exporters and URLs. `QueryFreeSpanProcessor` wraps either
  span processor. The same two processors still feed both the global Node SDK and the Effect bridge.
- **Rationale**: The simple processors export each record in `onEnd` or `onEmit`, which is FR-002 and the "one export
  request per record" of spec L3. Everything before the processor is shared, so query removal, the resource, the
  endpoint, and the headers cannot differ between timings (FR-009, FR-010). Both simple processors export through
  `internal._export`, which suppresses tracing of the exporter's own HTTP request, so there is no export loop (P3
  showed a stable 7 per request).
- **Alternatives considered**: A batch processor with a very short delay (groups records that finish together, which
  the specification's edge case rules out). Setting `OTEL_BSP_*` variables (not a single setting, and logs and the
  browser would not follow). A second export path beside the batch one (forbidden by the observability scope).

### D3 — No in-flight export limit under immediate timing

- **Decision**: Under `immediate`, each OTLP exporter is constructed with an unbounded `concurrencyLimit`
  (`Number.POSITIVE_INFINITY`), in the server and in the browser. Under `batch` the exporters keep the SDK default.
- **Rationale**: The OTLP export delegate fails an export with "Concurrent export limit reached" when 30 requests
  are in flight, and the simple processors do not retry. P4 shows records are silently dropped at the limit. A page
  that replays up to 256 buffered facts in one tick would reach 30 with any collector. FR-011 forbids dropping
  records of an orderly run. Immediate timing is a local feedback mode with no throughput promise (spec L3), and each
  export still ends at the exporter's own timeout, so pending requests stay bounded in time.
- **Alternatives considered**: Keeping 30 (drops on a burst or a slow collector). A queue in front of the exporter
  (a second batching mechanism).

### D4 — Metrics are untouched

- **Decision**: The two `PeriodicExportingMetricReader`s are constructed as today under both timings (FR-008).

### D5 — Delivery at an orderly stop

- **Finding**: At the base revision a production server loses every pending record on `SIGTERM` (P2). Next registers
  its own `SIGTERM` and `SIGINT` handlers before `instrumentation.ts` runs. Its handler closes the server and calls
  `process.exit(143)` about 25 ms later, while `startProductionRuntime`'s handler is still disposing the runtime.
  Disposal is what flushes: the Effect OpenTelemetry layers release with `forceFlush()` then `shutdown()`, each
  bounded by a 3-second timeout, and the OTLP exporter's `shutdown` awaits its in-flight requests.
- **Decision**: The production server runs with Next's documented manual signal handling,
  `NEXT_MANUAL_SIG_HANDLE=true`, so `startProductionRuntime`'s existing handler is the only one. Next reads the
  variable before it loads `instrumentation.ts`, and its self-hosting guide says to set it in the package script, not
  in an `.env` file. So the frontend workspace's `start` script sets it, and the BDD harness, which spawns `next`
  directly, sets it in the owned process's environment. The handler keeps its order (dispose, then exit with code 0)
  and gains a deadline, the existing 10-second fatal bound, after which it exits anyway.
- **Rationale**: This is the supported mechanism, it needs no new signal code, and P2 and P5 show it delivers under
  batch and still ends within about 3 seconds when the collector is unreachable (FR-024, FR-027). The deadline covers
  a disposal that hangs for a reason other than telemetry. `next dev` already delivers on `SIGTERM` and does not
  support the variable, so the `dev` script is unchanged.
- **Consequences**: A production server stopped by `SIGTERM` now exits with code 0, not 143, and Next no longer
  closes the HTTP listener before the process exits. The runtime's disposal is the whole shutdown, as it already was
  for `SIGINT` in practice. A launcher that starts `next start` without the variable keeps today's behavior (plan
  limitation L-1).
- **Alternatives considered**: Removing Next's listeners from our handler (reaches into the host's internals).
  Flushing on a timer before any signal (cannot cover the last records). Setting the variable in
  `instrumentation.ts` (too late: Next has already registered its handlers).

### D6 — The browser follows the server's timing

- **Decision**: `BrowserTracingSettings` and the rendered `preets-browser-tracing` JSON gain one value,
  `exportTiming`, copied from the server's effective timing. The shared facade validates it as `immediate` or
  `batch` beside the four existing checks; a document without a valid value starts no tracing. The lazy SDK module
  constructs `SimpleSpanProcessor` or `BatchSpanProcessor` over the same `filterExport(new OTLPTraceExporter(…))`.
  The existing `pagehide` flush stays.
- **Empty exports**: `filterExport` answers success without calling the exporter when no span remains after
  filtering. With one export per span, every dropped `resourceFetch` span would otherwise send a request with no
  records. This applies under both timings and changes no exported record.
- **Rationale**: The page cannot choose its own timing because the value comes only from the rendered document
  (FR-013, FR-014). The filter wraps the exporter, so it runs under both processors (FR-010). The OTLP fetch
  transport already sends with `keepalive` while the browser's limits allow (nine pending requests, 64 KiB in
  total), so a record made just before a navigation is in a keepalive request (FR-026, plan limitation L-2).
- **Alternatives considered**: A browser-only setting (FR-007 forbids per-process timing). Deriving the timing in the
  page from the host name or build mode (the page would choose).

### D7 — One command turns telemetry on for a test run

- **Decision**: The switch is a command, `pnpm test:telemetry <test command>`. A root script computes the run's
  environment and runs the given command with it. Unless `OTEL_SDK_DISABLED` holds one of the application's true
  literals, it fills in what is absent or empty: `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318/`,
  `OTEL_SERVICE_NAME=pre-ets-frontend`, `TELEMETRY_EXPORT_TIMING=immediate`, and a generated
  `service.instance.id=<uuid>` entry appended to `OTEL_RESOURCE_ATTRIBUTES` when that list has none. It sets the
  marker `TEST_TELEMETRY=true`, prints the run identifier on standard error, and exits with the command's status.
  With the off switch set it runs the command with the environment unchanged.
- **Rationale**: Requirements BDD spawns an application process that inherits the environment, so the defaults alone
  make it export; no harness logic is needed. Unit and integration test processes need a marker that only the
  command sets, so a shell that happens to hold `OTEL_*` values does not start telemetry (FR-020). Computing the
  defaults in one place avoids a second copy in the BDD support code and in the frontend-services tests. Explicit
  values win because only absent values are filled (FR-021). The generated identifier makes every run selectable
  without extra input, and a supplied revision and run identifier pass through unchanged (FR-023).
- **Alternatives considered**: An environment switch read separately by the BDD harness and by the Vitest helper
  (two owners of the same defaults in two workspaces). A switch inside the application's `StartupConfig` (a test
  concern in product configuration).

### D8 — How unit and integration tests export

- **Finding**: Effect 4.1.4 has no process-wide tracer or logger. `Tracer.Tracer` and `CurrentLoggers` are context
  references whose defaults are the native tracer and the default loggers, and `Effect.runPromise`,
  `ManagedRuntime`, and `@effect/vitest`'s `it.effect` each start from the context the test provides. A test
  process therefore exports only spans and logs of programs that are given the OpenTelemetry services.
- **Decision**: A frontend-services test helper, `tests/helpers/telemetry.ts`, exports one layer, `testTelemetry`.
  Without the marker it is `Layer.empty`. With it, the helper builds the product's own `observabilityLayer` once per
  test file from a plain settings object (endpoint, service name, version, and timing from the environment the
  command prepared), exposes the resulting context as the layer, and disposes it in a file-level `afterAll`. A
  failure to build yields the empty layer. Each suite file adds `testTelemetry` where it already builds its layers:
  the shared `sessionWorld`, each file's layer factory, and each mocked `Runtime.runPromise`.
- **Rationale**: P6 shows this exports from every way the suites run effects, delivers before the command returns
  (FR-025), and leaves results unchanged when the collector is down (FR-022). It reuses the application's pipeline,
  so query removal and the resource rules apply to test telemetry too. Building from a plain object follows the
  guidance that only the config tests decode the environment.
- **Consequences**: A test that runs no program through one of those points exports nothing, which is the
  specification's edge case for code that produces no telemetry (plan limitation L-3). With the collector down each
  test file ends about 3 seconds later. A record carries the time of the clock its program runs under, so a test
  under `TestClock` or a fixed `Clock` exports records the local stack does not show in the run's time range (plan
  limitation L-5, P7).
- **Alternatives considered**: Aliasing `@effect/vitest` in the Vitest configuration (misses `Effect.runPromise` and
  `ManagedRuntime` tests). Patching the tracer reference's cached default (relies on Effect internals). Starting
  only the global Node SDK (exports no Effect span or log).

### D9 — CI states its mode

- **Decision**: `ci-quality.yml`, `ci-build.yml`, and `ci-bdd.yml` set `OTEL_SDK_DISABLED: "true"` in their
  workflow-level `env` block with a comment that names the CI mode. `ci-bdd.yml` drops its `GITHUB_ENV` line.
  `ci-fallow.yml` starts no application and runs no suite, so it is unchanged.
- **Rationale**: FR-030 asks for the mode where the workflow sets its environment. The workflow-level block is that
  place, and it covers steps added later.

### D10 — Documentation owners

- **Decision**: `docs/observability.md` gains one "Operating modes" section (FR-028) and loses its batch-wait
  guidance where immediate timing makes it unnecessary. `docs/docker-compose.md`,
  `docs/engineering/verification-harness.md`, the verifier skill, `features/README.md`,
  `docs/engineering/testing/README.md`, and `packages/frontend/.env.example` link to that section (FR-029). Each
  slice documents the behavior it adds; the last slice adds the modes section and removes the remaining waits.

### D11 — What the verifier samples

- **Decision**: No signal is added. The sampled trace record is the existing HTTP server span of a request. The
  sampled log record is the existing `Reading tenant configuration` record, which
  `TenantConfigService.getConfigFromAlias` emits at debug level on every tenant-resolving request. Verification
  starts the application with `LOG_LEVEL=Debug` so each sampled request emits one (P3). Test-run records are the
  existing `Effect.fn` spans of the exercised services, sampled from programs that run under the wall clock, and
  for the unit selection the existing `Tenant configuration request failed` warning, whose trace ID gives a lookup
  that does not wait for the trace search (P7). The integration selection has no such record and is found by the
  trace search, within the bound the corrected specification sets from the trace store's reported search delay.
- **Rationale**: The specification forbids new signals, and `verification.md` says a missing observation would be a
  specification finding. Every harness observation it lists is available from existing records.

### D12 — Dependencies

- **Decision**: No new package for the server. `SimpleSpanProcessor` and `SimpleLogRecordProcessor` ship in packages
  both workspaces already depend on. The browser's empty-export answer needs the export result code, which lives in
  `@opentelemetry/core`; that package is installed transitively but is not a direct dependency of
  `packages/frontend`. Whether to add it from the `opentelemetry` catalog is an implementation choice
  ([modules.md](contracts/modules.md#implementation-choices-left-to-tasks)).
