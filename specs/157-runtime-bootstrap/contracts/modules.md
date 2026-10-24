# Module Architecture and Public Contracts: Deterministic Application Bootstrap

**Plan**: [plan.md](../plan.md)

**Feature verification**: [verification.md](../verification.md)

**Status**: Planned design. External APIs below were checked against the frontend workspace's installed
declarations, recorded in [research.md](../research.md).

## Module architecture decisions

| Concern                              | Current owner and consumers                                                                                                                    | Decision | Public boundary                                      | Private decomposition                       | Rationale and non-goals                                                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Process entry and readiness          | `src/instrumentation.ts`, consumed by Next.js                                                                                                  | Extend   | `register`                                           | None                                        | Next.js already awaits `register` before serving. It stays a thin host adapter.                                                        |
| Shared runtime and fatal exit        | `src/lib/runtime.ts`, consumed by `instrumentation.ts`, `next.ts`, `app/(app)/page.tsx`, `tenant-context.ts`, and the tenant-config test route | Extend   | `runtime.ts`                                         | None. Private functions stay in the parent. | One module already owns boot and `Runtime.runPromise`. A `lib/runtime/` split would only separate functions that must call each other. |
| Observability                        | `src/lib/observability.ts`, consumed by `runtime.ts`. `observability/http.ts` is imported by the parent and, today, by `otel-http.test.ts`     | Extend   | `observability.ts`                                   | Preserve `observability/http.ts`            | Logs and metrics use the same `NodeSdk` layer as traces. Tests stop importing the HTTP child.                                          |
| Process-wide server and OTEL parsing | `src/lib/config/index.ts`, consumed by runtime, tenant types, and config tests                                                                 | Extend   | `config/index.ts`                                    | Existing children under `config/`           | `StartupConfig` composes the parsers that already exist. No new config package.                                                        |
| Authentication process settings      | Private decoders under `authentication/`, consumed indirectly by `AuthenticationService.layer`                                                 | Extend   | `AuthenticationProcessConfig` on `authentication.ts` | Children stay private                       | Bootstrap is the current consumer that must fail these settings before Redis. Service methods stay.                                    |
| Session and tenant services          | `SessionService.layer`, `TenantConfigService.layer(config)`                                                                                    | Preserve | Existing service classes                             | Existing children                           | Request and storage behavior is out of scope. Production feeds them the validated startup value.                                       |
| Request adapter                      | `toNext` in `next.ts`                                                                                                                          | Extend   | `toNext`                                             | None                                        | The only new outcome is the pre-ready refusal. Ready responses stay as they are.                                                       |

Every affected concern has an explicit decision. No new workspace, provider interface, or re-export is added
for a hypothetical consumer.

## Public contracts

### `packages/frontend/src/instrumentation.ts`

**Responsibility**: Node.js host entry for production startup.

**Actual consumers**:

- Next.js server startup, which awaits `register` before it is ready to handle requests.

**Proposed signatures**:

```ts
export const register: () => Promise<void>
```

**Inputs and validation ownership**: Reads `NEXT_RUNTIME` and `NEXT_PHASE` only to decide whether to start.
Process-wide validation stays in `loadProcessStartup`.

**Success semantics and invariants**:

- On the Node.js server, outside `phase-production-build`, the returned promise resolves after the shared
  runtime has acquired required resources.
- On any other runtime, and during `phase-production-build`, the promise resolves without reading startup
  configuration and without opening Redis or a collector.
- The module has no top-level startup side effect.

**Expected errors**:

| Public error        | Meaning for consumers                               | Owned internal failures translated here               | Consumer response             |
| ------------------- | --------------------------------------------------- | ----------------------------------------------------- | ----------------------------- |
| None on the promise | Startup failure exits the process from `runtime.ts` | `StartupFailure` is handled before `register` settles | Next.js does not become ready |

**Defects and interruption**: An unexpected defect during startup is caught by the runtime fatal handler,
diagnosed as the stage in progress, and still exits nonzero within the 10 second bound.

**Effect environment requirements**: None. This file is the Next.js adapter. It dynamically imports `runtime.ts`
only when it is going to start.

**Compatibility and relationships**: The export name `register` stays. Callers other than Next.js are not added.

### Contract evidence

| Claim                                                                             | Meaningful violation                                                          | Durable evidence                                                                                                                                    | Manual/transient evidence                                         | Limitations and non-duplication                                              |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Importing the frontend graph during build does not validate runtime configuration | Build evaluates `runtime.ts` and fails because `TENANT_CONFIG_DIR` is missing | Module import test: with `NEXT_PHASE` unset, importing `runtime.ts` does not read startup config and `Runtime.runPromise` rejects `StartupNotReady` | Isolated `next build` trials in [quickstart.md](../quickstart.md) | The unit import does not prove the Next.js build graph. The build trials do. |
| `register` is the only production start                                           | A page import starts Redis                                                    | The same import test, plus a composition test that never calls `startProductionRuntime`                                                             | `next start` pending-acquisition probe                            | Dev-server listener behavior is not claimed                                  |

### `packages/frontend/src/lib/config/index.ts`

**Responsibility**: Decode process-wide server settings and non-validating OTEL strings.

**Actual consumers**:

- `loadProcessStartup` in `runtime.ts`
- `TenantConfigService.layer`, which already receives a `ServerConfig` slice
- Existing `config.test.ts` and `otel-config.test.ts`

**Proposed signatures**:

```ts
import type { Config, LogLevel } from "effect"

export const ServerConfig: Config.Config<{
  readonly env: "development" | "production" | "test"
  readonly redis: { readonly url: string }
  readonly session: { readonly keyPrefix: string }
  readonly tenant:
    | { readonly configDir: string; readonly resolution: "host"; readonly baseHostname: string }
    | { readonly configDir: string; readonly resolution: "static"; readonly staticAlias: string }
}>

export interface OtelSettings {
  readonly disabled: boolean
  readonly endpoint: Option.Option<string>
  readonly exportUrl: Option.Option<string>
  readonly headers: Option.Option<string>
  readonly logsEndpoint: Option.Option<string>
  readonly logsExporter: Option.Option<string>
  readonly logsExportUrl: Option.Option<string>
  readonly logsProtocol: Option.Option<string>
  readonly metricsEndpoint: Option.Option<string>
  readonly metricsExporter: Option.Option<string>
  readonly metricsExportUrl: Option.Option<string>
  readonly metricsProtocol: Option.Option<string>
  readonly protocol: Option.Option<string>
  readonly serviceName: Option.Option<string>
  readonly tracesExporter: Option.Option<string>
  readonly tracesHeaders: Option.Option<string>
  readonly tracesProtocol: Option.Option<string>
}

export const OtelConfig: Config.Config<OtelSettings>

export const StartupConfig: Config.Config<{
  readonly logLevel: LogLevel.LogLevel
  readonly otel: OtelSettings
  readonly server: Config.Success<typeof ServerConfig>
}>
```

Existing exports `SessionKeyPrefix` and the tenant config types stay.

**Inputs and validation ownership**: Environment strings are untrusted at this boundary. `ServerConfig` keeps
the current cross-field tenant rules. `OtelConfig` treats empty strings as unset, parses `OTEL_SDK_DISABLED`
with Effect's boolean literals, and builds URL strings without checking that they are URLs. A traces endpoint
wins over the base endpoint for `exportUrl` and `endpoint`. A logs or metrics endpoint wins over the base
endpoint for that signal's export URL. A base endpoint gains `/v1/traces`, `/v1/metrics`, or `/v1/logs` after
one trailing slash is removed. Log level defaults to `Info`.

**Success semantics and invariants**:

- Existing `ServerConfig` success and failure cases stay.
- Existing `OtelConfig` fields keep their current success values, including a computed traces `exportUrl` when
  the SDK is disabled.
- New OTEL fields are `Option.none()` when unset or empty.
- `StartupConfig` fails when `ServerConfig`, `OtelConfig`, or log level fails. It does not apply URL or
  protocol selection.

**Expected errors**:

| Public error         | Meaning for consumers                              | Owned internal failures translated here                                                | Consumer response                                                                            |
| -------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Config.ConfigError` | The process settings are not a valid startup value | Effect config and schema failures from the existing decoders, plus invalid `LOG_LEVEL` | Bootstrap classifies this as stage `configuration` and does not open Redis or OTLP exporters |

**Defects and interruption**: Decoder defects remain defects. An invalid selected URL is not a config error; it
is an observability error raised later by `selectObservability`.

**Effect environment requirements**: `ConfigProvider.ConfigProvider`. Production supplies one frozen provider.
Tests supply `ConfigProvider.fromUnknown`.

**Compatibility and relationships**: Tenant, Redis default URL, and session prefix semantics stay. OTEL header
and protocol strings remain opaque here. `observability.ts` stops importing `config/env.ts`.

### Contract evidence

| Claim                                                       | Meaningful violation                                                                         | Durable evidence                                                                                                         | Manual/transient evidence        | Limitations and non-duplication           |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | ----------------------------------------- |
| Existing server settings still decode as they do today      | A missing `TENANT_CONFIG_DIR` or cross-field tenant mistake is accepted                      | Existing `config.test.ts`                                                                                                | None                             | Does not prove process exit               |
| Disabled or unselected OTEL strings still decode            | `OTEL_SDK_DISABLED=true` with an endpoint fails parsing, or a traces endpoint no longer wins | Existing `otel-config.test.ts`, plus examples for the new fields defaulting to none and for logs and metrics export URLs | None                             | URL syntax is intentionally untested here |
| `StartupConfig` fails as one value when server config fails | Redis could still start after a tenant-dir failure                                           | One `it.effect` that omits `TENANT_CONFIG_DIR` and expects `ConfigError` from `StartupConfig`                            | Configuration-stage manual trial | The manual trial owns the exit status     |

### `packages/frontend/src/lib/authentication.ts`

**Responsibility**: Re-export the existing process-wide authentication decoders as one Config. Authentication
service behavior stays in the current class.

**Actual consumers**:

- `loadProcessStartup`, which must fail closed before Redis
- Existing authentication tests, which keep using `AuthenticationService.layer`

**Proposed signatures**:

```ts
export const AuthenticationProcessConfig: Config.Config<{
  readonly credentials: Readonly<Record<string, string>>
  readonly settings: {
    readonly allowInsecureLoopback: boolean
    readonly callbackOrigins: Readonly<Record<string, URL>>
  }
  readonly transactions: {
    readonly prefix: string
    readonly ttlMilliseconds: number
    readonly ttlSeconds: number
  }
}>
```

`AuthenticationService.layer` stays a parameterless `Layer`. Its public methods stay.

**Inputs and validation ownership**: The parent composes the decoders that already live in its private
children. Those children remain the owners of origin, secret-map, prefix, and TTL rules. Defaults stay
`OIDC_CLIENT_SECRETS_JSON={}`, `OIDC_CALLBACK_ORIGINS_JSON={}`, `OIDC_ALLOW_INSECURE_LOOPBACK=false`,
`OIDC_TX_KEY_PREFIX=preets:oidc-tx:v1`, and `OIDC_TX_TTL_SECONDS=600`.

**Success semantics and invariants**:

- A successful value is the same structure those decoders already produce.
- Invalid JSON, origins, or TTL values still fail with `ConfigError`.
- Missing secret references still fail later, per request, as `ClientCredentialUnavailable`.

**Expected errors**:

| Public error         | Meaning for consumers                            | Owned internal failures translated here | Consumer response                                                                                            |
| -------------------- | ------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Config.ConfigError` | Process-wide authentication settings are invalid | Existing invalid-config schema failures | Bootstrap reports stage `configuration` and does not include the raw JSON or secret values in the diagnostic |

**Defects and interruption**: Request-time provider and Redis failures stay on the existing authentication
error types. They are not rewritten as startup errors.

**Effect environment requirements**: `ConfigProvider.ConfigProvider` for the Config. The service layer's
existing Redis and tenant requirements stay.

**Compatibility and relationships**: Included in `ProcessStartup`. The service layer still decodes from the
frozen provider during acquisition so current substitution tests remain valid. The first failure is the eager
`loadProcessStartup` failure.

### Contract evidence

| Claim                                                                          | Meaningful violation                                             | Durable evidence                                                                                                                                                                                                                                         | Manual/transient evidence                                                                                               | Limitations and non-duplication                                |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Invalid process authentication settings fail before infrastructure acquisition | `applicationLayer` opens Redis when callback origins are invalid | Composition test: fixture startup is not used; a provider with invalid `OIDC_CALLBACK_ORIGINS_JSON` fails `loadProcessStartup`'s decoder path through `AuthenticationProcessConfig`, and a substitute infrastructure layer's acquire effect does not run | Configuration manual trial uses the tenant directory, not OIDC JSON, so secrets are not placed in the manual transcript | Service-level authentication tests still own callback outcomes |
| Existing authentication outcomes stay                                          | A callback status or storage result changes                      | Existing authentication unit and Redis integration tests                                                                                                                                                                                                 | None for this module                                                                                                    | Those tests do not prove bootstrap order                       |

### `packages/frontend/src/lib/observability.ts`

**Responsibility**: Decide which OTLP signals are enabled and build the console logger plus one `NodeSdk`
layer for the selected signals.

**Actual consumers**:

- `applicationLayer` in `runtime.ts`
- New selection tests

**Proposed signatures**:

```ts
import { Resource } from "@effect/opentelemetry/Resource"
import { Effect, Layer, Schema, type Config, type LogLevel } from "effect"

export type OtlpHttpProtocol = "http/json" | "http/protobuf"

export interface SelectedOtlpSignal {
  readonly protocol: OtlpHttpProtocol
  readonly url: string
}

export interface ObservabilitySelection {
  readonly logs: SelectedOtlpSignal | undefined
  readonly metrics: SelectedOtlpSignal | undefined
  readonly traces: SelectedOtlpSignal | undefined
}

export class ObservabilityInitializationError extends Schema.TaggedError<ObservabilityInitializationError>()(
  "@pathableai/pre-ets-frontend/ObservabilityInitializationError",
  {
    reason: Schema.Literals(["endpoint", "exporter", "protocol"]),
    signal: Schema.Literals(["logs", "metrics", "traces"])
  }
) {}

export const selectObservability: (
  otel: Config.Success<typeof OtelConfig>
) => Effect.Effect<ObservabilitySelection, ObservabilityInitializationError>

export const observabilityLayer: (input: {
  readonly logLevel: LogLevel.LogLevel
  readonly otel: Config.Success<typeof OtelConfig>
  readonly serverEnv: "development" | "production" | "test"
}) => Layer.Layer<Resource, ObservabilityInitializationError>
```

**Inputs and validation ownership**: `otel` is already decoded by `OtelConfig`. `selectObservability` owns URL
and protocol validation for selected signals only. A selected endpoint string decodes with
`Schema.decodeUnknown(Schema.URLFromString)`. `Schema.URL` is not used, because the installed schema decodes a
`URL` instance rather than a string. `selectObservability` does not read `process.env`. Exporter constructors
receive `{ url }` only.

**Success semantics and invariants**:

- The selection rules in [data-model.md](../data-model.md) are the whole precedence contract.
- No selected signals yields a successful empty selection and a layer that installs only the console logger.
- A selected unreachable URL is a successful selection. The layer does not connect to the collector to decide
  success.
- When traces are selected, the layer registers the `NodeSdk` tracer provider for Next.js and enables the
  existing HTTP client instrumentation until scope close.
- The console logger is built inside this layer before `NodeSdk.layer`. OTLP logs, when selected, merge with
  that logger through `mergeWithExisting`. Local console logging remains for every successful startup. The
  console logger function is private because `observabilityLayer` is its only consumer.
- Service name is `otel.serviceName` or `pre-ets-frontend` when any signal is selected.
- Shutdown uses `shutdownTimeout: "3 seconds"` and `exportTimeoutMillis: 3_000` on the span and log batch
  processors. `PeriodicExportingMetricReader` uses `exportIntervalMillis: 5_000` and `exportTimeoutMillis:
  3_000`. The interval stays inside the quickstart inspection wait and is not the installed 60000 default.
  The 3 second value is the flush timeout, not the process-exit deadline.
- Before exporters are constructed, `diag.setLogger` from `@opentelemetry/api` is registered at
  `DiagLogLevel.ERROR`. Its `error` method does not write the diag arguments. A failed export writes
  `pre-ets-frontend: telemetry delivery failed signal=<signal>` and nothing else. That failure is not
  `ObservabilityInitializationError` and does not stop readiness.

**Expected errors**:

| Public error                       | Meaning for consumers                                           | Owned internal failures translated here                                                               | Consumer response                                                                                        |
| ---------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `ObservabilityInitializationError` | A selected signal's exporter name, URL, or protocol is unusable | Invalid selected URL, protocol outside `http/json` and `http/protobuf`, or exporter other than `otlp` | Bootstrap stage `observability`. The error carries `signal` and `reason` only. Redis is not constructed. |

**Defects and interruption**: Exporter construction defects and SDK defects stay defects and are fatal at
bootstrap. Export failures after startup are not this error and do not fail the layer. Collector
unavailability is not represented as an error.

**Effect environment requirements**: `observabilityLayer` provides the `Resource` service that installed
`NodeSdk.layer` provides. `applicationLayer` passes that layer to `Layer.provide`, which hides `Resource`
from `ApplicationServices`. The console logger uses `Logger.layer` and `References.MinimumLogLevel`.

**Compatibility and relationships**: Called with the `otel`, `logLevel`, and `server.env` fields from
`ProcessStartup`. The current traces endpoint, disabled-SDK, and default `http/protobuf` behavior remain.
`grpc` remains fatal when the signal is selected. HTTP client instrumentation stays a private child and is not
re-exported.

### Contract evidence

| Claim                                                                        | Meaningful violation                                                                          | Durable evidence                                                                                                                                                                                                         | Manual/transient evidence                          | Limitations and non-duplication                                                                                   |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Disabled SDK and unselected signals ignore malformed endpoints and protocols | `OTEL_SDK_DISABLED=true` or a missing endpoint fails selection because the protocol is `grpc` | `it.effect` examples and a Fast-Check property: for arbitrary endpoint and protocol strings, `disabled: true` yields three absent signals; exporter `none` yields that signal absent even when its endpoint is not a URL | Manual disablement and unselected-malformed trials | Does not prove a collector received nothing                                                                       |
| A selected invalid URL or protocol fails and names the signal                | An invalid traces URL is ignored, or a bad logs protocol fails traces                         | Examples: selected `grpc`, selected `not a url`, and `OTEL_LOGS_EXPORTER=none` beside a valid base endpoint                                                                                                              | Manual invalid-initialization trial                | Does not prove stderr text                                                                                        |
| Valid selection does not require the collector                               | Layer build waits on a TCP connection                                                         | Not automated. A unit test must not open a socket or assert an exporter call                                                                                                                                             | Collector-down-at-start manual trial               | Composition tests use `disabled: true` or a file URL-valid `http://127.0.0.1:9` only if they do not assert export |
| One bad observability setup does not acquire infrastructure                  | Redis layer effect runs when protocol is `grpc`                                               | Composition test in the runtime contract                                                                                                                                                                                 | Manual observability failure trial                 | The composition test is the order claim; this row is the selection claim                                          |

### `packages/frontend/src/lib/runtime.ts`

**Responsibility**: Load one startup value, build one production runtime in order, serve requests from it, and
own fatal exit and disposal.

**Actual consumers**:

- `instrumentation.ts` calls `startProductionRuntime`
- `next.ts`, the home page, tenant context, and the tenant-config test route call `Runtime.runPromise`
- New composition tests call `applicationLayer` and the config loaders, not `startProductionRuntime`

**Proposed signatures**:

```ts
import { NodeServices } from "@effect/platform-node"
import { Effect, Layer, Schema, type Config, type ConfigProvider, type LogLevel } from "effect"
import type { Redis, RedisError } from "effect/persistence/Redis"

export interface ProcessStartup {
  readonly authentication: Config.Success<typeof AuthenticationProcessConfig>
  readonly configProvider: ConfigProvider.ConfigProvider
  readonly logLevel: LogLevel.LogLevel
  readonly otel: Config.Success<typeof OtelConfig>
  readonly server: Config.Success<typeof ServerConfig>
}

export class StartupFailure extends Schema.TaggedError<StartupFailure>()(
  "@pathableai/pre-ets-frontend/StartupFailure",
  {
    reason: Schema.Literals([
      "acquisition",
      "config",
      "defect",
      "observability-initialization"
    ]),
    stage: Schema.Literals([
      "application-acquisition",
      "configuration",
      "observability"
    ])
  }
) {}

export class StartupNotReady extends Schema.TaggedError<StartupNotReady>()(
  "@pathableai/pre-ets-frontend/StartupNotReady",
  {}
) {}

export type ApplicationServices =
  | AuthenticationService
  | SessionService
  | TenantConfigService

export const loadProcessStartup: Effect.Effect<ProcessStartup, Config.ConfigError>

export const applicationLayer: (
  startup: ProcessStartup,
  infrastructure: Layer.Layer<Redis | NodeServices.NodeServices, RedisError, never>
) => Layer.Layer<ApplicationServices, ObservabilityInitializationError | RedisError>

export const Runtime: {
  readonly runPromise: <A, E>(
    effect: Effect.Effect<A, E, ApplicationServices>
  ) => Promise<A>
}

export const startProductionRuntime: () => Promise<void>
```

**Inputs and validation ownership**: `loadProcessStartup` copies `process.env` into one record, passes that
record to `ConfigProvider.fromEnvRecord(env)`, and runs `StartupConfig` and `AuthenticationProcessConfig` to
completion. Later decoders use that provider and do not call `fromEnv()` again. `applicationLayer` does not
read `process.env`. Its infrastructure argument is `Redis | NodeServices.NodeServices`. Tests pass
`NodeServices.layer` plus a Redis substitute that does not open a socket. `startProductionRuntime` does not
use that argument. It keeps `NodeRedis.layer` inside production composition:

```ts
applicationCore(startup).pipe(
  Layer.provide(NodeServices.layer),
  Layer.provide(NodeRedis.layer(redisOptions)),
  Layer.provide(observabilityLayer(startup)),
  Layer.provide(ConfigProvider.layer(startup.configProvider))
)
```

`Layer.provide` returns the parent services, so `NodeRedis` is not part of `ApplicationServices` and tests do
not provide it. `NodeServices.NodeServices` is the installed union `ChildProcessSpawner | Crypto | FileSystem |
Path | Stdio | Terminal`. Redis client options stay `disableOfflineQueue: true`, `pingInterval: 1_000`,
`socket: { socketTimeout: 5_000 }`, and the validated URL. Those timeouts are not the pending-acquisition hold.

**Success semantics and invariants**:

- `loadProcessStartup` succeeds only after server, OTEL parsing, log level, and authentication process
  settings have succeeded.
- `applicationLayer` builds observability before the infrastructure layer. An observability failure means the
  infrastructure layer effect has not run.
- The first successful probe installs one `ManagedRuntime`. Later `runPromise` calls use that instance until
  dispose.
- Before installation, `runPromise` rejects with `StartupNotReady` and does not execute the effect.
- `startProductionRuntime` resolves only after that probe. On a required failure it runs the fatal handler and
  `process.exit(1)` within 10 seconds of recognizing the failure.
- The diagnostic sentence for configuration and acquisition is
  `pre-ets-frontend: startup failed during <stage> reason=<reason>`. When the stage is observability it is
  `pre-ets-frontend: startup failed during observability signal=<signal> reason=<reason>`. `<reason>` is
  `config`, `acquisition`, `defect`, `endpoint`, `exporter`, or `protocol`. `<signal>` is `logs`, `metrics`,
  or `traces`. The sentence does not interpolate `error.message`, URLs, headers, or configuration.
- `SIGTERM` and `SIGINT` are owned by the bootstrap listener. `NEXT_MANUAL_SIG_HANDLE=1` keeps Next.js
  `start-server.js` from registering the cleanup that calls `process.exit(143)` or `process.exit(130)`. The
  bootstrap listener awaits `dispose` and then exits. V-010 passes only when the Redis client is gone from
  `CLIENT LIST` while `kill -0` on the server pid still succeeds, and the process exits after that.
- The `NodeRedis` `error` listener stays, so an unhandled `error` event does not crash outside the fatal
  handler. The bootstrap logger replaces `NodeRedis client error` and its cause with
  `pre-ets-frontend: redis client error`.
- Individual services return their existing errors. They do not exit the process.

**Expected errors**:

| Public error                                               | Meaning for consumers                                 | Owned internal failures translated here                                  | Consumer response                                                                                                                                                                                                             |
| ---------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Config.ConfigError` from `loadProcessStartup`             | Startup settings are invalid                          | Server, OTEL parser, log level, and authentication process `ConfigError` | Fatal stage `configuration`. No infrastructure layer.                                                                                                                                                                         |
| `ObservabilityInitializationError` from `applicationLayer` | A selected signal cannot be initialized               | Selection failures                                                       | Fatal stage `observability`. Infrastructure effect has not run.                                                                                                                                                               |
| `RedisError` from `applicationLayer`                       | Required Redis acquisition failed after observability | `NodeRedis.layer` connection failure, or the substitute's failure        | Fatal stage `application-acquisition` on the production path. Tests receive the error and the process stays alive.                                                                                                            |
| `StartupNotReady`                                          | The request facade was used before ready              | None                                                                     | `toNext` returns 503. The effect does not run. A Server Component that calls `Runtime.runPromise` directly gets Next.js's existing error page. That split is an operator-visible host choice, not a settled product decision. |
| `StartupFailure`                                           | Bootstrap classification for the fatal handler        | The three expected failures and defects caught at this boundary          | Not returned to request handlers. The diagnostic sentence includes the closed stage and reason, plus signal when the stage is observability.                                                                                  |

**Defects and interruption**: Defects caught inside `applicationLayer`'s build on the production path become
`StartupFailure` with `reason: "defect"` and the stage that was in progress. They still exit nonzero within 10
seconds. Interruption of the diagnostic or dispose fiber by the 1 second, 3 second, or 10 second budget is
expected and is not converted into a successful start. Request-time defects keep their current behavior.

**Effect environment requirements**: `loadProcessStartup` and `applicationLayer` have no remaining environment
requirements after they build or receive their arguments. `Runtime.runPromise` supplies `ApplicationServices`.
Logger, tracer, and metrics are runtime implementation services and are not added to the request requirement
union.

**Compatibility and relationships**: `TenantConfigService.layer(startup.server)` stays the tenant boundary.
`AuthenticationService.layer` and `SessionService.layer` stay parameterless and receive the frozen provider.
Ready HTTP statuses, redirects, and typed application errors stay. Production startup does not accept an
infrastructure argument.

### Contract evidence

| Claim                                                                                      | Meaningful violation                                                    | Durable evidence                                                                                                                                       | Manual/transient evidence                                             | Limitations and non-duplication                                                                                           |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| One validated startup value is required before infrastructure                              | A substitute Redis layer builds when `TENANT_CONFIG_DIR` is absent      | `it.effect`: invalid startup decoding fails, and an infrastructure effect that records acquisition does not run                                        | Manual configuration failure                                          | Exit status is manual                                                                                                     |
| Observability failure precedes Redis                                                       | The substitute Redis effect runs when the selected protocol is `grpc`   | `it.effect` on `applicationLayer` with a recording infrastructure layer and a selected invalid protocol                                                | Manual observability failure                                          | Does not inspect a real exporter                                                                                          |
| Substitute infrastructure can acquire the real services without a server or `process.exit` | The test calls `startProductionRuntime` or cannot read `SessionService` | `it.effect` with OTEL disabled, a `Layer` Redis substitute, and `NodeServices` through the infrastructure argument; read a public service result       | None                                                                  | Does not prove real Redis                                                                                                 |
| Redis failure is returned to the caller of `applicationLayer`                              | The test process exits                                                  | `it.effect` whose substitute fails with `RedisError`; assert the typed failure and that the test continues                                             | Manual acquisition failure owns nonzero exit                          | The substitute is not real Redis disconnect behavior                                                                      |
| Two requests in one process share one runtime                                              | Each request constructs a runtime                                       | None. `startProductionRuntime` is the only publisher and it can exit the process, so a unit test must not publish a second runtime to observe identity | V-010 temporary runtime-id probe in [quickstart.md](../quickstart.md) | The composition test proves one `applicationLayer` build can serve a public service. It does not prove two HTTP requests. |
| Pre-ready `runPromise` does not run the effect                                             | The effect's body increments a counter                                  | Vitest example: import the module, call `runPromise`, expect `StartupNotReady`, counter stays 0                                                        | Pending-acquisition probe                                             | Does not prove the Next.js listener blocked                                                                               |

The runtime-identity row is intentionally manual when an automated publisher would duplicate
`startProductionRuntime` or exit the worker. The composition tests above already prove one layer build can
serve a public service; they do not by themselves prove two HTTP requests.

### `packages/frontend/src/lib/next.ts`

**Responsibility**: Run a request effect on the shared runtime and translate the pre-ready refusal.

**Actual consumers**:

- Route handlers that already use `toNext`

**Proposed signatures**:

```ts
export const toNext: (
  handler: (request: NextRequest) => Effect.Effect<NextResponse, never, ApplicationServices>
) => (request: NextRequest) => Promise<NextResponse>
```

**Inputs and validation ownership**: The handler receives `NextRequest`. This adapter does not decode startup
configuration.

**Success semantics and invariants**:

- When the runtime is ready, behavior matches today's `Runtime.runPromise(handler(request))`.
- When the runtime rejects `StartupNotReady`, the handler function is not called and the response status is
  503.
- Other rejections are unchanged.

**Expected errors**:

| Public error             | Meaning for consumers         | Owned internal failures translated here | Consumer response                                                       |
| ------------------------ | ----------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| HTTP 503                 | Startup has not finished      | `StartupNotReady`                       | No tenant, authentication, or session effect runs                       |
| Existing effect failures | Unchanged application results | Unchanged                               | Unchanged Next.js rejection behavior for non-`StartupNotReady` failures |

**Defects and interruption**: Unchanged after ready.

**Effect environment requirements**: The handler's requirements are `ApplicationServices`. The adapter is plain
TypeScript around `Runtime.runPromise`.

**Compatibility and relationships**: `server-only` stays. Pages that call `Runtime.runPromise` directly keep
doing so and rely on the same refusal. Their status presentation is Next.js's existing error page. The
route-handler 503 versus that error page is an operator-visible host choice, not a settled product decision.
[quickstart.md](../quickstart.md) records which behavior `next start` actually showed.

### Contract evidence

| Claim                                              | Meaningful violation                                         | Durable evidence                                                                                                                    | Manual/transient evidence                               | Limitations and non-duplication                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `toNext` does not call the handler before ready    | The handler runs and returns 200 while startup is incomplete | Vitest test with the runtime uninstalled: handler sets a flag and returns a response; result status is 503 and the flag stays false | Pending-acquisition business request                    | Does not cover Server Components that call `Runtime` directly; those are covered by the `runPromise` refusal test |
| Ready authentication and tenant HTTP mappings stay | A login or tenant failure status changes                     | Existing framework-boundary tests                                                                                                   | Requirements BDD already required by verification V-007 | Not repeated as a new bootstrap suite                                                                             |

## Cross-module dependency direction

`instrumentation.ts` and `next.ts` import `runtime.ts`. `runtime.ts` imports the public parents
`config/index.ts`, `observability.ts`, `authentication.ts`, `session.ts`, and `tenant.ts`. `observability.ts`
imports `config/index.ts` and its own child `observability/http.ts`. It does not import `config/env.ts`.
`authentication.ts` imports its children and does not import `runtime.ts`. Tests import public parents only.
`otel-http.test.ts` stops importing `observability/http.ts`.

## Rejected abstractions and alternatives

- `lib/runtime/` private children: the startup sequence and the request facade are one public module, and a
  split would force sibling imports.
- A test-designated `makeTestRuntime` used by production: `applicationLayer` takes infrastructure as an
  ordinary `Redis | NodeServices.NodeServices` argument, and `startProductionRuntime` keeps `NodeRedis.layer`
  inside its `Layer.provide` chain.
- A second managed runtime for bootstrap diagnostics: standard error is available before Effect startup.
- A health-check service or mutable global locator: Next.js `register` plus `StartupNotReady` cover the
  consumers that exist.
- `effect/observability` OTLP exporters or a hand-built `NodeTracerProvider`: installed `NodeSdk.layer` is the
  provider.
- Per-signal disable flags other than `OTEL_*_EXPORTER=none`: that is the OTEL setting that means the signal
  is unselected, and unselected malformed values must not fail startup.

## Open decisions

### Blocking contract decisions

- None. The absent delivery issue is the maintainer exception already written in [spec.md](../spec.md).

### Implementation choices left to tasks

- The exact temporary latch around production Redis `connect()`, the stderr stall, and the runtime-id probe,
  provided they stay uncommitted and match [quickstart.md](../quickstart.md).
- Whether the fixed diagnostic sentence is written with a trailing newline. The stage, reason, and signal
  tokens are not optional.
