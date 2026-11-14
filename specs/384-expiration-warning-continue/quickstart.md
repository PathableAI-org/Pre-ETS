# Quickstart: Validate the Expiration Warning and Continue

This guide puts [verification.md](verification.md) into practice for the design in [plan.md](plan.md),
[contracts/modules.md](contracts/modules.md), and [contracts/telemetry.md](contracts/telemetry.md). It records no
executed evidence yet. Run commands from the repository root. Each slice records its results under
[Execution results](#execution-results) with `pnpm verify:render --write`.

## Claim and boundary map

Each claim is observed once, at the boundary that can establish it. Module evidence is cited, not repeated as
feature evidence. Thresholds are observed in real elapsed time (research D13).

| Claims | Feature evidence (this guide)                                                                                                     | Supporting module evidence                                             | Slice(s)    | Gate / limitation                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- | ------------------------------------------------- |
| V-001  | §D: default 30-minute policy warns at 25 minutes; 6-minute timeout warns 5 minutes before; 5-minute timeout never                 | `tenant-policy.test.ts` (existing)                                     | D           | Real time; `@long-idle` for the 30-minute case    |
| V-002  | §D: explicit `0` at 5, 6, and 30 minutes shows no warning before the deadline                                                     | `tenant-policy.test.ts` (existing)                                     | D           | Real time; `@long-idle` for the 30-minute case    |
| V-003  | §A: lead of 4 at a 5-minute timeout; §D: lead of 1 at a 5-minute timeout                                                          | Warning-period property (A)                                            | A (part), D | —                                                 |
| V-004  | §D: each invalid value answers the tenant 404 at a tenant-consuming request, with no session; the rejection log                   | `tenant-policy.test.ts`, `tenant.test.ts` (existing)                   | D           | —                                                 |
| V-005  | §D: old timing before a renewal, new timing after it in both tabs, and an unrenewed session unchanged; T-005 lead                 | `session-policy-refresh.test.ts` (existing)                            | D           | —                                                 |
| V-006  | §A: two sharing tabs open the warning within 2 s of the threshold; T-002 timing; T-004                                            | Confirm-before-open controller examples                                | A           | L-1 throttled hidden tabs                         |
| V-007  | §A: a tab in a second browser that shares the session misses a renewal, confirms at its stale threshold, and does not warn; T-001 | Controller examples                                                    | A           | —                                                 |
| V-008  | §A: keyboard Continue; T-003 to T-005 latency and the deadline before and after                                                   | Endpoint examples; one-request controller example                      | A           | —                                                 |
| V-009  | §A: the other tab closes within 2 s of the renewal response, for Continue and for a page load; T-002                              | Adoption controller examples                                           | A           | Gap G2 for the page-load case (`verification.md`) |
| V-010  | §A: Escape, an outside press, and a failed Continue leave every warning open and the deadline unchanged                           | Controller examples                                                    | A           | —                                                 |
| V-011  | §C: a Continue held past the deadline is refused; the next protected request is denied; T-003 trace                               | Deadline property and handler examples (C); real-Redis race (existing) | C           | —                                                 |
| V-012  | §C: three resume cases; T-001 cause `resume`                                                                                      | Controller examples                                                    | C           | L-2 emulated suspension                           |
| V-013  | §C: a tab resumed past its deadline conceals at once; after an ended confirmation nothing renews                                  | —                                                                      | C           | L-2 emulated suspension; pre-script paint         |
| V-014  | §B: accessibility tree (modal dialog, name, description, one button); §B manual screen-reader steps                               | —                                                                      | B           | L-3 screen reader needs a person                  |
| V-015  | §B: focus entry and containment, visible focus, Enter and Space, inert background, restoration in each tab                        | `blockBackground` and `restoreFocus` examples                          | B           | L-3 for screen-reader navigation; L-4 top layer   |
| V-016  | §C: 5-minute default and explicit `0` sessions expire at the deadline into #157's outcome; §D: explicit `0` at 30                 | —                                                                      | C           | —                                                 |
| V-017  | §C: after the late Continue every sharing tab shows the expiration modal and no warning                                           | Ended-answer controller example                                        | C           | —                                                 |
| V-018  | §A: another tenant's tab and another browser's session are unaffected by the warning and by Continue                              | Tag-filter examples (existing)                                         | A           | —                                                 |

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
  `BROWSER_TRACING_ENABLED=true` for telemetry steps, a `preets:verify:<run-uuid>:` Redis key prefix, and owned
  ports. Build and start production:

  ```sh
  pnpm --filter @pathableai/pre-ets-frontend build
  pnpm --filter @pathableai/pre-ets-frontend start
  ```

- A scratch tenant directory copied from the tracked fixtures. Unless a section says otherwise, Springfield has
  `idleTimeoutMinutes: 5` and `warningLeadMinutes: 4`, so its threshold arrives one minute after each renewal, and
  Shelbyville keeps the defaults. Delete the directory in cleanup.
- Conditions to record with every timing observation: the tenant settings, any tab whose clock was suspended or
  skewed, and any Continue that was failed or held by request routing (research D14).
- A screen reader for the manual steps marked AT: VoiceOver with Safari, or NVDA with Firefox. These steps need a
  person (limitation L-3). Without one, record those parts as not executed.

## Module evidence

Run for every slice:

```sh
pnpm --filter @pathableai/pre-ets-frontend-services test
pnpm --filter @pathableai/pre-ets-frontend-services test:integration
pnpm --filter @pathableai/pre-ets-frontend test:unit
```

Expected per slice: the examples and properties listed in
[modules.md contract evidence](contracts/modules.md#contract-evidence) for that slice pass, and none of the existing
suites regress.

## §A — Warn and continue across tabs

Run the BDD:

```sh
pnpm test:bdd:dry
pnpm test:bdd -- --tags "@preets-session-011 and not @long-idle"
```

Expected BDD (new `expiration-warning.feature`). The visitor signs in to Springfield in browser 1 and opens tabs T1
and T2, opens tab T3 for Shelbyville in the same browser, and a second browser signs in to Springfield at least 20
seconds later and opens tab T4.

1. **Opening.** After one idle minute, T1 and T2 each show a dialog named "Your session is about to expire" within
   2 seconds of their threshold (`data-session-deadline` minus four minutes), with focus on Continue. T3 and T4 show
   none at that time. T4 shows its own warning at its own later threshold (V-006, V-018, V-003 part).
2. **Nothing else closes it.** In T1 press Escape and press the pointer outside the dialog. Both dialogs remain, and
   `data-session-deadline` is unchanged in both tabs (V-010).
3. **Failed Continue.** With the next `POST /session/activity` from T1 answered 503 by request routing, activate
   Continue. Both dialogs remain, T1 shows "We could not continue your session. Try again.", and the deadline is
   unchanged (V-010).
4. **Continue.** Activate Continue in T1 with Enter. The request answers 200. T1's dialog closes, T2's closes within
   2 seconds of the response, and both tabs hold the same later deadline. T3's and T4's dialogs and deadlines are
   unchanged (V-008, V-009, V-018).
5. **Another qualifying request.** With the warning open again in T1 and T2, open a protected page in a new tab T5.
   T1's and T2's dialogs close and adopt T5's deadline. Record the time from T5's response; a close later than
   2 seconds is the known G2 shortfall, not a pass (V-009).
6. **Stale threshold.** A second browser that shares the visitor's session cookie opens tab S, which receives no
   cross-tab message from browser 1. The visitor types in T1 thirty seconds before the threshold. At S's stale
   threshold, S shows no dialog at any time and its `data-session-deadline` moves to the later deadline (V-007).

Manual and telemetry steps (browser tracing on):

1. Start the app at the revision with the harness settings. Record the revision, run UUID, and tenant settings.
2. Repeat cases 1 to 4 with two sharing tabs, waiting for `data-preets-browser-tracing="started"` in each tab, and
   acting on one tab per step.
3. Query T-001 and T-002: each tab has a `TabCoordination.threshold` (`threshold`) with a `sessionStatus` `ok`
   descendant, then `warning_shown` with `server_time_ms − (deadline_ms − lead × 60000) ≤ 2000`, then T-004
   `warning_continue` `entered` and `application`.
4. Query T-003 and T-005: one `Interaction.continue`, with `sessionActivity` `ok` and
   `SessionService.refreshForTenant` `renewed` (`continue-session`) in its trace. Record the time from the fact to
   the server span, and the deadline before (from T-002) and after (from T-005).
5. Query T-002 closes: T1 `continue`, T2 `peer` under a `TabChannel.receive` (`renewed`), both with the T-005
   deadline. Record the time from the end of the `sessionActivity` span to T2's close.
6. Repeat case 6 and query T-001 for S: its descendant `SessionService.read` shows a later deadline than the fact,
   and no `warning_shown` follows.
7. Confirm no exported attribute holds page text, a session reference, a tag, or identity.

## §B — Accessible blocking

BDD (same feature file; Springfield as above; T1 on `/coordination/roster` with focus on a roster control, T2 on a
protected page with nothing focused):

1. **Dialog semantics.** When the warning opens, the accessibility tree has one modal dialog with the name "Your
   session is about to expire" and the explanation as its description, and exactly one control inside it, the button
   "Continue". No "Close modal" control is exposed or rendered (V-014, V-015).
2. **Containment.** Focus is on Continue with a visible focus indicator. Thirty Tab and thirty Shift+Tab presses
   leave focus on Continue. A pointer press outside the dialog leaves focus on Continue. After another window takes
   focus and the tab is brought back, focus is on Continue (V-015).
3. **Inert background.** The accessibility tree exposes no header, link, button, or field outside the dialog. A
   pointer press at the position of a background link and of Log out navigates nowhere and starts no logout (V-015).
4. **Keyboard activation.** Space on Continue renews, as Enter did in §A (V-015).
5. **Restoration.** After the renewal, T1's focus is on the roster control that had it. T2's focus is on the page's
   main content. Both pages are operable again (V-015).

Manual (AT, a person): with the screen reader on a sharing tab, record the announcement when the warning opens,
that the explanation and Continue are read and reachable, that screen-reader navigation reaches nothing behind the
dialog, and what is announced when focus returns (V-014, V-015). Telemetry: none new. T-004 orders the steps.

## §C — Expiration still wins: resume, late Continue, disabled warnings

BDD (same feature file; "S" tabs are in a second browser that shares the visitor's session cookie, opened with
their timers suspended, as #157's resume scenarios do):

1. **Resume in the warning period.** S is suspended before its threshold and resumed ten seconds after it. Its
   content stays visible, it confirms, and the warning opens within 2 seconds of the resume (V-012).
2. **Resume after a renewal elsewhere.** The visitor continues in T1. S, still holding the old deadline, is resumed
   after its stale threshold. It shows no warning and adopts the later deadline (V-012).
3. **Resume past the stale deadline with a valid session.** S is resumed after its stale deadline while the
   session, renewed once in T1, is in its warning period. S hides its content in the same task, restores it after
   the confirmation, and then shows the warning (V-012, V-013).
4. **Late Continue.** With the warning open in T1 and T2, T1's Continue request is held by request routing until
   the real deadline has passed, then released to the server. The request answers 401. T1 and T2 show the
   expiration modal and no warning, a protected request with the session cookie is denied, and
   `GET /session/status` answers 401 (V-011, V-017).
5. **Resume after the session ended.** S is resumed after that deadline. It hides its content at once, the
   confirmation reports the session ended, it shows the expiration modal, and keyboard and pointer interaction in S
   cause no request that answers 200 (V-013).
6. **Disabled warnings.** In Shelbyville, one session is established under a 5-minute timeout with the warning
   omitted, and a second, in another browser, after the tenant file changes to a 6-minute timeout with an explicit
   `0`. No dialog is ever present in either tab before its deadline, each shows the expiration modal within
   2 seconds of its deadline, and a protected request afterwards is denied (V-016).

Cases 3 to 6 share their waiting in as few scenarios as the steps allow; the group takes about seven minutes.

Module: the deadline property and the handler examples of research D15 pass (V-011).

Telemetry (browser tracing on, cases 1, 2, 4, and 6): T-001 with cause `resume` and its `sessionStatus` descendant
precedes each resumed opening. The held Continue's `Interaction.continue` trace holds `protectRequest`
`denied_unauthenticated` or `SessionService.refreshForTenant` `expired` or `missing`, and no `renewed` follows for
that `session.id`. The disabled sessions have no T-001 and no `warning_shown`, and #157's `expired` transition shows
`server_time_ms − deadline_ms ≤ 2000`.

## §D — Tenant policy end to end and the full procedure

BDD (new `warning-policy.feature`, `@preets-session-011`):

```sh
pnpm test:bdd -- --tags "@preets-session-011"
```

1. **Short policies.** Sessions established one after another in separate browsers as the Springfield file changes:
   a 6-minute timeout with the warning omitted (the tab holds a lead of 5 and warns one minute in), a 5-minute
   timeout with a lead of 1 (warns four minutes in), a 5-minute timeout with an explicit `0`, and a 6-minute timeout
   with an explicit `0` (neither ever shows a dialog before expiring at its deadline). All four idle together
   (V-001, V-002, V-003).
2. **Invalid settings.** For `-1`, `1.5`, `"five"`, a lead equal to the timeout, and a lead above it, a request
   for the Springfield site answers the tenant-not-found 404, sets no session cookie, and starts no login (V-004).
3. **Policy change.** Two Springfield sessions, one with two tabs, start under a lead of 4. The setting changes to
   `0`: both sessions still warn at the old threshold. Continue in the first session adopts `0` in both of its tabs
   (`data-session-warning-lead="0"`), and no warning opens before its next deadline. The second session, not
   renewed, keeps its old lead. The setting then changes to omitted, and typing in the first session renews it:
   the five-minute default still gives no lead. It then changes to `1`, and typing renews again: both tabs hold a
   lead of 1 and warn one minute before the new deadline. A further change to `2` and a renewal move the threshold
   to two minutes before (V-005).
4. **Long idle (`@long-idle`, about 31 minutes).** With the default tenant (30-minute timeout, warning omitted) a
   session's tab holds a lead of 5 and opens the warning within 2 seconds of 25 minutes of inactivity. A second
   session, established after the file changes to an explicit `0`, shows no dialog through 30 minutes and then the
   expiration modal. The first session, never continued, also expires at its deadline (V-001, V-002, V-016).

Slice D raises the nightly BDD job's timeout for these scenarios.

Manual: run the full [verification.md procedure](verification.md#procedure) steps 1 to 13 at the D revision, with
the details of §A to §C. Step 3 waits 25 real minutes under the default tenant. Steps 4 to 7 run again under the
one-minute Springfield settings for the latency measurements. Step 12 reads the rejection log:

```text
{service_name="pre-ets-frontend", service_instance_id="<run-uuid>"} |= "Tenant configuration request failed" | service_version="<sha>"
```

Each rejection carries `preets.tenant.config.rejected_field = warningLeadMinutes` and no value. The screen-reader
steps 3 to 5 need a person (L-3) and stay an outstanding manual check until one runs them.

## Telemetry queries

`RUN` = `resource.service.version = "<sha>" && resource.service.instance.id = "<run-uuid>"`.

```text
{ RUN && name = "TabCoordination.threshold" } | select(span.preets.ui.cause, span.preets.session.deadline_ms, span.preets.session.server_time_ms, span.preets.session.warning_lead_minutes)
{ RUN && name = "TabCoordination.threshold" } >> { RUN && name = "sessionStatus" } | select(span.preets.outcome)
{ RUN && name = "TabCoordination.threshold" } >> { RUN && name = "SessionService.read" } | select(span.preets.session.deadline_ms, span.session.id)
{ RUN && name = "TabCoordination.transition" && span.preets.ui.to_state = "warning_shown" } | select(span.preets.ui.cause, span.preets.session.deadline_ms, span.preets.session.server_time_ms, span.preets.session.warning_lead_minutes)
{ RUN && name = "TabCoordination.transition" && span.preets.ui.from_state = "warning_shown" } | select(span.preets.ui.to_state, span.preets.ui.cause, span.preets.session.deadline_ms, span.preets.session.server_time_ms)
{ RUN && name = "Interaction.continue" } >> { RUN && name = "SessionService.refreshForTenant" } | select(span.preets.outcome, span.preets.session.activity, span.preets.session.deadline_ms, span.session.id)
{ RUN && name = "Interaction.continue" } >> { RUN && name = "protectRequest" } | select(span.preets.outcome)
{ RUN && name = "SessionService.refreshForTenant" && span.preets.session.activity = "continue-session" } | select(span.preets.outcome, span.preets.session.deadline_ms, span.preets.session.warning_lead_minutes, span.preets.tenant.alias, span.session.id)
{ RUN && name = "Focus.move" && span.preets.focus.target = "warning_continue" } | select(span.preets.focus.change, span.preets.focus.cause)
{ RUN && name = "TabCoordination.transition" && span.preets.ui.to_state = "expired" } | select(span.preets.ui.cause, span.preets.session.deadline_ms, span.preets.session.server_time_ms)
```

An empty result is inconclusive until the verifier confirms that OTEL was enabled, traffic occurred, and about 30 s
of export time passed.

## Cleanup

Close the browser contexts, end the provider session, delete `preets:verify:<run-uuid>:*` keys, delete the scratch
tenant directory, remove request routing, and stop owned processes. Never flush a shared store.

## Execution results

No slice has been executed. Each implementation slice appends its section here with `pnpm verify:render --write`.

### Slice A — `4b887613431f27882452bad3adae6a0f29b2670d` (2026-11-14)

Generated from the verification note on `4b88761` (`refs/notes/verification`). Do not edit by hand.

**Run:** `4fdcb6f8-e1fe-4ef4-b623-22d9bbed5faa`, 2026-11-14T04:31:31.882Z to 2026-11-14T04:35:06.967Z.

**Conditions:** Verifier worktree detached at the SHA; production build of @pathableai/pre-ets-frontend started by the BDD harness (next start on an owned ephemeral loopback port, tenant hosts *.localhost:3000 through the harness proxy). Local Compose services: Redis, Keycloak (tracked pre-ets realm), Postgres, otel-lgtm (Grafana, Tempo, Loki). OTEL enabled: OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318/ (no headers), OTEL_SERVICE_NAME=pre-ets-frontend, OTEL_SERVICE_VERSION=<SHA>, OTEL_RESOURCE_ATTRIBUTES=service.version=<SHA>,service.instance.id=<run UUID>, BROWSER_TRACING_ENABLED=true. Session store timeout 2000 ms, session TTL 86400 s, random per-run signing secret. Harness-set prefixes preets:verify:<run>:session: and preets:verify:<run>:oidc-tx: were overridden by the BDD world's own preets:bdd:<uuid>: prefixes. Chromium via Playwright, headless. Synthetic tenants Springfield (idleTimeoutMinutes 5, warningLeadMinutes 4) and Shelbyville (defaults) from the scenario's scratch tenant directory.

| Claim                                              | Result      | Observation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-006                                              | established | T1/T2 (shared Springfield session, deadline_ms 1794630996695, lead 4): each T-001 cause threshold with descendant sessionStatus ok and SessionService.read current at the same deadline; warning_shown cause threshold at server_time − (deadline − 240000) = 31.1 ms and 34.25 ms; Focus.move warning_continue entered/application 30 ms after threshold in each. T4 (second browser, deadline_ms 1794631018252): T-001 with sessionStatus ok, warning_shown at 16 ms, Focus.move entered/application. All three openings ≤ 2000 ms. Conditions: Real elapsed time; all tabs visible with running timers; no clock suspension or skew; no request routing at the openings.. Evidence: traces `f636d098fc0d05e667eab19cdd221204`, `96c8b9c137b054fdbf06e15d82dafceb`, `80411210114d52ffb63b744ce896e0a6`, `1a7195abc133889a04990c46b7559b5b`, `c1eb9b40b6f7bc3169dc450d62a07d3b`, `a18bf5b5bf71590a5d597da630060c41`, `2f7c8d0ed5056871c6dc991daf45654`, `71a655537309d65c5563192e5a772c50`, `308e0ca696277bd5d3bc8dcaa263ef22`; queries `{ RUN && name = "TabCoordination.threshold" } \| select(span.preets.ui.cause, span.preets.session.deadline_ms, span.preets.session.server_time_ms, span.preets.session.warning_lead_minutes)`; `{ RUN && name = "TabCoordination.threshold" } >> { RUN && name = "sessionStatus" } \| select(span.preets.outcome)`; `{ RUN && name = "TabCoordination.transition" && span.preets.ui.to_state = "warning_shown" } \| select(span.preets.ui.cause, span.preets.session.deadline_ms, span.preets.session.server_time_ms, span.preets.session.warning_lead_minutes)`; `{ RUN && name = "Focus.move" && span.preets.focus.target = "warning_continue" } \| select(span.preets.focus.change, span.preets.focus.cause)`; quickstart §A case 1 via BDD expiration-warning.feature scenario 1 (passed): T1 and T2 each showed the warning within 2 s of their threshold with focus on Continue; T4 likewise at its own threshold.. |
| V-007                                              | established | Typing in T1 renewed the session (keyboard-interaction, renewed, deadline_ms 1794631171796) 30 s before S's threshold. S's T-001 (cause threshold) held the stale deadline_ms 1794631141768; its descendant sessionStatus was ok and both descendant SessionService.read spans returned current with deadline_ms 1794631171796 (30.0 s later). No warning_shown transition exists in the run after 04:32:58Z, so none followed S's T-001. Conditions: Real elapsed time; S shares the session cookie from a separate browser context and receives no cross-tab messages; no clock control.. Evidence: traces `d535738684d0b9865b9d05900380fe94`, `6ec889c8f9a806d2babd4ad4509fcf0d`; queries `{ RUN && name = "TabCoordination.threshold" } >> { RUN && name = "SessionService.read" } \| select(span.preets.session.deadline_ms, span.session.id)`; `{ RUN && name = "TabCoordination.transition" && span.preets.ui.to_state = "warning_shown" } \| select(span.preets.ui.cause, span.preets.session.deadline_ms, span.preets.session.server_time_ms, span.preets.session.warning_lead_minutes)`; quickstart §A case 6 via BDD expiration-warning.feature scenario 2 (passed): tab S in a second browser sharing the session showed no warning through its stale threshold and adopted T1's deadline; T1 and T2 showed no warning..                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| V-008                                              | established | Interaction.continue (activated) at 04:32:58.319Z; its child browser POST /session/activity reached the server (http server span) 4 ms later, protectRequest admitted at +6.9 ms, sessionActivity ok, SessionService.refreshForTenant renewed, activity continue-session, activity_class qualifying, lead 4, alias springfield, at +25.1 ms. Deadline before 1794630996695 (T-002 opening and in-trace SessionService.read), after 1794631078344 (+81.6 s). Exactly one continue-session renewal in the run. Conditions: Real elapsed time; no request routing on this Continue (the earlier routed 503 had been consumed).. Evidence: traces `5c74ab23a9aeb3dbf84c007dda83060d`; queries `{ RUN && name = "Interaction.continue" } >> { RUN && name = "SessionService.refreshForTenant" } \| select(span.preets.outcome, span.preets.session.activity, span.preets.session.deadline_ms, span.session.id)`; `{ RUN && name = "Interaction.continue" } >> { RUN && name = "protectRequest" } \| select(span.preets.outcome)`; `{ RUN && name = "SessionService.refreshForTenant" && span.preets.session.activity = "continue-session" } \| select(span.preets.outcome, span.preets.session.deadline_ms, span.preets.session.warning_lead_minutes, span.preets.tenant.alias, span.session.id)`; quickstart §A case 4 via BDD scenario 1 (passed): Continue activated with Enter in T1; request answered 200..                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| V-010                                              | established | Browser interaction as above. Telemetry agrees: the failed Continue's Interaction.continue (04:32:36.818Z) has no server span in its trace; no renewal of the T1/T2 session and no transition from warning_shown occurred between the openings (04:32:36.72Z) and the successful Continue (04:32:58.348Z). Conditions: Failed Continue produced by Playwright request routing (503) on the next activity report from T1; recorded per research D14.. Evidence: traces `da6fcb41de5f611a2a9066e046f939fd`; queries `{ RUN && name = "TabCoordination.transition" && span.preets.ui.from_state = "warning_shown" } \| select(span.preets.ui.to_state, span.preets.ui.cause, span.preets.session.deadline_ms, span.preets.session.server_time_ms)`; `{ RUN && name = "SessionService.refreshForTenant" && span.preets.outcome = "renewed" } \| select(span.preets.session.activity, span.preets.session.deadline_ms, span.preets.tenant.alias, span.session.id)`; quickstart §A cases 2 and 3 via BDD scenario 1 (passed): after Escape and a pointer press outside the dialog in T1, and after a Continue whose POST /session/activity was answered 503 by Playwright routing, both dialogs stayed open, T1 showed the could-not-continue message, and data-session-deadline was unchanged in T1 and T2..                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| V-018                                              | established | The only continue-session renewal carries the session.id and alias springfield of the T1/T2 session (same session.id as T1/T2's sign-in renewals). Shelbyville's session (lead 5) and T4's session were renewed only at sign-in. T4's T-001 and warning_shown held deadline_ms 1794631018252, equal to its session's sign-in renewal; the T1 Continue did not move it, and T4's opening and focus followed at its own threshold, 21.5 s after T1/T2's. Conditions: Real elapsed time; tenant alias and session.id compared for equality only.. Evidence: traces `5c74ab23a9aeb3dbf84c007dda83060d`, `c1eb9b40b6f7bc3169dc450d62a07d3b`, `a18bf5b5bf71590a5d597da630060c41`; queries `{ RUN && name = "SessionService.refreshForTenant" && span.preets.session.activity = "continue-session" } \| select(span.preets.outcome, span.preets.session.deadline_ms, span.preets.session.warning_lead_minutes, span.preets.tenant.alias, span.session.id)`; `{ RUN && name = "TabCoordination.threshold" } >> { RUN && name = "SessionService.read" } \| select(span.preets.session.deadline_ms, span.session.id)`; quickstart §A cases 1 and 4 via BDD scenario 1 (passed): T3 (Shelbyville, same browser) and T4 (second Springfield browser) showed no warning at T1/T2's threshold; after Continue in T1, T3 showed no warning with its deadline unchanged and T4's warning stayed open with its deadline unchanged..                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| V-003 (lead of timeout minus 1 only)               | established | Lead of timeout − 1 (4 at a 5-minute timeout): each opening at deadline − 240000 ms plus 16–35 ms, never before the threshold. The lead-of-1 case is slice D's. Conditions: Partial scope per plan: lead of timeout minus 1 only.. Evidence: traces `80411210114d52ffb63b744ce896e0a6`, `1a7195abc133889a04990c46b7559b5b`, `a18bf5b5bf71590a5d597da630060c41`; queries `{ RUN && name = "TabCoordination.transition" && span.preets.ui.to_state = "warning_shown" } \| select(span.preets.ui.cause, span.preets.session.deadline_ms, span.preets.session.server_time_ms, span.preets.session.warning_lead_minutes)`; quickstart §A case 1 via BDD scenario 1 (passed): Springfield 5-minute timeout with lead 4; warnings opened at data-session-deadline minus four minutes..                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| V-009 (page-load renewals fall under gap G2, VL-2) | established | Continue renewal: sessionActivity ended 04:32:58.3455Z; T1 content_shown cause continue at +2.5 ms and T2 content_shown cause peer (child of TabChannel.receive kind renewed) at +3.4 ms, both with deadline_ms 1794631078344, equal to the T-005 renewal. Page-load renewal (G2, VL-2): the BDD observed the close and adoption, but the close delay was not measured; the second-round browser facts and the T5 server spans in the last seconds of scenario 1 were not exported before the harness closed the pages and stopped the server. Conditions: Partial scope per plan: page-load renewals fall under gap G2 (VL-2). Continue case with tabs visible, timers running, no routing.. Evidence: traces `5c74ab23a9aeb3dbf84c007dda83060d`, `554ee6d02a4f93f7ea49e2c67773329`, `baff897b9a6d7e825f30af94049f5ee3`; queries `{ RUN && name = "TabCoordination.transition" && span.preets.ui.from_state = "warning_shown" } \| select(span.preets.ui.to_state, span.preets.ui.cause, span.preets.session.deadline_ms, span.preets.session.server_time_ms)`; `{ RUN && name = "Interaction.continue" } >> { RUN && name = "SessionService.refreshForTenant" } \| select(span.preets.outcome, span.preets.session.activity, span.preets.session.deadline_ms, span.session.id)`; quickstart §A cases 4 and 5 via BDD scenario 1 (passed): T1 and T2 closed within 2 s of the Continue response and held its later deadline; after the next warning, opening protected page T5 closed the warning in T1 and T2 and both adopted T5's deadline..                                                                                                                                                                                                                                                                                                                                                                                                                    |

**Telemetry rows:** T-001 present (4 facts: T1, T2, T4 openings and S stale threshold, each with lead and deadline and a descendant sessionStatus ok and SessionService.read. Second-round T1/T2 facts at the end of scenario 1 were not exported before harness teardown.); T-002 present (warning_shown cause threshold (3) and content_shown from warning_shown cause continue and peer, with deadline, server time, and lead.); T-003 present (2 Interaction.continue facts (activated): the routed 503 with no server span, and the successful Continue parenting POST /session/activity.); T-004 present (Focus.move warning_continue entered/application after each opening; left/user on Continue.); T-005 present (SessionService.refreshForTenant renewed with activity continue-session, deadline, lead, idle timeout, alias, and session.id in the Continue trace.).

**Forbidden data observed:** none.

**Escalation:** none.

**Cleanup:** complete.
