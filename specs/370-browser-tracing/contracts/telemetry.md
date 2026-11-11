# Verification Telemetry Contract: Browser Tracing for the Verification Harness

**Plan**: [plan.md](../plan.md)

**Feature verification**: [verification.md](../verification.md)

**Module contracts**: [modules.md](modules.md)

**Status**: Planned design — no instrumentation exists until an implementation slice adds it

This contract designs the runtime telemetry a verification agent needs for the feature's claims. It follows the
[verification telemetry conventions](../../../docs/observability.md#verification-telemetry-conventions) and the
[verification harness](../../../docs/engineering/verification-harness.md). Instrumentation listed here is committed
product code. Durable tests do not assert it.

Browser and server records share `service.name`, `service.version`, and `service.instance.id`. They are told apart by
the SDK resource attribute `telemetry.sdk.language`: `webjs` for the browser, `nodejs` for the server. Server rows are
the existing [session verification signals](../../../docs/session-state.md#verification-signals) and the Node HTTP
server spans; this feature references them and adds none.

## Observation coverage

Every claim in `verification.md` whose evidence channel includes browser or server telemetry appears here.

| Claim IDs | Required observation (from `verification.md`)                                                                                     | Signal rows                                   | Slice                       |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------- |
| V-001     | The browser transition and the server record of the request it caused share a trace, server below the browser request             | T-004, T-003; server `logout` span            | `facts`                     |
| V-002     | The server record of each request kind continues the browser's trace (server part; headers are browser interaction)               | T-003; server HTTP and `protectRequest` spans | `export`                    |
| V-004     | The browser document-load record has the trace ID of the server render whose context the document carries                         | T-001, T-002; server HTTP server span         | `export`                    |
| V-005     | No second document-load record joins the original render's trace after a back/forward restoration                                 | T-001                                         | `export`                    |
| V-006     | Run filters select the run's browser records and none of another run's                                                            | Resource of T-001–T-007                       | `export`                    |
| V-011     | Exported browser records arrive in the trace store (acceptance itself is browser interaction)                                     | T-001                                         | `export`                    |
| V-013     | Each concealment, restoration, and signed-out transition is recorded with closed-set states, in Playwright's order                | T-004                                         | `facts`                     |
| V-014     | Tab A's send and tab B's receipt exist with the same kind and can be matched without contents                                     | T-005, T-006                                  | `facts`                     |
| V-015     | Application and user focus moves are recorded with a planned target and the correct cause                                         | T-007                                         | `facts`                     |
| V-016     | No exported browser attribute or event value contains probe values, query strings, fragments, message contents, or forbidden data | All browser rows; export filter allow list    | `export` (partial), `facts` |
| V-017     | A fresh setup from the docs yields accepted export and queryable browser records                                                  | T-001                                         | `facts`                     |

## Signals

All browser rows are spans emitted from `packages/frontend/src/shared/browser-tracing.ts` or an instrumentation it
registers, and pass the export filter. `<run>` is the run UUID and `<sha>` the revision. Each query below is preceded
by the run filter `resource.service.version = "<sha>" && resource.service.instance.id = "<run>"`, written as `RUN`.

| ID    | Signal | Name                                                | Emitted by                                                  | Attributes and data class                                                                      | Correlation                                                                                                     | Verifier query                                                                                                                                                                                                                                                                                        | Expected negative observation                                                                                                              |
| ----- | ------ | --------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| T-001 | Span   | `documentLoad`                                      | `DocumentLoadInstrumentation` via the facade's SDK module   | `preets.outcome`; `url.path` (route path, no query or fragment); timing events with names only | Parent is the rendered `traceparent`: the server span that rendered the document                                | `{ RUN && resource.telemetry.sdk.language = "nodejs" && kind = server } >> { RUN && resource.telemetry.sdk.language = "webjs" && name = "documentLoad" }`                                                                                                                                             | V-004: `documentLoad` is a root, or its trace has no server span. V-005: `{ RUN && name = "documentLoad" } \| count() > 1` returns a trace |
| T-002 | Span   | `documentFetch`                                     | `DocumentLoadInstrumentation`                               | `preets.outcome`; `url.path`                                                                   | Child of T-001                                                                                                  | `{ RUN && name = "documentLoad" } > { RUN && name = "documentFetch" }`                                                                                                                                                                                                                                | Missing under a T-001                                                                                                                      |
| T-003 | Span   | HTTP method (`GET`, `POST`)                         | `FetchInstrumentation`                                      | `preets.outcome`; `http.request.method`; `http.response.status_code`; `url.path`               | Child of the active scope when started inside one; otherwise a root. Its `traceparent` is sent same-origin only | V-002: `{ RUN && resource.telemetry.sdk.language = "webjs" && kind = client && span.url.path = "<path>" } > { RUN && resource.telemetry.sdk.language = "nodejs" && kind = server }`                                                                                                                   | The server span for the request is in another trace or is a root                                                                           |
| T-004 | Span   | `TabCoordination.transition`                        | `recordUiTransition`, called by `TabCoordination`           | `preets.outcome`; `preets.ui.from_state`; `preets.ui.to_state` (closed sets below)             | Child of the active scope (a receipt, when a message caused it); the request it causes is its child             | V-001: `{ RUN && name = "TabCoordination.transition" && span.preets.ui.to_state = "logging_out" } >> { RUN && resource.telemetry.sdk.language = "nodejs" && name = "logout" }`. V-013: `{ RUN && name = "TabCoordination.transition" } \| select(span.preets.ui.from_state, span.preets.ui.to_state)` | V-001: no trace matches. V-013: a Playwright-observed transition has no span, or span start times order differently                        |
| T-005 | Span   | `TabChannel.send`                                   | `recordTabMessageSend`, called by `tab-channel.ts`          | `preets.outcome`; `preets.tab.message.kind`; `preets.tab.message.direction` = `send`           | Child of the active scope; parent of every T-006 receipt of this send                                           | `{ RUN && name = "TabChannel.send" && span.preets.tab.message.kind = "logged_out" } > { RUN && name = "TabChannel.receive" }`                                                                                                                                                                         | A send whose receipt in a live tab is missing or has another kind                                                                          |
| T-006 | Span   | `TabChannel.receive`                                | `recordTabMessageReceipt`, called by `tab-channel.ts`       | `preets.outcome`; `preets.tab.message.kind`; `preets.tab.message.direction` = `receive`        | Child of the matching T-005 (parent span ID equals the send's span ID); transitions it causes are its children  | `{ RUN && name = "TabChannel.receive" } \| select(span.preets.tab.message.kind)`; match by parent span ID in `get_tempo_trace`                                                                                                                                                                        | A receipt that is a root, or whose parent is not a send of the same kind                                                                   |
| T-007 | Span   | `Focus.move`                                        | The facade's focus recorder (document `focusin`/`focusout`) | `preets.outcome`; `preets.focus.target`; `preets.focus.change`; `preets.focus.cause`           | Root span; ordered by start time with T-004                                                                     | `{ RUN && name = "Focus.move" } \| select(span.preets.focus.target, span.preets.focus.change, span.preets.focus.cause)`                                                                                                                                                                               | The signed-out heading focus shows `user`, a keyboard move to Log out shows `application`, or a move is missing                            |
| T-008 | Log    | `Browser tracing exports without collector headers` | `BrowserTracing.layer` at startup                           | `preets.outcome` not applicable (log); no annotations beyond the standard resource             | `service_instance_id` label                                                                                     | `{service_name="pre-ets-frontend", service_instance_id="<run>"} \|= "Browser tracing exports without collector headers"`                                                                                                                                                                              | Diagnostic only; no claim depends on it                                                                                                    |

Every verifier query filters by the run resource attributes `service.version` (the revision under verification)
and `service.instance.id` (the verification run's UUID). Spans and correlated logs may also correlate by trace
context, `session.id`, and `preets.tenant.alias`. Metrics never carry session, trace, user, or request identifiers
or timestamps as attributes; they correlate only by the run resource attributes, environment, and the
low-cardinality attributes listed under [Metrics cardinality](#metrics-cardinality).

### Resource (all browser rows)

`service.name`, `service.version`, `service.instance.id` (when the server has one), and the SDK's
`telemetry.sdk.language`, `telemetry.sdk.name`, and `telemetry.sdk.version`. Nothing else.

### Attribute allow list (export filter)

`preets.outcome`, `preets.ui.from_state`, `preets.ui.to_state`, `preets.tab.message.kind`,
`preets.tab.message.direction`, `preets.focus.target`, `preets.focus.change`, `preets.focus.cause`,
`http.request.method`, `http.response.status_code`, `url.path`. `url.full` is rewritten to `url.path` (the URL's
pathname). Every other attribute and every event attribute is removed, and `exception` events are dropped. The span
status code is kept and its description is cleared. Spans other than T-001–T-007, including `resourceFetch` and
`CORS Preflight`, are dropped. This covers every text-bearing field FR-021a names: record names are fixed contract or
instrumentation strings, and no attribute, event, or status value passes unless it is a closed-set value, a method,
a status code, or a path.

The cross-tab match identifier is the `TabChannel.send` span ID, which every receipt carries as its parent span ID
(research D8). It is generated by the SDK for telemetry only.

### Closed sets

| Attribute                      | Values                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `preets.ui.from_state`         | `mounted` (coordinator's first state), plus every `preets.ui.to_state` value                                             |
| `preets.ui.to_state`           | `content_shown`, `content_concealed`, `logging_out`, `logging_out_concealed`, `logout_failed`, `signed_out`              |
| `preets.tab.message.kind`      | `communicated`, `logged_out`, `logout_failed`, `logout_started`, `pending`, `renewed`, `session_current`, `window_query` |
| `preets.tab.message.direction` | `send`, `receive`                                                                                                        |
| `preets.focus.target`          | `logout_control`, `signed_out_heading`                                                                                   |
| `preets.focus.change`          | `entered`, `left`                                                                                                        |
| `preets.focus.cause`           | `application` (focus moved by `moveFocus`), `user` (any other focus change)                                              |

The UI state is derived from the coordinator's `(view, concealed)`: `active` and not concealed is `content_shown`,
`active` and concealed is `content_concealed`, `logging-out` is `logging_out` or `logging_out_concealed`,
`logout-failed` is `logout_failed`, and `ended` is `signed_out`. Spec scenarios map as: concealment
`content_shown → content_concealed`; restoration after confirmation `content_concealed → content_shown`; signed-out
notice `* → signed_out`. A later feature (for example #156) extends these sets in its own telemetry contract.

### Outcome values

| Signal | `preets.outcome` values and meaning                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------- |
| T-001  | `loaded`: the document's load timing was recorded                                                         |
| T-002  | `fetched`: the document response timing was recorded                                                      |
| T-003  | `responded`: an HTTP response arrived (any status); `network_error`: no response (network failure, abort) |
| T-004  | `applied`: the coordinator published the new state                                                        |
| T-005  | `sent`: the message was posted to the channel                                                             |
| T-006  | `received`: a well-formed message was delivered to this tab                                               |
| T-007  | `moved`: focus entered or left the target                                                                 |

## Facts not emitted

| Claim IDs    | Fact                                                                | Why it is not emitted                                         | How it is verified instead                                                      |
| ------------ | ------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| V-016        | Page text, accessible names, form values                            | Free text from users or the page                              | Browser interaction; no recorder accepts a string other than a closed-set value |
| V-016        | Query strings and fragments                                         | Forbidden by the issue and spec                               | Export filter keeps `url.path` only; V-016 searches for probe values            |
| V-014, V-016 | Message contents, including the coordination tag, attempt ID, times | Coordination tag and contents are forbidden                   | Send/receipt matching by parent span (research D8)                              |
| V-009, V-010 | Collector headers, cookies, session references, tokens, OIDC values | Forbidden data classes; never given to the page               | Browser interaction on the rendered document and export requests                |
| V-003, V-008 | Absence of browser context on cross-origin or off-mode requests     | Telemetry cannot record its own absence                       | Browser interaction (request headers)                                           |
| V-016        | `user_agent.original`, `server.address`, resource-timing URLs       | Not needed by any claim; resource URLs may carry query values | Removed by the export filter                                                    |
| —            | Malformed cross-tab messages                                        | No closed-set kind exists for them                            | Existing coordination module tests                                              |

## Metrics cardinality

No metrics. The browser exports traces only.

## Verifier environment

- The standard harness environment plus `BROWSER_TRACING_ENABLED=true`. `OTEL_RESOURCE_ATTRIBUTES` must include
  `service.instance.id=<run>` so the page receives the run identifier.
- `OTEL_EXPORTER_OTLP_ENDPOINT` must be reachable from the browser, normally `http://127.0.0.1:4318/`.
- Wait for `<html data-preets-browser-tracing="started">` before a sampled step (plan limitation PL-1), and keep the
  page open about 30 seconds after the last step so the batch processor exports (spec L2).
- Synthetic header value only for V-009/V-010; never repeat it in a report.

## Readiness review

- [x] Every telemetry-channel claim in `verification.md` maps to at least one signal row or a stated alternative.
- [x] Every signal names its emitting module, its query, and the observation that shows a violation.
- [x] No attribute or field falls in a forbidden data class.
- [x] Metric attributes are low-cardinality.
- [x] Every signal is assigned to the implementation slice that implements the behavior it observes.
