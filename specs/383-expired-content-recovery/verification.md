# Feature Verification Plan: Protect Expired Content and Offer Explicit Accessible Recovery

**Feature specification**: [spec.md](spec.md)

**Delivery issue**: https://github.com/PathableAI-org/Pre-ETS/issues/157

**Status**: Planned. This document records no execution evidence.

## Authority and scope

Claims derive from PREETS-SESSION-007 AC1–4 (S5-A) and PREETS-SESSION-012 AC1–5 (S5-B), including their Verification
Plans. They also derive from the explicit-recovery portion of PREETS-SESSION-013 (S6-C composition), the AC2
boundary of PREETS-SESSION-004, issue #157's completion evidence, the B5 decision, and the B6 decision. All were read
at `origin/main` `8ab3e692ba58c07a7ef70eec078f93b83fed67e8`, together with the maintainer clarifications of 2026-11-13
recorded in the specification. This plan refines evidence and creates no product obligation.

Out of verification scope: the freshness window and its diagnostics (#158); fresh entry by new tab, refresh, or history
beyond the hand-off to it (#154, #158); logout and the signed-out notice (#155), beyond confirming that expiration does
not override them; warnings and Continue (#156); and connection loss.

Server-only denial, modal strings, or semantic markup alone never establish concealment or accessible recovery.
Recovery content alone never establishes the action's status or the absence of side effects.

## Claims and traceability

| ID    | Claim to establish                                                                                                             | Authoritative source                               | Meaningful violation                                                                                                                  | Required observation                                                                                                                                                                                     | Evidence channel                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| V-001 | A protected Server Action with an expired session or removed record returns actual HTTP 401 and performs no operation.         | SESSION-007 AC1; FR-001                            | Any status other than 401, or a protected operation or side effect occurs.                                                            | For a real session that expired, and separately whose record was removed, the action's response status and whether the protected operation's effect exists afterwards.                                   | Requirements BDD; server telemetry                      |
| V-002 | The denial response contains no protected content and starts no OIDC.                                                          | SESSION-007 AC1, AC3; FR-002                       | The response body carries protected data, or a provider request or login transaction follows the denial without user action.          | The response body's content, and whether any login transaction or provider request occurred between the denial and Log in activation.                                                                    | Requirements BDD; browser interaction; server telemetry |
| V-003 | The denied tab displays recovery content with Log in, and its earlier protected content is no longer readable or operable.     | SESSION-007 AC1, AC2, AC3; FR-003; Clarification 2 | The tab keeps protected content readable or operable beside or behind recovery, or shows no recovery or no Log in.                    | After denial, the tab's readable text and operable controls: recovery explanation and Log in present, no earlier protected content readable, focusable, or operable.                                     | Browser interaction; requirements BDD                   |
| V-004 | The explanation says "expired" exactly in the known-expiration cases, and "no longer available" otherwise.                     | SESSION-007 AC2; FR-004; Clarification 1           | "Expired" shown for a removed record before the tab's deadline, or after an observed logout; "unavailable" when expiry is known.      | Explanation shown for: tab deadline passed; server-observed expired record; record removed before the deadline; logout observed in that tab; scripts disabled with removed record.                       | Browser interaction; requirements BDD                   |
| V-005 | Denial and recovery hold for expiry in flight and with disabled or delayed timers.                                             | SESSION-007 Verification Plan; FR-005              | An action arriving just after expiry is admitted, or a tab without timers shows no recovery.                                          | With controllable time: an action submitted before the deadline and received after it; an action from a tab whose timers are suspended. Status, effect, and displayed content for each.                  | Requirements BDD; browser interaction                   |
| V-006 | A scripts-disabled submission receives 401 and the browser displays recovery content with Log in.                              | SESSION-007 AC1, AC2, AC4; FR-006; Clarification 3 | A blank page, a redirect, a different status, or an executed operation.                                                               | With scripts disabled in the browser context: response status, operation effect, and the displayed document's explanation and keyboard-operable Log in.                                                  | Browser interaction; requirements BDD                   |
| V-007 | Recovery content is accessible: focus moves to it, its explanation is announced, and Log in is keyboard-operable.              | SESSION-007 AC4; FR-007                            | Focus stays on the submitted control or body, nothing is announced, or Log in is unreachable or lacks visible focus.                  | Focused element after recovery appears; keyboard path to Log in and its visible focus indicator; screen-reader announcement and reading of explanation and Log in.                                       | Browser interaction; assistive technology               |
| V-008 | A denied action does not change other sharing tabs.                                                                            | Clarification 2; FR-008                            | Another tab conceals, shows recovery, or ends because of this denial alone, before its own deadline or confirmation.                  | A second sharing tab's state immediately after the first tab's denial, when that tab's deadline has not passed.                                                                                          | Browser interaction                                     |
| V-009 | Every running sharing tab conceals protected information and shows the modal within 2 seconds of the deadline.                 | SESSION-012 AC1, AC3; B5; FR-009, FR-011           | Any running tab still shows readable protected information, or no modal, more than 2 seconds after the deadline.                      | With controllable time and three sharing tabs: time from the authoritative deadline to concealment and modal in each tab.                                                                                | Browser interaction; browser telemetry                  |
| V-010 | No running tab presents the expired state while the server session is valid.                                                   | SESSION-012 Verification Plan; B5; FR-010          | A tab conceals as expiration or shows the modal while another tab's renewal kept the session valid.                                   | Activity in tab A shortly before tab B's locally known deadline: B's state across that deadline, and the server's session validity at the same time.                                                     | Browser interaction; server telemetry                   |
| V-011 | The modal cannot be dismissed or bypassed to reveal protected information.                                                     | SESSION-012 AC2; FR-012                            | Escape, clicking outside, browser find, removing focus, or any control reveals protected information or closes the modal.             | After each attempt: modal presence, and whether any protected text is readable or findable on the page.                                                                                                  | Browser interaction                                     |
| V-012 | In-page navigation is unavailable while the modal is active.                                                                   | SESSION-012 AC2; FR-013                            | An in-page link or client-side route change behind the modal navigates.                                                               | Activation attempts of background links and route changes: the URL and the rendered view afterwards.                                                                                                     | Browser interaction                                     |
| V-013 | Protected background content is unavailable to keyboard and assistive technology while the expired state remains.              | SESSION-012 AC5; FR-013                            | Tab or Shift+Tab reaches background content, or a screen reader's virtual cursor, headings, or landmarks read it.                     | Full forward and backward tab cycles; the accessibility tree; a screen reader's browse mode, heading list, and landmark list.                                                                            | Browser interaction; assistive technology               |
| V-014 | Expiration is announced, focus moves into the modal, and Log in is keyboard-operable with visible focus.                       | SESSION-012 AC5; FR-014                            | No announcement, focus outside the modal, or Log in unreachable or without visible focus.                                             | Focused element when the expired state begins; screen-reader announcement; keyboard activation of Log in and its focus indicator.                                                                        | Browser interaction; assistive technology               |
| V-015 | Refresh and back/forward from an expired tab follow fresh entry, not the modal.                                                | SESSION-012 AC2; SESSION-004 AC2; FR-015, FR-018   | Refresh or history shows the modal over restored content, restores readable protected content, or grants access.                      | After refresh, back, and forward from an expired tab, and on a back/forward-cache restore: whether login starts, and whether any protected content is readable before a new session.                     | Browser interaction                                     |
| V-016 | Resumed tabs follow the B5 rule.                                                                                               | SESSION-012 Verification Plan; B5; FR-016, FR-017  | A resumed tab past its deadline shows content before confirmation, restores content after expiry, or stays concealed after a renewal. | For each B5 resume case (past deadline then expired; past deadline then renewed elsewhere; before deadline then expired): content visibility from resume to settled state, and its timing.               | Browser interaction; browser telemetry                  |
| V-017 | Expiration does not override logout's signed-out notice.                                                                       | FR-019; #155 FR-023                                | A tab that observed logout later shows the expiration modal.                                                                          | A tab showing the signed-out notice across the session's former deadline.                                                                                                                                | Browser interaction                                     |
| V-018 | The modal and known-expiration recovery convey equivalent explanation and Log in, and unknown-cause recovery claims no cause.  | SESSION-007 AC2; SESSION-012 AC4; FR-020           | Different meaning or different recovery action between the two, or unknown-cause content that claims expiration.                      | Side-by-side comparison of the accessible names and text of the explanation and action in the modal, known-expiration recovery, and unknown-cause recovery.                                              | Browser interaction                                     |
| V-019 | Log in from recovery content and from the modal requires fresh authentication and yields a new session.                        | SESSION-013 AC1, AC3; issue S6-C; FR-021, FR-022   | Existing provider SSO silently admits the user, or the old session regains access.                                                    | With provider SSO held: keyboard Log in from each entry point; whether the provider presents an authentication step, the freshness decision, the new session's identity, and the old reference's denial. | Browser interaction; server telemetry; requirements BDD |
| V-020 | No login starts until the user activates Log in.                                                                               | SESSION-007 AC1; issue scope; FR-021               | Recovery content or the modal starts tenant login or contacts the provider on its own.                                                | Network and server activity from recovery or modal display until Log in activation, including after waiting past the modal's appearance.                                                                 | Browser interaction; server telemetry                   |
| V-021 | Cancelled, failed, missing-evidence, and stale-evidence Log in from either entry point show nothing protected and allow retry. | SESSION-013 AC5; issue S6-C; FR-023                | A session is established, protected content appears, or Log in cannot be attempted again.                                             | For a cancel, a provider error, and missing or stale freshness evidence started from each entry point: session existence, page content, and a successful later Log in.                                   | Browser interaction; server telemetry                   |
| V-022 | Expired tabs do not restore concealed content after a new session is established elsewhere.                                    | FR-024; SESSION-013 AC2                            | A tab still in the expired state shows its earlier protected content again after another tab's login.                                 | After a fresh login in tab A: tab B's content before user action in B, and after B's Log in, whether its content comes from a new render.                                                                | Browser interaction; browser telemetry                  |
| V-023 | Expiration is isolated by session, tenant, and browser context.                                                                | SESSION-012 AC3 (sharing tabs only); FR-011        | A tab of another tenant or browser context conceals or ends.                                                                          | With two tenants in one context and a second context: each tab's state after one session expires.                                                                                                        | Browser interaction                                     |
| V-024 | Recovery, the modal, and their announcements reveal no protected content, session references, tokens, or claims.               | SESSION-007 AC3; FR-025                            | Any of these values appears in the page text, the accessibility tree, the announcement, or the denial response.                       | Text, accessibility tree, and live-region output of recovery and the modal; the denial response body and headers.                                                                                        | Browser interaction; requirements BDD                   |

## Automated behavioral evidence

| Claim IDs                                | Evidence boundary                                                                        | Planned scenario or property                                                                                                                                                                                                                                           | Why this boundary is meaningful                                                             | Known limits                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| V-001, V-002, V-005, V-024               | Requirements BDD at the HTTP boundary against the running application with real sessions | `@preets-session-007` outlines extending the existing reference-action denial for absent and unknown references to a real expired session and a removed record, including an action received just after the deadline: 401, no receipt, no login, no protected content. | Actual Server Action transport and status; side effects observed through the real consumer. | Does not observe what the browser displays.                                                                   |
| V-003, V-004, V-006, V-007, V-018        | Requirements BDD with a browser context                                                  | `@preets-session-007` scenarios: denied action from a rendered page shows recovery in place of content, with focus on it; explanation per known and unknown case; scripts-disabled submission; keyboard Log in.                                                        | Rendering and focus differ between script and no-script transport.                          | Assistive-technology output is not established.                                                               |
| V-009, V-010, V-011, V-012, V-013, V-014 | Requirements BDD with multiple tabs and controllable time, extending S3's tab fixtures   | `@preets-session-012` scenarios: concealment and modal in every tab within 2 s of the deadline; no early expiry after renewal elsewhere; dismissal, find, tab-cycle, and in-page navigation attempts; focus into the modal.                                            | Concealment is a rendered fact that only a browser can observe.                             | Pre-script paint is not observable; screen-reader modes need manual observation.                              |
| V-015, V-016, V-022, V-023               | Requirements BDD with page lifecycle control and multiple contexts                       | `@preets-session-012` and `@preets-session-004` scenarios: refresh and history after expiry; the three B5 resume cases and a back/forward-cache restore; no restore after another tab's login; two tenants and two contexts.                                           | Suspension, the back/forward cache, and isolation behave only in a real browser.            | Emulated freeze and visibility may differ from operating-system sleep.                                        |
| V-019, V-020, V-021                      | Requirements BDD with the local identity provider                                        | `@preets-session-013` scenarios from each entry point: fresh Log in with SSO held yields a new session and the old reference is denied; cancel and provider error; no login before activation.                                                                         | Freshness through these entry points requires the real provider round trip.                 | Missing and stale evidence at this boundary needs #158's provider fixture; otherwise manual step 9 covers it. |

Requirements-backed BDD uses requirement versions from current `origin/main` with requirement-ID tags. A dry run
establishes discovery only. Feature files stay `@partial` until every claim they carry is executed.

## Agent-executable manual feature verification _(mandatory)_

### Purpose

Observe in one composed real-provider journey what automated scenarios cannot fully settle. These observations are:
what a screen reader actually announces and can reach in the modal and the recovery content; that the modal and the
recovery content mean the same thing; that a denied action leaves its tab unreadable while other tabs stay
untouched; and that fresh Log in from each entry point, with provider SSO held, yields a new session while failures
show nothing.

### Prerequisites

- The repository's local services: the local identity provider with its tracked realm, Redis, and the shared local
  observability stack, with OTEL enabled, browser tracing enabled, and the run filters from the verification harness.
- Two synthetic tenants from the repository fixtures, and a synthetic provider user from the tracked realm.
- Playwright with two browser contexts and controllable time or a short tenant timeout. Grafana MCP read access.
- A screen reader available to the verifier: VoiceOver with Safari or NVDA with Firefox. If none is available, steps
  4 and 7 record the assistive-technology part as not executed.
- The owned Redis key prefix `preets:verify:<run-uuid>:`.

### Procedure

1. Start the application at the requested revision with the harness settings. Record the revision and the run UUID.
2. In context 1, sign in to tenant A with provider SSO held. Open three tabs on protected pages with visible
   protected content. In context 1, also sign in to tenant B in one tab. In context 2, sign in to tenant A.
3. In tab A1, suspend timers. Let tenant A's session expire. In A1, submit the reference action. Record the status,
   the operation effect, the displayed explanation, the focus, and whether any provider request occurred. Confirm
   that A2 and A3 were not changed by A1's denial, and observe their own expiry and modal timing.
4. With the screen reader, read the recovery content in A1 and the modal in A2. Record the announcement, the reading
   of the explanation and Log in, and the result of browse-mode, heading, and landmark navigation over the background
   in A2. Compare the explanation and action in A1 and A2.
5. In A3, try Escape, clicking outside, browser find for a known protected string, full Tab and Shift+Tab cycles, and
   activation of a background link. Then refresh, go back, and go forward, and record what is shown before any login.
6. Start a new session for tenant A. Remove its record before the deadline, then submit the action in a tab whose
   deadline has not passed. Record the "no longer available" explanation. Repeat with scripts disabled in a fresh
   context and record the displayed document.
7. From A1's recovery content, activate Log in by keyboard with provider SSO held. Record whether the provider
   presents an authentication step, the freshness decision, the new session's identity, and the denial of the old
   reference. Observe A2: it stays in the expired state until acted on. Activate Log in from A2's modal and record the
   outcome.
8. Suspend a tab across a new expiry and resume it. Separately, suspend a tab while another tab renews the session,
   then resume it. Record content visibility from resume until the state settles.
9. From a recovery page and from a modal, start Log in and cancel at the provider. Then cause a provider error, and
   missing and stale freshness evidence where #158's fixture supports it. Record that the page shows no protected
   content and that a later Log in succeeds.
10. Throughout, confirm that tenant B's tab and context 2 are unaffected by tenant A's expirations.
11. In Grafana, query the run's server and browser telemetry for steps 3, 7, 8, and 9. Inspect the exported fields for
    protected content, session references, tokens, and identity claims.
12. Clean up: close the contexts, end the provider session, delete the owned Redis keys, and stop the processes.

### Expected observations

- Step 3: 401, no operation effect, recovery in place of content with focus on it, "expired", and no provider request.
  The other tabs are unchanged by the denial and conceal with the modal within 2 seconds of the deadline (V-001–V-005,
  V-008, V-009, V-020).
- Step 4: the explanation is announced, Log in is reachable, and the background cannot be read or navigated. The
  meaning matches between recovery and modal (V-007, V-013, V-014, V-018).
- Step 5: no dismissal, no readable or findable content, no navigation, and focus stays in the modal. Refresh and
  history follow fresh entry (V-011–V-013, V-015).
- Step 6: "no longer available", and the scripts-disabled document is the recovery content (V-004, V-006).
- Step 7: a provider authentication step, a new session, the old reference denied, and no restore in A2 (V-019,
  V-022).
- Step 8: the B5 resume behavior (V-016).
- Step 9: nothing protected is shown and retry works (V-021).
- Step 10: isolation (V-023). Step 11: no forbidden values anywhere (V-024).

### Evidence to retain

The revision, the run UUID, the tenants and synthetic user, per-step outcomes and timings, the screen reader and
browser used, trace IDs and query time ranges, the result per claim, and the limitations. Do not commit screenshots,
tokens, codes, session references, or raw query output.

## Harness observations

- V-001, V-002, V-005: for each protected Server Action, the session classification (expired, missing, no reference)
  and whether the operation ran, attributable to the tenant and browser step; and whether a login transaction began
  before user activation.
- V-009, V-010, V-016: per tab, when the expired state, temporary resume concealment, and restoration began, relative
  to the authoritative deadline and the server confirmation that preceded them.
- V-019, V-021, V-022: per Log in from recovery or the modal, which entry point started it, the freshness outcome that
  #158 already records, and which session served the next protected request.

Never emitted: protected content or its text, session references or cookie values, coordination tags beyond what the
observability conventions already allow, tokens, authorization codes, identity claims, and screen-reader output. What a
person perceives is verified through browser interaction and assistive technology, not telemetry.

## Operational observability verification

The in-scope requirements establish no operational observability obligation. #158's freshness diagnostics apply
unchanged to Log in from these entry points and are not re-verified here. Step 11 inspects exported telemetry only for
forbidden values.

## Environment and data controls

- Synthetic tenants and the tracked realm's synthetic user only. No real client records, PHI, or credentials.
- Provider test credentials stay in the repository's fixtures and are never recorded in evidence.
- Controlled time, suspension, and provider failures use local fixtures only.
- The run owns its Redis prefix, ports, and browser contexts, and cleans them up.

## Evidence retention and reporting

Execution results go in the feature's `quickstart.md` per slice: the revision, environment, conditions, observations
by claim ID, result, cleanup, and limitations, as the verification harness requires. This document records plans only.

## Limitations and incomplete claims

- Pixels painted by the browser or operating system before page scripts run on resume are outside application control
  (B5 limitation). V-016 observes only from the first script-controlled frame.
- Emulated page freeze and visibility may differ from real operating-system sleep. A real sleep observation is
  recommended but not required.
- Assistive-technology claims (V-007, V-013, V-014) rest on the screen reader and browser pair actually used. Other
  pairs are not established.
- Missing and stale freshness from these entry points depend on #158's provider fixture. Without it, V-021 rests on
  #158's own evidence for those cases.
- Late-Continue races are incomplete until #156 delivers Continue.
- Connection-loss behavior at a deadline or on resume is excluded and belongs to a pending requirement.
- An increment that delivers denial or concealment before its Log in composition records V-019–V-022 as incomplete
  for that increment.
- Local provider results do not establish Microsoft or broker behavior.

## Readiness review

- [x] Every feature claim maps to an authoritative source.
- [x] Every claim states the observation that distinguishes it and an evidence channel able to make it.
- [x] Successful, failure, rejection, security/privacy, accessibility, and operational outcomes are covered where applicable.
- [x] The manual feature procedure is non-empty, executable by an agent, and adds a distinct observation.
- [x] Environmental prerequisites, evidence retention, cleanup, and limitations are explicit.
- [x] Planned evidence is not described as executed or verified.
- [x] No implementation architecture is required to understand the feature claims.
