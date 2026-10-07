# Quickstart: Validate Next.js OTLP Traces + Local Grafana

**Status**: Design for [spec.md](./spec.md). Run after implementation on branch
`007-otel-observability`.

Run commands from the repository root. Use Node from `.node-version` and pnpm
from `package.json`. Install with `pnpm install --frozen-lockfile`.

Contracts: [otlp-export.md](./contracts/otlp-export.md),
[request-span-attributes.md](./contracts/request-span-attributes.md),
[grafana-mcp.md](./contracts/grafana-mcp.md).

**Locked locals**: Next URL base `http://127.0.0.1:3000`; Grafana UI
`http://127.0.0.1:3300`; OTLP HTTP `http://127.0.0.1:4318`; image
`grafana/otel-lgtm:0.35.0`; Compose service `otel-lgtm`; service name default
`pre-ets-frontend`.

## 0. Default path stays clean

```sh
docker compose up -d --wait redis keycloak
docker compose ps
```

Expect: Redis and Keycloak only — **no** `otel-lgtm` / Grafana observability
container unless the observability profile was requested. Keycloak remains on
`127.0.0.1:8080` (do not bind the Next demo surface there).

Build then start the Next server with traces **disabled** by default:

```sh
pnpm --filter @pathableai/pre-ets-frontend build
pnpm --filter @pathableai/pre-ets-frontend start
```

For iterative local work, `pnpm --filter @pathableai/pre-ets-frontend dev` is
acceptable instead of build+start.

Expect: Next listens on `http://127.0.0.1:3000` with traces off by default.

## 1. Opt into local Grafana / OTLP

```sh
docker compose --profile observability up -d --wait
```

Verify:

- Image: `grafana/otel-lgtm:0.35.0`
- Service name: `otel-lgtm`
- Grafana UI: `http://127.0.0.1:3300` (anonymous **Viewer** by default for this
  feature; `admin`/`admin` or Admin only as troubleshooting fallback — see
  [grafana-mcp.md](./contracts/grafana-mcp.md))
- OTLP HTTP: `http://127.0.0.1:4318`

**Leave `otel-lgtm` running through sections 2–3** (export traffic and inspect
spans in Grafana). Do **not** stop the collector here. Cleanup stop commands
belong in section 4 (SC-005) and Rollback.

## 2. Enable Next traces and exercise the verification set

Reuse a prior frontend build when possible, then start with traces enabled
(collector from section 1 must still be running):

```sh
pnpm --filter @pathableai/pre-ets-frontend build
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
OTEL_SERVICE_NAME=pre-ets-frontend \
pnpm --filter @pathableai/pre-ets-frontend start
```

Traffic (SC-002 / SC-003) — any Next Node request:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
```

Redirect or auth challenge status codes are fine; the goal is an exported span.

## 3. Find the request spans in Grafana

With `otel-lgtm` still running from section 1:

1. Open `http://127.0.0.1:3300` → Explore → Tempo (sign in as admin if Explore
   is hidden for anonymous Viewer).
2. Search for service `pre-ets-frontend`.
3. Open a request span and confirm method / route / status when Next emits them
   (see [request-span-attributes.md](./contracts/request-span-attributes.md)).

Allow up to ~30 seconds for batch export visibility.

## 4. Best-effort when collector is down (SC-005)

With traces still enabled and a **valid** endpoint configured, **now** stop only
the observability service:

```sh
docker compose --profile observability stop otel-lgtm
```

Do **not** run bare `docker compose --profile observability stop` (that can stop
other project services).

Then repeat `GET /` (or any Next route).

Expect (both required for SC-005):

1. Next still serves the request; no hard crash solely due to export failure.
2. Export failure is **visible in diagnostics** (structured log / diagnostic
   channel documented in `docs/observability.md` — record what you observed).
   Availability alone without a diagnostic observation does **not** satisfy
   SC-005.

## 5. Deployed-style endpoint switch (config only) — SC-004

Point `OTEL_EXPORTER_OTLP_ENDPOINT` at a **second** OTLP/HTTP collector (or a
second local listener on a different port). One verified local approach:

```sh
# Terminal A — temporary OTLP/HTTP listener that prints headers + body size
node --input-type=module <<'EOF'
import http from "node:http"
const server = http.createServer((req, res) => {
  const chunks = []
  req.on("data", (c) => chunks.push(c))
  req.on("end", () => {
    console.log(JSON.stringify({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization ?? null,
      contentLength: Buffer.concat(chunks).length
    }))
    res.writeHead(200)
    res.end()
  })
})
server.listen(14318, "127.0.0.1", () => console.log("listening :14318"))
EOF
```

```sh
# Terminal B — Next with second endpoint + synthetic header
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:14318 \
OTEL_EXPORTER_OTLP_HEADERS='Authorization=Bearer sc004-test-token' \
OTEL_SERVICE_NAME=pre-ets-frontend \
pnpm --filter @pathableai/pre-ets-frontend start
```

Repeat `GET /`. Operator docs:
[docs/observability.md](../../docs/observability.md).

**Done requires live proof**:

1. Confirm the request span **arrives at the second endpoint** (listener logs a
   POST to `/v1/traces` with non-zero body).
2. Confirm the second listener received the synthetic
   `Authorization=Bearer sc004-test-token` header (or equivalent configured
   header). A docs note or endpoint-only receipt without header assertion does
   **not** satisfy SC-004.

Expect: spans arrive at the new endpoint with headers, without code changes
([otlp-export.md](./contracts/otlp-export.md)).

## 6. MCP against local Grafana (SC-006 — live evidence required)

Ensure the observability profile is running again if you stopped it in section 4:

```sh
docker compose --profile observability up -d --wait
```

Follow `docs/observability.md` (added in implementation) to run the **pinned**
MCP package:

```sh
uvx mcp-grafana==2.0.0
```

with:

- `GRAFANA_URL=http://127.0.0.1:3300`
- Auth: anonymous **Viewer** (Compose default for this feature) **or** a
  read-only service account token; `admin`/`admin` / anonymous Admin only as
  troubleshooting fallback

Expect: MCP client connects and completes one documented read (datasource list
or recent Tempo search for `pre-ets-frontend` / `/`) on the **first
attempt** per [grafana-mcp.md](./contracts/grafana-mcp.md).

**Acceptance evidence**: Record the successful live MCP read (commands + outcome).
If CI cannot run MCP, complete the human verification checklist from T022 /
`docs/observability.md` before merge — docs-only command lists without a live
success are not SC-006 evidence.

## Rollback

Registration is unconditional: omitting `OTEL_EXPORTER_OTLP_ENDPOINT` does **not**
disable export (`@vercel/otel` falls back to `http://localhost:4318/v1/traces`).
Set `OTEL_SDK_DISABLED=true`, restart Next, then stop only `otel-lgtm`:

```sh
# In the Next process environment:
# OTEL_SDK_DISABLED=true
# then restart the Next server

docker compose --profile observability stop otel-lgtm
```

Default Redis/Keycloak Compose usage is unchanged.
