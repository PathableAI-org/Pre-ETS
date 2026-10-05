# Contract: Local Grafana MCP Access

**Consumers**: AI coding agents / MCP clients used by developers.

**Dependency**: Optional Compose `observability` profile running locally with
pinned image **`grafana/otel-lgtm:0.35.0`**.

## Server

- Open-source Grafana MCP server (`mcp-grafana`), typically via `uvx mcp-grafana`
  or the `grafana/mcp-grafana` container in stdio mode.

## Connection settings (local)

| Setting       | Value                                                   |
| ------------- | ------------------------------------------------------- |
| `GRAFANA_URL` | `http://127.0.0.1:3300` (host-mapped Grafana UI)        |
| Auth          | See **Verified local auth** below (required for SC-006) |

## Verified local auth (`grafana/otel-lgtm:0.35.0`)

Upstream image defaults (documented by grafana/docker-otel-lgtm):

1. **Primary**: Anonymous auth enabled with org role **Admin**
   (`GF_AUTH_ANONYMOUS_ENABLED` defaults to true in the image). For local MCP,
   a service account token is **not** required when anonymous Admin is active.
2. **Alternate**: Basic auth with built-in user `admin` / password `admin`.
3. **When anonymous is disabled**: Create a Grafana service account token and
   pass it to the MCP server (`GRAFANA_SERVICE_ACCOUNT_TOKEN` or the MCP
   server’s equivalent). Prefer tokens for any non-default hardening.

Project docs (`docs/observability.md`) MUST copy this verified path so SC-006
(“first attempt”) is executable—not “preferred if available.”

## Preconditions

1. `docker compose --profile observability up -d --wait` (or equivalent) succeeded
   with image `grafana/otel-lgtm:0.35.0`.
2. Grafana UI reachable at `http://127.0.0.1:3300`.
3. Backend has exported at least one request span (optional for connectivity test;
   required for “inspect a span” agent exercise).

## Minimum verified capability

Documentation MUST include one concrete agent/MCP action that reads local
observability data (for example: list datasources, or search recent Tempo traces
for `pre-ets-backend` / route `/health`). Exact tool names follow the MCP server
version pinned in docs at implementation time.

## Non-goals

- Shipping MCP as a required runtime dependency of the product
- Supporting Grafana Cloud MCP in this increment
