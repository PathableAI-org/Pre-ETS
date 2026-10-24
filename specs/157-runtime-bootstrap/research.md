# Research: Deterministic Application Bootstrap and Runtime Composition

**Plan**: [plan.md](plan.md)

**Status**: Planning research. Nothing in this file was executed as feature evidence.

## Decision: Keep one frontend ManagedRuntime and sequence it with nested `Layer.provide`

**Rationale**: `ManagedRuntime.make` in installed Effect 4.0.5 builds its layer lazily on the first run and
caches it. The current `runtime.ts` probe forces that build, which is the right readiness hook, but it merges
observability with Redis as siblings. Installed `Layer.provide` builds the dependency before the parent, so
placing `observabilityLayer` outside `NodeRedis.layer` makes telemetry initialization finish before Redis
connects. One runtime remains the request environment until `dispose`.

**Alternatives considered**: A second bootstrap `ManagedRuntime` is outside the specification. A pollable
readiness service has no current consumer. `Layer.mergeAll` of Redis and observability does not encode the
required order.

## Decision: Next.js `register()` is the production readiness gate

**Rationale**: The installed Next.js 16.4.2 App Router instrumentation reference says `register` runs once when
a server instance starts and must complete before the server is ready to handle requests. The frontend already
exports `register` from `src/instrumentation.ts`. Startup stays inside that function for
`NEXT_RUNTIME === "nodejs"` and is skipped when `NEXT_PHASE === "phase-production-build"`. The module itself
does not start on import, so a production build can evaluate it while `TENANT_CONFIG_DIR` is absent or
malformed.

**Alternatives considered**: The current top-level `await boot()` starts whenever any page imports `runtime.ts`.
That couples build and request evaluation to process startup. A custom health port is not required for the
listener gate the installed Next.js server already documents.

## Decision: Extend the current OTEL precedence per signal

**Rationale**: `docs/observability.md` and `observability.ts` already define the traces rules this feature must
keep: `OTEL_SDK_DISABLED=true` or no selected endpoint skips export and skips endpoint and protocol validation;
a selected invalid URL or protocol is fatal; an unreachable collector does not block startup. The specification
also requires logs and metrics when valid configuration enables them, and a way to disable one capability.
Selection therefore applies the same endpoint rule to each signal, and `OTEL_TRACES_EXPORTER`,
`OTEL_METRICS_EXPORTER`, or `OTEL_LOGS_EXPORTER` set to `none` leaves that signal unselected. Unselected
endpoint, protocol, and exporter strings are not validated. `OtelConfig` remains a non-validating parser, which
is what `otel-config.test.ts` already locks in for traces.

**Alternatives considered**: Treating any malformed OTEL variable as fatal would reject disabled and unselected
configurations that the specification requires to start. Leaving logs and metrics unimplemented would miss
FR-007. Inventing a non-OTEL disable flag would split from the variables operators already have.

## Decision: Fatal handling is bounded by 10 seconds, with a 1 second diagnostic attempt and a 3 second telemetry shutdown

**Rationale**: The specification requires a finite planning-defined bound and says a stalled finalizer cannot
pass. Installed `NodeSdk.layerTracerProvider`, `OtelLogger.layerLoggerProvider`, and `OtelMetrics` release
finalizers already wrap `forceFlush` and `shutdown` in `Effect.timeoutOption` of `shutdownTimeout`, defaulting
to 3000 milliseconds. The current tracer layer passes `shutdownTimeout: "3 seconds"`. Installed log
`ForceFlushOptions.timeoutMillis` and batch processor `exportTimeoutMillis` default to 30000 milliseconds.
`PeriodicExportingMetricReader` defaults `exportIntervalMillis` to 60000 and `exportTimeoutMillis` to 30000,
and it throws when both are set and the interval is shorter than the timeout. The plan sets
`exportTimeoutMillis` to 3000 on each processor, and on the metric reader sets `exportIntervalMillis` to 5000
with `exportTimeoutMillis` 3000. Five seconds is inside the about-30-second inspection wait. The outer bound
is 10 seconds from recognition of the startup failure until `process.exit(1)`. That covers a 1 second
diagnostic attempt, a 3 second flush, and Redis `close()` without letting those waits stack to the 30 second
SDK default or the 60 second metric interval. A referenced timer calls `process.exit(1)` because
`Effect.timeout` interrupts the fiber and does not by itself cancel an already running native export promise.
Verification's process-exit bound is the 10 second deadline. The 3 second value is only the flush timeout
inside it.

**Alternatives considered**: A 3 second overall bound can expire during a successful local flush plus Redis
close in the case where cleanup is supposed to finish. A 30 second bound would accept the default stalled
flush the verification is designed to reject.

## Decision: Add the 0.223.0 OTLP log and metric exporters and drive them through `NodeSdk.layer`

**Rationale**: Installed `@effect/opentelemetry` 4.0.5 `NodeSdk.layer` accepts `spanProcessor`, `metricReader`,
and `logRecordProcessor` and enables only the signals that are supplied. Installed
`@opentelemetry/sdk-logs` 0.223.0 exports `BatchLogRecordProcessor` with constructor options
`{ exporter, exportTimeoutMillis? }`. Installed `@opentelemetry/sdk-metrics` 2.12.0 exports
`PeriodicExportingMetricReader` with `{ exporter, exportIntervalMillis?, exportTimeoutMillis? }`. Installed
`@opentelemetry/sdk-trace-base` 2.12.0 still uses positional `new BatchSpanProcessor(exporter, config?)`.
Published `@opentelemetry/exporter-logs-otlp-http`, `@opentelemetry/exporter-logs-otlp-proto`,
`@opentelemetry/exporter-metrics-otlp-http`, and `@opentelemetry/exporter-metrics-otlp-proto` at 0.223.0
expose `OTLPLogExporter` and `OTLPMetricExporter` constructors of `config?: OTLPExporterNodeConfigBase`, the
same `{ url }` shape as the installed trace exporters. The metrics protobuf package types its options through
the HTTP metrics package. Header lookup stays in installed `@opentelemetry/otlp-exporter-base` 0.223.0.

**Alternatives considered**: `effect/observability` `OtlpTracer` is a second exporter, which the Effect guide
forbids while `NodeSdk` is the provider. Constructing another `NodeTracerProvider` beside
`NodeSdk.layerTracerProvider` duplicates the provider `NodeSdk.layer` already builds. Skipping the new
packages would leave logs and metrics without an OTLP exporter in the frontend dependency set.

## Decision: Validate process-wide authentication settings before Redis without changing service layer signatures

**Rationale**: `AuthenticationService.layer`, `SessionService.layer`, and `TenantConfigService.layer(config)`
have current tests and route consumers. Changing those signatures would rewrite substitution tests that the
specification says must keep their outcomes. `AuthenticationProcessConfig` is a parent re-export so bootstrap
can run the existing credential, origin, and transaction decoders once, before `NodeRedis.layer` is
constructed. `loadProcessStartup` copies `process.env` once and passes that record to
`ConfigProvider.fromEnvRecord(env)`. The frozen provider is then provided to the application layer so those
decoders do not call `ConfigProvider.fromEnv()` again. Tenant continues to receive the decoded server slice it
already accepts.

**Alternatives considered**: Moving authentication decoders into `lib/config` creates an import cycle through
`authentication.ts` → `tenant.ts` → `config`. Leaving authentication configuration lazy makes an invalid
`OIDC_CALLBACK_ORIGINS_JSON` fail during resource acquisition and be reported as the wrong stage.

## Decision: Retire durable HTTP span assertions

**Rationale**: FR-027 and FR-028 forbid automated assertions of spans and attributes. The existing HTTP
instrumentation test records span attributes with a fake tracer. The redaction behavior stays in
`observability/http.ts` and is checked manually from a real trace. Module tests of `selectObservability` and
`applicationLayer` cover deterministic outcomes only.

**Alternatives considered**: Keeping the fake-tracer test would preserve an assertion the specification
withdraws. Replacing it with an in-memory exporter test would do the same.

## Decision: The route-handler 503 and the Server Component error page are an operator-visible host choice

**Rationale**: `toNext` maps `StartupNotReady` to HTTP 503. Server Components that call `Runtime.runPromise`
keep Next.js's existing error page. Both refuse the effect before tenant, authentication, and session code.
They are different operator-visible failures. That split is not a settled product decision. The maintainer has
not chosen whether both surfaces must present one not-ready outcome. [quickstart.md](quickstart.md) records
which behavior `next start` actually showed. The fatal bound, the per-signal `none` exporter, and the
`next start` verification host remain technical choices inside the approved contract. The missing delivery
issue is the maintainer exception already recorded in the specification. The constitution's four-part
Principle I form is not in spec.md yet and is waiting on the maintainer.

**Alternatives considered**: Treating the 503 as the only early-request presentation would settle a product
question the specification leaves to the host. Sending the fatal bound back to specification review would
treat an authorized planning selection as product ambiguity.

## Installed declarations checked

Checked in this checkout under `packages/frontend/node_modules` unless noted:

| Package                                    | Version | API used by the plan                                                                                                                                                                                                                                                                                      |
| ------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `effect`                                   | 4.0.5   | `ManagedRuntime.make`, `runPromise`, `dispose`, `disposeEffect`; `Layer.provide`; `ConfigProvider.fromEnvRecord(env)`, `ConfigProvider.layer`; `Effect.timeout`; `Schema.TaggedError`; `Schema.URLFromString`; `Logger.layer`, `Logger.consoleJson`, `Logger.consolePretty`; `References.MinimumLogLevel` |
| `@effect/opentelemetry`                    | 4.0.5   | `NodeSdk.layer`, `NodeSdk.Configuration`, `OtelLogger.layer({ mergeWithExisting })`, `OtelMetrics.layer`, `Resource` via `NodeSdk`                                                                                                                                                                        |
| `@effect/platform-node`                    | 4.0.5   | `NodeRedis.layer(options)` → `Layer<Redis \| NodeRedis, RedisError>`                                                                                                                                                                                                                                      |
| `@opentelemetry/sdk-trace-base`            | 2.12.0  | `BatchSpanProcessor(exporter, config?)`; `BufferConfig.exportTimeoutMillis`                                                                                                                                                                                                                               |
| `@opentelemetry/sdk-logs`                  | 0.223.0 | `BatchLogRecordProcessor({ exporter, exportTimeoutMillis? })`                                                                                                                                                                                                                                             |
| `@opentelemetry/sdk-metrics`               | 2.12.0  | `PeriodicExportingMetricReader({ exporter, exportIntervalMillis?, exportTimeoutMillis? })`; default interval 60000                                                                                                                                                                                        |
| `@opentelemetry/exporter-trace-otlp-http`  | 0.223.0 | `OTLPTraceExporter(config?: OTLPExporterNodeConfigBase)`                                                                                                                                                                                                                                                  |
| `@opentelemetry/exporter-trace-otlp-proto` | 0.223.0 | same constructor shape                                                                                                                                                                                                                                                                                    |
| `@opentelemetry/api`                       | 1.9.1   | `diag.setLogger(logger, DiagLogLevel.ERROR)`; `error` arguments are not written                                                                                                                                                                                                                           |
| `@opentelemetry/otlp-exporter-base`        | 0.223.0 | environment header merge, transitive                                                                                                                                                                                                                                                                      |
| `next`                                     | 16.4.2  | `register()` completes before the server is ready; no shutdown export in the installed instrumentation reference                                                                                                                                                                                          |

Published 0.223.0 log and metric exporter constructors were read from their package declarations before those
packages were added to the workspace. Implementation must confirm the installed copies after `pnpm` adds them.
The local Effect checkout `41cf29b5d85af7fc25bcc7713f2e05142edaa66a` was not used for these signatures.

`NodeSdk.js` in the installed 4.0.5 package shows the release finalizer:

```js
provider.forceFlush().finally(() => provider.shutdown())
```

wrapped with `Effect.ignore`, `Effect.interruptible`, and `Effect.timeoutOption(shutdownTimeout ?? 3000)`. The
same pattern is in the installed logger provider and metric-reader release. `NodeSdk.layer` does not call
`provider.register()`.
