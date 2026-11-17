---
id: PREETS-SESSION-012
classifications:
  - Functional
---

# Protected content obscured after expiration

## Description

When inactivity reaches expiration, users’ open application tabs sharing the session must enter a synchronized expired state that obscures previously rendered protected information and presents a blocking expiration modal with explicit reauthentication.

## Rationale

Server rejection alone cannot protect sensitive information already rendered, including PHI.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Browser behavior after expiration.”
- Source clarification: Maintainer direction on 2026-10-05 authorizes accessible expiration recovery, addressing the [Copilot review comment](https://github.com/PathableAI-org/Pre-ETS/pull/112#discussion_r4184264246).
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

- Decision: Maintainer direction on 2026-10-12 replaces the originally accepted expired-SSR redirect policy.
  Fresh protected-page entry through a new tab, refresh, or browser back/forward navigation without a valid
  session starts tenant OIDC directly. Already-open authenticated tabs retain the blocking expiration modal.
  Expired or missing-record protected Server Actions return HTTP 401 and display dedicated unauthenticated
  recovery content with an explanation and Login action, without automatic OIDC. Explain expiration when
  known and an unavailable session when its cause is unknown. The active modal blocks in-page navigation;
  its expiration explanation and recovery are equivalent to the Server Action recovery content.
  Rendering mechanisms belong to engineering. No expiration-recognition retention period is required by
  this policy. This refinement is subject to Git/PR approval.

- Decision: Maintainer direction on 2026-11-09 resolves B5 for expiration. Running sharing tabs conceal
  protected content within 2 seconds of authoritative expiration and never enter the expired state before the
  server session ends (wording clarified on 2026-11-16, below). On
  resume, a tab past its locally known deadline temporarily conceals protected content at once and confirms with
  the server; this temporary concealment is not the expired state, and content is restored if the session was
  renewed in another tab. Otherwise the tab confirms with the server and conceals within 2 seconds if the session
  ended while suspended. A back/forward-cache restoration with no valid session follows
  PREETS-SESSION-004's fresh-entry policy (AC2) instead of the modal. Pixels painted before page scripts run on
  resume are a recorded limitation. See the [session delivery plan](../../delivery/session-management.md#b5-browser-timing-and-resume-decision-2026-11-09). This decision establishes no implemented or verified behavior
  and awaits Git/PR approval.
- Decision: Maintainer direction on 2026-11-16 ([#444](https://github.com/PathableAI-org/Pre-ETS/issues/444),
  decision 3) clarifies the B5 wording above. What must not begin before the server session ends is the expired
  state, not concealment. A running tab that reaches its locally known deadline may temporarily conceal protected
  content while it confirms with the server, as on resume. That temporary concealment is not the expired state, and
  the tab restores its content if the server confirms the session is still valid.
- Decision: Maintainer direction on 2026-11-16 (#444, decision 2) applies AC1 to the whole document. Once the
  expired state or PREETS-SESSION-007 recovery content replaces protected content, protected text must not remain
  in the tab's document, including framework render data serialized in inline scripts. Values that remain only in
  the page's script memory, which cannot be cleared without loading a new document, are a recorded limitation.
- Decision: Maintainer direction on 2026-11-17 ([#497](https://github.com/PathableAI-org/Pre-ETS/issues/497),
  confirmed during review of [#511](https://github.com/PathableAI-org/Pre-ETS/pull/511)) removes the requirement for
  screen-reader and other assistive-technology observations because no screen-reader testing capability is
  available, and restates the assistive-technology criteria as programmatic contracts: what the markup must
  expose, verified through the accessibility tree, rather than an observed announcement. Keyboard, pointer,
  and accessibility-tree evidence remains required. It changes AC5. This refinement establishes no implemented or verified
  behavior and is subject to Git/PR approval.
- Decision: Maintainer direction on 2026-11-17, during delivery of [#499](https://github.com/PathableAI-org/Pre-ETS/issues/499),
  amends the B5 resume rule above, as recorded in PREETS-SESSION-010 and limited by the maintainer's answers to the
  review questions of [#513](https://github.com/PathableAI-org/Pre-ETS/pull/513). For a tab resumed past its locally known deadline that, before its confirmation with the server
  answers, applies cross-tab renewal messages queued while it was suspended, concealing protected content
  at once is best effort and a recorded limitation. Every other tab resumed past its locally known deadline still
  conceals at once. A tab covered by this exception that did not conceal at once enters the expired state
  within 2 seconds of resuming if the session has ended; this bound does not relieve any other tab of concealing at once. A resumed tab whose session has ended obtains no new protected information, because the
  server refuses it (PREETS-SESSION-008 AC4; PREETS-SESSION-010 AC5 for logout). This refinement establishes no
  implemented or verified behavior and is subject to Git/PR approval.

## Acceptance criteria

1. At expiration, protected information already rendered in every session-sharing tab is no longer readable.
2. The blocking expiration modal explains expiration and offers explicit authentication again; protected
   information cannot be exposed by dismissing or bypassing the modal. In-page navigation is unavailable
   while the modal is active. Existing-tab refresh and browser back/forward navigation follow
   PREETS-SESSION-004’s fresh-entry policy.
3. Expired state propagates across session-sharing tabs.
4. The modal shown in an already-open authenticated tab and PREETS-SESSION-007’s recovery content displayed after a
   protected Server Action encounters expiration convey equivalent expiration explanations and explicit recovery actions.
5. The expiration modal is exposed programmatically so that assistive technology can announce and present it: when it opens, it is exposed as a modal dialog whose accessible name identifies it and whose accessible description carries the expiration explanation, the authenticate-again action is exposed as a control with an accessible name, and focus moves into the modal. Keyboard users can activate reauthentication with visible focus. While the expired state remains, protected background information is unavailable to keyboard interaction and is not exposed in the accessibility tree.

## Open questions

None for synchronization latency or suspended/resumed protection: the 2026-11-09 B5 decision above sets the 2-second bound and resume rule, and the 2026-11-17 decision makes concealment at once on resume best effort only for a tab that applies queued renewal messages before its confirmation answers. Server-unreachable behavior belongs to the separate pending heartbeat/connection-loss requirement. Keyboard and accessibility-tree protection is required by AC5.

## Verification Plan

Browser Gherkin observes actual rendered-content concealment, blocking behavior, focus movement and visible focus, keyboard recovery, multiple tabs, and explicit recovery with controllable time. Browser evidence reads the rendered accessibility tree to establish AC5's programmatic exposure: a modal dialog whose accessible name identifies it and whose accessible description carries the expiration explanation, the authenticate-again action as a control with an accessible name, and no protected background information exposed while the expired state remains. Screen-reader and other assistive-technology observations are not required, by the 2026-11-17 maintainer decision above; the accessibility tree does not establish what a particular screen reader announces, and the contract does not claim it. Browser evidence must establish blocked in-page navigation while the modal is active and the fresh-entry
behavior of refresh and browser back/forward navigation under PREETS-SESSION-004.
Compare the already-open tab’s modal with the Server Action recovery content for equivalent expiration explanation
and recovery. Server-only denial or modal-string assertions cannot establish concealment. Concealment evidence must
show that no protected text remains in the document, inline script content included; text checks that skip scripts
cannot establish it. Script memory that cannot be cleared without a new document is a recorded limitation. With controllable time, browser evidence must establish concealment in every running sharing tab within 2 seconds of expiration, no expired state in a running tab while the session remains valid (temporary concealment at a local deadline,
followed by restoration once the server confirms the session, is not the expired state), expired-state concealment on resume, once the server confirms the session ended, for tabs suspended across expiration or logout, and, for a tab suspended past its local deadline while another tab renewed the session, server confirmation of the renewed session with its content kept or restored and without the expired state. A tab resumed past its local deadline must still be shown to conceal at once, except a tab that, before its confirmation answers, applies cross-tab renewal messages queued while it was suspended: for that tab, concealment before confirmation is best effort under the 2026-11-17 decision and not a required observation, and evidence must instead establish that it confirms with the server and that, once its session has ended, it enters the expired state within 2 seconds of resuming and obtains no new protected information. Suspension simulated by withholding cross-tab messages cannot produce that case; it needs browser evidence in which a tab of the same browser is frozen through its real lifecycle, and how to produce it reliably is an unresolved verification question. Pre-script paint is a recorded limitation.

Evidence assumptions follow the shared session context. Unresolved verification conditions follow the Open questions above; no additional operational monitoring claim is introduced.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
