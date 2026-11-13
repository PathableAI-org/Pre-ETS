# Verification Telemetry Contract: Protect Expired Content and Offer Explicit Accessible Recovery

**Plan**: [plan.md](../plan.md)

**Feature verification**: [verification.md](../verification.md)

**Module contracts**: [modules.md](modules.md)

**Status**: Planned design. No instrumentation exists until an implementation slice adds it.

This contract designs the runtime telemetry a verification agent needs for the feature's claims. It follows the
[verification telemetry conventions](../../../docs/observability.md#verification-telemetry-conventions) and the
[verification harness](../../../docs/engineering/verification-harness.md). Instrumentation listed here is committed
product code. Durable tests do not assert it.

Existing signals are reused, not redefined: the [session-state signals](../../../docs/session-state.md#verification-signals)
(`protectRequest`, `SessionService.*`, `authorizeSessionAction`, `sessionStatus`, `AuthenticationService.complete`),
the login span `prepareAuthentication` with its child `AuthenticationService.prepare`, and the
[browser harness facts](../../../docs/observability.md#browser-harness-facts) (`TabCoordination.transition`,
`TabChannel.*`, `Focus.move`, `Interaction.submit`).

## Observation coverage

Every claim in `verification.md` whose evidence channel includes server or browser telemetry appears here.

| Claim IDs | Required observation (from `verification.md`)                                                                                                       | Signal rows                                                                                                                                               | Slice                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| V-001     | Per protected Server Action: session classification (expired, missing, no reference) and whether the operation ran, attributable to tenant and step | T-001; existing `SessionService.read` outcome; existing `authorizeSessionAction` (absent when the gate denied, `no_session` when the action did)          | A1 (A2: action-level path) |
| V-002     | Whether any login transaction began between the denial and Log in activation                                                                        | Existing `prepareAuthentication` / `AuthenticationService.prepare` absence; T-001 time; T-005 time                                                        | A1 (A3, B add T-005)       |
| V-009     | Per tab, time from the authoritative deadline to concealment and the modal                                                                          | T-003 (`expired`, timing); existing `SessionService.*` `preets.session.deadline_ms`                                                                       | B                          |
| V-010     | A tab's state across its local deadline while another tab's renewal kept the session valid                                                          | T-003 (absence of `expired`; `content_concealed` with cause `deadline` followed by `content_shown`); existing `SessionService.refreshForTenant` `renewed` | B                          |
| V-016     | Per resume case: concealment, restoration, or the expired state, and timing relative to the deadline and the confirmation                           | T-003 (cause `resume`, timing); existing `sessionStatus` outcome                                                                                          | B                          |
| V-019     | Per Log in: entry point, the freshness outcome, the new session's identity, and the old reference's denial                                          | T-005; existing `AuthenticationService.complete`, `SessionService.establish` `session.id`, `protectRequest`                                               | A3, B (run in C)           |
| V-020     | No server login activity from recovery or modal display until Log in activation                                                                     | T-002 / T-003 display time; T-005; absence of `prepareAuthentication` between them                                                                        | A3, B (run in C)           |
| V-021     | Per failed Log in from each entry point: no session established, and a later Log in succeeds                                                        | T-005; existing `AuthenticationService.complete` (`denied`, `not_fresh_stale`, `unavailable`) without `SessionService.establish`                          | C                          |
| V-022     | After a fresh login in tab A, tab B stays expired, and its later content comes from a new render                                                    | T-003 (B stays `expired`, no later `content_shown` from that document); a new document's `mounted` → `content_shown`; T-005 in B                          | B (run in C)               |

Claims whose channels are only browser interaction, assistive technology, or requirements BDD (V-003–V-008,
V-011–V-015, V-017, V-018, V-023, V-024) need no committed telemetry. T-002 and T-004 also help the verifier
correlate those steps, but they establish none of them.

## Signals

| ID    | Signal | Name                                                   | Emitted by                                                                                                 | Attributes or fields and data class                                                                                                                                                                                                                                                                                                                                                                                            | Correlation                                                                                                                                                                                                            | Verifier query                                                                                                                                                                                                                                                                                           | Expected negative observation                                                                                                                                                                                                                                                                                                                                                   |
| ----- | ------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-001 | Span   | `protectRequest` (existing `Effect.fn`, annotated)     | `frontend-services/src/next/protection.ts`                                                                 | Existing attributes, plus `preets.protection.server_action`: `fetch`, `document`, `none` (closed-set decision; set on every gated request). `preets.protection.denial_cause`: `expired`, `unknown` (closed-set decision; set only with outcome `denied_unauthenticated` on a Server Action candidate).                                                                                                                         | W3C trace context: the verifier's `traceparent` for untraced steps, or the browser's `Interaction.submit` parent under browser tracing. `preets.tenant.alias`. Child `SessionService.read` (`session.id` when decoded) | `{ resource.service.version = "<sha>" && resource.service.instance.id = "<run-uuid>" && name = "protectRequest" && span.preets.protection.server_action != "none" } \| select(span.preets.outcome, span.preets.protection.server_action, span.preets.protection.denial_cause, span.preets.tenant.alias)` | A denied candidate with outcome other than `denied_unauthenticated`. An `authorizeSessionAction` span in the same trace as a gate denial. `denial_cause = expired` while the child `SessionService.read` is `missing`. Any `prepareAuthentication` span in the denial's trace.                                                                                                  |
| T-002 | Span   | `TabCoordination.transition` (existing fact, extended) | `frontend/src/shared/browser-tracing.ts`, recorded by the session coordinator                              | New `preets.ui.to_state` values `recovery_expired`, `recovery_unavailable` (closed set). New `preets.ui.cause`: `action_denied` on these transitions (closed set).                                                                                                                                                                                                                                                             | Active scope: under the `sessionStatus` read the denial started, and after the `Interaction.submit` whose `POST` was denied. Run resource attributes                                                                   | `{ RUN && name = "TabCoordination.transition" && span.preets.ui.cause = "action_denied" } \| select(span.preets.ui.from_state, span.preets.ui.to_state)`                                                                                                                                                 | `recovery_expired` where the step expected "no longer available", or the reverse (compare with T-001 `denial_cause` and the step's deadline). Any `TabChannel.send` from the denied tab between the submit and the recovery transition (FR-008). A recovery transition in a tab that did not submit.                                                                            |
| T-003 | Span   | `TabCoordination.transition` (existing fact, extended) | `frontend/src/shared/browser-tracing.ts`, recorded by the session coordinator                              | New `preets.ui.to_state` value `expired`. `preets.ui.cause`: `deadline`, `resume`, `peer` (closed set) on transitions to `expired`, `content_concealed`, and `content_shown` that leave concealment. On those transitions: `preets.session.deadline_ms` (held authoritative deadline, server clock; deadline) and `preets.session.server_time_ms` (the tab's server-clock estimate at the transition, research D7; timestamp). | Active scope: under the `TabChannel.receive` for `peer`, otherwise the confirmation's own scope. `preets.session.deadline_ms` matches `SessionService.*` deadlines for the same session                                | `{ RUN && name = "TabCoordination.transition" && span.preets.ui.to_state = "expired" } \| select(span.preets.ui.cause, span.preets.session.deadline_ms, span.preets.session.server_time_ms)` and, for V-010/V-016, the same with `span.preets.ui.cause =~ "deadline\|resume"`                            | For a running tab, `server_time_ms − deadline_ms > 2000` on `expired` (V-009). Any `expired` while a later `SessionService.refreshForTenant` `renewed` deadline exceeds `server_time_ms` (V-010). On resume past the deadline, `content_shown` before the confirmation answered, or no `content_concealed` first (V-016). `expired` after `signed_out` in the same tab (V-017). |
| T-004 | Span   | `Focus.move` (existing fact, extended)                 | `frontend/src/shared/browser-tracing.ts`, marked targets in the recovery notice (A3) and modal (B)         | New `preets.focus.target` values `recovery_heading` (A3) and `expiration_log_in` (B) (closed set)                                                                                                                                                                                                                                                                                                                              | Root; ordered by start time                                                                                                                                                                                            | `{ RUN && name = "Focus.move" && span.preets.focus.target =~ "recovery_heading\|expiration_log_in" } \| select(span.preets.focus.change, span.preets.focus.cause)`                                                                                                                                       | Diagnostic only. V-007 and V-014 are established by browser interaction and assistive technology.                                                                                                                                                                                                                                                                               |
| T-005 | Span   | `Interaction.login` (new fact)                         | `frontend/src/shared/browser-tracing.ts` `recordLoginActivation`, called from the Log in link's activation | `preets.outcome`: `activated`. `preets.login.entry`: `action_recovery` (A3), `expiration_modal` (B) (closed set). No URL, text, or identity                                                                                                                                                                                                                                                                                    | Root, recorded before the navigation; ordered by start time against the next document's server spans (`prepareAuthentication`, `AuthenticationService.complete`, `SessionService.establish`) in the same run           | `{ RUN && name = "Interaction.login" } \| select(span.preets.login.entry)`, then `{ RUN && name = "AuthenticationService.complete" } \| select(span.preets.outcome, span.preets.authentication.freshness_position)` and `{ RUN && name = "SessionService.establish" }` after its start time              | A `prepareAuthentication` span earlier than the tab's first `Interaction.login` after the recovery or `expired` transition (V-020). `SessionService.establish` after a T-005 whose following `AuthenticationService.complete` is not `confirmed` (V-021). The old `session.id` admitted after T-005 (V-019).                                                                    |

`RUN` stands for `resource.service.version = "<sha>" && resource.service.instance.id = "<run-uuid>"`. Every verifier
query filters by both run resource attributes. Spans may also correlate by trace context, `session.id`, and
`preets.tenant.alias`. Browser facts carry no `session.id` or tenant. Relate them to server spans by run, order, and
`preets.session.deadline_ms`.

Browser records T-002 to T-005 are exported only when browser tracing runs (protected `(app)` documents with
`BROWSER_TRACING_ENABLED=true`). Every new span name and attribute key is added to
`shared/browser-tracing/export-filter.ts` in the slice that first emits it. The gate's no-script recovery document is
public and runs no browser tracing. Its steps rely on T-001 and the verifier's own `traceparent`.

### Outcome values

| Signal | `preets.outcome` values and meaning                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| T-001  | Unchanged set (`admitted`, `redirected_login`, `denied_unauthenticated`, `denied_forbidden`, `unavailable`, `tenant_failure`).        |
| T-002  | `applied` (unchanged for transitions).                                                                                                |
| T-003  | `applied` (unchanged for transitions).                                                                                                |
| T-004  | `moved` (unchanged).                                                                                                                  |
| T-005  | `activated`: the user activated Log in on the recovery notice or the modal. The only value. Absence means no activation was observed. |

New closed sets introduced here, each reachable:

| Attribute                         | Values and how each is reached                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preets.protection.server_action` | `fetch`: JS submit. `document`: no-script submit. `none`: any other request.                                                                             |
| `preets.protection.denial_cause`  | `expired`: a candidate arriving while the record is past its deadline but not yet evicted (rare, research L-2). `unknown`: every other denial.           |
| `preets.ui.to_state` (added)      | `recovery_expired`, `recovery_unavailable`: a denied JS action. `expired`: confirmed expiry.                                                             |
| `preets.ui.cause`                 | `action_denied`: A3 recovery. `deadline`: confirmation at the local deadline. `resume`: visibility, `resume`, or unfreeze. `peer`: another tab's record. |
| `preets.focus.target` (added)     | `recovery_heading`, `expiration_log_in`.                                                                                                                 |
| `preets.login.entry`              | `action_recovery`, `expiration_modal`.                                                                                                                   |

## Facts not emitted

| Claim IDs                  | Fact                                                              | Why it is not emitted                                 | How it is verified instead                                                                                       |
| -------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| V-003, V-004, V-018, V-024 | Recovery and modal text, accessible names, live-region output     | Free page text; screen-reader output is never emitted | Browser interaction (text, roles, names) and assistive technology                                                |
| V-001                      | The protected operation's effect (receipt cookie)                 | Cookie value                                          | Requirements BDD: no receipt cookie in the response; T-001 plus absence of `authorizeSessionAction` `authorized` |
| V-019, V-022               | Which tab or document a browser fact came from                    | No tab identifier exists, and none is minted for this | Verifier step order: one tab is acted on per step; a new document starts with `from_state = mounted`             |
| V-019, V-021               | Session reference, coordination tag, subject, tokens, `auth_time` | Forbidden data classes                                | `session.id` on existing session spans; #158's freshness attributes                                              |
| V-005                      | Whether the tab's timers were suspended                           | Harness condition, not a product fact                 | Recorded by the verifier from the Playwright clock control it applied                                            |
| V-016                      | Pixels painted before scripts ran on resume                       | Outside application control (B5 limitation)           | Not established; observation starts at the first script-controlled frame                                         |
| V-009–V-016                | The browser's own clock reading                                   | Would mislead without the offset                      | `preets.session.server_time_ms` is already offset-corrected (research D7)                                        |

## Metrics cardinality

No metrics.

## Verifier environment

- Standard harness environment: `OTEL_SERVICE_VERSION=<sha>`, `OTEL_RESOURCE_ATTRIBUTES` including
  `service.version=<sha>,service.instance.id=<run-uuid>`, `BROWSER_TRACING_ENABLED=true` for browser-telemetry
  steps, a `preets:verify:<run-uuid>:` Redis prefix, and owned ports.
- A scratch Springfield tenant copy with `idleTimeoutMinutes: 5` for natural expiry. Playwright clock control for
  suspended or delayed timers (research D13).
- The tracked Keycloak realm, including `stale-auth-time-web` and `consent-web` for slice C.
- Export delays: about 30 s for traces. Keep each page open 30 s after its last sampled step, and wait for
  `data-preets-browser-tracing="started"` before sampled steps.

## Readiness review

- [x] Every telemetry-channel claim in `verification.md` maps to at least one signal row or a stated alternative.
- [x] Every signal names its emitting module, its query, and the observation that shows a violation.
- [x] No attribute or field falls in a forbidden data class.
- [x] Metric attributes are low-cardinality (no metrics).
- [x] Every signal is assigned to the implementation slice that implements the behavior it observes.
