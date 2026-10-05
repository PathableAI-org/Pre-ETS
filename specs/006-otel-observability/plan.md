# Implementation Plan: OpenTelemetry Observability Stack

**Branch**: `007-otel-observability` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-otel-observability/spec.md`.

## Summary

Stand up vendor-neutral **OpenTelemetry trace export** for the Effect backend: a
request-scoped span with method, route/path template, and status/outcome
attributes, exported over **OTLP/HTTP**. Keep local observability **optional**
via a Compose `observability` profile running **`grafana/otel-lgtm:0.35.0`**
(Grafana + OTLP intake). Document deployed OTLP endpoint configuration and how
to connect the **Grafana MCP server** to the local stack. Metrics, logs, and
Next.js instrumentation stay out of this increment.

Research: [research.md](./research.md). Shapes: [data-model.md](./data-model.md).
Contracts: [contracts/](./contracts/). Validation: [quickstart.md](./quickstart.md).

## Technical Context

**Language/Version**: Strict TypeScript (repo base), ESM, Node ≥24; pnpm from root
`packageManager`. Backend workspace `@pathableai/pre-ets-backend`.

**Primary Dependencies**: Effect **4.0.1** and `@effect/platform-node` **4.0.1**
(as declared in `packages/backend/package.json`). Use Effect’s built-in OTLP
tracer from **`effect/observability`** (`OtlpTracer.layer` /
`OtlpTracer.layerFromConfig`; APIs marked `@stability unstable`) authorized by
this plan. Do not add `@effect/opentelemetry` / OpenTelemetry Node SDK unless
the fallback trigger in Complexity Tracking fires after `pnpm install` +
declaration verification. Compose: pinned
**`grafana/otel-lgtm:0.35.0`** for local OTLP + Grafana.

**Storage**: Ephemeral local trace/metric/log stores inside `otel-lgtm` (dev only).
No product Postgres/Redis changes. No durable app-owned telemetry store.

**Testing**: **Authorize adding `vitest`** (plain Vitest, aligned with frontend
`vitest` patterns; **not** `@effect/vitest` unless a later need appears) to
`@pathableai/pre-ets-backend` with a `test:unit` script and tests under
`packages/backend/tests/` for config parsing, attribute allow-list (including a
negative Authorization fixture), and “disabled → no export / no startup
failure”. Manual / scripted quickstart against Compose for end-to-end span
visibility. No Playwright E2E required (no UI product surface). Gherkin optional
later via BDD hooks.

**Target Platform**: Host-run Effect backend (local + deployed). Optional Compose
services on loopback only. Grafana UI published on host **3300** (map container
3000) to avoid colliding with the Next.js app. Backend demo listen:
**`127.0.0.1:8080`**.

**Project Type**: Backend instrumentation + local ops Compose/docs. Frontend
workspace unchanged this increment.

**Performance Goals**: Best-effort batched OTLP export (~5s Effect default
batch interval); no invented latency SLO. Local verification expects spans
visible in Grafana within ~30s of traffic. Local sampling: **100%**.

**Constraints**: Traces only; backend only; opt-in local stack; best-effort
export after valid start; locked startup policy for enabled+invalid config
(local/dev fail-soft; production refuse-to-start); no secrets/PHI/session tokens
on spans; vendor-agnostic OTLP for deploy; do not put Next.js/Effect app
processes inside Compose.

**Scale/Scope**: Minimal HTTP request surface on the backend sufficient to
demonstrate a request span: `GET /health` (200) and `GET /health/error` (500).
Full domain API is out of scope beyond FR-014. MCP is documentation + verified
connection steps, not a committed MCP binary in-repo.

## Constitution Check

_GATE: Evaluated before Phase 0 and re-evaluated after Phase 1._

| Principle                            | Pre-research                                                                | Post-design                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| I. Evidence-grounded specification   | Pass: spec clarifies traces-only backend MVP + platform stories             | Pass: research records OtlpTracer, otel-lgtm pin, attribute set, MCP auth, startup policy         |
| II. Ownership and authoritative data | Pass: backend-owned instrumentation; no domain persistence change           | Pass: all Effect OTel wiring in `packages/backend`; Compose/docs at repo root                     |
| III. Tenant isolation                | Pass: no tenant resolution change; forbid cross-tenant/PII attributes       | Pass: attribute contract denylists secrets/ids; no tenant payload on spans                        |
| IV. Accessible SSR UI                | N/A: no product UI                                                          | N/A                                                                                               |
| V. Meaningful behavioral tests       | Pass: verify request span + attributes + optional stack; not framework-only | Pass: quickstart + Vitest unit tests for config/disable/allow-list; manual Grafana/MCP checks     |
| VI. Simplicity and quality           | Pass: one Compose profile + Effect OTLP layer; avoid dual SDKs              | Pass: prefer native Effect OtlpTracer; single pinned LGTM image; authorize `effect/observability` |

**Authorization note (Effect guidance)**: This plan authorizes
**`effect/observability`** (`OtlpTracer` / related OTLP helpers). Those APIs are
marked `@stability unstable` in Effect **4.0.1**; that is expected and does
**not** mean the import path is `effect/unstable/observability` (that export
does not exist at the installed pin). Do not expand into unrelated
`effect/unstable/*` modules.

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
compose.yaml                          # observability profile + grafana/otel-lgtm:0.35.0
docs/docker-compose.md                # optional Grafana / OTLP local guide
docs/observability.md                 # NEW: local + deployed OTLP + MCP
packages/backend/
├── package.json                      # Effect 4.0.1; add vitest + test:unit
├── vitest.config.ts                  # NEW: node env, tests/**/*.test.ts
├── src/
│   ├── index.ts                      # process host: boot HTTP + optional tracer layer
│   ├── http/                         # GET /health, GET /health/error
│   ├── observability/                # config + OtlpTracer layer wiring
│   └── ...
└── tests/                            # config / attribute / disable-path unit tests
```

**Structure Decision**: Backend owns instrumentation and a minimal HTTP exercise
surface under `packages/backend`. Root Compose + docs own the optional local
Grafana/OTLP stack and MCP instructions. Frontend unchanged.

**Process-host Layer requirements**: When traces are enabled, the backend
process host MUST provide `HttpClient.HttpClient` and `OtlpSerialization`
alongside `OtlpTracer.layer` / `layerFromConfig` (those are required by the
Layer environment in Effect **4.0.1**). Prefer platform-node HTTP client layers
already used by the host.

## Startup policy (this increment — locked)

| Environment                        | `OTEL_TRACES_ENABLED` true + invalid/missing endpoint | After valid start, collector down |
| ---------------------------------- | ----------------------------------------------------- | --------------------------------- |
| Local / non-production             | Clear diagnostic; **run without export** (fail-soft)  | Best-effort; requests continue    |
| Production (`NODE_ENV=production`) | Clear diagnostic; **refuse-to-start**                 | Best-effort; requests continue    |
| Traces disabled / flag unset       | No tracer layer; healthy start                        | N/A                               |

## Enablement scheme

Keep explicit **`OTEL_TRACES_ENABLED`** (default off) so the process does not
install the OTLP tracer layer unless opted in—safer for local default workflows
than relying solely on endpoint presence. When enabled, prefer wiring via
`OtlpTracer.layer` with an explicit URL derived from
`OTEL_EXPORTER_OTLP_ENDPOINT`, or `layerFromConfig` where it simplifies standard
OTEL env consumption. See precedence in
[contracts/otlp-export.md](./contracts/otlp-export.md).

## Complexity Tracking

> No constitution violations requiring justification.

| Note                   | Detail                                                                                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimal HTTP surface   | Backend is currently a stub; `GET /health` + `GET /health/error` on `127.0.0.1:8080` satisfy “span around a request” without waiting on the full domain API.                                                                                  |
| `effect/observability` | Explicitly authorized above; verify `OtlpTracer` against installed Effect **4.0.1** declarations during implementation. APIs are `@stability unstable`.                                                                                       |
| Fallback trigger (P8)  | If after `pnpm install` native `OtlpTracer` is missing, broken, or inadequate for OTLP/HTTP export of request spans, fall back within this feature to `@effect/opentelemetry` + OTLP HTTP exporter. Document the switch in research if taken. |
| Grafana image pin      | Compose MUST use `grafana/otel-lgtm:0.35.0` (prefer digest pin at implement time if available). Do not ship `:latest`.                                                                                                                        |
| Grafana host port      | Publish Grafana on loopback **3300** (map container 3000) so Next.js keeps **3000**.                                                                                                                                                          |
| Backend Vitest         | New dependency `vitest` on `@pathableai/pre-ets-backend` is authorized by this plan (Principle VI ownership). Mirror frontend script naming (`test:unit`); keep `@effect/vitest` out unless needed.                                           |

## Risks

| Risk                                                                                           | Mitigation                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENTS / effect-guidance still say Effect **4.0.0-rc.113** while `package.json` pins **4.0.1** | Implementation MUST verify against **package.json Effect 4.0.1** declarations. Sync AGENTS/effect-guidance pin language in a **follow-up outside this feature**; do not rewrite AGENTS.md here unless required for consistency. |
| MCP auth brittle vs image defaults                                                             | Docs pin verified path for `0.35.0`: anonymous Admin (image default) or `admin`/`admin`.                                                                                                                                        |
| Custom enable flag vs OTEL docs                                                                | Precedence table in OTLP contract; justify `OTEL_TRACES_ENABLED` as default-off layer install gate.                                                                                                                             |

## Phase notes (before `/speckit-tasks`)

1. Contracts and quickstart lock ports, routes, auth, and verification set (done in this remediation).
2. Implementation tasks MUST add Compose image pin, Vitest, process-host Layer wiring, and docs under `docs/observability.md` / `docs/docker-compose.md`.
3. Do not drift Effect pin language in AGENTS.md beyond the Risks note above.
