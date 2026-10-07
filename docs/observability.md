# Observability (OpenTelemetry traces)

Traces-only instrumentation for the **Next.js Node server**
(`@pathableai/pre-ets-frontend`). Metrics, logs, browser/RUM, and
`packages/backend` instrumentation are out of scope for this increment.

**HTTP + export**: `@vercel/otel` registered from Next `instrumentation.ts` when
traces are enabled (single OTLP exporter; auto-instrumented request spans).

**Effect bridge**: `@effect/opentelemetry` `OtelTracer.layerGlobal` on the
frontend `ManagedRuntime` attaches Effect spans to that global provider — no
second exporter. Use `Effect.withSpan` only at logical boundaries (children under
the HTTP request span).

## Demo surface

Default local URL base: **`http://127.0.0.1:3000`**.

| Route                   | Status | Purpose                                         |
| ----------------------- | ------ | ----------------------------------------------- |
| `GET /api/health`       | 200    | Success request for span verification           |
| `GET /api/health/error` | 500    | Intentional error request for span verification |

These handlers bypass the session/OIDC proxy matcher (`/api/*` is outside it).
Request-root spans come from `@vercel/otel`. Handlers also emit a small Effect
logical child (`health.check` / `health.error`) to verify the bridge.

## Environment variables

| Variable                      | Role                                                                     |
| ----------------------------- | ------------------------------------------------------------------------ |
| `OTEL_TRACES_ENABLED`         | Explicit opt-in (`true` / `1`, case-insensitive); **default off**        |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Base OTLP/HTTP URL (e.g. `http://127.0.0.1:4318`); traces → `/v1/traces` |
| `OTEL_SERVICE_NAME`           | Resource `service.name` (default `pre-ets-frontend`)                     |
| `OTEL_EXPORTER_OTLP_HEADERS`  | Optional `key=value,key2=value2` for authenticated collectors            |
| `OTEL_SDK_DISABLED`           | When `true`/`1`, do not export even if traces enabled                    |

See also `packages/frontend/.env.example` and
`specs/006-otel-observability/contracts/otlp-export.md`.

### Precedence (boot)

1. Flag not `true`/`1` → no `@vercel/otel` registration; healthy start.
2. `OTEL_SDK_DISABLED=true` → no export; healthy start.
3. Enabled + missing/invalid endpoint:
   - **local/dev**: clear diagnostic on stderr; run **without** export (fail-soft).
   - **production** (`NODE_ENV=production`): clear diagnostic; **refuse-to-start**.
4. Enabled + valid endpoint → `registerOTel` + Effect global Tracer bridge;
   best-effort batch export (OTLP/HTTP protobuf).

Diagnostics never print `OTEL_EXPORTER_OTLP_HEADERS` values.

### Startup policy after valid start

If the collector is unreachable after a valid start, export is best-effort:
request handling continues. Expect:

1. HTTP requests (e.g. `GET /api/health`) to keep returning successfully.
2. Export failure diagnostics from the OpenTelemetry / `@vercel/otel` exporter
   on stderr (and/or the `[observability]` boot line) — never as a hard crash,
   and never with `OTEL_EXPORTER_OTLP_HEADERS` values.

## Required span attributes

Each **auto-instrumented HTTP request span** must identify method, route
template, and status/outcome (accepted key names):

- Method: `http.request.method` or `http.method`
- Route: `http.route` or `next.route`
- Status: `http.response.status_code` or `http.status_code`

Prohibited on spans: Authorization / bearer tokens, cookies, session ids, raw
bodies, tenant secrets. Filtering is applied at the export boundary via
`AttributeSanitizingSpanProcessor` (and `attributesFromHeadersSafe` so headers
are never promoted onto root spans).

## Local Grafana / OTLP

Optional Compose profile — see [docker-compose.md](./docker-compose.md):

```sh
docker compose --profile observability up -d --wait
```

Keycloak health can fail `--wait` while `otel-lgtm` is still healthy; if needed:

```sh
docker compose --profile observability up -d otel-lgtm --wait
```

- Grafana UI: `http://127.0.0.1:3300` (anonymous **Viewer**)
- OTLP HTTP: `http://127.0.0.1:4318`

**Explore requires Editor+.** Anonymous Viewer does not show Explore. Sign in as
`admin` / `admin` (skip password change), then open Explore → Tempo. Or use
Drilldown / dashboards where Viewer allows.

Enable Next and exercise the demo routes (`.env.local` or shell):

```sh
OTEL_TRACES_ENABLED=true \
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
OTEL_SERVICE_NAME=pre-ets-frontend \
pnpm --filter @pathableai/pre-ets-frontend dev
```

```sh
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/health
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/health/error
```

In Grafana → Explore → Tempo (as admin), search service `pre-ets-frontend` for
routes `/api/health` and `/api/health/error`. Expect an HTTP parent span (e.g.
`GET /api/health`), Next’s `executing api route…` child, and Effect logical
child `health.check` / `health.error` nested under the route span. Demo routes
call `attachActiveOtelParent` so Effect continues the active OTEL context.
Allow up to ~30s for batch export.

Stop only the observability service:

```sh
docker compose --profile observability stop otel-lgtm
```

## Deployed OTLP (vendor-agnostic)

Same instrumentation. Point `OTEL_EXPORTER_OTLP_ENDPOINT` (and optional
`OTEL_EXPORTER_OTLP_HEADERS`) at any OTLP/HTTP-compatible collector. No SaaS is
mandated. Production misconfiguration (enabled + invalid endpoint) refuses to
start.

### Second-endpoint / headers switch (SC-004)

Example against a second local listener on port `14318`:

```sh
OTEL_TRACES_ENABLED=true \
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:14318 \
OTEL_EXPORTER_OTLP_HEADERS='Authorization=Bearer sc004-test-token' \
OTEL_SERVICE_NAME=pre-ets-frontend \
pnpm --filter @pathableai/pre-ets-frontend start
```

Confirm the span arrives at that endpoint **and** that the synthetic header is
present on the OTLP/HTTP request. Endpoint-only receipt without header proof
does not satisfy SC-004.

## Sampling

Local sampling is **100%** (`traceSampler: "always_on"`). Production sampling
policy is deferred. Alerting and SLOs are out of scope.

## Grafana MCP for agents

Requires the optional observability profile (MCP does nothing useful without it).

Pinned package: **`mcp-grafana==2.0.0`** via `uvx` (unversioned `uvx mcp-grafana`
is not acceptable).

### Connection

| Setting       | Value                                           |
| ------------- | ----------------------------------------------- |
| `GRAFANA_URL` | `http://127.0.0.1:3300`                         |
| Auth          | Anonymous org role **Viewer** (Compose default) |

Preferred when anonymous is disabled: a read-only Grafana service account token
(`GRAFANA_SERVICE_ACCOUNT_TOKEN`). Built-in `admin`/`admin` or anonymous Admin
are troubleshooting fallbacks only — not the documented MCP default.

### Example Cursor MCP config

```json
{
  "mcpServers": {
    "grafana": {
      "command": "uvx",
      "args": ["mcp-grafana==2.0.0"],
      "env": {
        "GRAFANA_URL": "http://127.0.0.1:3300"
      }
    }
  }
}
```

### Concrete agent read

With the stack running and at least one exported span, call one of:

1. `check_datasources_health` / datasource list tools, or
2. Tempo search for service `pre-ets-frontend` / route `/api/health`.

Exact tool names follow mcp-grafana **2.0.0**. Verified live with
`GRAFANA_URL=http://127.0.0.1:3300 uvx mcp-grafana==2.0.0` (stdio JSON-RPC):
`initialize` → `tools/list` → `tools/call` `check_datasources_health` returned
healthy Loki/Prometheus/Pyroscope/Tempo on first attempt.

### Human verification checklist (SC-006)

Use when CI cannot run MCP. Complete before merge:

1. `docker compose --profile observability up -d --wait` succeeds; Grafana opens
   at `http://127.0.0.1:3300`.
2. Next exports at least one span (`GET /api/health` with traces enabled).
3. Start MCP: `GRAFANA_URL=http://127.0.0.1:3300 uvx mcp-grafana==2.0.0`.
4. From an MCP client, complete one read (list datasources **or** Tempo search
   for `pre-ets-frontend`) on the **first attempt**.
5. Record commands + outcome as PR/acceptance evidence.

Docs-only command lists without a live success are not SC-006 evidence.

## Out of scope (stubs)

- Metrics and logs export
- Browser/RUM and cross-process `traceparent` propagation
- A second OTLP exporter alongside `@vercel/otel` (including Effect `OtlpTracer`)
- Production sampling policies, alerting, and SLOs
- Hosted vendor selection
- `packages/backend` process instrumentation
