# Implementation Plan: Configurable Telemetry Export Timing

**Branch**: `385-telemetry-export-timing-plan` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)

**Input**: Feature contract in `specs/385-telemetry-export-timing/spec.md` and
`specs/385-telemetry-export-timing/verification.md` at spec commit `371a385`; delivery issue
[#475](https://github.com/PathableAI-org/Pre-ETS/issues/475)

**Risk tier**: High, new behavior, trigger 4, as the specification records. Every slice gets a verification report
and a code review.

## Summary

Add one setting, `TELEMETRY_EXPORT_TIMING`, to the frontend process's `StartupConfig`. It takes `immediate` or
`batch`. When it is absent, a production-mode process batches and a development or test process exports
immediately. The server's pipeline builder picks simple or batch span and log processors from the effective value;
everything in front of the processor (query removal, resource, endpoint, headers) is shared, and metrics are
untouched. The effective value is rendered to protected documents as a fifth browser-tracing value, and the page
picks its span processor the same way behind the existing export filter.

Research found that a production server stopped by `SIGTERM` delivers none of its pending records today, because
Next's own signal handler exits first ([research D5](research.md#d5--delivery-at-an-orderly-stop)). The plan turns
on Next's manual signal handling in the `start` script and the BDD harness, so the runtime's existing handler
disposes the runtime, which flushes telemetry, and then exits.

One command, `pnpm test:telemetry <test command>`, runs any test command with telemetry on. It fills in local
defaults that explicit settings override, and the off switch wins. A requirements BDD run needs nothing else,
because its owned application inherits the environment. Unit and integration tests export through one test layer
that wraps the application's own observability layer. CI workflows state `OTEL_SDK_DISABLED` explicitly, and
`docs/observability.md` states the three operating modes once.

No signal, attribute, resource attribute, package, or service is added.

## Technical Context

**Language/Version**: TypeScript 6.0.3 on Node.js 26+; browser code targets current evergreen browsers

**Primary Dependencies**: Next.js 16.4.6, Effect 4.1.4 with `@effect/opentelemetry` 4.1.4 (frontend-services only),
`@opentelemetry/sdk-trace-base` 2.12.0, `sdk-logs` 0.223.0, `sdk-trace-web` 2.12.0, and the OTLP exporters at
0.223.0. No new dependency for the server; one optional direct dependency for the browser
([research D12](research.md#d12--dependencies))

**Storage**: N/A

**Testing**: frontend-services Vitest with `@effect/vitest` (config decoding examples and properties); root
`node --test` tooling tests (the test-run environment); the existing suites compared across runs; the verification
agent's receiver, Playwright, and Grafana MCP procedure in [quickstart.md](quickstart.md). No durable test asserts
telemetry (spec L1)

**Target Platform**: Local `next start` and `next dev` against the `otel-lgtm` Compose profile, and GitHub Actions
for CI. No deployed environment is touched or observed (spec L5)

**Project Type**: Existing pnpm monorepo web application

**Performance Goals**: None for immediate timing, which sends one request per record and is a local feedback mode
(spec L3). Batch timing is unchanged

**Constraints**: Exported content is identical under both timings; every existing exclusion runs before export;
delivery stays best-effort; telemetry never changes a response, a page, or a test result

**Scale/Scope**: Two workspaces, root tooling, three CI workflows, and seven documents. Six slices of 5 to 17
hand-written files

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                             | Gate                                                                          | Result                                                                                                                                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Evidence-grounded specification    | The plan consumes the approved spec and verification plan and changes neither | Pass. No claim, observation, or channel changes. Two findings for the reviewer are in [Review notes](#review-notes).                                                                                                           |
| II. Explicit ownership                | Settings in frontend-services, presentation in the Next app, no backend work  | Pass. Decoding stays in `src/config/`. The page receives its timing from the server. No `effect` import in `packages/frontend`.                                                                                                |
| III. Tenant isolation                 | No tenant, session, or cookie behavior changes                                | Pass. No tenant value is added to any record or document.                                                                                                                                                                      |
| IV. Accessible, server-rendered UI    | No user-visible change                                                        | Pass. One more value in an existing `<meta>` element. No `@pathableai/react` usage changes.                                                                                                                                    |
| V. Meaningful behavioral tests        | Tests protect a named rule; telemetry is observed, not asserted               | Pass. Durable tests cover the two pure decisions (V-007, V-008, V-014). Everything else is verification-agent evidence.                                                                                                        |
| VI. Simplicity and verifiable quality | No speculative abstraction; no suppression                                    | Pass. No service, interface, or package. The pipeline choice is two constructor calls. The test layer exists because Effect has no process-wide tracer ([research D8](research.md#d8--how-unit-and-integration-tests-export)). |

Post-design re-check: unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/385-telemetry-export-timing/
├── spec.md               # approved specification (spec PR)
├── verification.md       # approved verification plan (spec PR)
├── checklists/requirements.md
├── plan.md               # this file
├── research.md
├── quickstart.md
└── contracts/
    ├── modules.md
    └── telemetry.md
```

No `data-model.md`: the feature stores nothing and its one entity is a two-value setting.

### Source Code (repository root)

```text
packages/frontend-services/
├── src/config.ts                    # ExportTiming; passes the NODE_ENV recipe to the OTEL builder
├── src/config/otel.ts               # TELEMETRY_EXPORT_TIMING, the default rule, browser settings' timing
├── src/observability/sdk.ts         # simple or batch span and log processors
├── src/next/browser-tracing.ts      # fifth browser value
├── src/production-runtime.ts        # bounded orderly stop
├── tests/lib/config.test.ts         # V-007, V-008 examples and properties
├── tests/helpers/telemetry.ts       # NEW: testTelemetry layer
├── tests/helpers/session.ts         # sessionWorld provides testTelemetry
└── tests/{lib,unit,integration}/*   # each layer-building point provides testTelemetry

packages/frontend/
├── package.json                     # start sets NEXT_MANUAL_SIG_HANDLE=true
├── .env.example                     # the setting, linked to the modes section
├── src/shared/browser-tracing.ts    # renders and checks exportTiming
└── src/shared/browser-tracing/
    ├── sdk.ts                       # simple or batch span processor
    └── export-filter.ts             # no request for an empty export

scripts/test-telemetry.ts            # NEW: entry of pnpm test:telemetry
scripts/test-run.ts                  # NEW: testRunEnvironment
tests/tooling/test-run.test.ts       # NEW: V-014 examples
tests/bdd/support/harness.ts         # owned process sets NEXT_MANUAL_SIG_HANDLE
package.json                         # test:telemetry script

.github/workflows/ci-quality.yml, ci-build.yml, ci-bdd.yml   # explicit OTEL_SDK_DISABLED
docs/observability.md, docs/docker-compose.md, docs/engineering/verification-harness.md,
docs/engineering/testing/README.md, features/README.md, .agents/skills/verification-harness/SKILL.md
```

**Structure Decision**: Existing workspaces and owners. The only new modules are the root script pair, which
follows the `scripts/verify.ts` and `scripts/verification.ts` pairing, and one test helper beside the existing
`tests/helpers/` modules.

## Complexity Tracking

No constitution violation to justify.

## Phased Engineering Design

### Phase 1 — Module architecture

See [contracts/modules.md](contracts/modules.md#module-architecture-decisions). In short:

- **Extend** the settings (`OtelEnabled.exportTiming`, `BrowserTracingSettings.exportTiming`), the pipeline builder
  behind `observabilityLayer`, the browser configuration adapter, and the shared browser-tracing module.
- **Extend behavior** of `startProductionRuntime`'s signal handling, with the launchers selecting Next's manual
  signal handling.
- **Add** a root script pair for the test-run command and one frontend-services test helper.
- **Preserve** `compose.yaml`, the metric readers, `QueryFreeSpanProcessor`, the export filter's allow lists, every
  span and log, and the BDD harness's process ownership.

No new package, workspace, service, provider interface, or Effect code in the Next app or in root tooling.

### Phase 2 — Public module contracts

See [contracts/modules.md](contracts/modules.md#public-contracts). Compatibility-sensitive decisions:

- `OtelEnabled` and `BrowserTracingSettings` each gain a required `exportTiming`. Their only construction site is
  `config/otel.ts`.
- `BrowserTracingConfig` gains `exportTiming`, so the meta content has five values. The facade that renders it also
  parses it, and an invalid or missing value starts no tracing.
- `startProductionRuntime` keeps its signature. A signalled production server now exits with code 0 after disposal,
  not with Next's 143.
- `observabilityLayer` keeps its signature and its error.
- `testRunEnvironment` and `testTelemetry` are new, with tooling and test consumers only.

### Phase 3 — Module contract evidence

See the evidence tables in [contracts/modules.md](contracts/modules.md#public-contracts).

- **Durable**: config decoding examples and two properties (V-007, V-008), one browser-settings example per timing,
  and tooling examples for the test-run environment (V-014). The existing suites are the evidence that telemetry
  leaves results alone (V-013), compared across runs by the verifier.
- **Feature, at the receiver or in the browser**: every timing, count, absence, and exit observation.
- **Not durable**: spans, logs, export requests, and processor wiring, which the verification agent observes (spec
  L1).
- **Transient, already done**: the six feasibility probes in [research.md](research.md#probes). They are not
  verification of any claim.

### Phase 4 — Implementation architecture

- **Settings** ([D1](research.md#d1--setting-decoding-and-the-default-rule)): `config/otel.ts` adds the optional
  literal to its `Config.all` and resolves the default from the `NODE_ENV` recipe that `config.ts` passes in. The
  disabled branch is unchanged, so a supplied value still has to decode.
- **Server pipeline** ([D2](research.md#d2--the-servers-immediate-pipeline),
  [D3](research.md#d3--no-in-flight-export-limit-under-immediate-timing)): in `observability/sdk.ts`, `batch`
  constructs today's processors with today's arguments. `immediate` constructs `SimpleSpanProcessor` and
  `SimpleLogRecordProcessor` over exporters with an unbounded in-flight limit. `QueryFreeSpanProcessor` wraps either.
  The Node SDK and the Effect bridge still share the two processors. Metric readers do not change.
- **Orderly stop** ([D5](research.md#d5--delivery-at-an-orderly-stop)): `packages/frontend/package.json` `start`
  runs `NEXT_MANUAL_SIG_HANDLE=true next start`, and the BDD harness adds the variable to the owned process's
  environment. `production-runtime.ts` keeps dispose-then-exit and adds the 10-second deadline. The Effect
  OpenTelemetry layers flush and shut down on release within their 3-second timeout, which is what bounds a stop
  with an unreachable collector.
- **Browser** ([D6](research.md#d6--the-browser-follows-the-servers-timing)): `next/browser-tracing.ts` copies
  `exportTiming` into the configuration. `shared/browser-tracing.ts` renders and checks it. `browser-tracing/sdk.ts`
  constructs the simple or batch processor over the filtered exporter, with the unbounded limit under `immediate`.
  `export-filter.ts` answers success without calling the exporter when no span remains.
- **Test-run command** ([D7](research.md#d7--one-command-turns-telemetry-on-for-a-test-run)):
  `scripts/test-run.ts` holds the pure environment function. `scripts/test-telemetry.ts` prints the run identifier,
  spawns the command with inherited standard streams, forwards signals, and exits with its status.
- **Test processes** ([D8](research.md#d8--how-unit-and-integration-tests-export)): `tests/helpers/telemetry.ts`
  builds `observabilityLayer` once per test file behind the marker, exposes its context as `testTelemetry`, and
  disposes it in `afterAll`. Suite files provide the layer where they build their layers.
- **CI and documentation** ([D9](research.md#d9--ci-states-its-mode), [D10](research.md#d10--documentation-owners)).
- **Sequencing**: server timing → browser timing → orderly stop → test-run command → test suites → modes, CI, and
  documentation. This is the slice order below.

### Phase 5 — Feature verification integration

[verification.md](verification.md) owns the claims. [quickstart.md](quickstart.md) maps each of its twelve
procedure steps to commands, environment, expected observations, and the slice that first makes the step
executable. The temporary receiver is described there by its behavior and is not committed. Module evidence
(V-007, V-008, V-014) is cited in the map and not repeated as feature evidence. The V-013 comparison is run once
per suite kind, in the slice that makes that kind export. The last slice repeats the whole procedure at the
revision that closes the issue.

### Phase 6 — Verification telemetry contract

See [contracts/telemetry.md](contracts/telemetry.md). It adds no signal. Four rows reference existing records: the
server request trace (T-001), the `Reading tenant configuration` log (T-002), the browser records (T-003), and the
service spans a test exercises (T-004). Verification runs set `LOG_LEVEL=Debug` so every sampled request emits
T-002. Facts not emitted are the time and count of export requests, absence of export, the effective timing, and
the document's configuration; they are observed at the receiver, through Playwright, and by module tests. Collector
header values, query strings, and fragments are never exported or recorded.

### Phase 7 — Implementation slices

| Slice | Branch                               | Decision a reviewer accepts                                                                                                                                                                                                | Contracts and modules                                                                                                                              | Telemetry rows | Full claims                                     | Partial claims                                                                                                            | Quickstart sections                                                          | Est. hand-written files |
| ----- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------- |
| **A** | `385-telemetry-export-timing-impl`   | One setting selects immediate or batch export of server traces and logs, defaulting by mode, refusing any other value, leaving metrics and exported content unchanged                                                      | `config.ts` (`ExportTiming`, `OtelEnabled.exportTiming`), `config/otel.ts`, `observability/sdk.ts`; config tests                                   | T-001, T-002   | V-001, V-002, V-005, V-007, V-008, V-009, V-021 | V-003 (environment from this guide; the harness documentation lands in F); V-019 (server records); V-020 (server records) | Prerequisites; Receiver; Module evidence; §A; Telemetry queries; Cleanup     | 6                       |
| **B** | `385-telemetry-export-timing-impl-b` | The page exports with the server's timing, received as a fifth configuration value, behind the same export filter, and a filtered-out span sends nothing                                                                   | `config.ts` (`BrowserTracingSettings.exportTiming`), `next.ts` (`BrowserTracingConfig`), `shared/browser-tracing.ts`, `sdk.ts`, `export-filter.ts` | T-003          | V-004, V-006, V-017, V-019, V-020, V-022        | —                                                                                                                         | Prerequisites; Receiver; Module evidence; §B; Telemetry queries; Cleanup     | 8                       |
| **C** | `385-telemetry-export-timing-impl-c` | The application owns `SIGTERM` and `SIGINT` in a production server, so an orderly stop delivers pending records under both timings and still ends when the collector is unreachable                                        | `production-runtime.ts` (`startProductionRuntime`); frontend `start` script; BDD harness `siteEnv`                                                 | —              | V-015, V-018                                    | —                                                                                                                         | Prerequisites; Receiver; §C; Cleanup                                         | 5                       |
| **D** | `385-telemetry-export-timing-impl-d` | One command, `pnpm test:telemetry`, turns telemetry on for a test run with local defaults; explicit settings and the off switch win; a requirements BDD run exports through it                                             | `scripts/test-run.ts` (`testRunEnvironment`), `scripts/test-telemetry.ts`; root `package.json`; tooling test                                       | T-001, T-002   | V-011, V-014                                    | V-013 (requirements BDD selection); V-016 (requirements BDD run)                                                          | Prerequisites; Receiver; Module evidence; §D; Telemetry queries; Cleanup     | 8                       |
| **E** | `385-telemetry-export-timing-impl-e` | Unit and integration tests of the instrumented workspace export what they exercise through one test layer, only behind the command, with unchanged results                                                                 | `tests/helpers/telemetry.ts` (`testTelemetry`); `tests/helpers/session.ts`; suite files' layer-building points                                     | T-004          | V-012, V-013, V-016                             | —                                                                                                                         | Prerequisites; Receiver; §E; Telemetry queries; Cleanup                      | 17                      |
| **F** | `385-telemetry-export-timing-impl-f` | CI states telemetry off where it sets its environment, the observability documentation states the three modes once, and the other documents link to it and drop the batch-interval wait; #475's completion evidence is met | CI workflow `env` blocks; documentation only                                                                                                       | T-001, T-002   | V-003, V-010, V-023                             | —                                                                                                                         | Prerequisites; Receiver; Module evidence; §A; §F; Telemetry queries; Cleanup | 11                      |

**Planned files per slice** (hand-written; a lockfile change is possible only in B):

- **A (6):** `frontend-services/src/config.ts`, `src/config/otel.ts`, `src/observability/sdk.ts`,
  `tests/lib/config.test.ts`; `docs/observability.md` (the setting, its values and defaults, the immediate
  pipeline, metrics unchanged, never set in production); `packages/frontend/.env.example`.
- **B (8):** `frontend-services/src/config/otel.ts`, `src/next/browser-tracing.ts`, `tests/lib/config.test.ts`;
  `frontend/src/shared/browser-tracing.ts`, `src/shared/browser-tracing/sdk.ts`,
  `src/shared/browser-tracing/export-filter.ts`; `docs/observability.md` (five values, browser timing);
  `packages/frontend/package.json` only if `@opentelemetry/core` becomes a direct dependency, with `pnpm-lock.yaml`
  listed separately.
- **C (5):** `packages/frontend/package.json` (`start`), `frontend-services/src/production-runtime.ts`,
  `tests/bdd/support/harness.ts`, `docs/observability.md` (orderly stop, exit code, launchers),
  `docs/docker-compose.md` (starting the application).
- **D (8):** `scripts/test-run.ts`, `scripts/test-telemetry.ts`, `tests/tooling/test-run.test.ts`, `package.json`,
  `docs/observability.md` (the command, selecting a run's records), `docs/engineering/testing/README.md`,
  `features/README.md`, `tests/bdd/steps/README.md` only if it names the environment.
- **E (17):** `frontend-services/tests/helpers/telemetry.ts`, `tests/helpers/session.ts`; `tests/lib/`
  `authentication.test.ts`, `authentication-failures.test.ts`, `tenant.test.ts`, `tenant-policy.test.ts`,
  `session-policy-refresh.test.ts`; `tests/unit/` `authentication-entry.test.ts`,
  `authentication-entry-failures.test.ts`, `coordination.test.ts`, `protection.test.ts`,
  `reference-session-enforcement.test.ts`; `tests/integration/` `authentication-redis.test.ts`,
  `session-redis.test.ts`, `session-redis-outage.test.ts`, and `coordination-redis.test.ts` or
  `protection-redis.test.ts` where a second runtime is built without `sessionWorld`;
  `docs/engineering/testing/README.md`.
- **F (11):** `.github/workflows/ci-quality.yml`, `ci-build.yml`, `ci-bdd.yml`; `docs/observability.md` (the
  "Operating modes" section; batch waits removed), `docs/docker-compose.md`,
  `docs/engineering/verification-harness.md`, `.agents/skills/verification-harness/SKILL.md`,
  `docs/engineering/testing/README.md`, `features/README.md`, `packages/frontend/.env.example`, `README.md` if its
  observability pointer needs the link.

Each slice also appends its rendered results to `quickstart.md`, which is not counted.

Order and independence:

- **A** lands first because every later slice reads `exportTiming`. Its consumer is the pipeline builder and its
  evidence is the config tests plus the receiver. It is the trigger-4 change to the server exporter.
- **B** is the trigger-4 change to the browser exporter. Until it merges the page batches whatever the server
  does, which is today's behavior and no claim of A.
- **C** follows B because V-018 compares a browser journey under immediate timing. It changes how every production
  server and every BDD-owned process stops, so it is its own decision.
- **D** and **E** split the test-telemetry requirement by mechanism. D needs no test-file change. E is seventeen
  files because the same one-line provision goes into each suite file that builds its own layers, and Effect offers
  no single point that reaches them all ([research D8](research.md#d8--how-unit-and-integration-tests-export)).
  Splitting unit from integration would assert V-012, V-013, and V-016 twice in halves, so the slice stays whole.
- **F** closes #475. Only its pull request may say `Closes #475`, and only when its report passes the gate. It
  edits CI workflows, which the repository's guardrails put behind a person's confirmation.
- Each slice passes typecheck, lint, `pnpm check:unused`, and `pnpm check:health` on its own. `ExportTiming` lands
  with its first consumer in A, the browser value with the page in B, `testRunEnvironment` with its command and
  test in D, and `testTelemetry` with its consumers in E.

Plan limitations, approved with this plan for the verification gate:

- **L-1:** A production server started without `NEXT_MANUAL_SIG_HANDLE=true`, which means by any launcher other
  than the frontend workspace's `start` script or the BDD harness, still ends in Next's own signal handler and
  loses its pending records, as before this feature. V-015 is observed through the documented start command.
- **L-2:** Under immediate timing the page sends each record in its own request. The browser keeps at most nine
  pending keepalive requests and 64 KiB in total, so records made in a burst just before the page unloads may be
  sent without keepalive and lost. V-017 samples one interaction that navigates.
- **L-3:** A unit or integration test exports only when its program runs through a point that provides the test
  layer: `sessionWorld`, a suite file's layer factory, or its mocked runtime. Tests of pure functions and of
  config decoding export nothing. V-012 samples selections that run through those points.
- **L-4:** With the collector unreachable, releasing the telemetry layers waits for their 3-second shutdown
  timeout. A stopping server, and each test file run with the command, ends about 3 seconds later, and the BDD
  harness may escalate to `SIGKILL` after its own 3-second wait. No result changes and nothing deliverable is lost.

## Review notes

Findings and open points for the reviewer. None changes an acceptance criterion, observation, or channel.

1. **Pending records are lost at `SIGTERM` today (research P2).** The specification requires an orderly stop to
   deliver them under both timings (FR-024). At the base revision a production server delivers none of them. Slice
   C fixes it through Next's manual signal handling. The visible consequences are exit
   code 0 and the absence of Next's listener close. A deployment that launches `next start` itself must set the
   variable; no deployment configuration lives in this repository (L-1).
2. **The in-flight export limit (research P4).** Immediate timing removes the exporter's limit of 30 concurrent
   requests so no record is dropped. With an unreachable collector, pending requests grow until each one's own
   timeout. That is acceptable for a mode that is assumed never to be set in production (spec Assumptions).
3. **`pnpm test:tooling` is not run by CI.** The V-014 examples live with the other tooling tests, which no workflow
   runs today. The plan does not add them to CI, because that changes what CI gates for all tooling tests. A
   maintainer may ask slice F to add the step.
4. **V-010's receiver address.** `verification.md` puts the receiver on the local stack's address. The quickstart
   has the verifier stop only its own `otel-lgtm` for that step, and report `blocked` on a shared stack. If shared
   stacks are the norm, the observation needs a specification correction.
5. **The sampled log record.** Verification sets `LOG_LEVEL=Debug` so each request emits the existing
   `Reading tenant configuration` record. The server has no per-request record at the default level, and the
   specification excludes adding one.
6. **Open Renovate branch.** `renovate/opentelemetry-stack` may move the OpenTelemetry versions this plan was
   checked against. The implementation session re-checks the simple processors' flush and shutdown behavior and
   the exporter option if it merges first.
