# Data Model: OpenTelemetry Observability Stack

**Status**: Phase 1 design for [spec.md](./spec.md). No SQL schema. Telemetry is
ephemeral export data, not an application domain store.

## Request Span

Logical entity emitted once per handled Next.js HTTP request when traces are
enabled.

| Field            | Rule                                                                           |
| ---------------- | ------------------------------------------------------------------------------ |
| Name             | Next root span name (e.g. `GET /api/health` / framework default)               |
| Kind             | Server / internal per Next/OTel defaults for request handling                  |
| HTTP method      | Required; via `http.request.method` and/or `http.method`                       |
| Route template   | Required; via `http.route` and/or `next.route`                                 |
| Status / outcome | Required once known; via `http.response.status_code` and/or `http.status_code` |
| Timing           | Start at request accept; end when response completes (success or failure)      |
| Parent           | Root for this increment (no browser parent propagation yet)                    |
| Sampling (local) | 100% sampled; no intentional drop filters in this increment                    |

### Validation / safety

- MUST NOT include secrets, credentials, cookies, raw session tokens, PHI/PII, or
  tenant secret material in name, attributes, or events.
- Prefer route templates over raw URLs with unbounded high-cardinality path
  segments when both are available.
- Missing optional enrichment attributes do not invalidate the span if method,
  route template, and status/outcome are present.
- Allow-list helper unit tests MUST include a negative fixture (e.g. reject
  Authorization attribute).

## Observability Configuration

Process-level settings resolved at Next boot (`instrumentation.register`).

| Field           | Type       | Rule                                                                            |
| --------------- | ---------- | ------------------------------------------------------------------------------- |
| `tracesEnabled` | boolean    | Default `false`; only `true`/`1` (case-insensitive) enable                      |
| `otlpEndpoint`  | URL string | Required when enabled; base OTLP HTTP endpoint (no path or with collector base) |
| `serviceName`   | string     | Default `pre-ets-frontend`                                                      |
| `otlpHeaders`   | map        | Optional; for deployed auth; verified in SC-004                                 |
| `sdkDisabled`   | boolean    | From `OTEL_SDK_DISABLED`; when true, do not export even if traces enabled       |

### State

| State                              | Behavior                                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Disabled                           | No OTEL register; requests succeed; no export                                                                                    |
| Enabled + valid endpoint           | `@vercel/otel` registered; best-effort export                                                                                    |
| Enabled + invalid/missing endpoint | Clear config diagnostic. **Local/dev**: run without export (fail-soft). **Production** (`NODE_ENV=production`): refuse-to-start. |
| Enabled + `OTEL_SDK_DISABLED=true` | Do not export; process starts (same as disabled export path)                                                                     |
| Collector unreachable after start  | Best-effort; request handling continues                                                                                          |

## OTLP Export Target

| Field       | Rule                                                                       |
| ----------- | -------------------------------------------------------------------------- |
| Base URL    | e.g. `http://127.0.0.1:4318` local; any OTLP HTTP-compatible URL deployed  |
| Traces path | `/v1/traces` relative to base                                              |
| Protocol    | OTLP/HTTP                                                                  |
| Headers     | Optional map from `OTEL_EXPORTER_OTLP_HEADERS`; MUST be forwarded when set |

## Local Observability Stack

Compose-managed optional profile `observability`:

| Component                  | Role                                                            |
| -------------------------- | --------------------------------------------------------------- |
| `grafana/otel-lgtm:0.35.0` | Receives OTLP; stores traces (Tempo); Grafana UI for inspection |

Service name in Compose: **`otel-lgtm`** (stop this service alone). Not an
application entity; operator-facing infrastructure only.

## Demo HTTP Surface

| Route                   | Status | Role in verification                 |
| ----------------------- | ------ | ------------------------------------ |
| `GET /api/health`       | 200    | Success request for SC-002 / SC-003  |
| `GET /api/health/error` | 500    | Intentional error request for SC-003 |

Local URL base: `http://127.0.0.1:3000`.

## Relationships

```text
Observability Configuration ──enables──▶ Request Span emission
Request Span ──exported via──▶ OTLP Export Target
OTLP Export Target (local) ──received by──▶ Local Observability Stack
Demo HTTP Surface ──exercises──▶ Request Span
```
