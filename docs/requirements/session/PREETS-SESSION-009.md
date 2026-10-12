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

## Acceptance criteria

1. Deliberate authenticated requests, including page fetching and form submission, plus intentional control
   activation, keyboard interaction, text entry, touch interaction, and user-driven focus changes involving
   meaningful application inputs must count as qualifying activity. When received by the server before
   expiration, this activity renews the still-valid session. Programmatic focus changes alone do not qualify.
2. Raw pointer movement alone never renews the idle deadline.
3. Automatic polling or background traffic unrelated to qualifying activity never renews the idle deadline.
4. Qualifying activity communicated after expiration does not revive authenticated access.

## Open questions

Maximum activity communication delay remains an engineering/requirements decision to resolve. Heartbeat
and connection-loss input behavior belong to a separate pending requirement described by the maintainer;
no offline UI policy is adopted here. Local activity alone does not grant server-authorized access.

## Verification Plan

Browser Gherkin exercises semantic controls and raw movement with controllable time, observing authoritative renewal or expiration. HTTP/application evidence must distinguish deliberate page fetches and form submissions from automatic
background requests. Browser evidence must establish authoritative renewal from meaningful clicks, typing,
keyboard/touch interaction, and user-driven focus changes, including exclusion of programmatic focus changes
and raw mouse movement. Merely observing a browser event or network call is insufficient.

Evidence assumptions follow the shared session context. Connectivity-loss input and heartbeat evidence
belong to the separate pending requirement and are not claimed by this contract. Unresolved verification conditions follow the Open questions above; no additional operational monitoring claim is introduced.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
