# Data Model: OpenTelemetry Observability Stack

**Status**: Phase 1 design for [spec.md](./spec.md). No SQL schema. Telemetry is
ephemeral export data, not an application domain store.

## Request Span

Logical entity emitted once per handled backend HTTP request when traces are
enabled.

| Field                       | Rule                                                                            |
| --------------------------- | ------------------------------------------------------------------------------- |
| Name                        | Stable operation name (e.g. HTTP method + route template, or framework default) |
| Kind                        | Server / internal per Effect/OTel defaults for request handling                 |
| `http.request.method`       | Required; non-empty HTTP method string                                          |
| `http.route`                | Required; route/path template used for routing                                  |
| `http.response.status_code` | Required once response status is known; integer                                 |
| Timing                      | Start at request accept; end when response completes (success or failure)       |
| Parent                      | Root for this increment (no frontend parent propagation yet)                    |

### Validation / safety

- MUST NOT include secrets, credentials, cookies, raw session tokens, PHI/PII, or
  tenant secret material in name, attributes, or events.
- Prefer route templates over raw URLs with unbounded high-cardinality path
  segments when both are available.
- Missing optional enrichment attributes do not invalidate the span if the three
  required attributes above are present.

## Observability Configuration

Process-level settings resolved at backend boot.

| Field           | Type       | Rule                                                                            |
| --------------- | ---------- | ------------------------------------------------------------------------------- |
| `tracesEnabled` | boolean    | Default `false`; only `true`/`1` (case-insensitive) enable                      |
| `otlpEndpoint`  | URL string | Required when enabled; base OTLP HTTP endpoint (no path or with collector base) |
| `serviceName`   | string     | Default `pre-ets-backend`                                                       |
| `otlpHeaders`   | map        | Optional; for deployed auth only                                                |

### State

| State                              | Behavior                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Disabled                           | No OTLP tracer layer; requests succeed; no export                                                                      |
| Enabled + valid endpoint           | Tracer layer installed; best-effort export                                                                             |
| Enabled + invalid/missing endpoint | Clear config diagnostic; documented fail-soft for local (run without export) unless planning later tightens production |

## OTLP Export Target

| Field       | Rule                                                                      |
| ----------- | ------------------------------------------------------------------------- |
| Base URL    | e.g. `http://127.0.0.1:4318` local; any OTLP HTTP-compatible URL deployed |
| Traces path | `/v1/traces` relative to base                                             |
| Protocol    | OTLP/HTTP (protobuf or JSON per Effect OtlpSerialization default)         |

## Local Observability Stack

Compose-managed optional profile `observability`:

| Component   | Role                                                            |
| ----------- | --------------------------------------------------------------- |
| `otel-lgtm` | Receives OTLP; stores traces (Tempo); Grafana UI for inspection |

Not an application entity; operator-facing infrastructure only.

## Relationships

```text
Observability Configuration ──enables──▶ Request Span emission
Request Span ──exported via──▶ OTLP Export Target
OTLP Export Target (local) ──received by──▶ Local Observability Stack
```
