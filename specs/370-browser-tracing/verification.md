# Feature Verification Plan: Browser Tracing for the Verification Harness

**Feature specification**: [spec.md](spec.md)

**Delivery issue**: [#368 — Add browser tracing for the verification harness](https://github.com/PathableAI-org/Pre-ETS/issues/368)

**Status**: Planned — no execution evidence is recorded by this document

## Authority and scope

This plan covers issue #368, read on 2026-11-11 after the maintainer's rewrite, with current `origin/main` at
`a5dc67d9287d5ad25859616fbc81378a72ca2a16`. No accepted requirement or delivery-plan slice applies (spec Authority
finding 1). Claims trace to the issue's Expected work, Constraints, and Done when sections, bounded by the
[verification telemetry conventions](../../docs/observability.md#verification-telemetry-conventions) and the
[data classes](../../docs/observability.md#data-classes).

Evidence may establish the switch semantics, the browser configuration, direct header-free export, the local
collector's CORS acceptance, trace continuity across same-origin requests and document loads, the three harness fact
kinds, the absence of forbidden data, and the product's indifference to telemetry delivery failure. It may not
establish staging or production behavior, collectors that require headers, browser telemetry for features not yet
built (#156), or a production refusal of the switch (spec Authority finding 2).

Browser telemetry is both what this feature builds and an evidence channel for it. A claim about what the browser
does not send, or about the page's behavior, is observed through browser interaction, because telemetry cannot
record its own absence.

## Claims and traceability

| ID    | Claim to establish                                                                                                                                               | Authoritative source                                     | Meaningful violation                                                                                                                         | Required observation                                                                                                                                                                                                                                                            | Evidence channel                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| V-001 | A UI transition and the server's handling of the same-origin request it caused share one trace, server under the browser request.                                | Issue Done when; Trace propagation                       | The two records are in different traces, or the server record is a root or a sibling instead of a descendant.                                | For a transition that sends a request (for example logout), the trace ID of the browser transition record equals that of the server record for the request, and the server record's ancestry passes through the browser's request.                                              | Browser telemetry; server telemetry                                   |
| V-002 | Every same-origin request kind the page uses carries W3C trace context from the browser, and the server continues it.                                            | Issue Trace propagation (fetch, Server Actions, RSC)     | One request kind (data fetch, server-handled form action, or server-rendered navigation payload) reaches the server without browser context. | For one request of each kind, the request leaves the page with trace context, and the server record of it continues the browser's trace.                                                                                                                                        | Browser interaction (request headers); server telemetry               |
| V-003 | Requests to other origins carry no browser trace context.                                                                                                        | Issue Trace propagation (same-origin scope); spec FR-011 | The identity provider or the collector receives a trace context header added by the page.                                                    | Every captured cross-origin request from the page, including the sign-in redirect chain and the export request, lacks browser-added trace context.                                                                                                                              | Browser interaction                                                   |
| V-004 | A server-rendered document carries the server's trace context, and the browser's document-load record continues it.                                              | Issue Trace propagation (document navigation)            | The document-load record starts its own trace, or continues a trace other than the one that rendered the document.                           | For a document requested by URL, the trace context in the received document matches the server record that rendered it, and the browser's document-load record has that trace ID.                                                                                               | Browser interaction (received document); browser and server telemetry |
| V-005 | A page restored without a new server render is not recorded as a document load in the earlier trace.                                                             | Spec FR-013                                              | A back/forward restoration produces a second document-load record in the old server trace.                                                   | After a back/forward restoration, no new document-load record joins the trace of the original render.                                                                                                                                                                           | Browser telemetry; browser interaction                                |
| V-006 | Browser telemetry carries the server's service name, revision, and run identifier.                                                                               | Issue Direct export (rendered configuration)             | Browser records are missing from, or wrongly included in, a query filtered by the run's revision and run identifier.                         | A query filtered by the run's service name, revision, and run identifier returns the run's browser records; a concurrent run with another identifier returns none of them.                                                                                                      | Browser telemetry                                                     |
| V-007 | Browser tracing is off by default and off whenever server telemetry is off.                                                                                      | Issue Expected work (switch semantics)                   | Browser tracing runs with the switch unset, or with server telemetry off.                                                                    | Switch decoding yields "off" for unset, for server telemetry off with the switch on, and for an unrecognized value; "on" only when both are on.                                                                                                                                 | Module test                                                           |
| V-008 | With browser tracing off, no browser SDK runs: no configuration or rendered trace context in the page, no collector traffic, and no browser-added trace context. | Issue Expected work; Done when ("no browser SDK runs")   | Off pages still contact the collector, receive the endpoint, carry rendered trace context, or add trace context to requests.                 | In each off combination, across a page load and a UI transition: the received document has no browser configuration or trace context, the page makes zero requests to the collector, and no outgoing request carries trace context other than what the harness itself injected. | Browser interaction                                                   |
| V-009 | With browser tracing on, the page receives exactly the four configuration values and no other telemetry setting.                                                 | Issue Direct export                                      | The page receives collector headers, credentials, or settings beyond endpoint, service name, revision, and run identifier.                   | The configuration in the received document, with collector headers configured on the server, contains exactly those four values and no header name or value.                                                                                                                    | Browser interaction                                                   |
| V-010 | The browser exports directly to the configured collector, with no relay on the product origin and no collector headers.                                          | Issue Direct export                                      | Export goes through the app origin, or the export request carries a collector header.                                                        | Every browser export request goes to the configured collector endpoint, none to the app origin, and none carries the server's configured collector headers.                                                                                                                     | Browser interaction                                                   |
| V-011 | The local collector accepts browser export from the app's origin.                                                                                                | Issue Direct export (CORS); Docs                         | The collector's cross-origin check rejects the app origin, so no browser record arrives.                                                     | The export request from the app origin, including any preflight, receives an accepting response, and the exported records appear in the trace store.                                                                                                                            | Browser interaction; browser telemetry                                |
| V-012 | Failure to deliver browser telemetry does not change the user's experience.                                                                                      | Spec FR-009; observability export policy                 | With the collector stopped or rejecting, a page errors, stalls, or behaves differently.                                                      | With the collector stopped, the journey's visible outcomes, focus, and protected-request results match the same journey with browser tracing off.                                                                                                                               | Browser interaction                                                   |
| V-013 | Each client-side UI state transition is recorded with closed-set from-state and to-state.                                                                        | Issue Harness facts                                      | A transition is missing, recorded out of order, or recorded with a free-form value.                                                          | For concealment, restoration after confirmation, and the signed-out notice, the browser record of each transition exists, carries values from the planned closed set, and its time order matches the order Playwright observed.                                                 | Browser telemetry; browser interaction (order cross-check)            |
| V-014 | Cross-tab message sends and receipts are recorded with closed-set kind and direction, and a send can be matched to its receipts.                                 | Issue Harness facts                                      | A send or receipt is missing, the kinds disagree, or the verifier cannot tell which receipt answers which send.                              | For an activity and a logout in tab A, tab A's send record and tab B's receipt record exist with the same closed-set kind, and the verifier matches them without reading message contents.                                                                                      | Browser telemetry                                                     |
| V-015 | Focus moves among application-identified targets are recorded with a closed-set target and cause.                                                                | Issue Harness facts                                      | A focus move the application performs is missing, or the record names the target by text.                                                    | When the application moves focus (for example to the signed-out notice) and when the user tabs to the logout control, each move is recorded with a planned target identifier and the correct cause.                                                                             | Browser telemetry; browser interaction (focus cross-check)            |
| V-016 | Browser telemetry contains no page text, form values, query strings or fragments, message contents, or forbidden data classes.                                   | Issue Harness facts; observability data classes          | Any exported browser attribute or event value contains such data.                                                                            | Every exported browser attribute and event value of the forbidden-data journey contains none of the seeded probe values and no value in a forbidden class; locations are paths or route templates.                                                                              | Browser telemetry (exhaustive inspection)                             |
| V-017 | A developer can enable browser tracing locally from the documentation alone.                                                                                     | Issue Docs                                               | The documentation omits a step, so a fresh setup produces no browser records or a CORS rejection.                                            | Following only `docs/observability.md` and `docs/docker-compose.md` from a clean checkout yields accepted export and queryable browser records.                                                                                                                                 | Browser interaction; browser telemetry                                |

Each required observation is a fact about the running product. Record names, attributes, closed-set values, and
queries belong to the engineering plan's `contracts/telemetry.md`.

## Automated behavioral evidence

| Claim IDs | Evidence boundary                                       | Planned scenario or property                                                                                                                                                                                                      | Why this boundary is meaningful                                                                            | Known limits                                                                                                                         |
| --------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| V-007     | Startup configuration decoding, at its public interface | Examples for every combination of server telemetry on/off and the browser switch unset/on/off/unrecognized; a property that browser tracing is on only when both inputs are on.                                                   | The switch rule is a pure decision; this is the cheapest boundary that would fail for a wrong combination. | Does not establish that the page honors the decision (V-008).                                                                        |
| V-008     | Built application served locally, real browser          | For each off combination, load a page, perform a transition, and assert from captured network traffic and the received document that there is no collector request, no browser configuration, and no browser-added trace context. | Only the composed build shows whether tracing code still runs when off.                                    | Asserts page outcomes and network traffic, not telemetry output. Whether the tracing code is downloaded when off is a plan decision. |
| V-012     | Built application served locally, real browser          | Run one short journey with the collector unreachable and assert the same visible outcomes as with tracing off.                                                                                                                    | Guards the user-facing promise that telemetry failure is invisible.                                        | One journey; does not cover every page.                                                                                              |

No requirements-backed BDD applies, because no accepted requirement covers this feature. Durable tests do not assert
spans, attributes, or exporter behavior; the verification agent observes them (spec L1).

## Agent-executable manual feature verification _(mandatory)_

### Purpose

Observe the issue's done-when journey end to end: a real browser, a local build with both switches on, one trace in
Tempo holding a browser UI transition and the server request it caused, no forbidden data anywhere in the browser's
export, and no browser tracing at all when either switch is off. This adds trace-store and cross-process observations
that the automated page checks do not make.

### Prerequisites

- A clean checkout at the exact revision under assessment, built for local production-like serving.
- The local observability stack from `docs/docker-compose.md` running and healthy, with its CORS configuration as
  documented by this feature.
- The read-only Grafana MCP server from `.mcp.json`, and Playwright able to open several tabs, capture request
  headers and received documents, and drive back/forward navigation.
- Synthetic tenants and fixtures from the repository, including the multi-tab coordination fixtures. No real client
  records or credentials.
- A real application session where a step needs protected content. If one cannot be established at the revision under
  assessment, record those steps as `blocked` and run the remaining steps against public and fixture pages.
- A run UUID per run. Set `OTEL_SERVICE_VERSION` to the revision and `service.version`/`service.instance.id` in
  `OTEL_RESOURCE_ATTRIBUTES`, as the [verification harness](../../docs/engineering/verification-harness.md#environment)
  requires.
- A set of probe values seeded for this run: a distinctive string typed into a field, a distinctive query-string value,
  and a distinctive fragment, all synthetic.

### Procedure

1. Record revision, date and time, run UUID, collector image, application port, and switch settings.
2. **Off combinations (V-007, V-008).** Start the application three times: server telemetry on with the browser switch
   unset; server telemetry off with the browser switch on; both off. Each time, load a page, perform one UI transition,
   and capture the received document and every request. Record any browser configuration or trace context in the
   document, any request to the collector, and any outgoing trace context not injected by Playwright. After a
   one-minute wait, query the trace store for browser records with this run's identifiers and record the count.
3. **On, configuration (V-009).** Start with both switches on and collector headers configured on the server with a
   synthetic value. Load a page and record the configuration values the document carries.
4. **Done-when journey (V-001, V-006, V-010, V-011).** With both switches on, perform a UI transition that sends a
   same-origin request, such as activating logout. Capture the export requests and responses, including any preflight.
   Wait for the trace export delay, then query Tempo by service name, revision, and run UUID. Record the trace ID that
   contains the browser transition and the server record of the request, and the parent chain between them. Run a
   second instance with a different run UUID at the same time and record that neither query returns the other's
   records.
5. **Request kinds and other origins (V-002, V-003).** Trigger one ordinary data fetch, one server-handled form action,
   and one client navigation that fetches a server-rendered payload. Record that each left with trace context and that
   the server record continues it. Start a sign-in that redirects to the identity provider and record that no
   cross-origin request carries browser-added trace context.
6. **Document load (V-004, V-005).** Navigate to a page by URL, with and without a Playwright-supplied trace context.
   Record the trace context in the received document, the server record that rendered it, and the browser's
   document-load trace ID. Navigate away and back so the page is restored from the back/forward cache, and record
   whether any new document-load record joined the original trace.
7. **Harness facts (V-013, V-014, V-015).** In two sharing tabs, type in tab A, freeze and resume tab B so it conceals
   and restores, log out from tab A by keyboard, and let the signed-out notice take focus. Record, from Playwright, the
   order of visible transitions and focus moves. Record from Tempo each browser record of a UI transition, message send,
   message receipt, and focus move, with its values, and compare their order with Playwright's.
8. **Forbidden data (V-016).** In a journey that types the probe string, follows a link carrying the probe query value
   and fragment, displays protected content, and exchanges cross-tab messages, export every browser record of the run
   and search every attribute and event value for the probe values, for any URL with a query string or fragment, and
   for each forbidden data class. Do not copy any matched value into the report; record only its location.
9. **Delivery failure (V-012).** Stop the collector and repeat the step 7 journey. Record that visible outcomes, focus,
   and protected-request results match a run with browser tracing off. Restart the collector.
10. **Documentation (V-017).** In a fresh worktree, follow only the documentation to start the stack and the
    application with browser tracing on. Record any step the documentation did not supply.
11. **Cleanup.** Stop the application instances, delete Redis keys under this run's prefix, remove the fresh worktree,
    and leave the shared observability stack running unless this run started it.

### Expected observations

- V-001, V-004, V-006: the expected trace IDs match, and the run's filters select exactly its own records.
- V-002, V-003, V-010: same-origin requests carry trace context; cross-origin requests and export requests carry no
  browser-added trace context and no collector header.
- V-007, V-008: no browser configuration, rendered trace context, collector request, or browser trace context in any
  off combination, and zero browser records for those runs.
- V-009: exactly endpoint, service name, revision, and run identifier.
- V-011: the collector accepts the app origin and records arrive.
- V-012: identical user-visible outcomes with the collector stopped.
- V-013–V-015: each fact recorded with closed-set values, in the order Playwright observed.
- V-016: zero probe values, query strings, fragments, or forbidden-class values.

### Evidence to retain

- Revision, run UUID, switch settings, collector image, and date and time.
- Trace IDs and the queries and time ranges used, per claim.
- Counts of collector requests and browser records for each off combination.
- The forbidden-data search scope (number of records and attributes inspected) and its result, without matched values.
- Each claim's result as `established`, `violated`, `not established`, or `blocked`, with conditions and limits.

## Harness observations

Claims observed through browser telemetry: V-001, V-004–V-006, V-011, V-013–V-017. For each, the verifier must be able
to learn from exported browser records:

- which run and revision produced the record, and the service it belongs to (V-006)
- the trace a UI transition, request, or document load belongs to, and its parent (V-001, V-004, V-005)
- for each UI state transition, the from-state and to-state as closed-set values, and when it happened (V-013)
- for each cross-tab message, its kind, whether it was sent or received, and enough to match a send to its receipts
  without its contents (V-014)
- for each focus move, the target as a closed-set identifier and whether the application or the user caused it (V-015)

Claims observed through server telemetry: V-001 and V-002 need the server's record of the request to show it continued
the browser's trace. The existing [session verification signals](../../docs/session-state.md#verification-signals)
supply those records; the plan references them rather than redefining them.

Facts that must never be emitted, and how they are verified instead:

- Page text, accessible names, form values, and other free text: never emitted. Content and accessible names are
  verified through browser interaction.
- Query strings and fragments: never emitted. Where a verifier needs a location, it uses the path or route template.
- Cross-tab message contents, including any coordination identifier: never emitted. The match between send and
  receipt uses an identifier generated only for telemetry, or another approach the plan defines.
- Collector header names and values, cookies, session references, tokens, OIDC values, personal data, and PHI: never
  emitted, and never given to the page. Their absence from the page is verified through browser interaction (V-009).
- The absence of browser activity when off: not observable in telemetry. It is verified through browser interaction
  (V-008).

## Operational observability verification

No operational observability claim in this slice. Browser tracing is a local verification facility, off in
production; no accepted requirement places an operational obligation on it. The harness observations above are not
operational obligations.

## Environment and data controls

- Synthetic tenants, users, and fixtures only. The probe values are synthetic strings chosen for each run.
- Collector headers used in step 3 are a synthetic value that is never a real credential, and the report never
  repeats it.
- The shared local observability stack is used; every query filters by revision and run UUID. Redis keys use the
  `preets:verify:<run-uuid>:` prefix and are deleted at cleanup.
- No staging, production, or third-party collector is contacted.

## Evidence retention and reporting

The implementation session records each verification report's summary in the feature's `quickstart.md` execution
results, as the [verification harness](../../docs/engineering/verification-harness.md#recording) describes: revision,
conditions, result per claim, and limitations. Raw query output, exported records, screenshots, and transcripts are
not committed. Planned procedures in this document are not executed evidence.

## Limitations and incomplete claims

- Steps that need a real application session are `blocked` if one cannot be established at the revision under
  assessment.
- A missing browser record is inconclusive unless the page stayed open past the export delay (spec L2).
- V-016 searches for seeded probes and known classes. It cannot prove the absence of every possible sensitive value,
  only of those the journey exercised.
- Staging and production behavior, header-requiring collectors, and the production refusal in spec Authority finding 2
  are not established.
- Harness facts for features not yet built, such as #156's warning dialog, are established by those features.

## Readiness review

- [x] Every feature claim maps to an authoritative source.
- [x] Every claim states the observation that distinguishes it and an evidence channel able to make it.
- [x] Successful, failure, rejection, security/privacy, accessibility, and operational outcomes are covered where applicable.
- [x] The manual feature procedure is non-empty, executable by an agent, and adds a distinct observation.
- [x] Environmental prerequisites, evidence retention, cleanup, and limitations are explicit.
- [x] Planned evidence is not described as executed or verified.
- [x] No implementation architecture is required to understand the feature claims.
