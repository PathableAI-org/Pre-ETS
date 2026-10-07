# Observability (OpenTelemetry traces)

Traces-only instrumentation for the **Next.js Node server**
(`@pathableai/pre-ets-frontend`). Metrics, logs, browser/RUM, and
`packages/backend` instrumentation are out of scope for this increment.

**HTTP + export**: During ManagedRuntime boot (loaded from Next
`instrumentation.ts`), `registerOTel` runs when `OTEL_EXPORTER_OTLP_ENDPOINT` is
present and non-blank. `@vercel/otel` is the sole OTLP exporter and auto-instruments
request spans on any Next Node route. Endpoint shape, headers, protocol, and
`OTEL_SDK_DISABLED` are left to the process environment and the OpenTelemetry SDK.

**Effect bridge**: When the endpoint is present, `@effect/opentelemetry`
`OtelTracer.layerGlobal` is installed on the frontend `ManagedRuntime` so Effect
spans share that global provider — no second exporter. Use `Effect.withSpan` only
at logical boundaries when needed.

## Verification

Default local URL base: **`http://127.0.0.1:3000`**.

Any Next Node request produces an auto-instrumented HTTP span. For a quick check,
hit the app root (redirect/401 is fine) or any other route and search Tempo for
service `pre-ets-frontend`.

## Environment variables

OTEL fields are part of frontend `ServerConfig` (`packages/frontend/src/lib/config/index.ts`).

| Variable                      | Role                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Set (non-blank) to enable `registerOTel` + Effect bridge (e.g. `http://127.0.0.1:4318`) |
| `OTEL_SERVICE_NAME`           | Resource `service.name` (default `pre-ets-frontend`)                                    |
| `OTEL_EXPORTER_OTLP_HEADERS`  | Optional SDK-read headers for authenticated collectors                                  |
| `OTEL_SDK_DISABLED`           | Standard OTEL kill switch (honored by the SDK)                                          |

Unset/blank endpoint keeps traces off (no `registerOTel`). See
`packages/frontend/.env.example` and
`specs/006-otel-observability/contracts/otlp-export.md`.

### Precedence (boot)

1. Endpoint missing/blank → no `registerOTel`; healthy start.
2. Endpoint present → `registerOTel` + Effect global Tracer bridge during ManagedRuntime boot.
   The SDK applies `OTEL_SDK_DISABLED`, headers, and exporter settings from the environment.
   App code does not validate or normalize the endpoint URL.

### Startup policy after a successful boot

If the collector is unreachable after start, export is best-effort: request handling
continues. Expect export failure diagnostics from the OpenTelemetry / `@vercel/otel`
exporter on stderr — never as a hard crash, and never with header values printed by
app code.

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

Enable Next (`.env.local` or shell):

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
OTEL_SERVICE_NAME=pre-ets-frontend \
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
mandated. Trust the environment and SDK for endpoint correctness.

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
2. Next exports at least one span (any route with endpoint set).
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
