# Feature Specification: Coordinate Intentional Activity and Logout Across Session-Sharing Tabs

**Feature Branch**: `163-coordinate-tab-activity`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "https://github.com/PathableAI-org/Pre-ETS/issues/155"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Keep Working in One Tab Without Losing Another (Priority: P1)

As a job coach with a roster open in one tab and a participant record open in another, I can work in either tab and
both stay usable, because every tab for my tenant in this browser shares one session and one idle deadline, and my
activity in one tab keeps the other tab from expiring on its own.

**Why this priority**: Cross-tab renewal is the slice's core observable increment. Without it, reading in one tab and
working in another causes an unexpected loss of access in the tab the user is not touching.

**Independent Test**: Sign in, open two protected tabs for the same tenant, and with controllable time interact only
in tab A past tab B's former deadline. Confirm that tab B remains usable, that a protected operation from tab B
succeeds, and that the authoritative session deadline moved forward.

**Acceptance Scenarios**:

1. **Given** two running tabs for the same resolved tenant in the same browser context, **When** each makes protected
   requests, **Then** both use the same application session and the same authoritative idle deadline.
2. **Given** two sharing tabs, **When** qualifying activity in tab A renews the authoritative deadline, **Then** tab B
   reflects the renewed deadline within 2 seconds of the renewal response.
3. **Given** tab B is inactive and its previously known deadline passes after activity in tab A renewed the session,
   **When** tab B reaches that former deadline, **Then** it confirms with the server, stays usable, and does not
   present expiration, conceal its content, or deny protected use.
4. **Given** the authoritative session remains valid, **When** any running sharing tab reaches a locally known deadline,
   **Then** that tab does not present the expired state.

---

### User Story 2 - Count Only Intentional Activity (Priority: P1)

As a security stakeholder, I can rely on the session being renewed only by what a person deliberately does in the
application, communicated promptly enough to keep a still-valid session alive, and never by pointer movement,
programmatic focus, or automatic background traffic.

**Why this priority**: Idle protection is meaningful only if incidental and automatic events cannot keep an unattended
session alive, while genuine use reliably renews it.

**Independent Test**: With controllable time and a running authenticated tab, perform each qualifying and each
excluded interaction near the deadline in isolation. Confirm that qualifying interactions renew the authoritative
deadline within the B5 bounds and that excluded interactions leave it unchanged until expiration.

**Acceptance Scenarios**:

1. **Given** a running authenticated tab, **When** the user deliberately fetches a page or submits a form, **Then** that
   request counts as qualifying activity and renews the still-valid session when the server receives it.
2. **Given** a running authenticated tab, **When** the user activates a meaningful control, types or enters text,
   interacts by keyboard or touch with a meaningful input, or moves focus to a meaningful input, **Then** the activity
   counts as qualifying and renews the still-valid session when communicated.
3. **Given** no in-page activity communication for the session in the previous 60 seconds from any sharing tab,
   **When** qualifying in-page interaction occurs, **Then** it is communicated immediately and opens a 60-second window.
4. **Given** an open 60-second window, **When** further qualifying in-page interaction occurs in any sharing tab,
   including after the window's first renewal completes, **Then** it is coalesced and communicated once when the window
   ends, so no interaction waits more than 60 seconds.
5. **Given** the authoritative deadline is less than 60 seconds away, **When** qualifying in-page interaction occurs,
   **Then** it is communicated immediately rather than coalesced.
6. **Given** a running authenticated tab, **When** only raw pointer movement occurs, **Then** the idle deadline is never
   renewed.
7. **Given** a running authenticated tab, **When** focus changes only programmatically, **Then** that change does not
   count as qualifying activity.
8. **Given** a running authenticated tab, **When** automatic polling, prefetching, or other background traffic unrelated
   to qualifying activity occurs, **Then** the idle deadline is never renewed by it.

---

### User Story 3 - Log Out Once, Everywhere in That Session (Priority: P1)

As a user on a shared workstation, I can log out from any tab and know that every tab sharing that session loses
protected access and stops showing protected information.

**Why this priority**: Shared logout is a security obligation of the slice's observable increment; a tab that
continues protected use after logout exposes participant information.

**Independent Test**: Sign in, open three sharing tabs, and log out from one. Confirm that within 2 seconds every other
running sharing tab conceals protected content and shows the signed-out notice, that no tab starts sign-in on its
own, and that actual protected page requests and protected operations from every tab are denied afterward.

**Acceptance Scenarios**:

1. **Given** an authenticated protected page, **When** the user looks for a way to log out, **Then** an explicit logout
   action is available, keyboard-operable with visible focus and a meaningful accessible name.
2. **Given** several running tabs sharing a session, **When** the user logs out in one of them, **Then** the logout is
   communicated immediately, never coalesced, and the server ends authenticated access for that session.
3. **Given** the server has ended the session by logout, **When** other running sharing tabs are observed, **Then** each
   conceals protected content within 2 seconds of the server ending the session.
4. **Given** the session was logged out, **When** any tab that shared it attempts a protected page request or protected
   operation, **Then** it is denied and no protected content or effect results.
5. **Given** the session was logged out, **When** any tab that shared it later communicates qualifying activity,
   **Then** the logged-out session is not revived.
6. **Given** the session was logged out, **When** the logging-out tab or any other running sharing tab conceals its
   protected content, **Then** it shows an accessible signed-out notice with an explicit Log in action that enters the
   tenant's fresh-entry flow when activated, and authentication does not start automatically.

---

### User Story 4 - Join the Existing Session in a New Tab (Priority: P2)

As a signed-in user, opening another application tab joins my current session and adopts its current deadline and
policy, so I neither sign in again nor create a second session with its own idle state.

**Why this priority**: Joining is largely delivered by the S1 entry gate; this slice makes the joined tab a full
participant in shared activity, synchronization, and logout.

**Independent Test**: With an authenticated tab open, open a second tab on a protected page. Confirm no new login, the
same session identity, the current authoritative deadline in the new tab, and that activity and logout in either tab
affect the other.

**Acceptance Scenarios**:

1. **Given** a valid session, **When** the user opens a new application tab for the same tenant in the same browser
   context, **Then** the tab joins that session rather than establishing an independent session.
2. **Given** a newly joined tab, **When** it starts, **Then** it reflects the session's current authoritative deadline
   and effective policy, not a fresh idle period of its own.
3. **Given** a newly joined tab, **When** activity or logout occurs in it or in an earlier tab, **Then** it participates
   exactly as earlier sharing tabs do.

---

### User Story 5 - Keep Other Sessions Independent (Priority: P2)

As a tenant and its users, we can rely on activity and logout in one session never renewing or logging out a
different session, including another tenant's session in the same browser and any session in another browser
context.

**Why this priority**: Session and tenant isolation are constitutional obligations; cross-session coordination would
let one tenant's activity extend or end another's access.

**Independent Test**: Hold authenticated sessions for tenant A and tenant B in one browser context, plus a tenant-A
session in a second browser context. Interact and log out in one session at a time and confirm the others' deadlines
and access are unchanged.

**Acceptance Scenarios**:

1. **Given** sessions for tenants A and B in the same browser context, **When** qualifying activity occurs in a tenant-A
   tab, **Then** tenant B's session deadline is unchanged.
2. **Given** sessions for tenants A and B in the same browser context, **When** the user logs out in a tenant-A tab,
   **Then** tenant B's tabs keep protected access and content.
3. **Given** tenant-A sessions in two browser contexts, **When** activity or logout occurs in one context, **Then** the
   other context's session is neither renewed nor logged out.
4. **Given** activity was observed in a tab under one session, **When** a different session is in force by the time it
   would be communicated, **Then** that activity does not renew the different session.

---

### User Story 6 - Resume a Suspended Tab Safely (Priority: P2)

As a user returning to a tab that was hidden, frozen, or kept in browser history, I see protected content only when
the server confirms my session is still valid, and nothing I do after returning revives a session that ended.

**Why this priority**: Suspended tabs miss coordination messages; resuming must neither expose content from an ended
session nor discard a session another tab kept alive.

**Independent Test**: With controllable time, suspend tab B while tab A renews past B's known deadline; resume B and
confirm temporary concealment followed by restored content. Repeat with a logout in tab A while B is suspended and
confirm concealment and denial on resume.

**Acceptance Scenarios**:

1. **Given** a tab whose locally known deadline has passed while it was suspended, **When** it resumes, **Then** it
   immediately conceals protected content, before further interaction, and confirms the session with the server.
2. **Given** that resumed tab and a session renewed in another tab while it was suspended, **When** the server confirms
   the session is valid, **Then** the tab adopts the current deadline and restores its content without presenting the
   expired state.
3. **Given** a tab whose locally known deadline has not passed, **When** it resumes after the session was logged out
   while it was suspended, **Then** it confirms with the server and conceals protected content within 2 seconds.
4. **Given** a resumed tab whose session ended, **When** the user interacts with it, **Then** the interaction cannot
   revive the ended session.
5. **Given** a protected page restored from the browser's back/forward cache, **When** it is shown, **Then** protected
   content stays concealed during server confirmation; with a valid session it is restored, and without one the
   tenant's fresh-entry flow applies rather than an expiration modal.

### Edge Cases

- Qualifying interaction occurs in tab A, then within the same open window in tab B: one coalesced communication
  covers both, and neither waits more than 60 seconds.
- Qualifying interaction occurs in a tab whose authoritative deadline is less than 60 seconds away while a window is
  open: it is communicated immediately.
- Qualifying activity reaches the server at or after expiration, including activity coalesced before expiration and
  communicated after it: authenticated access is not revived.
- A tab is logged out while a coalesced communication is pending: the pending activity does not revive the session.
- A user logs out in tab A and signs in again in tab B before stale tab C communicates queued activity: tab C's activity
  does not renew the new session.
- A deliberate page fetch or form submission races with logout: once the server has ended the session, the request is
  denied and produces no protected content or effect.
- Programmatic focus follows a user-driven action, such as focus moving into a newly shown field: the user-driven
  action qualifies; the programmatic focus change adds no independent qualification.
- A page performs automatic refresh or prefetch while the user is idle: the deadline does not move.
- Session state cannot be determined when a tab confirms its deadline or resumes: protected access fails closed and the
  tab does not claim the session is valid; behavior when the server is unreachable belongs to the separate pending
  heartbeat/connection-loss requirement.
- A tab confirms on resume that the session ended by expiration rather than logout: protected content remains concealed
  and no protected use is possible; the expired-state presentation is completed by
  [#157](https://github.com/PathableAI-org/Pre-ETS/issues/157).
- Pixels painted by the browser or operating system before page scripts run on resume are outside application control
  and are a recorded limitation, not a violation.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: All concurrent application tabs for the same resolved tenant in the same browser context MUST use the same
  application session and common authoritative idle state.
- **FR-002**: A new application tab opened while a valid session exists for its tenant in that browser context MUST join
  that session, adopt its current authoritative deadline and effective policy, and participate in activity,
  synchronization, and logout like every other sharing tab.
- **FR-003**: Deliberate authenticated page fetches and form submissions MUST count as qualifying activity and renew a
  still-valid session when the server receives their own request.
- **FR-004**: Intentional control activation, keyboard interaction, text entry, touch interaction, and user-driven focus
  changes involving meaningful application inputs MUST count as qualifying in-page activity.
- **FR-005**: Raw pointer movement alone, programmatic focus changes alone, and automatic polling, prefetching, or other
  background traffic unrelated to qualifying activity MUST NOT renew the idle deadline.
- **FR-006**: Qualifying in-page activity occurring when no in-page activity communication was sent for the session in
  the previous 60 seconds, by any sharing tab, MUST be communicated immediately and MUST open a new 60-second window.
- **FR-007**: Qualifying in-page activity occurring within an open window MUST be coalesced and communicated once when
  that window ends; no qualifying interaction may wait more than 60 seconds to be communicated.
- **FR-008**: Qualifying in-page activity occurring when the shared authoritative deadline is less than 60 seconds away
  MUST be communicated immediately.
- **FR-009**: Logout MUST be communicated immediately and MUST NOT be coalesced.
- **FR-010**: Qualifying activity received by the server before expiration MUST renew the still-valid session; activity
  received at or after expiration or after logout MUST NOT revive authenticated access.
- **FR-011**: Qualifying activity in any sharing tab MUST renew the authoritative deadline for the shared session, and
  while sharing tabs run and the server is reachable every other sharing tab MUST reflect the renewed deadline and its
  associated effective policy within 2 seconds of the renewal response.
- **FR-012**: A running sharing tab MUST NOT present the expired state, conceal content, or deny protected use on its own
  while the server session remains valid; a tab reaching a locally known deadline MUST confirm with the server first.
- **FR-013**: Every protected page MUST offer an explicit logout action that is keyboard-operable with visible focus, has
  a meaningful accessible name, and produces a perceivable outcome.
- **FR-014**: Logging out in any tab MUST end authenticated access for the shared session at the server, so that no tab
  sharing it can continue protected page requests or protected operations under it.
- **FR-015**: While sharing tabs run and the server is reachable, every other sharing tab MUST conceal protected content,
  visually and from keyboard and assistive-technology access, within 2 seconds of the server ending the session by
  logout.
- **FR-016**: Activity and logout MUST affect only the associated session; they MUST NOT renew or log out a different
  session, including a session for another resolved tenant, a session in another browser context, or a later session
  established after the associated one ended.
- **FR-017**: On resume (becoming visible, being unfrozen, or being restored from the back/forward cache), a tab whose
  locally known deadline has passed MUST conceal protected content immediately, before further interaction, and
  confirm the session with the server; temporary resume concealment MUST NOT be presented as the expired state.
- **FR-018**: When server confirmation after resume shows the session is still valid, the tab MUST adopt the current
  authoritative deadline and restore its content.
- **FR-019**: On resume, a tab whose locally known deadline has not passed MUST confirm with the server and MUST conceal
  protected content within 2 seconds if the session was logged out while it was suspended. The same rule for a session
  that expired while suspended, with entry into the expired state, is completed by #157.
- **FR-020**: A page restored from the back/forward cache MUST keep protected content concealed during confirmation and,
  when no valid session remains, MUST follow the tenant's fresh-entry policy rather than present an expiration modal.
- **FR-021**: When session state cannot be determined during deadline confirmation, resume, or logout, protected access
  MUST fail closed, the tab MUST NOT present the session as valid, and a logout MUST NOT be reported as completed unless
  the server ended the session.
- **FR-022**: Logout, denial, concealment, and coordination outcomes MUST NOT reveal protected content, session
  references, tokens, or storage internals, and coordination MUST NOT carry protected information between sessions,
  tenants, or browser contexts.
- **FR-023**: After logout, the logging-out tab and every other sharing tab that conceals protected content MUST show a
  signed-out notice that is announced to assistive technology, explains that the user is signed out, and offers an
  explicit Log in action, keyboard-operable with visible focus, that enters the tenant's fresh-entry flow. No tab may
  start authentication automatically after logout.

### Key Entities

- **Application Session**: The server-authoritative association of an authenticated user with the tenant under which
  authentication occurred, shared by every tab for that tenant in one browser context while valid.
- **Session-Sharing Tab**: A running application tab for the same resolved tenant in the same browser context as other
  tabs, using one application session.
- **Authoritative Idle Deadline**: The server-held time after which the session is expired unless qualifying activity
  reaches the server first, together with the effective warning policy adopted at the latest refresh.
- **Qualifying Activity**: A deliberate page fetch, form submission, or intentional interaction with a meaningful
  application input, as distinct from pointer movement, programmatic focus, and automatic traffic.
- **Activity Communication Window**: The 60-second period following the session's most recent in-page activity
  communication from any sharing tab, within which further in-page activity is coalesced.
- **Resume**: A tab becoming visible, being unfrozen, or being restored from the back/forward cache after suspension.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In every exercised two-tab journey, an inactive tab remains usable past its former deadline after activity
  in the other tab, and a protected operation from it succeeds.
- **SC-002**: Every exercised qualifying interaction kind (page fetch, form submission, control activation, typing,
  keyboard, touch, user-driven focus) renews the authoritative deadline; every exercised excluded kind (pointer
  movement, programmatic focus, automatic traffic) leaves it unchanged through expiration.
- **SC-003**: In every exercised case, interaction with no in-page communication in the previous 60 seconds, including
  in another sharing tab, and interaction within 60 seconds of the deadline renew immediately; coalesced interaction
  renews no later than 60 seconds after it occurs; repeated interaction within an open window produces one renewal.
- **SC-004**: In every exercised case with the server reachable, each other running sharing tab reflects a renewed
  deadline within 2 seconds of the renewal response and conceals protected content within 2 seconds of logout.
- **SC-005**: After logout, 100% of exercised protected page requests and protected operations from every former sharing
  tab are denied with no protected content or effect.
- **SC-006**: 100% of exercised qualifying activity communicated after expiration or logout leaves authenticated access
  unavailable.
- **SC-007**: In every exercised isolation case, activity and logout in one session leave sessions for another tenant,
  another browser context, and a later session unchanged.
- **SC-008**: Every exercised new tab joins the existing session without login and reflects its current deadline.
- **SC-009**: Every exercised resume across renewal restores content without the expired state; every exercised resume
  across logout conceals within the B5 bounds and permits no protected use.
- **SC-010**: A keyboard-only user can reach and activate logout with visible focus and perceive its outcome.
- **SC-011**: After every exercised logout, each sharing tab shows the signed-out notice, assistive technology announces
  it, its Log in action reaches tenant sign-in only when activated, and no tab starts authentication on its own.

## Assumptions

- S1 ([#154](https://github.com/PathableAI-org/Pre-ETS/issues/154), merged in PR #355) supplies default entry-point
  protection, document-entry and form-submission renewal at the request gate, valid-session joining at entry, and
  fresh entry. S2 ([#153](https://github.com/PathableAI-org/Pre-ETS/issues/153)) supplies shared session state, renewal
  with current-policy adoption, no revival, and explicit invalidation. This slice composes them; closure does not
  establish requirement verification.
- Logout in this slice ends the application session, which is what PREETS-SESSION-010 requires. Whether logout also
  ends the identity provider's session is not decided by the accepted requirements (Authority finding 2). Because
  every login without a valid application session requires fresh authentication under the B6 policy, a remaining
  provider session cannot silently re-establish application access.
- After a resumed tab confirms that its session ended by expiration, this slice keeps protected content concealed and
  denies protected use; the expired-state modal and recovery are composed by #157.
- Warning thresholds, warning presentation, Continue, and their synchronization are composed by
  [#156](https://github.com/PathableAI-org/Pre-ETS/issues/156). This slice synchronizes the effective policy that
  #156 consumes but presents no warning.
- The 2-second and 60-second bounds are measured with controllable time while sharing tabs run and the server is
  reachable.
- The repository's local identity provider is the current integration for real sessions; local results do not
  establish Microsoft compatibility.

## Delivery Authority and Scope _(mandatory)_

**Delivery issue**: [#155 — Coordinate intentional activity and logout across session-sharing tabs](https://github.com/PathableAI-org/Pre-ETS/issues/155),
read in its current open state on 2026-11-09, including its B5 and B6 resolution notes.

**Originating delivery slice**: [S3 — Coordinate intentional activity and logout across session-sharing tabs](https://github.com/PathableAI-org/Pre-ETS/blob/e206d165f0f30999220922f57a3f92549c15f4cc/docs/delivery/session-management.md#s3--coordinate-intentional-activity-and-logout-across-session-sharing-tabs),
approved by the merge of PR #189 at `e206d165f0f30999220922f57a3f92549c15f4cc`. The
[B5 browser timing and resume decision](https://github.com/PathableAI-org/Pre-ETS/blob/00116612c13c85457439a24937f615be72f8ad1b/docs/delivery/session-management.md#b5-browser-timing-and-resume-decision-2026-11-09)
was merged by PR #360. Current `origin/main` authority was inspected at `00116612c13c85457439a24937f615be72f8ad1b`.

### Accepted requirement coverage

| Requirement                                                                                                                                                   | Acceptance criteria in this slice                         | Feature disposition                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PREETS-SESSION-009](https://github.com/PathableAI-org/Pre-ETS/blob/00116612c13c85457439a24937f615be72f8ad1b/docs/requirements/session/PREETS-SESSION-009.md) | AC1–4                                                     | Specified in full (FR-003–FR-010), including the B5 60-second communication windows. Live renewal evidence is **incomplete** until real sessions can be established (Authority finding 1).                                                                                                           |
| [PREETS-SESSION-010](https://github.com/PathableAI-org/Pre-ETS/blob/00116612c13c85457439a24937f615be72f8ad1b/docs/requirements/session/PREETS-SESSION-010.md) | AC1–3, AC5, AC6 (in part)                                 | AC1–3 (FR-001, FR-002, FR-011, FR-012) and AC5 (FR-013–FR-015, FR-023) specified with the B5 2-second bound and resume rule (FR-017–FR-020). AC6 specified for activity and logout (FR-016). Live multi-tab evidence is **incomplete** until real sessions can be established (Authority finding 1). |
| PREETS-SESSION-010                                                                                                                                            | AC4; AC6 warning, continuation, and expiration conditions | **Deferred** to [#156](https://github.com/PathableAI-org/Pre-ETS/issues/156) (warning, Continue) and [#157](https://github.com/PathableAI-org/Pre-ETS/issues/157) (expiration), as the issue and delivery plan assign. Not specified here.                                                           |

Related constraints, not coverage claims: [PREETS-SESSION-004](https://github.com/PathableAI-org/Pre-ETS/blob/00116612c13c85457439a24937f615be72f8ad1b/docs/requirements/session/PREETS-SESSION-004.md)
(fresh entry on back/forward restoration), [PREETS-SESSION-008](https://github.com/PathableAI-org/Pre-ETS/blob/00116612c13c85457439a24937f615be72f8ad1b/docs/requirements/session/PREETS-SESSION-008.md)
(authoritative deadline and no revival),
[PREETS-SESSION-011](https://github.com/PathableAI-org/Pre-ETS/blob/00116612c13c85457439a24937f615be72f8ad1b/docs/requirements/session/PREETS-SESSION-011.md)
AC2 (policy associated with a refresh, consumed by #156),
[PREETS-SESSION-012](https://github.com/PathableAI-org/Pre-ETS/blob/00116612c13c85457439a24937f615be72f8ad1b/docs/requirements/session/PREETS-SESSION-012.md)
(expired-state presentation, owned by #157), PREETS-SESSION-013 (fresh authentication), and PREETS-HIPAA-006 AC2
(confidentiality through logout, recorded for #155 consumers without a coverage claim).

### Authorized outcome

Sharing tabs for one tenant in one browser context join one session, renew it only through intentional activity
communicated under the B5 bounds, keep each other usable past former deadlines, and lose protected access within 2
seconds of a shared logout; sessions for other tenants, browser contexts, and later sessions remain independent.

### In scope

- Browser communication of qualifying in-page activity under the B5 60-second windows, with immediate sends near the
  deadline, and immediate logout.
- Classification of qualifying activity versus pointer movement, programmatic focus, and automatic traffic.
- New-tab joining as a coordinated participant, and synchronization of the authoritative deadline and effective policy.
- No early expiration of a running tab while the server session is valid.
- An explicit, accessible logout action and shared logout across sharing tabs, with concealment within 2 seconds.
- Resume behavior across renewal and logout, and back/forward-cache restoration under SESSION-004.
- Late-activity rejection and isolation across tenants, browser contexts, and sessions for activity and logout.
- Retained multi-page semantic-control fixtures, controllable time, real protected HTTP/actions, and independent tenant
  and browser-context controls that #157 and #156 extend.

### Out of scope

- Warning presentation, Continue, warning propagation, and warning isolation (#156; SESSION-010 AC4, SESSION-011).
- Expired-state presentation, the expiration modal, expiration propagation, and expiration isolation (#157;
  SESSION-010 AC4, SESSION-012).
- Heartbeat endpoint behavior, connection-loss input handling, and any behavior when the server is unreachable at a
  local deadline or on resume (separate pending requirement).
- Backend/domain persistence and API expiration-response policy, a new absolute maximum lifetime, concrete cloud
  provider/ingress, CI cadence, arbitrary application-value storage, and undecided policy.
- Identity-provider logout and provider session termination (Authority finding 2).
- Freshness confirmation and real-provider login completion (#158).

### Dependencies and blockers

- Start prerequisites S1 (#154) and S2 (#153) are closed, and B5 is resolved by PR #360. Closure is a coordination fact,
  not requirement verification.
- #158's B6 freshness confirmation is an execution gate: until it functions, the running application cannot establish a
  real session, and the issue forbids synthetic authentication as evidence for these claims (Authority finding 1).
- #157's browser protection follows this increment and extends its fixtures with expiration and concealment; #156 then
  adds warnings and Continue. Neither is a start prerequisite.

### Authority findings

1. **Real-session execution gate (open; execution gate, not a specification blocker).**
   - _Source_: Issue #155 Evidence progression ("No synthetic authentication or disposable presentation suite
     establishes these claims"); `docs/session-state.md` and `docs/authentication.md` on `origin/main`, which record
     that the callback cannot establish a session until #158 supplies freshness confirmation; #158 is open.
   - _Ambiguity_: The observable increment requires actual sharing tabs in a real session, but the running application
     cannot yet establish one.
   - _Impact_: Every live browser claim in `verification.md` can be designed and implemented but not executed until
     #158 lands. Only HTTP classification of deliberate versus automatic requests and late-activity denial can be
     observed earlier, with prepared records limited to those steps.
   - _Decision required_: Maintainer acceptance that S3 evidence completion waits on #158, or an approved alternative.
   - _Proposals_: (A) Implement S3 now and record live evidence as incomplete until #158 functions, as S1 did. (B)
     Sequence S3 implementation after #158.
2. **Identity-provider session on logout (open; does not block this specification).**
   - _Source_: PREETS-SESSION-010 AC5 ("ends authenticated access for the shared session"); PREETS-HIPAA-006 AC2
     (confidentiality through logout and shared-device use); no accepted requirement mentions provider logout.
   - _Ambiguity_: Whether application logout must also end the user's session at the tenant identity provider.
   - _Impact_: Provider logout would add provider-specific behavior and evidence; without it, the provider session may
     remain, though B6 fresh authentication prevents it from silently restoring application access.
   - _Decision required_: Whether provider logout is required, and if so in which requirement.
   - _Proposals_: (A) S3 ends the application session only, as the requirements state (assumed by this
     specification). (B) Add provider logout through the requirements workflow as a separate decision.
3. **Presentation in tabs after logout (resolved by maintainer decision on 2026-11-09).**
   - _Source_: PREETS-SESSION-010 AC5; B5 ("Logout and expiration conceal protected content within that bound");
     issue #155 assigns expired-state presentation to #157 but assigns no logged-out presentation. Maintainer decision
     on 2026-11-09, recorded during plan review in PR #362.
   - _Ambiguity_: Beyond concealment and denial, what the logging-out tab and other sharing tabs present after logout,
     and whether they offer an explicit Log in action or start fresh entry. None remaining.
   - _Impact_: The signed-out outcome is specified in US3 scenario 6, FR-023, and SC-011.
   - _Decision required_: None.
   - _Proposals_: (A) Every sharing tab, including the one that logged out, shows an accessible signed-out notice with an
     explicit Log in action through S1's fresh-entry boundary, and authentication never starts automatically
     (**chosen**). (B) The initiating tab shows the notice and other tabs follow fresh entry on their next protected
     request (not chosen). (C) Defer the presentation to #157 (not chosen).
4. **Stale approval and pinning prose (resolved).**
   - _Source_: Issue #155 pins requirements at `cddbb741e73af8b79cdc699101c08770ddb56096`, before the B5 refinements;
     the [delivery README](https://github.com/PathableAI-org/Pre-ETS/blob/00116612c13c85457439a24937f615be72f8ad1b/docs/delivery/README.md)
     treats plans merged into `main` as reviewed.
   - _Ambiguity_: None remaining.
   - _Impact_: Requirement text is read from current `origin/main`, which carries the merged B5 decisions.
   - _Decision required_: None.
   - _Proposals_: (A) Use current `origin/main` requirement text (applied).
