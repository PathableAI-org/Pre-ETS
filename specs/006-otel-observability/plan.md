# Implementation Plan: OpenTelemetry Observability Stack

**Identity**: Feature directory `specs/006-otel-observability`; git branch
`007-otel-observability` (Spec Kit directory numbering is independent of the
branch number — do not rename either).

**Branch**: `007-otel-observability` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-otel-observability/spec.md`.

## Summary

Stand up vendor-neutral **OpenTelemetry trace export** for the **Next.js Node
server** (`@pathableai/pre-ets-frontend`): a request-scoped Effect span with
method, route/path template, and status/outcome attributes, exported over
**OTLP/HTTP** via Effect v4 **`effect/observability`** (`OtlpTracer`) on the
frontend `ManagedRuntime`, gated by **`OTEL_TRACES_ENABLED`**. Next
`instrumentation.ts` boots that runtime. Keep local observability **optional**
via a Compose `observability` profile running **`grafana/otel-lgtm:0.35.0`**.
Document deployed OTLP endpoint configuration (including headers) and how to
connect a **version-pinned** Grafana MCP server to the local stack. Metrics,
logs, and backend-package instrumentation stay out of this increment.

Research: [research.md](./research.md). Shapes: [data-model.md](./data-model.md).
Contracts: [contracts/](./contracts/). Validation: [quickstart.md](./quickstart.md).

## Technical Context

**Language/Version**: Strict TypeScript (repo base), ESM, Node ≥24; pnpm from root
`packageManager`. Frontend workspace `@pathableai/pre-ets-frontend` (Next.js
**16.3.8**).

**Primary Dependencies**: Effect **4.0.1** `effect/observability` (`OtlpTracer`,
`OtlpSerialization.layerProtobuf`) and `effect/http` (`FetchHttpClient`). Single
OTLP exporter — no `@vercel/otel`. Compose: pinned **`grafana/otel-lgtm:0.35.0`**
for local OTLP + Grafana.

**Storage**: Ephemeral local trace/metric/log stores inside `otel-lgtm` (dev only).
No product Postgres/Redis changes. No durable app-owned telemetry store.

**Testing**: Existing frontend **Vitest** (`test:unit`) under
`packages/frontend/tests/` for config parsing, attribute allow-list (including a
negative Authorization fixture), disable path, and **process-host / register
boundary** production refuse-to-start vs local fail-soft. Manual / scripted
quickstart against Compose for end-to-end span visibility. No Playwright E2E
required for this MVP (demo is HTTP Route Handlers).

**Target Platform**: Host-run Next.js Node server (local + deployed). Optional
Compose services on loopback only. Grafana UI published on host **3300** (map
container 3000) so Next keeps **3000**. Demo listen: Next default
**`http://127.0.0.1:3000`**.

**Project Type**: Next server instrumentation + local ops Compose/docs. Backend
workspace unchanged this increment.

**Performance Goals**: Best-effort batched OTLP export; no invented latency SLO.
Local verification expects spans visible in Grafana within ~30s of traffic.
Local sampling: **100%**.

**Constraints**: Traces only; Next Node server only; opt-in local stack;
best-effort export after valid start; locked startup policy for
enabled+invalid config (local/dev fail-soft; production refuse-to-start); no
secrets/PHI/session tokens on spans; vendor-agnostic OTLP for deploy; do not put
Next.js or Effect app processes inside Compose; single OTEL registration path
(no dual Effect OTLP exporter).

**Scale/Scope**: Minimal App Router demo surface:
`GET /api/health` (200) and `GET /api/health/error` (500). Full product UI
journeys are out of scope beyond FR-014. MCP is documentation + verified
connection steps with pinned `mcp-grafana==2.0.0`, not a committed MCP binary
in-repo.

## Constitution Check

_GATE: Evaluated before Phase 0 and re-evaluated after Phase 1._

| Principle                            | Pre-research                                                                | Post-design                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| I. Evidence-grounded specification   | Pass: spec clarifies traces-only Next server MVP + platform stories         | Pass: research records Effect `OtlpTracer`, otel-lgtm pin, attribute set, MCP auth+version, startup policy |
| II. Ownership and authoritative data | Pass: frontend-owned instrumentation; no domain persistence change          | Pass: all Next OTel wiring in `packages/frontend`; Compose/docs at repo root                               |
| III. Tenant isolation                | Pass: no tenant resolution change; forbid cross-tenant/PII attributes       | Pass: attribute contract denylists secrets/ids; demo routes bypass session                                 |
| IV. Accessible SSR UI                | N/A: demo Route Handlers only; no product UI change                         | N/A                                                                                                        |
| V. Meaningful behavioral tests       | Pass: verify request span + attributes + optional stack; not framework-only | Pass: quickstart + Vitest unit/host-boundary tests; manual Grafana/MCP checks                              |
| VI. Simplicity and quality           | Pass: one Compose profile + one OTEL registration path                      | Pass: single Effect `OtlpTracer` exporter; single pinned LGTM image                                        |

**Authorization note**: This plan authorizes Effect **`effect/observability`**
(`OtlpTracer`, `@stability unstable`) on the frontend `ManagedRuntime`, booted
from `packages/frontend/src/instrumentation.ts` when traces are enabled. Do not
install `@vercel/otel` or a second OTLP exporter.

**Post-design result**: Gates pass. No constitution exception required (Compose
remains external services; apps stay on host; no ownership boundary crossed into
`packages/backend`).

## Project Structure

### Documentation (this feature)

```text
specs/006-otel-observability/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── otlp-export.md
│   ├── request-span-attributes.md
│   └── grafana-mcp.md
└── tasks.md
```

### Source Code (repository root)

```text
compose.yaml                          # observability profile + grafana/otel-lgtm:0.35.0
docs/docker-compose.md                # optional Grafana / OTLP local guide
docs/observability.md                 # NEW: local + deployed OTLP + MCP
packages/frontend/
├── package.json                      # effect 4.0.1 (includes effect/observability)
├── src/
│   ├── instrumentation.ts            # boot ManagedRuntime (OtlpTracer when enabled)
│   ├── lib/runtime.ts                # ManagedRuntime + observability Layer
│   ├── lib/observability/            # config, OtlpTracer Layer, attribute helpers, health Effects
│   └── app/api/health/               # thin adapters → Runtime.runPromise
└── tests/                            # config / attribute / disable / host-boundary tests
```

**Structure Decision**: Frontend owns Effect OTLP export and the demo HTTP
surface. Root Compose + docs own the optional local Grafana/OTLP stack and MCP
instructions. Backend unchanged.

**Process-host requirements**: When traces are enabled, runtime boot MUST apply
the locked startup policy before providing `OtlpTracer`. Config helpers MUST
remain import-safe for unit tests; Layer installation stays in the ManagedRuntime
host path.

## Startup policy (this increment — locked)

| Environment                        | `OTEL_TRACES_ENABLED` true + invalid/missing endpoint | After valid start, collector down |
| ---------------------------------- | ----------------------------------------------------- | --------------------------------- |
| Local / non-production             | Clear diagnostic; **run without export** (fail-soft)  | Best-effort; requests continue    |
| Production (`NODE_ENV=production`) | Clear diagnostic; **refuse-to-start**                 | Best-effort; requests continue    |
| Traces disabled / flag unset       | No OTLP Layer; healthy start                          | N/A                               |

## Enablement scheme

Keep explicit **`OTEL_TRACES_ENABLED`** (default off) so the process does not
install `OtlpTracer` unless opted in. When enabled, honor
`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`,
`OTEL_SERVICE_NAME`, and `OTEL_SDK_DISABLED` per
[contracts/otlp-export.md](./contracts/otlp-export.md). Do **not** use
`OtlpTracer.layerFromConfig` alone (it ignores `OTEL_TRACES_ENABLED`).

## Complexity Tracking

> No constitution violations requiring justification.

| Note                 | Detail                                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimal HTTP surface | `GET /api/health` + `GET /api/health/error` on Next `:3000` satisfy “span around a request” without session/OIDC (proxy matcher excludes `/api/*`). |
| Effect OtlpTracer    | Explicitly authorized `effect/observability` (`@stability unstable`) on ManagedRuntime; protobuf serialization for LGTM `:4318`.                    |
| Single exporter      | No `@vercel/otel` / second OTLP client. Demo routes emit Effect spans via `Effect.withSpan`.                                                        |
| Grafana image pin    | Compose MUST use `grafana/otel-lgtm:0.35.0` (prefer digest pin at implement time if available). Do not ship `:latest`.                              |
| Grafana host port    | Publish Grafana on loopback **3300** (map container 3000) so Next keeps **3000**.                                                                   |
| MCP pin              | Docs and tasks MUST use `uvx mcp-grafana==2.0.0` (or equivalent pinned container). Unversioned `uvx mcp-grafana` is not acceptable.                 |

## Risks

| Risk                                                                                  | Mitigation                                                                                                                                           |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next OTEL attribute names may use `http.method` / `http.status_code` vs newer semconv | Acceptance contract accepts Next default root span attributes that identify method, route, and status; map names in the attribute contract / tests.  |
| MCP auth brittle vs image defaults                                                    | Compose overrides anonymous org role to **Viewer**; Admin/`admin` only as troubleshooting fallback.                                                  |
| Custom enable flag vs OTEL docs                                                       | Precedence table in OTLP contract; justify `OTEL_TRACES_ENABLED` as default-off Layer gate.                                                          |
| Production refuse-to-start hard to prove with Next early listen                       | Host-boundary tests assert policy decision / exit behavior at Layer resolve path (not “port never binds”); quickstart documents expected diagnostic. |

## Phase notes (before `/speckit-tasks`)

1. Contracts and quickstart lock ports, routes, auth, headers proof, and verification set.
2. Implementation tasks MUST wire Effect `OtlpTracer`, host-boundary tests, and docs under `docs/observability.md` / `docs/docker-compose.md`.
3. Do not change `packages/backend` or rewrite AGENTS.md Effect pin language in this feature.
