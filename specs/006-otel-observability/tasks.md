# Tasks: OpenTelemetry Observability Stack

> **Path note (2026-10-06)**: Implementation uses `@vercel/otel` for HTTP + OTLP
> export and `@effect/opentelemetry` `OtelTracer.layerGlobal` for Effect logical
> spans. Do not add Effect `OtlpTracer` as a second exporter.

**Identity**: Feature directory `specs/006-otel-observability`; git branch
`007-otel-observability`. Spec Kit directory numbers and git branch numbers are
independent — do not rename either to force a match.

**Input**: `specs/006-otel-observability/spec.md`, `plan.md`, `research.md`, `data-model.md`,
`contracts/` (`otlp-export.md`, `request-span-attributes.md`, `grafana-mcp.md`), and
`quickstart.md`.
**Organization**: Setup (deps + dirs) → Foundational (config + OTEL register helpers) →
US1 Next request spans (P1 MVP) → US2 optional Grafana Compose (P1) → US3 deployed OTLP
docs/policy (P2) → US4 Grafana MCP docs (P3) → Polish (docs cross-links + quickstart).
**Tests**: Required by plan Testing section, SC-007 (negative Authorization fixture), and
Principle V. Use existing frontend **Vitest** (`test:unit`). Write failing unit cases
before implementation where marked. Include **host-boundary** coverage for production
refuse-to-start (not config-parser-only).
**Branch**: `007-otel-observability` (feature dir `specs/006-otel-observability`).
**Scope**: `@pathableai/pre-ets-frontend` / Next Node server only. Do **not** change
`packages/backend`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: US1 / US2 / US3 / US4 for story phases only
- Exact file paths in every task

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Frontend OTEL dependency and source layout stubs before instrumentation.

- [x] T001 [P] Add `@vercel/otel` (and documented peer OpenTelemetry packages from the
      Next **16.3.8** OpenTelemetry guide) as dependencies of
      `packages/frontend/package.json`; run `pnpm install` from repo root so the lockfile
      updates
- [x] T002 [P] Create directories `packages/frontend/src/lib/observability/` and
      `packages/frontend/src/app/api/health/` (and `packages/frontend/src/app/api/health/error/`
      when implementing the error route); add placeholder `.gitkeep` only if required by
      empty-dir policy; prefer real modules in later tasks
- [x] T003 Confirm Next OpenTelemetry guide path for installed Next **16.3.8**
      (`@vercel/otel` register API). If `@vercel/otel` is inadequate after install, document
      fallback to manual `NodeSDK` + OTLP HTTP in
      `specs/006-otel-observability/research.md` and use that single registration path for
      subsequent tasks (no Effect `OtlpTracer` exporter)

**Checkpoint**: Frontend has OTEL deps; registration API path is confirmed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Observability configuration, attribute safety helpers, and gated OTEL
register helper. **No request demo routes or Compose profile until this phase completes.**

- [x] T004 Write failing unit tests in
      `packages/frontend/tests/unit/observability-config.test.ts` covering precedence from
      `contracts/otlp-export.md`: (1) flag off → disabled; (2) `OTEL_SDK_DISABLED=true` → no
      export; (3) enabled + missing/invalid endpoint → local/dev fail-soft vs
      `NODE_ENV=production` refuse-to-start **decision**; (4) enabled + valid endpoint →
      enabled with traces URL `{base}/v1/traces`; default `serviceName` `pre-ets-frontend`;
      `OTEL_TRACES_ENABLED` only `true`/`1` (case-insensitive) enables; headers parse from
      `OTEL_EXPORTER_OTLP_HEADERS`
- [x] T005 Implement observability config parsing in
      `packages/frontend/src/lib/observability/config.ts` (env → typed config; dual startup
      policy; endpoint normalization; headers) until T004 passes
- [x] T006 Write failing unit tests in
      `packages/frontend/tests/unit/request-span-attributes.test.ts` for required method /
      route / status facts (from `contracts/request-span-attributes.md` / data-model) and a
      **negative** fixture that rejects prohibited attributes (e.g. Authorization / cookie /
      token keys) per SC-007
- [x] T007 Implement attribute helpers in
      `packages/frontend/src/lib/observability/attributes.ts` (build/allow-list required
      attrs; deny secrets) until T006 passes
- [x] T008 Implement gated OTEL registration helper in
      `packages/frontend/src/lib/observability/register.ts` using `@vercel/otel` (or
      documented fallback), applying config from T005; local sampling **100%**; export
      best-effort after valid start; **do not** install Effect `OtlpTracer`. **MUST wire
      T007 allow/deny into the actual register/export (or SpanProcessor) boundary** so
      automatic Next request spans cannot bypass filtering—helper-only unit tests do not
      satisfy FR-009 / SC-007

**Checkpoint**: Config + attributes + register helper are unit-tested and importable;
`instrumentation.ts` still only boots Effect runtime until US1.

---

## Phase 3: User Story 1 — Next request spans with clear attributes (Priority: P1) 🎯 MVP

**Goal**: Next serves `GET /api/health` (200) and `GET /api/health/error` (500) on
`http://127.0.0.1:3000`, and when traces are enabled exports a request-scoped span with
the required semantic attributes via OTLP.

**Independent Test**: Enable traces with a valid OTLP endpoint; `curl`
`http://127.0.0.1:3000/api/health` and `/api/health/error`; confirm request spans with
method, route, and status facts at the collector (or later Grafana in US2).

### Tests for User Story 1

> Write these FIRST; ensure they FAIL before wiring.

- [x] T009 [P] [US1] Add failing unit tests in
      `packages/frontend/tests/unit/api-health.test.ts` asserting `/api/health` → 200 and
      `/api/health/error` → 500 behavior of the demo Route Handlers once implemented (no
      real collector required)
- [x] T010 [P] [US1] Add failing host-boundary tests in
      `packages/frontend/tests/unit/observability-register-host.test.ts` that exercise the
      register/helper path used by `instrumentation.ts`: production refuse-to-start vs
      local fail-soft when enabled+invalid endpoint, including clear diagnostic behavior
      that never exposes `OTEL_EXPORTER_OTLP_HEADERS` values (must not be satisfied by
      T004 parser tests alone)
- [x] T010a [US1] Add failing producer-boundary tests (same file or
      `packages/frontend/tests/unit/observability-span-sanitization.test.ts`) that capture an
      **emitted** span (test SpanProcessor / exporter fixture—not the isolated T006/T007
      helper alone) and assert required method/route/status facts are present and prohibited
      attributes (e.g. Authorization) are absent after the register/export pipeline runs

### Implementation for User Story 1

- [x] T011 [US1] Implement demo Route Handlers:
      `packages/frontend/src/app/api/health/route.ts` (`GET` → 200) and
      `packages/frontend/src/app/api/health/error/route.ts` (`GET` → 500)
- [x] T012 [US1] Update `packages/frontend/src/instrumentation.ts` so Node runtime
      `register()`: applies observability config / startup policy from T005–T008; registers
      OTEL when enabled+valid; keeps existing Effect runtime import; skips OTEL during
      production build phase as needed; keeps modules import-safe where required by tests
- [x] T013 [US1] Document env vars in `packages/frontend/.env.example` (or extend existing
      env example): `OTEL_TRACES_ENABLED` (default off), `OTEL_EXPORTER_OTLP_ENDPOINT`,
      `OTEL_SERVICE_NAME`, optional `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_SDK_DISABLED`
- [x] T014 [US1] Make T009–T010–T010a pass; run
      `pnpm --filter @pathableai/pre-ets-frontend test:unit` and fix regressions
- [x] T015 [US1] Manually smoke (or script) disabled-by-default start + enabled export
      against a temporary OTLP listener or US2 stack; confirm SC-003 verification set
      produces spans (`build` before `start` on clean checkout)

**Checkpoint**: MVP — Next emits request spans with required attributes; traces off by
default.

---

## Phase 4: User Story 2 — Optional local Grafana stack (Priority: P1)

**Goal**: Compose profile `observability` runs pinned `grafana/otel-lgtm:0.35.0` as
service `otel-lgtm` on loopback ports 3300/4317/4318; default Compose path unchanged;
docs explain opt-in/opt-out with service-targeted stop.

**Independent Test**: `docker compose up -d --wait redis keycloak` has no LGTM; then
`docker compose --profile observability up -d --wait`; point Next at
`http://127.0.0.1:4318`; `GET /api/health`; find span in Grafana at
`http://127.0.0.1:3300` within ~30s.

- [x] T016 [P] [US2] Add `otel-lgtm` service to root `compose.yaml` using image
      **`grafana/otel-lgtm:0.35.0`** (prefer digest pin if available at implement time),
      Compose profile **`observability`**, loopback publishes `127.0.0.1:3300:3000`,
      `127.0.0.1:4317:4317`, `127.0.0.1:4318:4318`, and a healthcheck/`--wait`-friendly
      readiness so default `docker compose up` without the profile does **not** start it.
      Set anonymous org role to **Viewer** for least-privilege MCP reads (e.g.
      `GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer`); do not leave anonymous Admin as the default
      MCP path (see `contracts/grafana-mcp.md`)
- [x] T017 [P] [US2] Extend `docs/docker-compose.md` with optional observability profile:
      start; **stop only** via `docker compose --profile observability stop otel-lgtm`
      (never bare profile stop); ports; Grafana URL; OTLP endpoint; ~30s span visibility;
      port conflict notes (3300 vs Next 3000; Keycloak 8080 unchanged)
- [x] T018 [US2] Verify end-to-end with US1 Next server: opt-in stack → enable
      `OTEL_TRACES_ENABLED` + endpoint → `GET /api/health` → locate span in Grafana
      Explore/Tempo; stop `otel-lgtm` while Redis/Keycloak remain; confirm best-effort when
      collector down **and** that export failure is visible in diagnostics (SC-005)

**Checkpoint**: Optional local Grafana works for viewing Next request spans.

---

## Phase 5: User Story 3 — Deployed OTLP export without vendor lock-in (Priority: P2)

**Goal**: Same instrumentation; operators configure any OTLP-compatible endpoint +
headers; production refuse-to-start on enabled+invalid config documented and tested at
the host boundary.

**Independent Test**: Point `OTEL_EXPORTER_OTLP_ENDPOINT` at a second OTLP/HTTP target
with a synthetic header; span arrives **and** header is asserted; production-mode
invalid config refuses start.

- [x] T019 [P] [US3] Extend host-boundary coverage in
      `packages/frontend/tests/unit/observability-register-host.test.ts` (or adjacent) so
      production refuse-to-start vs local fail-soft diagnostics remain locked to the
      register path used by `instrumentation.ts` (complements T004/T010; do not rely on
      parser-only evidence)
- [x] T020 [US3] **Create** `docs/observability.md` (sole creator of this file)
      documenting deployed configuration: vendor-agnostic OTLP/HTTP; env vars and
      precedence (`contracts/otlp-export.md`); **headers for auth**; no mandated SaaS;
      production vs local startup policy; sampling note (local 100%; production sampling
      deferred); alerting/SLOs out of scope; leave clear stubs/headings for MCP (US4) and
      traces-only polish (T025)
- [x] T021 [US3] **Verify SC-004 live**: retarget `OTEL_EXPORTER_OTLP_ENDPOINT` to a
      second OTLP/HTTP endpoint (second listener or second collector — not only Grafana),
      set `OTEL_EXPORTER_OTLP_HEADERS` to a synthetic value, send `GET /api/health`, and
      confirm the request span **arrives at that second endpoint with the synthetic
      header present**; then document the verified switch steps in
      `specs/006-otel-observability/quickstart.md` section 5 and `docs/observability.md`.
      Done requires the live second-endpoint **and** header proof, not a docs note alone.

**Checkpoint**: Deployed export path is documented; startup policy and headers verified.

---

## Phase 6: User Story 4 — Grafana MCP for agents (Priority: P3)

**Goal**: Docs enable connecting **`mcp-grafana==2.0.0`** to local Grafana
(`127.0.0.1:3300`) with the verified auth path for `otel-lgtm:0.35.0`.

**Independent Test**: Follow docs against running observability profile; MCP client
connects and completes one documented read (datasource list or Tempo search for
`pre-ets-frontend`) on the first attempt. Live success is required for SC-006.

- [x] T022 [US4] **Depends on T020**. Add MCP section to existing `docs/observability.md`
      (and align `contracts/grafana-mcp.md`): prerequisites (profile running);
      `GRAFANA_URL=http://127.0.0.1:3300`; verified auth for `0.35.0` — **primary**
      anonymous org role **Viewer** (Compose override; least privilege for MCP reads) or a
      read-only service account token; `admin`/`admin` and anonymous **Admin** only as
      explicit troubleshooting fallbacks (not the documented MCP default); example
      **`uvx mcp-grafana==2.0.0`** / Cursor MCP config (no unversioned package); one concrete
      agent read/query example; explicit “does not work without optional stack”; include a
      **human verification checklist** for the live MCP read (commands + expected outcome)
      used when CI cannot run MCP
- [x] T023 [US4] **SC-006 acceptance evidence (mandatory live MCP)**: Against a running
      local Grafana stack, connect an MCP client per docs (pinned version) and complete at
      least one documented read/query against local trace data on the **first attempt**.
      Record commands + outcome as PR/acceptance evidence. If CI cannot run MCP, the human
      verification checklist from T022 **MUST** be completed by a human before merge
      (docs-only command lists without a live success are **not** a substitute for SC-006).

**Checkpoint**: MCP docs satisfy FR-011 / SC-006.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Cross-links, README pointer, quality gates, quickstart pass.

- [x] T024 [P] Add a brief pointer in root `README.md` to `docs/observability.md` /
      Compose observability profile (keep README short; details stay in docs)
- [x] T025 [US4/Polish] **Depends on T020** (and preferably T022 for MCP section
      presence). Ensure `docs/observability.md` states traces-only Next-server scope,
      required semantic attributes, demo routes (`/api/health`, `/api/health/error`),
      default URL `http://127.0.0.1:3000`, and how to find a known span end-to-end
      (FR-013). Do not recreate the file — edit the T020-owned doc.
- [x] T026 Run repository quality gates and fix issues introduced by this feature:
      `pnpm --filter @pathableai/pre-ets-frontend test:unit`, then root `pnpm typecheck`,
      `pnpm build`, `pnpm lint`, `pnpm format:check`, and `pnpm check:unused`
- [x] T027 Execute `specs/006-otel-observability/quickstart.md` sections 0–6 and confirm
      SC-001–SC-008 evidence for the PR. **SC-004 Done**: second OTLP/HTTP endpoint
      actually received the span **with configured headers**. **SC-005 Done**: request
      still served **and** export failure visible in diagnostics. **SC-006 Done**: live MCP
      first-attempt read evidence (or completed human checklist from T023 before merge).
      **SC-007 Done**: producer-boundary sanitization tests green (T010a). Leave `otel-lgtm`
      running through quickstart sections 2–3 before any collector stop.
      Environment-specific skips allowed only when the checklist still records live
      verification elsewhere.

**Checkpoint**: Feature ready for review / `/speckit-implement`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: Depends on Foundational — **MVP**
- **US2 (Phase 4)**: Depends on Foundational; E2E verification (T018) depends on US1 export
- **US3 (Phase 5)**: Depends on Foundational config/policy; T020 creates
  `docs/observability.md`; T021 live SC-004 after US1 export works; docs parallel US2 after T005
- **US4 (Phase 6)**: T022 depends on T020; live MCP smoke (T023) depends on US2 stack; docs
  draft starts after T020 exists and T016 ports are known
- **Polish (Phase 7)**: T025 depends on T020; full feature through US4 before T027

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependency on US2–US4
- **US2 (P1)**: Compose service independent of US1 code; span-in-Grafana proof needs US1
- **US3 (P2)**: Uses same US1 instrumentation; primarily docs + host-boundary tests + live
  SC-004 second-endpoint **and** header proof (T021)
- **US4 (P3)**: Docs + MCP; T022 after T020; live verify (T023) needs US2

### Parallel Opportunities

- T001–T002 in parallel during Setup; T003 after install
- T004–T005 sequential; T006 then T007 (T007 depends on T006 — **not** marked `[P]`);
  T008 after T005 **and** T007 (wires attribute filtering into register/export boundary)
- T009–T010 parallel after Foundational; T010a after T008 (producer-boundary sanitization)
- T016–T017 parallel once ports locked; T018 after US1 + T016
- T019 parallel with T020; T021 after T020 (and US1 export); T022 after T020 (not parallel
  with first create of `docs/observability.md`); T025 after T020

---

## Parallel Example: User Story 1

```bash
# After Foundational completes, launch US1 tests together:
Task: "T009 failing api-health tests in packages/frontend/tests/unit/api-health.test.ts"
Task: "T010 failing host-boundary tests in packages/frontend/tests/unit/observability-register-host.test.ts"

# Then implement routes + instrumentation (sequential):
Task: "T011 demo Route Handlers under packages/frontend/src/app/api/health/"
Task: "T012 update packages/frontend/src/instrumentation.ts"
```

---

## Parallel Example: User Story 2

```bash
Task: "T016 observability profile in compose.yaml"
Task: "T017 docs in docs/docker-compose.md"
# Then T018 E2E against US1 Next server
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
4. US3 → deployed docs + production policy + headers proof
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
- Registration path is **`@vercel/otel`** (or documented NodeSDK fallback); do **not**
  add Effect `OtlpTracer` in this feature
- Do not put Next.js or Effect app processes inside Compose
- Do not modify `packages/backend`
- Traces only — no metrics/logs/RUM/backend-package instrumentation in this feature
- Commit after each task or logical group; run frontend unit tests before pushing
