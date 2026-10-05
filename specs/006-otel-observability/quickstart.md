# Quickstart: Validate Backend OTLP Traces + Local Grafana

**Status**: Design for [spec.md](./spec.md). Run after implementation on branch
`007-otel-observability`.

Run commands from the repository root. Use Node from `.node-version` and pnpm
from `package.json`. Install with `pnpm install --frozen-lockfile`.

Contracts: [otlp-export.md](./contracts/otlp-export.md),
[request-span-attributes.md](./contracts/request-span-attributes.md),
[grafana-mcp.md](./contracts/grafana-mcp.md).

**Locked locals**: backend `http://127.0.0.1:8080`; Grafana UI
`http://127.0.0.1:3300`; OTLP HTTP `http://127.0.0.1:4318`; image
`grafana/otel-lgtm:0.35.0`.

## 0. Default path stays clean

```sh
docker compose up -d --wait redis keycloak
docker compose ps
```

Expect: Redis and Keycloak only — **no** `otel-lgtm` / Grafana observability
container unless the observability profile was requested.

```sh
pnpm --filter @pathableai/pre-ets-backend start
# or the documented dev start once added
```

Expect: backend starts with traces **disabled** by default on `127.0.0.1:8080`.

## 1. Opt into local Grafana / OTLP

```sh
docker compose --profile observability up -d --wait
```

Verify:

- Image: `grafana/otel-lgtm:0.35.0`
- Grafana UI: `http://127.0.0.1:3300` (anonymous Admin by default, or `admin`/`admin`)
- OTLP HTTP: `http://127.0.0.1:4318`

Stop observability without tearing down Redis/Keycloak:

```sh
docker compose --profile observability stop
# or remove only the observability service per docs
```

## 2. Enable backend traces and exercise the verification set

```sh
OTEL_TRACES_ENABLED=true \
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
OTEL_SERVICE_NAME=pre-ets-backend \
pnpm --filter @pathableai/pre-ets-backend start
```

Success path (SC-002 / SC-003):

```sh
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/health
```

Expect: `200`.

Intentional error path (SC-003):

```sh
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/health/error
```

Expect: `500`.

## 3. Find the request spans in Grafana

1. Open `http://127.0.0.1:3300` → Explore → Tempo (or Trace Drilldown).
2. Search for service `pre-ets-backend` and routes `/health` and `/health/error`.
3. Open each request span and confirm attributes:
   - `http.request.method` = `GET`
   - `http.route` = `/health` or `/health/error`
   - `http.response.status_code` = `200` or `500`

Allow up to ~30 seconds for batch export visibility (~5s Effect batch interval).

## 4. Best-effort when collector is down

With traces still enabled and a **valid** endpoint configured, stop the
observability profile, then repeat `GET /health`.

Expect: backend still serves the request; no hard crash solely due to export
failure.

## 5. Deployed-style endpoint switch (config only)

Point `OTEL_EXPORTER_OTLP_ENDPOINT` at a second OTLP/HTTP collector (or a second
local listener). Restart backend. Repeat `GET /health`.

Expect: spans arrive at the new endpoint without code changes
([otlp-export.md](./contracts/otlp-export.md)).

## 6. MCP against local Grafana

Follow `docs/observability.md` (added in implementation) to run `mcp-grafana`
with:

- `GRAFANA_URL=http://127.0.0.1:3300`
- Auth: anonymous Admin (image default) **or** `admin`/`admin`; service account
  token only if anonymous was disabled

Expect: MCP client connects and completes one documented read (datasource list
or recent Tempo search for `pre-ets-backend` / `/health`) per
[grafana-mcp.md](./contracts/grafana-mcp.md).

## Rollback

Unset `OTEL_TRACES_ENABLED` / omit endpoint; stop the observability profile.
Default Redis/Keycloak Compose usage is unchanged.
