# Data Model: Deterministic Application Bootstrap and Runtime Composition

**Plan**: [plan.md](plan.md)

**Module signatures**: [contracts/modules.md](contracts/modules.md)

This feature adds no persisted domain record. The models below are the process-lifetime values and stage
machine the bootstrap contract depends on. Request-selected tenant files, session records, and authentication
transactions keep their current models.

## ProcessStartup

One value produced by copying `process.env` into one record and passing that record to
`ConfigProvider.fromEnvRecord(env)`. Later decoders use this provider. They do not call `fromEnv()` again.

| Field            | Source                                                        | Validation owner                                                                                |
| ---------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `server`         | Existing `ServerConfig`                                       | Existing tenant, Redis URL, session prefix, and `NODE_ENV` rules. Unchanged.                    |
| `otel`           | Extended `OtelConfig`                                         | Presence and boolean parsing only. URL and protocol syntax are not validated here.              |
| `logLevel`       | `LOG_LEVEL`, default `Info`                                   | Effect `Config.LogLevel`. Invalid values fail configuration.                                    |
| `authentication` | Existing authentication, credential, and transaction decoders | Existing origin, secret-map, prefix, and TTL rules. Failure is configuration, before Redis.     |
| `configProvider` | The snapshot used to decode the fields above                  | Later service decoders receive this provider and do not construct another environment provider. |

`server.tenant` remains process-wide directory and resolution settings. The selected `{alias}.json` file is not
part of this value and is still loaded per request.

Sensitive fields, including `authentication.credentials` and OTEL header strings retained on `otel`, are never
written to diagnostics. Header strings are not passed into exporter constructors; the OTLP exporter reads them
from its own environment path.

## ObservabilitySelection

Derived from `otel` by `selectObservability`. Each of `traces`, `metrics`, and `logs` is either absent or a
selected export `{ url, protocol }` where `protocol` is `http/json` or `http/protobuf`.

Selection for one signal:

1. `otel.disabled === true`: the signal is absent. Endpoint and protocol strings are ignored.
2. That signal's exporter value is `none`: the signal is absent. Its endpoint and protocol are ignored.
3. That signal has neither its own endpoint nor `OTEL_EXPORTER_OTLP_ENDPOINT`: the signal is absent. Its
   protocol and exporter strings are ignored.
4. The exporter value is present and is neither `otlp` nor `none`: `ObservabilityInitializationError` with
   `reason: "exporter"`.
5. Otherwise the signal is selected. A specific endpoint is used unchanged. A base endpoint gains `/v1/traces`,
   `/v1/metrics`, or `/v1/logs`, after trimming one trailing slash. The signal protocol, or the base protocol,
   or `http/protobuf`, must be `http/json` or `http/protobuf`. Any other selected protocol, including `grpc`,
   is `reason: "protocol"`. A selected string that does not decode through `Schema.URLFromString` is
   `reason: "endpoint"`. `Schema.URL` is not used here because it decodes a `URL` instance, not a string.
   The first failing signal, in order `traces`, `metrics`, `logs`, is the signal named by the diagnostic
   sentence.

A traces-specific endpoint does not select metrics or logs. A base endpoint can select all three unless a
signal is `none`. `exportUrl` on `OtelConfig` remains the traces URL string, including when the SDK is
disabled, matching the current parser tests. Selection, not the parser, decides whether that string is used.

An unreachable selected URL is still a successful selection. Connectivity is not a field on this model.

## Startup stage

Closed set: `configuration`, `observability`, `application-acquisition`, then readiness.

| From                      | Event                                    | To                                                 |
| ------------------------- | ---------------------------------------- | -------------------------------------------------- |
| process entry             | bootstrap stderr path is available       | `configuration`                                    |
| `configuration`           | `ProcessStartup` succeeds                | `observability`                                    |
| `configuration`           | `ConfigError`                            | fatal exit                                         |
| `observability`           | selection succeeds, including no signals | `application-acquisition`                          |
| `observability`           | `ObservabilityInitializationError`       | fatal exit                                         |
| `application-acquisition` | Redis and application services acquire   | ready                                              |
| `application-acquisition` | `RedisError` or another acquire failure  | fatal exit                                         |
| ready                     | graceful `SIGTERM` or `SIGINT`           | disposed while the pid is alive, then process exit |

Business effects run only in `ready`. `register()` resolves only in `ready`. Build evaluation does not enter
this machine.

## Fatal-handling budget

The clock starts when a required startup failure is recognized, not when the process starts.

| Budget                       | Limit      | Completion                                                                                     |
| ---------------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| Diagnostic attempt           | 1 second   | Fixed stage sentence delivered, or the attempt timed out or failed.                            |
| Telemetry shutdown and flush | 3 seconds  | `NodeSdk` `shutdownTimeout` and processor `exportTimeoutMillis`.                               |
| Whole fatal handling         | 10 seconds | `process.exit(1)` from a referenced timer, including diagnostics, flush, and resource release. |

The 1 second and 3 second budgets sit inside the 10 second budget. They do not add to it. Verification's
process-exit bound is the 10 second deadline. The 3 second value is only the flush timeout inside it. Graceful
shutdown uses the 3 second telemetry finalizer and is not forced to exit 0 by the 10 second fatal timer. V-010
passes only when the Redis client is gone from `CLIENT LIST` while `kill -0` on the server pid still succeeds,
and the process exits after that. A graceful dispose that is still incomplete after 10 seconds fails that
observation.

## StartupFailure

Bootstrap-only classification. It is not a request error and not an authentication, tenant, or session error.

| `stage`                   | `reason`                       | Typical source                                     |
| ------------------------- | ------------------------------ | -------------------------------------------------- |
| `configuration`           | `config`                       | `ConfigError` from `loadProcessStartup`            |
| `observability`           | `observability-initialization` | `ObservabilityInitializationError`                 |
| `application-acquisition` | `acquisition`                  | `RedisError` or another expected acquire failure   |
| the stage in progress     | `defect`                       | unexpected defect caught at the bootstrap boundary |

The diagnostic sentence is `pre-ets-frontend: startup failed during <stage> reason=<reason>`, and when the
stage is observability it is `pre-ets-frontend: startup failed during observability signal=<signal> reason=<reason>`.
`<stage>` is `configuration`, `observability`, or `application-acquisition`. `<reason>` is a closed literal:
`config`, `acquisition`, `defect`, `endpoint`, `exporter`, or `protocol`. `<signal>` is `logs`, `metrics`, or
`traces`. The sentence does not interpolate `error.message`, URLs, headers, or configuration. `reason` stays
available to the bootstrap program so expected failures stay distinct from defects. Request code never
receives `StartupFailure`. `StartupNotReady` is the separate request-facade refusal used before `ready`.
