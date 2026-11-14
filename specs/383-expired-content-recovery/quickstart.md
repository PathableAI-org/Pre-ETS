# Quickstart: Validate Expired-Content Protection and Explicit Recovery

This guide puts [verification.md](verification.md) into practice for the design in [plan.md](plan.md),
[contracts/modules.md](contracts/modules.md), and [contracts/telemetry.md](contracts/telemetry.md). It records no
executed evidence yet. Run commands from the repository root. Each slice records its results under
[Execution results](#execution-results): the revision, run UUID, conditions, result per claim, cleanup, and
limitations.

## Claim and boundary map

Each claim is observed once, at the boundary that can establish it. Module evidence is cited, not repeated as
feature evidence.

| Claims | Feature evidence (this guide)                                                                                            | Supporting module evidence                                   | Slice(s)      | Gate / limitation                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------- | ------------------------------------------------------- |
| V-001  | §A1 HTTP BDD (expired and removed record, gate); §A2 action-level path; T-001                                            | `protection.test.ts` transport table; `session.test.ts` flag | A1, A2        | L-3 MPA race                                            |
| V-002  | §A1 response body and no login; §A3 and §C no provider request before Log in; T-001 and T-005                            | —                                                            | A1, A3, C     | —                                                       |
| V-003  | §A3 browser: recovery replaces content, nothing earlier is readable, focusable, or operable                              | Recovery-view controller example                             | A3            | —                                                       |
| V-004  | §A1 (document: unknown; server-expired when reproducible); §A2 (scripts off, removed record); §A3 (four JS cases)        | D7 predicate examples (A3) and property (B)                  | A1, A2, A3    | L-2: server-observed expiry occurs only before eviction |
| V-005  | §A1 HTTP: request after the deadline; §A3 browser: suspended timers, then submit                                         | —                                                            | A1 (part), A3 | Emulated suspension (verification.md)                   |
| V-006  | §A1 HTTP navigation `POST` (part); §A2 browser with JavaScript disabled                                                  | —                                                            | A1 (part), A2 | —                                                       |
| V-007  | §A3 focus and keyboard path; manual screen reader §A3.5                                                                  | —                                                            | A3            | AT pair used (verification.md)                          |
| V-008  | §A3 second sharing tab unchanged after the denial; T-002 shows no `TabChannel.send`                                      | Controller example: no record, no message                    | A3            | —                                                       |
| V-009  | §B three tabs, natural expiry, T-003 timing ≤ 2000 ms                                                                    | —                                                            | B             | —                                                       |
| V-010  | §B activity in A before B's local deadline; T-003 shows no `expired`                                                     | D7 property                                                  | B             | —                                                       |
| V-011  | §B Escape, outside click, the close button, browser find                                                                 | —                                                            | B             | L-1 inert close button (#400)                           |
| V-012  | §B background link activation and route change                                                                           | —                                                            | B             | —                                                       |
| V-013  | §B Tab and Shift+Tab cycles, accessibility tree; manual screen reader §B.6                                               | —                                                            | B             | AT pair used                                            |
| V-014  | §B focus on Log in, keyboard activation; manual screen reader §B.6                                                       | —                                                            | B             | AT pair used                                            |
| V-015  | §B refresh, back, forward, back/forward-cache restore after expiry                                                       | —                                                            | B             | Pre-script paint (B5)                                   |
| V-016  | §B the three B5 resume cases; T-003                                                                                      | —                                                            | B             | Emulated freeze; pre-script paint                       |
| V-017  | §B signed-out tab across the former deadline                                                                             | Logout-precedence example                                    | B             | —                                                       |
| V-018  | §B comparison of modal, known-expiration recovery, and unknown recovery                                                  | Shared copy (`session-recovery`)                             | B             | —                                                       |
| V-019  | §C keyboard Log in from each entry point with SSO held; T-005 then `confirmed`, new `session.id`, old reference denied   | #158 freshness evidence (cited)                              | C             | Local Keycloak only                                     |
| V-020  | §C wait past display, then activate; no `prepareAuthentication` before T-005                                             | —                                                            | C             | —                                                       |
| V-021  | §C cancel (`consent-web`), provider error (stopped Keycloak), stale (`stale-auth-time-web`) from each entry point; retry | #158 missing-evidence module evidence (cited)                | C             | Missing evidence: module only (verification.md)         |
| V-022  | §C tab B stays expired after A's login; its later content comes from a new document                                      | Terminal-view controller example                             | C             | —                                                       |
| V-023  | §B tenant B tab and second context unaffected                                                                            | —                                                            | B             | —                                                       |
| V-024  | §A1 denial body and headers; §A3 and §B page text and accessibility tree; §C Grafana inspection                          | —                                                            | A1, A3, B, C  | —                                                       |

V-019–V-022 are recorded as incomplete for slices A1–B, as verification.md permits. Slice C completes them.

## Prerequisites

- Node.js 26+, pnpm, and dependencies installed from the root lockfile. Docker available. Chromium for Playwright
  (`pnpm exec playwright install chromium`).
- Gitignored root `.env` with local-only Compose values. No production credentials or client data.
- Redis, the tracked Keycloak realm, and the local observability stack:

  ```sh
  docker compose up -d --wait redis keycloak
  docker compose --profile observability up -d otel-lgtm --wait
  curl --fail http://127.0.0.1:8080/realms/pre-ets/.well-known/openid-configuration
  ```

- Verifier runs use the harness environment from
  [Verification harness](../../docs/engineering/verification-harness.md#environment): `OTEL_SERVICE_VERSION=<sha>`,
  `OTEL_RESOURCE_ATTRIBUTES` with `service.version=<sha>,service.instance.id=<run-uuid>`,
  `BROWSER_TRACING_ENABLED=true` for §A3, §B, and §C, a `preets:verify:<run-uuid>:` Redis key prefix, and owned
  ports. Build and start production:

  ```sh
  pnpm --filter @pathableai/pre-ets-frontend build
  pnpm --filter @pathableai/pre-ets-frontend start
  ```

- A scratch tenant directory copied from the tracked fixtures, with Springfield's `idleTimeoutMinutes` set to `5`
  for natural-expiry steps. Delete it in cleanup.
- A screen reader for the manual steps marked AT: VoiceOver with Safari, or NVDA with Firefox. Without one, record
  those parts as not executed.

## Module evidence (every slice)

```sh
pnpm --filter @pathableai/pre-ets-frontend-services test
pnpm --filter @pathableai/pre-ets-frontend-services test:integration
pnpm --filter @pathableai/pre-ets-frontend test:unit
```

Expected per slice: the examples and properties listed in
[modules.md contract evidence](contracts/modules.md#contract-evidence) for that slice pass, and none of the existing
suites regress.

## §A1 — Gate recovery for denied actions (slice A1)

Run the BDD:

```sh
pnpm test:bdd:dry
pnpm test:bdd -- --tags "@preets-session-007"
```

Expected BDD (the new `expired-content-recovery.feature`, plus the existing `default-entry-protection.feature`
outline that now also covers a removed record):

1. A real session's record removed from another context, then the reference action posted as a fetch action
   (`next-action`): 401, empty body (until A3), no receipt cookie, no login delegation, no application or
   correlation cookie, no protected content.
2. The same, posted as a form-encoded navigation without `next-action` (`Sec-Fetch-Mode: navigate`,
   `Sec-Fetch-Dest: document`): 401, `text/html`, `private, no-store`. The document has one `h1`, "Your session is
   no longer available", and a "Log in again" link to `/`. No login delegation and no protected content.
3. After natural expiry (5-minute tenant), the same navigation `POST` received after the deadline: 401 with the
   recovery document and no receipt. This is the in-flight case at the HTTP boundary.

Manual and telemetry steps:

1. Start the app at the revision with the harness settings. Record the revision and run UUID.
2. Repeat BDD cases 1–3 with `curl`, sending a verifier-generated `traceparent` per step. Do not record cookie
   values.
3. Query T-001: each denial shows `denied_unauthenticated`, `server_action` = `fetch` or `document`, and
   `denial_cause`. Its child `SessionService.read` is `missing` (or `expired` with `denial_cause = expired`). No
   `authorizeSessionAction` and no `prepareAuthentication` appear in those traces.
4. Server-observed expiry (best effort): submit a navigation `POST` within the eviction window right after the
   deadline. If T-001 shows `denial_cause = expired`, check that the document says "Your session expired". If the
   window is not hit, record V-004's server-basis case as not established under L-2.
5. Inspect the response headers and body of each denial for session references, tokens, identity, and tenant data
   (V-024).

## §A2 — Progressively enhanced forms and the action-level 401 (slice A2)

Feasibility record (first A2 task, research D4): in the production build, record that the server-rendered reference
form has React's action fields and no `javascript:` action. Record also that a rejected fetch action reaches the
boundary without an unhandled rejection in the console.

BDD (Chromium context with `javaScriptEnabled: false`):

1. Sign in through the provider, open `/` with scripts disabled, and remove the record from another context. Submit
   the reference form by keyboard. Expected: document response 401, no receipt cookie, and a displayed page that is
   the recovery document saying "no longer available". Log in is reachable by Tab with visible focus and activates
   with Enter (V-006, V-004).
2. With a valid session and scripts disabled, the form submits and succeeds. This is the regression guard for
   progressive enhancement.
3. With scripts enabled, a removed record and a submit still show "The operation was not performed." and then S3's
   signed-out notice. This is the pre-A3 behavior and must not regress.

Module: `reference-session-enforcement.test.ts` shows `unauthorized()` on `NoUsableSession` and no receipt (V-001
action-level path). Telemetry: none new. Existing `authorizeSessionAction` `no_session` is visible only if the race is
hit (L-3).

## §A3 — In-tab recovery after a denied action (slice A3)

BDD (scripts enabled, browser tracing on for the verifier):

1. **Known expiration, timers suspended:** in tab A1, install the Playwright clock and `pauseAt` the current time.
   Wait past natural expiry (5-minute tenant), `setSystemTime` to wall time, and submit the reference action.
   Expected: the action response is 401, there is no receipt, and A1 shows "Your session expired" in place of its
   content. No earlier protected text remains in the DOM, no protected control is focusable, and focus is on the
   recovery heading (V-003, V-004, V-005, V-007).
2. **Unknown cause:** a record removed from another context before the deadline, then submit. Expected: "Your
   session is no longer available" (V-004).
3. **Logout observed:** in the same context log out in tab A2. In A1, whose content was concealed, nothing remains
   to submit. Record that the observed-logout case shows the signed-out notice (FR-019). Then cover the D7 predicate
   by its module examples, because a tab that observed logout has no protected form.
4. **Sharing tab untouched:** immediately after case 2's denial in A1, tab A2 (deadline not passed) still shows its
   content (V-008).
5. **Manual (AT):** with the screen reader, trigger case 1 and record the announcement on focus, the reading of the
   explanation, and Log in reachability and activation (V-007).

Telemetry (§Telemetry queries): T-002 shows `recovery_expired` for case 1 and `recovery_unavailable` for case 2, with
cause `action_denied`, as a root span that follows the denied submit and its T-001 denial in start-time order and
precedes the T-004 move. No `TabChannel.send` comes from A1 between the submit and the transition. T-004 shows `recovery_heading` `entered` / `application`. No `prepareAuthentication` appears
before a T-005 `action_recovery`. Inspect the accessibility tree and page text for protected values (V-024).

## §B — Expiration modal across tabs (slice B)

Setup: in context 1, sign in to Springfield (5-minute tenant) and open three protected tabs (S1–S3) plus one Shelbyville
tab. In context 2, sign in to Springfield. Browser tracing is on.

1. **Synchronized expiry:** leave all tabs idle past the deadline. Expected: each running Springfield tab of
   context 1 shows the modal "Your session expired" with protected content gone within 2 s of the deadline. T-003
   `expired` has `server_time_ms − deadline_ms ≤ 2000` in each tab, with cause `deadline` or `peer` (V-009, V-011
   setup).
2. **Isolation:** the Shelbyville tab and context 2 are unchanged (V-023).
3. **No early expiry:** in a fresh session, activate a control in S1 shortly before S2's local deadline. Expected:
   S2 conceals with cause `deadline`, then `content_shown` after confirmation, and never `expired`. Server
   `refreshForTenant` `renewed` shows the later deadline (V-010).
4. **Bypass attempts** in an expired tab: Escape, a click outside, activating the close button, browser find
   (`Ctrl/Cmd+F`) for a known protected string, 30 Tab and 30 Shift+Tab presses, and clicking where a background link
   was. Expected: the modal remains, no protected text is in the DOM or findable, focus stays in the modal, and the
   URL and view are unchanged (V-011, V-012, V-013). Record the inert close button under L-1.
5. **Focus and keyboard:** when the modal appears, focus is on "Log in again" with visible focus (T-004
   `expiration_log_in`), and Enter activates it (V-014).
6. **Manual (AT):** screen-reader announcement on entry, browse mode, heading list, and landmark list over the page
   (V-013, V-014).
7. **Compare:** record the heading, explanation, and Log in accessible name of the modal, §A3 case 1
   (known-expiration recovery), and §A3 case 2 (unknown recovery). Expected: the first two are equivalent, the third
   claims no cause, and all three offer the same Log in (V-018).
8. **Refresh and history:** from an expired tab, refresh, back, and forward, and restore a page from the
   back/forward cache. Expected: fresh entry (provider form or login redirect), with no modal over restored content
   and no protected content before a new session (V-015).
9. **Resume (B5):** use page lifecycle emulation (`Page.setWebLifecycleState` frozen/active through CDP, or
   visibility hidden/visible). Cases: past the deadline then expired (conceal at once, then `expired`); past the
   deadline with a renewal in another tab meanwhile (conceal, then `content_shown`); and before the local deadline
   with the tab's clock held back by Playwright while the server expired (`expired` within 2 s, using the `Date`
   header basis). T-003 cause `resume` with timing (V-016).
10. **Logout precedence:** a tab showing the signed-out notice stays there across the former deadline (V-017).

## §C — Fresh Log in from both entry points (slice C)

BDD (`@preets-session-013`, the visitor holds provider SSO; these scenarios also serve #158 S3, research D14):

1. From §A3 recovery and from the §B modal, wait 5 s, then activate "Log in again" by keyboard. Expected: no
   authorization request before activation (V-020); the provider asks to authenticate; then the protected
   application is shown under a session different from the remembered one, and the remembered reference is not
   admitted (V-019).
2. Cancel at the provider (`consent-web` tenant), a provider error (Keycloak stopped after the redirect, then
   started), and stale evidence (`stale-auth-time-web` tenant), each from each entry point. Expected: no session, no
   protected content, the safe authentication-return page, and then a later Log in succeeds (V-021).
3. Two expired tabs A and B: Log in from A. B stays on the modal with no protected content. Log in in B joins A's
   valid session with no provider step, and B's content comes from a new document (V-022).

Manual: run the full [verification.md procedure](verification.md#procedure) steps 1–12 at the C revision, with the
implementation details from §A1–§B above. Step 11 runs every query in §Telemetry queries and inspects every exported
attribute for protected content, session references, tokens, and claims (V-024).

## Telemetry queries

`RUN` = `resource.service.version = "<sha>" && resource.service.instance.id = "<run-uuid>"`.

```text
{ RUN && name = "protectRequest" && span.preets.protection.server_action != "none" } | select(span.preets.outcome, span.preets.protection.server_action, span.preets.protection.denial_cause)
{ RUN && name = "protectRequest" && span.preets.outcome = "denied_unauthenticated" } >> { RUN && name = "authorizeSessionAction" }
{ RUN && name = "prepareAuthentication" } | select(span.preets.tenant.alias)
{ RUN && name = "TabCoordination.transition" && span.preets.ui.cause = "action_denied" } | select(span.preets.ui.to_state)
{ RUN && name = "TabCoordination.transition" && span.preets.ui.to_state = "expired" } | select(span.preets.ui.cause, span.preets.session.deadline_ms, span.preets.session.server_time_ms)
{ RUN && name = "TabCoordination.transition" && span.preets.ui.cause =~ "deadline|resume" } | select(span.preets.ui.from_state, span.preets.ui.to_state, span.preets.session.deadline_ms, span.preets.session.server_time_ms)
{ RUN && name = "Focus.move" && span.preets.focus.target =~ "recovery_heading|expiration_log_in" } | select(span.preets.focus.change, span.preets.focus.cause)
{ RUN && name = "Interaction.login" } | select(span.preets.login.entry)
{ RUN && name = "AuthenticationService.complete" } | select(span.preets.outcome, span.preets.authentication.freshness_position)
{ RUN && name = "SessionService.establish" } | select(span.session.id)
```

The second query must return nothing. An empty result elsewhere is inconclusive until the verifier confirms that
OTEL was enabled, traffic occurred, and about 30 s of export time passed.

## Cleanup

Close the browser contexts, end the provider session, delete `preets:verify:<run-uuid>:*` keys, delete the scratch
tenant directory, restart Keycloak if it was stopped, and stop owned processes.

## Execution results

No results recorded yet. Each slice records the revision, run UUID, environment, result per claim (`established`,
`violated`, `not established`, or `blocked`), cleanup, and limitations. Superseded results stay, marked stale.

### Slice A1 — `860f6204f89b5ade26152cc48ca069b6cee06da6` (2026-11-13)

**Runs:** BDD `0c6bcfb2-8a93-4153-bdcd-0adae51fd62a`; manual `79b28959-742b-4ba0-84dc-e25bb8a345dc` and
`59161d0e-59d5-4379-8d7c-736a2fd48c5b` (the telemetry record).

**Conditions:** a detached verifier worktree; a production build; local Redis, the tracked Keycloak realm, and
otel-lgtm with OTEL enabled and the harness `service.version` and `service.instance.id`. Browser tracing was off,
because A1 has no browser rows. A scratch tenant copy set Springfield's `idleTimeoutMinutes` to 5, and each run used
its own `preets:verify:<run>:` Redis prefix. Each `POST` carried a verifier `traceparent`, and the visitor signed in
through the tracked provider.

**Module evidence:** frontend-services `test` 489/489, `test:integration` 42/42, frontend `test:unit` 72/72.

**BDD:** dry run discovered 77 scenarios; `@preets-session-007` ran 4 scenarios (70 steps), all passed.

| Claim                     | Result                                                       | Observation                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-001 (gate)              | established                                                  | A removed record and a request about 5 s after the deadline, each as a fetch action and as a no-script navigation, all gave 401 with no `Set-Cookie` (no receipt). T-001 recorded `denied_unauthenticated`, and the run had no `authorizeSessionAction` span. |
| V-002 (HTTP and server)   | established                                                  | The fetch body was empty, and the document body held only recovery content. No `Location`, and no correlation or transaction cookie. `prepareAuthentication` appears only at the deliberate sign-ins, before the denials, never after them.                   |
| V-004 (no-script unknown) | established; server-observed "expired" not established (L-2) | The removed and evicted records showed "Your session is no longer available", with `denial_cause = unknown` and a `missing` child read. Two window probes either missed the pre-eviction window or arrived before the deadline.                               |
| V-005 (HTTP part)         | established                                                  | A navigation `POST` received about 5 s after the deadline got the 401 recovery document and no receipt. A sub-second in-flight request was not observed.                                                                                                      |
| V-006 (HTTP part)         | established                                                  | `text/html; charset=utf-8`, `private, no-store`, exactly one `h1`, and a "Log in again" link to `/`. This used a raw HTTP request, not a scripts-disabled browser, and keyboard operation is A2.                                                              |
| V-024 (response part)     | established                                                  | No body or header held a session reference, `pathable-session`, a tenant name, identity, or token strings.                                                                                                                                                    |
| V-003, V-007–V-023        | not run (later slices); V-019–V-022 incomplete, as permitted | —                                                                                                                                                                                                                                                             |

T-001 was present and usable. `server_action` was `fetch` or `document` on candidates and `none` on other gated
requests. `denial_cause` appeared only on denials. No forbidden data was observed.

**Cleanup:** no owned keys were left, the app was stopped, and the scratch tenants were removed.

**Notes for later slices:**

- The §A1 command `pnpm test:bdd -- --tags "@preets-session-007"` passes a literal `--` that cucumber reads as a path.
  `pnpm test:bdd --tags "@preets-session-007"` works. The step text is unchanged here, because changing it would need
  a new verification request.
- The removed-record and after-deadline cases are in `expired-content-recovery.feature`, not in the
  `default-entry-protection.feature` outline.
- An admitted no-script `POST` with the synthetic `$ACTION_ID_` body returned 500 (no operation ran). A2's
  progressive-enhancement scenario should watch this.
- The BDD harness stops the app right after the last step, so the final span batch of a BDD run is not exported.
  Telemetry evidence comes from manual runs held 35 s after the last step.

### Slice A2 — `3e85cf72024ff082530acd1ca273f1712f815c16` (2026-11-13)

**Runs:** BDD `6a5e07d7-4166-48f4-9375-b9e7e2c1ab1b`; probe `c669bbde-4bad-4d9a-933a-292bbf3a789b` (the telemetry
record).

**Conditions:** a detached verifier worktree; a production build; local Redis, the tracked Keycloak realm, and
otel-lgtm with OTEL enabled and the harness `service.version` and `service.instance.id`. Browser tracing was off,
because A2 has no browser rows. Each run used its own `preets:verify:<run>:` Redis prefix. The visitor signed in
through the tracked provider in the harness's proxied Chromium. Each form submission carried a verifier `traceparent`.

**Module evidence:** frontend-services `test` 489/489, `test:integration` 42/42, frontend `test:unit` 72/72, including
`reference-session-enforcement.test.ts` 9/9.

**BDD:** dry run discovered 80 scenarios. `--name "protected form submission"` ran 3 scenarios (41 steps), passing on
3 consecutive runs.

**Feasibility gate (research D4):** confirmed independently.

- The server-rendered form is `action=""`, `multipart/form-data`, `POST`. It carries `$ACTION_REF_1`, `$ACTION_1:0`,
  `$ACTION_1:1`, `$ACTION_KEY`, and the tag field.
- No `javascript:` action appears anywhere in the document.
- With scripts disabled and a usable session, the submission is a navigation `POST` answered 200. The status reads "The
  reference operation finished.", the receipt is set, and the console has no errors.

| Claim                               | Result                                        | Observation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-006 (full)                        | established                                   | Scripts-disabled Chromium, keyboard Enter: a navigation `POST`, `multipart/form-data`, no `next-action`, 401. The displayed page has exactly one `h1`, "Your session is no longer available". The form is gone and the browser holds no receipt. The first Tab reaches "Log in again" with `:focus-visible` and an `auto` outline (computed style). Enter navigates `GET /`, and the server answers with the fresh-entry login redirect. T-001: `denied_unauthenticated`, `server_action = document`, `denial_cause = unknown`. |
| V-004 (scripts off, removed record) | established                                   | Same run: "no longer available" for a record removed before its deadline. Server-observed "expired" remains L-2 (A1).                                                                                                                                                                                                                                                                                                                                                                                                           |
| V-001 (action-level path)           | established (module); not observed at runtime | The module test shows `unauthorized()` on `NoUsableSession` with no receipt. At runtime the gate's denials never reached the action. A usable control shows `authorizeSessionAction` `authorized`. The race was not reproduced (L-3, as planned).                                                                                                                                                                                                                                                                               |

**§A2.3 (scripts enabled, removed record):** the BDD delays `/session/activity` by 2 s and passed 3/3. Five
undelayed probe runs each gave a fetch 401 (`server_action = fetch`, `unknown`), no receipt, and the tab ended on "You
are signed out". "The operation was not performed." was announced first in 4 of the 5. In the fifth, the refused
activity report ended the tab first, the race that predates A2. No run had a `pageerror`.

No instrumentation was missing or unusable. No forbidden data was observed: span keys are within allowed classes, no
span has a query string, and resources carry only `service.*` and `telemetry.sdk.*`.

**Cleanup:** one leftover owned session key was deleted, the app was stopped, and the scratch tenant was removed.
