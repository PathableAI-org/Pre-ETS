---
id: PREETS-SESSION-011
classifications:
  - Functional
---

# Configurable shared pre-expiration warning

## Description

When the pre-expiration warning is enabled, users must receive a blocking warning modal across open
session-sharing tabs at the tenant-configured threshold before idle expiration, with an explicit action to
continue the session. If warning configuration is omitted, the warning occurs five minutes before expiration
for idle timeouts greater than five minutes; for a five-minute idle timeout, the warning is disabled by default.
The warning setting expresses whole minutes before expiration. An explicit `0` disables the warning at any
idle timeout; nonzero settings must be positive integers less than the effective tenant idle timeout.

## Rationale

A person reading without interacting needs an opportunity to keep working.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Pre-expiration warning.”
- Source clarification: Maintainer direction on 2026-10-05 authorizes accessible blocking warning behavior, addressing the [Copilot review comment](https://github.com/PathableAI-org/Pre-ETS/pull/112#discussion_r4184264296).
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

- Decision: Maintainer direction on 2026-10-12 defaults the warning threshold to five minutes before idle
  expiration and disables the warning by default when the effective idle timeout is five minutes. This
  qualifies the original unconditional warning obligation and is subject to Git/PR approval.

- Decision: Maintainer direction on 2026-10-12 applies the tenant configuration in effect when the server
  refreshes the authoritative session timer. Existing sessions adopt timeout and warning changes gradually
  as their timers are refreshed, rather than retaining an authentication-time policy snapshot. The maintainer
  accepts temporary differences because tenant configuration changes rarely. This refinement is subject to
  Git/PR approval.

- Decision: Maintainer direction on 2026-10-12 selects `0` as an explicit warning-disable value at any
  permitted idle timeout. Disabling the warning leaves session expiration and expired-session protection
  unchanged. This refinement is subject to Git/PR approval.

- Decision: Maintainer direction on 2026-10-12 confirms nonzero warning values are positive integers
  expressing minutes before expiration and must be less than the effective tenant idle timeout. Invalid
  values cause rejection of the tenant configuration as invalid, following PREETS-TENANT-004’s existing
  schema-invalid selected-file policy, rather than default substitution. The refinement is subject to Git/PR approval.

## Acceptance criteria

1. The warning setting expresses minutes before idle expiration. An explicit `0` disables the warning at
   any permitted idle timeout. Any nonzero explicit value must be a positive integer strictly less than the
   effective tenant idle timeout; otherwise the server rejects the tenant configuration as invalid under
   PREETS-TENANT-004, without substituting the default. When warning configuration is omitted, an effective
   idle timeout greater than five minutes yields a warning five minutes before expiration; an effective
   five-minute timeout yields no warning. Disabled warnings do not disable authoritative expiration.
2. When the warning is enabled, all open tabs sharing the session display the blocking warning at its threshold.
   A server refresh of the authoritative session timer adopts the tenant’s effective warning policy at that
   time; sharing tabs use the policy and deadline associated with that refresh. Configuration changes need
   not affect all sessions simultaneously.
3. Activating Continue or Keep working before expiration constitutes qualifying activity, renews the authoritative deadline, and dismisses warnings across the other tabs.
4. A continuation reaching the server at or after expiration cannot restore the expired session.
5. Assistive-technology users receive an announcement of the warning and can perceive its explanation and Continue action. Focus moves into the warning when it opens; keyboard users can activate Continue with visible focus. While the warning is blocking, focus and interaction cannot reach background application content. After successful continuation, focus returns to an appropriate application control.

## Open questions

None for warning defaults, value domain, disabling, or gradual live-policy propagation. Cross-tab timing and
suspended/resumed behavior remain decisions under PREETS-SESSION-010 and PREETS-SESSION-012.

## Verification Plan

Configuration-boundary and application/browser evidence establish the omitted-warning default across
allowed idle intervals, including a 30-minute default timeout warning at 25 minutes of inactivity and no
pre-expiration warning at a five-minute timeout. Explicit `0` must suppress warnings at any permitted idle
interval while retaining authoritative expiration, protected-content concealment, and explicit recovery.
Verify that default-disabled warnings also retain normal expiration. Configuration evidence must establish the whole-minute lead-time domain, including positive integers below
the effective timeout, and rejection of negative, fractional, nonnumeric, and equal-to-or-greater-than-timeout
values. Actual tenant-consuming application requests must demonstrate schema-invalid tenant rejection under
PREETS-TENANT-004, with no default substitution or fallback. Enabled warnings must occur at the accepted lead
time before expiration. Browser Gherkin uses controllable time to establish focus movement into the warning, visible focus, keyboard continuation, blocked background interaction, appropriate focus restoration, cross-tab dismissal, and authoritative renewal. Supplement browser assertions with assistive-technology observations of warning announcement and accessible explanation/action. Integrated boundary checks cover late continuation races. Application and multi-tab evidence must establish
adoption of changed warning settings on an authoritative server timer refresh, including transitions into
or out of disabled warnings through explicit `0` and the five-minute-timeout default. Independent sessions may retain
different settings until their respective refreshes, as explicitly accepted by the maintainer.

Evidence assumptions follow the shared session context. Unresolved verification conditions follow the Open questions above; no additional operational monitoring claim is introduced.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
