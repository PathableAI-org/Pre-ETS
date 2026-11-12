---
description: "Task list for browser tracing for the verification harness"
---

# Tasks: Browser Tracing for the Verification Harness

**Input**: Design documents from `specs/370-browser-tracing/`: [spec.md](spec.md), [verification.md](verification.md),
[plan.md](plan.md), [research.md](research.md), [contracts/modules.md](contracts/modules.md),
[contracts/telemetry.md](contracts/telemetry.md), [quickstart.md](quickstart.md)

**Tests**: Only the durable evidence `verification.md` and `contracts/modules.md` require: the V-007 configuration
examples and property, and one coordination parse example. Every span, attribute, and filter result is observed by
the verification agent and is never asserted by a durable test (spec L1).

**Organization**: Tasks are grouped by the implementation slices in [plan.md](plan.md#phase-7--implementation-slices),
in slice order. Story labels map to the user stories in [spec.md](spec.md): US1 correlate a transition with its
request, US2 off unless both switches are on, US3 no forbidden data, US4 document-navigation continuity, US5 harness
facts, US6 direct export to a local collector.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: The user story the task serves

---

## Slice `config` — branch `370-browser-tracing-impl`

**Decision**: The server decides browser tracing from its own settings, refuses a credential-bearing endpoint when the
switch is on, and renders exactly four values and the document's trace context into protected documents, and nothing
when off.

**Claims**: V-007, V-009 in full; V-004 (document carries server context) and V-008 (document has nothing when off) in
part. **Telemetry**: T-008. **Planned hand-written files**: 12.

### Baseline

- [ ] T001 Inspect the installed declarations the slice relies on: `Config.Boolean`, `Config.withDefault`,
      `Config.option`, `Config.mapEffect`, `Context.Service`, `Layer.effect`, `Effect.logWarning` in
      `packages/frontend-services/node_modules/effect`; `context.active`, `propagation.inject` in
      `@opentelemetry/api` 1.9.1; React 19 `<meta>` hoisting. Run `fallow guard` on every file the slice creates or
      changes in both workspaces and record the zones (plan Phase 4, contracts/modules.md "Cross-module dependency
      direction").

### Settings: switch, run identifier, and safe endpoint (US2, US3)

- [ ] T002 [US2] Move `withoutEcho` from `packages/frontend-services/src/config/authentication.ts` to
      `packages/frontend-services/src/config.ts`; turn `AuthenticationConfig` into `authenticationConfig(withoutEcho)` and
      `OtelConfig` into `otelConfig(withoutEcho)`, so no child imports a sibling (research D15, contracts/modules.md
      "Inputs and validation ownership").
- [ ] T003 [US2] In `packages/frontend-services/src/config/otel.ts`, decode `OTEL_EXPORTER_OTLP_ENDPOINT` through
      `withoutEcho` (failure text `OTEL_EXPORTER_OTLP_ENDPOINT is invalid`, never the input); add
      `BROWSER_TRACING_ENABLED` as `Config.withDefault(Config.Boolean(...), false)` (an unrecognized value fails
      startup, research D1); read `OTEL_RESOURCE_ATTRIBUTES` optionally and extract only a percent-decoded
      `service.instance.id`, with a malformed list yielding none (research D2); add `BrowserTracingSettings` and the
      required `OtelEnabled.browserTracing: BrowserTracingSettings | undefined`, built only in the enabled branch when the
      switch is true. With the switch on, an endpoint with username, password, query, or fragment fails with exactly
      `BROWSER_TRACING_ENABLED requires an OTEL_EXPORTER_OTLP_ENDPOINT without credentials, query, or fragment`
      (research D15). Re-export `BrowserTracingSettings` from `src/config.ts`.
- [ ] T004 [US2] Add the V-007 and V-009 decoding evidence to `packages/frontend-services/tests/lib/config.test.ts`
      through `StartupConfig` only: examples for OTEL on/off × switch unset/`true`/`false`/unrecognized; an
      `it.effect.prop` property that `browserTracing` is defined iff OTEL is enabled and the switch decodes to true; the
      settings value with headers and `OTEL_RESOURCE_ATTRIBUTES` set (no headers in it); a malformed attribute list
      (no instance ID, startup succeeds); a malformed credential-bearing endpoint, switch on and off, failing without any
      of the input; `user:secret@`, `?api_key=`, and `#x` endpoints failing with the fixed message and none of the URL
      with the switch on, and succeeding with it off (contracts/modules.md "Contract evidence").

### Request-time service and document adapter (US2, US4)

- [ ] T005 [US2] Add the `BrowserTracing` `Context.Service` and `BrowserTracing.layer(otel)` to
      `packages/frontend-services/src/observability.ts`: settings are `otel.browserTracing` when enabled, otherwise
      `undefined`; when settings exist and `otel.headers` is non-empty, log `Browser tracing exports without collector
      headers` once at warning level with no header names or values (T-008, research D10).
- [ ] T006 [US2] Add `BrowserTracing` to `ApplicationServices` and merge `BrowserTracing.layer(startup.otel)` in
      `applicationLayer` in `packages/frontend-services/src/runtime.ts`.
- [ ] T007 [US4] Create `packages/frontend-services/src/next/browser-tracing.ts` with `BrowserTracingConfig`,
      `BrowserTracingDocument`, and `readBrowserTracing(): Promise<BrowserTracingDocument | undefined>`: capture
      `context.active()` and inject it with `propagation.inject` before any `await`; read `BrowserTracing` through
      `Runtime.runPromise`; return exactly the four values with the endpoint as an absolute base URL with trailing slash;
      map `StartupNotReady` and every rejection to `undefined` (research D3, FR-003, FR-005, FR-009).
- [ ] T008 [US4] Export `readBrowserTracing`, `BrowserTracingConfig`, and `BrowserTracingDocument` from
      `packages/frontend-services/src/next.ts` and re-export them from `packages/frontend-services/src/index.ts`.

### Protected document rendering (US2, US4)

- [ ] T009 [US4] Create `packages/frontend/src/shared/browser-tracing.ts` exporting only
      `BrowserTracingMeta(props: { readonly document: BrowserTracingDocument | undefined }): ReactNode`, which renders
      `<meta name="traceparent">` (only when a traceparent exists) and `<meta name="preets-browser-tracing">` with a JSON
      `content` of the four values, or nothing (contracts/modules.md facade contract; `startBrowserTracing` and the
      recorders arrive with their consumers in later slices).
- [ ] T010 [US4] In `packages/frontend/src/app/(app)/layout.tsx`, start `readBrowserTracing()` before
      `readRequestSession()`, await both, and render `<BrowserTracingMeta document={…} />` beside `SessionCoordinator`
      (plan Phase 4 "Layout").

### Documentation (US2, US6)

- [ ] T011 [US2] Add the browser tracing switch section to `docs/observability.md`: `BROWSER_TRACING_ENABLED`, its
      default and dependency on server OTEL, refusal of unrecognized values, the four rendered values, the credential-,
      query-, and fragment-free endpoint requirement, no collector headers to the page and the T-008 warning, protected
      documents only (PL-3), and the assumption that browser tracing is never active in production (FR-022, FR-023 in
      part, research D14).

### Slice completion

- [ ] T012 Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, the affected `test:unit` and frontend-services `test`,
      `pnpm format:check`, `pnpm check:unused`, `pnpm check:health`, and `pnpm check:changes`; commit as explicit
      Conventional Commits; push with `gh stack push` and open the draft with `gh stack submit --auto`.
- [ ] T013 Request verification from the verification session with the branch, pushed SHA, slice `config`, claims
      V-007 and V-009 (full) and V-004 and V-008 (part), and [quickstart.md](quickstart.md) steps 2 (document only) and 3
      (verification-harness.md "Request").
- [ ] T014 Address the report, repeat verification as needed, and record the summary under
      [quickstart.md execution results](quickstart.md#execution-results) as an evidence-only commit; name the verified SHA
      in the pull request body.

---

## Slice `export` — branch `370-browser-tracing-impl-export`

**Claims**: V-002, V-003, V-004, V-005, V-006, V-008, V-010, V-011, V-012; partial V-016. **Telemetry**: T-001, T-002,
T-003.

- [ ] T015 Add the `opentelemetry` catalog to `pnpm-workspace.yaml`, point `packages/frontend-services/package.json` at
      it, and add the browser packages to `packages/frontend/package.json` within the `@effect/opentelemetry` peer ranges
      (research D12); update `pnpm-lock.yaml` and the caps in `renovate.json`.
- [ ] T016 Add the approved `src/instrumentation-client.ts` entry to `packages/frontend/.fallowrc.json`
      `allowUnmatched` (plan Review note 1).
- [ ] T017 [US6] Create `packages/frontend/src/shared/browser-tracing/export-filter.ts`, the allow-list `SpanExporter`
      wrapper (research D9; FR-019–FR-021a).
- [ ] T018 [US1] Create `packages/frontend/src/shared/browser-tracing/sdk.ts`: `WebTracerProvider`,
      `BatchSpanProcessor` over the filtered `OTLPTraceExporter` (no headers), `FetchInstrumentation` (same-origin only,
      collector ignored) and `DocumentLoadInstrumentation` (T-001–T-003), and the `started` marker (research D4–D7, D10).
- [ ] T019 [US1] Add `startBrowserTracing` to `packages/frontend/src/shared/browser-tracing.ts` and create
      `packages/frontend/src/instrumentation-client.ts` (research D4, D13).
- [ ] T020 [US1] Add the App Router navigation button to
      `packages/frontend/src/features/coordination-fixtures/roster.tsx` (research D17).
- [ ] T021 [P] [US6] Document export, CORS, and signals T-001–T-003 in `docs/observability.md`, and the collector CORS
      default in `docs/docker-compose.md` (research D11, D14).
- [ ] T022 Run checks, push, request verification for quickstart steps 2, 4 (export and filters only), 5, 6, 8, 9, record results in
      `quickstart.md`.

---

## Slice `facts` — branch `370-browser-tracing-impl-facts`

**Claims**: V-001, V-013, V-014, V-015, V-016, V-017 (closes #368). **Telemetry**: T-004–T-007, T-009–T-011.

- [ ] T023 [US5] Create `packages/frontend/src/shared/browser-tracing/facts.ts` and add the recorders, buffer, closed
      sets, `moveFocus`, `focusTargetProps`, `withdrawSubmitCause`, and `onRouterTransitionStart` to the facade
      (contracts/modules.md; research D8, D16).
- [ ] T024 [US1] Add buffer replay and the cause wrapper to `browser-tracing/sdk.ts` and re-export
      `onRouterTransitionStart` from `instrumentation-client.ts` (research D4, D16).
- [ ] T025 [US5] Record transitions, sends, receipts, and focus in `tab-coordination.ts`, `tab-channel.ts`,
      `signed-out-notice.tsx`, `logout-control.tsx`, and `coordination-fixtures/participant.tsx`.
- [ ] T026 [US5] Add the `telemetryId` parse example to `packages/frontend/tests/unit/session-coordination.test.ts`.
- [ ] T027 [P] [US5] Document signals T-004–T-011 and queries in `docs/observability.md`, and the browser channel and
      Known limits in `docs/engineering/verification-harness.md`.
- [ ] T028 Run checks, push, request verification for quickstart steps 4, 7, 7b, 8, 10, record results in
      `quickstart.md`; only this pull request may say `Closes #368`.

---

## Dependencies and execution order

- Slices run in order: `config` → `export` → `facts`. `export` consumes the meta contract `config` renders; `facts`
  consumes the SDK module `export` adds.
- Within `config`: T002 → T003 → T004; T005 needs T003; T006 needs T005; T007 needs T006; T008 needs T007; T009 needs
  T008 (types); T010 needs T008 and T009. T011 can run beside T005–T010.
- No `config` task is parallel with another code task: each consumes the previous public contract.

## Traceability for slice `config`

| Item                  | Tasks            | Evidence                                                             |
| --------------------- | ---------------- | -------------------------------------------------------------------- |
| V-007                 | T003, T004       | Module test (`tests/lib/config.test.ts`)                             |
| V-009                 | T003, T007, T009 | Module test (decoding); quickstart step 3 (rendered document)        |
| V-004 (part)          | T007, T009, T010 | Quickstart step 3: `meta[name="traceparent"]` names the server trace |
| V-008 (part)          | T003, T007, T010 | Quickstart step 2, document only                                     |
| T-008                 | T005             | Quickstart step 3 startup log                                        |
| FR-022, FR-023 (part) | T011             | Review                                                               |

Approved limitations that apply to this slice: PL-3 (only protected documents render configuration). Until slice
`export`, the meta elements are inert (plan "Order and independence").
