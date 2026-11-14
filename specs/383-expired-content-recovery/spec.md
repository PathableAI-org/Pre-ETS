# Feature Specification: Protect Expired Content and Offer Explicit Accessible Recovery

**Feature Branch**: `383-expired-content-recovery`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "https://github.com/PathableAI-org/Pre-ETS/issues/157 — Protect expired content and offer
explicit accessible recovery (S5-A Server Action recovery, S5-B browser expiration protection, S6-C fresh explicit Login
composition)."

## Clarifications

### Session 2026-11-13

- Q: When may Server Action recovery content say the session expired rather than that it is no longer available? →
  A: When the server observed an expired session record, or when the submitting tab's locally known deadline had
  passed and that tab observed no logout for the session. This is the same basis the expiration modal uses. In every
  other case the content says the session is no longer available.
- Q: After a denied Server Action, what happens to protected content the page had already rendered? → A: The denied
  tab replaces its protected content with the recovery content, so that content is no longer readable or operable in
  that tab. Other sharing tabs are not changed by this event. They follow their own deadline and server confirmation,
  and the server denies their protected requests.
- Q: Must recovery work when a protected action form is submitted with page scripts disabled? → A: Yes. The denied
  submission still receives HTTP 401, and the page the browser displays is the recovery content with its Login action.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A Denied Action Explains Itself Instead of Acting (Priority: P1) — S5-A

As a job coach who submits a form after my session has ended, nothing is saved or changed. I see a page that tells
me my session expired, or that it is no longer available, and offers Log in. I am never sent to the identity provider
without choosing to go.

**Why this priority**: Server enforcement is the last line of defense when an action reaches the server before the
browser shows the expiration modal, or when browser timers do not run. A silent failure or an automatic redirect
loses the user's context without explanation, and a protected action that still ran would breach the idle policy.

**Independent Test**: With a real session, let it expire and, separately, remove its stored record. Then submit the
protected reference action from a page that was rendered while the session was valid: with timers running, with
timers disabled or delayed, with expiry falling between the interaction and the server receiving it, and with page
scripts disabled. Confirm HTTP 401, no protected operation, no protected content in the response, recovery content
with the right explanation and an explicit Log in action, and no provider request until Log in is activated.

**Acceptance Scenarios**:

1. **Given** a session that has expired, **When** the user submits a protected Server Action, **Then** the response
   status is 401, the protected operation is not performed, and the tab displays dedicated recovery content instead of
   its protected content.
2. **Given** a session whose stored record has been removed, **When** the user submits a protected Server Action,
   **Then** the same 401, denial, and recovery content follow.
3. **Given** a denied protected Server Action, **When** the response is displayed, **Then** no tenant OIDC login has
   started and no provider request has been made; login starts only when the user activates Log in.
4. **Given** a denied action from a tab whose locally known deadline had passed and that observed no logout, or a
   denial where the server observed an expired session record, **When** the recovery content is displayed, **Then**
   it explains that the session expired.
5. **Given** a denied action in any other case, such as a removed record before the tab's deadline, **When** the
   recovery content is displayed, **Then** it explains that the session is no longer available and does not say why.
6. **Given** a session that expires after the user activates the control but before the server receives the action,
   **When** the action arrives, **Then** it is denied with 401 and recovery content.
7. **Given** a tab whose timers are disabled or delayed so that no modal appeared at expiration, **When** the user
   submits a protected action after expiration, **Then** it is denied with 401 and recovery content.
8. **Given** page scripts are disabled, **When** the user submits a protected action form after the session ended,
   **Then** the response status is 401, the operation is not performed, and the page the browser displays is the
   recovery content with Log in. It says the session is no longer available unless the server observed an expired
   record.
9. **Given** a denied action, **When** the tab displays the recovery content, **Then** the protected content that the
   page rendered earlier is no longer readable or operable in that tab. Other sharing tabs are not changed by this
   event.

---

### User Story 2 - Recover From a Denied Action by Keyboard and Assistive Technology (Priority: P1) — S5-A

As a job coach who uses a keyboard or a screen reader, when my action is denied I learn why, I can find Log in, and I
can activate it with visible focus.

**Why this priority**: SESSION-007 AC4 makes accessible recovery part of the contract. Recovery that only pointer
users can perceive does not satisfy it.

**Independent Test**: Submit a protected action after expiration using only the keyboard, then with a screen reader.
Observe where focus goes, what is announced, and whether Log in can be reached and activated with visible focus.

**Acceptance Scenarios**:

1. **Given** recovery content is displayed after a denied action, **When** it appears, **Then** focus moves to it and
   assistive technology announces its explanation.
2. **Given** recovery content, **When** a keyboard user moves through it, **Then** the Log in action is reachable,
   has an accessible name that identifies it as signing in again, shows visible focus, and can be activated from the
   keyboard.
3. **Given** recovery content after a submission with page scripts disabled, **When** the page loads, **Then** its
   explanation and Log in action are perceivable to assistive technology and operable from the keyboard.

---

### User Story 3 - Protected Information Disappears From Every Tab at Expiration (Priority: P1) — S5-B

As a security stakeholder, I can rely on protected information, including PHI, no longer being readable in any open
tab of a session once that session expires, and never being hidden from a user whose session is still valid.

**Why this priority**: Server denial cannot remove information already on screen at an unattended workstation.

**Independent Test**: With controllable time, open several sharing tabs of one session showing protected content.
Let the authoritative deadline pass with no activity. Confirm that every running tab conceals its protected content
and shows the expiration modal within 2 seconds of the deadline. Repeat with activity in one tab just before another
tab's locally known deadline, and confirm that no tab expires while the session is valid.

**Acceptance Scenarios**:

1. **Given** sharing tabs that are running while the server is reachable, **When** the session reaches its
   authoritative deadline, **Then** every one of them conceals previously rendered protected information and shows
   the expiration modal within 2 seconds of the deadline.
2. **Given** a tab reaches its locally known deadline, **When** the server confirms the session was renewed in another
   tab, **Then** the tab adopts the new deadline and does not present the expired state.
3. **Given** a running tab, **When** the server session is still valid, **Then** the tab never presents the expired
   state or conceals content as expiration.
4. **Given** one tab enters the expired state, **When** other running sharing tabs exist, **Then** each of them enters
   the expired state too.
5. **Given** a tab already showing the signed-out notice after logout, **When** the session's deadline would have
   passed, **Then** the tab keeps the signed-out notice and does not present expiration.

---

### User Story 4 - The Expiration Modal Cannot Be Bypassed (Priority: P1) — S5-B

As a security stakeholder, I can rely on no route around the expiration modal revealing protected information,
whether by pointer, keyboard, assistive technology, or in-page navigation. As a keyboard or screen-reader user, I am
told about the expiration and can sign in again.

**Why this priority**: A modal that can be dismissed, tabbed behind, or read through by a screen reader leaves the
protected information exposed.

**Independent Test**: In a tab showing the expiration modal, try to close it with Escape, by clicking outside it,
through browser find, by tabbing past it, by activating in-page links behind it, and with a screen reader's virtual
cursor and landmark or heading navigation. Then refresh the tab and navigate back and forward.

**Acceptance Scenarios**:

1. **Given** the expiration modal, **When** the user presses Escape, clicks outside it, or attempts any other
   dismissal, **Then** the modal remains and no protected information becomes readable.
2. **Given** the expiration modal, **When** the user tries to activate in-page navigation behind it, **Then** no
   in-page navigation occurs.
3. **Given** the expiration modal, **When** a keyboard user presses Tab or Shift+Tab repeatedly, **Then** focus never
   reaches protected background content.
4. **Given** the expiration modal, **When** assistive technology reads or navigates the page by any of its modes,
   **Then** protected background information is not available to it.
5. **Given** a tab entering the expired state, **When** the modal appears, **Then** assistive technology announces the
   expiration, focus moves into the modal, and the Log in action is reachable and can be activated from the keyboard
   with visible focus.
6. **Given** the expiration modal, **When** the user refreshes the tab or navigates back or forward, **Then** the
   tenant's fresh-entry flow applies, as PREETS-SESSION-004 defines it, rather than the modal.

---

### User Story 5 - A Resumed Tab Never Shows Stale Protected Content (Priority: P2) — S5-B

As a job coach returning to a laptop that slept past my session's deadline, the tabs I left open do not show
protected content as they become visible. If my session was renewed in another tab meanwhile, my content comes back.

**Why this priority**: Timers do not run while a tab is suspended, so the running-tab rule alone would leave suspended
tabs showing protected content on wake.

**Independent Test**: With controllable time, suspend one sharing tab across expiration, then resume it. Repeat with
another tab renewing the session while the first is suspended, and with a tab resumed before its local deadline whose
session expired while it was suspended.

**Acceptance Scenarios**:

1. **Given** a tab whose locally known deadline passed while it was suspended or hidden, **When** it becomes visible
   or is unfrozen, **Then** it conceals protected content immediately, before further interaction, and confirms the
   session with the server.
2. **Given** that confirmation shows the session ended by expiration, **When** it completes, **Then** the tab enters
   the expired state and shows the expiration modal.
3. **Given** that confirmation shows the session was renewed in another tab, **When** it completes, **Then** the tab
   adopts the current deadline and restores its content without presenting the expired state.
4. **Given** a resumed tab whose locally known deadline has not passed, **When** the server reports that the session
   expired while it was suspended, **Then** the tab enters the expired state within 2 seconds.
5. **Given** a page restored from the browser's back/forward cache without a valid session, **When** it is shown,
   **Then** protected content stays concealed and the tenant's fresh-entry flow applies instead of the modal.
6. **Given** a resumed tab, **When** the user interacts after resume, **Then** that interaction cannot revive an ended
   session.

---

### User Story 6 - The Modal and the Recovery Page Say the Same Thing (Priority: P2) — S5-A and S5-B

As a job coach, whether my session's end reaches me through the modal or through a denied action, I get the same
explanation and the same way to sign in again.

**Why this priority**: SESSION-007 AC2 and SESSION-012 AC4 require equivalent expiration meaning and recovery, so a
user is not confused by two different stories about the same event.

**Independent Test**: Capture the modal's explanation and action, and the recovery content's explanation and action
for a known expiration. Compare them.

**Acceptance Scenarios**:

1. **Given** the expiration modal and known-expiration recovery content, **When** they are compared, **Then** both
   explain that the session expired and both offer an explicit Log in action with equivalent meaning.
2. **Given** unknown-cause recovery content, **When** it is compared with the modal, **Then** it says the session is no
   longer available and does not claim expiration, while offering the same Log in action.

---

### User Story 7 - Log In Again Freshly From the Recovery Page or the Modal (Priority: P1) — S6-C composition

As a job coach, when I choose Log in from recovery content or the expiration modal, my organization's identity
provider asks me to authenticate again, and only then do I reach protected content under a new session. If I cancel
or the login fails, nothing protected is shown and I can try again.

**Why this priority**: Recovery is incomplete until Log in leads to a new session. Under the B6 decision, existing
provider SSO alone must not silently re-admit someone at an unattended workstation. S6 delivered fresh
authentication; this feature composes it through its own two entry points.

**Independent Test**: With an existing provider SSO session, activate Log in by keyboard from recovery content and
from the modal. Confirm that the provider presents an authentication step, that a new session results, and that the
old session stays unusable. Repeat with a cancelled login, a provider error, and missing or stale freshness evidence.

**Acceptance Scenarios**:

1. **Given** recovery content or the expiration modal and an existing provider SSO session, **When** the user activates
   Log in, **Then** the tenant's login requests fresh authentication, and a session is established only after the
   provider confirms a fresh authentication event inside the B6 window.
2. **Given** that confirmed fresh login, **When** the user continues, **Then** protected access is granted under a new
   session bound to the authenticated user and tenant, and the old session's reference grants nothing and renews
   nothing.
3. **Given** a Log in started from recovery content or the modal, **When** the user cancels at the provider, the
   provider returns an error, or the freshness evidence is missing or stale, **Then** no session is established,
   protected content is not shown, the user sees the safe authentication-failure outcome, and Log in can be attempted
   again.
4. **Given** a new session established from one tab, **When** other sharing tabs are still in the expired state,
   **Then** they do not restore the content they concealed. They stay in the expired state until the user acts in
   them, and any protected content they show afterwards comes from a new render under a valid session.

---

### User Story 8 - Expiration Stays Within Its Own Session (Priority: P3) — S5-B

As a job coach with tabs for another tenant, or another browser profile, open alongside, the expiration of one
session does not hide or end the others.

**Why this priority**: Session, tenant, and browser-context isolation are accepted constraints. Expiration that leaks
across them would deny valid work or reveal state about another session.

**Independent Test**: Hold sessions for two tenants in one browser context and one session in a separate context. Let
one session expire and observe the others.

**Acceptance Scenarios**:

1. **Given** sessions for two tenants in one browser context, **When** one expires, **Then** only that tenant's tabs
   enter the expired state.
2. **Given** a separate browser context, **When** a session in the first context expires, **Then** the second
   context's tabs are unaffected.

---

### Edge Cases

- A session ends by logout in another tab rather than by expiration: tabs that learn of the logout show the signed-out
  notice that #155 delivered, not the expiration modal. A denied action in a tab that observed the logout says the
  session is no longer available, not that it expired.
- The tab's locally known deadline passed, but the session record was removed for another reason, for example by
  invalidation: the denied action's content says expired, because the tab's own deadline had passed. This is the
  approved basis, and it reports no other cause.
- The server cannot determine session state, or the session belongs to another tenant: those remain the existing 503
  and 403 outcomes, not this feature's 401 recovery.
- The server is unreachable at a local deadline or on resume: confirmation keeps protected content concealed and
  retries without presenting the expired state. Connection-loss behavior belongs to the separate pending heartbeat
  requirement.
- A tab is still loading when its session expires: its document request renewed the session, so expiration can only
  follow a later deadline. A document request that arrives after expiration follows fresh entry.
- A Server Action and the modal race: the action is denied with 401 and recovery content, or the modal appears first
  and blocks the submission. Either way no protected operation runs and protected content stays unreadable.
- Two tabs each activate Log in: each login must pass freshness on its own. A tab whose Log in finds a valid session
  that another tab already established joins it without a new provider step, as valid sessions are reused.
- Late Continue from the expiration warning: #156 adds these races when it delivers Continue. A Continue that reaches
  the server after expiration must produce this feature's denial and expired state, not renewal.
- Pixels painted by the browser or operating system before page scripts run on resume, such as a wake snapshot, are
  outside application control and are a recorded limitation.

## Requirements _(mandatory)_

### Functional Requirements

**S5-A — Server Action recovery**

- **FR-001**: A protected Server Action that encounters an expired session or a missing session record MUST respond
  with actual HTTP 401 and MUST NOT perform its protected operation or any of its protected side effects.
- **FR-002**: The 401 response MUST NOT contain protected content, and the application MUST NOT start tenant OIDC or
  contact the provider as a result of the denial.
- **FR-003**: The tab that submitted the denied action MUST display dedicated recovery content that is available
  without authentication, explains the outcome, and offers an explicit Log in action. Protected content that the page
  rendered earlier MUST NOT remain readable or operable in that tab. HTTP redirect is not required.
- **FR-004**: The recovery content MUST explain that the session expired when the server observed an expired session
  record, or when the submitting tab's locally known deadline had passed and that tab observed no logout of the
  session. Otherwise it MUST say the session is no longer available, without stating a cause.
- **FR-005**: FR-001 to FR-004 MUST hold when expiry falls between the user's interaction and the server receiving the
  action, and when browser timers are disabled or delayed.
- **FR-006**: A protected action form submitted with page scripts disabled MUST receive HTTP 401 with no protected
  operation, and the page the browser displays MUST be the recovery content with its Log in action.
- **FR-007**: When recovery content appears in a running tab, focus MUST move to it and assistive technology MUST
  announce its explanation. The Log in action MUST be reachable and operable from the keyboard, with visible focus and
  an accessible name that identifies signing in again.
- **FR-008**: A denied action MUST NOT change other sharing tabs by itself. They follow FR-009 to FR-018, and the
  server denies their protected requests.

**S5-B — Browser expiration protection**

- **FR-009**: While sharing tabs run and the server is reachable, each MUST conceal previously rendered protected
  information and present the blocking expiration modal within 2 seconds of the authoritative deadline.
- **FR-010**: A running tab MUST NOT present the expired state while the server session is valid. A tab reaching its
  locally known deadline MUST confirm with the server first, and adopt a renewed deadline when one exists.
- **FR-011**: The expired state MUST propagate to every running sharing tab of the session. It MUST NOT affect tabs of
  another session, another tenant, or another browser context.
- **FR-012**: The modal MUST explain expiration and offer an explicit Log in action. It MUST NOT be dismissible by
  Escape, by clicking outside, or by any other control. No bypass may make protected information readable.
- **FR-013**: While the modal is active, in-page navigation MUST be unavailable. Protected background content MUST NOT
  be reachable by keyboard focus, and MUST NOT be available to assistive-technology reading or navigation in any mode.
- **FR-014**: When the expired state begins, assistive technology MUST announce the expiration and focus MUST move into
  the modal. The Log in action MUST be operable from the keyboard with visible focus.
- **FR-015**: Refresh and browser back/forward navigation from an expired tab MUST follow the tenant's fresh-entry flow
  (PREETS-SESSION-004) instead of presenting the modal.
- **FR-016**: On becoming visible or being unfrozen, a tab whose locally known deadline has passed MUST conceal
  protected content immediately, before further interaction, and confirm with the server. If the session ended by
  expiration it MUST enter the expired state. If the session is still valid it MUST adopt the current deadline and
  restore its content without presenting the expired state. Temporary resume concealment MUST NOT be presented as the
  expired state.
- **FR-017**: On resume, a tab whose locally known deadline has not passed MUST confirm with the server and enter the
  expired state within 2 seconds if the session expired while it was suspended.
- **FR-018**: A page restored from the back/forward cache MUST keep protected content concealed during confirmation and,
  without a valid session, MUST follow fresh entry instead of the modal. Interaction after resume MUST NOT revive an
  ended session.
- **FR-019**: A tab that learned of a logout MUST keep the signed-out notice and MUST NOT present the expiration modal
  for that session.

**Shared meaning and S6-C composition**

- **FR-020**: The modal and known-expiration recovery content MUST convey equivalent expiration explanations and
  equivalent explicit Log in actions. Unknown-cause recovery content MUST offer the same Log in action without claiming
  expiration.
- **FR-021**: Authentication MUST start only when the user activates Log in. Log in from recovery content or the modal
  MUST use the tenant's delivered login boundary, which requires fresh authentication under the B6 decision when no
  valid session exists, and reuses a valid session when one already exists.
- **FR-022**: A completed fresh login from either entry point MUST establish a new session bound to the authenticated
  user and tenant. The old session's reference MUST grant no protected access and renew nothing.
- **FR-023**: A cancelled, failed, missing-evidence, or stale-evidence login from either entry point MUST establish no
  session, MUST show no protected content, and MUST leave Log in available to try again.
- **FR-024**: A tab in the expired state MUST NOT restore its concealed content because a session was established
  elsewhere. Protected content shown afterwards MUST come from a new render under a valid session.
- **FR-025**: Recovery content, the modal, and their announcements MUST NOT reveal protected content, session
  references, tokens, or identity claims.

### Key Entities

- **Expired state**: A tab's presentation after its session ended by expiration: protected information concealed,
  the blocking modal shown, background unavailable. Temporary resume concealment is not the expired state.
- **Recovery content**: The unauthenticated page displayed for a denied protected Server Action. It explains known
  expiration or an unavailable session and offers Log in.
- **Known expiration**: The basis for saying "expired": the server observed an expired record, or the tab's own
  deadline passed without an observed logout.
- **Sharing tabs**: The open tabs of one tenant's session in one browser context.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Every exercised protected Server Action with an expired session or removed record returns 401 and
  produces zero protected side effects. Cases include expiry in flight, disabled or delayed timers, and disabled
  scripts.
- **SC-002**: Zero exercised denial responses contain protected content, and zero exercised denials start a provider
  request before the user activates Log in.
- **SC-003**: Every exercised recovery explains expiration exactly in the known-expiration cases and says the session
  is no longer available in every other case.
- **SC-004**: In every exercised expiration with running sharing tabs, each tab conceals protected information and shows
  the modal within 2 seconds of the deadline. No exercised running tab presents the expired state while its session
  is valid.
- **SC-005**: Zero exercised dismissal, bypass, in-page navigation, keyboard, or assistive-technology attempts make
  protected background information readable, focusable, or navigable while the modal is active.
- **SC-006**: Every exercised keyboard-only recovery from recovery content and from the modal reaches and activates Log
  in with visible focus. Assistive technology announces the explanation in each case.
- **SC-007**: Every exercised resume follows the B5 rule: immediate concealment past the local deadline, restoration
  after renewal elsewhere, the expired state after expiration, and fresh entry for back/forward-cache restoration.
- **SC-008**: Every exercised fresh Log in from either entry point with existing provider SSO presents a provider
  authentication step and yields a new session. Every exercised cancelled, failed, missing-evidence, or stale-evidence
  login yields none, and the old session never regains access.
- **SC-009**: Zero exercised expirations change tabs of another session, tenant, or browser context.

## Assumptions

- S1 (#154) delivered default protection of Server Actions, with HTTP 401 and no operation for an absent or unknown
  reference, and the protected reference action used as the real consumer. S2 (#153) delivered expired and missing
  session classification. S3 (#155) delivered sharing-tab coordination, logout concealment, the signed-out notice,
  and resume concealment, and it left the expiration modal to this feature. S6 (#158) delivered `max_age=0` fresh
  authentication with `auth_time` confirmation inside the B6 window, and its failure outcomes. This feature composes
  those capabilities and does not re-verify them.
- The signed-out notice currently stands in for expiration. This feature replaces that stand-in with the expiration
  modal, and it keeps the notice for logout.
- Where the user lands after a successful Log in is the delivered login boundary's existing behavior. Returning to the
  pre-expiration location is not required.
- The exact wording of the explanations is an engineering and content choice, constrained by FR-004 and FR-020.
- The repository's local identity provider is the real provider for Log in evidence. Local results do not establish
  Microsoft or broker compatibility.

## Delivery Authority and Scope _(mandatory)_

**Delivery issue**: [#157 — Protect expired content and offer explicit accessible recovery](https://github.com/PathableAI-org/Pre-ETS/issues/157),
read in its current open state on 2026-11-13, including its B6 decision note of 2026-10-17.

**Originating delivery slice**: [S5 — Protect expired content and offer explicit accessible recovery](https://github.com/PathableAI-org/Pre-ETS/blob/e206d165f0f30999220922f57a3f92549c15f4cc/docs/delivery/session-management.md#s5--protect-expired-content-and-offer-explicit-accessible-recovery),
approved by the merge of PR #189 at `e206d165f0f30999220922f57a3f92549c15f4cc`. The S6-C composition follows
[S6](https://github.com/PathableAI-org/Pre-ETS/blob/8ab3e692ba58c07a7ef70eec078f93b83fed67e8/docs/delivery/session-management.md#s6--complete-fresh-tenant-oidc-recovery-with-a-new-session).
The [B5 browser timing and resume decision](https://github.com/PathableAI-org/Pre-ETS/blob/8ab3e692ba58c07a7ef70eec078f93b83fed67e8/docs/delivery/session-management.md#b5-browser-timing-and-resume-decision-2026-11-09)
(PR #360) and the [B6 freshness decision](https://github.com/PathableAI-org/Pre-ETS/blob/8ab3e692ba58c07a7ef70eec078f93b83fed67e8/docs/delivery/session-management.md#b6-freshness-comparison-and-provider-handling-2026-11-09)
(PR #359) are merged. Current `origin/main` authority was inspected at `8ab3e692ba58c07a7ef70eec078f93b83fed67e8`.

### Accepted requirement coverage

| Requirement                                                                                                                                                   | Acceptance criteria in this slice | Feature disposition                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PREETS-SESSION-007](https://github.com/PathableAI-org/Pre-ETS/blob/8ab3e692ba58c07a7ef70eec078f93b83fed67e8/docs/requirements/session/PREETS-SESSION-007.md) | AC1–4 (S5-A)                      | Specified in full: AC1 by FR-001–FR-003 and FR-005–FR-006; AC2 by FR-003–FR-004 and FR-020; AC3 by FR-002–FR-003 and FR-025; AC4 by FR-007. "Known expiration" basis per Clarifications 2026-11-13.               |
| [PREETS-SESSION-012](https://github.com/PathableAI-org/Pre-ETS/blob/8ab3e692ba58c07a7ef70eec078f93b83fed67e8/docs/requirements/session/PREETS-SESSION-012.md) | AC1–5 (S5-B)                      | Specified in full with the B5 bound and resume rule: AC1 by FR-009, FR-016–FR-018; AC2 by FR-012–FR-013, FR-015; AC3 by FR-011; AC4 by FR-020; AC5 by FR-013–FR-014. Pre-script paint is a recorded limitation.   |
| [PREETS-SESSION-013](https://github.com/PathableAI-org/Pre-ETS/blob/8ab3e692ba58c07a7ef70eec078f93b83fed67e8/docs/requirements/session/PREETS-SESSION-013.md) | AC1, AC2, AC5 (explicit recovery) | Composition only (S6-C): fresh Log in through this feature's recovery content and modal (FR-021–FR-024). The freshness mechanism, its window, and its diagnostics are delivered by #158 and are not re-specified. |
| [PREETS-SESSION-004](https://github.com/PathableAI-org/Pre-ETS/blob/8ab3e692ba58c07a7ef70eec078f93b83fed67e8/docs/requirements/session/PREETS-SESSION-004.md) | AC2                               | Fresh entry does not replace the modal or recovery content (FR-015, FR-018 keep the boundary). AC1 fresh entry itself is delivered by #154 and #158.                                                              |

### Authorized outcome

Protected Server Actions after expiration or record removal are denied with HTTP 401, do nothing, and display
accessible recovery that explains known expiration or an unavailable session. Every running sharing tab conceals
protected information behind an unbypassable, accessible expiration modal. Log in from either entry point is explicit
and fresh, and it never revives the old session.

### In scope

- S5-A: Server Action 401, denial, recovery content, known versus unknown cause, accessibility, scripts-disabled
  submission, in-flight expiry, and disabled or delayed timers.
- S5-B: cross-tab concealment and the expiration modal within the B5 2-second bound, no early expiration, bypass and
  assistive-technology protection, blocked in-page navigation, fresh entry on refresh and history, B5 resume, and
  isolation.
- S6-C: fresh explicit Log in from recovery content and the modal, with cancelled, failed, and stale outcomes, using
  real local-provider evidence.

### Out of scope

- Warnings and Continue (#156). Late-Continue races are added when #156 delivers Continue.
- The freshness mechanism, B6 window, and freshness diagnostics (#158), and fresh entry by new tab, refresh, or history
  (#154, #158).
- Logout and the signed-out notice (#155), except that expiration must not override it.
- Backend/domain persistence and API expiration-response policy, absolute maximum lifetime, concrete cloud
  provider/ingress, CI cadence, arbitrary application-value storage, and heartbeat or connection-loss behavior.
- An expiration-recognition retention period, and a return-to-location requirement after Log in.

### Dependencies and blockers

- S5-A composes S1 (#154) and S2 (#153), both delivered. S5-B composes S3 (#155), delivered, and B5, resolved.
- S6 (#158) freshness is delivered, so successful post-expiration Log in is not gated. Increments that deliver denial
  or concealment before their Log in composition is verified record that claim as incomplete, as the delivery plan
  permits.
- S4 (#156) is not a prerequisite. It extends the race cases when available.

### Authority findings

None open. The three clarifications of 2026-11-13 were decided by the maintainer in this specification session. The
first refines what "known" means in SESSION-007's "explain expiration when known", and it adopts no retention
mechanism. The second and third settle presentation scope that the requirements leave to delivery. None of them edits
a requirement or the delivery plan.
