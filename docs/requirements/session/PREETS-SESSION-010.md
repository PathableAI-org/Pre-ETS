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
- Decision: Maintainer direction on 2026-11-09 resolves B5 synchronization and resume. While sharing tabs run and the server is reachable, other tabs reflect a renewed deadline, logout, and expiration within 2 seconds; no tab presents expiration while the server session remains valid. On resume, a tab past its locally known deadline temporarily conceals protected content at once and confirms with the server, restoring content if the session was renewed elsewhere and entering the expired state only if it ended; otherwise it confirms with the server and conceals within 2 seconds if the session ended while suspended. See the [session delivery plan](../../delivery/session-management.md#b5-browser-timing-and-resume-decision-2026-11-09). This decision establishes no implemented or verified behavior and awaits Git/PR approval.
- Decision: Maintainer direction on 2026-11-17, during delivery of [#499](https://github.com/PathableAI-org/Pre-ETS/issues/499), amends the B5 resume rule above: "it is acceptable for this to not be a hard requirement. We can make a best effort to hide private data, but if a sleeping tab gets missed it won't be able to fetch any new information with an expired session". Concealing protected content at once on resume, in a tab past its locally known deadline, is best effort and a recorded limitation. A verification run for #499 reported, with real browser suspension, that a tab frozen while hidden can apply cross-tab updates queued while it was suspended and show protected content before its confirmation with the server answers. The guarantee is server authority: a resumed tab whose session has ended cannot obtain new protected information, because the server refuses it (PREETS-SESSION-008 AC4; AC5 below for logout). The rest of the resume rule is unchanged: the tab confirms with the server, keeps or restores its content if the session was renewed, and enters the expired state if it ended. This refinement establishes no implemented or verified behavior and is subject to Git/PR approval.

## Acceptance criteria

1. All concurrent application tabs for the same resolved tenant in the same browser context use the same application session and common idle state.
2. Opening a new application tab when a session already exists joins that session rather than establishing an independent session.
3. Qualifying activity in one tab renews authoritative expiration and prevents another inactive tab from independently expiring the still-active session.
4. Warning and expired states propagate across tabs as required by PREETS-SESSION-011 and PREETS-SESSION-012.
5. Logging out in any tab ends authenticated access for the shared session and logs out every tab sharing it; no other tab can continue protected use under the logged-out session.
6. Activity, continuation, warnings, expiration, and logout affect only the associated session. They must not renew, warn, expire, or log out a different session, including sessions for another resolved tenant or in another browser context.

## Open questions

None for synchronization timing or suspended/resumed behavior: the 2026-11-09 B5 decision above sets a 2-second bound and the resume rule, and the 2026-11-17 decision makes concealment at once on resume best effort. Server-unreachable behavior belongs to the separate pending heartbeat/connection-loss requirement. Session isolation is required by AC6 and is not an unresolved policy.

## Verification Plan

Multi-tab browser/BDD and application HTTP evidence must establish a common session and idle state, new-tab joining, cross-tab activity renewal, synchronized warning/expiration, and logout denial across all sharing tabs. Separate tenant and browser-context evidence must establish isolation for activity, continuation, warning, expiration, and logout. Adapter evidence alone does not establish browser synchronization. With controllable time, browser evidence must establish the 2-second bound for renewed deadlines and logout, that an inactive tab past its former deadline stays usable after renewal in another tab, and resume behavior for tabs suspended across renewal, logout, and expiration. For a tab resumed past its locally known deadline, concealment before server confirmation is best effort under the 2026-11-17 decision, not a required observation; evidence must instead establish that the tab confirms with the server and that, when the session has ended, it obtains no new protected information. Suspension simulated by withholding cross-tab messages does not show how a browser delivers messages queued while a tab was frozen.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
