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
