# Tasks: Configurable Telemetry Export Timing

**Input**: [plan.md](plan.md), [spec.md](spec.md), [verification.md](verification.md),
[contracts/modules.md](contracts/modules.md), [contracts/telemetry.md](contracts/telemetry.md),
[research.md](research.md), [quickstart.md](quickstart.md)

**Organization**: Tasks are grouped by the implementation slices in [plan.md](plan.md#phase-7--implementation-slices),
in slice order. Each slice is one stacked pull request and is marked ready only after its verification report passes
the [verification gate](../../docs/engineering/verification-harness.md#gate-and-escalation) and its code review has
no open blocking finding. Paths are relative to the repository root; `fs/` abbreviates `packages/frontend-services/`
and `fe/` abbreviates `packages/frontend/`. `[P]` marks a task that can run in parallel with the other `[P]` tasks of
the same group. Story labels map to [spec.md](spec.md) user stories.

Every slice ends with the [Before committing](../../AGENTS.md#before-committing) checks: `pnpm typecheck`,
`pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm check:unused`, `pnpm check:health`, and `pnpm check:changes`.
No check is suppressed. The feature adds no signal: every telemetry row (T-001 to T-004) is an existing record, so no
task commits instrumentation, and no durable test asserts a span, log, export request, or processor (spec L1). The
temporary receiver in [quickstart.md](quickstart.md#receiver) is the verifier's aid and is never committed.

## Slice A — Server export timing (`385-telemetry-export-timing-impl`)

One setting selects immediate or batch export of server traces and logs, defaulting by mode, refusing any other
value, and leaving metrics and exported content unchanged. Reads T-001 and T-002. Asserts V-001, V-002, V-005,
V-007, V-008, V-009, and V-021 in full, and V-003 (environment from the quickstart; the harness documentation lands in
F), V-019 (server records), and V-020 (server records) in part. `Contributes to #475`.

### Baseline

- [x] T001 Re-verify the installed facts research D1–D3 rely on (modules.md "Status"): `effect` 4.1.4
      `Config.option(Config.Literals(["immediate", "batch"], "TELEMETRY_EXPORT_TIMING"))` decodes absent and empty to
      none under both `ConfigProvider.fromEnv` and `ConfigProvider.fromUnknown`, and fails case-sensitively with an
      error naming the setting; `@opentelemetry/sdk-trace-base` 2.12.0 exports the shim `SimpleSpanProcessor` with the
      single-exporter constructor; `@opentelemetry/sdk-logs` 0.223.0 `SimpleLogRecordProcessor({ exporter })`; the
      OTLP exporters at 0.223.0 accept `concurrencyLimit` and treat `Number.POSITIVE_INFINITY` as no limit
      (`length >= limit` is never true, and only `timeoutMillis` is validated). Renovate PR #462 is still open, so the
      versions above are current.

### The setting and its default (US1, US2, FR-001, FR-004–FR-006, research D1)

- [x] T002 [US2] In `fs/src/config.ts`, export `type ExportTiming = "batch" | "immediate"` and pass the existing
      `AppEnv` recipe to the child builder: `otel: otelConfig(withoutEcho, AppEnv)`. Re-export nothing else new.
- [x] T003 [US2] In `fs/src/config/otel.ts`, add `readonly exportTiming: ExportTiming` to `OtelEnabled` (documented as
      `TELEMETRY_EXPORT_TIMING`, or the default for the process's `NODE_ENV`), add
      `exportTiming: Config.option(Config.Literals(["immediate", "batch"], "TELEMETRY_EXPORT_TIMING"))` and `env` to the
      one `Config.all`, and resolve the effective value in the enabled branch: the supplied value, else `batch` when
      `env` is `production` and `immediate` otherwise. The disabled branch is unchanged, so a supplied value still has
      to decode (FR-006). The child builder's signature becomes `otelConfig(withoutEcho, env)`, where `env` is the `AppEnv` recipe. `BrowserTracingSettings` does not change in this slice.

### Module evidence (V-007, V-008)

- [x] T004 [US2] In `fs/tests/lib/config.test.ts`, add a `StartupConfig export timing (V-007, V-008)` group using the
      existing `startupWith` and `otelOn` helpers:
  - `it.effect.each` over mode (`production`, `development`, `test`, absent) by setting (absent, empty, `immediate`,
    `batch`), asserting the effective `otel.exportTiming` FR-004 states;
  - `it.effect.prop` that the timing is `immediate` exactly when the setting is `immediate`, or it is absent or empty
    and the mode is not `production`;
  - `it.effect.prop` over generated strings other than `immediate`, `batch`, and the empty string, with OTEL on and
    off: a `ConfigError` whose text includes `TELEMETRY_EXPORT_TIMING` (modules.md contract evidence, rows 1 and 2).

### Server pipeline (US1, US2, FR-002, FR-003, FR-008–FR-011, research D2–D4; T-001, T-002)

- [x] T005 [US1] In `fs/src/observability/sdk.ts`, pick the span and log processors from `settings.exportTiming`:
      `batch` constructs exactly today's `BatchSpanProcessor` and `BatchLogRecordProcessor` over today's exporters;
      `immediate` constructs `SimpleSpanProcessor` and `SimpleLogRecordProcessor({ exporter })` over the same OTLP
      protobuf exporters and URLs with `concurrencyLimit: Number.POSITIVE_INFINITY`. `QueryFreeSpanProcessor` wraps
      either span processor, the Node SDK and the Effect bridge still share both processors, and both
      `PeriodicExportingMetricReader`s are unchanged. `observabilityLayer`'s signature and error are unchanged. Add a
      private helper if Fallow's complexity limits require one.

### Documentation (FR-028, research D10)

- [x] T006 [P] [US1] In `docs/observability.md`, document `TELEMETRY_EXPORT_TIMING`: its row in the environment
      table, its values and mode defaults, that a value in any other letter case or spelling fails startup naming it,
      that it decodes with telemetry off too, the immediate pipeline (simple processors, no in-flight limit, query
      removal and resource unchanged), that metrics keep their 60-second interval, and that production never sets
      `immediate`. Update the runtime summary that names batch processors and the "Startup and export policy"
      paragraph on batch intervals. The "Operating modes" section and the removal of the remaining batch waits are
      slice F's.
- [x] T007 [P] [US1] In `fe/.env.example`, add a commented `TELEMETRY_EXPORT_TIMING` line in the OpenTelemetry block
      with its two values and defaults, pointing at `docs/observability.md`.

### Slice completion

- [ ] T008 Run the Before committing checks and the frontend-services config tests (`tests/lib/config.test.ts`); run the pre-push self-review against the plan branch; commit; push the draft pull request
      through `speckit-stack` and report `pushed`.
- [ ] T009 Answer each verification result (quickstart Module evidence, §A, Telemetry queries, Cleanup) and each
      review finding; on a passing `pnpm verify:gate`, run `pnpm verify:render --write`, commit the evidence-only
      result, write the pull request body with Decisions for the reviewer naming the verified SHA, and mark it ready.

## Slice B — Browser export timing (`385-telemetry-export-timing-impl-b`)

The page exports with the server's timing, received as a fifth configuration value, behind the same export filter, and
a filtered-out span sends nothing. Reads T-003. Asserts V-004, V-006, V-017, V-019, V-020, and V-022 in full.

### The fifth value (US3, FR-013, FR-014, research D6)

- [x] T010 [US3] In `fs/src/config/otel.ts`, add `readonly exportTiming: ExportTiming` to `BrowserTracingSettings`
      ("the server's effective export timing; the page has no other source for it") and copy the effective timing into
      it in `parseBrowserTracing`, so `browserTracing.exportTiming` always equals `exportTiming`.
- [x] T011 [US3] In `fs/tests/lib/config.test.ts`, extend the browser-tracing settings group: one example per timing
      that `browserTracing.exportTiming` equals `otel.exportTiming`, and add `exportTiming` to the existing "carries
      exactly" example (modules.md contract evidence, row 3; V-022 supporting).
- [x] T012 [US3] In `fs/src/next/browser-tracing.ts` and the `BrowserTracingConfig` type it owns through `fs/src/next.ts`,
      add `readonly exportTiming: "batch" | "immediate"` and copy it from the settings; the configuration holds
      exactly the five values and never collector headers.

### The page (US3, FR-010, FR-013, FR-026)

- [x] T013 [US3] In `fe/src/shared/browser-tracing.ts`, render `exportTiming` in `BrowserTracingMeta` and check it as
      `immediate` or `batch` beside the four existing checks; a missing or invalid value starts no tracing.
- [x] T014 [US3] In `fe/src/shared/browser-tracing/sdk.ts`, construct `SimpleSpanProcessor` under `immediate` and
      `BatchSpanProcessor` under `batch` over the same `filterExport(new OTLPTraceExporter(…))`, with
      `concurrencyLimit: Number.POSITIVE_INFINITY` on the exporter under `immediate`; keep the `pagehide` flush.
- [x] T015 [US3] In `fe/src/shared/browser-tracing/export-filter.ts`, answer success without calling the exporter when
      no span remains after filtering, under both timings. Decide here whether `fe/package.json` takes
      `@opentelemetry/core` from the `opentelemetry` catalog for the result code or uses a locally typed result; list a
      lockfile change separately in the pull request.
      Decided: `@opentelemetry/core` from the `opentelemetry` catalog, which gains the entry at the installed
      2.12.0; a locally typed result fails `@typescript-eslint/no-unsafe-enum-assignment`.
- [x] T016 [P] [US3] In `docs/observability.md`, update "Browser tracing switch" to five values and "Browser export"
      to say the page follows the server's timing, that a filtered-out span sends nothing, and that the 30-second
      wait applies only under `batch`; record plan limitation L-2.
      Corrected while writing it: the installed web SDK batches for about 5 seconds (30 seconds is its export
      timeout), and the transport stops using `keepalive` at 60 KiB of pending bodies.

### Slice completion

- [ ] T017 Run the checks, the frontend unit tests, and the config tests; run the pre-push self-review against slice
      A's branch; push the draft stacked on A; send both requests (quickstart Module evidence, §B, Telemetry queries,
      Cleanup).
- [ ] T018 Answer results and findings; on a passing gate, render and commit the evidence, write the body, mark ready.

## Slice C — Orderly stop (`385-telemetry-export-timing-impl-c`)

The application owns `SIGTERM` and `SIGINT` in a production server, so an orderly stop delivers pending records under
both timings and still ends when the collector is unreachable. Asserts V-015 and V-018 in full.

- [ ] T019 [US6] In `fe/package.json`, change `start` to run `NEXT_MANUAL_SIG_HANDLE=true next start` after the
      frontend-services build; leave `dev` unchanged (research D5).
- [ ] T020 [US6] In `fs/src/production-runtime.ts`, keep dispose-then-exit-0 on the first `SIGTERM` or `SIGINT` and add
      the existing 10-second fatal bound as a deadline after which the process exits anyway; a failed disposal is still
      ignored. `startProductionRuntime`'s signature is unchanged (modules.md).
- [ ] T021 [US6] In `tests/bdd/support/harness.ts`, add `NEXT_MANUAL_SIG_HANDLE: "true"` to `siteEnv` for the owned
      process. No telemetry logic.
- [ ] T022 [P] [US6] In `docs/observability.md`, document the orderly stop: disposal flushes, exit code 0, the
      10-second deadline, about 3 seconds with an unreachable collector (L-4), and that only the `start` script and
      the BDD harness set manual signal handling (L-1). In `docs/docker-compose.md`, say to start the application with
      the `start` script.
- [ ] T023 Run the checks and the two BDD tags of quickstart §C step 3 with telemetry off; self-review; push the draft stacked on B; send both requests
      (Prerequisites, Receiver, §C, Cleanup).
- [ ] T024 Answer results and findings; on a passing gate, render and commit the evidence, write the body, mark ready.

## Slice D — The test-run command (`385-telemetry-export-timing-impl-d`)

One command, `pnpm test:telemetry`, turns telemetry on for a test run with local defaults; explicit settings and the
off switch win; a requirements BDD run exports through it. Reads T-001 and T-002. Asserts V-011 and V-014 in full, and
V-013 (requirements BDD selection) and V-016 (requirements BDD run) in part.

- [ ] T025 [US5] Create `scripts/test-run.ts` with the `TestRun` union and
      `testRunEnvironment(env: NodeJS.ProcessEnv, generateRunId: () => string): TestRun` exactly as modules.md states:
      `off` with `env` unchanged when `OTEL_SDK_DISABLED` holds one of the application's true literals; otherwise fill
      absent or empty `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318/`, `OTEL_SERVICE_NAME=pre-ets-frontend`, and
      `TELEMETRY_EXPORT_TIMING=immediate`, append `service.instance.id=<runId>` to `OTEL_RESOURCE_ATTRIBUTES` only when
      none is present, set `TEST_TELEMETRY=true`, and never mutate the input (research D7).
- [ ] T026 [US5] Create `tests/tooling/test-run.test.ts` with `node:test` examples: no settings, each explicit setting,
      existing resource attributes with and without an identifier, each true literal of the off switch, and input
      immutability (V-014 module evidence).
- [ ] T027 [US5] Create `scripts/test-telemetry.ts`: a usage message and exit code 2 when no command is given; print
      the run identifier on standard error; spawn the command with inherited standard streams and the computed
      environment; forward `SIGINT` and `SIGTERM`; exit with the child's status. Add the `test:telemetry` script, `node scripts/test-telemetry.ts`, to the root `package.json`, and join the new files to Fallow's root zones if needed.
- [ ] T028 [P] [US5] In `docs/observability.md`, document the command and how to select a run's records by
      `service.instance.id` and `service.version`; link it from `docs/engineering/testing/README.md` and
      `features/README.md` (and `tests/bdd/steps/README.md` only if it names the environment).
- [ ] T029 Run the checks and `pnpm test:tooling`; run one tagged BDD selection through the command; self-review; push
      the draft stacked on C; send both requests (Prerequisites, Receiver, Module evidence, §D, Telemetry queries,
      Cleanup).
- [ ] T030 Answer results and findings; on a passing gate, render and commit the evidence, write the body, mark ready.

## Slice E — Unit and integration suites (`385-telemetry-export-timing-impl-e`)

Unit and integration tests of the instrumented workspace export what they exercise through one test layer, only behind
the command, with unchanged results. Reads T-004. Asserts V-012, V-013, and V-016 in full.

- [ ] T031 [US5] Create `fs/tests/helpers/telemetry.ts` exporting `testTelemetry: Layer.Layer<never>`: `Layer.empty`
      unless `TEST_TELEMETRY=true`; otherwise build `observabilityLayer` once per test file from a plain `OtelEnabled`
      value (endpoint, service name, version, and timing from the environment the command prepared; no browser
      tracing; no `StartupConfig` parse), expose its context as the layer, dispose it in a file-level `afterAll`, and
      fall back to the empty layer on a build failure (research D8). Move registration to a `setupFiles` entry only if
      registration from the helper proves unreliable.
- [ ] T032 [US5] Provide `testTelemetry` in `fs/tests/helpers/session.ts` (`sessionWorld`).
- [ ] T033 [US5] Provide `testTelemetry` where each suite file builds its own layers or mocks `Runtime.runPromise`:
      `fs/tests/lib/` `authentication.test.ts`, `authentication-failures.test.ts`, `tenant.test.ts`,
      `tenant-policy.test.ts`, `session-policy-refresh.test.ts`; `fs/tests/unit/` `authentication-entry.test.ts`,
      `authentication-entry-failures.test.ts`, `coordination.test.ts`, `protection.test.ts`,
      `reference-session-enforcement.test.ts`; `fs/tests/integration/` `authentication-redis.test.ts`,
      `session-redis.test.ts`, `session-redis-outage.test.ts`, and `coordination-redis.test.ts` or
      `protection-redis.test.ts` where a second runtime is built without `sessionWorld`.
- [ ] T034 [P] [US5] In `docs/engineering/testing/README.md`, say which unit and integration tests export with the
      command and record plan limitation L-3.
- [ ] T035 Run the checks, the frontend-services unit and integration suites plain and through the command; self-review;
      push the draft stacked on D; send both requests (Prerequisites, Receiver, §E, Telemetry queries, Cleanup).
- [ ] T036 Answer results and findings; on a passing gate, render and commit the evidence, write the body, mark ready.

## Slice F — Modes, CI, and documentation (`385-telemetry-export-timing-impl-f`)

CI states telemetry off where it sets its environment, the observability documentation states the three modes once,
and the other documents link to it and drop the batch-interval wait. Reads T-001 and T-002. Asserts V-003, V-010, and
V-023 in full. Only this pull request may say `Closes #475`, and only when its report passes the gate.

- [ ] T037 [US4] In `.github/workflows/ci-quality.yml`, `ci-build.yml`, and `ci-bdd.yml`, set `OTEL_SDK_DISABLED: "true"` in the workflow-level `env` block with a comment naming the CI mode; drop `ci-bdd.yml`'s `GITHUB_ENV` line
      (research D9). These edits need a person's confirmation under the guardrails.
- [ ] T038 [US7] In `docs/observability.md`, add the "Operating modes" section (production, local development and
      verification, CI; what selects each; the setting's name, values, and defaults; metrics periodic; never
      `immediate` in production) and remove the remaining batch-interval waits (FR-028).
- [ ] T039 [US7] Link that section and remove batch waits in `docs/docker-compose.md`,
      `docs/engineering/verification-harness.md` (the harness environment sets `TELEMETRY_EXPORT_TIMING=immediate`),
      `.agents/skills/verification-harness/SKILL.md`, `docs/engineering/testing/README.md`, `features/README.md`,
      `fe/.env.example`, and `README.md` if its observability pointer needs the link (FR-029).
- [ ] T040 Run the checks; self-review; push the draft stacked on E; send both requests (Prerequisites, Receiver,
      Module evidence, §A, §F, Telemetry queries, Cleanup). The verifier repeats §A to §E at this SHA.
- [ ] T041 Answer results and findings; on a passing gate, render and commit the evidence, write the body with
      `Closes #475`, mark ready.

## Traceability

| Claim or contract                                                | Slice | Tasks                                |
| ---------------------------------------------------------------- | ----- | ------------------------------------ |
| V-001, V-002, V-005, V-021; `observabilityLayer`                 | A     | T005; verifier §A                    |
| V-007, V-008; `StartupConfig` / `OtelEnabled`                    | A     | T002–T004; verifier §A               |
| V-009                                                            | A     | T003 (disabled branch); verifier §A  |
| V-003 (part), V-019 (server), V-020 (server)                     | A     | T005; verifier §A                    |
| V-004, V-006, V-017, V-019, V-020, V-022; `BrowserTracingConfig` | B     | T010–T016; verifier §B               |
| V-015, V-018; `startProductionRuntime`                           | C     | T019–T022; verifier §C               |
| V-011, V-014; `testRunEnvironment`                               | D     | T025–T028; verifier §D               |
| V-013, V-016 (BDD part)                                          | D     | T029; verifier §D                    |
| V-012, V-013, V-016; `testTelemetry`                             | E     | T031–T034; verifier §E               |
| V-003, V-010, V-023                                              | F     | T037–T039; verifier §F               |
| T-001, T-002 (existing)                                          | A, D  | No instrumentation; verifier queries |
| T-003 (existing)                                                 | B     | No instrumentation; verifier queries |
| T-004 (existing)                                                 | E     | No instrumentation; verifier queries |

Approved limitations: plan L-1 to L-4 and the `verification.md` limitations (VL-1 to VL-7). Reused existing evidence:
the existing suites for V-013 and the existing BDD scenarios for slice C's process cleanup.
