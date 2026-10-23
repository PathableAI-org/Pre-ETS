# Observability (OpenTelemetry traces)

Traces-only instrumentation for the **Next.js Node server**
(`@pathableai/pre-ets-frontend`). Metrics, logs, browser/RUM, and
`packages/backend` instrumentation are out of scope for this increment.

**HTTP + export**: During ManagedRuntime boot (loaded from Next
`instrumentation.ts`), optional OTEL config decides whether tracing starts.
`OTEL_SDK_DISABLED=true`, or no OTLP endpoint, leaves the default noop tracer
in place: no provider, no client patch, and no Effect bridge. When an endpoint
is set, `@effect/opentelemetry` `NodeSdk` is the sole tracer provider and OTLP/HTTP
exporter. The observability module patches Node `http`/`https` and `fetch` and
records client spans without query strings. Next.js still emits the server span
through that registered global tracer.

**Effect bridge**: `@effect/opentelemetry` `OtelTracer.layer` is installed on the
frontend `ManagedRuntime` only when export is enabled, so Effect spans share that
provider. There is no second exporter. Use `Effect.withSpan` only at logical
boundaries when needed.

## Verification

Default local URL base: **`http://127.0.0.1:3000`**.

Any Next Node request produces a server span when an OTLP endpoint is
configured and the SDK is not disabled. For a quick check, hit the app root
(redirect/401 is fine) or any other route and search Tempo for service
`pre-ets-frontend`. Outbound client spans use the same trace and omit query
strings from the span name and `http.url`.

## Environment variables

Optional OTEL settings live in frontend `OtelConfig`, not `ServerConfig`. None
are required. A missing or empty value is unset. The config parser does not check
URL syntax. Startup rejects an unparseable export URL without logging the value.

| Variable                             | Role                                                                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OTEL_SDK_DISABLED`                  | **Off switch** — a true literal skips the provider, client patch, and Effect bridge. False literals (`false`, `0`, `off`, `no`, `n`) leave export on |
| `OTEL_EXPORTER_OTLP_ENDPOINT`        | OTLP base URL. Either this or the traces endpoint turns export on                                                                                    |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Traces URL. Wins over the base endpoint when both are set                                                                                            |
| `OTEL_SERVICE_NAME`                  | Resource `service.name`. Defaults to `pre-ets-frontend` when export is on                                                                            |
| `OTEL_EXPORTER_OTLP_HEADERS`         | Optional collector headers. Do not print them. Headers alone do not turn export on                                                                   |
| `OTEL_EXPORTER_OTLP_TRACES_HEADERS`  | Optional traces-specific headers. Same rule as the base headers                                                                                      |
| `OTEL_EXPORTER_OTLP_PROTOCOL`        | Optional OTLP protocol. Protocol alone does not turn export on                                                                                       |
| `OTEL_EXPORTER_OTLP_TRACES_PROTOCOL` | Optional traces protocol. Same rule as the base protocol                                                                                             |

Quiet local without a collector: leave the endpoint unset, or set
`OTEL_SDK_DISABLED=true`. An unset endpoint does **not** export to
`http://localhost:4318/v1/traces`.

### Precedence (boot)

1. `OTEL_SDK_DISABLED=true` skips all OTEL setup, even if an endpoint is present.
2. If neither endpoint variable is set, setup is skipped and the default noop tracer stays in place.
3. Otherwise ManagedRuntime builds `@effect/opentelemetry` `NodeSdk.layerTracerProvider` with the parsed traces URL and service name, registers that provider for Next.js, and installs `OtelTracer.layer`. Startup uses the parsed flag. It does not ask the SDK to reinterpret `OTEL_SDK_DISABLED`.

Traces-specific headers override base header keys. The selected OTLP/HTTP exporter
reads those header variables itself. The default protocol is `http/protobuf`, which
uses the protobuf HTTP exporter. `http/json` uses the JSON HTTP exporter. `grpc`
fails startup. A base endpoint is exported at `{base}/v1/traces`. A traces endpoint
is used unchanged. An unparseable endpoint fails startup without logging the value.
An unreachable collector does not.

### Startup policy after a successful boot

If the collector is unreachable after start (SDK enabled), export is best-effort:
request handling continues. Expect export failure diagnostics from the
OpenTelemetry exporter on stderr — never as a hard crash, and
never with header values printed by app code.

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
The frontend exports traces only. An empty Loki or Prometheus result does not
mean the application was quiet or emitted no metrics.

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
2. Logs: `query_loki_logs` may be used. Application logs stay on the Next
   process, so an empty result is not evidence that the app logged nothing.
3. Metrics: `query_prometheus` may be used. The frontend does not export
   metrics, so an empty result is not evidence that the app emitted none.

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

- Metrics and logs export
- Browser/RUM and cross-process `traceparent` propagation
- A second OTLP exporter alongside `@effect/opentelemetry` `NodeSdk` (including Effect `OtlpTracer`)
- Production sampling policies, alerting, and SLOs
- Hosted vendor selection
- `packages/backend` process instrumentation
