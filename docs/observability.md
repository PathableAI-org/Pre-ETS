# Observability (OpenTelemetry traces, metrics, and logs)

Instrumentation for the **Next.js Node server**
(`@pathableai/pre-ets-frontend`). `packages/backend` instrumentation does not
exist yet. Browser tracing is being added so the
[verification harness](engineering/verification-harness.md) can observe browser
behavior. Its switch and rendered configuration are described in
[Browser tracing switch](#browser-tracing-switch). Until the browser starts
exporting, browser facts are verified through browser interaction.

**Runtime + export**: `instrumentation.ts` starts one process runtime. OTEL is
all-or-nothing: `OTEL_SDK_DISABLED=true` installs no SDK, exporters, automatic
instrumentation, or Effect OpenTelemetry bridges. Otherwise, the endpoint and
service name are required and traces, metrics, and logs are enabled together.
The application constructs OTLP/HTTP **protobuf** exporters, batch span and log
processors, and two periodic metric readers. It does not select signals
independently or construct JSON HTTP or gRPC exporters.

**Node SDK + Effect bridge**: The enabled path starts
`@opentelemetry/sdk-node` to register the global OpenTelemetry providers and
enable automatic instrumentation. Next.js and instrumented libraries use that
global provider. The same span and log processors are passed to
`@effect/opentelemetry/NodeSdk`, which supplies the scoped Effect tracer,
logger, and metrics bridges. Traces and logs are separate global and Effect
provider paths sharing one export pipeline per signal.

Metrics use one reader per provider, because an OpenTelemetry metric reader
can be bound to only one producer. The global `MeterProvider` owns one periodic
reader and OTLP metric exporter for Node runtime metrics and other
OpenTelemetry API metrics. The Effect metrics bridge owns a second reader and
exporter for Effect `Metric` values. Both export to the same
`v1/metrics` URL on the same interval, so each interval sends two metric
requests. The Effect reader is flushed and shut down when the runtime scope
closes.

Use `Effect.withSpan` only at logical boundaries when needed. The existing
console logger remains beside OTLP logs: pretty when `NODE_ENV=development`,
JSON otherwise. An absent `NODE_ENV` means development; any value other than
`development`, `production`, or `test` fails startup. A startup settings failure
is logged as JSON, because the format setting is not yet known.

Automatic instrumentation covers:

- Incoming and outgoing Node HTTP/HTTPS requests, including default W3C
  trace-context propagation and configured query parameter redaction.
- Redis clients.
- Node runtime metrics.

## Verification

Default local URL base: **`http://127.0.0.1:3000`**.

With OTEL enabled, any Next Node request should produce a server span. For a
quick check, hit the app root (redirect/401 is fine) or any other route and
search Tempo for the configured service (`pre-ets-frontend` in the examples).
Outbound HTTP and Redis spans provide additional request evidence. Effect logs
are exported to Loki, while Effect and Node runtime metrics are exported to
Prometheus. An empty result is not conclusive application evidence: check that
OTEL was enabled, the required configuration was accepted, traffic occurred,
and batch/periodic export had time to complete.

## Environment variables

OTEL settings are the `otel` part of the frontend `StartupConfig`, decoded once at startup.
`OTEL_SDK_DISABLED` defaults to `false`. When OTEL is enabled,
`OTEL_EXPORTER_OTLP_ENDPOINT` must be a valid URL and `OTEL_SERVICE_NAME` must
be non-empty; neither has an application default. When OTEL is disabled, those
two settings may be absent. Supplied raw values still need to decode before
the disabled setting is applied.

| Variable                      | Role                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `OTEL_SDK_DISABLED`           | **Off switch** — a true literal skips both SDKs, automatic instrumentation, exporters, and Effect bridges |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Required when enabled. Base URL for all three OTLP/HTTP protobuf exporters                                |
| `OTEL_SERVICE_NAME`           | Required when enabled. Resource `service.name`; use `pre-ets-frontend` for the standard local setup       |
| `OTEL_SERVICE_VERSION`        | Optional non-empty resource `service.version`. Defaults to `UNKNOWN`                                      |
| `OTEL_EXPORTER_OTLP_HEADERS`  | Optional collector headers. Do not print them. Headers do not replace either required setting             |
| `OTEL_RESOURCE_ATTRIBUTES`    | Optional resource attributes, read by the Node SDK. Startup also reads `service.instance.id` from it      |
| `BROWSER_TRACING_ENABLED`     | Optional browser tracing switch. Defaults to off. See [Browser tracing switch](#browser-tracing-switch)   |

For each signal, the application appends `v1/traces`, `v1/metrics`, or
`v1/logs` directly to the parsed base URL's string form. Use a trailing slash,
particularly when the URL contains a path. A host-only URL such as
`http://127.0.0.1:4318` is normalized to `http://127.0.0.1:4318/` before the
path is appended.

The explicit per-signal URLs mean `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`,
`OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`, and `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`
do not override the configured base URL. `OTEL_TRACES_EXPORTER`,
`OTEL_METRICS_EXPORTER`, and `OTEL_LOGS_EXPORTER` are not per-signal off
switches in this setup. Protocol variables likewise do not select alternate
exporter implementations; only the protobuf exporters are constructed.

The OTLP exporters read headers from the environment. Signal-specific
`OTEL_EXPORTER_OTLP_TRACES_HEADERS`, `OTEL_EXPORTER_OTLP_METRICS_HEADERS`, and
`OTEL_EXPORTER_OTLP_LOGS_HEADERS` values override matching base header keys.
Never log or commit real header values.

### Browser tracing switch

Browser tracing is a local-verification facility. It is assumed never to be
active in production: the switch defaults to off, and production configuration
never sets it. The application does not refuse the switch in a production
build, so keep it out of every deployed environment's configuration.

`BROWSER_TRACING_ENABLED` is decoded with the other OTEL settings. It accepts
`true`, `yes`, `on`, `1`, or `y` for on and `false`, `no`, `off`, `0`, or `n`
for off. Any other value fails startup and names the setting. Browser tracing
is effective only when the switch is on **and** OTEL is enabled. With
`OTEL_SDK_DISABLED=true` the switch has no effect.

When browser tracing is effective, every protected document (the `(app)`
route group) renders two `<meta>` elements into `<head>`:

- `name="traceparent"`: the W3C trace context of the server's handling of
  that document request, including a trace continued from an incoming
  `traceparent` header.
- `name="preets-browser-tracing"`: JSON with exactly four values:
  `endpoint` (the OTLP base URL the server exports to), `serviceName`,
  `serviceVersion`, and `serviceInstanceId` (the run identifier, from
  `service.instance.id` in `OTEL_RESOURCE_ATTRIBUTES`; absent when that key is
  missing or the list does not parse).

Public documents, such as `/login-unavailable`, `/forbidden`, and `/_test/*`,
render neither element. When browser tracing is off, no protected document
renders either element.

The page never receives collector headers. Browser export supports only
collectors that require no headers. When browser tracing is effective and
`OTEL_EXPORTER_OTLP_HEADERS` is set, startup logs one warning,
`Browser tracing exports without collector headers`, with no header names or
values. Server export still sends the headers.

Because the endpoint is rendered into the page, it must carry no credential.
With the switch on, `OTEL_EXPORTER_OTLP_ENDPOINT` must be an `http:` or
`https:` URL with no username, password, query string, or fragment. Any other
endpoint fails startup with
`BROWSER_TRACING_ENABLED requires an OTEL_EXPORTER_OTLP_ENDPOINT without credentials, query, or fragment`.
That message never quotes the URL. With the switch off, such an endpoint is
still accepted for server-only export. A malformed endpoint fails startup with
an error that names `OTEL_EXPORTER_OTLP_ENDPOINT` without quoting the value,
whatever the switch.

Local example, with the observability profile running:

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318/ \
OTEL_SERVICE_NAME=pre-ets-frontend \
BROWSER_TRACING_ENABLED=true \
pnpm --filter @pathableai/pre-ets-frontend start
```

### Startup and export policy

1. Configuration is decoded before application infrastructure is acquired.
   Missing required enabled settings, an invalid endpoint URL, or another
   configuration decoding error fails startup.
2. With `OTEL_SDK_DISABLED=true`, `NodeSdk.layerEmpty` supplies an empty Effect
   resource and the standard Node SDK is not started.
3. With OTEL enabled, exporter, processor, instrumentation, and standard Node
   SDK construction/startup errors are wrapped as
   `ObservabilityInitializationError`; application infrastructure is not
   acquired.
4. After successful initialization, collector delivery remains best-effort.
   An unreachable collector does not intentionally fail request handling or
   remove readiness.

Delivery failures follow the OpenTelemetry exporters and SDK diagnostics.
There is no application-defined fixed `telemetry delivery failed` stderr
message, and the previous custom diagnostic suppression is not installed.
The application does not set custom batch intervals or exporter timeouts;
applicable SDK defaults and environment settings apply. The periodic metric
readers use the SDK default 60-second export interval.

## Required span attributes and redaction

Each **Next.js HTTP request span** should identify method, route template,
and status/outcome when Next emits them (accepted key names):

- Method: `http.request.method` or `http.method`
- Route: `http.route` or `next.route`
- Status: `http.response.status_code` or `http.status_code`

Do **not** copy Authorization, Cookie, or other secrets onto spans. Do **not**
put secrets on `Effect.withSpan` attributes.

HTTP instrumentation does not remove every query string. On both incoming and
outgoing spans, it replaces matching values with `REDACTED` for these exact,
case-sensitive parameter names:

- `sig`, `Signature`, `AWSAccessKeyId`, `X-Goog-Signature`
- `X-Amz-Signature`, `X-Amz-Credential`, `X-Amz-Security-Token`
- `api_key`, `code`, `state`

Client spans record the redacted URL in `url.full`; server spans record the
redacted query in `url.query`. Other parameter names and values remain, so do
not place secrets in URLs. Confirm redaction and required attributes with a
manual Tempo sample review.

## Verification telemetry conventions

A feature's `contracts/telemetry.md` designs the telemetry its verification
needs (see the [verification harness](engineering/verification-harness.md)).
These conventions apply to every telemetry contract and to the instrumentation
that implements it.

### Signals

- **Spans** carry facts about one operation and its causal place in a request or
  journey. Prefer annotating the existing `Effect.fn` span, named
  `Service.operation`, over adding a new span.
- **Logs** record a discrete decision that a verifier searches for by message,
  such as a rejected configuration. Use a fixed message per decision and put
  the varying facts in structured annotations.
- **Metrics** record rates and distributions across many requests, such as
  renewal outcomes per minute. Metric attributes stay low-cardinality: no
  session, trace, user, or request identifiers, and no timestamps.

### Names and values

- Custom attributes use `preets.<area>.<name>` in snake case, for example
  `preets.session.deadline_ms`. Standard OpenTelemetry semantic-convention keys
  keep their own names.
- Every span named in a telemetry contract sets `preets.outcome` to a value from
  a closed set that the contract defines, such as `renewed` or `rejected_late`.
- Times are epoch milliseconds with a `_ms` suffix. Durations are milliseconds
  with a `_duration_ms` suffix.
- Correlation uses W3C trace context, `service.version` set to the revision
  under verification, `service.instance.id` set to the verification run's
  UUID, `session.id` set to the session's opaque telemetry ID
  (never its cookie reference), and `preets.tenant.alias`.

### Data classes

| Allowed                                         | Forbidden                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| Outcomes and decisions from closed sets         | Credentials, API keys, and header values such as Authorization or Cookie        |
| Non-secret policy and configuration values      | Session references and other cookie values                                      |
| Deadlines, timestamps, durations, and counts    | Access, ID, and refresh tokens                                                  |
| Opaque identifiers generated only for telemetry | OIDC authorization codes, state, nonce, and PKCE verifiers                      |
| Tenant alias and route templates                | Personal data, including names, email addresses, and identity-provider subjects |
| Revision and environment names                  | PHI, client record content, and free text from users or the page                |

When a verifier needs a forbidden fact, the telemetry contract records how the
fact is verified instead, for example through a module test or an opaque
correlation identifier. A forbidden value found in exported telemetry is a
verification failure for the slice that emitted it.

Durable tests do not assert any of these signals. The verification agent and
manual inspection observe them.

Signals already emitted by the session, coordination, and protection flows are
listed in [Session state](session-state.md#verification-signals). Reference
those rows from a feature's telemetry contract instead of redefining them.

## Local Grafana / OTLP

Optional Compose profile — see [docker-compose.md](./docker-compose.md):

```sh
docker compose --profile observability up -d otel-lgtm --wait
```

- Grafana UI: `http://127.0.0.1:3300` (anonymous **Viewer**)
- OTLP HTTP: `http://127.0.0.1:4318`

**Explore requires Editor+.** Anonymous Viewer does not show Explore. Sign in as
`admin` / `admin` (skip password change), then open Explore → Tempo.

Enable export (`.env.local` or shell) — leave `OTEL_SDK_DISABLED` unset:

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318/ \
OTEL_SERVICE_NAME=pre-ets-frontend \
pnpm --filter @pathableai/pre-ets-frontend dev
```

Quiet local without a collector requires the off switch; omitting the endpoint
while OTEL is enabled is a startup configuration error:

```sh
OTEL_SDK_DISABLED=true \
pnpm --filter @pathableai/pre-ets-frontend dev
```

```sh
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
```

In Grafana → Explore → Tempo (as admin), search service `pre-ets-frontend`.
Allow up to ~30s for batched trace/log export and ~60s for periodic metrics.

Stop only the observability service:

```sh
docker compose --profile observability stop otel-lgtm
```

## Deployed OTLP (vendor-agnostic)

Same instrumentation. Point `OTEL_EXPORTER_OTLP_ENDPOINT` (and optional
`OTEL_EXPORTER_OTLP_HEADERS`) at any OTLP/HTTP protobuf-compatible collector,
and set `OTEL_SERVICE_NAME`. No SaaS is mandated. Set
`OTEL_SDK_DISABLED=true` when export and automatic instrumentation must stay
off; leaving the endpoint unset is not the off switch.

### Second-endpoint / headers switch (SC-004)

Example against a second local listener on port `14318`:

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:14318/ \
OTEL_EXPORTER_OTLP_HEADERS='Authorization=Bearer sc004-test-token' \
OTEL_SERVICE_NAME=pre-ets-frontend \
pnpm --filter @pathableai/pre-ets-frontend start
```

Confirm the span arrives at that endpoint **and** that the synthetic header is
present on the OTLP/HTTP request. Endpoint-only receipt without header proof
does not satisfy SC-004.

## Sampling

No application sampler is configured. The providers use the OpenTelemetry SDK
defaults (parent-based sampling with an always-on root), not an unconditional
application-enforced 100% sampling policy. Production sampling policy is
deferred. Alerting and SLOs are out of scope.

## Grafana MCP for agents

Requires the optional observability profile and `uvx`. The server does nothing
useful until `otel-lgtm` is up and the frontend process was started with OTEL
enabled, a valid `OTEL_EXPORTER_OTLP_ENDPOINT`, and `OTEL_SERVICE_NAME`.
`OTEL_SDK_DISABLED=true` starts no exporters. Allow about 30 seconds after a
request for trace/log batch export and 60 seconds for periodic metrics.

The image and digest are the `otel-lgtm` service in `compose.yaml`
(`grafana/otel-lgtm:0.37.0`). That image includes Tempo, Loki, and Prometheus.
Enabled OTEL exports all three signals. Empty Loki or Prometheus results are
not evidence that the application logged nothing or emitted no metrics; check
configuration, traffic, export timing, and collector delivery.

Pinned package: **`mcp-grafana==2.0.0`**. Unversioned `uvx mcp-grafana` is not
acceptable. The committed command is read-only (`--disable-write`), disables
anonymous usage reporting, disables the raw Grafana API passthrough, and
enables only search, datasource, Prometheus, Loki, and Tempo tools.

### Connection

| Setting       | Value                                           |
| ------------- | ----------------------------------------------- |
| `GRAFANA_URL` | `http://127.0.0.1:3300`                         |
| Auth          | Anonymous org role **Viewer** (Compose default) |

Anonymous Viewer can list the local datasources and query Prometheus, Loki, and
Tempo. A query tool that returns 403 needs `datasources:query`: create a
read-only Grafana service account token and set `GRAFANA_SERVICE_ACCOUNT_TOKEN`
in the developer environment. Do not commit the token. Built-in `admin` /
`admin` or anonymous Admin are troubleshooting fallbacks only — not the
documented MCP default.

### Where the server is declared

[`.mcp.json`](../.mcp.json) is the canonical `mcpServers` definition. Claude
Code and GitHub Copilot sessions load it. Cursor and Codex do not, so the same
server is also declared in [`.cursor/mcp.json`](../.cursor/mcp.json) and
[`.codex/config.toml`](../.codex/config.toml). Edit `.mcp.json` first and keep
those copies identical. Clients ask the developer to approve the server once.
Codex skips project `.codex/` config until the checkout is trusted.

Do not commit `.vscode/mcp.json`. Copilot sessions already read `.mcp.json`.
The VS Code MCP panel uses a different key. For that panel only, translate the
canonical server to:

```json
{
  "servers": {
    "grafana": {
      "type": "stdio",
      "command": "uvx",
      "args": [
        "mcp-grafana==2.0.0",
        "--disable-write",
        "--usage-stats=disabled",
        "--disable-api",
        "--enabled-tools",
        "search,datasource,prometheus,loki,tempo"
      ],
      "env": {
        "GRAFANA_URL": "http://127.0.0.1:3300"
      }
    }
  }
}
```

### Agent query procedure

Call `list_datasources` and use the returned UIDs. On this Compose image those
UIDs are `tempo`, `loki`, and `prometheus`.

1. Traces: `search_tempo_traces` with
   `{ resource.service.name = "pre-ets-frontend" }`, then `get_tempo_trace` for
   a returned trace ID. Check HTTP query redaction using the parameter list
   above. Do not copy Authorization, Cookie, unredacted query values, or
   collector headers into the chat.
2. Logs: with OTEL enabled, use `query_loki_logs` for exported Effect logs.
   Local console output remains on the Next process. An empty result alone is
   not evidence that the app logged nothing.
3. Metrics: with OTEL enabled, use `query_prometheus` for Effect and Node
   runtime metrics. An empty result alone is not evidence that the app emitted
   none; allow for the 60-second reader interval.

### Human verification checklist (SC-006)

Use when CI cannot run MCP. Complete before merge:

1. `docker compose --profile observability up -d otel-lgtm --wait` succeeds; Grafana opens
   at `http://127.0.0.1:3300`.
2. Next starts with the required endpoint and service name and exports at least
   one span after traffic. Query Loki and Prometheus as needed for the change;
   do not treat an empty result as conclusive without checking export timing
   and delivery.
3. Use the committed `mcp-grafana==2.0.0` command (`--disable-write`,
   `--usage-stats=disabled`).
4. From an MCP client, `list_datasources` and one `search_tempo_traces` for
   `pre-ets-frontend` succeed on the first attempt. A 403 on the Tempo search
   means the Viewer role cannot query and the token path above is required.
5. Record commands + outcome as PR/acceptance evidence.

Docs-only command lists without a live success are not SC-006 evidence.

## Out of scope (stubs)

- Browser/RUM
- Independent per-signal enablement, signal-specific collector endpoints, and
  alternate JSON HTTP or gRPC exporters
- A second OTLP export pipeline alongside the shared processors (including
  Effect `OtlpTracer`)
- Production sampling policies, alerting, and SLOs
- Hosted vendor selection
- `packages/backend` process instrumentation
