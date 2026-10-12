---
id: PREETS-SESSION-008
classifications:
  - Functional
---

# Server-authoritative tenant idle timeout

## Description

Authenticated users must be subject to the tenant’s configured whole-minute idle timeout from 5 through
30 inclusive, defaulting to 30 minutes when omitted; the server must enforce expiration independently
of browser timers.

## Rationale

A browser cannot grant access after the authoritative deadline.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Server-authoritative idle timeout.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

- Decision: Maintainer direction on 2026-10-12 selects an effective 30-minute idle timeout when the tenant
  omits the setting. Explicit invalid values remain rejected rather than replaced by the default. This
  refinement is subject to Git/PR approval.

- Decision: Maintainer direction on 2026-10-12 applies the tenant configuration in effect when the server
  refreshes the authoritative session timer. Existing sessions adopt timeout and warning changes gradually
  as their timers are refreshed, rather than retaining an authentication-time policy snapshot. The maintainer
  accepts temporary differences because tenant configuration changes rarely. This refinement is subject to
  Git/PR approval.

## Acceptance criteria

1. Tenant idle timeout accepts whole minutes 5 through 30 inclusive and rejects explicit values outside that
   domain. An omitted setting yields an effective 30-minute idle timeout; invalid explicit values do not
   silently use the default.
2. A new authenticated session has an idle expiration derived from the configured interval.
3. Before the currently authoritative expiration, receipt of an authenticated request representing qualifying
   activity refreshes expiration using the tenant’s effective configuration at that time. Timeout and warning
   policy changes take effect for that session on this refresh; existing sessions need not change simultaneously.
4. At or after expiration, requests cannot revive the session or obtain protected access, even if browser timers are disabled.
5. Traffic not caused by qualifying user activity does not extend the idle deadline (see PREETS-SESSION-009).

## Open questions

None for timeout defaults, gradual live-policy propagation, or activity classification. PREETS-SESSION-009
defines deliberate requests and meaningful input interaction as qualifying activity; automatic background
traffic does not qualify. Activity communication delay remains open under PREETS-SESSION-009; heartbeat and connection-loss input
behavior are assigned to a separate pending requirement by the maintainer.

## Verification Plan

External configuration assessment and application HTTP evidence must establish the whole-minute interval domain, the 30-minute omitted-setting default, rejection of invalid explicit
values without default substitution, initial and renewed deadlines, no revival at or after expiration, and enforcement independent of browser timers. Evidence must include cross-instance and concurrent renewal/expiration conditions and distinguish qualifying activity from background traffic. Internal transformation evidence alone does not establish stored enforcement or protected access. Evidence must include changes to tenant timeout and warning policy between server timer refreshes: an
unrefreshed session retains its established deadline, while a qualifying refresh before that deadline applies
the then-effective policy. Exercise independently active sessions adopting the change at different refreshes
and establish that a later configuration increase cannot revive a session already expired under its
authoritative deadline. Temporary policy differences during this gradual propagation are accepted, not a
claim of simultaneous configuration rollout.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
