# Feature Specification: Browser Tracing for the Verification Harness

**Feature Branch**: `370-browser-tracing`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "https://github.com/PathableAI-org/Pre-ETS/issues/368"

## User Scenarios & Testing _(mandatory)_

The consumers of this feature are the verification agent described in the
[verification harness](../../docs/engineering/verification-harness.md), the developer who runs the application
locally with tracing enabled, and the reviewer who must trust that browser telemetry carries no forbidden data. No end
user of the product sees any change.

### User Story 1 - Correlate a Browser Transition with the Server Request It Caused (Priority: P1)

As a verification agent checking an implementation slice, I can run a browser journey against a local build with
server telemetry and browser tracing enabled and find, under one trace, the browser's record of a UI transition and
the server's record of the request that transition caused.

**Why this priority**: This is the issue's done-when outcome. Without one trace that spans both processes, a verifier
still has to infer browser behavior from browser interaction alone.

**Independent Test**: With both switches on and the local collector running, drive a UI transition that sends a
same-origin request, for example activating the logout control. Query the trace store by the run's revision and run
identifier and confirm that one trace holds the browser transition and the server's handling of the resulting request,
in causal order.

**Acceptance Scenarios**:

1. **Given** server telemetry and browser tracing are both on, **When** a UI transition in the page causes a
   same-origin request, **Then** the exported browser record of the transition and the exported server record of that
   request share one trace, and the server record is a descendant of the browser's request.
2. **Given** both switches are on, **When** the page issues a same-origin fetch request of any kind it uses today,
   including ordinary data fetches, form actions handled by the server, and server-rendered navigation payloads,
   **Then** the request carries W3C trace context from the browser and the server continues that trace. Full document
   navigations cannot carry a header from the page and are covered by User Story 4.
3. **Given** both switches are on, **When** the page sends a request to another origin, including the identity provider
   and the collector itself, **Then** the browser adds no trace context to that request.
4. **Given** a verification run sets its revision and run identifier on the server, **When** the browser exports, **Then**
   browser telemetry carries the same service name, revision, and run identifier, so the verifier's existing filters
   select browser and server records of that run together.

---

### User Story 2 - Keep Browser Tracing Off Unless Both Switches Are On (Priority: P1)

As a developer or operator, I get no browser tracing unless I turn on both server telemetry and the separate
browser-tracing switch. When either is off, the page runs no browser tracing at all.

**Why this priority**: Browser tracing exposes the collector endpoint to the page and adds client work. Off-by-default,
with no residual activity when off, is the condition that makes it safe to add.

**Independent Test**: Start the application in each of the four switch combinations, load a protected page and
perform a UI transition, and observe from the browser what the page received and sent.

**Acceptance Scenarios**:

1. **Given** the browser-tracing switch is not set, **When** the application starts with server telemetry on, **Then**
   browser tracing is off.
2. **Given** server telemetry is off, **When** the browser-tracing switch is on, **Then** browser tracing is off.
3. **Given** browser tracing is off for either reason, **When** a page loads and the user interacts with it, **Then** the
   page receives no browser-tracing configuration and no rendered trace context, no browser tracing starts, the browser
   sends nothing to the collector, and no browser-originated trace context is added to any request.
4. **Given** both switches are on, **When** a page loads, **Then** the page receives exactly the browser configuration:
   the collector endpoint, the service name (the same as the server's), the revision, and the run identifier, and
   nothing else from the server's telemetry settings.
5. **Given** the browser-tracing switch holds a value that is not a recognized on or off value, **When** the application
   starts, **Then** browser tracing is not enabled by it.

---

### User Story 3 - Trust That Browser Telemetry Carries No Forbidden Data (Priority: P1)

As a reviewer, I can rely on exported browser telemetry carrying only closed-set facts, opaque telemetry identifiers,
and route-level locations, never page content, form input, query strings, or any value from the forbidden data
classes.

**Why this priority**: The browser sees protected content, form input, and session state. A trace that leaks any of it
turns a verification aid into a confidentiality failure.

**Independent Test**: With both switches on, run a journey that types into fields, displays protected content, follows
links with query strings, exchanges cross-tab messages, and logs out. Inspect every exported browser attribute and
event for the run.

**Acceptance Scenarios**:

1. **Given** a journey that displays protected content and accepts typed input, **When** its browser telemetry is
   exported, **Then** no exported value contains page text, accessible names, form values, or other free text.
2. **Given** a journey whose pages and requests have query strings or fragments, **When** browser telemetry is exported,
   **Then** locations appear only as a path or route template without query string or fragment.
3. **Given** cross-tab messages that coordinate a session, **When** their send and receipt are recorded, **Then** only the
   message kind, the direction, and an opaque identifier generated only for telemetry to match a send with its
   receipts are exported, never the message contents.
4. **Given** any browser journey, **When** browser telemetry is exported, **Then** it contains no credential, header value,
   cookie or session reference, token, OIDC protocol value, personal data, or PHI, as defined by the
   [data classes](../../docs/observability.md#data-classes).

---

### User Story 4 - Continue the Server Trace Through a Document Navigation (Priority: P2)

As a verification agent, when the browser loads a page by full document navigation, I can find the browser's record
of that document load in the same trace as the server's handling of the document request.

**Why this priority**: Many transitions in this product end in a full navigation, such as fresh entry and sign-in
redirects. A document navigation cannot carry request headers from the page, so without this the load starts an
unrelated trace.

**Independent Test**: With both switches on, navigate to a protected page by URL. Confirm that the browser's
document-load record and the server's record of rendering that document share one trace.

**Acceptance Scenarios**:

1. **Given** both switches are on, **When** the server renders a document, **Then** the document carries the trace
   context of the server's handling of that request, and the browser's document-load record continues that trace.
2. **Given** a document served from the back/forward cache or otherwise not rendered by the server for this load,
   **When** it becomes visible, **Then** the browser does not attribute the restoration to the stale server trace as if
   it were a new document load.

---

### User Story 5 - Observe Harness Facts in the Browser (Priority: P2)

As a verification agent, I can observe from browser telemetry the client-side facts that browser interaction alone
cannot timestamp or order reliably: UI state transitions, cross-tab message send and receipt, and focus changes.

**Why this priority**: These are the facts the harness currently records as gaps. #156 (warning before expiration) is
the first feature whose verification depends on them.

**Independent Test**: With both switches on, open two sharing tabs, perform an activity and a logout in one, and
confirm that the exported browser telemetry of both tabs records each state transition, each message sent and
received, and each focus move, with closed-set values and in causal order.

**Acceptance Scenarios**:

1. **Given** a client-side UI state change the application makes today, such as concealing protected content,
   restoring it after confirmation, or showing the signed-out notice, **When** it happens, **Then** browser telemetry
   records the transition as a closed-set from-state and to-state.
2. **Given** two tabs that share a session, **When** one sends a cross-tab message and the other receives it, **Then**
   browser telemetry of each tab records the send or receipt with its closed-set message kind, and the verifier can
   match a send to its receipts.
3. **Given** focus moves to or from a control or region the application identifies, including focus the application
   moves itself, **When** it moves, **Then** browser telemetry records the move with a closed-set identifier for the
   target and whether the application or the user caused it.
4. **Given** a later feature adds a UI state, message kind, or focus target, **When** its telemetry contract names it,
   **Then** it extends the closed set rather than recording a free-form value.

---

### User Story 6 - Export Straight to a Local Collector (Priority: P2)

As a developer, I can enable browser tracing locally against the repository's collector by following the documentation,
and the browser exports directly to the collector without a relay through the product's own origin.

**Why this priority**: The direct path is the settled design, but it only works if the local collector accepts the
app's origin and the documentation says how to run it.

**Independent Test**: Following only the repository documentation, start the local observability stack and the
application with both switches on, load a page, and confirm the browser's export request reaches the collector from
the app's origin and is accepted.

**Acceptance Scenarios**:

1. **Given** both switches are on, **When** the browser exports, **Then** it sends traces to the configured collector
   endpoint directly, and the product's own origin serves no route that relays browser telemetry.
2. **Given** the server is configured with collector headers, **When** the browser exports, **Then** the browser sends no
   collector headers and the page never receives their values.
3. **Given** the local collector from the repository's observability stack, **When** the browser at the app's origin
   exports to it, **Then** the collector accepts the cross-origin request.
4. **Given** the collector is unreachable, refuses the request, or rejects it for missing headers or origin, **When** the
   user works in the page, **Then** the page behaves as it would with browser tracing off, apart from the lost
   telemetry.

---

### Edge Cases

- Server telemetry is on but the browser-tracing switch is absent: browser tracing stays off (default).
- Both switches are on but the collector endpoint is not reachable from the browser (for example it binds only inside
  a container network): export fails, the product is unaffected, and the documentation says the endpoint must be
  browser-reachable.
- The server is configured for a collector that requires headers: browser export is unsupported for that collector and
  fails without exposing the headers; server export is unchanged.
- A request leaves for another origin, including the identity provider during sign-in and the collector itself: no
  browser trace context is attached.
- A page is restored from the back/forward cache, or a tab is frozen and resumed: no document-load record claims the
  stale server trace, and transitions after resume are still recorded.
- Two tabs share a session and one is suspended when a message is sent: the receipt, if any, is recorded when the tab
  actually receives it, so a missing receipt is observable.
- A document navigation that the server answers with a redirect: the trace context rendered into the final document
  belongs to the request that rendered that document.
- A page with protected content is open when browser tracing is on: no protected text reaches telemetry through
  automatic page-load or request records.
- Playwright supplies its own trace context on a document request: the rendered page continues the trace the server
  actually handled, so the harness's existing per-step trace IDs still apply.

## Requirements _(mandatory)_

### Functional Requirements

#### Switch

- **FR-001**: Browser tracing MUST have its own switch, separate from the server telemetry switch, and MUST be off when
  that switch is unset.
- **FR-002**: Browser tracing MUST take effect only when server telemetry is also on. When either is off, browser
  tracing MUST be off.
- **FR-003**: When browser tracing is off, the page MUST receive no browser-tracing configuration and no rendered trace
  context, no browser tracing MUST start, the browser MUST send nothing to the collector, and the browser MUST add no
  trace context to any request.
- **FR-004**: A switch value that is not a recognized on or off value MUST NOT enable browser tracing.

#### Configuration and export

- **FR-005**: When browser tracing is on, the server MUST provide the page only the collector endpoint, the service name
  (identical to the server's), the revision, and the run identifier.
- **FR-006**: The browser MUST export traces directly to the collector endpoint the server telemetry already uses. The
  product's origin MUST NOT relay browser telemetry.
- **FR-007**: The browser MUST NOT send collector headers, and the page MUST NOT receive any collector header value.
  Browser export is supported only for collectors that require no headers.
- **FR-008**: The repository's local collector MUST accept browser export from the local application's origin.
- **FR-009**: A failure to deliver browser telemetry MUST NOT change what the user can see or do in the page.

#### Trace continuity

- **FR-010**: When browser tracing is on, every same-origin fetch request the page issues, including data fetches,
  server-handled form actions, and server-rendered navigation payloads, MUST carry W3C trace context, and the server
  MUST continue it. Full document navigations are governed by FR-012 instead.
- **FR-011**: The browser MUST NOT add trace context to requests to any other origin.
- **FR-012**: When browser tracing is on, a server-rendered document MUST carry the trace context of the server's
  handling of that document request, and the browser's document-load record MUST continue that trace.
- **FR-013**: A page restored without a new server render MUST NOT be recorded as a document load continuing the
  earlier server trace.
- **FR-014**: Browser telemetry MUST carry the same service name, revision, and run identifier as the server process
  that rendered the page.

#### Harness facts

- **FR-015**: Browser telemetry MUST record each client-side UI state transition the application makes, as a
  from-state and to-state from a closed set.
- **FR-016**: Browser telemetry MUST record each cross-tab message sent and received, with its closed-set message kind
  and direction, in a way that lets a verifier match a send to its receipts across tabs. The match MAY use an opaque
  identifier generated only for telemetry; it MUST NOT reuse any value from the message contents.
- **FR-017**: Browser telemetry MUST record focus moves to and from application-identified controls and regions, with
  a closed-set target identifier and whether the application or the user caused the move.
- **FR-018**: Every recorded harness fact MUST follow the
  [verification telemetry conventions](../../docs/observability.md#verification-telemetry-conventions), including a
  closed-set outcome.

#### Forbidden data

- **FR-019**: Browser telemetry MUST NOT contain page text, accessible names, form values, or other free text from users
  or the page.
- **FR-020**: Browser telemetry MUST NOT contain query strings or URL fragments. Locations appear only as a path or a
  route template.
- **FR-021**: Browser telemetry MUST NOT contain cross-tab message contents or any value in the forbidden
  [data classes](../../docs/observability.md#data-classes).
- **FR-021a**: FR-019 to FR-021 apply to every exported text-bearing field, including record names, attribute and event
  values, and status or error descriptions.

#### Scope and documentation

- **FR-022**: Browser tracing MUST be documented as a local-verification facility that is assumed never to be active in
  production: the switch defaults to off and production configuration never sets it.
- **FR-023**: The observability documentation MUST describe the browser tracing scope, its signals, the switch and its
  dependency on server telemetry, direct export, the header-free collector constraint, and the CORS requirement. The
  local Compose documentation MUST describe the local collector's CORS configuration.

### Acknowledged limitations

- **L1**: Durable tests do not assert browser telemetry output. Exported traces are observed by the verification agent
  and manual inspection, as the harness requires.
- **L2**: Telemetry from a page that closes or navigates away before export completes may be lost. A missing browser
  record is inconclusive, not a violation, unless the verifier confirms the page stayed open past the export delay.
- **L3**: A browser-reachable, header-free collector exists only locally. Staging and production have no browser
  tracing.

### Key Entities

- **Browser-tracing switch**: The runtime setting that requests browser tracing. Effective only with server telemetry
  on.
- **Browser configuration**: The four values the server gives the page when browser tracing is on: collector endpoint,
  service name, revision, run identifier.
- **Rendered trace context**: The W3C trace context of the server's handling of a document, carried in that document.
- **Harness fact**: A closed-set record of a UI state transition, cross-tab message send or receipt, or focus move.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In a local journey with both switches on, for every UI transition that causes a same-origin request, the
  verifier finds the browser transition and the server's handling of that request under one trace ID: 100% of sampled
  transitions, and at least one transition of each request kind the page uses.
- **SC-002**: For every server-rendered document load sampled with both switches on, the browser's document-load record
  shares the trace ID of the server's handling of that document.
- **SC-003**: In each of the three combinations with browser tracing off, the browser makes zero requests to the
  collector, the page carries zero browser-tracing configuration values or rendered trace context, and zero requests
  carry browser-originated trace context.
- **SC-004**: Inspection of every exported text-bearing browser field (record names, attribute and event values, and
  status or error descriptions) from a journey that includes typed input, protected content, query strings, cross-tab
  messages, and logout finds zero forbidden values.
- **SC-005**: Each of the three harness fact kinds is observable for the journey with closed-set values only, and every
  browser record of the run is selectable by the same revision and run identifier as the server's.
- **SC-006**: Browser records are queryable within the documented export delay for traces (about 30 seconds) after the
  page that produced them stays open past it.
- **SC-007**: With the collector stopped, the same journey reaches the same user-visible outcomes as with browser
  tracing off.
- **SC-008**: A developer can enable browser tracing against the local collector using only the repository
  documentation.

## Assumptions

- The verification run's revision and run identifier are the values the harness already sets for the server process.
  The browser reuses them rather than generating its own.
- **Browser tracing is assumed never to be active in production.** The switch defaults to off, and production
  configuration never sets it. The product does not refuse or ignore the switch in a production build, and no
  evidence of such a refusal is planned. This assumption is documented so that a later decision to enable it anywhere
  other than local development goes back through the issue and specification (Authority finding 2, confirmed by the
  maintainer on 2026-11-11).
- Query strings are forbidden by the issue. URL fragments are excluded the same way because they can carry the same
  kinds of values and add nothing a verifier needs (confirmed by the maintainer on 2026-11-11).
- Trace context is sent only on same-origin requests, never to the identity provider, the collector, or any other
  origin. The issue scopes propagation to same-origin fetch, and sending it elsewhere would give telemetry identifiers
  to another origin and may trigger a cross-origin preflight those services do not expect (confirmed by the maintainer
  on 2026-11-11).
- Delivery of browser telemetry is best-effort, matching the existing server export policy in
  [Observability](../../docs/observability.md#startup-and-export-policy).
- Which UI states, message kinds, and focus targets exist, and the names they are recorded under, are telemetry
  contract decisions for the engineering plan. This specification requires only that they are closed sets covering
  the client-side transitions, messages, and focus moves the application has when this feature is implemented.

## Delivery Authority and Scope _(mandatory)_

**Delivery issue**: [#368 — Add browser tracing for the verification harness](https://github.com/PathableAI-org/Pre-ETS/issues/368),
read in its current open state on 2026-11-11, after the maintainer's rewrite.

**Originating delivery slice**: None. #368 is engineering-harness work that the
[verification harness](https://github.com/PathableAI-org/Pre-ETS/blob/a5dc67d9287d5ad25859616fbc81378a72ca2a16/docs/engineering/verification-harness.md)
anticipates ("Browser telemetry: traces exported by the browser, once browser tracing exists"). It is not a slice of a
reviewed delivery plan (Authority finding 1). Current `origin/main` was inspected at
`a5dc67d9287d5ad25859616fbc81378a72ca2a16`.

### Accepted requirement coverage

| Requirement | Acceptance criteria in this slice | Feature disposition                                                                                                                                                                                                                                                                                                                                |
| ----------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| None        | None                              | No accepted requirement covers browser telemetry. The feature changes no product behavior a user perceives. Its authority is the issue, constrained by the [verification telemetry conventions](https://github.com/PathableAI-org/Pre-ETS/blob/a5dc67d9287d5ad25859616fbc81378a72ca2a16/docs/observability.md#verification-telemetry-conventions). |

Related constraints, not coverage claims: the [data classes](https://github.com/PathableAI-org/Pre-ETS/blob/a5dc67d9287d5ad25859616fbc81378a72ca2a16/docs/observability.md#data-classes)
and the constitution's confidentiality principle bound what browser telemetry may carry. The
[session verification signals](https://github.com/PathableAI-org/Pre-ETS/blob/a5dc67d9287d5ad25859616fbc81378a72ca2a16/docs/session-state.md#verification-signals)
from #369 are the server records a browser trace joins.

### Authorized outcome

With server telemetry and a separate browser-tracing switch both on in a local build, the browser exports closed-set
traces directly to a header-free collector, continues server traces across same-origin requests and document loads,
and records UI state transitions, cross-tab messages, and focus moves without forbidden data. With either switch off,
no browser tracing runs.

### In scope

- A browser-tracing switch, off by default, effective only with server telemetry on, and no browser tracing when off.
- Server-provided browser configuration (endpoint, service name, revision, run identifier) only when on.
- Direct, header-free export to the existing collector endpoint, and CORS acceptance by the local collector.
- W3C trace context on same-origin requests, including server-handled form actions and server-rendered navigation
  payloads, and continuation of the server trace by the document-load record.
- Closed-set harness facts for UI state transitions, cross-tab message send and receipt, and focus moves.
- Exclusion of page text, form values, query strings, and all forbidden data classes.
- Documentation updates in `docs/observability.md` and `docs/docker-compose.md`, with dependency and lockfile changes
  in the same pull request that adds the dependency.

### Out of scope

- Staging and production browser tracing, and any browser-reachable or header-free collector outside local
  development. A later issue may enable staging.
- A relay route on the product origin, and browser export to collectors that require headers.
- Browser metrics, browser logs, real-user monitoring, session replay, and error reporting.
- Durable tests that assert telemetry output.
- Telemetry for features not yet built, such as #156's warning dialog. Those features extend the closed sets in their
  own telemetry contracts.
- `packages/backend` instrumentation and any change to server telemetry beyond continuing browser trace context and
  rendering it into documents.

### Dependencies and blockers

- #369 (PR #372, merged) supplies the server verification signals that browser traces join. Not a blocker.
- The local observability stack in `compose.yaml` is the collector. Its CORS configuration is part of this feature.
- None blocking.

### Authority findings

1. **No delivery-plan slice or accepted requirement (resolved).**
   - _Source_: Issue #368; the verification harness guide, which lists browser telemetry as a channel "once browser
     tracing exists"; the speckit-specify intake gate, which expects a delivery-plan slice.
   - _Ambiguity_: Whether harness tooling without a requirement or delivery slice may enter Spec Kit. None remaining.
   - _Impact_: Claims trace to issue scope and the observability conventions, not to requirement IDs. No requirements BDD
     applies.
   - _Decision required_: None. The maintainer rewrote #368 as the authority and directed the full specification, plan,
     and slice workflow because the feature adds a client SDK and a runtime switch and exposes the collector endpoint.
   - _Proposals_: (A) Treat #368 as the sole authority (applied).
2. **How production stays off (resolved by maintainer decision on 2026-11-11).**
   - _Source_: Issue #368 Constraints: "Browser tracing is for local verification. Production leaves it off."
     Maintainer answer on PR #373, 2026-11-11: the settings default to false and production never sets it, and the
     documentation should state the assumption that browser tracing is never active in production.
   - _Ambiguity_: Whether "leaves it off" is a configuration obligation or a product guarantee that refuses the switch in
     a production build. None remaining.
   - _Impact_: No runtime refusal and no evidence for one. FR-022 and the Assumptions section record that browser
     tracing is assumed never to be active in production. The engineering plan carries the same statement into the
     current-behavior documentation in `docs/observability.md`.
   - _Decision required_: None.
   - _Proposals_: (A) Default off, production configuration never sets it, and the assumption is documented
     (**chosen**). (B) The application refuses to enable browser tracing in a production build (not chosen).

## Clarifications

No `speckit-clarify` session was run. The maintainer answered the review questions on PR #373 on 2026-11-11:

- Q: Does "Production leaves it off" require the application to refuse the switch in production? → A: No. The switch
  defaults to off, production never sets it, and the documentation states the assumption that browser tracing is
  never active in production (Authority finding 2).
- Q: Are URL fragments excluded along with query strings? → A: Yes, confirmed.
- Q: Is trace context sent only on same-origin requests, never to the identity provider or the collector? → A: Yes,
  confirmed.

Plan-phase note: `docs/observability.md` must state, as current behavior, that browser tracing defaults to off,
production configuration never sets it, and it is assumed never to be active in production.
