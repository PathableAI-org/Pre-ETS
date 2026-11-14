# Feature Specification: Warn Before Expiration and Continue Accessibly Across Tabs

**Feature Branch**: `384-expiration-warning-continue`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "https://github.com/PathableAI-org/Pre-ETS/issues/156"

**Risk tier**: High, under the [Git workflow's triggers](../../docs/engineering/git-workflow.md#triggers). Trigger 1:
the linked requirement PREETS-SESSION-011 is in the `SESSION` area. Trigger 3: the feature changes session behavior
(the warning, renewal by Continue, and cross-tab session coordination). The engineering plan records trigger 4 as
well if its telemetry contract adds or changes an exported signal for the telemetry-channel claims in
[verification.md](verification.md); the tier is High either way.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Get a Warning Before an Idle Session Ends and Keep Working (Priority: P1)

As a job coach reading a participant record without interacting, I am warned shortly before my session would end for
inactivity, and one keyboard or pointer action on the warning keeps my session so I can continue without signing in
again.

**Why this priority**: This is the requirement's purpose. A person reading without interacting has no other signal
that the session is about to end and lose their place.

**Independent Test**: With the default tenant policy (30-minute idle timeout, omitted warning), hold a real session
idle under controllable time. Confirm that a blocking warning opens at 25 minutes of inactivity, that activating
Continue renews the authoritative deadline on the server, and that the warning closes and the page is usable again.

**Acceptance Scenarios**:

1. **Given** a session whose effective warning lead is enabled, **When** the authoritative deadline minus the lead is
   reached in a running tab, **Then** that tab opens a blocking warning within 2 seconds, explaining that the session
   will end soon because of inactivity and offering Continue.
2. **Given** the default policy (30-minute timeout, omitted warning), **When** the session is idle for 25 minutes,
   **Then** the warning opens.
3. **Given** an open warning before the deadline, **When** the user activates Continue, **Then** the request reaches
   the server immediately, the server renews the authoritative deadline as qualifying activity, and the warning
   closes only after the renewal succeeds.
4. **Given** an open warning, **When** the user presses Escape, clicks outside it, or does anything other than
   activating Continue, **Then** the warning stays open and the session is not renewed.
5. **Given** a running tab whose locally known threshold is reached, **When** another tab has already renewed the
   session, **Then** the tab confirms with the server, adopts the later deadline, and does not open the warning.

---

### User Story 2 - See and Dismiss the Warning in Every Tab Sharing the Session (Priority: P1)

As a job coach with a roster and a participant record open in separate tabs, the warning appears in both, and
continuing in either tab clears it in the other, so I am never left with a stale warning or a tab that silently
expires.

**Why this priority**: Every tab sharing the session holds protected content and ends with the session; a warning in
only one tab leaves the others unprotected by notice.

**Independent Test**: Open two sharing tabs and one tab for another tenant. Reach the threshold. Confirm the warning
opens in both sharing tabs within 2 seconds and not in the other tenant's tab. Activate Continue in one tab and
confirm the other tab's warning closes within 2 seconds of the renewal response.

**Acceptance Scenarios**:

1. **Given** several running tabs sharing a session with an enabled warning, **When** the threshold is reached,
   **Then** every one of them opens the warning within 2 seconds of the threshold.
2. **Given** the warning is open in several sharing tabs, **When** Continue succeeds in one of them, **Then** every
   other sharing tab closes its warning within 2 seconds of the renewal response and adopts the renewed deadline.
3. **Given** the warning is open in sharing tabs, **When** the session is renewed by another qualifying request (for
   example, a protected page opened in a new tab), **Then** every sharing tab closes its warning within 2 seconds of
   that renewal response.
4. **Given** tabs for another tenant or another browser context, **When** this session's warning opens or closes,
   **Then** those tabs are unaffected.

---

### User Story 3 - Configure or Disable the Warning per Tenant (Priority: P1)

As a tenant administrator, I can rely on a predictable default warning, choose a different whole-minute lead time, or
disable the warning, and an invalid setting is refused rather than silently replaced.

**Why this priority**: The lead time is tenant policy. A silent fallback would show users a warning the tenant did not
choose, or none when one was expected.

**Independent Test**: Run the application with tenant configurations covering omitted, explicit `0`, valid nonzero,
and invalid warning settings at several idle timeouts. Confirm the warning timing in the browser for the valid cases
and the tenant rejection for the invalid ones.

**Acceptance Scenarios**:

1. **Given** an omitted warning setting and an effective idle timeout greater than five minutes, **When** a session
   is idle, **Then** the warning opens five minutes before expiration.
2. **Given** an omitted warning setting and a five-minute effective idle timeout, **When** a session is idle until
   expiration, **Then** no warning opens and the session still expires at its deadline.
3. **Given** an explicit warning setting of `0` at any permitted idle timeout, **When** a session is idle until
   expiration, **Then** no warning opens and the session still expires at its deadline.
4. **Given** an explicit positive whole-minute warning setting below the effective idle timeout, **When** a session is
   idle, **Then** the warning opens that many minutes before expiration.
5. **Given** a negative, fractional, nonnumeric, or equal-to-or-greater-than-timeout warning setting, **When** an
   application request consumes that tenant's configuration, **Then** the tenant configuration is rejected as invalid
   under PREETS-TENANT-004, with no default substituted.

---

### User Story 4 - Adopt Changed Warning Policy at the Next Renewal (Priority: P2)

As a tenant administrator who changes the warning setting, existing sessions pick up the new setting when their
timers are next renewed, and every tab sharing a session follows that session's current setting.

**Why this priority**: Policy changes are rare and the maintainer accepted gradual adoption, but tabs must not keep
warning under a policy their session no longer holds.

**Independent Test**: With a session open in two tabs, change the tenant's warning setting (including to and from
`0`, and between the five-minute-timeout default and an explicit lead). Before a renewal, confirm the old timing
holds; after a renewal, confirm both tabs use the new timing. Confirm a second, unrenewed session keeps its old
setting.

**Acceptance Scenarios**:

1. **Given** a changed tenant warning setting, **When** a session's timer is renewed by the server, **Then** that
   session's warning lead becomes the setting in effect at that renewal, and all its sharing tabs use it with the
   renewed deadline.
2. **Given** a changed setting, **When** a session has not been renewed since the change, **Then** it keeps the lead
   from its last renewal.
3. **Given** a change from an enabled lead to `0` or to the five-minute-timeout default, **When** the session renews,
   **Then** no warning opens before its next expiration; the reverse change enables the warning after renewal.

---

### User Story 5 - Use the Warning With a Keyboard or Assistive Technology (Priority: P1)

As a job coach who uses a screen reader or only a keyboard, I learn that the warning opened, understand it, and can
activate Continue, and I cannot accidentally interact with the page behind it.

**Why this priority**: A warning that cannot be perceived or operated gives these users no chance to keep their
session, and a page that stays operable behind it undermines the warning's purpose.

**Independent Test**: With keyboard only and with a screen reader, reach the threshold. Confirm the announcement,
focus placement, visible focus on Continue, that Tab and Shift+Tab stay inside the warning, that background controls
cannot be reached or activated by keyboard, pointer, or assistive technology, and that focus returns after
continuation.

**Acceptance Scenarios**:

1. **Given** the warning opens, **When** an assistive-technology user is on the page, **Then** the opening is
   announced and the explanation and the Continue action can be perceived.
2. **Given** the warning opens, **When** it appears, **Then** focus moves into the warning.
3. **Given** focus inside the warning, **When** the keyboard user moves focus, **Then** focus stays within the
   warning, Continue shows a visible focus indicator, and Continue can be activated from the keyboard.
4. **Given** the warning is open, **When** the user tries to reach background content by keyboard, pointer, or
   assistive-technology navigation, **Then** no background content can receive focus or be operated.
5. **Given** a successful continuation, **When** the warning closes in any tab, **Then** focus returns to the element
   that had focus when the warning opened, if it is still present and focusable, and otherwise to the page's main
   content.

---

### User Story 6 - Warn Correctly After a Tab Resumes (Priority: P2)

As a job coach returning to a tab that was hidden or frozen while my session approached its warning threshold, the
tab shows the warning only if the server confirms my session is still in its warning period, and never revives a
session that ended.

**Why this priority**: Suspended tabs miss timers. Without confirmation, a resumed tab could show a stale warning for a
session renewed elsewhere, or let Continue appear to revive an ended session.

**Independent Test**: Suspend a sharing tab across its threshold under three conditions: the session idle, renewed in
another tab, and expired. On resume, confirm respectively that the warning opens after server confirmation, that the
tab adopts the renewed deadline without a warning, and that the tab enters the expired outcome.

**Acceptance Scenarios**:

1. **Given** a tab resumes (becomes visible or is unfrozen) after its locally known threshold but before its locally
   known deadline, **When** the server confirms the session is still within its warning period, **Then** the tab opens
   the warning within 2 seconds of resume; protected content may stay visible during that confirmation.
2. **Given** the same tab, **When** the server reports a later deadline because another tab renewed the session,
   **Then** the tab adopts that deadline and opens no warning.
3. **Given** a tab resumes after its locally known deadline, **When** it resumes, **Then** it applies the B5 temporary
   resume concealment before confirming; if the server confirms a valid session within its warning period, the tab
   restores its content and opens the warning; if the session ended, the tab enters the expired outcome.
4. **Given** any resumed tab, **When** the session ended while it was suspended, **Then** activating Continue or any
   other interaction cannot revive it.

---

### User Story 7 - Late Continue and Disabled Warnings Still End Protected (Priority: P2)

As a security stakeholder, I can rely on a Continue that arrives too late not reviving the session, and on sessions
without a warning still ending with their protected content concealed.

**Why this priority**: The warning must never become a way to extend an expired session, and disabling it must never
weaken expiration.

**Independent Test**: Activate Continue so the request reaches the server at and after the deadline, and let sessions
with disabled warnings reach expiration. Confirm no renewal occurs and the tabs reach the expired outcome delivered by
[#157](https://github.com/PathableAI-org/Pre-ETS/issues/157).

**Acceptance Scenarios**:

1. **Given** a Continue request reaching the server at or after the authoritative deadline, **When** the server
   handles it, **Then** the session is not renewed or restored, and no sharing tab closes its warning as if it had
   been.
2. **Given** a late Continue, **When** the tab learns the session ended, **Then** it leaves the warning for the
   expired-session outcome of #157.
3. **Given** a disabled warning (explicit `0` or the five-minute-timeout default), **When** the session reaches its
   deadline, **Then** the tabs reach the same expired-session outcome as with an enabled warning.

---

### Edge Cases

- Continue fails without the session having ended (for example, a server error): the warning stays open in every tab,
  no tab closes it, and Continue remains available. Behavior when the server is unreachable belongs to the separate
  pending heartbeat/connection-loss requirement.
- Continue is activated in two tabs at nearly the same time: both renewals are deliberate qualifying activity; every
  tab ends with the warning closed and the latest renewed deadline.
- Continue is activated in one tab while another tab's Continue is still in flight: each tab's warning closes on its
  own success or on receiving another tab's successful renewal, whichever comes first.
- The session ends by logout in another tab while the warning is open: the warning gives way to the existing logout
  outcome of [#155](https://github.com/PathableAI-org/Pre-ETS/issues/155).
- A renewal adopts a changed policy while a warning is open: the renewal closes the warning, and the next threshold
  uses the new lead. A renewal always places the threshold in the future, because a lead is less than the timeout.
- A protected page is restored from browser history during the warning period: history restoration follows the B5
  history rule and PREETS-SESSION-004; a restored page with a valid session is a deliberate request that renews it.
- A tab loses focus to another window while the warning is open: on return, focus is still inside the warning.
- The page behind the warning has an open native dialog, menu, or text selection: none of it remains operable while
  the warning is open.
- Pixels painted by the browser or operating system before page scripts run on resume are outside application
  control (B5 limitation).
- A renewal caused by a page load (for example, opening a protected page in a new tab) may reach other tabs after the
  2-second bound, as with #155's accepted gap G2; their warnings then close late. Continue renewals are not affected.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The effective warning lead MUST be derived from tenant configuration: omitted setting with an effective
  idle timeout above five minutes yields five minutes; omitted setting with a five-minute timeout yields no warning;
  explicit `0` yields no warning at any permitted timeout; a positive whole number of minutes below the effective
  timeout yields that lead.
- **FR-002**: A warning setting that is negative, fractional, nonnumeric, or not below the effective idle timeout MUST
  cause rejection of the tenant configuration as invalid under PREETS-TENANT-004 when an application request consumes
  it. No default MUST be substituted.
- **FR-003**: A disabled warning MUST NOT change authoritative expiration, expired-content concealment, or recovery.
- **FR-004**: The warning lead and the deadline a tab warns against MUST be those associated with the session's most
  recent authoritative renewal. A changed tenant setting MUST take effect for a session only at its next server
  renewal; sessions not yet renewed MAY keep their previous lead.
- **FR-005**: When the warning is enabled, every running tab sharing the session MUST open a blocking warning within
  2 seconds of the threshold (authoritative deadline minus lead) while the server is reachable.
- **FR-006**: A tab reaching its locally known threshold MUST confirm with the server before opening the warning, so
  that a renewal made elsewhere prevents the warning.
- **FR-007**: The warning MUST explain that the session will end soon because of inactivity and offer a Continue
  action. It MAY show the remaining time; if it does, changes in that time MUST NOT be repeatedly announced to
  assistive technology.
- **FR-008**: Activating Continue MUST be communicated to the server immediately, never coalesced, and MUST count as
  qualifying activity that renews the authoritative deadline.
- **FR-009**: The warning MUST close only after a successful renewal (by Continue in any sharing tab or by another
  qualifying request) or when the session ends. Escape, clicking outside, and other interaction MUST NOT close it.
- **FR-010**: After a successful renewal, every other running sharing tab MUST close its warning and adopt the renewed
  deadline within 2 seconds of the renewal response.
- **FR-011**: An unsuccessful Continue MUST NOT close the warning in any tab.
- **FR-012**: A Continue reaching the server at or after the authoritative deadline MUST NOT renew or restore the
  session.
- **FR-013**: On resume (visible or unfrozen), a tab whose locally known threshold has passed MUST confirm with the
  server and then open the warning only if the session is valid and within its warning period, adopting any later
  deadline instead. A tab past its locally known deadline MUST apply the B5 temporary resume concealment while
  confirming. Interaction after resume MUST NOT revive an ended session.
- **FR-014**: When the warning opens, its opening MUST be announced to assistive technology, and its explanation and
  Continue action MUST be perceivable.
- **FR-015**: When the warning opens, focus MUST move into it; while it is open, keyboard focus MUST stay within it,
  Continue MUST be keyboard-operable with a visible focus indicator.
- **FR-016**: While the warning is open, background application content MUST NOT be reachable or operable by keyboard,
  pointer, or assistive-technology navigation.
- **FR-017**: When the warning closes after a successful renewal, focus MUST return to the element that had focus
  when the warning opened, if still present and focusable, and otherwise to the page's main content.
- **FR-018**: Warning opening, closing, and renewal MUST stay within one session: tabs of another tenant, session, or
  browser context MUST be unaffected.

### Key Entities

- **Warning lead**: The tenant's effective number of whole minutes before expiration at which the warning opens, or
  disabled. Associated with a session at each authoritative renewal.
- **Warning threshold**: The authoritative deadline minus the warning lead. Reaching it opens the warning.
- **Warning**: The blocking notice shared by every running tab of a session during its warning period.
- **Continue**: The deliberate action on the warning that requests an authoritative renewal.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In every exercised enabled configuration, every running sharing tab opens the warning within 2 seconds
  of the threshold, including at 25 minutes of inactivity under the default 30-minute timeout.
- **SC-002**: In every exercised disabled configuration (explicit `0` at several timeouts, and the five-minute
  default), no warning opens, and the session still expires at its deadline.
- **SC-003**: Every exercised invalid warning setting causes tenant rejection at a tenant-consuming request, with no
  warning timing derived from a default.
- **SC-004**: Every exercised successful Continue renews the authoritative deadline and closes the warning in every
  other sharing tab within 2 seconds of the renewal response; zero exercised failed or late Continues close a warning
  or renew the session.
- **SC-005**: After every exercised policy change, a session uses the new lead only after its next renewal, and every
  sharing tab follows it.
- **SC-006**: Every exercised resume follows FR-013: no warning for a session renewed elsewhere, a warning after
  confirmation for a session in its warning period, and no revival of an ended session.
- **SC-007**: In every exercised opening, the warning is announced, focus enters it and stays within it, Continue is
  keyboard-operable with visible focus, zero background controls are reachable or operable, and focus returns as
  FR-017 states.
- **SC-008**: Zero exercised tabs of another tenant, session, or browser context are affected.

## Assumptions

- S2 ([#153](https://github.com/PathableAI-org/Pre-ETS/issues/153)) already derives the effective warning lead,
  rejects invalid warning settings, and adopts the current policy on each authoritative renewal; the session's lead
  reaches tabs with its deadline. This feature consumes that data and adds its browser consequences. FR-001, FR-002,
  and FR-004 restate those obligations so this feature's evidence can show them end to end.
- S3 ([#155](https://github.com/PathableAI-org/Pre-ETS/issues/155)) already shares renewed deadlines and logout
  across tabs, confirms with the server before acting on a local deadline and on resume, and applies the B5
  temporary resume concealment. This feature extends that coordination to the warning.
- "Continue" names the action; the requirement's "Keep working" is an accepted alternative label for the same action.
- Server unreachability at a threshold, during Continue, or on resume belongs to the separate pending
  heartbeat/connection-loss requirement.
- The 2-second bounds apply while sharing tabs are running and the server is reachable, as the B5 decision states.

## Delivery Authority and Scope _(mandatory)_

**Delivery issue**: [#156 — Warn before expiration and continue accessibly across tabs](https://github.com/PathableAI-org/Pre-ETS/issues/156),
read in its current open state on 2026-11-13, including its B5 timing and resume paragraph.

**Originating delivery slice**: [S4 — Warn before expiration and continue accessibly across tabs](https://github.com/PathableAI-org/Pre-ETS/blob/00116612c13c85457439a24937f615be72f8ad1b/docs/delivery/session-management.md#s4--warn-before-expiration-and-continue-accessibly-across-tabs),
with the [B5 browser timing and resume decision](https://github.com/PathableAI-org/Pre-ETS/blob/00116612c13c85457439a24937f615be72f8ad1b/docs/delivery/session-management.md#b5-browser-timing-and-resume-decision-2026-11-09)
merged by PR #360 at `00116612c13c85457439a24937f615be72f8ad1b`. Current `origin/main` authority was inspected at
`8ab3e692ba58c07a7ef70eec078f93b83fed67e8`; the requirement and delivery plan are unchanged since that pin. They
were inspected again on 2026-11-14 at `d03389afa69d1e08972255d136d10ac8768f556a` and are still unchanged, as is the
issue.

**Risk tier**: High, triggers 1 and 3, as the header states. Issue #156 was published before delivery issues had a
Risk tier section and does not record one yet. The tier here applies the Git workflow's triggers; the maintainer
records it on the issue.

### Accepted requirement coverage

| Requirement                                                                                                                                                   | Acceptance criteria in this slice | Feature disposition                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PREETS-SESSION-011](https://github.com/PathableAI-org/Pre-ETS/blob/8ab3e692ba58c07a7ef70eec078f93b83fed67e8/docs/requirements/session/PREETS-SESSION-011.md) | AC1–5                             | Specified in full (FR-001–FR-018). AC1's configuration domain and AC2's policy adoption are delivered server-side by #153 and observed end to end here. AC1's "disabled warnings do not disable expiration" and AC4's final tab outcome compose #157's expired-session presentation (US7, shipping gate below). |

### Authorized outcome

Every running tab sharing a session with an enabled warning shows an accessible blocking warning at the tenant's
threshold; keyboard Continue renews the actual authoritative deadline and closes the warning in every sharing tab; a
late Continue never revives the session; and disabled warnings still lead to protected expiration and recovery.

### In scope

- Tenant warning configuration as observed through the running application: defaults, explicit `0`, valid leads,
  invalid-setting rejection, and policy adoption on renewal.
- The blocking warning in every running sharing tab within 2 seconds of the threshold, with local-check-then-confirm.
- Continue: immediate communication, server renewal, success-only dismissal across tabs within 2 seconds, and late
  rejection.
- Resumed-tab warning behavior under the B5 rule.
- Announcement, focus entry, containment, visible keyboard focus, blocked background, and focus restoration.

### Out of scope

- Expired-session concealment, the expiration modal, Server Action HTTP 401 recovery, and explicit recovery
  ([#157](https://github.com/PathableAI-org/Pre-ETS/issues/157)); fresh login ([#158](https://github.com/PathableAI-org/Pre-ETS/issues/158)).
- Activity windows and logout coordination already delivered by #155.
- A Log out action inside the warning, and any dismissal that does not renew.
- Backend/domain persistence and API expiration-response policy, absolute maximum lifetime, concrete cloud
  provider/ingress, CI cadence, arbitrary application-value storage, and heartbeat/connection-loss behavior.

### Dependencies and blockers

- Start dependencies #153 (S2) and #155 (S3) are delivered; B5 is resolved (PR #360). No decision gate remains.
- **Shipping gate — #157 (S5)**: the final tab outcomes of a late Continue (US7 scenario 2, AC4) and of a disabled
  warning reaching expiration (US7 scenario 3, AC1) are #157's expired-session presentation. The delivery plan
  prioritizes #157 first but does not make it a start dependency. If this feature merges before #157, the server-side
  part of those claims (no renewal, expiration at the deadline) is verified here and the tab outcome stays an explicit
  shipping gap; #156 does not close until it is verified with #157 present. Status on 2026-11-14: #157 is closed and
  its expired-session presentation is on `main` at `d03389a`, so this feature's implementation can observe those tab
  outcomes. The gate itself is unchanged.
- #158 (S6) completes fresh recovery after expiration; this feature does not depend on it.

### Authority findings

None. The requirement, delivery plan, and B5 decision settle defaults, value domain, disabling, gradual policy
adoption, the 2-second bounds, and resume behavior. The following were settled by the maintainer for this
specification on 2026-11-13 as presentation details within AC3 and AC5, not as requirement changes: the warning
closes only on successful renewal or session end (no Escape or close dismissal); focus returns to the previously
focused element when still available, otherwise the main content; the warning offers Continue only; and showing the
remaining time is optional.
