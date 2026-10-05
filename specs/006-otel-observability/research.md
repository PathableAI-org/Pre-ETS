# Research: OpenTelemetry Observability Stack

**Feature**: `specs/006-otel-observability` | **Date**: 2026-10-05

All Technical Context unknowns from planning are resolved below.

## 1. Effect OTLP tracer path

**Decision**: Export traces with Effect’s built-in **`OtlpTracer`** from
**`effect/observability`** (Effect **4.0.1** — verified: there is no
`effect/unstable/observability` export at this pin). Prefer
`OtlpTracer.layer({ url })` with URL derived from
`OTEL_EXPORTER_OTLP_ENDPOINT` (append `/v1/traces` when using the base endpoint
convention), or `OtlpTracer.layerFromConfig` when consuming standard OTEL env
wholesale. Create request spans via `Effect.withSpan` / `Effect.fn` at the HTTP
handler boundary and set semantic attributes on the span.

APIs are marked `@stability unstable` in declarations; the feature plan
explicitly authorizes using them under `effect/observability`.

**Layer environment**: `OtlpTracer.layer` / `layerFromConfig` require
`HttpClient.HttpClient` and `OtlpSerialization` in the Layer environment. The
backend **process host** MUST provide those (e.g. platform-node HTTP client +
OTLP serialization layer) alongside the tracer.

**Enable flag vs `layerFromConfig`**: Keep **`OTEL_TRACES_ENABLED`** as an
explicit default-off gate so the host does not install the tracer Layer unless
opted in (safer for optional local workflows than “endpoint present ⇒ export”).
When the flag is true, honor standard OTEL env including `OTEL_SDK_DISABLED`
and endpoint vars (see [contracts/otlp-export.md](./contracts/otlp-export.md)
precedence). Do **not** treat endpoint presence alone as enablement.

**Fallback trigger**: If after `pnpm install` native `OtlpTracer` is missing,
broken, or inadequate for OTLP/HTTP request-span export, fall back within this
feature to **`@effect/opentelemetry` + OTLP HTTP exporter**. Prefer the native
path first; document if the contingency is taken.

**Rationale**: Matches vendor-agnostic OTLP, stays inside the Effect dependency
already owned by the backend, and avoids a second tracing stack unless the
fallback fires. Effect guidance requires verifying against installed
declarations—this research path matches Effect **4.0.1**.

**Alternatives considered**:

- `@effect/opentelemetry` + OTEL Node SDK — heavier; retained only as contingency.
- Vendor SDKs (Datadog, etc.) — rejects vendor-agnostic goal.
- Logs/metrics via `Otlp.layer` — out of scope for this traces-only increment.
- Rely solely on `OTEL_SDK_DISABLED` + endpoint without `OTEL_TRACES_ENABLED` —
  weaker local default-off story when developers copy OTEL env snippets.

**Install note**: Workspace `package.json` declares `effect@4.0.1`. Local
`node_modules` may be stale; implementation MUST `pnpm install` and verify
`OtlpTracer` against installed `.d.ts` before coding. Repo AGENTS may still
mention rc.113; **package.json is authoritative** for this feature (AGENTS sync
is a follow-up).

## 2. Local Grafana / OTLP stack

**Decision**: Add an optional Compose service using pinned
**`grafana/otel-lgtm:0.35.0`** under Compose profile **`observability`**. Prefer
also recording an image digest at implement time when available. Publish on
loopback only:

| Host binding     | Container | Purpose                              |
| ---------------- | --------- | ------------------------------------ |
| `127.0.0.1:3300` | `3000`    | Grafana UI (avoid Next.js `:3000`)   |
| `127.0.0.1:4317` | `4317`    | OTLP gRPC (available; apps use HTTP) |
| `127.0.0.1:4318` | `4318`    | OTLP HTTP (backend default)          |

Default `docker compose up` (redis/keycloak only) MUST NOT start this service.
Opt-in: `docker compose --profile observability up -d --wait`.

**Rationale**: Single image gives OTLP collector + Tempo + Grafana with minimal
Compose surface; pin avoids `:latest` auth/port drift across developer machines.

**Alternatives considered**:

- Multi-container Tempo/Loki/Prometheus/Grafana — more moving parts than needed.
- Jaeger-only — less aligned with Grafana + MCP story.
- Always-on LGTM — violates optional local requirement.
- `:latest` tag — non-reproducible; rejected.

## 3. Backend enablement & configuration

**Decision**: Environment-driven config in the backend process host:

| Setting                       | Role                                                                      |
| ----------------------------- | ------------------------------------------------------------------------- |
| `OTEL_TRACES_ENABLED`         | Explicit opt-in (`true` / `1`); default **off**; controls Layer install   |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Base URL (e.g. `http://127.0.0.1:4318`); traces POST to `/v1/traces`      |
| `OTEL_SERVICE_NAME`           | Resource `service.name` (default `pre-ets-backend`)                       |
| `OTEL_SDK_DISABLED`           | When true, do not export even if traces enabled (standard OTEL)           |
| Optional headers              | `OTEL_EXPORTER_OTLP_HEADERS` for deployed auth (documented; local unused) |

**Startup policy (locked)**:

- Disabled or flag unset: do not install tracer layer; process serves requests.
- Enabled + valid endpoint: install tracer; best-effort export.
- Enabled + invalid/missing endpoint:
  - **local/dev**: clear diagnostic; run **without** export (fail-soft).
  - **production** (`NODE_ENV=production`): clear diagnostic; **refuse-to-start**.
- Collector unreachable after valid start: best-effort; requests continue.

**Rationale**: Aligns with common OTEL env names for vendor portability while
keeping an explicit local opt-in flag. Dual startup policy removes Principle I
ambiguity for this increment.

**Alternatives considered**: Always-on tracer with no-op exporter — harder to
reason about. Fail-soft in all environments including production — rejected per
operator expectation that production misconfig should be loud at boot. Fail-fast
everywhere — too harsh for local optional workflows.

## 4. Request span & semantic attributes

**Decision**: One parent **request span** per handled HTTP request. Minimum
attributes (clarify Option B / planning default):

| Attribute                   | Meaning                                                                     |
| --------------------------- | --------------------------------------------------------------------------- |
| `http.request.method`       | HTTP method                                                                 |
| `http.route`                | Route / path template (not raw unbounded user paths when a template exists) |
| `http.response.status_code` | Numeric status outcome                                                      |

Deny: Authorization headers, cookies, tokens, session ids, raw request bodies,
PHI/PII, tenant secrets. Unit tests MUST include a **negative fixture** that
rejects an Authorization (or equivalent) attribute candidate.

**Sampling**: Local default **100%** sampled (no intentional drop filters).
Production sampling policy deferred.

**Rationale**: Enough to find and understand a request in Grafana Tempo without
full HTTP semantic-convention sprawl or sensitive data.

**Alternatives considered**: Method+status only — too thin. Full HTTP semconv —
unnecessary for MVP. Custom attribute names — hurts vendor tools and MCP queries.

## 5. Minimal HTTP surface

**Decision**: Introduce a minimal Effect HTTP server (platform-node) listening on
**`127.0.0.1:8080`** (overridable via documented config) with:

| Route               | Status | Purpose                          |
| ------------------- | ------ | -------------------------------- |
| `GET /health`       | 200    | Success path for SC-002 / SC-003 |
| `GET /health/error` | 500    | Intentional error for SC-003     |

Domain REST API remains future work.

**Rationale**: Spec requires a span “around a request”; no existing routes exist.
Naming the demo surface removes circular acceptance language.

## 6. Deployed environments

**Decision**: Same instrumentation; operators set `OTEL_TRACES_ENABLED` and
`OTEL_EXPORTER_OTLP_ENDPOINT` (plus headers if required) to any OTLP-compatible
collector/backend. No mandated SaaS. Document the pattern in
`docs/observability.md`. Production uses refuse-to-start on enabled+invalid
config. **Alerting / SLOs are out of scope.**

**Rationale**: Satisfies vendor-agnostic FR without provisioning a hosted vendor
in this slice.

## 7. Grafana MCP for agents

**Decision**: Document connecting the open-source **Grafana MCP server**
(`mcp-grafana` via `uvx` or Docker) with `GRAFANA_URL=http://127.0.0.1:3300`.

**Verified local auth for `grafana/otel-lgtm:0.35.0`** (from upstream image
defaults):

1. **Primary (image default)**: Grafana anonymous auth enabled with org role
   **Admin** (`GF_AUTH_ANONYMOUS_ENABLED` defaults true in the image). MCP may
   connect without a service-account token for local-only use.
2. **Alternate**: Built-in user `admin` / password `admin` (Grafana default
   documented by upstream LGTM).
3. **Preferred when anonymous is disabled**: Grafana service account token
   (`GRAFANA_SERVICE_ACCOUNT_TOKEN` / MCP equivalent).

Document prerequisites: observability profile running; MCP useless without it.
SC-006 depends on documenting this verified path (not “preferred if available”).

**Rationale**: Matches the “MCP to local Grafana” requirement with a
reproducible auth story for the pinned image.

**Alternatives considered**: Tempo-only MCP — narrower. Committing MCP binary
into the repo — unnecessary complexity. Undocumented “figure out auth” — fails
SC-006.

## 8. Docs ownership

**Decision**:

- Extend `docs/docker-compose.md` with the optional observability profile,
  pinned image, ports, and start/stop commands.
- Add `docs/observability.md` for backend env vars (incl. precedence),
  attribute expectations, deployed OTLP notes, startup policy, and MCP setup
  with verified auth.
- Keep README pointer brief; detail lives in those docs.

## Deferred (explicit)

- Next.js / frontend instrumentation and cross-process propagation
- Metrics and logs export
- Production sampling policies and **alerting / SLOs**
- Choosing a specific hosted observability vendor
- Syncing AGENTS.md / effect-guidance Effect pin text from rc.113 → 4.0.1
  (follow-up; package.json remains source of truth for this feature)
