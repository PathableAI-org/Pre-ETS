# Module Architecture and Public Contracts: Browser Tracing for the Verification Harness

**Plan**: [plan.md](../plan.md)

**Feature verification**: [verification.md](../verification.md)

**Status**: Planned design. Next.js 16.4.5, React 19.3.1, Effect 4.1.2, `@opentelemetry/api` 1.9.1, and the browser
OpenTelemetry packages in [research.md](../research.md#installed-and-published-dependency-facts) were checked on
2026-11-11. Signatures are re-verified against installed declarations when each slice starts.

## Module architecture decisions

| Concern                                  | Current owner and consumers                                                                                                                                          | Decision                                                                                                                                                                                                                                | Public boundary                                 | Private decomposition                                                                           | Rationale and non-goals                                                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Process telemetry settings               | `frontend-services/src/config.ts` (`OtelSettings`); consumer: `observabilityLayer`                                                                                   | **Extend** `OtelEnabled` with `browserTracing: BrowserTracingSettings \| undefined`, decoded from `BROWSER_TRACING_ENABLED` and `service.instance.id` in `OTEL_RESOURCE_ATTRIBUTES` (research D1, D2).                                  | `src/config.ts`                                 | `config/otel.ts`                                                                                | Settings are decoded once. The effective rule (OTEL on and switch on) is decided where the settings are built, so no consumer can apply it differently.           |
| Browser-tracing settings at request time | none                                                                                                                                                                 | **Extend** the observability service module with one `BrowserTracing` service and its layer, and the header warning (research D3, D10).                                                                                                 | `src/observability.ts`                          | none                                                                                            | Request code reaches decoded settings only through the runtime. One service, no provider interface: one value, one consumer.                                      |
| Runtime composition                      | `src/runtime.ts` (`applicationLayer`, `ApplicationServices`)                                                                                                         | **Extend** `ApplicationServices` with `BrowserTracing`, provided from `startup.otel`.                                                                                                                                                   | `src/runtime.ts` (internal to the package)      | none                                                                                            | The adapter runs through the existing `Runtime.runPromise`.                                                                                                       |
| Document configuration and context       | none                                                                                                                                                                 | **Extend** the Next host-adapter module with `readBrowserTracing` (research D3).                                                                                                                                                        | `src/next.ts`, re-exported from `src/index.ts`  | NEW `next/browser-tracing.ts`                                                                   | It reads the active request context, which is a host concern, and returns plain values for the layout.                                                            |
| Protected document head                  | `frontend/src/app/(app)/layout.tsx`                                                                                                                                  | **Extend**: await `readBrowserTracing()` and render `BrowserTracingMeta`.                                                                                                                                                               | Next convention file                            | none                                                                                            | The protected route group is the dynamic, `no-store` boundary every harness journey uses. Public documents are not traced (research D3).                          |
| Browser tracing facade                   | none; consumers: `(app)/layout.tsx`, `instrumentation-client.ts`, `features/session-coordination`, `features/coordination-fixtures`                                  | **Add** one shared module, because a feature consumes it and Bulletproof forbids feature-to-feature imports (research D13).                                                                                                             | `frontend/src/shared/browser-tracing.ts`        | `browser-tracing/sdk.ts` (lazy), `browser-tracing/export-filter.ts`, `browser-tracing/facts.ts` | One owner for every browser span name, attribute, and closed set. Feature code sees only recorders that are no-ops when tracing is off.                           |
| Client instrumentation entry             | none                                                                                                                                                                 | **Add** `src/instrumentation-client.ts`, the Next file convention, calling `startBrowserTracing()` and re-exporting `onRouterTransitionStart`.                                                                                          | Next convention file                            | none                                                                                            | Runs before hydration. Needs the same Fallow coverage exemption as `src/instrumentation.ts` (human approval).                                                     |
| Session coordination harness facts       | `features/session-coordination` (`TabCoordination`, `tab-channel.ts`, `signed-out-notice.tsx`)                                                                       | **Extend behavior privately**: record transitions, sends, receipts, and application focus moves through the facade; mark focus targets. Exports unchanged.                                                                              | `features/session-coordination.ts` (unchanged)  | `tab-coordination.ts`, `tab-channel.ts`, `signed-out-notice.tsx`, `logout-control.tsx`          | The coordinator is the only owner of these states, messages, and focus moves, so instrumentation sits at the source. No coordination decision depends on tracing. |
| Fixture focus move and client navigation | `features/coordination-fixtures` (`ParticipantFixture`, `RosterFixture`); consumers: `(app)/coordination/participant/page.tsx`, `(app)/coordination/roster/page.tsx` | **Extend behavior privately**: "Focus later" moves focus through `moveFocus`, and the Goal input is marked as a focus target (slice `facts`). The roster adds an App Router navigation button (slice `export`, D17). Exports unchanged. | `features/coordination-fixtures.ts` (unchanged) | `participant.tsx`, `roster.tsx`                                                                 | The focus move is an existing application-caused move on a protected page (FR-017). The design-system `Link` cannot make an RSC request.                          |
| Local collector and docs                 | `compose.yaml`, `docs/observability.md`, `docs/docker-compose.md`, `docs/engineering/verification-harness.md`                                                        | **Preserve** `compose.yaml`; **extend** the three documents (research D11, D14).                                                                                                                                                        | n/a                                             | n/a                                                                                             | The image already accepts `http://*` origins.                                                                                                                     |

Backend, domain, and BDD support are not affected. No relay route, no new workspace, and no new Effect dependency in
`packages/frontend`. New browser dependencies are listed in [research.md](../research.md#d12--package-versions-and-the-open-opentelemetry-update).

## Public contracts

### `@pathableai/pre-ets-frontend-services` — `src/config.ts` (settings)

**Responsibility**: Decode process settings once.

**Actual consumers**:

- `observabilityLayer` and the new `BrowserTracing.layer`, through `startup.otel`.
- `tests/lib/config.test.ts`, which is the only environment-decoding test boundary.

**Proposed signatures**:

```ts
export interface BrowserTracingSettings {
  /** The OTLP base URL the server exports to; the browser appends `v1/traces` the same way. */
  readonly endpoint: URL
  readonly serviceName: string
  readonly serviceVersion: string
  /** `service.instance.id` from `OTEL_RESOURCE_ATTRIBUTES`, when present. */
  readonly serviceInstanceId?: string | undefined
}

export interface OtelEnabled {
  readonly disabled: false
  readonly endpoint: URL
  readonly headers: Readonly<Record<string, string>>
  readonly serviceName: string
  readonly serviceVersion: string
  /** Present only when `BROWSER_TRACING_ENABLED` decodes to true. */
  readonly browserTracing: BrowserTracingSettings | undefined
}
// OtelDisabled and OtelSettings unchanged. `export type { BrowserTracingSettings }` is added beside the existing
// `OtelEnabled`/`OtelSettings` re-exports.
```

**Inputs and validation ownership**: `BROWSER_TRACING_ENABLED` is untrusted environment input decoded by
`Config.Boolean` with default `false`. `OTEL_RESOURCE_ATTRIBUTES` is read optionally; only `service.instance.id` is
extracted and a malformed list yields `undefined`.

**Success semantics and invariants**:

- `browserTracing` is defined if and only if OTEL is enabled and the switch decodes to `true`.
- `browserTracing.endpoint`, `serviceName`, and `serviceVersion` equal the server's own values.
- `browserTracing` never contains headers.
- `browserTracing.endpoint` is an `http:` or `https:` URL with no username, password, query, or fragment (research
  D15).

**Expected errors**: An unrecognized switch value fails `StartupConfig` with a `Config.ConfigError` naming
`BROWSER_TRACING_ENABLED`, as other settings do (research D1). With the switch on and OTEL enabled, an endpoint with userinfo, a query, or a fragment fails with the fixed
message `BROWSER_TRACING_ENABLED requires an OTEL_EXPORTER_OTLP_ENDPOINT without credentials, query, or fragment`.
The message does not echo the URL. With the switch off, such an endpoint is accepted as before (D15).

**Defects and interruption**: none added.

**Effect environment requirements**: `Config` only, inside `src/config/`.

**Compatibility and relationships**: Additive. Existing enabled settings gain one field.

### `src/observability.ts` — `BrowserTracing` service

**Responsibility**: Hold the effective browser settings for request-time readers, and warn once about collector
headers.

**Actual consumers**: `next/browser-tracing.ts`.

**Proposed signatures**:

```ts
export class BrowserTracing extends Context.Service<BrowserTracing, {
  readonly settings: BrowserTracingSettings | undefined
}>()("BrowserTracing") {
  static readonly layer: (otel: OtelSettings) => Layer.Layer<BrowserTracing>
}
```

**Success semantics and invariants**: `settings` is `startup.otel.browserTracing` when enabled, otherwise `undefined`.
When `settings` is defined and `otel.headers` is non-empty, building the layer logs `Browser tracing exports without
collector headers` at warning level once, with no header names or values.

**Expected errors**: none.

**Effect environment requirements**: none.

**Compatibility and relationships**: Added to `ApplicationServices` in `src/runtime.ts`. Not exported from
`src/index.ts`.

### `src/next.ts` — `readBrowserTracing`

**Responsibility**: Give a server-rendered protected document the browser configuration and the trace context of the
request that renders it.

**Actual consumers**: `frontend/src/app/(app)/layout.tsx`.

**Proposed signatures**:

```ts
export interface BrowserTracingConfig {
  /** Absolute OTLP base URL with trailing slash, e.g. `http://127.0.0.1:4318/`. */
  readonly endpoint: string
  readonly serviceName: string
  readonly serviceVersion: string
  readonly serviceInstanceId?: string | undefined
}

export interface BrowserTracingDocument {
  readonly config: BrowserTracingConfig
  /** W3C `traceparent` of the active server span, when one is recording. */
  readonly traceparent: string | undefined
}

/** Resolves `undefined` when browser tracing is off or anything fails; never rejects. */
export const readBrowserTracing: () => Promise<BrowserTracingDocument | undefined>
// src/index.ts re-exports readBrowserTracing and the two types.
```

**Inputs and validation ownership**: none from the request. The active context is captured synchronously before any
`await`.

**Success semantics and invariants**:

- `undefined` whenever `BrowserTracing.settings` is `undefined` (FR-003).
- `config` contains exactly the four values (FR-005). No header, credential, or other setting appears.
- `traceparent` comes from the global W3C propagator over the active context, so it names the trace the server is
  handling, including one continued from an incoming `traceparent`.

**Expected errors**: none public. `StartupNotReady` or any rejection maps to `undefined`: telemetry never fails a page
(FR-009).

**Effect environment requirements**: `BrowserTracing`, through `Runtime.runPromise`.

**Compatibility and relationships**: Additive. Uses `@opentelemetry/api`, already a frontend-services dependency.

### `frontend/src/shared/browser-tracing.ts` — browser tracing facade

**Responsibility**: Own the meta-element contract, start tracing when configured, and own every harness span name,
attribute, and closed set.

**Actual consumers**:

- `src/app/(app)/layout.tsx` renders `BrowserTracingMeta` (slice `config`).
- `src/instrumentation-client.ts` calls `startBrowserTracing` (slice `export`).
- `features/session-coordination` private files call the recorders and `focusTargetProps` (slice `facts`).

**Proposed signatures**:

```ts
import type { BrowserTracingDocument } from "@pathableai/pre-ets-frontend-services"
import type { ReactNode } from "react"

/** Renders `<meta name="traceparent">` and `<meta name="preets-browser-tracing">`, or nothing. Server-safe. */
export function BrowserTracingMeta(props: { readonly document: BrowserTracingDocument | undefined }): ReactNode

/**
 * Reads the meta element synchronously. When present, the facade becomes `pending`: recorders buffer facts, and the
 * focus and submit listeners are installed. Then it lazily loads and starts the SDK, which replays the buffer. Never
 * throws.
 */
export const startBrowserTracing: () => void

/** Next's router hook, re-exported by `instrumentation-client.ts`; records `Router.transition` (research D16). */
export const onRouterTransitionStart: (url: string, navigationType: "push" | "replace" | "traverse") => void

export type UiState =
  | "content_concealed"
  | "content_shown"
  | "logging_out"
  | "logging_out_concealed"
  | "logout_failed"
  | "signed_out"

export type TabMessageKind =
  | "communicated"
  | "logged_out"
  | "logout_failed"
  | "logout_started"
  | "pending"
  | "renewed"
  | "session_current"
  | "window_query"

export type FocusTarget = "logout_control" | "participant_goal" | "signed_out_heading"

/** Runs `task` synchronously with the record's span as the active context. A no-op wrapper when tracing is off. */
export interface TraceScope {
  readonly run: <A>(task: () => A) => A
}

/** `from` is `undefined` for the coordinator's first state, recorded as `mounted`. */
export const recordUiTransition: (from: UiState | undefined, to: UiState) => TraceScope

/** Records the send; answers its telemetry-only UUID to carry as `telemetryId`, or `undefined` when tracing is off. */
export const recordTabMessageSend: (kind: TabMessageKind) => string | undefined

/** Records the receipt with the carried `telemetryId` when it is a UUID; otherwise without one. */
export const recordTabMessageReceipt: (kind: TabMessageKind, telemetryId: unknown) => TraceScope

/** Empties the pending Server Action cause; called by the submit guard when it cancels a submission (research D16). */
export const withdrawSubmitCause: () => void

/** Moves focus to `element`, so the focus record names the application as the cause. */
export const moveFocus: (element: HTMLElement | null, target: FocusTarget) => void

/** The attribute that identifies a focus target to the focus recorder. */
export const focusTargetProps: (target: FocusTarget) => { readonly "data-preets-focus": FocusTarget }
```

**Inputs and validation ownership**: The meta `content` is parsed and validated in `startBrowserTracing`; an invalid
value starts nothing. A receipt `telemetryId` is untrusted and is recorded only when it is a canonical UUID. A
`data-preets-focus` value outside `FocusTarget` is ignored. The router hook's `url` is reduced to its pathname before
recording.

**Success semantics and invariants**:

- With no meta element, `startBrowserTracing` loads no tracing chunk and makes no request (FR-003, V-008).
- The facade has three states. In `off` (no meta element, or the SDK failed to load) recorders record nothing and
  `recordTabMessageSend` answers `undefined`, so posted messages carry no `telemetryId`. In `pending` they append to
  a buffer of at most 256 facts. Facts beyond that are counted, not stored. The SDK replays the buffer with the
  original start times once it registers, plus one overflow record when the count is non-zero (T-011). If the SDK has
  not registered within 10 seconds, the facade becomes `off` and drops the buffer. In `started`
  they create spans through `@opentelemetry/api`. Facts from coordinator startup are therefore kept when hydration runs before registration, and any loss is
  reported.
- A recorded form submit or router transition fills the single pending-cause slot for its request kind. A second
  interaction while that slot is unclaimed makes it ambiguous, and then no request is parented. The next matching
  Server Action request, or RSC request to the transition's destination path, claims an unambiguous cause once
  (research D16). `withdrawSubmitCause()` empties the Server Action slot, and the submit guard calls it when it
  cancels a submission, so the replay, not the cancelled original, parents the POST.
- Every span this module or its children create, and every span an instrumentation creates, passes the export filter
  before export (research D9).
- `TraceScope.run` returns `task`'s result unchanged and never throws on its own account.

**Expected errors**: none. Every failure inside tracing is swallowed and logged only through OpenTelemetry diagnostics
(disabled by default).

**Effect environment requirements**: none; this is plain browser TypeScript in a non-Effect workspace.

**Compatibility and relationships**: Shared zone; imports only packages and its own children.
`instrumentation-client.ts` and the layout import the entry, never a child.

### `features/session-coordination` (unchanged exports)

**Behavior change**: `TabCoordination` computes `UiState` from `(view, concealed)` in `#publish` and `#end` and calls
`recordUiTransition` when it changes. `logout()` and `#concealAndConfirm()` start their request inside the returned
scope. `tab-channel.ts` calls `recordTabMessageSend` before `postMessage` and adds `telemetryId` when defined. It calls
`recordTabMessageReceipt` on each parsed message and runs `receive` in that scope. `parseMessage` ignores `telemetryId`. The submit guard calls `withdrawSubmitCause()` when it cancels a held submission. `SignedOutNotice` focuses through `moveFocus`, and it and `LogoutControl` spread `focusTargetProps`.

### `features/coordination-fixtures` (unchanged exports)

**Behavior change**: `ParticipantFixture`'s "Focus later" focuses the Goal input through
`moveFocus(element, "participant_goal")`, and the input spreads `focusTargetProps("participant_goal")`. Timing and the
"programmatic focus is not activity" behavior are unchanged.

**Behavior change (slice `export`)**: `RosterFixture` adds a design-system `Button`, "Open participant page in
place", that calls `useRouter().push("/coordination/participant")`. It is the fixture's App Router navigation, the
RSC request kind's stimulus for V-002 and SC-001 (research D17). The existing `Link` remains a document navigation.

**Invariant**: No coordination decision, message parse, timing, or visible state depends on whether tracing is on.

## Contract evidence

| Claim                                                                                                                             | Meaningful violation                                                                            | Durable evidence                                                                                                                                                                                                                                                                                      | Manual/transient evidence                                                                  | Limitations and non-duplication                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `browserTracing` is defined only when OTEL is enabled and the switch is true; unrecognized values fail (V-007)                    | Defined with the switch unset, with OTEL disabled, or for an unrecognized value                 | `tests/lib/config.test.ts`: examples for OTEL on/off × switch unset/`true`/`false`/unrecognized, and a Fast-Check property over both inputs that `browserTracing` is defined iff both are on                                                                                                          | none                                                                                       | Does not show the page honors it; V-008 does through browser interaction.                                          |
| `browserTracing` carries exactly the server's endpoint, name, version, and instance ID, and no headers or URL credentials (V-009) | A header value, a different version, a missing instance ID, or an endpoint with userinfo        | Same suite: an example with headers and `OTEL_RESOURCE_ATTRIBUTES` set asserts the settings value; an example with a malformed list asserts no instance ID and successful startup; examples with `http://user:secret@…`, `…?api_key=…`, and `…#x`, with the switch on, assert a failure whose message |                                                                                            |                                                                                                                    |
| contains none of the URL; the same endpoints with the switch off assert successful startup                                        | V-009 browser interaction reads the rendered element                                            | The module test covers decoding; the rendered page is observed once, in the feature procedure.                                                                                                                                                                                                        |                                                                                            |                                                                                                                    |
| `readBrowserTracing` never rejects and renders nothing when off (FR-003, FR-009)                                                  | A rejected promise that fails the layout, or a document with meta elements when off             | none durable: it is a thin host adapter over the runtime                                                                                                                                                                                                                                              | V-008 and V-012 browser interaction                                                        | Covered by feature evidence; a durable test would mock the runtime and observe nothing the feature check does not. |
| Coordination behavior is unchanged by the `telemetryId` field and recorders                                                       | A message with `telemetryId` is rejected, or a coordination decision changes when tracing is on | `tests/unit/session-coordination.test.ts`: an added example that a well-formed message with a `telemetryId` field is still accepted                                                                                                                                                                   | V-012 compares outcomes with tracing off                                                   | Recorders are not unit-tested: their output is telemetry, which durable tests do not assert.                       |
| Recorder and filter output (V-001, V-004–V-006, V-013–V-016)                                                                      | Missing, misnamed, or leaking spans                                                             | none (L1)                                                                                                                                                                                                                                                                                             | Verification agent, per [telemetry.md](telemetry.md) and [quickstart.md](../quickstart.md) | Telemetry is observed, never asserted by durable tests.                                                            |

## Cross-module dependency direction

frontend-services: `next/browser-tracing.ts` → `runtime.ts` → `observability.ts` (`BrowserTracing`) → `config.ts`. The
adapter imports `@opentelemetry/api` for propagation only. Fallow zones already allow `next → runtime, services` and
`services → config`.

frontend: `app/(app)/layout.tsx` → `@pathableai/pre-ets-frontend-services` and `shared/browser-tracing.ts`;
`instrumentation-client.ts` → `shared/browser-tracing.ts`; `features/session-coordination/*` →
`shared/browser-tracing.ts`. The entry alone imports its children, and `sdk.ts` only through a dynamic `import()`.
`shared` imports no feature, app, or Effect module.

## Rejected abstractions and alternatives

- A `features/browser-tracing` feature: unreachable from `features/session-coordination` under Bulletproof.
- A relay route on the product origin: out of scope (FR-006).
- A tracing React context or provider: the recorders need no React state, and a provider would force every consumer
  under one tree; module-level functions over the global API are enough.
- A generic span-recording API taking free-form names or attributes: it would let callers bypass the closed sets.
- Next's `experimental.clientTraceMetadata`: build-time and switch-unaware (research D3).

## Open decisions

### Blocking contract decisions

- None for the plan. Two items need a human decision before or during slice work and are listed in `plan.md` Review
  notes: the Fallow coverage exemption for `src/instrumentation-client.ts`, and confirmation that failing startup on
  an unrecognized switch value satisfies V-007.

### Implementation choices left to tasks

- Exact percent-decoding helper for `OTEL_RESOURCE_ATTRIBUTES`.
- Whether `BrowserTracingMeta` serializes the configuration as one JSON attribute or one meta element per value; the
  four-value contract is the same.
- Batch processor settings (SDK defaults are expected; the documented export delay stays about 30 seconds).
