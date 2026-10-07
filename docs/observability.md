# Observability (OpenTelemetry traces)

Traces-only instrumentation for the **Next.js Node server**
(`@pathableai/pre-ets-frontend`). Metrics, logs, browser/RUM, and
`packages/backend` instrumentation are out of scope for this increment.

**HTTP + export**: During ManagedRuntime boot (loaded from Next
`instrumentation.ts`), the app **always** calls `registerOTel` and installs the
Effect global Tracer bridge. `@vercel/otel` is the sole OTLP exporter and
auto-instruments request spans on any Next Node route. Endpoint, headers,
protocol, and `OTEL_SDK_DISABLED` are left to the process environment /
`@vercel/otel`.

**Effect bridge**: `@effect/opentelemetry` `OtelTracer.layerGlobal` is always
installed on the frontend `ManagedRuntime` so Effect spans share the global
provider — no second exporter. Use `Effect.withSpan` only at logical boundaries
when needed.

## Verification

Default local URL base: **`http://127.0.0.1:3000`**.

Any Next Node request produces an auto-instrumented HTTP span when the SDK is
not disabled. For a quick check, hit the app root (redirect/401 is fine) or any
other route and search Tempo for service `pre-ets-frontend`.

## Environment variables

Standard OTEL env vars (not part of `ServerConfig`). App code does not validate them.

| Variable                      | Role                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `OTEL_SDK_DISABLED`           | **Off switch** — set `true` so `@vercel/otel` does not start exporters/instrumentation   |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP base URL when the SDK is enabled (e.g. `http://127.0.0.1:4318`)                     |
| `OTEL_SERVICE_NAME`           | Resource `service.name` (app passes `pre-ets-frontend`; SDK may honor this env when set) |
| `OTEL_EXPORTER_OTLP_HEADERS`  | Optional SDK-read headers for authenticated collectors                                   |

Quiet local without a collector: set `OTEL_SDK_DISABLED=true`.

If the SDK is enabled and no endpoint is set, `@vercel/otel` defaults export to
`http://localhost:4318/v1/traces`. See `packages/frontend/.env.example` and
`specs/006-otel-observability/contracts/otlp-export.md`.

### Precedence (boot)

1. ManagedRuntime boot always calls `registerOTel` + installs `OtelTracer.layerGlobal`.
2. If `OTEL_SDK_DISABLED` is set (non-empty), `@vercel/otel` returns immediately — no export.
3. Otherwise the SDK applies endpoint / headers / protocol from the environment.

### Startup policy after a successful boot

If the collector is unreachable after start (SDK enabled), export is best-effort:
request handling continues. Expect export failure diagnostics from the
OpenTelemetry / `@vercel/otel` exporter on stderr — never as a hard crash, and
never with header values printed by app code.

## Required span attributes

Each **auto-instrumented HTTP request span** should identify method, route
template, and status/outcome when Next emits them (accepted key names):

- Method: `http.request.method` or `http.method`
- Route: `http.route` or `next.route`
- Status: `http.response.status_code` or `http.status_code`

Do **not** configure `@vercel/otel` `attributesFromHeaders` to map Authorization,
Cookie, or other secrets. Do **not** put secrets on `Effect.withSpan` attributes.
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

Quiet local (no collector):

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
mandated. Trust the environment and SDK for endpoint correctness. Use
`OTEL_SDK_DISABLED` only when export must stay off.

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
2. Tempo search for service `pre-ets-frontend`.

Exact tool names follow mcp-grafana **2.0.0**.

### Human verification checklist (SC-006)

Use when CI cannot run MCP. Complete before merge:

1. `docker compose --profile observability up -d otel-lgtm --wait` succeeds; Grafana opens
   at `http://127.0.0.1:3300`.
2. Next exports at least one span (any route with SDK enabled / not `OTEL_SDK_DISABLED`).
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
