---
id: PREETS-SESSION-009
classifications:
  - Functional
---

# Qualifying browser activity

## Description

Users’ intentional interaction with application controls must count as activity and be communicated to the server sufficiently to renew a still-valid session; raw pointer movement and unrelated background traffic must not keep it alive.

## Rationale

Activity should reflect use of the application rather than incidental events.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Browser-side inactivity protection.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

## Acceptance criteria

1. Intentional control activation, keyboard interaction with application controls, text entry, and touch interaction with application controls must count as qualifying activity and, when communicated to the server before expiration, renew the still-valid session.
2. Raw pointer movement alone never renews the idle deadline.
3. Automatic polling or background traffic unrelated to qualifying activity never renews the idle deadline.
4. Qualifying activity communicated after expiration does not revive authenticated access.

## Open questions

Maximum communication delay and behavior during connectivity loss need design so local activity cannot claim server-authorized access.

## Verification Plan

Browser Gherkin exercises semantic controls and raw movement with controllable time, observing authoritative renewal or expiration. HTTP/integration checks distinguish activity from background requests; merely observing a browser event or network call is insufficient.

Evidence assumptions follow the shared session context. Unresolved verification conditions follow the Open questions above; no additional operational monitoring claim is introduced.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
