# Tasks: OpenTelemetry Observability Stack

**Identity**: Feature directory `specs/006-otel-observability`; git branch
`007-otel-observability`. Spec Kit directory numbers and git branch numbers are
independent — do not rename either to force a match.

**Input**: `specs/006-otel-observability/spec.md`, `plan.md`, `research.md`, `data-model.md`,
`contracts/` (`otlp-export.md`, `request-span-attributes.md`, `grafana-mcp.md`), and
`quickstart.md`.
**Organization**: Setup (Vitest + dirs + Effect verify) → Foundational (config + OTLP Layer) →
US1 backend request spans (P1 MVP) → US2 optional Grafana Compose (P1) → US3 deployed OTLP
docs/policy (P2) → US4 Grafana MCP docs (P3) → Polish (docs cross-links + quickstart).
**Tests**: Required by plan Testing section, SC-007 (negative Authorization fixture), and
Principle V. Use plain **Vitest** on `@pathableai/pre-ets-backend` (`test:unit`); **not**
`@effect/vitest` unless a later need appears. Write failing unit cases before implementation
where marked.
**Branch**: `007-otel-observability` (feature dir `specs/006-otel-observability`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: US1 / US2 / US3 / US4 for story phases only
- Exact file paths in every task

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Backend test runner, source layout stubs, and Effect OTLP API verification before
instrumentation.

- [ ] T001 [P] Add `vitest` (align version with frontend where practical) as a
      `packages/backend` **devDependency**; add `"test:unit": "vitest run --config vitest.config.ts"`
      to `packages/backend/package.json`; run `pnpm install` from repo root so the lockfile updates
- [ ] T002 [P] Create `packages/backend/vitest.config.ts` (Node environment; include
      `tests/**/*.test.ts`; ESM-compatible with the workspace TypeScript settings)
- [ ] T003 [P] Create directories `packages/backend/src/http/`,
      `packages/backend/src/observability/`, and `packages/backend/tests/` (add placeholder
      `.gitkeep` only if required by empty-dir policy; prefer real modules in later tasks)
- [ ] T004 Verify installed Effect **4.0.1** exports `OtlpTracer` from `effect/observability`
      (not `effect/unstable/observability`); if missing/inadequate, document fallback to
      `@effect/opentelemetry` + OTLP HTTP in `specs/006-otel-observability/research.md` and use
      that path for subsequent tasks (plan Complexity Tracking P8)

**Checkpoint**: Backend can run Vitest; Effect OTLP import path is confirmed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Observability configuration, attribute safety helpers, and OTLP tracer Layer
factory. **No request spans or Compose profile until this phase completes.**

- [ ] T005 Write failing unit tests in
      `packages/backend/tests/observability-config.test.ts` covering precedence from
      `contracts/otlp-export.md`: (1) flag off → disabled; (2) `OTEL_SDK_DISABLED=true` → no
      export; (3) enabled + missing/invalid endpoint → local/dev fail-soft vs
      `NODE_ENV=production` refuse-to-start; (4) enabled + valid endpoint → enabled with
      traces URL `{base}/v1/traces`; default `serviceName` `pre-ets-backend`;
      `OTEL_TRACES_ENABLED` only `true`/`1` (case-insensitive) enables
- [ ] T006 Implement observability config parsing in
      `packages/backend/src/observability/config.ts` (env → typed config; dual startup policy;
      endpoint normalization) until T005 passes
- [ ] T007 [P] Write failing unit tests in
      `packages/backend/tests/request-span-attributes.test.ts` for required attributes
      `http.request.method`, `http.route`, `http.response.status_code` (from
      `contracts/request-span-attributes.md` / data-model) and a **negative** fixture that rejects
      prohibited attributes (e.g. Authorization / cookie / token keys) per SC-007
- [ ] T008 [P] Implement attribute helpers in
      `packages/backend/src/observability/attributes.ts` (build/allow-list required attrs; deny
      secrets) until T007 passes
- [ ] T009 Implement OTLP tracer Layer wiring in
      `packages/backend/src/observability/tracing.ts` using `OtlpTracer` from
      `effect/observability`, requiring process-host provision of `HttpClient.HttpClient` and
      `OtlpSerialization`; gate Layer install on config from T006; local sampling **100%**;
      export best-effort after valid start

**Checkpoint**: Config + attributes + tracer Layer are unit-tested and importable; HTTP host
still stub until US1.

---

## Phase 3: User Story 1 — Backend request spans with clear attributes (Priority: P1) 🎯 MVP

**Goal**: Effect backend listens on `BACKEND_LISTEN_ADDR` (default
`127.0.0.1:8080`), serves `GET /health` (200) and
`GET /health/error` (500), and when traces are enabled exports a request-scoped span with the
required semantic attributes via OTLP.

**Independent Test**: Enable traces with a valid OTLP endpoint; `curl`
`http://127.0.0.1:8080/health` and `/health/error`; confirm request spans with method, route,
and status attributes at the collector (or later Grafana in US2).

### Tests for User Story 1

> Write these FIRST; ensure they FAIL before wiring.

- [ ] T010 [P] [US1] Add failing unit/integration-style Vitest coverage in
      `packages/backend/tests/http-health.test.ts` (or adjacent) asserting `/health` → 200 and
      `/health/error` → 500 behavior of the demo surface once implemented (use Effect test
      Layers / request helpers appropriate to platform-node; no real collector required)
- [ ] T011 [P] [US1] Add failing tests in
      `packages/backend/tests/request-span-emission.test.ts` that, with a test/noop or
      capturing tracer Layer, assert a request span is created for `/health` and `/health/error`
      including `http.request.method`, `http.route`, and `http.response.status_code`

### Implementation for User Story 1

- [ ] T012 [US1] Implement demo HTTP routes in `packages/backend/src/http/routes.ts` (or
      equivalent): `GET /health` → 200; `GET /health/error` → 500; wrap handlers with
      `Effect.withSpan` / `Effect.fn` and set attributes via T008 helpers
- [ ] T013 [US1] Replace stub in `packages/backend/src/index.ts` with process host that: binds
      `BACKEND_LISTEN_ADDR` (default `127.0.0.1:8080`); composes HTTP server + optional
      tracer Layer from T009; provides `HttpClient` + `OtlpSerialization` when enabled; applies
      startup policy from T006; keeps import-safe modules (no side-effect boot on library import)
- [ ] T014 [US1] Add `packages/backend/.env.example` documenting `OTEL_TRACES_ENABLED` (default
      off), `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, optional
      `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_SDK_DISABLED`, and `BACKEND_LISTEN_ADDR` (default
      `127.0.0.1:8080`) for the demo surface
- [ ] T015 [US1] Make T010–T011 pass; run
      `pnpm --filter @pathableai/pre-ets-backend test:unit` and fix regressions
- [ ] T016 [US1] Manually smoke (or script) disabled-by-default start + enabled export against a
      temporary OTLP listener or US2 stack; confirm SC-003 verification set produces spans

**Checkpoint**: MVP — backend emits request spans with required attributes; traces off by
default.

---

## Phase 4: User Story 2 — Optional local Grafana stack (Priority: P1)

**Goal**: Compose profile `observability` runs pinned `grafana/otel-lgtm:0.35.0` on loopback
ports 3300/4317/4318; default Compose path unchanged; docs explain opt-in/opt-out.

**Independent Test**: `docker compose up -d --wait redis keycloak` has no LGTM; then
`docker compose --profile observability up -d --wait`; point backend at
`http://127.0.0.1:4318`; `GET /health`; find span in Grafana at `http://127.0.0.1:3300`
within ~30s.

- [ ] T017 [P] [US2] Add `otel-lgtm` (or equivalently named) service to root `compose.yaml`
      using image **`grafana/otel-lgtm:0.35.0`** (prefer digest pin if available at implement
      time), Compose profile **`observability`**, loopback publishes `127.0.0.1:3300:3000`,
      `127.0.0.1:4317:4317`, `127.0.0.1:4318:4318`, and a healthcheck/`--wait`-friendly readiness
      so default `docker compose up` without the profile does **not** start it
- [ ] T018 [P] [US2] Extend `docs/docker-compose.md` with optional observability profile:
      start/stop without tearing down Redis/Keycloak; ports; Grafana URL; OTLP endpoint; ~30s
      span visibility; port conflict notes (3300 vs Next 3000; 4318)
- [ ] T019 [US2] Verify end-to-end with US1 backend: opt-in stack → enable
      `OTEL_TRACES_ENABLED` + endpoint → `GET /health` → locate span in Grafana Explore/Tempo;
      stop observability profile while Redis/Keycloak remain; confirm best-effort when collector
      down (SC-005)

**Checkpoint**: Optional local Grafana works for viewing backend request spans.

---

## Phase 5: User Story 3 — Deployed OTLP export without vendor lock-in (Priority: P2)

**Goal**: Same instrumentation; operators configure any OTLP-compatible endpoint; production
refuse-to-start on enabled+invalid config documented and tested.

**Independent Test**: Point `OTEL_EXPORTER_OTLP_ENDPOINT` at a second OTLP/HTTP target; spans
arrive without code changes; production-mode invalid config refuses start.

- [ ] T020 [P] [US3] Extend unit coverage in
      `packages/backend/tests/observability-config.test.ts` (or
      `packages/backend/tests/startup-policy.test.ts`) asserting production refuse-to-start vs
      local fail-soft diagnostics for enabled+invalid endpoint (lock table in plan/spec)
- [ ] T021 [US3] **Create** `docs/observability.md` (sole creator of this file) documenting
      deployed configuration: vendor-agnostic OTLP/HTTP; env vars and precedence
      (`contracts/otlp-export.md`); headers for auth; no mandated SaaS; production vs local
      startup policy; sampling note (local 100%; production sampling deferred); alerting/SLOs
      out of scope (E9); leave clear stubs/headings for MCP (US4) and traces-only polish (T026)
- [ ] T022 [US3] **Verify SC-004 live**: retarget `OTEL_EXPORTER_OTLP_ENDPOINT` to a second
      OTLP/HTTP endpoint (second listener or second collector — not only Grafana), send
      `GET /health`, and confirm the request span **arrives at that second endpoint**; then
      document the verified switch steps in `specs/006-otel-observability/quickstart.md`
      section 5 and `docs/observability.md`. Done requires the live second-endpoint proof, not
      a docs note alone.

**Checkpoint**: Deployed export path is documented and startup policy verified in tests.

---

## Phase 6: User Story 4 — Grafana MCP for agents (Priority: P3)

**Goal**: Docs enable connecting `mcp-grafana` to local Grafana (`127.0.0.1:3300`) with the
verified auth path for `otel-lgtm:0.35.0`.

**Independent Test**: Follow docs against running observability profile; MCP client connects and
completes one documented read (datasource list or Tempo search for `pre-ets-backend`) on the
first attempt. Live success is required for SC-006.

- [ ] T023 [US4] **Depends on T021**. Add MCP section to existing `docs/observability.md` (and
      align `contracts/grafana-mcp.md`): prerequisites (profile running); `GRAFANA_URL=
      http://127.0.0.1:3300`; verified auth for `0.35.0` (anonymous Admin default;
      `admin`/`admin` alternate; service account preferred when anonymous disabled); example
      `uvx mcp-grafana` / Cursor MCP config; one concrete agent read/query example; explicit
      “does not work without optional stack”; include a **human verification checklist** for the
      live MCP read (commands + expected outcome) used when CI cannot run MCP
- [ ] T024 [US4] **SC-006 acceptance evidence (mandatory live MCP)**: Against a running local
      Grafana stack, connect an MCP client per docs and complete at least one documented
      read/query against local trace data on the **first attempt**. Record commands + outcome as
      PR/acceptance evidence. If CI cannot run MCP, the human verification checklist from T023
      **MUST** be completed by a human before merge (docs-only command lists without a live
      success are **not** a substitute for SC-006).

**Checkpoint**: MCP docs satisfy FR-011 / SC-006.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Cross-links, README pointer, quality gates, quickstart pass.

- [ ] T025 [P] Add a brief pointer in root `README.md` to `docs/observability.md` / Compose
      observability profile (keep README short; details stay in docs)
- [ ] T026 [US4/Polish] **Depends on T021** (and preferably T023 for MCP section presence).
      Ensure `docs/observability.md` states traces-only scope, required semantic attributes,
      demo routes (`/health`, `/health/error`), `BACKEND_LISTEN_ADDR` default, and how to find
      a known span end-to-end (FR-013). Do not recreate the file — edit the T021-owned doc.
- [ ] T027 Run `pnpm --filter @pathableai/pre-ets-backend test:unit`,
      `pnpm --filter @pathableai/pre-ets-backend typecheck`,
      `pnpm --filter @pathableai/pre-ets-backend lint`, and fix issues introduced by this feature
- [ ] T028 Execute `specs/006-otel-observability/quickstart.md` sections 0–6 and confirm
      SC-001–SC-008 evidence for the PR. **SC-004 Done**: second OTLP/HTTP endpoint actually
      received the span (not docs-only). **SC-006 Done**: live MCP first-attempt read evidence
      (or completed human checklist from T024 before merge). Environment-specific skips allowed
      only when the checklist still records live verification elsewhere.
- [ ] T029 Do **not** rewrite `AGENTS.md` / `docs/engineering/effect-guidance.md` Effect pin
      language in this feature (plan Risks: package.json **4.0.1** authoritative; AGENTS sync is
      follow-up)—confirm PR description notes the drift

**Checkpoint**: Feature ready for review / `/speckit-implement`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: Depends on Foundational — **MVP**
- **US2 (Phase 4)**: Depends on Foundational; E2E verification (T019) depends on US1 export
- **US3 (Phase 5)**: Depends on Foundational config/policy; T021 creates
  `docs/observability.md`; T022 live SC-004 after US1 export works; docs parallel US2 after T006
- **US4 (Phase 6)**: T023 depends on T021; live MCP smoke (T024) depends on US2 stack; docs
  draft starts after T021 exists and T017 ports are known
- **Polish (Phase 7)**: T026 depends on T021; full feature through US4 before T028

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependency on US2–US4
- **US2 (P1)**: Compose service independent of US1 code; span-in-Grafana proof needs US1
- **US3 (P2)**: Uses same US1 instrumentation; primarily docs + startup-policy tests + live
  SC-004 second-endpoint proof (T022)
- **US4 (P3)**: Docs + MCP; T023 after T021; live verify (T024) needs US2

### Parallel Opportunities

- T001–T003 in parallel during Setup
- T005–T006 sequential; T007–T008 parallel with each other; T009 after T006
- T010–T011 parallel after Foundational
- T017–T018 parallel once ports locked; T019 after US1 + T017
- T020 parallel with T021; T022 after T021 (and US1 export); T023 after T021 (not parallel with
  first create of `docs/observability.md`); T026 after T021

---

## Parallel Example: User Story 1

```bash
# After Foundational completes, launch US1 tests together:
Task: "T010 failing http-health tests in packages/backend/tests/http-health.test.ts"
Task: "T011 failing request-span-emission tests in packages/backend/tests/request-span-emission.test.ts"

# Then implement routes + process host (sequential):
Task: "T012 demo routes in packages/backend/src/http/routes.ts"
Task: "T013 process host in packages/backend/src/index.ts"
```

---

## Parallel Example: User Story 2

```bash
Task: "T017 observability profile in compose.yaml"
Task: "T018 docs in docs/docker-compose.md"
# Then T019 E2E against US1 backend
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US1 (request spans)
4. **STOP and VALIDATE**: Independent Test for US1 (OTLP collector or temporary listener)
5. Demo/share before Compose/MCP polish if desired

### Incremental Delivery

1. Setup + Foundational → ready for stories
2. US1 → MVP spans
3. US2 → local Grafana viewing
4. US3 → deployed docs + production policy
5. US4 → MCP agent path
6. Polish → quickstart + quality gates

### Parallel Team Strategy

1. Together: Setup + Foundational
2. Then:
   - Dev A: US1 spans
   - Dev B: US2 Compose + docker-compose docs (integrate E2E after US1)
   - Dev C: US3/US4 documentation (after ports/auth locked)

---

## Notes

- [P] = different files, no incomplete dependencies
- Import path is **`effect/observability`** (APIs `@stability unstable`); do not use
  `effect/unstable/observability`
- Do not put Next.js or Effect app processes inside Compose
- Traces only — no metrics/logs/frontend instrumentation in this feature
- Commit after each task or logical group; run backend unit tests before pushing
