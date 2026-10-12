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

Define acceptable synchronization latency and suspended/resumed tab protection. Keyboard and assistive-technology protection is required by AC5.

## Verification Plan

Browser Gherkin observes actual rendered-content concealment, blocking behavior, focus movement and visible focus, keyboard recovery, multiple tabs, and explicit recovery with controllable time. Assistive-technology observations establish expiration announcement, explanation/action availability, and inability to read or navigate protected background information. Browser evidence must establish blocked in-page navigation while the modal is active and the fresh-entry
behavior of refresh and browser back/forward navigation under PREETS-SESSION-004.
Compare the already-open tab’s modal with the Server Action recovery content for equivalent expiration explanation
and recovery. Server-only denial or modal-string assertions cannot establish concealment.

Evidence assumptions follow the shared session context. Unresolved verification conditions follow the Open questions above; no additional operational monitoring claim is introduced.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
