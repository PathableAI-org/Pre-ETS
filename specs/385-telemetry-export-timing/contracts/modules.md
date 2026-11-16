# Module Architecture and Public Contracts: Configurable Telemetry Export Timing

**Plan**: [plan.md](../plan.md)

**Feature verification**: [verification.md](../verification.md)

**Status**: Planned design — signatures must be verified against installed declarations before implementation

## Module architecture decisions

| Concern                                   | Current owner and consumers                                                                                                           | Decision                 | Public boundary                                      | Private decomposition                                                           | Rationale and non-goals                                                                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The export-timing setting and its default | `frontend-services/src/config.ts`, which owns `config/otel.ts`. Consumers: `runtime.ts`, `observability.ts`                           | Extend                   | `config.ts` (`StartupConfig`, `OtelEnabled`)         | `config/otel.ts` reads the setting; `config.ts` passes it the `NODE_ENV` recipe | The setting is one more OTEL value decoded once at startup. No new settings module and no separate "mode" type: the mode is the `NODE_ENV` the config already decodes.                                             |
| Server span and log export                | `frontend-services/src/observability.ts`, which owns `observability/sdk.ts`. Consumer: `runtime.ts` (`applicationLayer`)              | Extend behavior          | `observability.ts` (`observabilityLayer`, unchanged) | `observability/sdk.ts` picks the processors                                     | The choice is two constructor calls inside the existing pipeline builder. No strategy interface, no second pipeline, no new child module.                                                                          |
| Orderly stop of the server process        | `frontend-services/src/production-runtime.ts`. Consumer: `frontend/src/instrumentation.ts`                                            | Extend behavior          | `production-runtime.ts` (`startProductionRuntime`)   | None                                                                            | The handler exists; it becomes the only signal handler and gains a deadline. The launchers (`packages/frontend/package.json` `start`, the BDD harness) set Next's manual signal handling. No new shutdown module.  |
| Browser configuration                     | `frontend-services/src/next.ts`, which owns `next/browser-tracing.ts`. Consumer: `frontend/src/app/(app)/layout.tsx`                  | Extend                   | `next.ts` (`BrowserTracingConfig`)                   | `next/browser-tracing.ts` copies the value                                      | One more non-secret value beside the four. No new adapter.                                                                                                                                                         |
| Browser export                            | `frontend/src/shared/browser-tracing.ts`, which owns `browser-tracing/sdk.ts` and `export-filter.ts`. Consumers: layout, client entry | Extend                   | `shared/browser-tracing.ts`                          | `sdk.ts` picks the processor; `export-filter.ts` skips an empty export          | The meta contract stays owned by the one module that renders and parses it.                                                                                                                                        |
| The test-run command                      | None. Consumers: developers and agents through `pnpm test:telemetry`; `tests/tooling/` tests                                          | Add one root script pair | `scripts/test-run.ts` (`testRunEnvironment`)         | `scripts/test-telemetry.ts` is the command-line entry                           | The defaults need one owner that both the BDD-owned application and the Vitest processes inherit from. It follows the existing `scripts/verify.ts` and `scripts/verification.ts` pairing. No package, no Effect.   |
| Test-process telemetry                    | None. Consumers: frontend-services unit and integration test files                                                                    | Add one test helper      | `frontend-services/tests/helpers/telemetry.ts`       | None                                                                            | Effect has no process-wide tracer ([research D8](../research.md#d8--how-unit-and-integration-tests-export)), so tests provide one layer. It wraps the product's `observabilityLayer`; it is not a second pipeline. |
| The BDD-owned application process         | `tests/bdd/support/harness.ts` (`siteEnv`)                                                                                            | Extend privately         | Unchanged                                            | None                                                                            | One added variable, `NEXT_MANUAL_SIG_HANDLE`. The harness gets no telemetry logic: the owned process inherits the command's environment.                                                                           |
| CI telemetry mode                         | `.github/workflows/ci-quality.yml`, `ci-build.yml`, `ci-bdd.yml`                                                                      | Extend                   | Each workflow's `env` block                          | None                                                                            | The mode is stated by its owner (FR-030). No shared workflow or composite action.                                                                                                                                  |

Every affected concern makes an explicit abstraction decision. Nothing is extracted or promoted, and no service,
provider interface, or workspace package is added.

## Public contracts

### `packages/frontend-services/src/config.ts`

**Responsibility**: The process settings, decoded once at startup.

**Actual consumers**:

- `runtime.ts` parses `StartupConfig` and passes `startup.otel` to `observabilityLayer` and `BrowserTracing.layer`.
- `observability.ts` and `observability/sdk.ts` read `OtelEnabled`.
- `tests/helpers/telemetry.ts` builds an `OtelEnabled` value for a test file (slice E).

**Proposed signatures**:

```ts
export type ExportTiming = "batch" | "immediate"

export interface BrowserTracingSettings {
  readonly endpoint: URL
  /** The server's effective export timing; the page has no other source for it. */
  readonly exportTiming: ExportTiming
  readonly serviceInstanceId?: string | undefined
  readonly serviceName: string
  readonly serviceVersion: string
}

export interface OtelEnabled {
  readonly browserTracing: BrowserTracingSettings | undefined
  readonly disabled: false
  readonly endpoint: URL
  /** `TELEMETRY_EXPORT_TIMING`, or the default for the process's `NODE_ENV`. */
  readonly exportTiming: ExportTiming
  readonly headers: Readonly<Record<string, string>>
  readonly serviceName: string
  readonly serviceVersion: string
}

// Unchanged: OtelDisabled, OtelSettings, StartupConfig, StartupSettings, AppEnv.
```

The private child builder becomes
`otelConfig(withoutEcho, env: Config.Config<"development" | "production" | "test">)`.

**Inputs and validation ownership**: `TELEMETRY_EXPORT_TIMING` is untrusted process environment, decoded here and
nowhere else. `NODE_ENV` keeps its existing decoding.

**Success semantics and invariants**:

- `exportTiming` is the supplied value when it is `immediate` or `batch`.
- When the setting is absent or empty, `exportTiming` is `batch` if `NODE_ENV` is `production`, and `immediate` if
  it is `development`, `test`, or absent.
- `browserTracing.exportTiming`, when browser tracing is effective, always equals `exportTiming`.
- With `OTEL_SDK_DISABLED` true the result is `{ disabled: true }` whatever the setting holds, provided it decodes.

**Expected errors**:

| Public error                               | Meaning for consumers                                                           | Owned internal failures translated here | Consumer response                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------- |
| `Config.ConfigError` (existing vocabulary) | The setting holds a value other than `immediate` or `batch`, in any letter case | The `Config.Literals` schema issue      | Startup fails; the log names the setting (FR-005) |

**Defects and interruption**: None added.

**Effect environment requirements**: `StartupConfig` is parsed by `runtime.ts` with `ConfigProvider.fromEnv()`, as
today. No layer reads `Config`.

**Compatibility and relationships**: `OtelEnabled` and `BrowserTracingSettings` each gain a required field. Their
only construction site is `config/otel.ts`; slice E adds one in the test helper. No test builds either by hand
today.

### Contract evidence

| Claim                                                                           | Meaningful violation                                                       | Durable evidence                                                                                                                                                                                                                                                                         | Manual/transient evidence                 | Limitations and non-duplication                                                      |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| The effective timing is the setting, or the mode's default (V-007)              | Production with no setting yields `immediate`; a supplied value is ignored | `tests/lib/config.test.ts`: `it.effect.each` over mode (production, development, test, absent) by setting (absent, empty, `immediate`, `batch`); `it.effect.prop` that the timing is `immediate` exactly when the setting is `immediate`, or it is absent and the mode is not production | One development-mode start, quickstart §A | Does not show that a processor honors the value (V-001 to V-006)                     |
| An unrecognized value refuses startup and names the setting, on and off (V-008) | `Batch` or `now` selects a timing, or the error omits the name             | `it.effect.prop` over generated strings other than the two values, with OTEL on and off: a `ConfigError` whose text includes `TELEMETRY_EXPORT_TIMING`                                                                                                                                   | One real start per case, quickstart §A    | The generated strings exclude the empty string, which counts as absent (research D1) |
| Browser settings carry the server's timing (V-022)                              | The rendered timing differs from the server's                              | One example per timing in the existing browser-tracing settings group: `browserTracing.exportTiming` equals `exportTiming`                                                                                                                                                               | The received document, quickstart §B      | What the page does with it is browser evidence                                       |

### `packages/frontend-services/src/observability.ts`

**Responsibility**: The server's telemetry pipeline and the request-time browser-tracing settings.

**Actual consumers**:

- `runtime.ts` merges `observabilityLayer({ otel })` and `BrowserTracing.layer(otel)` into the application layer.
- `tests/helpers/telemetry.ts` builds `observabilityLayer` for a test file (slice E).

**Proposed signatures**: Unchanged.

```ts
export const observabilityLayer: (input: {
  readonly otel: OtelSettings
}) => Layer.Layer<Resource, ObservabilityInitializationError>
```

**Inputs and validation ownership**: Decoded settings only.

**Success semantics and invariants**:

- With `exportTiming` `batch`, the span and log processors, exporters, and their options are what they are before
  this feature.
- With `immediate`, each ended sampled span and each emitted log record is handed to its exporter at once and
  exported on its own. No record waits for a timer or for another record, and none is refused for an in-flight limit.
- Under both timings every span passes `QueryFreeSpanProcessor` first, the resource is the same, and the exporters
  use the same URLs and read the same headers.
- Metric readers are the same under both timings.
- Releasing the layer flushes and shuts down the processors within the layer's shutdown timeout, under both timings.

**Expected errors**: Unchanged (`ObservabilityInitializationError` for construction and start failures).

**Defects and interruption**: Export failures stay inside the OpenTelemetry SDK's diagnostics and never reach an
Effect error channel.

**Effect environment requirements**: None beyond the settings argument.

**Compatibility and relationships**: No consumer changes. `sdk.ts` stays the only importer of the OpenTelemetry SDK
packages.

### Contract evidence

| Claim                                                 | Meaningful violation                                    | Durable evidence                                        | Manual/transient evidence                                      | Limitations and non-duplication                        |
| ----------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| Immediate timing exports each record when it finishes | Records wait for a batch interval or for later requests | None: exporter wiring is observed, not tested (spec L1) | Receiver timing, quickstart §A (V-001, V-002)                  | Sampled requests only (verification L-sample)          |
| Batch timing is unchanged                             | One export request per record under `batch`             | None                                                    | Burst comparison with the base revision, quickstart §A (V-005) | A production-mode build running locally (spec L5)      |
| The exported content does not depend on the timing    | An attribute or record under one timing only            | None                                                    | Set comparison and forbidden-data search, quickstart §A and §B | Seeded probes and one journey (verification L-absence) |

### `packages/frontend-services/src/production-runtime.ts`

**Responsibility**: Building, publishing, and disposing the process runtime.

**Actual consumers**:

- `packages/frontend/src/instrumentation.ts` calls `startProductionRuntime()` once.

**Proposed signatures**: Unchanged.

```ts
export const startProductionRuntime: () => Promise<void>
```

**Inputs and validation ownership**: `SIGTERM` and `SIGINT` from the host.

**Success semantics and invariants**:

- On the first `SIGTERM` or `SIGINT`, the runtime is disposed once and the process then exits with code 0. Disposal
  releases the telemetry layers, which delivers pending trace and log records.
- If disposal has not finished after 10 seconds, the process exits anyway.
- This holds when the host leaves signal handling to the application (`NEXT_MANUAL_SIG_HANDLE=true`). The frontend
  workspace's `start` script and the BDD harness set that variable.

**Expected errors**: None returned. A startup failure still writes the fixed sentence and exits with code 1.

**Defects and interruption**: A failed disposal is ignored, as today, and the process still exits.

**Effect environment requirements**: None.

**Compatibility and relationships**: The exit code of a signalled production server changes from 143 to 0. A host
that does not set the variable keeps today's behavior, including the loss of pending records (plan limitation L-1).

### Contract evidence

| Claim                                                       | Meaningful violation                                          | Durable evidence                                               | Manual/transient evidence                                   | Limitations and non-duplication                             |
| ----------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| An orderly stop delivers pending records, under each timing | The last request's records never arrive                       | None: needs a real process, a real signal, and a real receiver | Receiver contents at exit, quickstart §C (V-015)            | The documented start command and the BDD harness only (L-1) |
| An unreachable collector does not keep the process alive    | The process is still running after the deadline               | None                                                           | Exit time with the receiver refusing, quickstart §C (V-018) | About 3 seconds were observed in research P5                |
| Requirements BDD still stops its owned processes            | A scenario's cleanup times out or reports a surviving process | The existing BDD scenarios, run by tag in slice C and nightly  | None                                                        | A selection in the slice; the full suite nightly            |

### `packages/frontend-services/src/next.ts` (`readBrowserTracing`)

**Responsibility**: The browser configuration and trace context of a protected document.

**Actual consumers**:

- `packages/frontend/src/app/(app)/layout.tsx`, through the package entry.
- `packages/frontend/src/shared/browser-tracing.ts`, for the `BrowserTracingConfig` type.

**Proposed signatures**:

```ts
/** Exactly the five values a protected document gives the browser. */
export interface BrowserTracingConfig {
  readonly endpoint: string
  readonly exportTiming: "batch" | "immediate"
  readonly serviceInstanceId?: string | undefined
  readonly serviceName: string
  readonly serviceVersion: string
}

// Unchanged: BrowserTracingDocument, readBrowserTracing.
```

**Inputs and validation ownership**: The value comes from `BrowserTracing` settings, already decoded.

**Success semantics and invariants**:

- `config.exportTiming` is the server's effective timing.
- The configuration holds these five values and nothing else. Collector headers are never included.
- With browser tracing off the function still resolves `undefined`.

**Expected errors**: None; it never rejects.

**Defects and interruption**: Unchanged.

**Effect environment requirements**: The installed runtime, as today.

**Compatibility and relationships**: `src/index.ts` already re-exports the type, so it does not change.

### Contract evidence

| Claim                                                              | Meaningful violation                                    | Durable evidence                                   | Manual/transient evidence                                    | Limitations and non-duplication                    |
| ------------------------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| A protected document carries the four values and the export timing | Headers or another setting appear; the timing is absent | The settings example above; no adapter test exists | The received document with headers configured, quickstart §B | The adapter has no tests today and gains none here |

### `packages/frontend/src/shared/browser-tracing.ts`

**Responsibility**: The server-to-browser tracing contract and the browser's tracing facade.

**Actual consumers**:

- `src/app/(app)/layout.tsx` renders `BrowserTracingMeta`.
- `src/instrumentation-client.ts` calls `startBrowserTracing`.

**Proposed signatures**: Unchanged (`BrowserTracingMeta`, `startBrowserTracing`, the recorders).

**Inputs and validation ownership**: The `preets-browser-tracing` meta content is parsed and checked here. The
check gains `exportTiming`: it must be `immediate` or `batch`.

**Success semantics and invariants**:

- `BrowserTracingMeta` renders the five values as JSON.
- With `immediate`, each finished span that the export filter keeps is sent in its own request when it ends. With
  `batch`, spans are batched as today.
- Every span passes the export filter before it is sent, under both timings. A span the filter drops causes no
  request.
- A missing or invalid `exportTiming` starts no tracing, like any other invalid value.
- The `pagehide` flush still runs under both timings.

**Expected errors**: None. A failure leaves the page untouched.

**Defects and interruption**: Unchanged.

**Effect environment requirements**: None; this workspace has no Effect code.

**Compatibility and relationships**: Server and page ship in one build, so the meta content and its parser change
together.

### Contract evidence

| Claim                                                | Meaningful violation                                          | Durable evidence                                       | Manual/transient evidence                                      | Limitations and non-duplication                                     |
| ---------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| The page exports with the server's timing            | The page batches under `immediate`, or the reverse            | None: browser export is observed, not tested (spec L1) | Playwright request times, quickstart §B (V-004, V-006)         | Sampled interactions                                                |
| The filter runs under both timings                   | A filtered record or attribute is sent under `immediate`      | None                                                   | Exhaustive inspection of the run's browser records, §B (V-020) | Seeded probes                                                       |
| A record made just before a navigation is still sent | The Log in activation's record is missing under either timing | None                                                   | The navigating interaction, quickstart §B (V-017)              | One record at a time; a burst can exceed the keepalive limits (L-2) |

### `scripts/test-run.ts`

**Responsibility**: The environment of a test run with telemetry on.

**Actual consumers**:

- `scripts/test-telemetry.ts`, the entry of `pnpm test:telemetry`.
- `tests/tooling/test-run.test.ts`.

**Proposed signatures**:

```ts
export type TestRun =
  | { readonly telemetry: "off"; readonly env: NodeJS.ProcessEnv }
  | { readonly telemetry: "on"; readonly env: NodeJS.ProcessEnv; readonly runId: string }

/**
 * The environment a test command runs with. `telemetry` is `off`, with `env` unchanged, when `OTEL_SDK_DISABLED`
 * holds a true literal. Otherwise absent or empty settings get the local defaults and `TEST_TELEMETRY` is `true`.
 */
export function testRunEnvironment(env: NodeJS.ProcessEnv, generateRunId: () => string): TestRun
```

**Inputs and validation ownership**: The caller's environment. The function decides only whether telemetry is on
and which defaults apply. The application and the test helper still validate the values they read.

**Success semantics and invariants**:

- A supplied non-empty `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, `OTEL_SERVICE_VERSION`,
  `TELEMETRY_EXPORT_TIMING`, or `service.instance.id` entry is never replaced.
- Existing `OTEL_RESOURCE_ATTRIBUTES` entries are kept; one `service.instance.id` entry is appended only when none
  is present. `runId` is that entry's value, supplied or generated.
- The true literals are the ones the application's off switch accepts, listed in
  [Observability](../../../docs/observability.md#environment-variables).
- The input object is not mutated.

**Expected errors**: None. The entry script exits with the child command's status, and with a usage message when no
command is given.

**Defects and interruption**: The entry script forwards `SIGINT` and `SIGTERM` to the child.

**Effect environment requirements**: None. Root tooling stays plain TypeScript.

**Compatibility and relationships**: New. The root `package.json` gains a `test:telemetry` script that runs
`node scripts/test-telemetry.ts`.

### Contract evidence

| Claim                                                          | Meaningful violation                                           | Durable evidence                                                                                                                                              | Manual/transient evidence                             | Limitations and non-duplication                                                                         |
| -------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Explicit settings win and the off switch wins (V-014)          | A supplied run identifier is replaced; a disabled run turns on | `tests/tooling/test-run.test.ts` examples: no settings, each explicit setting, existing resource attributes with and without an identifier, each true literal | Run selection and the zero-request run, quickstart §D | `pnpm test:tooling` is not part of any CI workflow today ([plan Review notes](../plan.md#review-notes)) |
| The command alone is enough for a requirements BDD run (V-011) | The owned application fails to start or exports nothing        | None                                                                                                                                                          | A tagged run found in the local stack, quickstart §D  | Sampled selection                                                                                       |

### `packages/frontend-services/tests/helpers/telemetry.ts`

**Responsibility**: Telemetry for the code a frontend-services test exercises.

**Actual consumers**:

- `tests/helpers/session.ts` (`sessionWorld`) and the lib, unit, and integration test files that build their own
  layers or mock `Runtime.runPromise`.

**Proposed signatures**:

```ts
/** Empty unless the test run was started through `pnpm test:telemetry`. Never fails. */
export const testTelemetry: Layer.Layer<never>
```

**Inputs and validation ownership**: `TEST_TELEMETRY` and the settings the command prepared. The helper builds a
plain `OtelEnabled` value from them; it does not parse `StartupConfig`.

**Success semantics and invariants**:

- Without the marker the layer is empty and no OpenTelemetry code runs (FR-020).
- With it, programs provided the layer export their spans and logs through the application's `observabilityLayer`,
  with the timing the environment names.
- A record carries the time of the clock its program runs under. The helper does not replace a test's clock, so a
  program under `TestClock` or a fixed `Clock` exports records stamped with that clock's time (plan L-5).
- The pipeline is built once per test file and disposed in a file-level `afterAll`, so its records have left when
  the file finishes (FR-025).
- A build failure or an unreachable collector changes no test result (FR-022).

**Expected errors**: None.

**Defects and interruption**: None surfaced to tests.

**Effect environment requirements**: None.

**Compatibility and relationships**: Test support only. It imports the public `src/observability.ts` and
`src/config.ts`.

### Contract evidence

| Claim                                               | Meaningful violation                             | Durable evidence                                          | Manual/transient evidence                                             | Limitations and non-duplication                                                                               |
| --------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A unit or integration run exports what it exercises | Nothing reaches the local stack with the command | None: test telemetry is observed, not tested              | One unit and one integration selection, quickstart §E (V-012)         | Only programs run through a provision point export (L-3); the sampled programs run under the wall clock (L-5) |
| Turning telemetry on changes no result              | A test fails or hangs with the command           | The suites themselves, compared across three runs (V-013) | The three-way comparison, quickstart §D and §E                        | A selection (verification L-sample)                                                                           |
| Records have left when the command returns          | The last test's records are missing              | None                                                      | Receiver contents at return, under each timing, quickstart §E (V-016) | —                                                                                                             |

## Cross-module dependency direction

`config` ← `observability` ← `runtime` ← `production-runtime`, and `next` reads `BrowserTracing` through the
runtime, as today. `config/otel.ts` and `observability/sdk.ts` stay private children of their parents. In the Next
application, `app` and the client entry import only `shared/browser-tracing.ts`, which alone imports its children.
`scripts/test-telemetry.ts` imports `scripts/test-run.ts`; nothing under `packages/` imports `scripts/`. The test
helper imports frontend-services public modules only. The BDD support code imports nothing new.

## Rejected abstractions and alternatives

- **An export-timing service or strategy interface**: one consumer, two constructor calls.
- **A separate operating-mode setting**: the three modes are combinations of `NODE_ENV`, `OTEL_SDK_DISABLED`, and
  the new setting; a fourth variable would let them disagree.
- **A test-telemetry switch inside `StartupConfig`**: a test concern in product configuration.
- **A shared defaults module imported by both the BDD support code and the frontend-services tests**: the command
  already hands both the same environment.
- **A Vitest alias or setup file that injects telemetry into every test**: it cannot reach `Effect.runPromise` and
  `ManagedRuntime` tests (research D8).
- **A committed receiver**: `verification.md` makes it a verification aid that is not committed.

## Open decisions

### Blocking contract decisions

- None.

### Implementation choices left to tasks

- Whether `packages/frontend` takes `@opentelemetry/core` from the `opentelemetry` catalog for the export result
  code, or the filter answers through a locally typed result. Adding the dependency changes the lockfile and is
  listed separately in the pull request.
- Whether the test helper registers its `afterAll` itself or through a `setupFiles` entry, if registration from a
  helper module proves unreliable.
- The exact wording and placement of the fixed lines the command prints.
- Whether `sdk.ts` stays one function or gains a private helper, as Fallow's complexity limits require.
