# Feature Specification: OpenTelemetry Observability Stack

**Feature Branch**: `007-otel-observability`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "We need to setup an observability stack based around opentelemetry. This needs to work both in local development and deployed environments. Locally, it should be optional so that it can be used when a developer works on features that need it, but not if they don't. This needs to work with both the nextjs framework and effect. The local development stack should be based around grafana in the docker compose and we should add to our documentation instructions on how to use an mcp server to also connect agents to the local grafana stack. The goal is to ultimately be as vendor agnostic as possible."

## Clarifications

### Session 2026-10-05

- Q: What is the minimum in-scope telemetry for this increment? → A: Backend only: basic OpenTelemetry span traces around a request, with clear semantic attributes. Metrics, logs, and full multi-signal coverage are out of scope for this increment (may return later).
- Q: Besides backend request spans, which original platform pieces stay in this increment? → A: Keep all four stories (backend spans, optional local Grafana, deployed OTLP export, MCP docs), narrowed to traces-only.
- Q: Which minimum semantic attributes must appear on each backend request span for acceptance? → A: Method + route/path template + status/outcome (clarify recommendation accepted as planning default when `/speckit-plan` proceeded before an explicit reply).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - See a backend request span with clear attributes (Priority: P1)

A developer enables observability on the Effect backend and exercises an HTTP (or equivalent) request. They can find a single request-scoped span (or a clear parent request span) exported via OTLP, with clear semantic attributes that identify the operation (for example method, route/path template, and status outcome)—without needing metrics, logs, or frontend instrumentation in this increment.

**Why this priority**: This is the stated MVP: prove vendor-neutral tracing on the backend before expanding signals or surfaces.

**Independent Test**: Enable backend observability with an OTLP endpoint (local stack or test collector). Send a known backend request. Confirm one request-scoped span appears with the documented semantic attributes and no requirement for metrics/logs/frontend export.

**Acceptance Scenarios**:

1. **Given** backend observability is enabled and a valid OTLP endpoint is configured, **When** a backend request is handled, **Then** the backend emits an OpenTelemetry span that represents that request.
2. **Given** that request span, **When** a developer inspects its attributes, **Then** they see clear, documented semantic attributes sufficient to identify the request operation and outcome (without secrets or protected personal data).
3. **Given** only the OTLP endpoint (and related export settings) change between environments, **When** the backend starts, **Then** spans export to the newly configured destination without vendor-specific instrumentation changes in application code.
4. **Given** observability is disabled or no endpoint is configured, **When** the backend runs, **Then** it operates normally and does not fail startup or request handling solely because telemetry export is off.

---

### User Story 2 - Optional local Grafana stack for viewing traces (Priority: P1)

A developer who needs to inspect backend spans locally starts an optional Grafana-based stack via the project's Docker Compose setup. Developers who do not need observability continue using existing local services without starting Grafana. When the stack is running and the backend exports OTLP to it, the developer can find the request span in Grafana.

**Why this priority**: Local diagnosis is how the MVP is verified day to day; optionality protects developers who do not need the overhead.

**Independent Test**: Start only default local services and confirm Grafana is not required. Opt into the Grafana observability services, point the backend at the local OTLP endpoint, send a request, and confirm the request span appears in Grafana.

**Acceptance Scenarios**:

1. **Given** a developer follows the default local startup path, **When** they bring up required local services, **Then** the Grafana observability stack does not start unless they explicitly opt in.
2. **Given** a developer explicitly opts into the local Grafana observability stack, **When** Compose finishes starting those services, **Then** Grafana (and supporting services needed for local OTLP trace intake) are reachable on documented local URLs/ports.
3. **Given** the optional stack is running and the backend exports OTLP traces to the local endpoint, **When** the developer sends a known backend request, **Then** they can find the corresponding request span in Grafana within a short, documented wait window.
4. **Given** the optional stack is not running, **When** a developer runs the backend with observability left disabled, **Then** local development of unrelated features continues without errors caused by missing Grafana services.
5. **Given** the backend is misconfigured to export while the local stack is down, **When** export fails, **Then** backend core behavior remains available (best-effort export; failures are visible in diagnostics but do not block primary workflows).

---

### User Story 3 - Deployed environments export traces without vendor lock-in (Priority: P2)

An operator configures deployed environments with an OTLP endpoint appropriate to that environment. The same backend span instrumentation used locally exports to the deployed destination. No single commercial observability vendor is required.

**Why this priority**: Production readiness depends on export configuration parity with local instrumentation, but choosing a specific hosted vendor can wait.

**Independent Test**: Configure a non-local OTLP endpoint (or stand-in collector), enable backend observability, exercise a request, and verify the request span arrives using the same instrumentation path as local.

**Acceptance Scenarios**:

1. **Given** a deployed environment with a configured OTLP endpoint and required auth/settings, **When** the backend runs with observability enabled, **Then** it exports request spans to that endpoint.
2. **Given** two different OTLP-compatible destinations, **When** only environment configuration differs, **Then** the same backend build can target either destination.
3. **Given** observability configuration is incomplete or invalid in a deployed environment, **When** the process starts, **Then** operators receive clear configuration diagnostics; behavior for refuse-to-start vs run-without-export is documented and consistent.
4. **Given** documentation for deployed observability, **When** an operator follows it, **Then** they can enable trace export without being directed to a single mandatory commercial vendor.

---

### User Story 4 - Agent access to local Grafana via MCP (Priority: P3)

A developer using AI coding agents wants those agents to query or inspect local Grafana for backend traces. Documentation describes how to connect an MCP server to the local Grafana instance.

**Why this priority**: Improves agent-assisted diagnosis once the local stack exists; not required to emit or manually view spans.

**Independent Test**: Follow the documented MCP setup against a running local Grafana stack; confirm an agent (or MCP client) can connect and perform at least one documented read/query against local trace data.

**Acceptance Scenarios**:

1. **Given** the local Grafana observability stack is running, **When** a developer follows the project documentation for the Grafana MCP server, **Then** they can configure an MCP client to connect to that local Grafana instance.
2. **Given** that MCP connection is configured, **When** the developer asks an agent to inspect a recent backend request span (within documented capabilities), **Then** the agent can retrieve useful trace context via the MCP server.
3. **Given** the local Grafana stack is not running, **When** a developer reads the MCP documentation, **Then** the docs state the prerequisite clearly and do not imply MCP works without the optional stack.

### Edge Cases

- Observability disabled by default in local development; explicit opt-in required for both the Compose stack and backend export.
- Export destination unreachable: backend remains usable; export failures are best-effort and surfaced as diagnostics, not silent process crashes for routine request handling.
- Frontend / Next.js instrumentation, metrics, and logs are out of scope for this increment; absence of those signals is expected and must not fail acceptance of backend request spans.
- High-cardinality or sensitive attributes (tokens, cookies, session identifiers, PHI, tenant secrets) MUST NOT appear on spans.
- Local Grafana stack resource use: optional services MUST be stoppable independently without tearing down unrelated Compose services the developer still needs.
- Clock skew or delayed batch export: documentation sets a realistic expectation for when spans become visible after traffic.
- Multiple developers on the same machine: default local ports and data directories are documented; conflicts are called out with remediation guidance.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The Effect backend MUST emit an OpenTelemetry request-scoped span for handled requests when observability is enabled, including semantic attributes for HTTP method, route/path template, and status/outcome.
- **FR-002**: The backend MUST export spans using OTLP to a configurable endpoint so destinations can change without vendor-specific instrumentation rewrites.
- **FR-003**: Local development MUST treat observability as optional: default workflows MUST NOT require the Grafana stack or telemetry export.
- **FR-004**: The project's Docker Compose setup MUST provide an optional Grafana-based local observability stack that accepts OTLP traces and lets developers inspect backend request spans.
- **FR-005**: Documentation MUST explain how to opt into the local Grafana stack, point the backend at it, verify a request span appears, and shut the stack down without disrupting unrelated local services.
- **FR-006**: Deployed environments MUST be able to enable the same backend span instrumentation and export to an OTLP-compatible collector/backend via environment-specific configuration.
- **FR-007**: Observability configuration MUST be environment-driven (enable/disable, endpoint, and related export settings) and documented for local and deployed use.
- **FR-008**: Metrics, logs, frontend/Next.js instrumentation, and cross-process trace propagation are out of scope for this increment (deferred to later work).
- **FR-009**: Span attributes MUST exclude secrets, credentials, raw session tokens/cookies, and protected personal or health data; only safe operational attributes and outcome classes are permitted.
- **FR-010**: Backend startup and primary request handling MUST succeed when observability is disabled; export MUST be best-effort when enabled so collector outages do not become hard dependencies for local feature work.
- **FR-011**: Project documentation MUST include instructions for connecting an MCP server to the local Grafana stack for AI agent use, including prerequisites, configuration, and example agent workflows focused on traces.
- **FR-012**: Design and documentation MUST remain vendor-agnostic for deployed backends: OpenTelemetry/OTLP is the interchange standard; no single commercial observability SaaS is required to complete this feature.
- **FR-013**: Local observability docs MUST state that this increment provides traces (request spans) only, list the expected semantic attributes, and show how to find a known backend request span end to end.

### Key Entities

- **Request Span**: An OpenTelemetry span representing handling of a single backend request, with semantic attributes describing the operation and outcome.
- **Semantic Attributes**: Named span fields (for example method, route/path template, status) that make the request recognizable without reading proprietary vendor formats.
- **OTLP Export Target**: The configured destination (endpoint and auth/settings) that receives exported spans; may be the local stack or a deployed collector/backend.
- **Local Observability Stack**: Optional Compose-managed Grafana-centered services that receive OTLP traces locally and provide developer UI for inspection.
- **Observability Configuration**: Environment-level settings that enable/disable export and select the OTLP target for the backend process.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A developer who does not need observability can complete the default local startup path with zero Grafana/observability services running and with the backend healthy for unrelated feature work.
- **SC-002**: A developer following the opt-in local guide can, within 15 minutes, start the Grafana stack, enable backend export, send a sample request, and locate the corresponding request span with its semantic attributes in Grafana.
- **SC-003**: With observability enabled, 100% of exercised representative backend requests in the verification plan produce an exportable request-scoped OpenTelemetry span (no silent total drop for those paths).
- **SC-004**: Switching the OTLP destination from the local stack to a second OTLP-compatible endpoint requires configuration changes only (no application instrumentation rewrite) and is verified by spans arriving at the second endpoint.
- **SC-005**: When the local collector/stack is stopped while the backend still attempts export, core backend workflows remain available (no hard dependency); export failure is observable in diagnostics.
- **SC-006**: A developer following the MCP documentation can connect an MCP client to the local Grafana instance and complete at least one documented read/query against local trace data on the first attempt.
- **SC-007**: Review of sample exported spans from the verification plan shows no secrets, raw session tokens/cookies, or protected personal/health data in attributes or bodies.
- **SC-008**: For each verification request, the request span includes the documented minimum set of semantic attributes needed to identify the operation and outcome.

## Assumptions

- This increment is traces-only (request spans on the Effect backend). Metrics, logs, Next.js/frontend instrumentation, and cross-service correlation are deferred—not failures if absent.
- “Clear semantic attributes” means the documented minimum set: HTTP method, route/path template, and status/outcome (clarify Option B / planning default).
- Platform delivery for this increment still includes optional local Grafana (trace viewing), deployed OTLP export configuration, and MCP docs for agent access to local Grafana—alongside backend request spans.- Local visualization remains Grafana-centered via Docker Compose for inspecting traces; supporting collectors/storage chosen during planning must preserve OTLP trace intake.
- Deployed vendor selection is out of scope beyond OTLP-compatible configuration and documentation patterns.
- Browser/end-user device telemetry (RUM) is out of scope.
- Default local Compose services used today (e.g., Redis, Keycloak) remain available independently of the optional Grafana stack (Compose profiles or equivalent explicit opt-in).
- Best-effort export when enabled is preferred for local development; production may choose stricter fail-fast-on-misconfiguration for observability settings, documented explicitly during planning if it differs.
- Existing project docs (`docs/docker-compose.md` and related README paths) are the natural place to extend local observability and MCP setup instructions.
- MCP guidance documents a Grafana-oriented MCP server suitable for local agent access to traces; exact server package selection is a planning decision as long as docs are accurate and testable.
- Sampling and retention defaults will follow common development-friendly settings locally; exact rates are planning details.
- Existing structured logging practices are unchanged by this increment; this slice does not require log–trace correlation.
