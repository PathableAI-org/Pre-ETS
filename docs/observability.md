# Observability (OpenTelemetry traces, metrics, and logs)

Instrumentation for the **Next.js Node server**
(`@pathableai/pre-ets-frontend`). Browser/RUM and `packages/backend`
instrumentation are out of scope.

**HTTP + export**: `instrumentation.ts` starts one process runtime. Optional OTEL
config decides which signals are selected. `OTEL_SDK_DISABLED=true` skips every
signal, including a malformed endpoint or protocol. A signal whose exporter is
`none`, or that has neither its own endpoint nor the base endpoint, is absent and
its protocol is ignored. When traces are selected, `@effect/opentelemetry`
`NodeSdk` is the sole tracer provider. The observability module then patches Node
`http`/`https` and `fetch` and records client spans without query strings. Next.js
still emits the server span through that registered global tracer. When traces
are not selected, the process does not register a provider and does not patch
HTTP. Logs and metrics use the same `NodeSdk` layer and the same precedence.
There is no second tracer provider.

**Effect bridge**: The Node SDK installs the Effect tracer, logger, and metrics
bridges only for the signals that were selected. Use `Effect.withSpan` only at
logical boundaries when needed. The console logger stays beside OTLP logs: JSON
when `NODE_ENV=production`, pretty otherwise.

## Verification

Default local URL base: **`http://127.0.0.1:3000`**.

Any Next Node request produces a server span when traces are selected. For a
quick check, hit the app root (redirect/401 is fine) or any other route and
search Tempo for service `pre-ets-frontend`. Outbound client spans use the same
trace and omit query strings from the span name and `http.url`. Loki is evidence
for logs only when logs are selected. Prometheus is evidence for metrics only
when metrics are selected (FR-007, V-003, V-004). An empty result for a signal
that was not selected does not mean the process was quiet.

## Environment variables

Optional OTEL settings live in frontend `OtelConfig`, not `ServerConfig`. None
are required. A missing or empty value is unset. The config parser does not check
URL syntax. Startup rejects an unparseable export URL without logging the value.

| Variable                              | Role                                                                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OTEL_SDK_DISABLED`                   | **Off switch** — a true literal skips the provider, client patch, and Effect bridge. False literals (`false`, `0`, `off`, `no`, `n`) leave export on |
| `OTEL_EXPORTER_OTLP_ENDPOINT`         | OTLP base URL. A selected signal appends `/v1/traces`, `/v1/metrics`, or `/v1/logs` after one trailing slash is removed                              |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`  | Traces URL. Wins over the base endpoint for traces                                                                                                   |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | Metrics URL. Wins over the base endpoint for metrics                                                                                                 |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`    | Logs URL. Wins over the base endpoint for logs                                                                                                       |
| `OTEL_TRACES_EXPORTER`                | `otlp` selects traces when a URL is present. `none` leaves traces absent and ignores that signal's endpoint and protocol                             |
| `OTEL_METRICS_EXPORTER`               | Same choice for metrics                                                                                                                              |
| `OTEL_LOGS_EXPORTER`                  | Same choice for logs                                                                                                                                 |
| `OTEL_SERVICE_NAME`                   | Resource `service.name`. Defaults to `pre-ets-frontend` when any signal is selected                                                                  |
| `OTEL_EXPORTER_OTLP_HEADERS`          | Optional collector headers. Do not print them. Headers alone do not turn export on. Exporters read them from the environment                         |
| `OTEL_EXPORTER_OTLP_TRACES_HEADERS`   | Optional traces-specific headers. Same rule as the base headers                                                                                      |
| `OTEL_EXPORTER_OTLP_PROTOCOL`         | Optional OTLP protocol. Protocol alone does not turn export on                                                                                       |
| `OTEL_EXPORTER_OTLP_TRACES_PROTOCOL`  | Optional traces protocol. Wins over the base protocol for traces                                                                                     |
| `OTEL_EXPORTER_OTLP_METRICS_PROTOCOL` | Optional metrics protocol. Wins over the base protocol for metrics                                                                                   |
| `OTEL_EXPORTER_OTLP_LOGS_PROTOCOL`    | Optional logs protocol. Wins over the base protocol for logs                                                                                         |

Quiet local without a collector: leave the endpoint unset, or set
`OTEL_SDK_DISABLED=true`. An unset endpoint does **not** export to
`http://localhost:4318/v1/traces`.

### Precedence (boot)

Each signal is judged in order traces, then metrics, then logs. The first failure
wins (FR-007, FR-010, V-004).

1. `OTEL_SDK_DISABLED=true` leaves every signal absent, even if an endpoint or protocol is unusable.
2. Exporter `none` leaves that signal absent and ignores its endpoint and protocol.
3. If neither that signal's endpoint nor the base endpoint is set, the signal is absent and its protocol and exporter are ignored.
4. Any other exporter value than `otlp` fails startup for that signal (`reason=exporter`).
5. A selected protocol other than `http/json` or `http/protobuf` fails startup (`reason=protocol`). `grpc` is fatal only when the signal is selected. The default is `http/protobuf`.
6. A selected string that is not a URL fails startup (`reason=endpoint`) without logging the value.

`http/protobuf` uses the protobuf HTTP exporter. `http/json` uses the JSON HTTP exporter.
A traces endpoint is used unchanged for traces. A logs or metrics endpoint wins for
that signal. Otherwise the base endpoint gains `/v1/traces`, `/v1/metrics`, or
`/v1/logs`. Signal-specific headers override base header keys. The exporter reads
those variables itself. Startup does not log header values.

An unreachable selected URL is still a successful selection (FR-011, V-005).
Collector unreachability is not an initialization failure and does not remove readiness.

### Startup policy after a successful boot

If the collector is unreachable after start, export is best-effort: request
handling continues and the process does not exit. A failed export writes only
`pre-ets-frontend: telemetry delivery failed signal=<signal>`, where `<signal>`
is `logs`, `metrics`, or `traces` (FR-011, V-005). That sentence has no URL,
header, or exporter configuration.

## Required span attributes

Each **Next.js HTTP request span** should identify method, route template,
and status/outcome when Next emits them (accepted key names):

- Method: `http.request.method` or `http.method`
- Route: `http.route` or `next.route`
- Status: `http.response.status_code` or `http.status_code`

Do **not** copy Authorization,
Cookie, or other secrets onto spans. Do **not** put secrets on `Effect.withSpan` attributes.
Client spans omit the query string, fragment, and userinfo from the span name,
`http.url`, and `resource.name`.
Confirm with a manual Tempo sample review.

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
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
OTEL_SERVICE_NAME=pre-ets-frontend \
pnpm --filter @pathableai/pre-ets-frontend dev
```

Quiet local (no collector): omit `OTEL_EXPORTER_OTLP_ENDPOINT`, or set the off switch:

```sh
OTEL_SDK_DISABLED=true \
pnpm --filter @pathableai/pre-ets-frontend dev
```

```sh
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
```

In Grafana → Explore → Tempo (as admin), search service `pre-ets-frontend`.
Allow up to ~30s for batch export.

Stop only the observability service:

```sh
docker compose --profile observability stop otel-lgtm
```

## Deployed OTLP (vendor-agnostic)

Same instrumentation. Point `OTEL_EXPORTER_OTLP_ENDPOINT` (and optional
`OTEL_EXPORTER_OTLP_HEADERS`) at any OTLP/HTTP-compatible collector. No SaaS is
mandated. Trust the environment and SDK for endpoint correctness. Leave the
endpoint unset, or set `OTEL_SDK_DISABLED=true`, when export must stay off.

### Second-endpoint / headers switch (SC-004)

Example against a second local listener on port `14318`:

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:14318 \
OTEL_EXPORTER_OTLP_HEADERS='Authorization=Bearer sc004-test-token' \
OTEL_SERVICE_NAME=pre-ets-frontend \
pnpm --filter @pathableai/pre-ets-frontend start
```

Confirm the span arrives at that endpoint **and** that the synthetic header is
present on the OTLP/HTTP request. Endpoint-only receipt without header proof
does not satisfy SC-004.

## Sampling

Local sampling is **100%** (`AlwaysOnSampler`). Production sampling
policy is deferred. Alerting and SLOs are out of scope.

## Grafana MCP for agents

Requires the optional observability profile and `uvx`. The server does nothing
useful until `otel-lgtm` is up and the frontend process was started with
`OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318`. Without that endpoint the
tracer is a noop and every query is empty. Allow about 30 seconds after a
request for batch export.

The image and digest are the `otel-lgtm` service in `compose.yaml`
(`grafana/otel-lgtm:0.37.0`). That image includes Tempo, Loki, and Prometheus.
Loki is evidence only when logs are selected, and Prometheus is evidence only
when metrics are selected (V-003, V-004). An empty result for a signal that was
not selected does not mean the application was quiet.

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
   a returned trace ID. Client spans omit the query string, fragment, and
   userinfo. Do not copy Authorization, Cookie, or collector headers into the
   chat.
2. Logs: `query_loki_logs` may be used when logs are selected. An empty result
   for an unselected logs signal is not evidence that the app logged nothing.
   Local console output remains on the Next process either way.
3. Metrics: `query_prometheus` may be used when metrics are selected. An empty
   result for an unselected metrics signal is not evidence that the app emitted
   none.

### Human verification checklist (SC-006)

Use when CI cannot run MCP. Complete before merge:

1. `docker compose --profile observability up -d otel-lgtm --wait` succeeds; Grafana opens
   at `http://127.0.0.1:3300`.
2. Next exports at least one span (any route with SDK enabled / not `OTEL_SDK_DISABLED`).
3. Use the committed `mcp-grafana==2.0.0` command (`--disable-write`,
   `--usage-stats=disabled`).
4. From an MCP client, `list_datasources` and one `search_tempo_traces` for
   `pre-ets-frontend` succeed on the first attempt. A 403 on the Tempo search
   means the Viewer role cannot query and the token path above is required.
5. Record commands + outcome as PR/acceptance evidence.

Docs-only command lists without a live success are not SC-006 evidence.

## Out of scope (stubs)

- Browser/RUM and cross-process `traceparent` propagation
- A second OTLP exporter alongside `@effect/opentelemetry` `NodeSdk` (including Effect `OtlpTracer`)
- Production sampling policies, alerting, and SLOs
- Hosted vendor selection
- `packages/backend` process instrumentation
