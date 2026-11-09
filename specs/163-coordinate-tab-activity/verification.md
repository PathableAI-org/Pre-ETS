# Feature Verification Plan: Coordinate Intentional Activity and Logout Across Session-Sharing Tabs

**Feature specification**: [spec.md](spec.md)

**Delivery issue**: [#155 — Coordinate intentional activity and logout across session-sharing tabs](https://github.com/PathableAI-org/Pre-ETS/issues/155)

**Status**: Planned — no execution evidence is recorded by this document

## Authority and scope

This plan covers issue #155, delivery-plan slice S3, approved at `e206d165f0f30999220922f57a3f92549c15f4cc`, with the
2026-11-09 B5 browser timing and resume decision merged by PR #360. Accepted requirement text was read from
`origin/main` at `00116612c13c85457439a24937f615be72f8ad1b`: PREETS-SESSION-009 AC1–4 and PREETS-SESSION-010 AC1–3,
AC5, and AC6 for activity and logout, qualified by PREETS-SESSION-004, PREETS-SESSION-008, PREETS-SESSION-011 AC2,
and PREETS-SESSION-012.

Evidence may establish shared sessions across tabs, new-tab joining, intentional-activity classification, B5
communication windows, cross-tab renewal and synchronization, shared logout, late-activity rejection, isolation for
activity and logout, and resume across renewal and logout. It may not establish warning presentation, Continue, or
warning isolation (#156); expired-state presentation, expiration propagation, or expiration isolation (#157);
heartbeat or connection-loss behavior (separate pending requirement); provider freshness (#158); or provider logout
(Authority finding 2 in the specification).

Every live browser claim needs a real application session. Until #158's freshness confirmation lets the running
application establish one, these claims must be reported incomplete. The issue states that synthetic authentication
does not establish them; prepared session records may be used only for HTTP classification and denial steps marked
below, never as evidence of multi-tab behavior.

## Claims and traceability

| ID    | Claim to establish                                                                                                                                        | Authoritative source                                                                   | Meaningful violation                                                                                                                        | Required observation                                                                                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V-001 | Concurrent tabs for one tenant in one browser context use one session and one authoritative idle state.                                                   | SESSION-010 AC1                                                                        | Two tabs hold different sessions or independent deadlines.                                                                                  | Protected requests from each tab resolve the same session; the authoritative deadline is common to both.                                                                 |
| V-002 | A new tab joins the existing session and adopts its current deadline and policy, then participates in activity and logout.                                | SESSION-010 AC2; issue scope (join, synchronize policy)                                | A new tab starts a login, creates a second session, or starts a fresh idle period of its own.                                               | No login occurs; the new tab uses the same session and current deadline; activity and logout in it affect earlier tabs and vice versa.                                   |
| V-003 | Activity in one tab keeps an inactive sharing tab usable beyond its former deadline; no running tab expires while the server session is valid.            | SESSION-010 AC3; B5 (no early expiration)                                              | The inactive tab expires, conceals, or denies use at its former deadline although the session was renewed.                                  | Past its former deadline, the inactive tab stays usable and a protected operation from it succeeds.                                                                      |
| V-004 | Other running sharing tabs reflect a renewed deadline and its effective policy within 2 seconds of the renewal response.                                  | SESSION-010 Verification Plan; B5 (synchronization)                                    | A tab acts on a stale deadline more than 2 seconds after renewal.                                                                           | With controllable time, a tab suspended and resumed past its former deadline more than 2 seconds after renewal shows no temporary concealment; the policy matches.       |
| V-005 | Deliberate page fetches and form submissions renew on receipt; automatic polling, prefetch, and background traffic do not.                                | SESSION-009 AC1, AC3                                                                   | A prefetch, automatic refresh, or background request moves the deadline, or a deliberate fetch or submission fails to.                      | Authoritative deadline moves after each deliberate fetch or submission and stays unchanged across automatic requests through expiration.                                 |
| V-006 | Intentional control activation, typing, keyboard, touch, and user-driven focus on meaningful inputs renew a still-valid session.                          | SESSION-009 AC1                                                                        | A qualifying interaction kind never renews the deadline.                                                                                    | Each kind, performed alone, renews the authoritative deadline within the B5 bound.                                                                                       |
| V-007 | Raw pointer movement and programmatic focus alone never renew.                                                                                            | SESSION-009 AC1, AC2                                                                   | Pointer movement or programmatic focus alone moves the deadline.                                                                            | With only those events, the session reaches its deadline and access ends.                                                                                                |
| V-008 | In-page activity follows the B5 windows: immediate when no communication in 60 seconds (any tab), coalesced within a window, immediate near the deadline. | SESSION-009 B5 decision and Verification Plan                                          | An interaction waits more than 60 seconds; a window opening or near-deadline interaction is delayed; repeated interaction is not coalesced. | Immediate renewal for window-opening and near-deadline interaction, including in another tab; one renewal for repeated interaction, including after the first completes. |
| V-009 | Activity communicated at or after expiration or logout does not revive authenticated access.                                                              | SESSION-009 AC4; SESSION-008 (no revival)                                              | Late or queued activity restores protected access.                                                                                          | After expiry or logout, late activity leaves protected requests denied.                                                                                                  |
| V-010 | An accessible logout is available; logout is sent immediately, ends the shared session, and denies protected requests from every sharing tab.             | SESSION-010 AC5; B5 (logout never coalesced)                                           | Logout is unreachable by keyboard, delayed, or leaves any tab able to perform protected requests or operations.                             | Keyboard logout with visible focus; every former sharing tab's protected page requests and operations are denied with no effect.                                         |
| V-011 | Other running sharing tabs conceal protected content, visually and from keyboard and assistive technology, within 2 seconds of logout.                    | SESSION-010 AC5 and Verification Plan; B5 (logout concealment)                         | Protected content remains readable or reachable in another tab more than 2 seconds after the server ends the session.                       | Within 2 seconds, each other tab shows no readable protected content and none is exposed through the accessibility tree or keyboard focus.                               |
| V-012 | Activity and logout affect only the associated session, not another tenant's, another browser context's, or a later session.                              | SESSION-010 AC6 (activity, logout)                                                     | Activity or logout in one session renews or ends another.                                                                                   | Other sessions' deadlines and access are unchanged; stale activity after re-login does not renew the new session.                                                        |
| V-013 | A resumed tab past its known deadline conceals at once, confirms, and restores content when the session was renewed elsewhere.                            | B5 (resume); SESSION-010 Verification Plan                                             | Protected content shows before confirmation, or a valid session is presented as expired.                                                    | Immediate concealment on resume, then restored content and current deadline, with no expired state.                                                                      |
| V-014 | A resumed tab across logout conceals within B5 bounds; a back/forward-restored page without a session follows fresh entry.                                | B5 (resume); SESSION-004 AC1; SESSION-012 AC2                                          | Protected content remains usable after resume, or history restoration shows an expiration modal instead of fresh entry.                     | Concealment within 2 seconds (or immediately when past deadline); no protected use; back/forward restore leads to tenant sign-in.                                        |
| V-015 | Undeterminable session state during confirmation, resume, or logout fails closed and is never reported as a valid session or completed logout.            | Issue scope; SESSION-008 (server authority)                                            | A tab presents the session as valid, or logout as complete, when the server could not confirm.                                              | Protected access unavailable; no false success outcome. Server-unreachable behavior is recorded as out of scope.                                                         |
| V-016 | Logout, denial, concealment, and coordination reveal no protected content, references, tokens, or internals, and carry nothing across sessions.           | Constitution Principle III; SESSION-010 AC6                                            | Another tenant or context receives coordination data, or an outcome reveals a reference or token.                                           | Inspection of tab-visible outcomes and cross-context observations shows no such data.                                                                                    |
| V-017 | After logout, every sharing tab shows an accessible signed-out notice with an explicit Log in action, and no tab starts authentication automatically.     | SESSION-010 AC5; maintainer decision 2026-11-09 (spec Authority finding 3, proposal A) | A tab shows no notice, the notice is not announced or keyboard-operable, or any tab redirects to sign-in on its own.                        | Each tab shows the notice, assistive technology announces it, Log in is focusable and reaches tenant sign-in only when activated.                                        |

## Automated behavioral evidence

| Claim IDs                  | Evidence boundary                                                           | Planned scenario or property                                                                                                                                                                                                                                                  | Why this boundary is meaningful                                                               | Known limits                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| V-005, V-009               | Running application HTTP boundary with authoritative deadline observation   | Send deliberate document fetches and form submissions, and automatic-style requests (prefetch, refresh, subresource), and compare the authoritative deadline; send activity after expiry and after invalidation and assert denial.                                            | Distinguishes deliberate from automatic traffic where the server decides renewal.             | Prepared records only for classification and denial; does not establish browser-side classification of in-page interaction.    |
| V-001–V-004, V-006–V-008   | Multi-tab real-browser journeys with controllable time, real session        | In one browser context, open sharing tabs on multi-page semantic-control fixtures; perform each qualifying and excluded interaction; advance time to window boundaries and near the deadline; observe the authoritative deadline and tab usability.                           | Only a real browser exercises event classification, tab communication, and timing together.   | **Gated on #158.** A browser event or network call alone is not renewal evidence; the authoritative deadline must be observed. |
| V-010, V-011, V-017        | Multi-tab real-browser logout with protected operations                     | Log out from one tab by keyboard; measure concealment in each other tab against the server's session end; attempt protected page requests and operations from every tab; inspect the accessibility tree and the signed-out notice; assert no automatic navigation to sign-in. | Observes concealment and denial where users and assistive technology meet them.               | **Gated on #158.** Does not establish provider logout (Authority finding 2).                                                   |
| V-012, V-016               | Independent tenants and browser contexts                                    | Hold tenant-A and tenant-B sessions in one context and a tenant-A session in a second context; interact and log out in one at a time; log out and log in again, then release stale activity; compare deadlines and access.                                                    | Isolation failures appear only with genuinely concurrent independent sessions.                | **Gated on #158.** Warning, continuation, and expiration isolation belong to #156/#157.                                        |
| V-013, V-014               | Browser lifecycle simulation: visibility, freeze/resume, back/forward cache | Suspend a tab across renewal and across logout in another tab, with its local deadline passed and not passed; resume and observe concealment, confirmation, and restoration; restore a page from history without a session.                                                   | Suspended tabs miss coordination, so resume is the only point where stale state is corrected. | **Gated on #158.** Pre-script paint on resume is outside application control. Resume across expiration is #157's.              |
| V-015                      | Controlled real-store unavailability                                        | Make session state undeterminable during deadline confirmation, resume, and logout; assert fail-closed and no false success; restore readiness.                                                                                                                               | A real dependency failure tests what a canned absence cannot.                                 | Does not define server-unreachable presentation, which belongs to the pending connection-loss requirement.                     |
| V-002, V-003, V-009, V-010 | Requirements-backed BDD with feature-level `@partial`                       | Tag scenarios with current-main `@preets-session-009` and `@preets-session-010` where assertions stay within those criteria; mark the feature `@partial` while SESSION-010 AC4 and the AC6 warning/expiration conditions remain with #156/#157.                               | Stakeholder-readable evidence through the running application.                                | Timing bounds and resume cases may need non-BDD browser evidence. Dry-run discovery is not execution.                          |

Requirements-backed BDD scenarios must use requirement versions from current `origin/main`, carry requirement-ID
tags, and use feature-level `@partial` when the feature supplies only intermediate evidence. A dry run establishes
discovery only, not runtime behavior.

## Agent-executable manual feature verification _(mandatory)_

### Purpose

Observe, as a person working across real tabs would, that the composed experience holds together: a roster tab stays
usable while work happens in a participant tab, logout from one tab visibly and audibly removes protected content
from others, and a returning tab never flashes content from an ended session. This adds rendered-experience,
screen-reader, focus, and perceived-timing observations that automated deadline assertions do not supply.

### Prerequisites

- A clean checkout at the exact revision under assessment.
- The repository's distributed session store and local OIDC provider running with readiness confirmed.
- A functioning B6 freshness confirmation (#158) so a real session can be established. If absent, record steps 3–10
  as incomplete and run only step 2.
- Two distinguishable synthetic tenants with a short idle timeout permitted by tenant policy, and a synthetic provider
  user; no production credentials, PHI, or client data.
- Browser automation able to open several tabs per context and several contexts (for example Playwright), to control
  page time and lifecycle (visibility, freeze, back/forward), and to read the accessibility tree.
- A way to read the authoritative session deadline for an owned session without exposing its reference.

### Procedure

1. Record revision, date/time, service versions, tenant aliases, idle timeout, and the B5 and B6 decisions in force.
2. (Ungated) With a prepared session record used only for classification, send one deliberate document fetch and one
   prefetch-style request; record the authoritative deadline after each. Remove the record.
3. Sign in to tenant A in context 1. Open a roster-style page in tab 1 and a participant-style page in tab 2. Record
   that tab 2 needed no login and that both report the same deadline.
4. Type in a field on tab 2 at intervals inside one 60-second window, then once more within 60 seconds of the deadline.
   Record when each renewal reaches the server. Leave tab 1 untouched past its former deadline; record that it stays
   usable and that a protected operation from it succeeds.
5. Move the pointer over tab 1 only, and trigger a programmatic focus change, until the deadline passes. Record that
   access ends.
6. Sign in again. Hide tab 2, renew from tab 1 past tab 2's known deadline, then show tab 2. Record immediate
   concealment, then restored content with no expired state.
7. Open a third tab and confirm it joins. With a screen-reader view of tabs 1 and 2, log out from tab 3 using the
   keyboard only. Record focus visibility on logout, the time to concealment in tabs 1 and 2, the accessibility tree
   after concealment, the signed-out notice and its announcement in every tab, that no tab navigates to sign-in on
   its own, and the denial of a protected operation from each tab. Activate Log in in one tab by keyboard and record
   that tenant sign-in starts.
8. Sign in to tenant A in context 1 and tenant B in context 1, and tenant A in context 2. Interact and log out in
   tenant A context 1 only; record that the other two sessions keep their deadlines and protected access.
9. In context 1, queue activity in a tab, log out from another tab, sign in again in a third, and then let the queued
   activity send. Record that the new session's deadline is unchanged by it.
10. Navigate away from a protected page, log out from another tab, then use browser back. Record concealment during
    confirmation and that tenant sign-in starts rather than an expiration modal.
11. Remove only owned session and transaction keys, close browser contexts, stop processes started here, and record
    cleanup. Never flush a shared store.

### Expected observations

- Deliberate fetches renew; prefetch-style traffic does not (V-005).
- Tabs share one session and deadline; a new tab joins; an inactive tab outlives its former deadline after activity
  elsewhere (V-001–V-003).
- Window-opening and near-deadline typing renew immediately; repeated typing in a window renews once within 60
  seconds (V-006, V-008).
- Pointer movement and programmatic focus alone let the session end (V-007).
- A resumed tab conceals and then restores when renewed elsewhere (V-004, V-013).
- Keyboard logout conceals other tabs within 2 seconds, leaves nothing readable to assistive technology, and every tab
  is denied protected operations (V-010, V-011).
- Every tab shows an announced signed-out notice; sign-in starts only from its Log in action (V-017).
- Other tenants, contexts, and later sessions are unaffected (V-012, V-016).
- History restoration after logout starts sign-in (V-014).

### Evidence to retain

- Revision, environment, tenant aliases, idle timeout, decision references, bounded actions, measured renewal and
  concealment times, accessibility-tree summaries, focus observations, deadline comparisons, cleanup result,
  per-claim disposition, and limitations. Never cookie values, tokens, session references, or store contents.

## Operational observability verification

No operational observability claim in this slice. PREETS-SESSION-009 and PREETS-SESSION-010 state that no additional
operational observability obligation is established. An empty log, trace, metric, Loki, or Prometheus result is not
evidence of correct coordination. Temporary diagnostic probes used during implementation must be removed before
completion; do not retain durable tests of telemetry output or exporter behavior.

## Environment and data controls

- Synthetic tenants, users, and safe synthetic protected operations only; no PHI, production credentials, client
  records, or identifying partner names.
- Owned session and OIDC transaction key prefixes per execution; remove only owned keys; never flush a shared store.
- Do not retain cookie values, provider tokens, callback parameters, credentials, references, or record contents.
- Prepared session records are limited to HTTP classification and denial; they never stand in for login or multi-tab
  behavior.
- A store outage exercise must restore the dependency and readiness before later steps.
- Controllable time and lifecycle simulation are recorded as conditions of every timing observation.

## Evidence retention and reporting

Execution results are recorded separately from this plan, in the feature's later evidence record, with revision,
environment, conditions, observations by claim ID, pass/fail/incomplete result, cleanup, and limitations. Issue
closure, merge, generated scenarios, dry runs, and static checks are not requirement verification.

## Limitations and incomplete claims

- V-001–V-004 and V-006–V-017 remain incomplete until #158's freshness confirmation permits real session
  establishment; only the HTTP classification part of V-005 and the denial part of V-009 can be observed earlier.
- SESSION-010 AC4 and the AC6 warning, continuation, and expiration conditions are deferred to #156 and #157.
- Resume across expiration entering the expired state, and the expiration modal, belong to #157.
- Provider logout awaits Authority finding 2.
- Server-unreachable behavior at a local deadline or on resume belongs to the separate pending heartbeat/connection-loss
  requirement.
- Pixels painted by the browser or operating system before page scripts run on resume are outside application control.
- Microsoft compatibility remains unexecuted.
- No procedure in this plan was executed during specification.

## Readiness review

- [x] Every feature claim maps to an authoritative source.
- [x] Successful, failure, rejection, security/privacy, accessibility, and operational outcomes are covered where applicable.
- [x] The manual feature procedure is non-empty, executable by an agent, and adds a distinct observation.
- [x] Environmental prerequisites, evidence retention, cleanup, and limitations are explicit.
- [x] Planned evidence is not described as executed or verified.
- [x] No implementation architecture is required to understand the feature claims.
