# Observability (OpenTelemetry traces, metrics, and logs)

Instrumentation for the **Next.js Node server**
(`@pathableai/pre-ets-frontend`). `packages/backend` instrumentation does not
exist yet. Browser tracing lets the
[verification harness](engineering/verification-harness.md) observe browser
behavior. Its switch and rendered configuration are described in
[Browser tracing switch](#browser-tracing-switch), and its export, CORS
requirement, and signals in [Browser export](#browser-export).

**Runtime + export**: `instrumentation.ts` starts one process runtime. OTEL is
all-or-nothing: `OTEL_SDK_DISABLED=true` installs no SDK, exporters, automatic
instrumentation, or Effect OpenTelemetry bridges. Otherwise, the endpoint and
service name are required and traces, metrics, and logs are enabled together.
The application constructs OTLP/HTTP **protobuf** exporters, batch span and log
processors, and two periodic metric readers. It does not select signals
independently or construct JSON HTTP or gRPC exporters.

**Node SDK + Effect bridge**: The enabled path starts
`@opentelemetry/sdk-node` to register the global OpenTelemetry providers and
enable automatic instrumentation. Next.js and instrumented libraries use that
global provider. The same span and log processors are passed to
`@effect/opentelemetry/NodeSdk`, which supplies the scoped Effect tracer,
logger, and metrics bridges. Traces and logs are separate global and Effect
provider paths sharing one export pipeline per signal.

Metrics use one reader per provider, because an OpenTelemetry metric reader
can be bound to only one producer. The global `MeterProvider` owns one periodic
reader and OTLP metric exporter for Node runtime metrics and other
OpenTelemetry API metrics. The Effect metrics bridge owns a second reader and
exporter for Effect `Metric` values. Both export to the same
`v1/metrics` URL on the same interval, so each interval sends two metric
requests. The Effect reader is flushed and shut down when the runtime scope
closes.

Use `Effect.withSpan` only at logical boundaries when needed. The existing
console logger remains beside OTLP logs: pretty when `NODE_ENV=development`,
JSON otherwise. An absent `NODE_ENV` means development; any value other than
`development`, `production`, or `test` fails startup. A startup settings failure
is logged as JSON, because the format setting is not yet known.

Automatic instrumentation covers:

- Incoming and outgoing Node HTTP/HTTPS requests, including default W3C
  trace-context propagation. Exported spans carry no query strings (see
  [Required span attributes and redaction](#required-span-attributes-and-redaction)).
- Redis clients.
- Node runtime metrics.

## Verification

Default local URL base: **`http://127.0.0.1:3000`**.

With OTEL enabled, any Next Node request should produce a server span. For a
quick check, hit the app root (redirect/401 is fine) or any other route and
search Tempo for the configured service (`pre-ets-frontend` in the examples).
Outbound HTTP and Redis spans provide additional request evidence. Effect logs
are exported to Loki, while Effect and Node runtime metrics are exported to
Prometheus. An empty result is not conclusive application evidence: check that
OTEL was enabled, the required configuration was accepted, traffic occurred,
and batch/periodic export had time to complete and reach the collector.

## Environment variables

OTEL settings are the `otel` part of the frontend `StartupConfig`, decoded once at startup.
`OTEL_SDK_DISABLED` defaults to `false`. When OTEL is enabled,
`OTEL_EXPORTER_OTLP_ENDPOINT` must be a valid URL and `OTEL_SERVICE_NAME` must
be non-empty; neither has an application default. When OTEL is disabled, those
two settings may be absent. Supplied raw values still need to decode before
the disabled setting is applied.

| Variable                      | Role                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `OTEL_SDK_DISABLED`           | **Off switch** — a true literal skips both SDKs, automatic instrumentation, exporters, and Effect bridges |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Required when enabled. Base URL for all three OTLP/HTTP protobuf exporters                                |
| `OTEL_SERVICE_NAME`           | Required when enabled. Resource `service.name`; use `pre-ets-frontend` for the standard local setup       |
| `OTEL_SERVICE_VERSION`        | Optional non-empty resource `service.version`. Defaults to `UNKNOWN`                                      |
| `OTEL_EXPORTER_OTLP_HEADERS`  | Optional collector headers. Do not print them. Headers do not replace either required setting             |
| `OTEL_RESOURCE_ATTRIBUTES`    | Optional resource attributes, read by the Node SDK. Startup also reads `service.instance.id` from it      |
| `BROWSER_TRACING_ENABLED`     | Optional browser tracing switch. Defaults to off. See [Browser tracing switch](#browser-tracing-switch)   |

For each signal, the application appends `v1/traces`, `v1/metrics`, or
`v1/logs` directly to the parsed base URL's string form. Use a trailing slash,
particularly when the URL contains a path. A host-only URL such as
`http://127.0.0.1:4318` is normalized to `http://127.0.0.1:4318/` before the
path is appended.

The explicit per-signal URLs mean `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`,
`OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`, and `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`
do not override the configured base URL. `OTEL_TRACES_EXPORTER`,
`OTEL_METRICS_EXPORTER`, and `OTEL_LOGS_EXPORTER` are not per-signal off
switches in this setup. Protocol variables likewise do not select alternate
exporter implementations; only the protobuf exporters are constructed.

The OTLP exporters read headers from the environment. Signal-specific
`OTEL_EXPORTER_OTLP_TRACES_HEADERS`, `OTEL_EXPORTER_OTLP_METRICS_HEADERS`, and
`OTEL_EXPORTER_OTLP_LOGS_HEADERS` values override matching base header keys.
Never log or commit real header values.

### Browser tracing switch

Browser tracing is a local-verification facility. It is assumed never to be
active in production: the switch defaults to off, and production configuration
never sets it. The application does not refuse the switch in a production
build, so keep it out of every deployed environment's configuration.

`BROWSER_TRACING_ENABLED` is decoded with the other OTEL settings. It accepts
`true`, `yes`, `on`, `1`, or `y` for on and `false`, `no`, `off`, `0`, or `n`
for off. Any other value fails startup and names the setting. Browser tracing
is effective only when the switch is on **and** OTEL is enabled. With
`OTEL_SDK_DISABLED=true` the switch has no effect.

When browser tracing is effective, every protected document (the `(app)`
route group) renders two `<meta>` elements into `<head>`:

- `name="traceparent"`: the W3C trace context of the server's handling of
  that document request, including a trace continued from an incoming
  `traceparent` header.
- `name="preets-browser-tracing"`: JSON with exactly four values:
  `endpoint` (the OTLP base URL the server exports to), `serviceName`,
  `serviceVersion`, and `serviceInstanceId` (the run identifier, from
  `service.instance.id` in `OTEL_RESOURCE_ATTRIBUTES`; absent when that key is
  missing or the list does not parse).

Public documents, such as `/login-unavailable`, `/forbidden`, and `/_test/*`,
render neither element. When browser tracing is off, no protected document
renders either element.

The page never receives collector headers. Browser export supports only
collectors that require no headers. When browser tracing is effective and
`OTEL_EXPORTER_OTLP_HEADERS` is set, startup logs one warning,
`Browser tracing exports without collector headers`, with no header names or
values. Server export still sends the headers.

Because the endpoint is rendered into the page, it must carry no credential.
With the switch on, `OTEL_EXPORTER_OTLP_ENDPOINT` must be an `http:` or
`https:` URL with no username, password, query string, or fragment. Any other
endpoint fails startup with
`BROWSER_TRACING_ENABLED requires an OTEL_EXPORTER_OTLP_ENDPOINT without credentials, query, or fragment`.
That message never quotes the URL. With the switch off, such an endpoint is
still accepted for server-only export. A malformed endpoint fails startup with
an error that names `OTEL_EXPORTER_OTLP_ENDPOINT` without quoting the value,
whatever the switch.

Local example, with the observability profile running. `start` serves a
production build, so build first; `dev` takes the same variables and needs no
build:

```sh
pnpm --filter @pathableai/pre-ets-frontend build
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318/ \
OTEL_SERVICE_NAME=pre-ets-frontend \
BROWSER_TRACING_ENABLED=true \
pnpm --filter @pathableai/pre-ets-frontend start
```

### Browser export

With browser tracing effective, the client entry (`src/instrumentation-client.ts`)
reads the `preets-browser-tracing` element before hydration. Without it, the
page loads no tracing code and sends nothing to the collector. With it, the page
lazily loads the OpenTelemetry web SDK, which:

- exports OTLP/HTTP JSON straight from the browser to `<endpoint>v1/traces`
  (for example `http://127.0.0.1:4318/v1/traces`). There is no relay on the
  application origin. The request carries no collector headers and no cookies.
- continues the document's server trace: the `documentLoad` record's parent is
  the rendered `traceparent`.
- adds `traceparent` to same-origin `fetch` requests only (data fetches, Server
  Actions, and RSC navigation payloads). Requests to other origins, including
  the identity provider and the collector, never carry it.
- sets `<html data-preets-browser-tracing="started">` once it is registered.
  Requests sent before the marker carry no browser trace context.

The collector must be reachable from the browser at that endpoint and must
accept cross-origin `POST` requests, including the CORS preflight, from the
application origin. The local `otel-lgtm` collector already allows `http://*`
origins ([Docker Compose](docker-compose.md#browser-export-and-cors)). A
collector that requires headers is not supported for browser export.

Spans are batched and exported about 30 seconds after they end. Keep the page
open that long before querying. On `pagehide` the page flushes its batch with
`keepalive` requests, so records made just before a navigation, such as a Log in
activation, are sent; records from a page that closes abruptly may still be
lost. A collector that is down or rejects export never changes the page.

Every span passes an export filter before it leaves the page. Only the record
names below and the harness records in [Browser harness facts](#browser-harness-facts)
are exported. Attributes are kept
only from the contract's allow list; `url.full` becomes `url.path`, a pathname
with no origin, query string, or fragment. Event attributes, `exception`
events, links, and status descriptions are removed. `resourceFetch` and
`CORS Preflight` spans are dropped. The resource carries only `service.name`,
`service.version`, `service.instance.id` (when rendered), and the SDK's
`telemetry.sdk.*` attributes; `telemetry.sdk.language` is `webjs` for browser
records and `nodejs` for server records. Server records carry the attributes in
[Server resource attributes](#server-resource-attributes).

| Record                                 | Emitted by                    | Attributes                                                                                                        | Parent                                                                          |
| -------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `documentLoad`                         | Document-load instrumentation | `preets.outcome` = `loaded`; `url.path`; timing events (names only)                                               | The server span that rendered the document                                      |
| `documentFetch`                        | Document-load instrumentation | `preets.outcome` = `fetched`; `url.path`                                                                          | `documentLoad`                                                                  |
| HTTP method (`GET`, `POST`, and so on) | Fetch instrumentation         | `preets.outcome` (`responded` or `network_error`); `http.request.method`; `http.response.status_code`; `url.path` | The active scope, otherwise a root; the server span of the request is its child |

Example TraceQL, after the run filter
`resource.service.version = "<sha>" && resource.service.instance.id = "<run>"`
(written `RUN`):

```text
{ RUN && resource.telemetry.sdk.language = "nodejs" && kind = server } >> { RUN && resource.telemetry.sdk.language = "webjs" && name = "documentLoad" }
{ RUN && resource.telemetry.sdk.language = "webjs" && kind = client && span.url.path = "/session/status" } > { RUN && resource.telemetry.sdk.language = "nodejs" && kind = server }
```

### Browser harness facts

While browser tracing runs, the session coordinator and the coordination
fixtures record harness facts through the shared facade
(`packages/frontend/src/shared/browser-tracing.ts`). Each fact is a
zero-duration span with closed-set attributes only. No recorder accepts page
text, accessible names, form values, message contents, or any other free text.

| Record                       | Emitted when                                                 | Attributes                                                                                                                                                                                            | Parent and correlation                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TabCoordination.transition` | The coordinator publishes a different UI state               | `preets.outcome` = `applied`; `preets.ui.from_state` (`mounted` first); `preets.ui.to_state`; `preets.ui.cause`, `preets.session.deadline_ms`, and `preets.session.server_time_ms` where listed below | The active scope (a receipt, when a message caused it). A logout or status confirmation it starts is its child                                                           |
| `TabCoordination.threshold`  | The tab reaches its warning threshold, or resumes past it    | `preets.outcome` = `reached`; `preets.ui.cause` (`threshold`, `resume`); `preets.session.deadline_ms`; `preets.session.server_time_ms`; `preets.session.warning_lead_minutes`                         | The active scope (a resume concealment, when there is one). Its child is the request it starts: the status confirmation, or the coalesced activity report it sends first |
| `TabChannel.send`            | A tab posts a cross-tab message                              | `preets.outcome` = `sent`; `preets.tab.message.kind`; `preets.tab.message.direction` = `send`; `preets.tab.message.id`                                                                                | The active scope. Every receipt of the send carries the same `preets.tab.message.id`                                                                                     |
| `TabChannel.receive`         | A tab receives a well-formed cross-tab message               | `preets.outcome` = `received`; `preets.tab.message.kind`; `preets.tab.message.direction` = `receive`; `preets.tab.message.id` (when the send carried a UUID)                                          | The active scope. Transitions the receipt causes are its children                                                                                                        |
| `Focus.move`                 | Focus enters or leaves a marked target (`data-preets-focus`) | `preets.outcome` = `moved`; `preets.focus.target`; `preets.focus.change` (`entered`, `left`); `preets.focus.cause` (`application`, `user`)                                                            | Root; order by start time                                                                                                                                                |
| `Interaction.submit`         | Any form submit, including a confirmed replay                | `preets.outcome` = `submitted`; `preets.interaction.kind` = `form_submit`                                                                                                                             | The parent of the Server Action `POST` it causes                                                                                                                         |
| `Interaction.login`          | The user activates Log in on the recovery content or modal   | `preets.outcome` = `activated`; `preets.login.entry`                                                                                                                                                  | Root, recorded before the navigation; order by start time against the next document's server spans                                                                       |
| `Interaction.continue`       | The user activates Continue on the expiration warning        | `preets.outcome` = `activated`                                                                                                                                                                        | The parent of the `POST /session/activity` it sends with `continue-session`                                                                                              |
| `Router.transition`          | Next starts an App Router navigation                         | `preets.outcome` = `started`; `preets.navigation.type` (`push`, `replace`, `traverse`); `url.path` (destination pathname)                                                                             | The parent of the RSC `GET` to that path                                                                                                                                 |
| `BrowserTracing.buffer`      | The SDK registers after more than 256 facts were buffered    | `preets.outcome` = `overflowed`; `preets.tracing.dropped_count`                                                                                                                                       | Root. Its presence makes a missing fact on that page inconclusive                                                                                                        |

The closed sets:

- UI states: `content_shown`, `content_concealed`, `expired`, `logging_out`,
  `logging_out_concealed`, `logout_failed`, `signed_out`, `recovery_expired`,
  `recovery_unavailable`, `warning_shown`. `warning_shown` is the expiration
  warning open over revealed content; a concealed tab records `content_concealed`
  even while its warning stays open.
- Transition causes: `action_denied`, set only on the transition into
  `recovery_expired` or `recovery_unavailable` after a denied action in that tab.
  `deadline` (the tab reached its local deadline, or confirmed expiry otherwise),
  `resume` (the tab returned to visibility or resumed), and `peer` (another tab's
  ended record), set on the transition into `expired`; `deadline` and `resume` also
  on `content_concealed` when that concealment began, and on the `content_shown`
  that ends it. On the transition into `warning_shown`: `threshold` (the tab
  confirmed at its local warning threshold) or `resume`. On the `content_shown`
  that leaves it: `continue` (this tab's Continue renewed), `peer` (another tab's
  `renewed` message, the transition then being that receipt's child), or `renewal`
  (another answer this tab received showed a renewal).
- Server-clock timing on those caused transitions: `preets.session.deadline_ms`, the
  held authoritative deadline, and `preets.session.server_time_ms`, the tab's
  offset-corrected server-time estimate at the transition (the later of its
  calibrated clock and the `Date` header of an `Ended` answer). Relate them to the
  server's `SessionService.*` `preets.session.deadline_ms` for the same session.
  Threshold facts and transitions into or out of `warning_shown` also carry
  `preets.session.warning_lead_minutes`, the held warning lead; on the opening,
  `preets.session.server_time_ms` is the confirming answer's server time. A
  threshold fact is never recorded with a lead of `0`.
- Log in entries: `action_recovery`, `expiration_modal`.
- Message kinds: the coordination message types with `_` for `-`:
  `communicated`, `logged_out`, `logout_failed`, `logout_started`, `pending`,
  `renewed`, `session_current`, and `window_query`.
- Focus targets: `expiration_log_in`, `logout_control`, `participant_goal`,
  `recovery_heading`, `signed_out_heading`, `warning_continue`.

`preets.focus.cause` is `application` only for a move the code makes through
`moveFocus` or `restoreFocusAsApplication`. Focus on the signed-out heading, on the
recovery heading, on the expiration modal's Log in again link, on the warning's
Continue when the warning opens and when focus found outside the warning returns to
it, focus given back to a marked target after the warning closes, and the
participant fixture's "Focus later" move are `application`. Every other change, such
as a keyboard move, is `user`.

The cross-tab match identifier is a UUID that the facade generates for each send.
It is used only for telemetry and is carried in the posted message's `telemetryId`
field. It is never derived from message contents. Without browser tracing, messages
carry no `telemetryId`. Coordination ignores the field, so a traced tab and an
untraced tab still coordinate.

Facts recorded before the SDK registers are buffered, up to 256. When the SDK
registers, they are replayed as root spans with their original start times. If
the SDK has not registered within 10 seconds, the page records no browser
telemetry. Requests sent before the readiness marker are never parented.

Server Actions and RSC navigations start outside any synchronous scope, so the
SDK wraps `fetch` to parent them on their interaction. A `submit` holds the
pending cause for the next same-origin request carrying `Next-Action`. A router
transition holds the cause for the next non-prefetch `RSC: 1` request to its
destination path. A cause is claimed once and lasts 5 seconds. Two
interactions of one kind within that time leave both requests unparented.
Only the presence of Next's own headers is read, never their values or the
request body.

Example TraceQL, written with `RUN` as above:

```text
{ RUN && name = "TabCoordination.transition" && span.preets.ui.to_state = "logging_out" } >> { RUN && resource.telemetry.sdk.language = "nodejs" && name = "logout" }
{ RUN && name = "Interaction.submit" } > { RUN && kind = client && span.http.request.method = "POST" } > { RUN && resource.telemetry.sdk.language = "nodejs" && kind = server }
{ RUN && name = "Router.transition" } > { RUN && kind = client && span.http.request.method = "GET" } > { RUN && resource.telemetry.sdk.language = "nodejs" && kind = server }
{ RUN && name = "TabCoordination.transition" } | select(span.preets.ui.from_state, span.preets.ui.to_state)
{ RUN && name = "TabChannel.receive" && span.preets.tab.message.id = "<id from a TabChannel.send>" } | select(span.preets.tab.message.kind)
{ RUN && name = "Focus.move" } | select(span.preets.focus.target, span.preets.focus.change, span.preets.focus.cause)
{ RUN && name = "TabCoordination.threshold" } >> { RUN && name = "sessionStatus" } | select(span.preets.outcome)
{ RUN && name = "Interaction.continue" } >> { RUN && name = "SessionService.refreshForTenant" } | select(span.preets.outcome, span.preets.session.activity)
```

### Startup and export policy

1. Configuration is decoded before application infrastructure is acquired.
   Missing required enabled settings, an invalid endpoint URL, or another
   configuration decoding error fails startup.
2. With `OTEL_SDK_DISABLED=true`, `NodeSdk.layerEmpty` supplies an empty Effect
   resource and the standard Node SDK is not started.
3. With OTEL enabled, exporter, processor, instrumentation, and standard Node
   SDK construction/startup errors are wrapped as
   `ObservabilityInitializationError`; application infrastructure is not
   acquired.
4. After successful initialization, collector delivery remains best-effort.
   An unreachable collector does not intentionally fail request handling or
   remove readiness.

Delivery failures follow the OpenTelemetry exporters and SDK diagnostics.
There is no application-defined fixed `telemetry delivery failed` stderr
message, and the previous custom diagnostic suppression is not installed.
The application does not set custom batch intervals or exporter timeouts;
applicable SDK defaults and environment settings apply. The periodic metric
readers use the SDK default 60-second export interval.

## Required span attributes and redaction

Each **Next.js HTTP request span** should identify method, route template,
and status/outcome when Next emits them (accepted key names):

- Method: `http.request.method` or `http.method`
- Route: `http.route` or `next.route`
- Status: `http.response.status_code` or `http.status_code`

Do **not** copy Authorization, Cookie, or other secrets onto spans. Do **not**
put secrets on `Effect.withSpan` attributes.

Query strings are not exported. Before any span reaches the exporter, the
server span processor drops `url.query`, cuts the query from `url.full`,
`http.url`, and `http.target`, and cuts it from span names and `next.span_name`
(Next.js names its fetch spans after the full URL). This covers incoming and outgoing HTTP spans,
Next.js spans, and Effect spans, so the OIDC callback's `code` and `state` are
never exported. Paths and route templates stay. Server logs and metrics carry
no request URL. Confirm the absence of query values and the required attributes
with a manual Tempo sample review.

### Server resource attributes

Every server span, log, and metric carries only these resource attributes:

- `service.name`, from `OTEL_SERVICE_NAME`.
- `service.version`. Effect spans, logs, and metrics take it from
  `OTEL_SERVICE_VERSION`. Node SDK signals (HTTP, Redis, and Next.js spans,
  and Node runtime metrics) take it only from a `service.version` entry in
  `OTEL_RESOURCE_ATTRIBUTES`, which is why verification sets both.
- Every `OTEL_RESOURCE_ATTRIBUTES` entry, including `service.instance.id`.
  Entries are exported as given, so never put personal data or secrets there.
- `telemetry.sdk.language` (`nodejs`), `telemetry.sdk.name` (`opentelemetry`
  for Node SDK signals, `@effect/opentelemetry` for Effect signals), and
  `telemetry.sdk.version`.

The Node SDK runs only its environment resource detector. Host, OS, and
process attributes such as `host.name`, `host.id`, `process.owner`,
`process.pid`, `process.command`, `process.command_args`, and
`process.executable.path` are never exported, and `OTEL_NODE_RESOURCE_DETECTORS`
has no effect.

## Verification telemetry conventions

A feature's `contracts/telemetry.md` designs the telemetry its verification
needs (see the [verification harness](engineering/verification-harness.md)).
These conventions apply to every telemetry contract and to the instrumentation
that implements it.

### Signals

- **Spans** carry facts about one operation and its causal place in a request or
  journey. Prefer annotating the existing `Effect.fn` span, named
  `Service.operation`, over adding a new span.
- **Logs** record a discrete decision that a verifier searches for by message,
  such as a rejected configuration. Use a fixed message per decision and put
  the varying facts in structured annotations.
- **Metrics** record rates and distributions across many requests, such as
  renewal outcomes per minute. Metric attributes stay low-cardinality: no
  session, trace, user, or request identifiers, and no timestamps.

### Names and values

- Custom attributes use `preets.<area>.<name>` in snake case, for example
  `preets.session.deadline_ms`. Standard OpenTelemetry semantic-convention keys
  keep their own names.
- Every span named in a telemetry contract sets `preets.outcome` to a value from
  a closed set that the contract defines, such as `renewed` or `rejected_late`.
- Times are epoch milliseconds with a `_ms` suffix. Durations are milliseconds
  with a `_duration_ms` suffix.
- Correlation uses W3C trace context, `service.version` set to the revision
  under verification, `service.instance.id` set to the verification run's
  UUID, `session.id` set to the session's opaque telemetry ID
  (never its cookie reference), and `preets.tenant.alias`.

### Data classes

| Allowed                                         | Forbidden                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| Outcomes and decisions from closed sets         | Credentials, API keys, and header values such as Authorization or Cookie        |
| Non-secret policy and configuration values      | Session references and other cookie values                                      |
| Deadlines, timestamps, durations, and counts    | Access, ID, and refresh tokens                                                  |
| Opaque identifiers generated only for telemetry | OIDC authorization codes, state, nonce, and PKCE verifiers                      |
| Tenant alias and route templates                | Personal data, including names, email addresses, and identity-provider subjects |
| Revision and environment names                  | PHI, client record content, and free text from users or the page                |

When a verifier needs a forbidden fact, the telemetry contract records how the
fact is verified instead, for example through a module test or an opaque
correlation identifier. A forbidden value found in exported telemetry is a
verification failure for the slice that emitted it.

Durable tests do not assert any of these signals; see
[Observe telemetry, do not test it](engineering/testing/README.md#observe-telemetry-do-not-test-it).

Signals already emitted by the session, coordination, and protection flows are
listed in [Session state](session-state.md#verification-signals). Reference
those rows from a feature's telemetry contract instead of redefining them.

## Local Grafana / OTLP

Optional Compose profile — see [docker-compose.md](./docker-compose.md):

```sh
docker compose --profile observability up -d otel-lgtm --wait
```

- Grafana UI: `http://127.0.0.1:3300` (anonymous **Viewer**)
- OTLP HTTP: `http://127.0.0.1:4318`

**Explore requires Editor+.** Anonymous Viewer does not show Explore. Sign in as
`admin` / `admin` (skip password change), then open Explore → Tempo.

Enable export (`.env.local` or shell) — leave `OTEL_SDK_DISABLED` unset:

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318/ \
OTEL_SERVICE_NAME=pre-ets-frontend \
pnpm --filter @pathableai/pre-ets-frontend dev
```

Quiet local without a collector requires the off switch; omitting the endpoint
while OTEL is enabled is a startup configuration error:

```sh
OTEL_SDK_DISABLED=true \
pnpm --filter @pathableai/pre-ets-frontend dev
```

```sh
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
```

In Grafana → Explore → Tempo (as admin), search service `pre-ets-frontend`.
Allow up to ~30s for batched trace/log export and ~60s for periodic metrics.

Stop only the observability service:

```sh
docker compose --profile observability stop otel-lgtm
```

## Deployed OTLP (vendor-agnostic)

Same instrumentation. Point `OTEL_EXPORTER_OTLP_ENDPOINT` (and optional
`OTEL_EXPORTER_OTLP_HEADERS`) at any OTLP/HTTP protobuf-compatible collector,
and set `OTEL_SERVICE_NAME`. No SaaS is mandated. Set
`OTEL_SDK_DISABLED=true` when export and automatic instrumentation must stay
off; leaving the endpoint unset is not the off switch.

### Second-endpoint / headers switch (SC-004)

Example against a second local listener on port `14318`:

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:14318/ \
OTEL_EXPORTER_OTLP_HEADERS='Authorization=Bearer sc004-test-token' \
OTEL_SERVICE_NAME=pre-ets-frontend \
pnpm --filter @pathableai/pre-ets-frontend start
```

Confirm the span arrives at that endpoint **and** that the synthetic header is
present on the OTLP/HTTP request. Endpoint-only receipt without header proof
does not satisfy SC-004.

## Sampling

No application sampler is configured. The providers use the OpenTelemetry SDK
defaults (parent-based sampling with an always-on root), not an unconditional
application-enforced 100% sampling policy. Production sampling policy is
deferred. Alerting and SLOs are out of scope.

## Grafana MCP for agents

Requires the optional observability profile and `uvx`. The server does nothing
useful until `otel-lgtm` is up and the frontend process was started with OTEL
enabled, a valid `OTEL_EXPORTER_OTLP_ENDPOINT`, and `OTEL_SERVICE_NAME`.
`OTEL_SDK_DISABLED=true` starts no exporters. Allow for the export delays in
[Local Grafana / OTLP](#local-grafana--otlp).

The image and digest are the `otel-lgtm` service in `compose.yaml`
(`grafana/otel-lgtm`). That image includes Tempo, Loki, and Prometheus.
Enabled OTEL exports all three signals. An empty result is inconclusive for the
reasons in [Verification](#verification).

Pinned package: **`mcp-grafana==2.0.0`**. Unversioned `uvx mcp-grafana` is not
acceptable. The committed command is read-only (`--disable-write`), disables
anonymous usage reporting, disables the raw Grafana API passthrough, and
enables only search, datasource, Prometheus, Loki, and Tempo tools.

### Connection

| Setting       | Value                                           |
| ------------- | ----------------------------------------------- |
| `GRAFANA_URL` | `http://127.0.0.1:3300`                         |
| Auth          | Anonymous org role **Viewer** (Compose default) |

Anonymous Viewer can list the local datasources and query Prometheus, Loki, and
Tempo. A query tool that returns 403 needs `datasources:query`: create a
read-only Grafana service account token and set `GRAFANA_SERVICE_ACCOUNT_TOKEN`
in the developer environment. Do not commit the token. Built-in `admin` /
`admin` or anonymous Admin are troubleshooting fallbacks only — not the
documented MCP default.

### Where the server is declared

[`.mcp.json`](../.mcp.json) is the canonical `mcpServers` definition. Claude
Code and GitHub Copilot sessions load it. Cursor and Codex do not, so the same
server is also declared in [`.cursor/mcp.json`](../.cursor/mcp.json) and
[`.codex/config.toml`](../.codex/config.toml). Edit `.mcp.json` first and keep
those copies identical. Clients ask the developer to approve the server once.
Codex skips project `.codex/` config until the checkout is trusted.

Do not commit `.vscode/mcp.json`. Copilot sessions already read `.mcp.json`.
The VS Code MCP panel uses a different key. For that panel only, translate the
canonical server to:

```json
{
  "servers": {
    "grafana": {
      "type": "stdio",
      "command": "uvx",
      "args": [
        "mcp-grafana==2.0.0",
        "--disable-write",
        "--usage-stats=disabled",
        "--disable-api",
        "--enabled-tools",
        "search,datasource,prometheus,loki,tempo"
      ],
      "env": {
        "GRAFANA_URL": "http://127.0.0.1:3300"
      }
    }
  }
}
```

### Agent query procedure

Call `list_datasources` and use the returned UIDs. On this Compose image those
UIDs are `tempo`, `loki`, and `prometheus`.

1. Traces: `search_tempo_traces` with
   `{ resource.service.name = "pre-ets-frontend" }`, then `get_tempo_trace` for
   a returned trace ID. Check that no span carries `url.query` or a query string
   in `url.full`, `http.url`, `http.target`, `next.span_name`, or its name; a query value there is
   forbidden data. Check that the trace's server resources carry no `host.*`,
   `os.*`, or `process.*` attribute (see
   [Server resource attributes](#server-resource-attributes)); one there is
   forbidden data. Do not copy Authorization, Cookie, query values, or collector
   headers into the chat.
2. Logs: with OTEL enabled, use `query_loki_logs` for exported Effect logs.
   Local console output remains on the Next process. An empty result alone is
   not evidence that the app logged nothing.
3. Metrics: with OTEL enabled, use `query_prometheus` for Effect and Node
   runtime metrics. An empty result alone is not evidence that the app emitted
   none; allow for the 60-second reader interval. Resource attributes appear as
   `target_info` labels; check that none is a `host_*`, `os_*`, or `process_*`
   label.

### Human verification checklist (SC-006)

Use when CI cannot run MCP. Complete before merge:

1. `docker compose --profile observability up -d otel-lgtm --wait` succeeds; Grafana opens
   at `http://127.0.0.1:3300`.
2. Next starts with the required endpoint and service name and exports at least
   one span after traffic. Query Loki and Prometheus as needed for the change;
   do not treat an empty result as conclusive without checking export timing
   and delivery.
3. Use the committed `mcp-grafana==2.0.0` command (`--disable-write`,
   `--usage-stats=disabled`).
4. From an MCP client, `list_datasources` and one `search_tempo_traces` for
   `pre-ets-frontend` succeed on the first attempt. A 403 on the Tempo search
   means the Viewer role cannot query and the token path above is required.
5. Record commands + outcome as PR/acceptance evidence.

Docs-only command lists without a live success are not SC-006 evidence.

## Out of scope (stubs)

- Browser RUM, browser metrics, and browser logs (browser tracing exports
  traces only)
- Independent per-signal enablement, signal-specific collector endpoints, and
  alternate JSON HTTP or gRPC exporters
- A second OTLP export pipeline alongside the shared processors (including
  Effect `OtlpTracer`)
- Production sampling policies, alerting, and SLOs
- Hosted vendor selection
- `packages/backend` process instrumentation
