# Contract: Local Grafana MCP Access

**Consumers**: AI coding agents / MCP clients used by developers.

**Dependency**: Optional Compose `observability` profile running locally.

## Server

- Open-source Grafana MCP server (`mcp-grafana`), typically via `uvx mcp-grafana`
  or the `grafana/mcp-grafana` container in stdio mode.

## Connection settings (local)

| Setting       | Value                                                                              |
| ------------- | ---------------------------------------------------------------------------------- |
| `GRAFANA_URL` | `http://127.0.0.1:3300` (host-mapped Grafana UI)                                   |
| Auth          | Service account token preferred; document verified local auth path for `otel-lgtm` |

## Preconditions

1. `docker compose --profile observability up -d --wait` (or equivalent) succeeded.
2. Grafana UI reachable at `http://127.0.0.1:3300`.
3. Backend has exported at least one request span (optional for connectivity test;
   required for “inspect a span” agent exercise).

## Minimum verified capability

Documentation MUST include one concrete agent/MCP action that reads local
observability data (for example: list datasources, or search recent Tempo traces
for `pre-ets-backend`). Exact tool names follow the MCP server version pinned in
docs at implementation time.

## Non-goals

- Shipping MCP as a required runtime dependency of the product
- Supporting Grafana Cloud MCP in this increment
