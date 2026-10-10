---
id: PREETS-SESSION-010
classifications:
  - Functional
---

# Shared session, idle state, and logout across tabs

## Description

All application tabs for the same resolved tenant within the same browser context must share one application session and its idle state. A newly opened tab must join the existing session when one exists. Qualifying activity in any tab must extend the session and synchronize relevant timeout state across all tabs; logging out in any tab must log out all tabs sharing that session.

## Rationale

Reading a roster in one tab must remain compatible with working in a participant tab.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Multi-tab behavior.”
- Source clarification: Maintainer review direction on 2026-10-05 requires all tabs to share the session, new tabs to join an existing session, and logout to apply across tabs. Session requirements depend on resolved tenant identity rather than the resolution mechanism.
- Source clarification: Maintainer direction on 2026-10-05 authorizes isolation between sessions and resolved tenants, addressing the [Copilot review comment](https://github.com/PathableAI-org/Pre-ETS/pull/112#discussion_r4184264108).
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

## Acceptance criteria

1. All concurrent application tabs for the same resolved tenant in the same browser context use the same application session and common idle state.
2. Opening a new application tab when a session already exists joins that session rather than establishing an independent session.
3. Qualifying activity in one tab renews authoritative expiration and prevents another inactive tab from independently expiring the still-active session.
4. Warning and expired states propagate across tabs as required by PREETS-SESSION-011 and PREETS-SESSION-012.
5. Logging out in any tab ends authenticated access for the shared session and logs out every tab sharing it; no other tab can continue protected use under the logged-out session.
6. Activity, continuation, warnings, expiration, and logout affect only the associated session. They must not renew, warn, expire, or log out a different session, including sessions for another resolved tenant or in another browser context.

## Open questions

Synchronization timing and suspended/resumed tab behavior need design. Session isolation is required by AC6 and is not an unresolved policy.

## Verification Plan

Multi-tab browser/BDD and application HTTP evidence must establish a common session and idle state, new-tab joining, cross-tab activity renewal, synchronized warning/expiration, and logout denial across all sharing tabs. Separate tenant and browser-context evidence must establish isolation for activity, continuation, warning, expiration, and logout. Adapter evidence alone does not establish browser synchronization; synchronization timing and suspended/resumed behavior remain unresolved.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
