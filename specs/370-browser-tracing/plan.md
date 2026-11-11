# Implementation Plan: Browser Tracing for the Verification Harness

**Branch**: `370-browser-tracing-plan` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature contract in `specs/370-browser-tracing/spec.md` and `specs/370-browser-tracing/verification.md`
at spec commit `134ad80`;
delivery issue [#368](https://github.com/PathableAI-org/Pre-ETS/issues/368), with the maintainer decisions of
2026-11-11 recorded in the specification

## Summary

Add a `BROWSER_TRACING_ENABLED` setting to the frontend process's `StartupConfig`. It is off by default, and it takes
effect only when server OTEL is enabled. When it is effective, the protected `(app)` layout renders two `<meta>`
elements: the W3C `traceparent` of the server's handling of the document, and the four browser values (collector
endpoint, service name, revision, run identifier). A Next `instrumentation-client.ts` calls one shared facade. With no
meta element it does nothing. With one it lazily loads the OpenTelemetry web SDK. The SDK continues the rendered trace
with a `documentLoad` record, propagates `traceparent` to same-origin `fetch` only, and exports OTLP/HTTP JSON straight
to the collector with no headers. Every span passes an allow-list export filter that keeps closed-set attributes and
`url.path` only.

The session-coordination feature records harness facts through the facade: UI state transitions, cross-tab sends and
receipts, and focus moves (including the coordination fixture's programmatic focus). Each send carries a UUID
generated only for telemetry in one telemetry-only message field, and its receipts record the same ID. That matches a
send to its receipts without reading message contents. Facts recorded before the lazily loaded SDK registers are
buffered and replayed. Form submits and router transitions are recorded and become the causal parents of the Server
Action and RSC requests they cause, so every request kind correlates with its UI transition (SC-001). With the switch
on, a collector endpoint that has URL credentials fails startup, so it is never rendered. The
local `otel-lgtm` collector already accepts `http://*` origins, so no Compose change is needed. The documentation
records the switch, direct header-free export, CORS, the browser signals, and the assumption that browser tracing is
never active in production. No relay route, backend change, or Effect code in `packages/frontend` is added.

## Technical Context

**Language/Version**: TypeScript 6.0.3 on Node.js 26+; browser code targets current evergreen browsers

**Primary Dependencies**: Next.js 16.4.5 App Router (`instrumentation-client.ts`), React 19.3.1 (hoisted `<meta>`),
Effect 4.1.2 in frontend-services only, `@opentelemetry/api` 1.9.1. New in `packages/frontend`:
`@opentelemetry/sdk-trace-web` 2.12.0, `sdk-trace-base` 2.12.0, `resources` 2.12.0, `instrumentation` 0.223.0,
`instrumentation-fetch` 0.223.0, `instrumentation-document-load` 0.68.0, and `exporter-trace-otlp-http` 0.223.0
([research D12](research.md#d12--package-versions-and-the-open-opentelemetry-update))

**Storage**: N/A. No stored state. The cross-tab message object gains one optional telemetry-only field while tracing
is on

**Testing**: frontend-services Vitest with `@effect/vitest` and `@fast-check/vitest` (config decoding); frontend
Vitest (coordination message parsing); the verification agent's Playwright and Grafana MCP procedure in
[quickstart.md](quickstart.md). There are no durable telemetry assertions (spec L1)

**Target Platform**: Local `next start` against the `otel-lgtm` Compose profile. Never staging or production (spec
L3, FR-022)

**Project Type**: Existing pnpm monorepo web application. Settings and host adapter in `packages/frontend-services`;
presentation, client entry, and facade in `packages/frontend`

**Performance Goals**: No user-visible cost when off: no tracing chunk, no collector request, and no added header.
When on, batch export uses the SDK default delay, which the documentation states as about 30 seconds

**Constraints**: Closed-set attributes only; no query, fragment, free text, message contents, header, cookie, or
token in telemetry; `traceparent` only on same-origin requests; the browser never receives collector headers;
telemetry failure never changes the page

**Scale/Scope**: Two workspaces, one new shared frontend module with three private children, one new Next
convention file, three existing session-coordination files changed, and three documents

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                             | Gate                                                                            | Result                                                                                                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Evidence-grounded specification    | Plan consumes the approved spec and verification plan; closed sets defined once | Pass. The closed sets are in [telemetry.md](contracts/telemetry.md). The authority (issue #368 alone, spec Authority finding 1) is unchanged. Two discoveries are listed in Review notes, not encoded as decisions that change acceptance. |
| II. Explicit ownership                | Settings in frontend-services, presentation in the Next app, no backend change  | Pass. Decoding stays in `src/config/`. The request-time value comes from a frontend-services service. The Next app renders it and owns browser code. There is no `effect` import in `packages/frontend`.                                   |
| III. Tenant isolation                 | No tenant, session, or cookie behavior changes                                  | Pass. No tenant value is emitted or rendered. Export sends no cookies cross-origin (research D10).                                                                                                                                         |
| IV. Accessible, server-rendered UI    | Client code limited to what needs the browser, reason recorded                  | Pass. Tracing must run in the browser. The only visible-behavior touch is focus, and the signed-out heading still receives focus through `moveFocus`, which calls `focus()` unchanged. No `@pathableai/react` usage changes.               |
| V. Meaningful behavioral tests        | Tests protect a named rule; telemetry observed, not asserted                    | Pass. V-007 is a config-decoding test with a property. Coordination parsing gains one example. Everything else is verification-agent evidence.                                                                                             |
| VI. Simplicity and verifiable quality | No speculative abstraction; Fallow zones respected                              | Pass, with one human decision: `src/instrumentation-client.ts` needs the same coverage exemption as `src/instrumentation.ts` (Review notes).                                                                                               |

Post-design re-check: unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/370-browser-tracing/
├── spec.md               # approved specification (spec PR)
├── verification.md       # approved verification plan (spec PR)
├── checklists/requirements.md
├── plan.md               # this file
├── research.md
├── quickstart.md
└── contracts/
    ├── modules.md
    └── telemetry.md
```

No `data-model.md`: the feature stores nothing, and its closed sets live in the telemetry contract.

### Source Code (repository root)

```text
packages/frontend-services/
├── src/config.ts                     # re-export BrowserTracingSettings
├── src/config/otel.ts                # BROWSER_TRACING_ENABLED, service.instance.id, effective rule
├── src/observability.ts              # BrowserTracing service and layer, header warning
├── src/runtime.ts                    # ApplicationServices + BrowserTracing
├── src/next.ts                       # export readBrowserTracing
├── src/next/browser-tracing.ts       # NEW: readBrowserTracing
├── src/index.ts                      # re-export readBrowserTracing and types
└── tests/lib/config.test.ts          # V-007 examples and property

packages/frontend/
├── package.json                      # browser OpenTelemetry dependencies
├── .fallowrc.json                    # coverage exemption for instrumentation-client.ts (human approval)
├── src/instrumentation-client.ts     # NEW: startBrowserTracing(), re-export onRouterTransitionStart
├── src/app/(app)/layout.tsx          # render BrowserTracingMeta
├── src/shared/browser-tracing.ts     # NEW: facade (meta contract, start, recorders, closed sets)
├── src/shared/browser-tracing/
│   ├── sdk.ts                        # NEW, lazy: provider, exporter, fetch and document-load, focus listener
│   ├── export-filter.ts              # NEW: allow-list SpanExporter wrapper
│   └── facts.ts                      # NEW: span recorders over @opentelemetry/api
├── src/features/session-coordination/
│   ├── tab-coordination.ts           # record transitions; logout and confirm inside scope
│   ├── tab-channel.ts                # record send/receipt; carry and read `telemetryId`
│   ├── signed-out-notice.tsx         # moveFocus + focusTargetProps
│   └── logout-control.tsx            # focusTargetProps
├── src/features/coordination-fixtures/participant.tsx  # "Focus later" through moveFocus
└── tests/unit/session-coordination.test.ts  # message with `telemetryId` still accepted

renovate.json                         # caps for instrumentation-fetch and document-load
docs/observability.md
docs/docker-compose.md
docs/engineering/verification-harness.md
```

**Structure Decision**: Existing workspaces and owners. The facade is in the frontend `shared` zone because
`features/session-coordination` may import only `shared` and `server` besides itself (`fallow guard`, research). The
lazy SDK module is a private child of the facade, loaded with a dynamic `import()` by its parent only.

## Complexity Tracking

| Violation                                                                         | Why Needed                                                                                            | Simpler Alternative Rejected Because                                                                                                                         |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `allowUnmatched` entry for `src/instrumentation-client.ts` (needs human approval) | Next requires the file at `src/` root, where no Bulletproof zone matches, and `requireAllFiles` is on | `instrumentationClientInject` pointing into `src/shared` is documented for config plugins, not applications, and leaves no file Fallow can treat as an entry |

## Phased Engineering Design

### Phase 1 — Module architecture

See [contracts/modules.md](contracts/modules.md#module-architecture-decisions). In short:

- **Extend** frontend-services settings (`OtelEnabled.browserTracing`), the observability service module
  (`BrowserTracing`), the runtime composition, and the Next host-adapter module (`readBrowserTracing`).
- **Add** one shared frontend module, `shared/browser-tracing.ts`, with private `sdk.ts` (lazy), `export-filter.ts`,
  and `facts.ts`, plus the Next `instrumentation-client.ts` convention file.
- **Extend behavior privately** in `features/session-coordination`; its public entry is unchanged.
- **Preserve** `compose.yaml`, `RestoredPageGuard`, the server HTTP instrumentation, and every server span. The server
  already continues incoming `traceparent` on every Next request kind.

No new package, workspace, relay route, provider interface, or Effect code in the Next app.

### Phase 2 — Public module contracts

See [contracts/modules.md](contracts/modules.md#public-contracts). Compatibility-sensitive decisions:

- `OtelEnabled` gains a required `browserTracing` field. Every existing construction site is in `config/otel.ts`.
  Tests that build `OtelSettings` by hand add `browserTracing: undefined`.
- `readBrowserTracing` never rejects. A runtime that is not ready, or any failure, renders no tracing.
- The `<meta name="preets-browser-tracing">` content is the only server-to-browser contract. It is owned by the shared
  facade, which both renders it (`BrowserTracingMeta`) and parses it (`startBrowserTracing`).
- The cross-tab message gains an optional `telemetryId` field while tracing runs. Parsing ignores it, so mixed tabs (one on,
  one off) still coordinate.

### Phase 3 — Module contract evidence

See [contracts/modules.md](contracts/modules.md#contract-evidence).

- Durable: the frontend-services config tests cover the switch truth table, unrecognized values, the instance-ID
  extraction, and a Fast-Check property that browser settings exist if and only if OTEL and the switch are on (V-007).
  One coordination example shows a message with `telemetryId` is still accepted.
- Feature (browser interaction): rendered configuration contents (V-009), absence when off (V-008), and unchanged
  outcomes when the collector is down (V-012).
- Not durable: every span, attribute, and filter result. The verification agent observes them (spec L1).

### Phase 4 — Implementation architecture

- **Settings** ([research D1, D2, D15](research.md#d1--switch-name-decoding-and-effective-rule)): `config/otel.ts`
  adds `Config.withDefault(Config.Boolean("BROWSER_TRACING_ENABLED"), false)` and an optional
  `OTEL_RESOURCE_ATTRIBUTES` string. `parseRawConfig` builds `browserTracing` only in the enabled branch. When the
  switch is on and the endpoint has a username or password, it fails with a fixed message that does not echo the URL.
- **Service**: `BrowserTracing.layer(otel)` is `Layer.effect`. It logs the header warning once when settings exist and
  `headers` is non-empty, then succeeds with `{ settings }`. `applicationLayer` merges it beside the observability
  layer.
- **Adapter** ([D3](research.md#d3--how-the-server-renders-configuration-and-trace-context)):
  `next/browser-tracing.ts` captures `context.active()` and injects it into a carrier with `propagation.inject` before
  any `await`. It then reads `BrowserTracing` through `Runtime.runPromise` and maps any rejection to `undefined`.
- **Layout**: `(app)/layout.tsx` starts `readBrowserTracing()` before `readRequestSession()`, awaits both, and renders
  `<BrowserTracingMeta document={…} />` beside `SessionCoordinator`. It renders it even when it redirects, which emits
  nothing. React 19 hoists the `<meta>` elements into `<head>`.
- **Client start** ([D4](research.md#d4--tracing-code-is-not-downloaded-when-off)): `instrumentation-client.ts` calls
  `startBrowserTracing()` and re-exports `onRouterTransitionStart`. That function parses the meta element. If it is
  absent or invalid, nothing happens. If it is valid, the facade enters `pending`: it installs the capture-phase
  `focusin`, `focusout`, and `submit` listeners, and recorders buffer facts (at most 256 stored, the rest counted; `pending` ends after 10 seconds). Then
  `import("./browser-tracing/sdk.ts")` runs, and `start(config, traceparentPresent)` registers a
  `WebTracerProvider` with a `BatchSpanProcessor` over `filterExport(new OTLPTraceExporter({ url }))`. It then registers
  `FetchInstrumentation` (`ignoreUrls: [traceUrl]`, `applyCustomAttributesOnSpan` sets `preets.outcome`) and
  `DocumentLoadInstrumentation` (`ignorePerformancePaintEvents`, outcome hooks). It wraps `window.fetch` with the
  cause wrapper (research D16), replays the buffer with the original start times (plus a `BrowserTracing.buffer` overflow record when facts were dropped), and sets
  `data-preets-browser-tracing="started"`. A load failure returns the facade to `off` and drops the buffer. Every step is inside `try`. A failure leaves the page untouched.
- **Context** ([D5](research.md#d5--context-manager-and-its-async-limits)): `StackContextManager`.
  `TraceScope.run(task)` is `context.with(trace.setSpan(context.active(), span), task)`.
- **Harness facts**: `facts.ts` holds the recorders. Each one starts a zero-duration span with the closed-set
  attributes and `preets.outcome`, then ends it. A send generates its `telemetryId` with `crypto.randomUUID()`, and a
  receipt records the carried ID when it is a UUID. Submit and router records replace the single pending cause for their request kind, which the cause wrapper claims once. `TabCoordination` keeps the last `UiState` and records only when it changes. Its first publish records
  `mounted → …`.
- **Export filter** ([D9](research.md#d9--forbidden-data-enforcement-at-export)): a `SpanExporter` wrapper. It maps
  each `ReadableSpan` to a copy with filtered attributes and events, rewrites `url.full` to `url.path`, drops spans by
  name, and delegates `shutdown` and `forceFlush`.
- **Sequencing**: settings and rendering → SDK, propagation, and export → harness facts and documentation. This is the
  slice order below.

### Phase 5 — Feature verification integration

[verification.md](verification.md) owns the claims. [quickstart.md](quickstart.md) maps each procedure step to
commands, environment, and the slice that first makes it executable. Module evidence (V-007) is not repeated in the
procedure. Browser-interaction checks (V-003, V-008, V-009, V-010, V-012) are made once, in the quickstart steps that
own them, and are not duplicated as telemetry.

### Phase 6 — Verification telemetry contract

See [contracts/telemetry.md](contracts/telemetry.md). It adds ten browser span rows (T-001–T-007 and T-009–T-011) and one startup
log (T-008). Server-side, it references the existing HTTP server spans and the
[session verification signals](../../docs/session-state.md#verification-signals) (`logout`, `protectRequest`) and
adds none. Facts not emitted: page text, form values, query strings and fragments, message contents, headers, cookies,
tokens, user agent, resource-timing URLs, status descriptions, and exception events (FR-021a). Absence facts are
verified through browser interaction. The cross-tab match identifier is the send span's ID, which the SDK generates
for telemetry only (FR-016).

### Phase 7 — Implementation slices

| Slice    | Branch                            | Decision a reviewer accepts                                                                                                                                                                                                                                                                                                                                                   | Contracts and modules                                                                                                                                                                                                                                                                                   | Telemetry rows                                  | Claim IDs advanced                                                                                                                        | Est. hand-written files                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `config` | `370-browser-tracing-impl`        | The server decides browser tracing from its own settings, refuses a credential-bearing endpoint when the switch is on, and renders exactly four values and the document's trace context into protected documents, and nothing when off.                                                                                                                                       | `config.ts` (`BrowserTracingSettings`, `OtelEnabled.browserTracing`), `observability.ts` (`BrowserTracing`), `runtime.ts`, `next.ts` (`readBrowserTracing`), `index.ts`; `shared/browser-tracing.ts` (`BrowserTracingMeta` only); `(app)/layout.tsx`                                                    | T-008                                           | V-007, V-009; partial V-004 (document carries server context), partial V-008 (document has nothing when off)                              | 11: `config/otel.ts`, `config.ts`, `observability.ts`, `runtime.ts`, `next/browser-tracing.ts`, `next.ts`, `index.ts`, `tests/lib/config.test.ts`, `shared/browser-tracing.ts`, `(app)/layout.tsx`, `docs/observability.md` (switch, rendered values, credential-free endpoint, never-in-production). No lockfile change                                                                                                                               |
| `export` | `370-browser-tracing-impl-export` | The browser lazily starts the web SDK from the rendered configuration, continues the document trace, propagates context to same-origin fetch only, and exports filtered spans straight to a header-free collector. The roster fixture gains a client-navigation stimulus for the RSC request kind.                                                                            | `shared/browser-tracing.ts` (`startBrowserTracing`), `browser-tracing/sdk.ts`, `browser-tracing/export-filter.ts`; `instrumentation-client.ts`; `coordination-fixtures/roster.tsx` (research D17)                                                                                                       | T-001, T-002, T-003                             | V-002, V-003, V-004, V-006, V-008, V-010, V-011, V-012; partial V-005 (PL-4 pending, see Review notes); partial V-016 (automatic records) | 11: `packages/frontend/package.json`, `.fallowrc.json`, `instrumentation-client.ts`, `shared/browser-tracing.ts`, `browser-tracing/sdk.ts`, `browser-tracing/export-filter.ts`, `coordination-fixtures/roster.tsx`, `renovate.json`, `docs/observability.md` (export, CORS, signals T-001–T-003), `docs/docker-compose.md`, `quickstart.md` (results). Lockfile: `pnpm-lock.yaml`                                                                      |
| `facts`  | `370-browser-tracing-impl-facts`  | Session coordination and the coordination fixture record UI transitions, cross-tab sends and receipts (matched by a telemetry-only ID), and focus moves as closed-set spans; facts before SDK registration are buffered; form submits and router transitions parent the Server Action and RSC requests they cause; the harness documents browser telemetry as a live channel. | `shared/browser-tracing.ts` (recorders, buffer, closed sets, `moveFocus`, `focusTargetProps`, `onRouterTransitionStart`), `browser-tracing/facts.ts`, `browser-tracing/sdk.ts` (buffer replay, cause wrapper); `instrumentation-client.ts`; session-coordination and coordination-fixture private files | T-004, T-005, T-006, T-007, T-009, T-010, T-011 | V-001 (every request kind, SC-001), V-013, V-014, V-015, V-016, V-017                                                                     | 13: `shared/browser-tracing.ts`, `browser-tracing/facts.ts`, `browser-tracing/sdk.ts`, `instrumentation-client.ts`, `tab-coordination.ts`, `tab-channel.ts`, `signed-out-notice.tsx`, `logout-control.tsx`, `coordination-fixtures/participant.tsx`, `tests/unit/session-coordination.test.ts`, `docs/observability.md` (signals T-004–T-010, queries), `docs/engineering/verification-harness.md` (channels, Known limits), `quickstart.md` (results) |

Order and independence:

- `config` lands first because the meta contract is what `export` consumes. It is reviewable alone: its consumer is
  the protected layout, and its evidence is the V-007 module test plus the rendered document. Until `export`, the meta
  elements are inert. That is an intermediate state with no client behavior and no claim beyond those listed.
- `export` adds every dependency and its lockfile change together (spec "In scope"), plus the Fallow exemption the new
  entry file needs. It is the first slice where a browser runs any tracing code.
- `facts` closes #368: it delivers the done-when trace (V-001) and the harness facts. Only its pull request may say
  `Closes #368`, and only when its verification report passes the gate.
- Each slice passes typecheck, lint, `pnpm check:unused`, and `pnpm check:health` on its own. In `config`,
  `BrowserTracingMeta` is the facade's only export. `startBrowserTracing` and the recorders arrive with their first
  consumers.

Plan limitations, approved with this plan for the verification gate:

- **PL-1**: A request sent before the lazily loaded SDK registers carries no browser trace context, and a fact
  buffered before registration is replayed as a root span, not as the parent of a request. Facts are kept unless more than 256 occur before registration, which the T-011 overflow record reports, or the SDK does not register within 10 seconds, in which case the marker never appears and the run is not sampled.
  Verifiers wait for the `data-preets-browser-tracing="started"` marker before a sampled request step. A request seen
  before the marker that lacks context is not a V-002 or SC-001 violation.
- **PL-2**: When two form submits, or two router transitions, overlap before the first one's request starts, the
  later interaction keeps the cause and the earlier request is unparented (research D16). It is never attributed to
  the wrong interaction. A guarded submission and its replay count as one interaction. Quickstart samples one
  interaction at a time.
- **PL-3**: Only documents under the protected `(app)` layout render browser configuration. Public documents run no
  browser tracing.
- **PL-4 (proposed; needs approval)**: V-005 now requires a restoration confirmed as served from the back/forward
  cache with no new document request (spec commit `0a97ef0`). On every traced page, the existing `RestoredPageGuard`
  reloads a restored page at once, and protected documents are `no-store`, which browsers commonly exclude from the
  cache. The required condition therefore does not arise. The design still guarantees FR-013, because no module
  re-runs on a restoration and the reload is a new render with a new trace. The verifier records V-005 as `not established` with this limitation. Slice `export` therefore asserts V-005
  only in part and does not claim it in full. If the specification instead adopts option (B) in Review notes, the
  plan is corrected to assert it in full. Changing `RestoredPageGuard` is outside this issue.

## Review notes

Decisions that need a human, and discoveries that belong to the specification:

1. **Fallow coverage exemption (needs approval before slice `export`).** `src/instrumentation-client.ts` must sit at
   the `src/` root, where it matches no Bulletproof zone, and the workspace sets `requireAllFiles`. The proposal is to
   add it to `boundaries.coverage.allowUnmatched` beside `src/instrumentation.ts`. Agents may not add `allowUnmatched`
   entries, so the implementation session will stop and ask unless this plan's approval covers it.
2. **Unrecognized switch value (confirm).** V-007's required observation says decoding "yields off" for an
   unrecognized value. The Effect guidance requires an unsupported value to fail startup and forbids defaulting it.
   The plan fails startup, which runs no browser tracing and so satisfies FR-004. If the reviewer reads V-007 as
   requiring successful startup with tracing off, that is a specification correction, and the guidance conflict needs
   a human decision.
3. **Automated V-008 and V-012 boundary (spec discovery).** `verification.md` plans these as automated checks
   against a built application in a real browser. The repository's only durable browser suite is requirements BDD.
   Its scenarios must carry requirement-ID tags, and no requirement covers this feature. The plan runs both checks as
   agent-executed browser interaction on each slice that claims them: quickstart step 2, with the temporary in-page
   probe the verification plan now names, and step 9. A durable suite would
   be new test tooling outside the issue. If the reviewer wants durable checks, that returns to the specification.
4. **V-005 observability (spec discovery, needs a decision).** The revised V-005 observation, a confirmed
   back/forward-cache restoration without a new document request, cannot occur on protected pages, because
   `RestoredPageGuard` reloads them. Options: (A) approve PL-4, so V-005 stays `not established` by design; (B) the
   spec accepts the reload as the observation, meaning no `documentLoad` joins the old trace and the reload starts a
   new one; (C) a separate issue changes `RestoredPageGuard`.
5. **OpenTelemetry update branch.** `renovate/opentelemetry-stack` mixes 0.301 and 0.223 experimental packages. The
   `export` slice pins the release line frontend-services has on `main` when it starts, and extends the Renovate caps,
   so the next update moves server and browser together.
