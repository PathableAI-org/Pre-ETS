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
  protected content within 2 seconds of authoritative expiration and never before the server session ends. On
  resume, a tab past its locally known deadline temporarily conceals protected content at once and confirms with
  the server; this temporary concealment is not the expired state, and content is restored if the session was
  renewed in another tab. Otherwise the tab confirms with the server and conceals within 2 seconds if the session
  ended while suspended. A back/forward-cache restoration with no valid session follows
  PREETS-SESSION-004's fresh-entry policy (AC2) instead of the modal. Pixels painted before page scripts run on
  resume are a recorded limitation. See the [session delivery plan](../../delivery/session-management.md#b5-browser-timing-and-resume-decision-2026-11-09). This decision establishes no implemented or verified behavior
  and awaits Git/PR approval.

## Acceptance criteria

1. At expiration, protected information already rendered in every session-sharing tab is no longer readable.
2. The blocking expiration modal explains expiration and offers explicit authentication again; protected
   information cannot be exposed by dismissing or bypassing the modal. In-page navigation is unavailable
   while the modal is active. Existing-tab refresh and browser back/forward navigation follow
   PREETS-SESSION-004’s fresh-entry policy.
3. Expired state propagates across session-sharing tabs.
4. The modal shown in an already-open authenticated tab and PREETS-SESSION-007’s recovery content displayed after a
   protected Server Action encounters expiration convey equivalent expiration explanations and explicit recovery actions.
5. Assistive-technology users receive an announcement of expiration and can perceive its explanation and authenticate-again action. Focus moves into the modal; keyboard users can activate reauthentication with visible focus. Protected background information is unavailable to keyboard interaction and assistive-technology reading or navigation while the expired state remains.

## Open questions

None for synchronization latency or suspended/resumed protection: the 2026-11-09 B5 decision above sets the 2-second bound and resume rule. Server-unreachable behavior belongs to the separate pending heartbeat/connection-loss requirement. Keyboard and assistive-technology protection is required by AC5.

## Verification Plan

Browser Gherkin observes actual rendered-content concealment, blocking behavior, focus movement and visible focus, keyboard recovery, multiple tabs, and explicit recovery with controllable time. Assistive-technology observations establish expiration announcement, explanation/action availability, and inability to read or navigate protected background information. Browser evidence must establish blocked in-page navigation while the modal is active and the fresh-entry
behavior of refresh and browser back/forward navigation under PREETS-SESSION-004.
Compare the already-open tab’s modal with the Server Action recovery content for equivalent expiration explanation
and recovery. Server-only denial or modal-string assertions cannot establish concealment. With controllable time, browser evidence must establish concealment in every running sharing tab within 2 seconds of expiration, no expired state in a running tab while the session remains valid, expired-state concealment on resume for tabs suspended across expiration or logout, and, for a tab suspended past its local deadline while another tab renewed the session, temporary resume concealment followed by server confirmation of the renewed session and restoration of its content without the expired state, recording pre-script paint as a limitation.

Evidence assumptions follow the shared session context. Unresolved verification conditions follow the Open questions above; no additional operational monitoring claim is introduced.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
