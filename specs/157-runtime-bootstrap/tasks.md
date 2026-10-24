# Tasks: Deterministic Application Bootstrap and Runtime Composition

**Input**: [spec.md](spec.md), [verification.md](verification.md), [plan.md](plan.md),
[research.md](research.md), [data-model.md](data-model.md), [module contracts](contracts/modules.md),
[quickstart.md](quickstart.md), and `.specify/memory/constitution.md`.

**Branch**: `157-runtime-bootstrap-impl` · **Delivery**: None — maintainer exception recorded in `spec.md` on
2026-10-24 · **Design revision**: `f933c77ad418754bb29cf5dfd9f7359f8705a19b`

**Status**: Planned implementation work. Every task remains unchecked until its stated behavior or evidence has been
completed at an identified implementation revision. Passing static checks does not establish runtime bootstrap behavior.
Planned commands are not executed evidence.

**Tests**: Required where [verification.md](verification.md) names durable, manual, or transient evidence. Write the
named public-boundary examples before the implementation they protect, observe a meaningful failing result, and then
make them pass. Do not add durable assertions of standard-error text, log records, spans, span attributes, metrics,
exporter calls, telemetry payloads, or pipeline internals (FR-027, FR-028). Do not add bootstrap lifecycle scenarios
to requirements BDD.

**Scope**: Ordered frontend startup, explicit readiness, bounded fatal exit, progressive observability, one validated
process-wide startup value, and preserved tenant, authentication, session, persistence, and HTTP outcomes. Do not
invent a delivery issue. Do not edit `spec.md`, `verification.md`, `plan.md`, `contracts/modules.md`, `research.md`,
`data-model.md`, `quickstart.md`, requirements, or delivery plans. The constitution's four-part Principle I form is
waiting on the maintainer and is not an implementation task.

## Format and execution conventions

`- [ ] Tnnn [P?] [USn?] Action with exact paths`

- Paths are repository-relative. New paths named below are intentional. Do not add a workspace, a second
  `ManagedRuntime`, a health-check service, a test-only production constructor, or a secrets provider.
- `[P]` means different files and no dependency on another unfinished task. It never authorizes concurrent edits to
  a shared file.
- Tests and production consumers import public parents only: `packages/frontend/src/lib/config/index.ts`,
  `packages/frontend/src/lib/authentication.ts`, `packages/frontend/src/lib/observability.ts`,
  `packages/frontend/src/lib/runtime.ts`, `packages/frontend/src/lib/session.ts`, and
  `packages/frontend/src/lib/tenant.ts`. Only the owning parent imports its children. `observability/http.ts` stays
  private.
- Before Effect edits, read `docs/engineering/effect-guidance.md`, `packages/frontend/AGENTS.md`, the available
  Effect v4 checkout's `LLMS.md`, and only the linked examples needed for Config, Layer, ManagedRuntime, and
  Logger. Installed `packages/frontend/node_modules` declarations govern. Do not use local Effect checkout
  `41cf29b5d85af7fc25bcc7713f2e05142edaa66a` as the API source.
- Before test edits, read `docs/engineering/testing/README.md`. Before the selection property, also read
  `docs/engineering/testing/property-based-testing.md`. Requirements BDD work also reads
  `docs/engineering/testing/requirements-bdd.md`, refreshes current `origin/main`, and uses
  `requirements-bdd-author`, `requirements-bdd-scaffold`, and `requirements-bdd-review` only if a feature file
  actually changes. This plan does not authorize new bootstrap scenarios.
- Use synthetic fixtures only. Never retain PHI, production credentials, tokens, cookies, authorization headers,
  collector secrets, or tenant file bodies.
- Do not add check-disable comments or suppressions. Do not commit generated output, temporary probes, credentials,
  or verification transcripts.
- A trailing newline on the fixed diagnostic sentence is optional. The stage, reason, and signal tokens are not.

## Phase 1: Declaration inspection

**Purpose**: Reconfirm the installed APIs in [research.md](research.md) before adding exporters or editing bootstrap.
No story label. Requirements and the specification stay read-only.

- [x] T001 Inspect the installed declarations under `packages/frontend/node_modules` against the "Installed declarations checked" table in `specs/157-runtime-bootstrap/research.md`. Confirm `effect@4.0.5` (`ManagedRuntime.make`, `runPromise`, `dispose`, `Layer.provide`, `ConfigProvider.fromEnvRecord`, `ConfigProvider.layer`, `Effect.timeout`, `Schema.TaggedError`, `Schema.URLFromString`, `Logger.layer`, `Logger.consoleJson`, `Logger.consolePretty`, `References.MinimumLogLevel`), `@effect/opentelemetry@4.0.5` (`NodeSdk.layer` inputs `spanProcessor`, `metricReader`, and `logRecordProcessor`; `OtelLogger.layer({ mergeWithExisting })`; release finalizer `provider.forceFlush().finally(() => provider.shutdown())` wrapped with `Effect.timeoutOption`; `NodeSdk.layer` does not call `provider.register()`), `@effect/platform-node@4.0.5` (`NodeRedis.layer(options)`), `@opentelemetry/sdk-trace-base@2.12.0` positional `BatchSpanProcessor(exporter, config?)`, `@opentelemetry/sdk-logs@0.223.0` `BatchLogRecordProcessor({ exporter, exportTimeoutMillis? })`, `@opentelemetry/sdk-metrics@2.12.0` `PeriodicExportingMetricReader` default interval 60000 and the throw when interval is shorter than timeout, `@opentelemetry/api@1.9.1` `diag.setLogger(logger, DiagLogLevel.ERROR)`, and `next@16.4.2` (`register()` completes before ready; `start-server.js` registers SIGTERM `process.exit(143)` and SIGINT `process.exit(130)` only when `NEXT_MANUAL_SIG_HANDLE` is unset). Stop and return to planning if a planned API is absent. Do not edit `research.md` or use the local Effect checkout.

- [x] T002 Add `@opentelemetry/exporter-logs-otlp-http@0.223.0`, `@opentelemetry/exporter-logs-otlp-proto@0.223.0`, `@opentelemetry/exporter-metrics-otlp-http@0.223.0`, and `@opentelemetry/exporter-metrics-otlp-proto@0.223.0` to `packages/frontend/package.json` with root `pnpm`, and update `pnpm-lock.yaml`. Do not add them to the `effect` catalog in `pnpm-workspace.yaml`. After install, confirm the installed `OTLPLogExporter` and `OTLPMetricExporter` constructors accept `{ url }` / `OTLPExporterNodeConfigBase`, matching the trace exporters already at 0.223.0. This realizes the research decision "Add the 0.223.0 OTLP log and metric exporters and drive them through `NodeSdk.layer`".

**Checkpoint**: Installed API truth matches the plan. A declaration mismatch is a planning blocker, not an
implementation-time invention.

## Phase 2: Foundational public contracts and evidence

**Purpose**: Establish the shared configuration, selection, and composition contracts that block every story.
Depends on T001–T002. Evidence is written to fail before the implementation that makes it pass.

### Failing public evidence

- [x] T003 [P] Extend `packages/frontend/tests/lib/otel-config.test.ts`, importing `OtelConfig` only from `packages/frontend/src/lib/config/index.ts`. Keep every existing traces success and failure case. Add examples that the new fields are `Option.none()` when unset or empty; a logs or metrics endpoint wins over the base endpoint for that signal's export URL; a base endpoint gains `/v1/logs` or `/v1/metrics` after one trailing slash is removed; `OTEL_SDK_DISABLED=true` still decodes, including a computed traces `exportUrl`; and empty strings stay unset. Do not check URL syntax. Cite the `OtelConfig` contract evidence "Disabled or unselected OTEL strings still decode" and V-006. The new examples fail until T007.

- [x] T004 [P] Create `packages/frontend/tests/lib/observability-selection.test.ts`, importing `selectObservability` and `ObservabilityInitializationError` only from `packages/frontend/src/lib/observability.ts`. Before writing the property, read `docs/engineering/testing/property-based-testing.md` and use the installed `@fast-check/vitest`. Cover the data-model selection rules: `disabled: true` ignores endpoint and protocol; exporter `none` ignores that signal's endpoint and protocol; neither a signal endpoint nor a base endpoint leaves the signal absent and ignores its protocol; an exporter other than `otlp` or `none` fails with `reason: "exporter"`; a selected `grpc` or other protocol outside `http/json` and `http/protobuf` fails with `reason: "protocol"`; a selected string that does not decode through `Schema.URLFromString` fails with `reason: "endpoint"`; the first failing signal in order `traces`, `metrics`, `logs` is the named signal. Include examples for selected `grpc`, selected `not a url`, and `OTEL_LOGS_EXPORTER=none` beside a valid base endpoint. Add a Fast-Check property: for arbitrary endpoint and protocol strings, `disabled: true` yields three absent signals, and exporter `none` yields that signal absent even when its endpoint is not a URL. A syntactically valid URL may succeed, and the test must not open a socket or assert an exporter call. Cite the observability contract evidence rows for disabled/unselected signals and selected invalid URL or protocol, plus V-004. The file fails until T008.

- [x] T005 [P] Extend `packages/frontend/tests/lib/config.test.ts`, importing `StartupConfig` and the existing `ServerConfig` only from `packages/frontend/src/lib/config/index.ts`. Keep the existing server-config success and failure cases, including missing `TENANT_CONFIG_DIR` and cross-field tenant rules. Add one `it.effect` that omits `TENANT_CONFIG_DIR` and expects `Config.ConfigError` from `StartupConfig`, plus the log-level default `Info` and an invalid `LOG_LEVEL` failure. `StartupConfig` must not accept a value when `ServerConfig`, `OtelConfig`, or log level fails, and it must not apply URL or protocol selection. Cite the config contract evidence "`StartupConfig` fails as one value when server config fails" and V-006. The new example fails until T009.

- [x] T006 [P] Create `packages/frontend/tests/lib/runtime-composition.test.ts`, importing `loadProcessStartup`, `applicationLayer`, and `Runtime` only from `packages/frontend/src/lib/runtime.ts`, and `AuthenticationProcessConfig` only from `packages/frontend/src/lib/authentication.ts`. Use `@effect/vitest`. Assert returned values, typed errors, and whether a substitute infrastructure layer's acquire effect runs. Do not call `startProductionRuntime`, do not assert `process.exit`, and do not assert logs, spans, metrics, or exporters. Cover: omitted `TENANT_CONFIG_DIR` fails decoding and the recording infrastructure acquire does not run; a provider with invalid `OIDC_CALLBACK_ORIGINS_JSON` fails through `AuthenticationProcessConfig` / `loadProcessStartup` and the substitute acquire does not run; `applicationLayer` with a selected `grpc` protocol does not run the recording infrastructure acquire; with OTEL disabled, a `Layer` Redis substitute, and `NodeServices` through the infrastructure argument, a public service result can be read without a web server or `process.exit`; a substitute `RedisError` is returned and the test continues. Also, with `NEXT_PHASE` unset, importing `packages/frontend/src/lib/runtime.ts` does not read startup configuration, `Runtime.runPromise` rejects `StartupNotReady`, and the effect body does not run. Cite the runtime and authentication contract-evidence rows, the instrumentation evidence "Importing the frontend graph during build does not validate runtime configuration", and V-006 plus the durable halves of V-001 and V-008. This import does not prove the Next.js build graph; T034 does. The file fails until T010 and T012. Do not cover `toNext` here; that example is T014.

### Shared contract implementation

- [x] T007 Implement the extended parser in `packages/frontend/src/lib/config/otel.ts` and export `OtelSettings` and `OtelConfig` through `packages/frontend/src/lib/config/index.ts`. Keep `export const ServerConfig`, `SessionKeyPrefix`, and the tenant config types unchanged. `OtelSettings` is exactly `{ disabled: boolean; endpoint: Option.Option<string>; exportUrl: Option.Option<string>; headers: Option.Option<string>; logsEndpoint: Option.Option<string>; logsExporter: Option.Option<string>; logsExportUrl: Option.Option<string>; logsProtocol: Option.Option<string>; metricsEndpoint: Option.Option<string>; metricsExporter: Option.Option<string>; metricsExportUrl: Option.Option<string>; metricsProtocol: Option.Option<string>; protocol: Option.Option<string>; serviceName: Option.Option<string>; tracesExporter: Option.Option<string>; tracesHeaders: Option.Option<string>; tracesProtocol: Option.Option<string> }`. `OtelConfig` treats empty strings as unset, parses `OTEL_SDK_DISABLED` with Effect boolean literals, and builds URL strings without checking that they are URLs. A traces endpoint wins over the base endpoint for `exportUrl` and `endpoint`. A logs or metrics endpoint wins over the base endpoint for that signal's export URL. A base endpoint gains `/v1/traces`, `/v1/metrics`, or `/v1/logs` after one trailing slash is removed. New fields are `Option.none()` when unset or empty. Tests import the parent only. Make T003 pass. Cite the `OtelConfig` contract and V-006.

- [x] T008 [P] Export `selectObservability` and `ObservabilityInitializationError` from `packages/frontend/src/lib/observability.ts` with the exact contract signatures. `OtlpHttpProtocol` is `"http/json" | "http/protobuf"`. `SelectedOtlpSignal` is `{ protocol: OtlpHttpProtocol; url: string }`. `ObservabilitySelection` has `logs`, `metrics`, and `traces` as `SelectedOtlpSignal | undefined`. The error tag is `"@pathableai/pre-ets-frontend/ObservabilityInitializationError"` with `reason: "endpoint" | "exporter" | "protocol"` and `signal: "logs" | "metrics" | "traces"`. `selectObservability` takes `Config.Success<typeof OtelConfig>` and returns `Effect.Effect<ObservabilitySelection, ObservabilityInitializationError>`. Decode selected endpoints with `Schema.decodeUnknown(Schema.URLFromString)`, not `Schema.URL`. Do not read `process.env`. Apply the data-model selection rules in order, and name the first failing signal in order `traces`, `metrics`, `logs`. An unreachable selected URL is a successful selection. Make T004 pass. Cite the observability contract and V-004. Exporter construction waits for T018.

- [x] T009 [P] Export `StartupConfig` from `packages/frontend/src/lib/config/index.ts` as `Config.Config<{ readonly logLevel: LogLevel.LogLevel; readonly otel: OtelSettings; readonly server: Config.Success<typeof ServerConfig> }>`. Log level comes from `LOG_LEVEL` and defaults to `Info`. `StartupConfig` fails when `ServerConfig`, `OtelConfig`, or log level fails. It does not apply URL or protocol selection. Make T005 pass. Cite the config contract and V-006.

- [x] T010 [P] Export `AuthenticationProcessConfig` from `packages/frontend/src/lib/authentication.ts` as `Config.Config<{ readonly credentials: Readonly<Record<string, string>>; readonly settings: { readonly allowInsecureLoopback: boolean; readonly callbackOrigins: Readonly<Record<string, URL>> }; readonly transactions: { readonly prefix: string; readonly ttlMilliseconds: number; readonly ttlSeconds: number } }>`. Compose the existing private decoders in `packages/frontend/src/lib/authentication/config.ts`, `packages/frontend/src/lib/authentication/credentials.ts`, and `packages/frontend/src/lib/authentication/transaction/store.ts`. If the credential or transaction Config values are not already visible to the parent, export them only so the parent can import them. Do not re-export those child configs, and do not let tests import the children. Defaults stay `OIDC_CLIENT_SECRETS_JSON={}`, `OIDC_CALLBACK_ORIGINS_JSON={}`, `OIDC_ALLOW_INSECURE_LOOPBACK=false`, `OIDC_TX_KEY_PREFIX=preets:oidc-tx:v1`, and `OIDC_TX_TTL_SECONDS=600`. `AuthenticationService.layer` stays a parameterless `Layer`. Public service methods stay unchanged. Missing secret references still fail later, per request, as `ClientCredentialUnavailable`. Cite the authentication contract and V-006.

- [x] T011 Implement `observabilityLayer` in `packages/frontend/src/lib/observability.ts` with the exact signature `(input: { readonly logLevel: LogLevel.LogLevel; readonly otel: Config.Success<typeof OtelConfig>; readonly serverEnv: "development" | "production" | "test" }) => Layer.Layer<Resource, ObservabilityInitializationError>`. Run `selectObservability` first. A selection error fails the layer before any exporter or Redis work. No selected signals yields a layer that installs only the console logger. Build that logger inside the layer before any `NodeSdk.layer`, JSON when `serverEnv === "production"` and pretty otherwise, with `References.MinimumLogLevel` set from `logLevel`. Keep the logger private and stop exporting `appLoggerLayer` once `packages/frontend/src/lib/runtime.ts` no longer imports it (T012). Do not import `packages/frontend/src/lib/config/env.ts`. Do not read `process.env`. When no signal is selected, do not register a tracer provider and do not patch HTTP. Replace the installed NodeRedis warning `NodeRedis client error` and its cause with the fixed sentence `pre-ets-frontend: redis client error`, dropping the cause so userinfo cannot be logged. Cite the observability contract, the runtime contract's Redis-listener invariant, and V-009. Selected-signal processors wait for T018.

- [x] T012 Implement the shared runtime surface in `packages/frontend/src/lib/runtime.ts`: `ProcessStartup`; `StartupFailure` tagged `"@pathableai/pre-ets-frontend/StartupFailure"` with `reason: "acquisition" | "config" | "defect" | "observability-initialization"` and `stage: "application-acquisition" | "configuration" | "observability"`; `StartupNotReady` tagged `"@pathableai/pre-ets-frontend/StartupNotReady"` with no fields; `ApplicationServices = AuthenticationService | SessionService | TenantConfigService`; `loadProcessStartup: Effect.Effect<ProcessStartup, Config.ConfigError>`; `applicationLayer(startup, infrastructure: Layer.Layer<Redis | NodeServices.NodeServices, RedisError, never>): Layer.Layer<ApplicationServices, ObservabilityInitializationError | RedisError>`; and `Runtime.runPromise`. `loadProcessStartup` copies `process.env` into one record, passes that record to `ConfigProvider.fromEnvRecord(env)`, and runs `StartupConfig` and `AuthenticationProcessConfig` to completion. Later decoders use that provider and do not call `fromEnv()` again. `applicationLayer` does not read `process.env`, does not call `process.exit`, and builds `observabilityLayer` before the infrastructure argument so an observability failure means the infrastructure acquire has not run. Pass `TenantConfigService.layer(startup.server)`. Keep `AuthenticationService.layer` and `SessionService.layer` parameterless on the frozen provider. Do not change their public methods. Remove the top-level `await boot()` and the `phase-production-build` proxy so importing the module does not validate `TENANT_CONFIG_DIR` or open Redis. Before a runtime is installed, `Runtime.runPromise` rejects `StartupNotReady` and does not execute the effect. Make T006 pass. Cite the runtime contract and V-006. Production `NodeRedis` nesting and `process.exit` wait for T013 and T017.

**Checkpoint**: Configuration, selection, and substituted composition are enforceable from public parents. Foundation
alone does not start a production process or prove live readiness.

## Phase 3: User Story 1 — Start Only When Fully Ready (Priority: P1) 🎯 MVP

**Goal**: The Node.js server becomes ready only after configuration, observability, application services, and required
resources have been acquired. Business work does not run against a partial application. A production build does not
enter that machine.

**Independent Test**: With `NEXT_PHASE` unset, importing `runtime.ts` does not read startup configuration, and
`Runtime.runPromise` rejects `StartupNotReady` without running the effect. `toNext` returns HTTP 503 and does not call
the handler. The live pending-acquisition probe is quickstart case 1 (T025), after the fatal and signal work exists,
because that case also records V-003, V-009, and V-010.

### Production readiness

- [x] T013 [US1] Implement `startProductionRuntime: () => Promise<void>` in `packages/frontend/src/lib/runtime.ts`. It does not accept an infrastructure argument and is not a test harness. After `loadProcessStartup`, build the production layer as `applicationCore(startup).pipe(Layer.provide(NodeServices.layer), Layer.provide(NodeRedis.layer(redisOptions)), Layer.provide(observabilityLayer(startup)), Layer.provide(ConfigProvider.layer(startup.configProvider)))`. `Layer.provide` builds the outer dependency first. Observability stays outside Redis. Do not use `Layer.mergeAll` or `Layer.provideMerge` to place Redis and observability side by side. `NodeRedis` is not part of `ApplicationServices`. Redis options stay `disableOfflineQueue: true`, `pingInterval: 1_000`, `socket: { socketTimeout: 5_000 }`, and `url` from the validated startup value. `ManagedRuntime.make` stays lazy until one probe effect forces acquisition; then publish that same runtime for later `Runtime.runPromise` calls. The returned promise resolves only after that probe. Do not call `process.exit` on success. Cite the runtime contract success invariants, FR-001, FR-003, FR-021, FR-023, FR-024, and V-001.

### Contract evidence before adapters

- [x] T014 [P] [US1] Extend `packages/frontend/tests/lib/runtime-composition.test.ts` after T006. This task shares no file with T013 and may run beside it. Import `toNext` from `packages/frontend/src/lib/next.ts`: with the runtime uninstalled, the handler sets a flag and would return a response, the result status is 503, and the flag stays false. Do not launch `startProductionRuntime` or assert log text. Cite the `toNext` evidence "`toNext` does not call the handler before ready" and V-001 / V-008. The example fails until T016.

### Host adapters

- [x] T015 [P] [US1] Change `packages/frontend/src/instrumentation.ts` so `export const register: () => Promise<void>`. Read `NEXT_RUNTIME` and `NEXT_PHASE` only to decide whether to start. On the Node.js server, outside `phase-production-build`, dynamically import `packages/frontend/src/lib/runtime.ts` and await `startProductionRuntime` so the promise resolves only after required resources are acquired. On any other runtime, and during `phase-production-build`, resolve without reading startup configuration and without opening Redis or a collector. The module has no top-level startup side effect. Startup failure is handled inside `runtime.ts` before `register` settles. Cite the instrumentation contract, FR-005, FR-025, V-001, and V-008.

- [x] T016 [US1] Implement `toNext` in `packages/frontend/src/lib/next.ts` as `(handler: (request: NextRequest) => Effect.Effect<NextResponse, never, ApplicationServices>) => (request: NextRequest) => Promise<NextResponse>`. Keep `server-only`. When the runtime is ready, behavior matches `Runtime.runPromise(handler(request))`. When it rejects `StartupNotReady`, do not call the handler and return status 503. Leave other rejections unchanged. Pages that call `Runtime.runPromise` directly keep Next.js's existing error page. That split is an operator-visible host choice, not a product-decision task. Make the T014 `toNext` example pass. Cite the `toNext` contract, FR-004, V-001, and V-008.

**Checkpoint**: Durable US1 evidence passes. This is the MVP for import safety and the pre-ready refusal. It is not
feature completion.

## Phase 4: User Story 2 — Terminate Failed Starts Safely (Priority: P1)

**Goal**: Every required startup failure makes a bounded diagnostic attempt, releases acquired resources where
possible, and ends with `process.exit(1)` within 10 seconds, without readiness.

**Independent Test**: Quickstart cases 3, 4, and 5 (T029–T031). Do not add a Vitest that launches
`startProductionRuntime` or asserts the diagnostic sentence, exit status, or telemetry flush. The substituted
`RedisError` case in T006 already shows `applicationLayer` returns the error without exiting the test process.

- [x] T017 [US2] Add the fatal handler to `startProductionRuntime` in `packages/frontend/src/lib/runtime.ts`. On a required failure, start a referenced 10 second timer that calls `process.exit(1)`. The clock starts when the failure is recognized. The 1 second diagnostic attempt and the 3 second telemetry shutdown run inside those 10 seconds and do not extend them. Verification's process-exit bound is this 10 second deadline. The 3 second value is only the flush timeout. Configuration and acquisition diagnostics use `pre-ets-frontend: startup failed during <stage> reason=<reason>`. Observability uses `pre-ets-frontend: startup failed during observability signal=<signal> reason=<reason>`. `<stage>` is `configuration`, `observability`, or `application-acquisition`. Sentence `<reason>` is `config`, `acquisition`, `defect`, `endpoint`, `exporter`, or `protocol`. `<signal>` is `logs`, `metrics`, or `traces` and appears only for observability. `StartupFailure.reason` for an observability initialization error remains `observability-initialization`; the sentence uses the signal reason (`endpoint`, `exporter`, or `protocol`) rather than that schema literal. Do not interpolate `error.message`, URLs, headers, or configuration. Before `loadProcessStartup`, write bootstrap diagnostics to `process.stderr` with no Effect runtime. After observability is installed, try `Effect.logError` of the same sentence and, if that attempt does not finish within 1 second, fall back to `process.stderr.write` of the same sentence. A failed or stalled write does not change the exit status. `runtime.dispose()` is best-effort under the same 10 second timer. Only `startProductionRuntime` may call `process.exit`. Application services return their existing errors and do not exit. Do not use the 10 second fatal timer to force a successful shutdown to exit 0. Install one `SIGTERM` listener and one `SIGINT` listener in this function: when `NEXT_MANUAL_SIG_HANDLE=1` has kept Next.js from registering `process.exit(143)` or `process.exit(130)`, await `dispose` once and call `process.exit(0)` only after that promise settles. T027 observes that behavior. Cite the runtime contract, the data-model fatal-handling budget, FR-015 through FR-020, and V-002.

**Checkpoint**: The production path can classify and bound a required failure. Live exit, secrecy, and secondary
failure trials remain T029–T031.

## Phase 5: User Story 3 — Observe Bootstrap Progressively (Priority: P2)

**Goal**: Standard error works before observability is ready. Each enabled signal is exported after initialization.
Disabled, unselected, and unreachable-collector cases follow the selection and best-effort rules.

**Independent Test**: T004 proves selection without a collector. Quickstart cases 1, 2, 5, and 6 (T026, T028, T031,
T032) inspect real standard error and configured destinations. No durable telemetry assertion is added.

- [x] T018 [US3] Complete selected-signal construction inside `observabilityLayer` in `packages/frontend/src/lib/observability.ts`, using one `NodeSdk.layer` from `@effect/opentelemetry`. Pass `spanProcessor`, `metricReader`, and `logRecordProcessor` only for signals `selectObservability` returns. Construct exporters with `{ url }` only; do not pass or log headers. Set `shutdownTimeout: "3 seconds"`. Set `exportTimeoutMillis: 3_000` on `BatchSpanProcessor` and `BatchLogRecordProcessor`. On `PeriodicExportingMetricReader`, set `exportIntervalMillis: 5_000` and `exportTimeoutMillis: 3_000`. Before any exporter is constructed, call `diag.setLogger` from `@opentelemetry/api` at `DiagLogLevel.ERROR`, and do not write the diag `error` arguments. Wrap each selected exporter so a failed export writes only `pre-ets-frontend: telemetry delivery failed signal=<signal>`, where `<signal>` is `logs`, `metrics`, or `traces`. That failure is not `ObservabilityInitializationError`, does not remove readiness, and does not exit the process. When traces are selected, keep the existing `provider.register()` guard and the `nodeHttpClientInstrumentation` enable/disable finalizer from `packages/frontend/src/lib/observability/http.ts`. When traces are not selected, do not register a provider and do not patch HTTP. Service name is `otel.serviceName` or `pre-ets-frontend` when any signal is selected. OTLP logs, when selected, merge with the private console logger through `mergeWithExisting: true`. Do not add `effect/observability` `OtlpTracer` or a second `NodeTracerProvider`. Cite the observability contract, FR-002, FR-006 through FR-011, and V-003, V-004, and V-005. Do not assert export calls in tests.

- [x] T019 [US3] Update `docs/observability.md` so logs and metrics follow the same precedence as traces, and so Loki and Prometheus are evidence only when those signals are selected. Document the best-effort delivery sentence `pre-ets-frontend: telemetry delivery failed signal=<signal>` and that collector unreachability is not an initialization failure. Cite FR-007, FR-010, FR-011, and V-003 through V-005. Do not describe the quickstart as already executed. This is the documentation follow-through named in `plan.md`; do not add other docs.

**Checkpoint**: Selection tests still pass, and enabled signals can be initialized. Live destination inspection remains
manual.

## Phase 6: User Story 4 — Preserve Application Contracts While Improving Composition (Priority: P2)

**Goal**: Existing tenant, authentication, persistence, session, typed-error, and HTTP outcomes stay on their current
public services. Production startup does not use a test-only constructor.

**Independent Test**: T006 reads a public service through substituted infrastructure. T021 and T023 keep the existing
suites' accepted outcomes. V-007 is those suites plus the existing requirements BDD, not a new bootstrap feature.

- [x] T020 [P] [US4] Delete `packages/frontend/tests/lib/otel-http.test.ts`. It imports the private child `packages/frontend/src/lib/observability/http.ts` and asserts span attributes, status messages, and exceptions through a fake tracer, which FR-027 and FR-028 withdraw. Do not rewrite it against the private child, and do not replace it with an in-memory exporter or span snapshot. Leave query stripping in `packages/frontend/src/lib/observability/http.ts`. A real trace is inspected manually in T026 using the attribute rules already in `docs/observability.md`. Cite the observability contract sentence "Tests stop importing the HTTP child" and the plan decision "Retire durable HTTP span assertions".

- [x] T021 [P] [US4] Adapt existing frontend tests only where the import-safe runtime or private logger forces a construction change. Keep assertions and accepted outcomes. Public parents only. Do not call `startProductionRuntime` from a test. Likely call sites that mock the public runtime are `packages/frontend/tests/unit/authentication-entry.test.ts` and `packages/frontend/tests/unit/authentication-entry-failures.test.ts`. Service suites that already build their own layers stay the evidence for preserved behavior: `packages/frontend/tests/lib/authentication.test.ts`, `packages/frontend/tests/lib/authentication-failures.test.ts`, `packages/frontend/tests/integration/authentication-redis.test.ts`, `packages/frontend/tests/lib/session.test.ts`, `packages/frontend/tests/integration/session-redis.test.ts`, `packages/frontend/tests/lib/tenant.test.ts`, `packages/frontend/tests/lib/tenant-policy.test.ts`, and `packages/frontend/tests/unit/tenant-alias.test.ts`. If a file already passes unchanged, leave it. Do not weaken assertions, change expected statuses, redirects, errors, storage behavior, or tenant isolation, and do not add bootstrap scenarios. Cite FR-026 and V-007.

**Checkpoint**: Preserved public services still compile against the new composition. Full suite execution is T022–T024.

## Phase 7: Feature verification and cross-cutting completion

**Purpose**: Run the durable suites, then the agent-executable manual matrix in [quickstart.md](quickstart.md).
Manual tasks are sequential: they share Redis, the collector, the frontend port, and temporary probes. No `[P]`.
Module tests do not substitute for V-001 through V-005, V-009, V-010, or the live half of V-008.

- [x] T022 Run `pnpm --filter @pathableai/pre-ets-frontend test:unit` and `pnpm --filter @pathableai/pre-ets-frontend typecheck` from the repository root. Record that `packages/frontend/tests/lib/config.test.ts`, `packages/frontend/tests/lib/otel-config.test.ts`, `packages/frontend/tests/lib/observability-selection.test.ts`, and `packages/frontend/tests/lib/runtime-composition.test.ts` are the durable V-006 evidence and the durable pre-ready halves of V-001 and V-008. They do not prove process exit, standard error, Next.js listener behavior, real Redis, or a collector. Cite the quickstart "Module evidence" section.

- [ ] T023 Run `pnpm --filter @pathableai/pre-ets-frontend test:integration` from root `package.json` and the preserved suites in `packages/frontend/tests/lib/authentication.test.ts`, `packages/frontend/tests/lib/authentication-failures.test.ts`, `packages/frontend/tests/integration/authentication-redis.test.ts`, `packages/frontend/tests/lib/session.test.ts`, `packages/frontend/tests/integration/session-redis.test.ts`, `packages/frontend/tests/lib/tenant.test.ts`, `packages/frontend/tests/lib/tenant-policy.test.ts`, `packages/frontend/tests/unit/tenant-alias.test.ts`, `packages/frontend/tests/unit/authentication-entry.test.ts`, and `packages/frontend/tests/unit/authentication-entry-failures.test.ts`. Record unchanged tenant, authentication, session, configuration, and framework-boundary outcomes as V-007. Simulated dependencies do not establish real infrastructure. Cite FR-026 and the verification automated-evidence rows for V-007.

- [ ] T024 Run the existing requirements-backed scenarios with the commands in `features/README.md`: `pnpm test:bdd:dry` is discovery only, then `pnpm test:bdd` is the runtime evidence. Keep requirement-ID tags and feature-level `@partial`. Do not add bootstrap lifecycle scenarios, and do not edit acceptance criteria. A dry run is not V-007. `pnpm test:bdd` builds the frontend, and that build is not the isolated V-008 trials in T034. Cite PREETS-TENANT-004, PREETS-SECURITY-001, PREETS-SESSION-002, PREETS-SESSION-003, and PREETS-SESSION-006 as preserved contracts, and V-007.

- [ ] T025 Execute quickstart case 1's pending-acquisition probe for V-001 and V-008. Follow `specs/157-runtime-bootstrap/quickstart.md`, including moving frontend env files aside, the base environment, `NEXT_MANUAL_SIG_HANDLE=1`, Redis, and `docker compose --profile observability up -d otel-lgtm --wait`. Add an uncommitted latch in `packages/frontend/src/lib/runtime.ts` around the production Redis `connect()` so `connect()` stays suspended until release and the real client then uses `REDIS_URL`. Do not insert a TCP proxy. The preserved 5 second socket timeout cannot provide this hold. Do not commit the latch. While it is held, `kill -0` on the server pid succeeds, stderr has no `pre-ets-frontend: startup failed` sentence, and `curl` to `http://127.0.0.1:3000/` is refused or 503. A redirect to `/auth/login` fails the trial. Record whether `next start` blocked the listener or returned 503. That record is the operator-visible host choice, not a settled product decision. Release the latch, remove it before any later case, and confirm the `/auth/login` redirect happens only after release. Cite V-001 and V-008.

- [ ] T026 Continue case 1 signal inspection for V-003 and V-009. After the about-30-second wait, which covers the 5 second metric interval, find in Grafana one frontend log in Loki, one startup or request trace in Tempo for service `pre-ets-frontend`, and one frontend metric in Prometheus. Retain datasource UIDs, a trace id, the log window, and the metric name. Confirm a local console diagnostic is on stderr. Inspect one item of each enabled signal for credentials, secrets, tokens, authorization headers, and tenant file contents. On the request trace, apply the HTTP client query-stripping attribute rules in `docs/observability.md` without adding a durable span assertion. Retain identifiers, not payloads. Cite V-003 and V-009.

- [ ] T027 Finish case 1 in `specs/157-runtime-bootstrap/quickstart.md` for V-010. Before this server starts, add an uncommitted constant in `packages/frontend/src/lib/runtime.ts`, created once when the runtime is installed, and an uncommitted `x-pre-ets-runtime-id` response header on `GET /` from `packages/frontend/src/app/(app)/page.tsx`. Keep the preserved redirect target. Issue two `GET /` requests with no restart; the header values match. Send `SIGTERM`. Pass only when `docker compose exec redis redis-cli CLIENT LIST` no longer shows that client while `kill -0` on the server pid still succeeds, and the process exits after that. The 10 second fatal timer must not force this successful shutdown to exit 0. If dispose is still incomplete after 10 seconds, V-010 fails. Remove the header change before any later case. Do not commit the probe. Cite the runtime contract's graceful-shutdown invariant and V-010.

- [ ] T028 Execute case 2 in `specs/157-runtime-bootstrap/quickstart.md` for V-003 and V-004. Stop the previous server. Each trial becomes ready, serves the `/auth/login` redirect, keeps a local stderr diagnostic, and does not fail because of a malformed unselected value. Disabled: `OTEL_SDK_DISABLED=true` with `OTEL_EXPORTER_OTLP_ENDPOINT=http://not a url` and `OTEL_EXPORTER_OTLP_PROTOCOL=grpc`. Unselected: base endpoint and traces endpoint unset, plus `OTEL_EXPORTER_OTLP_PROTOCOL=grpc`. One signal off: collector up, `OTEL_LOGS_EXPORTER=none`, and `OTEL_EXPORTER_OTLP_LOGS_PROTOCOL=grpc`; Tempo and Prometheus show the enabled signals, Loki is not required, and stderr still has a console diagnostic. Cite V-003 and V-004.

- [ ] T029 Execute case 3 in `specs/157-runtime-bootstrap/quickstart.md` for V-002 and V-009. Unset `TENANT_CONFIG_DIR`. Pass: nonzero exit, stderr contains `pre-ets-frontend: startup failed during configuration reason=config`, curl cannot connect or does not receive the `/auth/login` redirect, and the transcript has no fixture file body, secret, token, or header value. Cite V-002 and V-009.

- [ ] T030 Execute case 4 in `specs/157-runtime-bootstrap/quickstart.md` for V-002, V-004, and V-009. Restore the base environment. Set `OTEL_EXPORTER_OTLP_PROTOCOL=grpc` with the SDK enabled and the endpoint set. Start Redis. Pass: stderr contains `pre-ets-frontend: startup failed during observability signal=traces reason=protocol`, the sentence has no URL, exit status is nonzero, and `redis-cli CLIENT LIST` shows no client from this process. Cite V-002, V-004, and V-009.

- [ ] T031 Execute case 5 in `specs/157-runtime-bootstrap/quickstart.md` for V-002, V-003, and V-009. Use `REDIS_URL=redis://probe:probe-secret@127.0.0.1:1`. Verification's process-exit bound is the 10 second deadline. Trial A: collector up; stderr contains `pre-ets-frontend: startup failed during application-acquisition reason=acquisition`; nonzero exit within 10 seconds of that line; the login redirect is never served; if a client error event is emitted, stderr contains `pre-ets-frontend: redis client error` and does not contain `probe-secret`, URL userinfo, or headers. Trial B: stderr closed and `OTEL_SDK_DISABLED=true`; a stage sentence is not required; nonzero exit within 10 seconds of spawn; readiness absent. Trial C: an uncommitted change in `packages/frontend/src/lib/runtime.ts` makes runtime disposal reject or never settle; nonzero exit within 10 seconds of the stage line; revert that change before Trial D and do not commit it. Trial D: a TCP listener on `127.0.0.1:14318` accepts and never responds, with `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:14318`; nonzero exit within 10 seconds of the stage line; stop that listener afterward. A finalizer that blocks until the OpenTelemetry 30 second default fails these trials. Cite V-002, V-003, and V-009.

- [ ] T032 Execute case 6 in `specs/157-runtime-bootstrap/quickstart.md` for V-005. Trial A: `otel-lgtm` stopped, valid endpoint `http://127.0.0.1:4318`, healthy Redis. After the about-30-second wait, the process is ready, `GET /` returns the login redirect, and stderr contains `pre-ets-frontend: telemetry delivery failed signal=traces`, the same sentence with `signal=metrics`, and the same sentence with `signal=logs`, with no headers, URL userinfo, or exporter configuration. Trial B: healthy startup, then `docker compose --profile observability stop otel-lgtm`, then another `GET /`. The process stays ready, the redirect is served, stderr records best-effort delivery failure for each enabled signal that failed, and the process does not exit. Cite V-005 and FR-011.

- [ ] T033 Record case 7 in `specs/157-runtime-bootstrap/quickstart.md` for V-001 and V-008. The only deployment form this plan verifies is the local production server, `pnpm --filter @pathableai/pre-ets-frontend start` after build. If T025 already used that host, record the listener result observed there and do not claim `next dev` or any other host. Repeat the uncommitted latch only if T025 did not already record `next start`. The route-handler 503 versus a Server Component error page stays an operator-visible host choice. Cite V-001, V-008, and FR-005.

- [ ] T034 Execute the four isolated production-build trials in `specs/157-runtime-bootstrap/quickstart.md` for V-008, using the `build` script in `packages/frontend/package.json`. Stop the frontend, Redis, and `otel-lgtm`. Each trial uses a shell that does not inherit the previous environment, with frontend env files still moved aside, and runs `pnpm --filter @pathableai/pre-ets-frontend build`. Services unavailable: absolute `TENANT_CONFIG_DIR` and static Springfield settings, Redis and collector stopped, exit 0, no readiness message, Redis stays down. Credentials absent: `OIDC_CLIENT_SECRETS_JSON` unset, services stopped, exit 0. Tenant directory absent: `TENANT_CONFIG_DIR` unset, services stopped, exit 0. Tenant directory malformed: `TENANT_CONFIG_DIR='%%%'` and `TENANT_RESOLUTION=not-a-mode`, services stopped, exit 0. A build that validates those settings, connects to Redis, or waits on the collector fails. Cite FR-025 and V-008.

- [ ] T035 Clean up using the cleanup section of `specs/157-runtime-bootstrap/quickstart.md`. Revert any remaining probe edits in `packages/frontend/src/lib/runtime.ts` and `packages/frontend/src/app/(app)/page.tsx`. Stop only the frontend, blackhole listener, Redis, and `otel-lgtm` instances this procedure started. Remove owned Redis keys if any trial wrote them; do not flush Redis globally. Restore moved env files. Delete the Redis acquire latch, the runtime-id header edit, the cleanup-fault edit, timestamps, and captures from the worktree. `git status` must not show those probes, transcripts, or credentials. Do not commit them. Cite V-010's requirement that the temporary probe is removed, and the verification environment controls.

- [x] T036 Run `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm check:unused`, and `pnpm format:check` from the repository root `package.json`. Fix underlying findings without suppressions. Apply lint fixes before `pnpm format:write` if formatting is required, then re-run lint and format check. These gates establish repository quality only. They do not establish V-001 through V-010. The isolated runtime-configuration build trials remain T034.

- [ ] T037 Write the implementation execution record for the future implementation pull request, using the "Evidence to retain" list in `specs/157-runtime-bootstrap/quickstart.md`. Include revision, time window, OS, Node, pnpm, Next.js, service versions, enabled and disabled signals, fixture name, collector address class, and for every case the commands, exit status, curl result, listener behavior, fatal elapsed time against 10 seconds, safe stderr sentences, Grafana identifiers, V-010 header match, and cleanup. Do not put results in `spec.md`, `verification.md`, `plan.md`, or `quickstart.md`. Do not retain secret values or tenant file bodies. Reconcile this record with the completion map below. A missing manual case stays an unexecuted claim.

## Dependencies and execution order

```text
T001 → T002 → failing evidence (T003 || T004 || T005 || T006)
                  ↓
              T007 → (T008 || T009 || T010) → T011 → T012
                                                  ↓
                         US1: T013 → T017 (same runtime.ts file)
                              T014 [P with T013 only] → T016
                              T015 [P with T014] after T013; T016 follows T014
                                                  ↓
                         US3: T018 → T019 (observability.ts; T018 may overlap T012–T017)
                                                  ↓
                         US4: (T020 || T021)
                                                  ↓
                         T022 → T023 → T024 → T025 → T026 → T027 → T028
                              → T029 → T030 → T031 → T032 → T033 → T034
                              → T035 → T036 → T037
```

- T003–T006 are different test files and fail until their implementation tasks. T014 extends the same file as T006, so it follows T006 and is parallel only with T013.
- T007 edits `config/otel.ts` and `config/index.ts`. T009 also edits `config/index.ts`, so T009 follows T007. T008, T009, and T010 do not share files with each other.
- T008, T011, and T018 all edit `observability.ts`, in that order. T012, T013, and T017 all edit `runtime.ts`, in that order.
- T015 and T016 are different adapter files. T015 depends on `startProductionRuntime` (T013) and may run beside T014. T016 depends on the T014 example and on `Runtime.runPromise` (T012), so it is not parallel with T014.
- T018 may proceed beside the runtime.ts tasks once T011 has landed. T019 follows T018.
- T025–T035 share one local stack and the uncommitted probes. Cleanup T035 is mandatory even when an earlier case fails.

## Parallel execution examples

These are scheduling examples, not authorization to spawn agents during task generation.

| Phase/story                   | Concurrent work after the entry gate                                                                                    | Join point      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------- |
| Foundation evidence           | T003 parser examples; T004 selection examples and property; T005 `StartupConfig` example; T006 composition examples     | T007            |
| Foundation implementation     | After T007: T008 `selectObservability`; T009 `StartupConfig`; T010 `AuthenticationProcessConfig`                        | T011            |
| US1                           | T013 production success path beside T014 `toNext` examples; T015 `register` may overlap T014 after T013                 | T016 after T014 |
| US3 beside later runtime work | T018 selected-signal `NodeSdk` wiring beside T012–T017 when `observability.ts` and `runtime.ts` are not the same editor | T019            |
| US4                           | T020 delete the span-assertion file; T021 adapt preserved suites that no longer boot on import                          | T022            |

Do not share a frontend process, Redis prefix, collector, or temporary probe between parallel workers.

## Implementation strategy

### MVP first: User Story 1

1. Complete declaration inspection and foundational contracts T001–T012.
2. Complete US1 T013–T016.
3. Stop and run the durable examples in `packages/frontend/tests/lib/runtime-composition.test.ts` together with the config, parser, and selection tests.
4. Demonstrate import-safe startup and the pre-ready refusal.
5. Do not call the feature complete. US2's fatal bound, US3's live signals, US4's preserved suites, and manual V-001 through V-010 are still required. The spec's live pending-acquisition independent test is T025.

### Incremental delivery

1. **Foundation** makes one validated startup value, signal selection, and substituted `applicationLayer` testable without a server.
2. **US1** publishes one production runtime and refuses business work before it is ready.
3. **US2** bounds fatal diagnostics, cleanup, and nonzero exit.
4. **US3** exports each enabled signal and keeps collector failure best-effort.
5. **US4** keeps existing public outcomes and removes durable span assertions.
6. **Feature verification** runs the seven manual cases, the isolated builds, cleanup, and the execution record.

## Contract and verification completion map

| Contract or claim                                                          | Primary tasks                                 | Evidence boundary and approved limitation                                                                                                                                                 |
| -------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `register`                                                                 | T015, T025, T033, T034                        | Host adapter plus live `next start` and isolated builds. The unit import does not prove the Next.js build graph. `next dev` is not claimed.                                               |
| `OtelConfig` / `OtelSettings`                                              | T003, T007, T022                              | Public parser examples. URL and protocol syntax are intentionally untested here.                                                                                                          |
| `StartupConfig`                                                            | T005, T009, T012, T022                        | One Config failure before infrastructure. Does not prove process exit.                                                                                                                    |
| `AuthenticationProcessConfig`                                              | T006, T010, T012, T021, T023                  | Invalid origins fail before the substitute acquire. Existing authentication suites own callback outcomes. Manual case 3 uses the tenant directory, not OIDC JSON.                         |
| `selectObservability` / `ObservabilityInitializationError`                 | T004, T008, T022, T028, T030                  | Examples and a disabled-SDK property. Does not prove a collector received nothing.                                                                                                        |
| `observabilityLayer`                                                       | T011, T018, T019, T026, T028, T031, T032      | Selection failure and console-only empty selection are durable. Export, diag text, and delivery-failure sentences are manual.                                                             |
| `loadProcessStartup` / `applicationLayer` / `Runtime.runPromise`           | T006, T012, T013, T014, T017, T022            | Substituted composition and pre-ready refusal. Tests do not call `startProductionRuntime`.                                                                                                |
| `startProductionRuntime`                                                   | T013, T017, T025–T033                         | Production `NodeRedis` chain, fatal bound, and signals. Only this function calls `process.exit`.                                                                                          |
| `toNext`                                                                   | T014, T016, T025                              | Durable 503 before ready. Server Components keep Next.js's existing error page. That split is an operator-visible host choice.                                                            |
| Preserved `SessionService`, `TenantConfigService`, `AuthenticationService` | T012, T021, T023, T024                        | Existing public signatures and suites. This refactor does not change request-time tenant loading.                                                                                         |
| V-001 readiness only after complete acquisition                            | T006, T012–T016, T025, T033, T037             | Durable refusal plus the live latch. Listener control cannot exceed `next start`.                                                                                                         |
| V-002 bounded fatal startup failure                                        | T017, T029, T030, T031, T037                  | Manual only. No durable exit, stderr, or flush assertion.                                                                                                                                 |
| V-003 progressive logs, traces, and metrics                                | T018, T019, T026, T028, T031, T037            | Real stderr and Grafana. A disabled capability is not required.                                                                                                                           |
| V-004 disablement versus selected invalid initialization                   | T004, T008, T018, T028, T030, T037            | Property and examples, plus manual malformed-unselected and selected-`grpc` trials.                                                                                                       |
| V-005 best-effort collector unavailability                                 | T018, T019, T032, T037                        | Manual from process start and after a healthy start. Not an initialization failure.                                                                                                       |
| V-006 one substituted startup value                                        | T003, T005–T007, T009, T010, T012, T022, T037 | Public config and composition tests. Does not prove real Redis or the Next.js sequence.                                                                                                   |
| V-007 preserved tenant, authentication, session, and HTTP outcomes         | T020, T021, T023, T024, T037                  | Existing suites and current requirements BDD. Does not newly prove Microsoft-provider compatibility or other delivery work.                                                               |
| V-008 build isolation and request gating                                   | T014–T016, T025, T033, T034, T037             | Unit refusal, live probe, and four isolated builds. Build success is not runtime readiness.                                                                                               |
| V-009 no secrets in diagnostics                                            | T011, T017, T018, T026, T029–T031, T037       | Manual inspection of retained samples. Header strings stay out of exporter constructors.                                                                                                  |
| V-010 one environment and graceful disposal                                | T013, T017, T027, T035, T037                  | Temporary header probe, Redis `CLIENT LIST` while `kill -0` succeeds, then exit. The probe is removed and not committed. The composition test does not by itself prove two HTTP requests. |

## Intentionally reused evidence and approved limitations

- Existing `packages/frontend/tests/lib/config.test.ts` remains the ServerConfig evidence, including missing `TENANT_CONFIG_DIR` and cross-field tenant rules. T005 adds `StartupConfig` only.
- Existing `packages/frontend/tests/lib/otel-config.test.ts` remains the traces parser evidence, including a computed `exportUrl` when the SDK is disabled. T003 adds the logs and metrics fields.
- Existing authentication unit and Redis integration tests remain the callback, credential, transaction, and storage evidence. T006 does not place OIDC JSON in the manual transcript.
- Existing session, tenant, tenant-policy, and tenant-alias tests remain the preserved service evidence. `SessionService.layer` and `TenantConfigService.layer(config)` keep their current call shapes.
- Existing route-handler tests and `tests/bdd/requirements/` scenarios remain the HTTP and requirements-backed evidence. No new bootstrap feature file is authorized.
- Query stripping in `packages/frontend/src/lib/observability/http.ts` stays implemented and is checked from a real trace in T026. T020 removes the durable fake-tracer assertions.
- Approved limitations: local `otel-lgtm` does not represent every collector, network, deployment platform, or authorization scheme; the listener result is whatever `next start` showed; the route-handler 503 versus a Server Component error page is not a settled product decision; build success does not prove runtime readiness; substituted composition does not prove live Redis or a collector; this feature does not establish browser telemetry, backend telemetry, vendor selection, alerting, service-level objectives, or production sampling policy; preserved suites do not newly establish Microsoft-provider compatibility or session features owned by other delivery work; dev-server listener behavior is not claimed.
- There is no delivery issue. Do not invent one, and do not edit `spec.md` to add the constitution's four-part Principle I form.

All tasks remain unchecked until their stated outcome is completed and its evidence and limitations are recorded.
