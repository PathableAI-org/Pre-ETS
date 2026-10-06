# Contract: Local Grafana MCP Access

**Consumers**: AI coding agents / MCP clients used by developers.

**Dependency**: Optional Compose `observability` profile running locally with
pinned image **`grafana/otel-lgtm:0.35.0`** (Compose service name **`otel-lgtm`**).

## Server

- Open-source Grafana MCP server **`mcp-grafana==2.0.0`**, invoked via
  `uvx mcp-grafana==2.0.0` (or the `grafana/mcp-grafana` container at an
  equivalent pinned tag in stdio mode). Unversioned `uvx mcp-grafana` is **not**
  permitted in project docs or tasks.

## Connection settings (local)

| Setting       | Value                                                   |
| ------------- | ------------------------------------------------------- |
| `GRAFANA_URL` | `http://127.0.0.1:3300` (host-mapped Grafana UI)        |
| Auth          | See **Verified local auth** below (required for SC-006) |

## Verified local auth (`grafana/otel-lgtm:0.35.0`)

SC-006 only requires **reads**. Prefer least privilege for MCP:

1. **Primary (MCP default)**: Anonymous auth enabled with org role **Viewer**
   via Compose override (`GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer`). The upstream image
   may default anonymous to Admin — this feature **MUST** override to Viewer for
   the documented MCP path. A service account token is not required while
   anonymous Viewer is active.
2. **Preferred when anonymous is disabled**: Create a **read-only** Grafana
   service account token and pass it to the MCP server
   (`GRAFANA_SERVICE_ACCOUNT_TOKEN` or equivalent).
3. **Troubleshooting only (not MCP default)**: Basic auth `admin` / `admin`, or
   anonymous **Admin** if deliberately re-enabled — document as fallback for UI
   debugging, not the agent/MCP primary path.

Project docs (`docs/observability.md`) MUST copy this verified least-privilege
path and the pinned `mcp-grafana==2.0.0` invocation so SC-006 (“first attempt”)
is executable—not “preferred if available.”

**SC-006 evidence**: Acceptance requires a successful **live** MCP read against
local Grafana on the first attempt. If CI cannot run MCP, a documented human
verification checklist MUST be completed before merge. Docs-only command lists
without a live success are not acceptance evidence.

## Preconditions

1. `docker compose --profile observability up -d --wait` (or equivalent) succeeded
   with image `grafana/otel-lgtm:0.35.0` and anonymous org role Viewer (or
   equivalent read-only token path).
2. Grafana UI reachable at `http://127.0.0.1:3300`.
3. Next server has exported at least one request span (optional for connectivity
   test; required for “inspect a span” agent exercise).

## Minimum verified capability

Documentation MUST include one concrete agent/MCP action that reads local
observability data (for example: list datasources, or search recent Tempo traces
for `pre-ets-frontend` / route `/api/health`). Exact tool names follow
**mcp-grafana 2.0.0** as pinned in docs.

## Non-goals

- Shipping MCP as a required runtime dependency of the product
- Supporting Grafana Cloud MCP in this increment
- Unversioned MCP package resolution
- Granting MCP clients Admin/mutation capabilities as the documented default
