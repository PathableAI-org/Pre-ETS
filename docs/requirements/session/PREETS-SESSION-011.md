---
id: PREETS-SESSION-011
classifications:
  - Functional
---

# Configurable shared pre-expiration warning

## Description

Users must receive a blocking warning modal across open session-sharing tabs at the tenant-configured warning threshold before idle expiration, with an explicit action to continue the session.

## Rationale

A person reading without interacting needs an opportunity to keep working.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Pre-expiration warning.”
- Source clarification: Maintainer direction on 2026-10-05 authorizes accessible blocking warning behavior, addressing the [Copilot review comment](https://github.com/PathableAI-org/Pre-ETS/pull/112#discussion_r4184264296).
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

## Acceptance criteria

1. Tenant warning configuration places the warning strictly before idle expiration; invalid thresholds are rejected.
2. At the warning threshold, all open tabs sharing the session display the blocking warning.
3. Activating Continue or Keep working before expiration constitutes qualifying activity, renews the authoritative deadline, and dismisses warnings across the other tabs.
4. A continuation reaching the server at or after expiration cannot restore the expired session.
5. Assistive-technology users receive an announcement of the warning and can perceive its explanation and Continue action. Focus moves into the warning when it opens; keyboard users can activate Continue with visible focus. While the warning is blocking, focus and interaction cannot reach background application content. After successful continuation, focus returns to an appropriate application control.

## Open questions

Threshold representation, minimum lead time, default/omission behavior, and warning policy changes during a live session need product review.

## Verification Plan

Configuration-boundary validation checks warning-before-expiry. Browser Gherkin uses controllable time to establish focus movement into the warning, visible focus, keyboard continuation, blocked background interaction, appropriate focus restoration, cross-tab dismissal, and authoritative renewal. Supplement browser assertions with assistive-technology observations of warning announcement and accessible explanation/action. Integrated boundary checks cover late continuation races.

Evidence assumptions follow the shared session context. Unresolved verification conditions follow the Open questions above; no additional operational monitoring claim is introduced.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
