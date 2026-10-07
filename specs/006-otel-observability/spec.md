# Feature Specification: OpenTelemetry Observability Stack

**Identity**: Feature directory `specs/006-otel-observability`; git branch
`007-otel-observability`. Spec Kit directory numbers and git branch numbers are
independent — do not rename either to force a match.

**Feature Branch**: `007-otel-observability`

**Created**: 2026-10-05

**Status**: Ready

**Input**: User description: "We need to setup an observability stack based around opentelemetry. This needs to work both in local development and deployed environments. Locally, it should be optional so that it can be used when a developer works on features that need it, but not if they don't. This needs to work with both the nextjs framework and effect. The local development stack should be based around grafana in the docker compose and we should add to our documentation instructions on how to use an mcp server to also connect agents to the local grafana stack. The goal is to ultimately be as vendor agnostic as possible."

## Clarifications

### Session 2026-10-05

- Q: What is the minimum in-scope telemetry for this increment? → A: **Next.js Node server** only: basic OpenTelemetry span traces around a request, with clear semantic attributes. Metrics, logs, and full multi-signal coverage are out of scope for this increment (may return later).
- Q: Besides Next request spans, which original platform pieces stay in this increment? → A: Keep all four stories (Next spans, optional local Grafana, deployed OTLP export, MCP docs), narrowed to traces-only.
- Q: Which minimum semantic attributes must appear on each request span for acceptance? → A: Method + route/path template + status/outcome (clarify recommendation accepted as planning default when `/speckit-plan` proceeded before an explicit reply).

### Scope correction 2026-10-05 (post-review)

Earlier drafts incorrectly targeted `@pathableai/pre-ets-backend` (Effect HTTP stub on
`127.0.0.1:8080`). The intended process is the **Next.js server** that powers the
frontend (`@pathableai/pre-ets-frontend`). The backend package remains a stub and is
**out of scope** for this increment. Effect remains in-process on that Next host
and bridges Effect spans via `@effect/opentelemetry` while `@vercel/otel` owns
HTTP auto-instrumentation and OTLP export.

### Critique remediations 2026-10-05

From [critique-20261005-194125.md](./critiques/critique-20261005-194125.md), kept and
retargeted to the Next server:

- **E3 / X1**: Locked startup policy — local/dev: fail-soft (diagnostic + run without export) when enabled but invalid/missing endpoint; production (`NODE_ENV=production`): refuse-to-start with clear diagnostic. Export failures after a valid start remain best-effort.
- **P5 / E11**: Keep explicit `OTEL_TRACES_ENABLED` (default off; do not register the OTEL SDK unless true). Document precedence vs `OTEL_SDK_DISABLED` / endpoint in the OTLP contract.
- **E8**: Pin local image `grafana/otel-lgtm:0.35.0`.
- **P3 / P6 / P7 / X3**: Exercise surface locked — Next listen `http://127.0.0.1:3000`; success `GET /api/health` → 200; intentional error `GET /api/health/error` → 500.
- **P4 / E5**: MCP docs MUST include the verified local Grafana auth path for the pinned image (**anonymous Viewer** as MCP default via Compose override; read-only service account when anonymous is disabled; `admin`/`admin` or anonymous Admin only as troubleshooting fallback) and a **version-pinned** `mcp-grafana` invocation.
- **E9**: Production alerting / SLOs are out of scope for this increment.

Superseded by scope correction (no longer apply as written): backend Vitest authorization
on `@pathableai/pre-ets-backend`, `BACKEND_LISTEN_ADDR` default `8080`, and AGENTS
Effect-pin verification tasks for this feature. `@vercel/otel` plus
`@effect/opentelemetry` global bridge is the authorized export path on the Next host.

## User Scenarios & Testing _(mandatory)_

### Out of this increment

Metrics, logs, browser/RUM telemetry, `@pathableai/pre-ets-backend` instrumentation,
cross-process trace propagation, production alerting/SLOs, hosted vendor selection, and
a second OTLP exporter (including Effect `OtlpTracer`) are **out of scope**. This MVP
delivers Next.js Node request spans over OTLP via `@vercel/otel` with an Effect global
bridge for logical spans, optional local Grafana, deployed export config, and MCP docs
for local Grafana (see **FR-008**).

### User Story 1 - See a Next.js request span with clear attributes (Priority: P1)

A developer enables observability on the Next.js Node server and exercises the demo HTTP
surface (`GET /api/health` and, for error outcome, `GET /api/health/error`). They can find
a single request-scoped span (or a clear parent request span) exported via OTLP, with clear
semantic attributes that identify the operation (for example method, route/path template,
and status outcome)—without needing metrics, logs, or the backend package in this
increment.

**Why this priority**: This is the stated MVP: prove vendor-neutral tracing on the Next
server before expanding signals or processes.

**Independent Test**: Enable Next observability with an OTLP endpoint (local stack or test
collector). Send `GET http://127.0.0.1:3000/api/health`. Confirm one request-scoped span
appears with the documented semantic attributes and no requirement for metrics/logs/backend
export.

**Acceptance Scenarios**:

1. **Given** Next observability is enabled and a valid OTLP endpoint is configured, **When** a request is handled on the demo/health surface, **Then** the Next server emits an OpenTelemetry span that represents that request.
2. **Given** that request span, **When** a developer inspects its attributes, **Then** they see clear, documented semantic attributes sufficient to identify the request operation and outcome (without secrets or protected personal data).
3. **Given** only the OTLP endpoint (and related export settings) change between environments, **When** the Next server starts, **Then** spans export to the newly configured destination without vendor-specific instrumentation changes in application code.
4. **Given** observability is disabled or no endpoint is configured (and traces are not enabled), **When** the Next server runs, **Then** it operates normally and does not fail startup or request handling solely because telemetry export is off.

---

### User Story 2 - Optional local Grafana stack for viewing traces (Priority: P1)

A developer who needs to inspect Next request spans locally starts an optional
Grafana-based stack via the project's Docker Compose setup. Developers who do not need
observability continue using existing local services without starting Grafana. When the
stack is running and the Next server exports OTLP to it, the developer can find the
request span in Grafana.

**Why this priority**: Local diagnosis is how the MVP is verified day to day; optionality
protects developers who do not need the overhead.

**Independent Test**: Start only default local services and confirm Grafana is not
required. Opt into the Grafana observability services, point the Next server at the local
OTLP endpoint, send `GET /api/health`, and confirm the request span appears in Grafana.

**Acceptance Scenarios**:

1. **Given** a developer follows the default local startup path, **When** they bring up required local services, **Then** the Grafana observability stack does not start unless they explicitly opt in.
2. **Given** a developer explicitly opts into the local Grafana observability stack, **When** Compose finishes starting those services, **Then** Grafana (and supporting services needed for local OTLP trace intake) are reachable on documented local URLs/ports (`http://127.0.0.1:3300` UI; OTLP HTTP `http://127.0.0.1:4318`).
3. **Given** the optional stack is running and the Next server exports OTLP traces to the local endpoint, **When** the developer sends `GET /api/health`, **Then** they can find the corresponding request span in Grafana within a short, documented wait window (~30s).
4. **Given** the optional stack is not running, **When** a developer runs the Next server with observability left disabled, **Then** local development of unrelated features continues without errors caused by missing Grafana services.
5. **Given** the Next server is misconfigured to export while the local stack is down, **When** export fails, **Then** Next core behavior remains available (best-effort export; failures are visible in diagnostics but do not block primary workflows).

---

### User Story 3 - Deployed environments export traces without vendor lock-in (Priority: P2)

An operator configures deployed environments with an OTLP endpoint appropriate to that
environment. The same Next span instrumentation used locally exports to the deployed
destination. No single commercial observability vendor is required.

**Why this priority**: Production readiness depends on export configuration parity with
local instrumentation, but choosing a specific hosted vendor can wait.

**Independent Test**: Configure a non-local OTLP endpoint (or stand-in collector), enable
Next observability, exercise `GET /api/health`, and verify the request span arrives using
the same instrumentation path as local—including required export headers when configured.

**Acceptance Scenarios**:

1. **Given** a deployed environment with a configured OTLP endpoint and required auth/settings, **When** the Next server runs with observability enabled, **Then** it exports request spans to that endpoint.
2. **Given** two different OTLP-compatible destinations, **When** only environment configuration differs, **Then** the same Next build can target either destination.
3. **Given** observability is enabled but configuration is incomplete or invalid, **When** the process starts, **Then** operators receive clear configuration diagnostics; **local/dev** runs without export (fail-soft), and **production** (`NODE_ENV=production`) refuses to start.
4. **Given** documentation for deployed observability, **When** an operator follows it, **Then** they can enable trace export without being directed to a single mandatory commercial vendor.

---

### User Story 4 - Agent access to local Grafana via MCP (Priority: P3)

A developer using AI coding agents wants those agents to query or inspect local Grafana for
Next traces. Documentation describes how to connect a **version-pinned** MCP server to the
local Grafana instance, including the **verified** local auth path for the pinned
`otel-lgtm` image. Acceptance for this story requires **live** MCP evidence against local
Grafana (SC-006)—not docs prose alone.

**Why this priority**: Improves agent-assisted diagnosis once the local stack exists; not
required to emit or manually view spans.

**Independent Test**: Follow the documented MCP setup (including verified auth and pinned
package version) against a running local Grafana stack; confirm an agent (or MCP client)
can connect and perform at least one documented read/query against local trace data on the
first attempt. Record that live result as merge-blocking acceptance evidence.

**Acceptance Scenarios**:

1. **Given** the local Grafana observability stack is running, **When** a developer follows the project documentation for the Grafana MCP server (including the verified auth path and pinned version), **Then** they can configure an MCP client to connect to that local Grafana instance.
2. **Given** that MCP connection is configured, **When** the developer asks an agent to inspect a recent Next request span (within documented capabilities), **Then** the agent can retrieve useful trace context via the MCP server on the first attempt (SC-006).
3. **Given** the local Grafana stack is not running, **When** a developer reads the MCP documentation, **Then** the docs state the prerequisite clearly and do not imply MCP works without the optional stack.
4. **Given** CI cannot run a live MCP client against local Grafana, **When** the PR is prepared for merge, **Then** a documented human verification checklist for the live MCP read MUST be completed and attached as acceptance evidence before merge (docs-only notes are not a substitute).

### Edge Cases

- Observability disabled by default in local development; explicit opt-in required for both the Compose stack and Next export.
- Export destination unreachable after a valid start: Next remains usable; export failures are best-effort and surfaced as diagnostics, not silent process crashes for routine request handling.
- Backend package instrumentation, metrics, and logs are out of scope for this increment; absence of those signals is expected and must not fail acceptance of Next request spans.
- High-cardinality or sensitive attributes (tokens, cookies, session identifiers, PHI, tenant secrets) MUST NOT appear on spans.
- Local Grafana stack resource use: optional services MUST be stoppable independently without tearing down unrelated Compose services the developer still needs.
- Clock skew or delayed batch export: documentation sets a realistic expectation for when spans become visible after traffic.
- Multiple developers on the same machine: default local ports and data directories are documented; conflicts are called out with remediation guidance (Grafana UI on **3300** so Next keeps **3000**; Keycloak remains on **8080**).
- Enabled but invalid/missing OTLP endpoint: local/dev fail-soft; production refuse-to-start (see Assumptions).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The Next.js Node server MUST emit an OpenTelemetry request-scoped span for handled requests when observability is enabled, including semantic attributes for HTTP method, route/path template, and status/outcome.
- **FR-002**: The Next server MUST export spans using OTLP to a configurable endpoint so destinations can change without vendor-specific instrumentation rewrites.
- **FR-003**: Local development MUST treat observability as optional: default workflows MUST NOT require the Grafana stack or telemetry export.
- **FR-004**: The project's Docker Compose setup MUST provide an optional Grafana-based local observability stack that accepts OTLP traces and lets developers inspect Next request spans.
- **FR-005**: Documentation MUST explain how to opt into the local Grafana stack, point the Next server at it, verify a request span appears, and shut the stack down without disrupting unrelated local services.
- **FR-006**: Deployed environments MUST be able to enable the same Next span instrumentation and export to an OTLP-compatible collector/backend via environment-specific configuration.
- **FR-007**: Observability configuration MUST be environment-driven (enable/disable, endpoint, headers, and related export settings) and documented for local and deployed use.
- **FR-008**: Metrics, logs, `@pathableai/pre-ets-backend` instrumentation, browser/RUM telemetry, cross-process trace propagation, and a second OTLP exporter (including Effect `OtlpTracer`) are out of scope for this increment (deferred to later work).
- **FR-009**: Span attributes MUST exclude secrets, credentials, raw session tokens/cookies, and protected personal or health data; only safe operational attributes and outcome classes are permitted. Filtering MUST apply at the register/export boundary (`AttributeSanitizingSpanProcessor` / `attributesFromHeadersSafe`) so request spans cannot bypass it.
- **FR-010**: Next startup and primary request handling MUST succeed when observability is disabled; export MUST be best-effort when enabled so collector outages do not become hard dependencies for local feature work. Enabled + invalid/missing endpoint MUST follow the locked startup policy (local/dev fail-soft; production refuse-to-start).
- **FR-011**: Project documentation MUST include instructions for connecting a **version-pinned** MCP server to the local Grafana stack for AI agent use, including prerequisites, the verified local auth path, configuration, and example agent workflows focused on traces.
- **FR-012**: Design and documentation MUST remain vendor-agnostic for deployed destinations: OpenTelemetry/OTLP is the interchange standard; no single commercial observability SaaS is required to complete this feature.
- **FR-013**: Local observability docs MUST state that this increment provides traces (request spans) only, list the expected semantic attributes, and show how to find a known Next request span end to end.
- **FR-014**: This increment MUST provide a minimal demo HTTP surface for span verification: `GET /api/health` (success) and `GET /api/health/error` (intentional error status), served by the Next app on `http://127.0.0.1:3000` by default.

### Key Entities

- **Request Span**: An OpenTelemetry span representing handling of a single Next HTTP request, with semantic attributes describing the operation and outcome.
- **Semantic Attributes**: Named span fields (for example method, route/path template, status) that make the request recognizable without reading proprietary vendor formats.
- **OTLP Export Target**: The configured destination (endpoint and auth/settings) that receives exported spans; may be the local stack or a deployed collector.
- **Local Observability Stack**: Optional Compose-managed Grafana-centered services that receive OTLP traces locally and provide developer UI for inspection.
- **Observability Configuration**: Environment-level settings that enable/disable export and select the OTLP target for the Next Node process.
- **Demo HTTP Surface**: Minimal Next App Router routes (`/api/health`, `/api/health/error`) used only to exercise request spans without session/OIDC.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A developer who does not need observability can complete the default local startup path with zero Grafana/observability services running and with the Next server healthy for unrelated feature work.
- **SC-002**: A developer following the opt-in local guide can, within 15 minutes, start the Grafana stack, enable Next export, send `GET /api/health`, and locate the corresponding request span with its semantic attributes in Grafana.
- **SC-003**: With observability enabled, 100% of the verification set produce an exportable request-scoped OpenTelemetry span (no silent total drop for those paths). Verification set: (1) `GET /api/health` expecting status 200; (2) `GET /api/health/error` expecting status 500.
- **SC-004**: Switching the OTLP destination from the local stack to a second OTLP-compatible endpoint requires configuration changes only (no application instrumentation rewrite) and is verified by spans arriving at the second endpoint **with configured `OTEL_EXPORTER_OTLP_HEADERS` present** (listener or equivalent asserts a synthetic header).
- **SC-005**: When the local collector/stack is stopped while the Next server still attempts export, core Next workflows remain available (no hard dependency) **and** export failure is observable in diagnostics (both observations required).
- **SC-006**: A developer following the MCP documentation (including the verified local Grafana auth path and pinned MCP package version) can connect an MCP client to the local Grafana instance and complete at least one documented read/query against local trace data on the first attempt. Evidence MUST be a successful live MCP read against local Grafana (or a completed human verification checklist recording that live result before merge if CI cannot run MCP). Docs-only recording of commands without a live success is not acceptance evidence.
- **SC-007**: Review of sample exported spans from the verification plan shows no secrets, raw session tokens/cookies, or protected personal/health data in attributes or bodies. Unit tests include at least one negative fixture that rejects prohibited attributes (e.g. Authorization) **and** a producer-boundary test against an emitted span after the register/export pipeline (helper-only tests are insufficient).
- **SC-008**: For each verification request, the request span includes the documented minimum set of semantic attributes needed to identify the operation and outcome.

## Assumptions

- **Evidence**: Engineering need to verify Next request behavior locally (and diagnose failures) before expanding signals; stakeholder request for an optional, vendor-agnostic OTel path. No support-ticket corpus is cited for this internal platform MVP.
- This increment is traces-only (request spans on the Next.js Node server). Metrics, logs, backend-package instrumentation, RUM, and cross-service correlation are deferred—not failures if absent.
- “Clear semantic attributes” means the documented minimum set: HTTP method, route/path template, and status/outcome (clarify Option B / planning default).
- Platform delivery for this increment still includes optional local Grafana (trace viewing), deployed OTLP export configuration, and MCP docs for agent access to local Grafana—alongside Next request spans.
- Local visualization remains Grafana-centered via Docker Compose for inspecting traces; supporting collectors/storage chosen during planning must preserve OTLP trace intake.
- Deployed vendor selection is out of scope beyond OTLP-compatible configuration and documentation patterns.
- Browser/end-user device telemetry (RUM) is out of scope.
- **Alerting / production SLOs** are out of scope for this increment; operators MUST NOT expect alerting thresholds from this slice.
- Default local Compose services used today (e.g., Redis, Keycloak) remain available independently of the optional Grafana stack (Compose profiles or equivalent explicit opt-in).
- **Startup policy (locked)**: When `OTEL_TRACES_ENABLED` is true but the endpoint is missing/invalid — **local/dev** = fail-soft (clear diagnostic; run without export); **production** (`NODE_ENV=production`) = refuse-to-start with clear diagnostic. After a valid start, collector outages remain best-effort export (do not block requests).
- Existing project docs (`docs/docker-compose.md` and related README paths) are the natural place to extend local observability and MCP setup instructions.
- MCP guidance documents a Grafana-oriented MCP server suitable for local agent access to traces; for pinned `grafana/otel-lgtm:0.35.0`, verified MCP auth is anonymous **Viewer** (Compose override of the image’s Admin default) or a read-only service account token; `admin`/`admin` and anonymous Admin are troubleshooting fallbacks only. Invocation MUST use a pinned package/version (`mcp-grafana==2.0.0` via `uvx`, or equivalent pinned container).
- Attribute allow/deny helpers MUST be applied at the register/export SpanProcessor boundary so request spans cannot bypass filtering (FR-009 / SC-007).
- Local sampling default is **100%** (dev-friendly; no intentional drop filters in this increment). Exact production sampling is deferred.
- Existing structured logging practices are unchanged by this increment; this slice does not require log–trace correlation.
- Demo/health routes exist solely to exercise spans; they are not a product API commitment beyond FR-014.
- **Next listen address**: Default local Next URL is `http://127.0.0.1:3000`. Do not bind a competing demo server on Keycloak’s `8080`.
- Effect boots in the same Next process (`instrumentation` → `registerOTel` → ManagedRuntime) and installs `@effect/opentelemetry` global Tracer when traces are enabled (`@vercel/otel` is the single OTLP exporter).
