# Research: OpenTelemetry Observability Stack

**Feature**: `specs/006-otel-observability` | **Date**: 2026-10-05

All Technical Context unknowns from planning are resolved below.

## 1. Effect OTLP tracer path

**Decision**: Export traces with Effect’s built-in **`OtlpTracer.layer`** from
`effect/unstable/observability` (Effect 4), pointing at
`{OTLP_BASE}/v1/traces` (OTLP/HTTP). Create request spans via
`Effect.withSpan` / `Effect.fn` at the HTTP handler boundary and set semantic
attributes on the span. Do **not** add `@effect/opentelemetry` or the OpenTelemetry
Node SDK in this increment unless `pnpm install` + installed declarations prove
`OtlpTracer` is missing at Effect **4.0.1**.

**Rationale**: Matches vendor-agnostic OTLP, stays inside the Effect dependency
already owned by the backend, and avoids a second tracing stack. Effect guidance
allows `unstable/*` only when a plan authorizes it—this feature’s plan does.

**Alternatives considered**:

- `@effect/opentelemetry` + OTEL Node SDK — heavier; better if native OtlpTracer
  were absent or needed Node context propagation bridges we do not need yet.
- Vendor SDKs (Datadog, etc.) — rejects vendor-agnostic goal.
- Logs/metrics via `Otlp.layer` — out of scope for this traces-only increment.

**Install note**: Workspace `package.json` declares `effect@4.0.1`. Local
`node_modules` may be stale; implementation MUST `pnpm install` and verify
`OtlpTracer` against installed `.d.ts` before coding.

## 2. Local Grafana / OTLP stack

**Decision**: Add an optional Compose service using a **pinned**
`grafana/otel-lgtm` image under Compose profile **`observability`**. Publish on
loopback only:

| Host binding     | Container | Purpose                              |
| ---------------- | --------- | ------------------------------------ |
| `127.0.0.1:3300` | `3000`    | Grafana UI (avoid Next.js `:3000`)   |
| `127.0.0.1:4317` | `4317`    | OTLP gRPC (available; apps use HTTP) |
| `127.0.0.1:4318` | `4318`    | OTLP HTTP (backend default)          |

Default `docker compose up` (redis/keycloak only) MUST NOT start this service.
Opt-in: `docker compose --profile observability up -d --wait`.

**Rationale**: Single image gives OTLP collector + Tempo + Grafana with minimal
Compose surface; matches “Grafana in docker compose” without multi-service
wiring for an MVP.

**Alternatives considered**:

- Multi-container Tempo/Loki/Prometheus/Grafana — more moving parts than needed.
- Jaeger-only — less aligned with Grafana + MCP story.
- Always-on LGTM — violates optional local requirement.

## 3. Backend enablement & configuration

**Decision**: Environment-driven config in the backend process host:

| Setting                       | Role                                                                      |
| ----------------------------- | ------------------------------------------------------------------------- |
| `OTEL_TRACES_ENABLED`         | Explicit opt-in (`true` / `1`); default **off**                           |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Base URL (e.g. `http://127.0.0.1:4318`); traces POST to `/v1/traces`      |
| `OTEL_SERVICE_NAME`           | Resource `service.name` (default `pre-ets-backend`)                       |
| Optional headers              | `OTEL_EXPORTER_OTLP_HEADERS` for deployed auth (documented; local unused) |

When disabled or endpoint unset: do not install the OTLP tracer layer; process
must still serve requests. When enabled: best-effort export (collector down ≠
request failure).

**Rationale**: Aligns with common OTEL env names for vendor portability while
keeping an explicit local opt-in flag so accidental export is unlikely.

**Alternatives considered**: Always-on tracer with no-op exporter — harder to
reason about and still pays setup cost. Fail-fast on missing endpoint in all
environments — rejected for local; production may document stricter checks later.

## 4. Request span & semantic attributes

**Decision**: One parent **request span** per handled HTTP request. Minimum
attributes (clarify Option B / planning default):

| Attribute                   | Meaning                                                                     |
| --------------------------- | --------------------------------------------------------------------------- |
| `http.request.method`       | HTTP method                                                                 |
| `http.route`                | Route / path template (not raw unbounded user paths when a template exists) |
| `http.response.status_code` | Numeric status outcome                                                      |

Deny: Authorization headers, cookies, tokens, session ids, raw request bodies,
PHI/PII, tenant secrets.

**Rationale**: Enough to find and understand a request in Grafana Tempo without
full HTTP semantic-convention sprawl or sensitive data.

**Alternatives considered**: Method+status only — too thin. Full HTTP semconv —
unnecessary for MVP. Custom attribute names — hurts vendor tools and MCP queries.

## 5. Minimal HTTP surface

**Decision**: Because `packages/backend` is currently a stub, introduce a minimal
Effect HTTP server (platform-node) with at least one stable route (e.g. health or
demo GET) used for quickstart verification. Domain REST API remains future work.

**Rationale**: Spec requires a span “around a request”; no existing routes exist.

## 6. Deployed environments

**Decision**: Same instrumentation; operators set `OTEL_TRACES_ENABLED` and
`OTEL_EXPORTER_OTLP_ENDPOINT` (plus headers if required) to any OTLP-compatible
collector/backend. No mandated SaaS. Document the pattern in
`docs/observability.md`.

**Rationale**: Satisfies vendor-agnostic FR without provisioning a hosted vendor
in this slice.

## 7. Grafana MCP for agents

**Decision**: Document connecting the open-source **Grafana MCP server**
(`mcp-grafana` via `uvx` or Docker) with `GRAFANA_URL=http://127.0.0.1:3300` and
local auth appropriate to `otel-lgtm` (service account token preferred; basic
auth only if the image’s default admin path is what local docs verify). Document
prerequisites: observability profile running; MCP useless without it.

**Rationale**: Matches the “MCP to local Grafana” requirement with the official
Grafana MCP project.

**Alternatives considered**: Tempo-only MCP — narrower and less documented for
general Grafana exploration. Committing MCP binary into the repo — unnecessary
complexity.

## 8. Docs ownership

**Decision**:

- Extend `docs/docker-compose.md` with the optional observability profile,
  ports, and start/stop commands.
- Add `docs/observability.md` for backend env vars, attribute expectations,
  deployed OTLP notes, and MCP setup.
- Keep README pointer brief; detail lives in those docs.

## Deferred (explicit)

- Next.js / frontend instrumentation and cross-process propagation
- Metrics and logs export
- Production sampling policies and alerting
- Choosing a specific hosted observability vendor
