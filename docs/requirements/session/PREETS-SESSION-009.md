---
id: PREETS-SESSION-009
classifications:
  - Functional
---

# Qualifying browser activity

## Description

Deliberate authenticated application requests, including fetching a page or submitting a form, and intentional
interaction with meaningful application inputs must count as activity and be communicated to the server
sufficiently to renew a still-valid session. Meaningful interaction includes clicks, typing, and user-driven
focus changes. Mouse movement and unrelated automatic background traffic must not keep the session alive.

## Rationale

Activity should reflect use of the application rather than incidental events.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Browser-side inactivity protection.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

- Decision: Maintainer direction on 2026-10-12 counts all deliberate authenticated requests, including page
  fetching and form submission, plus meaningful input interaction such as clicks, typing, and focus changes.
  Mouse movements do not count. Focus activity is user-driven; automatic or programmatic focus changes and
  background requests do not establish deliberate interaction. This refinement is subject to Git/PR approval.

- Scope decision: Maintainer direction on 2026-10-12 assigns heartbeat endpoint behavior and disabling
  input when the connection drops to a separate pending requirement. No ID or reviewed contract for that
  requirement was supplied here. This contract does not define heartbeat, connection-loss input handling,
  or an offline browser-expiration policy; existing server-authoritative expiration remains binding.

- Decision: Maintainer direction on 2026-11-09 resolves B5 activity communication delay. In-page qualifying
  interaction is communicated in 60-second windows measured from the session's most recent in-page activity
  communication: interaction with no such communication in the previous 60 seconds is sent immediately and opens
  a window; interaction within an open window is coalesced and sent when it ends; interaction when the
  authoritative deadline is less than 60 seconds away is sent immediately. Continue and logout are never coalesced. See the
  [session delivery plan](../../delivery/session-management.md#b5-browser-timing-and-resume-decision-2026-11-09). This decision establishes no implemented or verified behavior and awaits Git/PR approval.

## Acceptance criteria

1. Deliberate authenticated requests, including page fetching and form submission, plus intentional control
   activation, keyboard interaction, text entry, touch interaction, and user-driven focus changes involving
   meaningful application inputs must count as qualifying activity. When received by the server before
   expiration, this activity renews the still-valid session. Programmatic focus changes alone do not qualify.
2. Raw pointer movement alone never renews the idle deadline.
3. Automatic polling or background traffic unrelated to qualifying activity never renews the idle deadline.
4. Qualifying activity communicated after expiration does not revive authenticated access.

## Open questions

None for activity communication delay: the 2026-11-09 B5 decision above bounds it at 60 seconds. Heartbeat
and connection-loss input behavior belong to a separate pending requirement described by the maintainer;
no offline UI policy is adopted here. Local activity alone does not grant server-authorized access.

## Verification Plan

Browser Gherkin exercises semantic controls and raw movement with controllable time, observing authoritative renewal or expiration. HTTP/application evidence must distinguish deliberate page fetches and form submissions from automatic
background requests. Browser evidence must establish authoritative renewal from meaningful clicks, typing,
keyboard/touch interaction, and user-driven focus changes, including exclusion of programmatic focus changes
and raw mouse movement. With controllable time, browser evidence must establish that interaction with no in-page
activity communication in the previous 60 seconds, including interaction in another sharing tab, and interaction
within 60 seconds of the deadline renew immediately; that repeated interaction within an open window, including
interaction after its first renewal completes, is coalesced; and that coalesced interaction renews no later than
60 seconds after it occurs. Merely observing a browser event or network call is insufficient.

Evidence assumptions follow the shared session context. Connectivity-loss input and heartbeat evidence
belong to the separate pending requirement and are not claimed by this contract. Unresolved verification conditions follow the Open questions above; no additional operational monitoring claim is introduced.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
