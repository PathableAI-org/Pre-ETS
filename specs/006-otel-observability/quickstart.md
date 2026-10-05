# Quickstart: Validate Backend OTLP Traces + Local Grafana

**Status**: Design for [spec.md](./spec.md). Run after implementation on branch
`007-otel-observability`.

Run commands from the repository root. Use Node from `.node-version` and pnpm
from `package.json`. Install with `pnpm install --frozen-lockfile`.

Contracts: [otlp-export.md](./contracts/otlp-export.md),
[request-span-attributes.md](./contracts/request-span-attributes.md),
[grafana-mcp.md](./contracts/grafana-mcp.md).

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

Expect: backend starts with traces **disabled** by default.

## 1. Opt into local Grafana / OTLP

```sh
docker compose --profile observability up -d --wait
```

Verify:

- Grafana UI: `http://127.0.0.1:3300`
- OTLP HTTP: `http://127.0.0.1:4318`

Stop observability without tearing down Redis/Keycloak:

```sh
docker compose --profile observability stop
# or remove only the observability service per docs
```

## 2. Enable backend traces and exercise a request

```sh
OTEL_TRACES_ENABLED=true \
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
OTEL_SERVICE_NAME=pre-ets-backend \
pnpm --filter @pathableai/pre-ets-backend start
```

Send traffic to the documented exercise route (path finalized in implementation;
example shape):

```sh
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:<backend-port>/<exercise-route>
```

Expect: non-empty successful (or intentionally exercised) status code.

## 3. Find the request span in Grafana

1. Open `http://127.0.0.1:3300` → Explore → Tempo (or Trace Drilldown).
2. Search for service `pre-ets-backend` and the exercise route.
3. Open the request span and confirm attributes:
   - `http.request.method`
   - `http.route`
   - `http.response.status_code`

Allow up to ~30 seconds for batch export visibility.

## 4. Best-effort when collector is down

With traces still enabled, stop the observability profile, then repeat the
exercise request.

Expect: backend still serves the request; no hard crash solely due to export
failure.

## 5. Deployed-style endpoint switch (config only)

Point `OTEL_EXPORTER_OTLP_ENDPOINT` at a second OTLP/HTTP collector (or a second
local listener). Restart backend. Repeat exercise.

Expect: spans arrive at the new endpoint without code changes
([otlp-export.md](./contracts/otlp-export.md)).

## 6. MCP against local Grafana

Follow `docs/observability.md` (added in implementation) to run `mcp-grafana`
with `GRAFANA_URL=http://127.0.0.1:3300` and verified auth.

Expect: MCP client connects and completes one documented read (datasource list
or recent trace search) per [grafana-mcp.md](./contracts/grafana-mcp.md).

## Rollback

Unset `OTEL_TRACES_ENABLED` / omit endpoint; stop the observability profile.
Default Redis/Keycloak Compose usage is unchanged.
