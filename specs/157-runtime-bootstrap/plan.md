# Implementation Plan: Deterministic Application Bootstrap and Runtime Composition

**Branch**: `157-runtime-bootstrap-plan` | **Date**: 2026-10-24 | **Spec**: [spec.md](spec.md)

**Input**: Approved feature contract in [spec.md](spec.md) and [verification.md](verification.md). No delivery
issue. The maintainer exception recorded in the specification on 2026-10-24 authorizes this refactor.

## Summary

The frontend keeps one process-lifetime `ManagedRuntime`, built only from Next.js `register()` on the Node.js
server. Startup becomes an explicit sequence: standard-error bootstrap diagnostics, one validated process-wide
configuration value, configured observability, then Redis and application services, then readiness. Required
failures terminate the process with a nonzero status within 10 seconds. Logging, tracing, and metrics export
only for signals that the existing OpenTelemetry precedence selects. Tenant, authentication, session, and
persistence behavior stay on their current public services.

## Technical Context

**Language/Version**: TypeScript, strict NodeNext, Node.js from `.node-version` (26.12.1)

**Primary Dependencies**: Next.js 16.4.2, Effect 4.0.5, `@effect/opentelemetry` 4.0.5, `@effect/platform-node`
4.0.5, existing OpenTelemetry SDK packages, and four new OTLP exporter packages at 0.223.0 for logs and metrics.
See [research.md](research.md) for the declaration checks.

**Storage**: Unchanged. Frontend Redis for sessions and authentication transactions. Tenant files stay
request-selected. No new store.

**Testing**: `@effect/vitest` for configuration, signal selection, and composition. Existing frontend unit,
integration, and requirements-backed suites for preserved behavior. Observability, process exit, readiness, and
shutdown stay manual, as in [verification.md](verification.md).

**Target Platform**: Next.js Node.js server started with `next start` for the manual matrix. Production build
must stay import-safe.

**Project Type**: Existing pnpm workspace. Implementation stays in `packages/frontend`.

**Performance Goals**: No throughput target is authorized. Readiness waits for required startup. Fatal handling
ends within the bound below.

**Constraints**: Fatal-handling bound is **10 seconds** from recognition of a required startup failure until
`process.exit(1)`. Inside that bound, the diagnostic attempt is **1 second** and telemetry shutdown is **3
seconds**. Collector unavailability stays best-effort. No second long-lived runtime, no per-request runtime, and
no automated assertions of logs, spans, metrics, or exporters.

**Scale/Scope**: Frontend bootstrap, process-wide configuration, and observability composition. One local
production server form (`next start`) is the deployment form this plan verifies.

## Constitution Check

_GATE: Passed before research and re-checked after Phase 1 design._

| Principle / constraint                        | Pre-design gate                                                                                                                                                   | Post-design result                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Evidence-grounded specification            | `spec.md` and `verification.md` are the feature contract. There is no delivery issue.                                                                             | The specification records the 2026-10-24 maintainer exception authorizing this refactor without a delivery issue. The constitution's four-part Principle I form (affected rule, justification, scope, removal condition) is not in spec.md yet and is waiting on the maintainer. This plan does not invent an issue number or edit the specification. |
| II. Explicit ownership and authoritative data | Frontend owns bootstrap, tenant configuration, authentication orchestration, and session state.                                                                   | Pass. No backend, shared package, or domain store is introduced. Redis remains frontend-owned.                                                                                                                                                                                                                                                        |
| III. Tenant isolation                         | Request tenant selection and failure behavior stay as they are.                                                                                                   | Pass. `TenantConfigService.layer` still receives the validated process slice and still loads `{alias}.json` per request.                                                                                                                                                                                                                              |
| IV. Accessible, server-rendered UI            | No page or `@pathableai/react` change is required.                                                                                                                | Not applicable. An early request that reaches the process before startup is refused by the runtime facade before tenant, authentication, or session code runs. No new product screen is added.                                                                                                                                                        |
| V. Meaningful behavioral tests                | Module evidence follows consumer, claim, violation, evidence, and limitation. Observability stays manual.                                                         | Pass. [contracts/modules.md](contracts/modules.md) names the claims. [quickstart.md](quickstart.md) operationalizes [verification.md](verification.md) and does not describe those procedures as executed.                                                                                                                                            |
| VI. Simplicity and verifiable quality         | Extend the modules that already own bootstrap, configuration, and observability.                                                                                  | Pass. No new workspace, provider interface, or service locator. New OTLP exporter packages are the logs and metrics counterparts of the installed trace exporters.                                                                                                                                                                                    |
| Architecture and workflow                     | Effect APIs must match the frontend's installed 4.0.5 declarations. The local checkout is guidance only. Planning does not open a pull request or generate tasks. | Pass. Declarations were checked in `packages/frontend/node_modules`. The local Effect checkout `41cf29b5d85af7fc25bcc7713f2e05142edaa66a` is 128 commits ahead of 4.0.5 and was not used as the API source.                                                                                                                                           |

This plan cites the 2026-10-24 maintainer exception already recorded in spec.md and does not invent a delivery
issue. The constitution's four-part Principle I form (affected rule, justification, scope, removal condition)
is not in spec.md yet and is waiting on the maintainer.

## Project Structure

### Documentation (this feature)

```text
specs/157-runtime-bootstrap/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── modules.md
├── spec.md
├── verification.md
└── checklists/
    └── requirements.md
```

`tasks.md` is intentionally absent. It belongs on a later implementation branch.

### Source Code (repository root)

```text
packages/frontend/src/
├── instrumentation.ts                 # Next.js register(); awaits production startup
├── lib/runtime.ts                     # public startup, composition, and request facade
├── lib/observability.ts               # signal selection and NodeSdk layer
├── lib/observability/http.ts          # existing private HTTP client instrumentation
├── lib/config/index.ts                # ServerConfig, OtelConfig, StartupConfig
├── lib/config/otel.ts                 # extended non-validating OTEL parser
├── lib/authentication.ts              # re-exports AuthenticationProcessConfig
└── lib/next.ts                        # maps StartupNotReady to HTTP 503

packages/frontend/tests/lib/
├── config.test.ts                     # existing ServerConfig evidence
├── otel-config.test.ts                # extended parser evidence
├── observability-selection.test.ts    # new precedence evidence
└── runtime-composition.test.ts        # new composition evidence
```

**Structure Decision**: All implementation stays in `@pathableai/pre-ets-frontend`. Public entry files remain
`runtime.ts`, `observability.ts`, `config/index.ts`, `authentication.ts`, `instrumentation.ts`, and `next.ts`.
Private children stay under their current parents. `observability/http.ts` remains private.

## Complexity Tracking

No constitutional violation requires a waiver. The four new exporter dependencies are recorded in
[research.md](research.md) because logs and metrics are required capabilities, and the installed trace exporters
do not provide them.

## Phased Engineering Design

### Phase 1 — Module architecture

Current ownership and the decision for each concern are authoritative in
[contracts/modules.md](contracts/modules.md). Summary:

| Concern                                     | Decision | Why                                                                                                                                           |
| ------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js `register()`                        | Extend   | It is already the process entry. Next.js 16.4.2 waits for it before the server is ready.                                                      |
| `lib/runtime.ts`                            | Extend   | Request handlers, `toNext`, and instrumentation already import it. It becomes import-safe and owns startup and disposal.                      |
| `lib/observability.ts` and `observability/` | Extend   | It already owns the console logger, OTLP traces, and the private HTTP client patch. Logs and metrics join that layer.                         |
| `lib/config`                                | Extend   | `ServerConfig` and `OtelConfig` already own process settings. `StartupConfig` composes them with log level.                                   |
| `authentication.ts` process settings        | Extend   | Bootstrap must validate those settings before Redis. The parent re-exports one Config. Service methods stay unchanged.                        |
| `SessionService`, `TenantConfigService`     | Preserve | Their public layers and outcomes stay. Production passes the already validated server slice into tenant and one frozen provider into session. |
| HTTP client instrumentation                 | Preserve | Query stripping and client spans stay private. Durable tests stop asserting span attributes.                                                  |
| New package, second runtime, readiness flag | Reject   | No current consumer needs another workspace, runtime, or pollable health service.                                                             |

`observability.ts` currently imports `lib/config/env.ts`, a private child of `config`. The logger will take the
already decoded `server.env` and `logLevel` from the parent instead.

Runtime decomposition into `lib/runtime/` was rejected. The request facade, layer nesting, and fatal handler share
one public module. Splitting them would be a size split or would make sibling children import each other.
`observability/selection.ts` was also rejected: `selectObservability` is a function of the existing observability
parent, and a child would not give tests a legal import that the parent cannot provide.

### Phase 2 — Public module contracts

Signatures, errors, invariants, and compatibility are in [contracts/modules.md](contracts/modules.md). Decisions
that reviews need without the full signatures:

- `loadProcessStartup` copies `process.env` into one record and reads it through
  `ConfigProvider.fromEnvRecord(env)`. Later service decoders use that provider. They do not call `fromEnv()`
  again.
- `applicationLayer(startup, infrastructure)` builds observability outside Redis. Tests pass
  `Layer<Redis | NodeServices.NodeServices, RedisError>`. `startProductionRuntime` keeps `NodeRedis.layer`
  inside its own `Layer.provide` chain and does not publish that layer.
- `AuthenticationService.layer`, `SessionService.layer`, and `TenantConfigService.layer(config)` keep their
  current call shapes. Authentication and session still run their existing decoders against the frozen provider.
  Invalid authentication, transaction, and credential settings fail in `loadProcessStartup`, so they are
  configuration failures before Redis is constructed.
- `selectObservability` is the precedence contract. `OtelConfig` still accepts endpoint and protocol strings
  without checking URL or protocol syntax.
- `Runtime.runPromise` exists at import time and refuses to run an effect until startup has installed the
  managed runtime.
- Only `startProductionRuntime` may call `process.exit`.

### Phase 3 — Module contract evidence

Claim tables are in [contracts/modules.md](contracts/modules.md). Durable evidence is configuration decoding,
signal selection, composition order, dependency substitution, and the existing tenant, authentication, session,
and HTTP suites. Those tests assert returned values, typed errors, and whether a substitute infrastructure layer
was built. They do not assert log text, spans, metrics, exporter calls, or pipeline internals.

`packages/frontend/tests/lib/otel-http.test.ts` currently asserts span attributes through a fake tracer. That
conflicts with FR-027. Implementation removes those assertions. Query stripping remains a manual trace
observation in [quickstart.md](quickstart.md), using the attribute rules already in `docs/observability.md`.

Process exit, standard error, collector delivery, readiness, and shutdown are manual feature evidence. Module
tests do not launch `startProductionRuntime`, because that function is the process boundary that exits.

### Phase 4 — Implementation architecture

Private behavior follows the contracts above. Details that are not signatures:

**Import safety.** `runtime.ts` has no top-level `await` and does not read configuration on import. `register()`
returns immediately unless `NEXT_RUNTIME === "nodejs"` and `NEXT_PHASE !== "phase-production-build"`. The current
`phase-production-build` proxy is removed so a build that evaluates the module cannot validate
`TENANT_CONFIG_DIR` or open Redis.

**One runtime, ordered layers.** `startProductionRuntime` loads `ProcessStartup`, then builds:

```ts
applicationCore(startup).pipe(
  Layer.provide(NodeServices.layer),
  Layer.provide(NodeRedis.layer(redisOptions)),
  Layer.provide(observabilityLayer(startup)),
  Layer.provide(ConfigProvider.layer(startup.configProvider))
)
```

`Layer.provide` builds the outer dependency first and returns only the parent layer's services. The last
`provide` is outermost. Observability is outside Redis, so a selected-signal initialization failure fails the
layer before `NodeRedis.layer` runs. `NodeRedis` stays inside this production chain. `Layer.provide` hides that
tag from `ApplicationServices`. Tests call `applicationLayer` with an infrastructure argument of
`Redis | NodeServices.NodeServices` and do not pass `NodeRedis`. Do not flatten Redis and observability with
`Layer.mergeAll` or `Layer.provideMerge`; the current `runtime.ts` does that, and those siblings can acquire
together. `ManagedRuntime.make` stays lazy until the first `runPromise`. Startup forces acquisition with one
probe effect, then publishes that same runtime. Request code reuses it until `dispose`.

**Observability layer.** Use one `NodeSdk.layer` from `@effect/opentelemetry`. Pass `spanProcessor`,
`metricReader`, and `logRecordProcessor` only for signals `selectObservability` returns. The installed
`NodeSdk.layer` enables each signal only when its processor or reader is supplied, installs `OtelTracer.layer`,
`OtelLogger.layer`, and `OtelMetrics.layer` for those signals, and builds one resource. It does not register the
global tracer provider. When traces are selected, keep the existing `provider.register()` guard and
`nodeHttpClientInstrumentation` enable/disable finalizer so Next.js server spans and client spans share that
provider. When traces are not selected, do not register a provider and do not patch HTTP. Do not add
`effect/observability` `OtlpTracer` or a second `NodeTracerProvider`.

Exporters are constructed with `{ url }` only. The installed `@opentelemetry/otlp-exporter-base` 0.223.0 reads
`OTEL_EXPORTER_OTLP_HEADERS` and the signal-specific header variable itself, with the signal-specific headers
overriding base keys. Application code does not pass or log headers. `shutdownTimeout: "3 seconds"` matches the
timeout already applied inside the installed `NodeSdk`, `OtelLogger`, and `OtelMetrics` release finalizers.
Set `exportTimeoutMillis: 3_000` on `BatchSpanProcessor` and `BatchLogRecordProcessor`. On
`PeriodicExportingMetricReader`, set `exportIntervalMillis: 5_000` and `exportTimeoutMillis: 3_000`. The
installed reader throws when both options are set and the interval is shorter than the timeout, and it
defaults the interval to 60000 milliseconds. Five seconds is inside the quickstart's about-30-second
inspection wait and is not the 60000 default. The 3 second value is only this flush timeout. Before any
exporter is constructed, call `diag.setLogger` from `@opentelemetry/api` 1.9.1 at `DiagLogLevel.ERROR`. The
logger's `error` method does not write its arguments. Each selected exporter is wrapped so a failed export
writes one fixed sentence, `pre-ets-frontend: telemetry delivery failed signal=<signal>`, where `<signal>` is
`logs`, `metrics`, or `traces`. That sentence has no headers, URL userinfo, or exporter configuration. The
failure does not leave readiness and does not exit the process.
The console logger is private inside `observabilityLayer` and is built before `NodeSdk.layer`. Installed
`Logger.layer` with `mergeWithExisting: true` copies `CurrentLoggers` from that context, so OTLP logs sit
beside the console logger. The console logger is JSON when `server.env === "production"` and pretty otherwise,
with `References.MinimumLogLevel` set from the validated log level. Service name defaults to
`pre-ets-frontend` when any signal is selected.

**Bootstrap diagnostics.** Before `loadProcessStartup`, the process can write to `process.stderr` with no Effect
runtime, tenant, Redis, or authentication services. After observability is installed, a fatal diagnostic uses
`Effect.logError` on that runtime with one fixed sentence. A configuration or acquisition failure uses
`pre-ets-frontend: startup failed during <stage> reason=<reason>`. An observability failure uses
`pre-ets-frontend: startup failed during observability signal=<signal> reason=<reason>`. `<stage>` is
`configuration`, `observability`, or `application-acquisition`. `<reason>` is `config`, `acquisition`,
`defect`, `endpoint`, `exporter`, or `protocol`. `<signal>` is `logs`, `metrics`, or `traces`, and it appears
only when the stage is observability. The sentence does not interpolate `error.message`, URLs, headers, or
configuration. If that attempt does not finish within 1 second, a direct `process.stderr.write` of the same
sentence is the fallback, still inside the 1 second diagnostic budget. A failed or stalled write does not
change the exit status. The installed `NodeRedis` client keeps its `error` listener, which is what stops an
unhandled `error` event from exiting outside this handler. That listener logs
`Effect.logWarning("NodeRedis client error", cause)`, and the cause can carry Redis userinfo. The bootstrap
logger replaces that warning with `pre-ets-frontend: redis client error` and drops the cause. V-009 inspects
the replacement and confirms the secret is absent.

**Fatal bound.** On a required startup failure, start a 10 second timer that calls `process.exit(1)`. The timer
is referenced so it can fire even if native flush work is still pending. The 1 second diagnostic attempt and the
3 second telemetry shutdown run inside that 10 seconds and do not extend it. Verification's process-exit bound
is this 10 second deadline. The 3 second value is only the flush timeout inside it. `runtime.dispose()` is
best-effort and covered by the same timer. `NodeRedis.layer` closes the client on scope release; the installed
declaration notes that `close()` can wait for in-flight commands, so the outer timer is what guarantees exit.
Exit status is 1. No application service calls `process.exit`.

**Request gate.** After the probe succeeds, `register()` resolves and Next.js may serve. If `Runtime.runPromise`
is reached first, it rejects `StartupNotReady` and does not execute the effect. `toNext` maps that rejection to
HTTP 503. Server Components that call `Runtime.runPromise` directly also refuse the effect. Their HTTP
presentation stays Next.js's existing error page. The route-handler 503 versus that Server Component error page
is an operator-visible host choice, not a settled product decision. The manual matrix records which behavior
`next start` actually showed. Ready requests keep their current statuses, redirects, and error mappings.

**Shutdown.** The manual procedure exports `NEXT_MANUAL_SIG_HANDLE=1` before `next start`. Installed Next.js
16.4.2 `start-server.js` registers a `SIGTERM` cleanup that calls `process.exit(143)`, and a `SIGINT` cleanup
that calls `process.exit(130)`, only when that variable is unset. With it set, that cleanup is not registered,
so it cannot exit before dispose finishes. `startProductionRuntime` then installs one `SIGTERM` listener and
one `SIGINT` listener. The listener awaits `dispose` once and, after that promise settles, calls
`process.exit(0)`. It does not call `process.exit` before dispose settles, and it does not prepend a listener
beside the Next.js cleanup. Telemetry finalizers still use the 3 second shutdown timeout. The 10 second fatal
timer is not used to force a successful shutdown to exit 0. V-010 passes only when the Redis client is gone
from `CLIENT LIST` while `kill -0` on the server pid still succeeds, and the process exits after that. A
graceful dispose that is still incomplete after 10 seconds fails that observation. Disposal is idempotent.
Next.js 16.4.2 `register` has no shutdown hook in the installed instrumentation docs.

**Redis options.** Preserve the current client options: `disableOfflineQueue: true`, `pingInterval: 1_000`,
`socket: { socketTimeout: 5_000 }`, and `url` from the validated startup value. Those 5 second client timeouts
cannot hold acquisition open. The pending-acquisition probe is an uncommitted latch around the production
`connect()` call: `connect()` stays suspended until release, and the real client then runs. The latch is
removed before later cases.

**Documentation follow-through.** Implementation updates `docs/observability.md` so logs and metrics follow the
same precedence as traces, and so Loki and Prometheus are evidence only when those signals are selected. This
plan does not edit that file.

**Sequencing.** Implement in this order: extended `OtelConfig` and `selectObservability` with their tests;
`StartupConfig`, `AuthenticationProcessConfig`, and `loadProcessStartup`; `applicationLayer` order tests with
substitute infrastructure; `NodeSdk` wiring; import-safe `register()` and the request facade; fatal timer and
signal disposal; adaptation of existing service tests; removal of durable span assertions. Manual procedures in
[quickstart.md](quickstart.md) run after that, on the implementation branch.

### Phase 5 — Feature verification integration

[verification.md](verification.md) remains the claim source. [quickstart.md](quickstart.md) is the
implementation-aware procedure and records no execution. Module tests are not rerun as substitutes for V-001,
V-002, V-003, V-004, V-005, V-008's live probe, V-009, or V-010. Existing automated suites remain the V-006 and
V-007 evidence, plus the new composition tests for substituted startup. The production-build trials in the
quickstart are the V-008 build evidence.

The fatal-handling bound used by case 5 is the 10 second deadline defined in Phase 4 and repeated in
[data-model.md](data-model.md), [contracts/modules.md](contracts/modules.md), and [quickstart.md](quickstart.md).
Verification's process-exit bound is that 10 second deadline. The 3 second value is only the flush timeout
inside it.

The feature is not releasable until V-001 through V-010 pass. A deployed process that loses readiness or exits
because a collector is unreachable is a rollback.
