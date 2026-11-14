# Feature Verification Plan: Warn Before Expiration and Continue Accessibly Across Tabs

**Feature specification**: [spec.md](spec.md)

**Delivery issue**: https://github.com/PathableAI-org/Pre-ETS/issues/156

**Status**: Planned — no execution evidence is recorded by this document

**Risk tier**: High (triggers 1 and 3, recorded in the [spec.md](spec.md) header). Every evidence channel is
available, and each security or tenant claim names its rejection path under [Rejection paths](#rejection-paths).

## Authority and scope

Claims derive from PREETS-SESSION-011 AC1–5 and its Verification Plan, issue #156's completion evidence, the S4
delivery slice, and the 2026-11-09 B5 decision, all read at `origin/main` `8ab3e692ba58c07a7ef70eec078f93b83fed67e8`
and unchanged at `d03389afa69d1e08972255d136d10ac8768f556a` on 2026-11-14. This plan refines evidence for S4 and
creates no product obligation.

Out of verification scope: #157's expired-session concealment, modal, and recovery, except where V-016 and V-017
compose them; #155's activity windows and logout; #158's fresh login; server-unreachable behavior. Dialog strings,
a role attribute, or a server response alone never establish that the warning is perceivable, operable, or blocking.

## Claims and traceability

| ID    | Claim to establish                                                                                                                   | Authoritative source                            | Meaningful violation                                                                                                                                      | Required observation                                                                                                                                                                                                                                                                         | Evidence channel                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| V-001 | Omitted warning settings yield a five-minute lead above a five-minute timeout and no warning at a five-minute timeout.               | SESSION-011 AC1; issue completion evidence      | No warning, or a warning at another time, under an omitted setting above five minutes; any warning at a five-minute timeout.                              | Under controllable time: with the default 30-minute timeout, the warning opens at 25 minutes of inactivity; with another timeout above five, at five minutes before; at a five-minute timeout, none opens.                                                                                   | Requirements BDD; browser interaction                       |
| V-002 | Explicit `0` disables the warning at any permitted timeout.                                                                          | SESSION-011 AC1                                 | A warning opens with explicit `0`.                                                                                                                        | At the minimum, maximum, and one intermediate permitted timeout with `0`, no warning opens before the deadline.                                                                                                                                                                              | Requirements BDD; browser interaction                       |
| V-003 | A positive whole-minute lead below the timeout opens the warning that many minutes before expiration.                                | SESSION-011 AC1, AC2                            | The warning opens at a different offset, or a valid lead is rejected.                                                                                     | For a lead of 1 and of timeout − 1, the warning opens at deadline minus lead.                                                                                                                                                                                                                | Requirements BDD; browser interaction                       |
| V-004 | Invalid warning settings reject the tenant configuration at a consuming request, with no default substituted.                        | SESSION-011 AC1; PREETS-TENANT-004              | A negative, fractional, nonnumeric, equal, or greater value yields a session or a warning derived from a default.                                         | An actual tenant-consuming application request for each invalid value is rejected as invalid tenant configuration; no session is established and no warning timing exists.                                                                                                                   | Requirements BDD; server telemetry                          |
| V-005 | A renewal adopts the tenant's current warning policy for that session; unrenewed sessions keep their previous lead.                  | SESSION-011 AC2; maintainer decision 2026-10-12 | Tabs warn under the old lead after a renewal, or a session adopts a change without renewal.                                                               | After changing the setting (enabled↔`0`, five-minute default↔explicit, lead A→B): before renewal the old timing holds; after renewal all sharing tabs use the new timing; a second unrenewed session does not.                                                                               | Browser interaction; server telemetry                       |
| V-006 | Every running sharing tab opens the warning within 2 seconds of the threshold.                                                       | SESSION-011 AC2; B5 synchronization             | A sharing tab opens it later than 2 seconds, or not at all.                                                                                               | For two or more running sharing tabs, the time from threshold to the warning being present and focused in each tab.                                                                                                                                                                          | Browser interaction; browser telemetry                      |
| V-007 | A tab reaching its local threshold confirms with the server; a renewal made elsewhere prevents the warning.                          | B5 "no early expiration" applied to warnings    | A tab opens the warning although the session was renewed after that tab last learned the deadline.                                                        | With one tab prevented from learning a renewal, it reaches its stale threshold, confirms, adopts the later deadline, and shows no warning.                                                                                                                                                   | Browser interaction; browser telemetry                      |
| V-008 | Continue is sent immediately and renews the actual authoritative deadline as qualifying activity.                                    | SESSION-011 AC3; B5 activity communication      | Continue is delayed or coalesced, or the authoritative deadline does not move.                                                                            | Time from activation to the server receiving the request, and the authoritative deadline before and after Continue.                                                                                                                                                                          | Server telemetry; requirements BDD                          |
| V-009 | A successful renewal closes the warning in every other running sharing tab within 2 seconds of the renewal response.                 | SESSION-011 AC3; B5 synchronization             | Another tab keeps the warning open, closes it later than 2 seconds, or keeps the old deadline.                                                            | For Continue in one tab, and for a renewal by another qualifying request, the time from the renewal response to each other tab's warning closing, and each tab's held deadline.                                                                                                              | Browser interaction; browser telemetry; server telemetry    |
| V-010 | The warning closes only on successful renewal or session end; failed Continue, Escape, or outside clicks leave it open.              | SESSION-011 AC3; issue scope                    | The warning closes without a renewal, or closes in any tab after a failed Continue.                                                                       | After Escape, an outside click, and a Continue answered with a server error, the warning is still open in every tab and the deadline is unchanged.                                                                                                                                           | Browser interaction; requirements BDD                       |
| V-011 | A Continue reaching the server at or after the deadline cannot renew or restore the session.                                         | SESSION-011 AC4                                 | A late Continue renews the deadline or makes the session usable again.                                                                                    | Requests arriving exactly at and after the deadline, including a race with expiry, leave the session ended and protected requests denied.                                                                                                                                                    | Module test; requirements BDD; server telemetry             |
| V-012 | On resume, a tab past its local threshold opens the warning only after the server confirms the session is in its warning period.     | B5 resume rule; issue scope                     | A resumed tab shows a stale warning for a renewed session, or skips the warning for a session still in its warning period.                                | Three suspended-tab cases (idle, renewed elsewhere, ended): warning after confirmation within 2 seconds; adopted deadline with no warning; expired outcome (with V-017).                                                                                                                     | Browser interaction; browser telemetry                      |
| V-013 | A resumed tab past its local deadline conceals temporarily, and interaction after resume never revives an ended session.             | B5 resume rule; SESSION-009 AC4                 | Content stays visible before confirmation, or Continue or other interaction after resume renews an ended session.                                         | Concealment present immediately on resume; after an ended confirmation, Continue or interaction produces no renewal.                                                                                                                                                                         | Browser interaction; server telemetry                       |
| V-014 | The warning is announced, and its explanation and Continue action are perceivable to assistive technology.                           | SESSION-011 AC5                                 | No announcement, or the explanation or action is missing or unnamed for assistive technology.                                                             | A screen reader announces the opening and reads the explanation and Continue; the accessibility tree exposes a modal dialog with an accessible name and description.                                                                                                                         | Assistive technology; browser interaction                   |
| V-015 | Focus enters and stays in the warning, Continue has visible keyboard focus, the background is inert, and focus returns as specified. | SESSION-011 AC5                                 | Focus stays behind, escapes on Tab/Shift+Tab, has no visible indicator, background controls can be reached or activated, or focus is lost after Continue. | On open, focus is inside; Tab and Shift+Tab cycle within; Continue shows a visible focus indicator and activates by Enter and Space; pointer, keyboard, and screen-reader navigation reach no background control; after Continue, focus is on the prior element or main content in each tab. | Browser interaction; assistive technology; requirements BDD |
| V-016 | Disabled warnings leave authoritative expiration unchanged and lead to the expired outcome.                                          | SESSION-011 AC1, Verification Plan              | With the warning disabled, the session outlives its deadline or tabs do not reach the expired outcome.                                                    | With explicit `0` and with the five-minute default: authoritative expiration at the deadline, and every running tab reaches #157's concealment and recovery.                                                                                                                                 | Server telemetry; browser interaction                       |
| V-017 | After a late Continue the tab leaves the warning for the expired outcome.                                                            | SESSION-011 AC4; S4 shipping gate               | The tab keeps a usable warning, shows protected content, or appears renewed.                                                                              | After V-011's late Continue, every sharing tab shows #157's expired concealment and recovery, with no warning remaining.                                                                                                                                                                     | Browser interaction                                         |
| V-018 | Warnings and renewals stay within one session.                                                                                       | SESSION-011 AC2, AC3; B5 isolation              | A warning opens, closes, or renews in another tenant's, session's, or browser context's tabs.                                                             | With tabs for tenant B in the same context and tenant A in a second context, their warnings and deadlines are unaffected by tenant A context 1's warning and Continue.                                                                                                                       | Browser interaction; server telemetry                       |

### Rejection paths

High-tier work names the rejection path of each claim on a security or tenant boundary: what is refused, and what a
verifier sees when it is. No claim in this feature changes how PHI is stored, sent, or accessed. The remaining claims
(V-001–V-003, V-005–V-010, V-012, V-014, V-015) concern warning timing, coordination, and accessibility and refuse
nothing.

| ID    | Boundary                            | Rejection path                                                                                                                                                                                                                        | Planned observation                           |
| ----- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| V-004 | Tenant configuration                | A request that consumes a tenant whose warning setting is invalid is refused with PREETS-TENANT-004 AC5's schema-invalid outcome (ordinary HTTP 404, no fallback). No session is established and no default lead is substituted.      | Requirements BDD; manual step 12              |
| V-011 | Session expiration                  | A Continue reaching the server at or after the authoritative deadline is refused. The deadline does not move, the session stays ended, and the next protected request is denied.                                                      | Module test; requirements BDD; manual step 10 |
| V-013 | Session expiration after resume     | Once the server confirms that the session ended while the tab was suspended, Continue or any other interaction from that tab causes no renewal, and its content stays concealed.                                                      | Manual step 8, ended case                     |
| V-016 | Expiration with the warning off     | With explicit `0` or the five-minute default, the session ends at its deadline as it does with a warning. Later protected requests are denied and every running tab reaches #157's concealment and recovery.                          | Manual step 11                                |
| V-017 | Late Continue in the tab            | No sharing tab treats the refused Continue as a renewal. None closes its warning as renewed, and each replaces the warning with #157's expired concealment and recovery.                                                              | Manual step 10                                |
| V-018 | Tenant, session, and context limits | A warning, Continue, or renewal of one session is not applied to tabs of another tenant, session, or browser context. Their warning state and held deadlines stay unchanged, and their sessions' authoritative deadlines do not move. | Requirements BDD; manual steps 3 and 7        |

## Automated behavioral evidence

| Claim IDs                        | Evidence boundary                                                     | Planned scenario or property                                                                                                                                                                                                                                                                                           | Why this boundary is meaningful                                                                      | Known limits                                                                                 |
| -------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| V-011                            | Public session service with controllable time                         | A renewal attempted exactly at and after the deadline, and concurrently with expiry, never renews; a property that renewal succeeds exactly when the request is handled before the deadline.                                                                                                                           | Reaches the at-deadline boundary and races deterministically, which a browser cannot time precisely. | Does not establish what any tab presents.                                                    |
| V-001–V-004                      | Requirements BDD against the running application with tenant fixtures | Tagged `@preets-session-011` scenarios: default 30-minute warning at 25 minutes; five-minute default and explicit `0` at several timeouts show none; valid leads at their offsets; each invalid value rejected at a tenant-consuming request.                                                                          | The application boundary is where tenant configuration is consumed and the warning is perceived.     | Uses controllable browser time; real waiting is not exercised.                               |
| V-006, V-008–V-010, V-015, V-018 | Requirements BDD with multiple tabs and contexts                      | Tagged `@preets-session-011` scenarios: two sharing tabs open the warning at the threshold; keyboard Continue renews and closes it in both; Escape, outside click, and failed Continue leave it open; focus entry, containment, visible focus, inert background, and restoration; other tenant and context unaffected. | Cross-tab coordination and focus behave differently from single-page or HTTP checks.                 | Timing bounds are asserted with controllable time; measured latency is a manual observation. |

Requirements-backed BDD uses requirement versions from current `origin/main` with requirement-ID tags. A dry run
establishes discovery only. Scenarios composing #157 (V-016, V-017) are tagged `@partial` until #157 is present.

## Agent-executable manual feature verification _(mandatory)_

### Purpose

Observe, in one composed journey on the running application, that the warning opens in every sharing tab at the
configured threshold, that a keyboard Continue renews the actual authoritative deadline and clears every tab within
the B5 bounds, that suspended tabs follow local-check-then-confirm, that policy changes take effect on renewal, and
that a screen reader perceives and operates the warning. Measured cross-tab latency and screen-reader output are
observations no durable test asserts.

### Prerequisites

- The repository's local services, including the local identity provider, Redis, and the shared local observability
  stack with OTEL and `BROWSER_TRACING_ENABLED=true`, using the run filters from the verification harness.
- Two synthetic tenants (A and B) whose idle timeout and warning settings can be changed between steps; a synthetic
  provider user from the tracked realm.
- Playwright with two browser contexts, several tabs per context, controllable page time, and page lifecycle control
  (visibility, freeze); access to the accessibility tree.
- A screen reader (for example VoiceOver) for the assistive-technology steps.
- A way to read the authoritative deadline and warning lead for an owned session without exposing its reference.
- Owned Redis key prefix `preets:verify:<run-uuid>:`.

### Procedure

1. Start the application at the requested revision with the harness settings. Record revision, run UUID, tenant
   aliases, and each tenant's timeout and warning settings.
2. Set tenant A to the defaults (omitted timeout and warning). Sign in to tenant A in context 1, open tabs 1 and 2,
   and in context 1 open tab 3 for tenant B; in context 2 open tab 4 for tenant A. Record each tab's deadline. Start
   the screen reader on tab 2.
3. Leave tenant A context 1 idle. Advance to 25 minutes of inactivity. Record, for tabs 1 and 2, the time from the
   threshold to the warning being present with focus inside, and that tabs 3 and 4 show no warning.
4. In tab 1, press Tab and Shift+Tab repeatedly, press Escape, click outside the warning, and try to reach a
   background link by keyboard and by screen-reader navigation. Record that focus stays inside, the warning stays
   open, nothing in the background responds, and the deadline is unchanged. Note which element had focus before the
   warning opened.
5. From the screen-reader output captured in tab 2 during step 3, record the announcement of the opening. Navigate the
   warning with the screen reader and record that the explanation and Continue are read and reachable, and that
   screen-reader navigation reaches no background content.
6. Make the server answer one Continue with an error. Activate Continue in tab 1. Record that both warnings stay open
   and the deadline is unchanged. Restore the server.
7. Activate Continue in tab 1 with the keyboard, observing the visible focus indicator. Record the time from
   activation to server receipt, the deadline before and after, the time from the renewal response to tab 2's warning
   closing, and where focus lands in each tab. Record that the warning state and deadlines of tab 3 (tenant B) and
   tab 4 (context 2) are unchanged by this Continue.
8. Return to the warning period. Freeze tab 2, activate Continue in tab 1, advance past tab 2's stale threshold but
   not its stale deadline, and resume tab 2. Record that it confirms, adopts the later deadline, and shows no warning.
   Repeat with no renewal while frozen; record the warning opening within 2 seconds of resume after confirmation.
   Repeat, freezing past the stale deadline with a renewal elsewhere; record temporary concealment, then restored
   content and a warning or no warning according to the confirmed deadline. Repeat, freezing past the deadline with
   no renewal so the session ends; record temporary concealment on resume, the ended confirmation, that Continue
   (if a warning was still shown) and other interaction cause no renewal, and the tab's outcome.
9. Change tenant A's warning to `0`. Before any renewal, record that the old threshold still opens the warning; after
   a renewal, record that no warning opens before the deadline, and that tab 4's session (not yet renewed) still warns
   at its old lead. Change back to an explicit lead of 1 minute and renew; record the new threshold in tabs 1 and 2.
10. With the warning open, let a Continue reach the server after the deadline (delay it past the deadline). Record no
    renewal, denial of a protected request, and each tab's outcome (V-017 needs #157).
11. Set tenant A's timeout to 5 with the warning omitted, sign in again, and leave it idle to expiration. Record no
    warning, expiration at the deadline, denial of a protected request after it, and each tab's outcome (V-016 needs
    #157). Repeat with an explicit `0` at the default timeout.
12. For each invalid warning value (negative, fractional, nonnumeric, equal to the timeout, greater), request a
    protected page for tenant A. Record the tenant rejection and the run's rejection diagnostic naming the warning
    field without its value.
13. Clean up: close browser contexts, end the provider session, delete owned Redis keys, restore tenant settings, and
    stop processes started here. Never flush a shared store.

### Expected observations

- Step 3: both sharing tabs open the warning within 2 seconds of the 25-minute threshold; other tenant and context
  unaffected (V-001, V-006, V-018).
- Steps 4–5: focus enters and stays in the warning, the background is unreachable, Escape and outside clicks do not
  close it, and the screen reader announces it and reads its explanation and Continue (V-010, V-014, V-015).
- Step 6: a failed Continue closes nothing (V-010).
- Step 7: Continue reaches the server immediately, the authoritative deadline moves, tab 2 closes within 2 seconds of
  the response, focus returns to the prior element or main content, and the other tenant and context are unaffected
  (V-008, V-009, V-015, V-018).
- Step 8: resumed tabs follow local-check-then-confirm, and a session that ended while a tab was suspended is not
  revived (V-007, V-012, V-013).
- Step 9: policy changes apply only after renewal, per session (V-002, V-003, V-005).
- Steps 10–11: no renewal after the deadline; disabled warnings still expire; tab outcomes per #157 (V-011, V-016,
  V-017).
- Step 12: invalid settings rejected with no default (V-004).

### Evidence to retain

Revision, run UUID, tenants and settings per step, controllable-time conditions, measured latencies, deadline
comparisons, accessibility-tree and screen-reader summaries, focus observations, trace IDs and query time ranges, the
result per claim, cleanup, and limitations. No screenshots, tokens, cookie values, session references, or raw query
output are committed.

## Harness observations

- V-004: the tenant configuration rejection and the field it names, never the rejected value.
- V-005, V-008, V-009: the authoritative deadline and the warning lead associated with each renewal, and the kind of
  activity that caused it, attributable to the tenant and the browser step.
- V-006, V-007, V-009, V-012: per tab, when its warning opened or closed, whether it confirmed with the server first,
  and the deadline it held, so a verifier can measure the B5 bounds across tabs.
- V-011, V-013, V-016: renewal attempts refused because the session had ended, distinct from renewals that succeeded.
- V-018: which session a renewal and a warning belong to, using the non-secret identifiers the observability
  conventions allow.

Never emitted: session references, cookie values, tokens, coordination values usable as credentials, protected page
content, user-entered text, and identity claims.

## Operational observability verification

No operational observability claim in this slice. PREETS-SESSION-011 establishes no additional operational
observability obligation. An empty log, trace, or metric result is not evidence of correct warning behavior.

## Environment and data controls

- Synthetic tenants and the tracked realm's synthetic user only; no PHI, real client records, or credentials.
- Tenant setting changes use the run's own tenant fixtures and are restored at cleanup.
- Controlled server errors, delayed Continue, and lifecycle simulation are local fixtures and are recorded as
  conditions of every timing observation.
- The run owns its Redis prefix, ports, and browser contexts and cleans them up.

## Evidence retention and reporting

Execution results go in the feature's `quickstart.md` per slice: revision, environment, conditions, observations by
claim ID, result, cleanup, and limitations, as the verification harness requires. This document records plans only.
Issue closure, merge, generated scenarios, dry runs, and static checks are not requirement verification.

## Limitations and incomplete claims

- V-016 and V-017 compose #157's expired-session presentation. Until #157 is present, only their server-side part
  (expiration at the deadline, no renewal) can be established; the tab outcome stays incomplete and #156 does not
  close until it is verified with #157. On 2026-11-14 #157's presentation is on `main` at `d03389a`, so a run at a
  revision that includes it can establish both parts.
- The #155 accepted gap G2 applies to V-009 when the renewal is caused by a page load: such a renewal may reach other
  tabs after the 2-second bound. Continue renewals are not affected. The execution record reports G2 cases as known
  shortfalls rather than passes.
- Server-unreachable behavior at a threshold, during Continue, or on resume belongs to the separate pending
  heartbeat/connection-loss requirement.
- Pixels painted by the browser or operating system before page scripts run on resume are outside application control.
- Screen-reader observations cover the screen reader used in the run; other assistive technologies are not
  established.
- No procedure in this plan was executed during specification.

## Readiness review

- [x] Every feature claim maps to an authoritative source.
- [x] Every claim states the observation that distinguishes it and an evidence channel able to make it.
- [x] Successful, failure, rejection, security/privacy, accessibility, and operational outcomes are covered where applicable.
- [x] Each security or tenant claim names its rejection path and the planned observation of it (High tier).
- [x] The manual feature procedure is non-empty, executable by an agent, and adds a distinct observation.
- [x] Environmental prerequisites, evidence retention, cleanup, and limitations are explicit.
- [x] Planned evidence is not described as executed or verified.
- [x] No implementation architecture is required to understand the feature claims.
