# Research: Browser Tracing for the Verification Harness

**Plan**: [plan.md](plan.md)

**Feature verification**: [verification.md](verification.md)

**Status**: Planning decisions. Facts were checked on 2026-11-11 against the installed workspace and the published
package sources named below. Implementation re-checks each signature against the installed declarations.

## Current implementation facts

- `packages/frontend-services/src/config/otel.ts` decodes `OTEL_SDK_DISABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`,
  `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_SERVICE_NAME`, and `OTEL_SERVICE_VERSION` into `OtelSettings`, part of
  `StartupConfig`, decoded once by `src/runtime.ts`. `OTEL_RESOURCE_ATTRIBUTES` is read only by the global Node SDK.
  `service.instance.id` therefore reaches server spans without passing through `StartupConfig`.
- `observabilityLayer` in `src/observability.ts` builds the Node SDK from `OtelSettings`. The global Node SDK
  registers an `AsyncLocalStorage` context manager and the W3C propagator. `HttpInstrumentation` continues an incoming
  `traceparent` on every Node HTTP request, including Server Action POSTs and RSC requests, which are ordinary HTTP
  requests to the same Next server.
- Request code reaches services only through `Runtime.runPromise` (`src/runtime.ts`), used by the `next/` adapters.
- `packages/frontend` has no browser OpenTelemetry dependency. `@opentelemetry/sdk-trace-web` 2.12.0 is already a
  dependency of frontend-services because `@effect/opentelemetry` peers on it; that copy never reaches the browser.
- Protected documents render under `src/app/(app)/layout.tsx`, which is `force-dynamic`. Next sends dynamic pages
  with `Cache-Control: private, no-cache, no-store`, so a protected document is never replayed from the HTTP cache.
- `src/app/layout.tsx` (root) renders `RestoredPageGuard`, which reloads any page restored from the back/forward cache
  (`pageshow` with `persisted`), so a restored protected page always becomes a new server-rendered document.
- Client coordination lives in `src/features/session-coordination/`. `TabCoordination` owns every client UI state
  (`TabView` and `concealed`), `tab-channel.ts` owns every `BroadcastChannel` post and receipt, and
  `signed-out-notice.tsx` moves focus to the signed-out heading. The protected coordination fixture
  `features/coordination-fixtures/participant.tsx` also moves focus: "Focus later" focuses the Goal input after 2
  seconds. `features/onsite/visit-log.tsx` moves focus only on the public `/_test/onsite` page, which browser tracing
  does not cover (PL-3). `logout()` calls `sendLogout` synchronously after
  `#setView("logging-out")`, and `confirm()` calls `readSessionStatus` synchronously before its first `await`.
- Fallow: `features/session-coordination` may import only its own zone, `server`, and `shared`
  (`fallow guard`, 2026-11-11). A browser-tracing feature folder would be unreachable from it, so the facade must
  live in the `shared` zone. `src/instrumentation-client.ts` matches no zone, and the workspace sets
  `requireAllFiles` with only `src/instrumentation.ts` and `src/proxy.ts` exempt.
- The local collector image runs an OpenTelemetry Collector whose OTLP HTTP receiver already sets
  `cors.allowed_origins: [http://*]`. A preflight from `http://127.0.0.1:3000` to `http://127.0.0.1:4318/v1/traces`
  returned `204` with `Access-Control-Allow-Origin: http://127.0.0.1:3000` against the running `otel-lgtm` 0.39.0
  container. `compose.yaml` pins 0.40.0; `docs/docker-compose.md` still names 0.37.0.

## Installed and published dependency facts

| Package                                        | Version | Fact used by the plan                                                                                                                                                                                                                             |
| ---------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next`                                         | 16.4.5  | `instrumentation-client.ts` runs after the document loads and before hydration; only synchronous top-level code is guaranteed to finish before hydration. `experimental.clientTraceMetadata` is a build-time list.                                |
| `@opentelemetry/api`                           | 1.9.1   | Global tracer and propagation API; returns non-recording spans when no provider is registered. Same version as frontend-services.                                                                                                                 |
| `@opentelemetry/sdk-trace-web`                 | 2.12.0  | `WebTracerProvider`; `register()` installs `StackContextManager` and the W3C propagator by default. Peer `@opentelemetry/api` `<1.10.0`.                                                                                                          |
| `@opentelemetry/instrumentation-fetch`         | 0.223.0 | Span name is the HTTP method; sets `url.full`. Adds `traceparent` only when `shouldPropagateTraceHeaders` holds: same origin, or a match in `propagateTraceHeaderCorsUrls` (left unset). Supports `ignoreUrls` and `applyCustomAttributesOnSpan`. |
| `@opentelemetry/instrumentation-document-load` | 0.68.0  | Last release on instrumentation 0.223 and sdk-trace-web 2.x (0.69.0 moves to SDK 3). Parents `documentLoad` on `<meta name="traceparent">`; sets `url.full` and `user_agent.original`; emits `documentFetch` and `resourceFetch` children.        |
| `@opentelemetry/exporter-trace-otlp-http`      | 0.223.0 | Browser build exports OTLP/HTTP JSON through `fetch` with `mode: "cors"` and no `credentials` option, so cross-origin export sends no cookies; adds no headers unless configured.                                                                 |
| `@opentelemetry/resources`, `sdk-trace-base`   | 2.12.0  | `resourceFromAttributes`; `BatchSpanProcessor`; the `SpanExporter` interface the export filter wraps.                                                                                                                                             |

## Decisions

### D1 — Switch name, decoding, and effective rule

- **Decision**: Add `BROWSER_TRACING_ENABLED` to the `otel` part of `StartupConfig`, decoded with `Config.Boolean` and
  defaulting to `false`. Browser tracing is effective only when OTEL is enabled and the switch decodes to `true`. The
  decoded `OtelEnabled` gains `browserTracing: BrowserTracingSettings | undefined`; `OtelDisabled` has no such field,
  so a disabled server cannot carry browser settings. A value that `Config.Boolean` does not recognize fails startup
  with the schema issue, like every other setting.
- **Rationale**: FR-004 requires that an unrecognized value never enables tracing. The Effect guidance forbids turning
  an unsupported value into a default ("An unsupported value fails startup"), and `OTEL_SDK_DISABLED` already fails
  startup the same way. A failed startup runs no browser tracing.
- **Alternatives**: Decoding an unrecognized value to `false`, which matches the literal wording of V-007's required
  observation but contradicts the repository's configuration rule (see Review notes in `plan.md`). An `OTEL_`-prefixed
  name, rejected because it suggests an OpenTelemetry-specified variable the SDK would read.

### D2 — Run identifier source

- **Decision**: `config/otel.ts` also reads `OTEL_RESOURCE_ATTRIBUTES` (optional) and extracts only
  `service.instance.id`, percent-decoded per the OpenTelemetry resource SDK format. An absent key, or a list that does
  not parse, yields no instance ID; it never fails startup, because the Node SDK owns that variable and already
  tolerates it. `serviceVersion` stays `OTEL_SERVICE_VERSION`, which the harness sets to the same revision as the
  resource attribute.
- **Rationale**: FR-014 requires the browser to carry the server's run identifier. The harness already sets it only in
  `OTEL_RESOURCE_ATTRIBUTES`. Startup decoding stays the single reader of the environment.
- **Alternatives**: Reading the Node SDK's detected resource at request time, rejected because the Effect bridge and
  the global SDK build separate resources and neither is exposed. A second, harness-only variable, rejected as a
  duplicate setting the harness would have to keep equal.

### D3 — How the server renders configuration and trace context

- **Decision**: A `BrowserTracing` service in frontend-services `observability.ts` holds the decoded
  `BrowserTracingSettings | undefined`. A Next host adapter, `readBrowserTracing()`, captures the active OpenTelemetry
  context synchronously, injects it with the global W3C propagator, and resolves to `{ config, traceparent }` or
  `undefined`. The protected `(app)` layout awaits it and renders, only when it is defined, two `<meta>` elements:
  `name="traceparent"` and `name="preets-browser-tracing"` with a JSON `content` of the four values. React 19 hoists
  them into `<head>`.
- **Rationale**: The layout is already dynamic and its render runs inside the server's handling of the document
  request, so the active context belongs to the trace that rendered the document, including one continued from a
  Playwright `traceparent`. The `traceparent` meta name is what `DocumentLoadInstrumentation` reads.
- **Alternatives**: Next's `experimental.clientTraceMetadata`, rejected because it is fixed at build time and renders
  trace context whenever server OTEL is active, which breaks FR-003 when only the browser switch is off. Rendering from
  the root layout, rejected because it would make every public document dynamic in production for a local-only
  facility. Public documents (`/login-unavailable`, `/forbidden`, `/_test/*`) therefore run no browser tracing; every
  harness journey in `verification.md` uses protected pages.

### D4 — Tracing code is not downloaded when off

- **Decision**: `src/instrumentation-client.ts` calls `startBrowserTracing()` from the shared facade. It reads the
  configuration meta element synchronously; when it is absent it returns, having loaded nothing but the facade. When
  present, it dynamically imports the private SDK module, which registers the provider and instrumentations, then sets
  `data-preets-browser-tracing="started"` on `<html>`. Feature code depends only on the facade. With no meta element
  the facade is `off` and every recorder is a no-op.
- **Early facts**: Between reading a valid meta element and the SDK registering, the facade is `pending`. Recorders
  then append each fact (record name, closed-set attributes, start time, and the cross-tab telemetry ID) to a bounded
  in-memory buffer of 256 entries. The focus and submit listeners are installed by the facade itself in this state.
  When the SDK registers, it replays the buffer as spans with their original start times. If loading fails, the
  facade becomes `off` and drops the buffer. Coordination never waits for tracing, so the initial
  `mounted → content_shown` transition and the `session-current` and `renewed` startup messages are kept even when
  hydration wins the race (review of #374).
- **Rationale**: The SDK, exporter, and instrumentations are absent from every off page's network traffic, which
  V-008 observes. The API package is small and inert.
- **Buffer bounds**: The `pending` state lasts at most 10 seconds. If the SDK has not registered by then, the facade
  becomes `off`, drops the buffer, and never sets the marker. When the buffer is full, further facts are counted, not
  stored. On replay the SDK emits one `BrowserTracing.buffer` span with `preets.outcome = overflowed` and
  `preets.tracing.dropped_count` (T-011), so loss is observable rather than silent. Coordinator startup produces about
  ten facts, so overflow means something abnormal happened.
- **Consequence (plan limitation PL-1)**: The import resolves after hydration may begin. A request started before the
  SDK registers carries no browser trace context, and a buffered fact replayed later is a root span, not the parent of
  a request. Harness facts themselves are not lost. Verifiers wait for `data-preets-browser-tracing="started"` before a
  sampled step. The document-load record is unaffected because the instrumentation reads Navigation Timing after the
  fact.
- **Alternatives**: A static import, which downloads the SDK on every page; rejected per the specification hand-over
  preference and V-008.

### D5 — Context manager and its async limits

- **Decision**: `StackContextManager` (the `WebTracerProvider` default). No Zone.js. Code that wants a request to be a
  child of a harness record starts the request synchronously inside the record's `TraceScope.run`. `TabCoordination`
  does so for logout (`content_shown → logging_out`, then `POST /auth/logout`) and for concealment followed by
  confirmation (`content_shown → content_concealed`, then `GET /session/status`). Cross-tab receipts run their
  synchronous handler inside the receipt scope, so a transition a receipt causes is its child.
- **Limits**: Context does not survive `await`, timers, or React's scheduler. Server Action POSTs and RSC navigation
  fetches start in React or the router, outside any synchronous scope. D16 gives them their causal parent another way,
  so SC-001 holds for every request kind.
- **Alternatives**: `ZoneContextManager`, rejected: it requires Zone.js globally and cannot follow native
  `async`/`await`, which this code uses throughout.

### D6 — Same-origin propagation

- **Decision**: `FetchInstrumentation` with `propagateTraceHeaderCorsUrls` unset, so only same-origin requests get
  `traceparent`. `ignoreUrls` lists the collector traces URL, so export requests produce no spans. No XHR, user
  interaction, or long-task instrumentation is registered. The identity-provider sign-in is a document navigation
  started by server redirects, which the page cannot decorate.
- **Rationale**: FR-010 and FR-011 with no custom propagation code. Installed source confirms the default.

### D7 — Document-load trace and back/forward restoration

- **Decision**: `DocumentLoadInstrumentation` with `ignorePerformancePaintEvents: true`. Its `documentLoad` span
  continues the rendered `traceparent`. `resourceFetch` spans are dropped by the export filter (D9). A document
  restored from the back/forward cache does not re-run modules, so no second `documentLoad` exists for it, and the
  existing `RestoredPageGuard` reloads it, which produces a new server render, a new `traceparent`, and a new
  `documentLoad` in the new trace.
- **Rationale**: FR-012 and FR-013 with the existing restoration owner unchanged. Protected documents are
  `no-store`, so no HTTP-cache copy replays a stale `traceparent`.
- **Alternatives**: Listening for `pageshow` to suppress a record, unnecessary because nothing re-runs on restore.

### D8 — Matching a cross-tab send to its receipts

- **Decision**: While the facade is `pending` or `started`, `recordTabMessageSend` generates a random UUID with
  `crypto.randomUUID()` for that send only. `tab-channel.ts` adds it to the posted object as one telemetry-only field,
  `telemetryId`. Both `TabChannel.send` and every `TabChannel.receive` of it carry it as `preets.tab.message.id`.
  Without tracing, the field is absent. Coordination parsing ignores it, so coordination behavior is unchanged. No
  message field value is copied into telemetry.
- **Rationale**: FR-016 and User Story 3 scenario 3 allow an opaque identifier generated only for telemetry. A UUID
  the facade generates works before the SDK registers, so early startup messages stay matchable (D4). A parent-span
  link would not: no span context exists yet. Several receipts of one send share its ID. A frozen tab records its
  receipt when it actually receives it. The receipt's synchronous handler runs in the receipt's scope, so a transition
  it causes is the receipt's child.
- **Alternatives**: Carrying the send span's `traceparent` and parenting each receipt on it. That gives one trace per
  send, but it fails for sends buffered before registration (first review). Hashing the coordination tag, rejected: a
  hash of a forbidden value is still derived from it.

### D9 — Forbidden-data enforcement at export

- **Decision**: A private export filter wraps the OTLP exporter. It forwards a span only when its name is in the
  contract's closed list, keeps only allow-listed attribute keys, rewrites `url.full` to `url.path` (pathname only, no
  query or fragment), removes event attributes, drops `exception` events, and drops `resourceFetch` and
  `CORS Preflight` spans. It keeps the span status code and clears the status description. The resource is built from
  exactly `service.name`, `service.version`, `service.instance.id` (when present), and the SDK's own `telemetry.sdk.*`
  attributes.
- **Rationale**: Instrumentation libraries set full URLs and user-agent strings that may carry query values. Error
  paths put free text in status descriptions and exception events. FR-021a covers every text-bearing field: record
  names, attribute and event values, and status or error descriptions. One choke point keeps FR-019 to FR-021a true
  for every span, including any span a library adds later. Span and event names that pass are fixed strings from the
  contract or the instrumentation.

### D10 — Transport and collector headers

- **Decision**: `OTLPTraceExporter` from `@opentelemetry/exporter-trace-otlp-http` with `url` set to the configured
  endpoint plus `v1/traces` and no `headers`. The page never receives `OTEL_EXPORTER_OTLP_HEADERS`. When browser
  tracing is effective and the server has collector headers, startup logs one warning, `Browser tracing exports
  without collector headers`, with no header names or values. Server export is unchanged.
- **Rationale**: FR-007. OTLP/HTTP JSON is the browser exporter's supported encoding; the collector accepts it beside
  the server's protobuf. Its `fetch` transport sends no cookies cross-origin.
- **Alternatives**: The protobuf exporter, rejected: it adds a protobuf runtime to the browser bundle for no benefit to
  a local collector.

### D11 — Local collector CORS

- **Decision**: Keep the pinned `grafana/otel-lgtm` image's collector configuration, whose OTLP HTTP receiver allows
  `http://*` origins. `docs/docker-compose.md` documents that default, the required browser-reachable endpoint
  (`http://127.0.0.1:4318/`), and corrects the pinned version it names. No collector configuration file is mounted.
- **Rationale**: FR-008 already holds; V-011 observes it per run. Mounting a copy of the image's configuration would
  fork an upstream file for no behavior change.
- **Risk**: A future image could narrow the default. V-011 and the documented preflight check detect it; the remedy
  then is a mounted receiver configuration.

### D12 — Package versions and the open OpenTelemetry update

- **Decision**: Add to `packages/frontend` exactly the release line frontend-services pins on `main`:
  `@opentelemetry/api` 1.9.1, `sdk-trace-web` 2.12.0, `sdk-trace-base` 2.12.0, `resources` 2.12.0,
  `instrumentation` 0.223.0, `instrumentation-fetch` 0.223.0, `exporter-trace-otlp-http` 0.223.0, and
  `instrumentation-document-load` 0.68.0. Extend the Renovate caps so `instrumentation-fetch` stays below 0.300.0 and
  `instrumentation-document-load` below 0.69.0 while the stable SDK is held on 2.x.
- **Rationale**: SDK 3 needs `@opentelemetry/api` 1.10, which SDK 2.12 rejects; the repository holds the server on
  2.x until `@effect/opentelemetry` accepts SDK 3. The open `renovate/opentelemetry-stack` branch currently mixes
  0.301 and 0.223 experimental packages; whichever lands first, the implementation slice that adds the dependencies
  uses the versions then on `main` for frontend-services, keeping one release line.

### D13 — Facade location and the client entry file

- **Decision**: The public facade is `packages/frontend/src/shared/browser-tracing.ts`, owning
  `src/shared/browser-tracing/`. `src/instrumentation-client.ts` is the Next file convention that calls it.
- **Consequence**: `instrumentation-client.ts` is outside every Bulletproof zone and the workspace requires all files to
  match one. It is the client counterpart of `src/instrumentation.ts`, which is already exempt. Adding it to
  `boundaries.coverage.allowUnmatched` needs human approval under the repository rules (Review notes in `plan.md`).

### D14 — Documentation

- `docs/observability.md`: the switch and its dependency on OTEL, the four rendered values, direct header-free export,
  the CORS requirement, the browser signals and their queries, and the statement that browser tracing is a local
  verification facility that defaults to off, that production configuration never sets it, and that it is assumed
  never to be active in production. The "Out of scope" stub for browser tracing is narrowed to RUM, metrics, and logs.
- `docs/docker-compose.md`: the collector CORS default and browser-reachable endpoint.
- `docs/engineering/verification-harness.md`: "Known limits" replaces "Browser telemetry does not exist yet" with the
  real limits: protected pages only, requests before tracing starts carry no context, Server Action and RSC fetches
  are their own traces, and records from a page that closes before export may be lost. The evidence-channel bullet
  drops "once browser tracing exists".

### D15 — Endpoint shape that is safe to render

- **Decision**: When `BROWSER_TRACING_ENABLED` decodes to `true` and OTEL is enabled, `OTEL_EXPORTER_OTLP_ENDPOINT`
  must be an `http:` or `https:` URL with no username, no password, no query string, and no fragment. Any other
  endpoint fails startup with the fixed message `BROWSER_TRACING_ENABLED requires an OTEL_EXPORTER_OTLP_ENDPOINT
  without credentials, query, or fragment`. The message names neither the URL nor its parts. The rendered endpoint is
  therefore only scheme, host, port, and path. With the switch off, the same endpoint is accepted as before, and server-only export is
  unchanged.
- **Rationale**: `Config.URL` accepts userinfo and query parameters such as `api_key` or tokens. Rendering such an
  endpoint would give the page that credential (FR-007, V-009). Omitting headers alone does not make the rendered URL
  credential-free. An OTLP base URL needs neither a query nor a fragment, because the exporters append `v1/traces` to
  the path. Failing startup follows the
  repository's configuration rule (D1). Silently stripping the userinfo would export to a collector the operator did
  not configure.
- **Alternatives**: Stripping userinfo or the query before rendering, rejected for that reason. Rendering nothing while starting
  normally, rejected because it hides a misconfiguration.

### D16 — Causal parent for Server Action and RSC requests

- **Decision**: The facade records two interaction facts that cause requests outside a synchronous scope:
  - `Interaction.submit`: a capture-phase `submit` listener on `document`, which also sees `requestSubmit` replays.
  - `Router.transition`: from Next's `onRouterTransitionStart`, which `instrumentation-client.ts` re-exports from the
    facade.

    Each one replaces the pending cause for the request kind it expects. There is one slot per kind, the cause is
    claimed once, and it lasts 5 seconds. A
    submit expects a Server Action POST, identified by the `Next-Action` request header. A router transition expects an
    RSC request, identified by the `RSC: 1` header. The SDK module wraps `window.fetch` outside `FetchInstrumentation`.
    When a same-origin request matches the unexpired cause in its kind's slot, the wrapper empties the slot and calls the
    instrumented fetch inside `context.with(cause)`. The fetch span, and the server spans below it, then become the
    interaction's descendants. Unclaimed causes expire.
- **Guarded submissions**: `TabCoordination`'s submit guard cancels a submission whose current-session hint names
  another session, confirms the session, and replays it with `requestSubmit` (`tab-coordination.ts`). The listener
  therefore sees two submits for one POST. The replay's cause replaces the cancelled one's, so the POST is parented on
  the replay and nothing is left queued for the next submission. The cancelled submit's `Interaction.submit` span has
  no request child. A cancelled submit that is never replayed leaves its cause, which the next submit replaces or
  which expires. It is never claimed by a later POST of another submit, because every submit replaces the slot.
- **Rationale**: SC-001 requires transition-to-server correlation for every sampled transition and for at least one
  transition of each request kind. Data fetches already nest through `TraceScope.run` (D5). This gives the two
  React-scheduled kinds the same parent relation without Zone.js. The match uses only request headers that Next
  itself sets, never their values or the body.
- **Limits**: When two interactions of one kind overlap before the first request starts, the later one wins. The
  earlier request is then left unparented rather than attributed to the wrong interaction (PL-2). Requests sent before the SDK registers stay
  unparented (PL-1). Whether Next reads `window.fetch` at call time is checked in slice `facts`. If it does not, the
  slice stops and the plan is corrected rather than claiming SC-001.
- **Alternatives**: `ZoneContextManager`, rejected (D5). Attributing any fetch inside a time window to the latest
  interaction, rejected: unrelated confirmation reads would be attributed to it.
