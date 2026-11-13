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

### Slice A3 — `4646566d218f06637cd53583f8fd0fdac2c75813` (2026-11-13)

**Runs:** BDD `480eb67a-be6a-4d7b-b86b-d7a3f734e769`; probe `9feb9235-c8d5-4e2b-bcf0-4f5ea30eed33` (browser tracing on,
the telemetry record). This report supersedes the failed verification at `99b2261`: there T-005 was not exported and,
without the BDD's then 2 s activity delay, the refused activity report ended the denying and sharing tabs before
recovery. Both were fixed (`e8c6b7f`), and T-002's correlation was corrected in the plan (`023085f`).

**Conditions:** a detached verifier worktree; a production build; local Redis, the tracked Keycloak realm, and
otel-lgtm with OTEL enabled and the harness `service.version` and `service.instance.id`; `BROWSER_TRACING_ENABLED=true`
for the probe, with every page waiting for `data-preets-browser-tracing="started"`; a 5-minute Springfield scratch
tenant. The default flow: no route interception and no `/session/activity` delay anywhere.

**Module evidence:** frontend-services `test` 491/491, `test:integration` 42/42, frontend `test:unit` 94/94.

**BDD:** `--tags @preets-session-007` ran 9 scenarios (141 steps), all passing.

| Claim                 | Result                                   | Observation                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-003                 | established                              | 7/7 recoveries (5 unknown, 2 expired): the action answers 401 and recovery replaces the tab's header and content. No form or button remains. Rendered text and the accessibility tree hold no protected labels, and the only tab stop is "Log in again". Next's inline flight payload still holds earlier label text; it is not rendered, focusable, or exposed, and was ruled not a failure. |
| V-004 (JS cases)      | established                              | Removed record → "Your session is no longer available" (5/5). Deadline passed with suspended timers → "Your session expired" (2/2); the gate token was `session-unavailable`, so the tab basis decided (L-2). Logout observed in another tab → the signed-out notice and no recovery.                                                                                                         |
| V-005 (browser)       | established                              | Clock installed before load, paused after load, set to the deadline plus 5 s, then a keyboard submit: 401, no receipt, expired recovery with focus on its heading (2/2). Emulated suspension, as approved.                                                                                                                                                                                    |
| V-007                 | browser part established; AT outstanding | Focus lands on the `h1` marked `recovery_heading` (`tabindex="-1"`). The first Tab reaches "Log in again" with `:focus-visible` and a solid outline, and Enter navigates to the provider. Screen-reader announcement (§A3.5) was not executed and is left for a person.                                                                                                                       |
| V-008                 | established                              | The second sharing tab still shows "Reference session" and the form immediately and 5 s after the denial (5/5). Between the submit and the transition, the denying tab's only `TabChannel.send` is `pending` (activity in flight), never an end or logout message.                                                                                                                            |
| V-002 (browser part)  | established                              | From the denial to Log in activation the tab requested only `POST /`, `POST /session/activity`, and `GET /session/status`. Each T-005 precedes the next document's `prepareAuthentication` by about 10 ms, and none appears between a denial and its T-005.                                                                                                                                   |
| V-024 (page part)     | established                              | No protected labels, tenant, identity, or session values in rendered text, the accessibility tree, or live regions.                                                                                                                                                                                                                                                                           |
| V-018 (recovery side) | established                              | Expired and unknown recovery share the "Log in again" action; the unknown copy claims no cause. The modal side is slice B.                                                                                                                                                                                                                                                                    |

**S3 logout during the submission hold:** with a submission in tab A, a logout in tab B 100, 500, or 1000 ms later ended
A in 74, 77, and 79 ms. A never showed recovery, so the 5 s hold does not delay logout.

**Telemetry:** T-002 present (5 `recovery_unavailable`, 2 `recovery_expired`, cause `action_denied`), as root spans
ordered submit → T-001 denial → transition → `Focus.move`, as the corrected row says. T-004 `recovery_heading`
`entered`/`application` at each recovery. T-005 present: 7 `Interaction.login` with `action_recovery`, exported by the
`pagehide` flush. In the suspended-clock case browser timestamps lag wall time by about 1.5 s, so that case's order was
judged by browser interaction. No instrumentation was missing or unusable. No forbidden data was observed.

**Cleanup:** owned keys deleted, the app stopped, and the scratch tenant removed.

### Slice B — `66edb65dc5bf56e8c92a82eb2fd8217b21d95985` (2026-11-13)

**Runs:**

- Full BDD: `c7cd2d07-90e7-4eab-869f-756b1faeff3c`.
- Probe 1: `1c58c26f-5d33-4495-878d-120e0854e247`.
- Probe 2: `6beedf81-b1f4-48b0-8479-d6133501a736`.
- Follow-up probe: `a211313c-1429-4173-88c5-30fda784c78e`.
- Resume probe: `958d68e8-c589-4372-bf8e-7d78140f0a1c`.

Browser tracing was on for every probe.

**Conditions:** a detached verifier worktree and a production build. Local Redis, the tracked Keycloak realm, and
otel-lgtm ran with OTEL enabled and the harness `service.version` and `service.instance.id`. `BROWSER_TRACING_ENABLED`
was `true`, and Springfield used a 5-minute scratch tenant. The default flow had no delays. Suspension was emulated with
Playwright's clock and a hidden→visible visibility change. Headless Chromium ignores CDP freezing for visible pages.

**Module evidence:** frontend-services `test` 491/491, `test:integration` 42/42, and frontend `test:unit` 107/107. The
frontend unit tests include the D7 property and the expiry controller examples.

**BDD:** the full suite passed, 85 scenarios and 1319 steps. That includes the three `expiration-protection.feature`
scenarios and every regression scenario.

| Claim         | Result                                   | Observation                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-009         | established                              | Three sharing tabs recorded `content_concealed` (cause `deadline`) at `server_time_ms − deadline_ms` = +3 ms and `expired` at +19 to +21 ms. Another browser's session expired at +23 ms.                                                                                                                                                                                                                                               |
| V-010         | established                              | Another browser renewed the session 1.6 s after the tab's last renewal. The tab concealed at its local deadline and showed its content again 28 ms later with the server deadline. It expired at the true deadline (+16.8 ms) and was never expired while the session was valid. In the second check, a control activation in a sharing tab 15 s before the deadline kept both tabs from concealing or expiring.                        |
| V-011         | established                              | Escape, an outside click, and the close button all left the modal up. `window.find` found no protected text, and the DOM and accessibility tree held no protected labels. The inert close button is limitation L-1 (#400). After an outside click, focus is on `body`, and Tab returns into the modal.                                                                                                                                  |
| V-012         | established                              | A click where the protected control had been left the URL and the modal unchanged. The entry page has no in-page links. A scripted router push from the console is not reachable by a user. It led to fresh entry, with no modal and no protected content.                                                                                                                                                                              |
| V-013         | browser part established; AT outstanding | After 30 Tab and 30 Shift+Tab presses, focus never left the dialog. Its only two stops were "Log in again" and "Close modal", both with focus visible. The dialog has `aria-modal="true"`, and the accessibility tree shows only the dialog. The screen-reader checks (§B.6) were not executed and are left for a person.                                                                                                               |
| V-014         | browser part established; AT outstanding | When the modal appears, focus is on "Log in again" (`expiration_log_in`), with focus visible and a solid outline. T-004 records `entered`/`application`, and Enter opens the provider. The announcement (§B.6) is left for a person.                                                                                                                                                                                                    |
| V-015         | established                              | Refresh, back, and forward from an expired tab led to the provider's authentication page, with no modal, no protected text, and no restored protected content. Pre-script paint (B5) is a limitation.                                                                                                                                                                                                                                   |
| V-016         | established                              | **Expired while suspended:** the content was hidden at once on return, and the modal appeared at +109 ms (`resume`). **Renewed elsewhere while suspended:** the content was hidden at once and shown again at +107 ms with the new deadline. **Clock held 60 s behind:** the content was not hidden at once, which is correct before the local deadline. The modal appeared at +105 ms on the `Date`-header basis. Freeze was emulated. |
| V-017         | established                              | A tab that observed logout stayed on "You are signed out" for 5 minutes past its former deadline, and no dialog ever appeared.                                                                                                                                                                                                                                                                                                          |
| V-023         | established                              | After the visitor's session expired, a Shelbyville tab in the same context kept its content. So did another browser with its own active Springfield session.                                                                                                                                                                                                                                                                            |
| V-018 (modal) | established                              | The modal's heading, explanation, and Log in action are identical to A3's expired recovery. Unknown recovery claims no cause.                                                                                                                                                                                                                                                                                                           |
| V-024 (modal) | established                              | The dialog holds only the heading, the explanation, the close button, and Log in. No protected or identity text is in the DOM or the accessibility tree.                                                                                                                                                                                                                                                                                |

**Submission hold:** submissions 994, 395, and 144 ms before the deadline were admitted with status 200, and no tab
concealed. Deadline confirmations concealed within milliseconds, so the hold did not delay them.

**Telemetry:**

- T-003 is present. All three causes were observed: `deadline`, `resume`, and `peer`. `deadline_ms` matches the
  `SessionService` deadlines.
- T-004 `expiration_log_in` is present.
- T-005 is present: two `Interaction.login` with `expiration_modal`, each followed by the next document.

The BDD resume scenarios export no browser telemetry, because of the paused clock and early browser close. The resume
probe recorded it instead. No instrumentation was missing or unusable, and no forbidden data was observed.

**Cleanup:** the verifier's keys were deleted, its ports stopped, and the scratch tenants removed.

### Slice B re-verification — `7ad9159628f7f7d45b07c916c7b798250607a27f` (2026-11-13)

This run supersedes the `66edb65` report above. Slice C's loaded run `1fd2a803` found a stall at `66edb65`. A deadline
check fired a few milliseconds before the tab's clock reached its local deadline and was answered as usable. The tab
then never confirmed again. Commit `410582e` fixed this: the tab now re-confirms at the server's deadline after any
usable answer with no deadline timer pending. A module example and a fourth BDD scenario reproduce the stall, and both
fail without the fix.

**Runs:** all ran concurrently on one deliberately loaded machine.

- Full BDD: `5909f43c-b000-429f-a1a8-4698a9b681b1`.
- Main §B probe: `4ac7c952-c4fa-4550-bd5a-3ef3fcf20da3`.
- Resume probe: `0da9d709-4062-4a68-916c-35d299a8f23c`.
- Early-estimate probe: `0d6eb7a8-becd-415f-8569-397be5c13961`.
- Follow-up probe: `6dec3929-dfec-45a4-bdda-67990e95530e`.

**Conditions:** the same as at `66edb65`.

**Module evidence:** frontend-services 491/491, integration 42/42, and frontend unit 108/108.

**BDD:** the full suite passed, 86 scenarios and 1333 steps, including the early-check scenario.

**Early estimate:** the verifier ran three samples. In each, the tab's clock ran 3 s fast while another tab renewed the
session, and then the clock was corrected. Each sample went through four steps:

1. `content_concealed` (cause `deadline`) at about −2985 ms.
2. The status check was answered 200.
3. `content_shown` about 2.9 s before the deadline.
4. At the server's deadline, the re-confirmation was answered 401, and `expired` followed at +16.5, +16.5, and
   +12.5 ms.

There was no stall.

**Results per claim:** the results match the `66edb65` table above under load.

- V-009: three sharing tabs at +28 to +30 ms.
- V-010: the tab concealed, then showed its content, then expired at the true deadline (+16 ms). With activity in the
  same context, it never concealed.
- V-016: the modal appeared at +107 ms and at +104 ms, and the content returned at +110 ms.
- V-011, V-012, V-015, V-017, V-023, V-018 (modal), and V-024 (modal) were established.
- V-013 and V-014: the browser parts were established. The screen-reader checks (§B.6) are outstanding for a person.

**Submission hold:** submissions 999, 399, and 148 ms before the deadline were admitted, and no tab concealed.

**Telemetry:** T-003 (causes `deadline`, `resume`, and `peer`), T-004 `expiration_log_in`, and T-005
`expiration_modal` are present. No instrumentation was missing or unusable, and no forbidden data was observed.

**Cleanup:** the verifier's keys were deleted, its ports stopped, and the scratch tenants removed.

### Slice B re-verification — `e9382be1dd7360053c2e663d006fd8d9ef72c80b` (2026-11-13)

This run supersedes the `7ad9159` report above. A targeted check at `0f25a29` (run
`13a67d84-e6f9-4037-ba4e-ac39ab891e9b`) failed V-009. The store answered 401 8–20 ms before `deadline_ms`, and the tabs
showed the signed-out notice instead of the modal.

Commit `3a48217` fixed this. When an `Ended` answer arrives within 2 s before the held deadline and no logout was
observed, the tab stays concealed and evaluates D7 when its estimate reaches the deadline. A logout observed meanwhile
still ends it signed out. The early eviction itself comes from clock-domain drift and is left to S2. `deadline_ms` is on
the application clock, while Redis expires a relative `PX` on its own clock. Redis measured +86 ms, then +49 ms, against
the host.

`0f25a29` made the BDD sign-in step accept a same-second provider return, because Keycloak's `auth_time` has
whole-second resolution.

**Runs:**

- Probes at `e9382be`: main §B `8c4c8d56-af7b-4e05-bfcf-31e893e8bc62`, early-usable
  `8ace3b6c-0abe-4725-aec4-ba85748714c5`, early-401 `f431cbe9-9dc1-4aea-950a-b3c98877691b`, resume
  `1ec187ac-bb74-48fa-9e63-ada0ae5572e9`, follow-up `b9de42d7-afb1-4b7c-a85f-b5ad7859ddba`.
- Full BDD: run `2ddc1656-488a-4d4f-a142-c1e7e0fb1fa4` at slice C `354a1e1`, whose product code is identical to
  `e9382be` (`git diff --stat e9382be 354a1e1 -- packages` is empty). A Docker restart killed the full run at
  `e9382be`, so this run replaces it.
- Re-run probes at that revision: §B `081a55ab…` and resume `dad42da4…`.

**Module evidence:** frontend-services 491/491, integration 42/42, and frontend unit 111/111.

**BDD:** 90 scenarios and 1446 steps passed, including all four `expiration-protection.feature` scenarios.

**Early ended answer:** the verifier deleted the session's own key in its verify prefix just before a deadline check
that was scheduled early.

- 1.5 s early: a 401 at −1439 ms, then the modal at +5 ms. T-003 went `content_concealed` → `expired` (`deadline`) with
  no `signed_out`.
- 1.0 s early: the modal at +5 ms and +13 ms.
- 3.0 s early, outside the window: the tab signed out at once, as designed.
- Re-confirmations answered 401 25–32 ms before the deadline showed the modal 3 times out of 3.

**Logout during the hold:** the logout came at −1271 ms, after an early 401. Both tabs signed out, with no modal.

**Early usable answer:** 3 times out of 3 the tab concealed, the content returned, the tab re-confirmed, and the modal
appeared at the deadline.

**Results per claim:**

- V-009 through V-017 and V-023 are established, with the screen-reader parts of V-013 and V-014 outstanding.
- The modal parts of V-018 and V-024 are established.
- Observations matched the earlier reports: V-016 resume at +106 to +113 ms.
- Submissions 1018, 417, and 168 ms before the deadline were admitted with no concealment.

**Telemetry:** T-003, T-004, and T-005 are present. Step 11 re-inspection found no forbidden data in spans, resources,
logs, or metric labels.

**Disclosure:** the verifier's C probe stopped the shared Keycloak for about 12 s. The full suite still passed.

**Cleanup:** the verifier's keys were deleted, its ports stopped, and the scratch tenants removed.

### Slice C — `1da252c` implementation run (2026-11-13, before verification)
### Slice C — `a92ca38` implementation run (2026-11-13, before verification)
### Slice C — `2f91645` implementation run (2026-11-13, before verification)

Recorded by the implementation session; the verifier's report supersedes it. The C test commit is `2f91645` on B's final
head `e9382be1dd7360053c2e663d006fd8d9ef72c80b`. At that revision the C scenarios passed (BDD run
`9277c462-5bde-4a15-8ff6-34e8e419e463`, 4 pickles, 113 steps) and the procedure ran again in full (run
`2837393e-6cfb-42b3-a04b-891737ed0401`) with the same outcome for every step: modal 71–90 ms after the deadline. The
earlier runs below, at `bfdd8d5` on B `66edb65` and at `6a1ec0c` on B `7ad9159` (run
`d1b62b21-a363-4244-ad54-8d36d4cb9cbb`), had the same outcomes. The local stack restarted before the final run, so
telemetry for the earlier runs may no longer be queryable.

**Runs:** manual `c11fe41d-f0c5-43d6-80f9-8b4daab4e44b` (procedure steps 1–12, browser tracing on); BDD
`72696e01-de48-4aa5-a81c-d907c0bff58d` (scenario 1), `f68b1b20-ea50-4df6-9afb-59dbabb9cc10` (scenario 3), and
`407e628d-84e3-4403-9dd0-5c45485f9ea6` (scenario 2) on the C files before the commit, then the `@preets-session-012 or @preets-session-013` regression `aff675b2-4674-4f2d-a5dc-04e49e67ddae` at `bfdd8d5`.

**Conditions:** a production build; local Redis, the tracked Keycloak realm, and otel-lgtm with OTEL enabled, the
harness `service.version` and `service.instance.id`, and `BROWSER_TRACING_ENABLED=true`; a 5-minute Springfield
scratch tenant; Redis prefix `preets:verify:<run>:`; Chromium through the harness proxy. The default flow: no route
interception and no activity delay, except the provider-answer substitution described below.

**BDD:** `expired-recovery-login.feature` (`@preets-session-013`): 3 scenarios (4 pickles) pass. The
`@preets-session-012 or @preets-session-013` regression at `bfdd8d5`: 18 scenarios, 379 steps, all passing. At `6a1ec0c` (run `425d2129-e4c6-4bad-be23-756e943dae73`): 18 of 19 pass, including C's three and B's
new early-deadline scenario. B's first scenario fails at its Shelbyville sign-in, where the provider returns without
an authentication step; it fails the same way at B's own head `7ad9159` without C. The verifier's full suite at `7ad9159` passed it, so it
depends on timing in this environment; it is reported to slice B.

**Manual procedure (one composed journey, run `c11fe41d`):**

| Step | Observation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2  | Context 1: Springfield tabs A2, A3 (with a roster history entry), A4, and a Shelbyville tab; A1 in its own signed-in browser with timers suspended (a frozen tab receives no cross-tab messages); context 2 with C2; further browsers for steps 8 and 9. Each browser signed in through the provider, so each holds provider SSO.                                                                                                                                                                                                   |
| 3    | Modal 36–48 ms after the deadline in A2, A3, A4 and both step-9 tabs. A1 after the deadline: 401 `text/plain`, no receipt, "Your session expired" recovery with focus on its heading, no protected content, and no provider or `/auth/login` request.                                                                                                                                                                                                                                                                               |
| 4    | Screen reader: **not executed** (no assistive technology in this environment).                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 5    | A3: Escape, outside click, close button, `window.find("Reference session")` → false, 30 Tab + 30 Shift+Tab with focus never leaving the modal, background clicks: modal stays, path `/`, nothing protected. Forward, back, and refresh each reach the provider's authorization page with no protected document.                                                                                                                                                                                                                     |
| 6    | Record removed before the deadline: scripts on → 401 `text/plain`, "Your session is no longer available"; scripts off in a fresh context → 401 document with that one heading.                                                                                                                                                                                                                                                                                                                                                      |
| 7    | No login traffic in A1, A2, A4 from display to activation. Keyboard Log in from A1's recovery and from A2's modal: provider at `max_age=0`, password-only re-authentication (SSO held, no username asked), a new session, and the old reference answered 307 `/auth/login`. A4 (same browser as A2) still shows the modal and no protected content 3 s after A2's login, with no document; its own Log in loads `/` (200) with no provider request.                                                                                 |
| 8    | P1 suspended across expiry: hidden at once on resume, modal 56 ms later. P2 suspended while another browser renewed: hidden at once, content again, no dialog.                                                                                                                                                                                                                                                                                                                                                                      |
| 9    | From the modal and from recovery, each a cancel (provider `access_denied` return) and an unreachable provider (refused connection at the authentication step): the provider asked first (`max_age=0`); then the authentication-return page or the browser's error page, nothing protected, no protected document, the held reference answered 307 `/auth/login`; a later Log in asks the provider again and yields a new session. Stale and missing `auth_time`: **not executed** (no fixture supports them at these entry points). |
| 10   | The Shelbyville tab and C2 kept their content and never showed a dialog.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 11   | T-005: 7 `Interaction.login` (3 `action_recovery`, 4 `expiration_modal`). `AuthenticationService.complete`: 2 `denied` (the cancels), every success `confirmed` / `inside`; no completion for the unreachable cases. T-003 `expired`: 5 with cause `deadline` or `peer` and `server_time_ms − deadline_ms` of 13–31 ms, 1 `resume`. `denied_unauthenticated >> authorizeSessionAction` is empty. No span carries a query string; span keys are within the allowed classes.                                                          |
| 12   | Owned keys deleted, the app stopped, the scratch tenant removed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

| Claim                     | Result (implementation run)                                                  | Observation                                                                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-019                     | established                                                                  | BDD scenario 1 and manual step 7, from recovery and from the modal.                                                                                                                                  |
| V-020                     | established                                                                  | No `/auth/login` or provider request over 5 s after display (BDD, all entry points) and from display to activation (manual).                                                                         |
| V-021                     | established for cancel and provider error; stale and missing not established | Both failures from both entry points (BDD scenarios 2–3, manual step 9). Stale and missing `auth_time` rest on #158 module evidence and `tenant-oidc-callback.feature` (verification.md limitation). |
| V-022                     | established                                                                  | BDD scenario 1 (M2) and manual step 7 (A4).                                                                                                                                                          |
| V-001–V-018, V-023, V-024 | re-observed in the composed run; AT parts not executed                       | Steps 3, 5, 6, 8, 10, 11 match the slice results above.                                                                                                                                              |

**Limitations:** the cancel and provider-error answers are substituted in the browser after the real provider asked
to authenticate (the realm's `consent-web` client would persist the synthetic user's grant; stopping the shared
Keycloak is outside this run). The realm's `stale-auth-time-web` client cannot establish a session that later
expires. Within one second of a sign-in, the provider may return without asking (its whole-second `auth_time`), which
the 30 s tolerance accepts; every Log in observed here came minutes after the last authentication. Suspension is
emulated with Playwright's clock.

**B observation (fixed):** in an earlier attempt (run `1fd2a803-8d84-4530-9d02-428c75a527dc`, machine loaded by a
concurrent full BDD suite) every expiring tab confirmed 6–36 ms before the server deadline, got a usable answer, and
sent no further confirmation for about 26 s, so no modal appeared. Unloaded runs never took that path. B reproduced it
deterministically and fixed it in `410582e` (a usable answer with no confirmation pending now always re-confirms at the
server's deadline); the restacked run above includes that fix.
