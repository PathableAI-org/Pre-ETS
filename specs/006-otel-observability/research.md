# Research: OpenTelemetry Observability Stack

**Feature**: `specs/006-otel-observability` | **Date**: 2026-10-05

All Technical Context unknowns from planning are resolved below.

## 1. Next.js OTEL registration path

**Decision**: Export traces with **`@vercel/otel`** registered from
ManagedRuntime boot (imported via
[`packages/frontend/src/instrumentation.ts`](../../packages/frontend/src/instrumentation.ts))
unconditionally (single OTLP exporter; auto-instrumented HTTP request spans with
standard semantic attributes). Bridge Effect via **`@effect/opentelemetry`**
`OtelTracer.layerGlobal` on the frontend `ManagedRuntime` so `Effect.withSpan`
can create logical children under the active OTEL context when used. Do **not**
install Effect `OtlpTracer` or a second OTLP exporter. Do **not** configure
header-to-attribute mapping for secrets.

**Enablement**: Always `registerOTel`. Quiet local / off = `OTEL_SDK_DISABLED=true`
(`@vercel/otel` early-return). Unset endpoint does **not** mean off — the SDK
defaults to `http://localhost:4318/v1/traces`. Honor headers and service name when
enabled (see [contracts/otlp-export.md](./contracts/otlp-export.md) precedence).

**Install verification (Effect 4.0.1, 2026-10-06)**: Confirmed
`@effect/opentelemetry` exports `OtelTracer.layerGlobal` (global provider bridge)
and `Resource.layer`. Effect package AGENTS.md: use `effect/observability` Otlp
modules for Effect-only export, or `@effect/opentelemetry` when integrating with
an **existing** OpenTelemetry setup — this path uses the latter because
`@vercel/otel` owns the SDK.

**Rationale**: Automatic Next request spans avoid hand-rolled HTTP semantics on
every handler; Effect spans stay at logical boundaries; single exporter;
vendor-agnostic OTLP. Aligns with the scope that the instrumented process is the
Next server, not `packages/backend`.

**Alternatives considered**:

- Effect-only `OtlpTracer` — rejected for this increment: forces fake request
  spans via `Effect.withSpan` instead of framework auto-instrumentation.
- `@effect/opentelemetry` NodeSdk that starts its own exporter — rejected; would
  duplicate `@vercel/otel` export.
- Vendor SDKs (Datadog, etc.) — rejects vendor-agnostic goal.
- Custom `OTEL_TRACES_ENABLED` / app endpoint presence gate — rejected; always `registerOTel`, use `OTEL_SDK_DISABLED` for off.
- Custom attribute SpanProcessor — rejected; do not map sensitive headers.
- Dedicated `/api/health` demo routes — rejected; any Next route verifies spans.
- Instrumenting `@pathableai/pre-ets-backend` — rejected; wrong process; port
  `8080` conflicts with Keycloak.
- Request-root spans in `proxy.ts` — rejected; matcher is only `/` and
  `/auth/callback`; passthrough ends before route handlers.

## 2. Local Grafana / OTLP stack

**Decision**: Add an optional Compose service named **`otel-lgtm`** using pinned
**`grafana/otel-lgtm:0.35.0`** under Compose profile **`observability`**. Prefer
also recording an image digest at implement time when available. Publish on
loopback only:

| Host binding     | Container | Purpose                              |
| ---------------- | --------- | ------------------------------------ |
| `127.0.0.1:3300` | `3000`    | Grafana UI (avoid Next.js `:3000`)   |
| `127.0.0.1:4317` | `4317`    | OTLP gRPC (available; apps use HTTP) |
| `127.0.0.1:4318` | `4318`    | OTLP HTTP (Next default)             |

Default `docker compose up` (redis/keycloak only) MUST NOT start this service.
Opt-in: `docker compose --profile observability up -d --wait`.

Stop **only** the observability service without tearing down Redis/Keycloak:

```sh
docker compose --profile observability stop otel-lgtm
```

**Rationale**: Single image gives OTLP collector + Tempo + Grafana with minimal
Compose surface; pin avoids `:latest` auth/port drift across developer machines.
Named stop target satisfies the requirement that optional services are removable
independently.

**Alternatives considered**:

- Multi-container Tempo/Loki/Prometheus/Grafana — more moving parts than needed.
- Jaeger-only — less aligned with Grafana + MCP story.
- Always-on LGTM — violates optional local requirement.
- `:latest` tag — non-reproducible; rejected.
- `docker compose --profile observability stop` with no service name — stops all
  enabled project services; rejected.

## 3. Next enablement & configuration

**Decision**: Environment-driven config resolved at Next process boot
(`instrumentation.register` / observability config module):

| Setting                       | Role                                                                  |
| ----------------------------- | --------------------------------------------------------------------- |
| `OTEL_SDK_DISABLED`           | Kill switch; when set, `@vercel/otel` early-returns (quiet local off) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Base URL (e.g. `http://127.0.0.1:4318`); traces POST to `/v1/traces`  |
| `OTEL_SERVICE_NAME`           | Resource `service.name` (default `pre-ets-frontend`)                  |
| `OTEL_EXPORTER_OTLP_HEADERS`  | Optional; required for authenticated collectors (verified in SC-004)  |

**Startup policy (locked)**:

- Always call `registerOTel` + Effect global Tracer bridge at ManagedRuntime boot.
- Off / quiet local: `OTEL_SDK_DISABLED=true` (not “omit endpoint”).
- SDK enabled + unset endpoint: SDK default `http://localhost:4318/v1/traces`.
- No app URL validate / fail-soft / refuse-to-start on endpoint shape.
- Collector unreachable after start: best-effort; requests continue.

**Rationale**: Aligns with common OTEL env names for vendor portability while
keeping an explicit local opt-in flag. Dual startup policy removes Principle I
ambiguity for this increment.

**Alternatives considered**: Always-on tracer with no-op exporter — harder to
reason about. Fail-soft in all environments including production — rejected per
operator expectation that production misconfig should be loud at boot. Fail-fast
everywhere — too harsh for local optional workflows.

## 4. Request span & semantic attributes

**Decision**: One parent **request span** per handled HTTP request (Next root
server span). Minimum attributes for acceptance:

| Attribute             | Meaning                                                               |
| --------------------- | --------------------------------------------------------------------- |
| HTTP method           | Via Next/OTel convention (`http.request.method` and/or `http.method`) |
| Route / path template | Via `http.route` and/or `next.route`                                  |
| Status / outcome      | Via `http.response.status_code` and/or `http.status_code`             |

Contract tests accept either the newer or older HTTP semantic-convention names
as emitted by Next **16.3.8**, as long as method, route template, and status are
present and identifiable.

Deny: Authorization headers, cookies, tokens, session ids, raw request bodies,
PHI/PII, tenant secrets. Unit tests MUST include a **negative fixture** that
rejects an Authorization (or equivalent) attribute candidate.

**Sampling**: Local default **100%** sampled (no intentional drop filters).
Production sampling policy deferred.

**Rationale**: Enough to find and understand a request in Grafana Tempo without
full HTTP semantic-convention sprawl or sensitive data.

## 5. Minimal HTTP surface

**Decision**: Add Next App Router Route Handlers:

| Route                                | Status | Purpose                          |
| ------------------------------------ | ------ | -------------------------------- |
| Any Next Node request (e.g. `GET /`) | _any_  | Success path for SC-002 / SC-003 |

Default local URL base: **`http://127.0.0.1:3000`**. These paths are outside the
frontend proxy matcher (`/` and `/auth/callback` only), so they bypass
session/OIDC.

**Rationale**: Spec requires a span “around a request”; homepage `/` depends on
tenant/session and is a poor smoke target. Dedicated health routes keep
verification deterministic and avoid Keycloak’s `8080`.

## 6. Deployed environments

**Decision**: Same instrumentation; operators set
`OTEL_EXPORTER_OTLP_ENDPOINT` (plus `OTEL_EXPORTER_OTLP_HEADERS` if required) to
any OTLP-compatible collector, and use `OTEL_SDK_DISABLED=true` when export must
stay off. No mandated SaaS. Document the pattern in `docs/observability.md`. No
app refuse-to-start on invalid endpoint shape. **SC-004** requires live proof
that configured headers are sent. **Alerting / SLOs are out of scope.**

**Rationale**: Satisfies vendor-agnostic FR without provisioning a hosted vendor
in this slice; closes the gap where header-dropping exporters could pass
endpoint-only checks.

## 7. Grafana MCP for agents

**Decision**: Document connecting the open-source **Grafana MCP server** pinned
to **`mcp-grafana==2.0.0`** via `uvx` (or an equivalent pinned container image)
with `GRAFANA_URL=http://127.0.0.1:3300`.

**Verified local auth for `grafana/otel-lgtm:0.35.0`** (least privilege for MCP):

1. **Primary (MCP default)**: Anonymous auth with org role **Viewer** via Compose
   override (`GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer`). Upstream image may default to
   Admin — this feature overrides to Viewer for read-only MCP.
2. **Preferred when anonymous is disabled**: Read-only Grafana service account
   token (`GRAFANA_SERVICE_ACCOUNT_TOKEN` / MCP equivalent).
3. **Troubleshooting only**: Built-in `admin` / `admin`, or anonymous Admin if
   deliberately re-enabled — not the documented MCP primary path.

Document prerequisites: observability profile running; MCP useless without it.
SC-006 depends on documenting this verified least-privilege path **and** the
pinned version (not “preferred if available” / unversioned `uvx`).

**Rationale**: Matches the “MCP to local Grafana” requirement with a
reproducible auth and package story for the pinned image, without granting MCP
clients Admin/mutation capabilities by default.

**Alternatives considered**: Unversioned `uvx mcp-grafana` — rejected (tool
drift). Tempo-only MCP — narrower. Committing MCP binary into the repo —
unnecessary complexity.

## 8. Docs ownership

**Decision**:

- Extend `docs/docker-compose.md` with the optional observability profile,
  pinned image, ports, start/stop commands (service-targeted stop), and
  Keycloak/Next port notes.
- Add `docs/observability.md` for Next env vars (incl. precedence and headers),
  attribute expectations, deployed OTLP notes, startup policy, and MCP setup
  with verified auth + pinned version.
- Keep README pointer brief; detail lives in those docs.

## 9. Deferred (explicit)

- `@pathableai/pre-ets-backend` instrumentation
- A second OTLP exporter alongside `@vercel/otel` (including Effect `OtlpTracer`)
- Metrics and logs export
- Browser/RUM telemetry and cross-process propagation
- Production sampling policies and **alerting / SLOs**
- Choosing a specific hosted observability vendor
- Syncing AGENTS.md / effect-guidance Effect pin text (out of band)
