# Implementation Plan: OpenTelemetry Observability Stack

**Branch**: `007-otel-observability` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-otel-observability/spec.md`.

## Summary

Stand up vendor-neutral **OpenTelemetry trace export** for the Effect backend: a
request-scoped span with method, route/path template, and status/outcome
attributes, exported over **OTLP/HTTP**. Keep local observability **optional**
via a Compose `observability` profile running `grafana/otel-lgtm` (Grafana + OTLP
intake). Document deployed OTLP endpoint configuration and how to connect the
**Grafana MCP server** to the local stack. Metrics, logs, and Next.js
instrumentation stay out of this increment.

Research: [research.md](./research.md). Shapes: [data-model.md](./data-model.md).
Contracts: [contracts/](./contracts/). Validation: [quickstart.md](./quickstart.md).

## Technical Context

**Language/Version**: Strict TypeScript (repo base), ESM, Node ≥24; pnpm from root
`packageManager`. Backend workspace `@pathableai/pre-ets-backend`.

**Primary Dependencies**: Effect **4.0.1** and `@effect/platform-node` **4.0.1**
(as declared in `packages/backend/package.json`). Use Effect’s built-in OTLP
tracer (`effect/unstable/observability` — `OtlpTracer`) authorized by this plan;
do not add `@effect/opentelemetry` / OpenTelemetry Node SDK unless research proves
`OtlpTracer` is unavailable at the installed pin after `pnpm install`. Compose:
pinned `grafana/otel-lgtm` image for local OTLP + Grafana.

**Storage**: Ephemeral local trace/metric/log stores inside `otel-lgtm` (dev only).
No product Postgres/Redis changes. No durable app-owned telemetry store.

**Testing**: Vitest (or existing backend test runner once added) for config parsing,
attribute allow-list, and “disabled → no export / no startup failure”. Manual /
scripted quickstart against Compose for end-to-end span visibility. No Playwright
E2E required (no UI product surface). Gherkin optional later via BDD hooks.

**Target Platform**: Host-run Effect backend (local + deployed). Optional Compose
services on loopback only. Grafana UI published on a **non-3000** host port to
avoid colliding with the Next.js app.

**Project Type**: Backend instrumentation + local ops Compose/docs. Frontend
workspace unchanged this increment.

**Performance Goals**: Best-effort batched OTLP export; no invented latency SLO.
Local verification expects spans visible in Grafana within ~30s of traffic
(batch interval + UI refresh).

**Constraints**: Traces only; backend only; opt-in local stack; best-effort export
when enabled; no secrets/PHI/session tokens on spans; vendor-agnostic OTLP for
deploy; do not put Next.js/Effect app processes inside Compose.

**Scale/Scope**: Minimal HTTP request surface on the backend sufficient to
demonstrate a request span (backend today is a stub). Full domain API is out of
scope beyond what is needed to exercise FR-001. MCP is documentation + verified
connection steps, not a committed MCP binary in-repo.

## Constitution Check

_GATE: Evaluated before Phase 0 and re-evaluated after Phase 1._

| Principle                            | Pre-research                                                                | Post-design                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| I. Evidence-grounded specification   | Pass: spec clarifies traces-only backend MVP + platform stories             | Pass: research records OtlpTracer, otel-lgtm, attribute set, MCP server                           |
| II. Ownership and authoritative data | Pass: backend-owned instrumentation; no domain persistence change           | Pass: all Effect OTel wiring in `packages/backend`; Compose/docs at repo root                     |
| III. Tenant isolation                | Pass: no tenant resolution change; forbid cross-tenant/PII attributes       | Pass: attribute contract denylists secrets/ids; no tenant payload on spans                        |
| IV. Accessible SSR UI                | N/A: no product UI                                                          | N/A                                                                                               |
| V. Meaningful behavioral tests       | Pass: verify request span + attributes + optional stack; not framework-only | Pass: quickstart + unit tests for config/disable; manual Grafana/MCP checks                       |
| VI. Simplicity and quality           | Pass: one Compose profile + Effect OTLP layer; avoid dual SDKs              | Pass: prefer native Effect OtlpTracer; single LGTM image; authorize `unstable/observability` only |

**Authorization note (Effect guidance)**: This plan authorizes
`effect/unstable/observability` (`OtlpTracer` / related OTLP helpers) for backend
trace export. Do not expand into unrelated `effect/unstable/*` modules.

**Post-design result**: Gates pass. No constitution exception required (Compose
remains external services; apps stay on host; no ownership boundary crossed).

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
└── tasks.md                 # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
compose.yaml                          # add observability profile + otel-lgtm
docs/docker-compose.md                # optional Grafana / OTLP local guide
docs/observability.md                 # NEW: local + deployed OTLP + MCP
packages/backend/
├── package.json                      # Effect 4.0.1 pin; no Next imports
├── src/
│   ├── index.ts                      # process host: boot HTTP + optional tracer layer
│   ├── http/                         # minimal request surface for span exercise
│   ├── observability/                # config + OtlpTracer layer wiring
│   └── ...
└── tests/                            # config / attribute / disable-path tests
```

**Structure Decision**: Backend owns instrumentation and a minimal HTTP exercise
surface under `packages/backend`. Root Compose + docs own the optional local
Grafana/OTLP stack and MCP instructions. Frontend unchanged.

## Complexity Tracking

> No constitution violations requiring justification.

| Note                     | Detail                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimal HTTP surface     | Backend is currently a stub; a small Effect HTTP route is required to satisfy “span around a request” without waiting on the full domain API. |
| `unstable/observability` | Explicitly authorized above; verify against installed Effect **4.0.1** declarations during implementation.                                    |
| Grafana host port        | Publish Grafana on loopback **3300** (map container 3000) so Next.js keeps **3000**.                                                          |
