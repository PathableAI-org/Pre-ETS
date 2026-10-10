---
id: PREETS-SESSION-008
classifications:
  - Functional
---

# Server-authoritative tenant idle timeout

## Description

Authenticated users must be subject to the tenant’s configured whole-minute idle timeout from 5 through 30 inclusive; the server must enforce expiration independently of browser timers.

## Rationale

A browser cannot grant access after the authoritative deadline.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Server-authoritative idle timeout.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

## Acceptance criteria

1. Tenant idle timeout accepts whole minutes 5 through 30 inclusive and rejects values outside that domain.
2. A new authenticated session has an idle expiration derived from the configured interval.
3. Before expiration, receipt of an authenticated request representing activity advances expiration by that interval.
4. At or after expiration, requests cannot revive the session or obtain protected access, even if browser timers are disabled.
5. Traffic not caused by qualifying user activity does not extend the idle deadline (see PREETS-SESSION-009).

## Open questions

Default when omitted and policy changes during live sessions remain undecided. Classify authenticated activity requests versus background/status traffic without treating every authenticated network request as activity.

## Verification Plan

External configuration assessment and application HTTP evidence must establish the whole-minute interval domain, initial and renewed deadlines, no revival at or after expiration, and enforcement independent of browser timers. Evidence must include cross-instance and concurrent renewal/expiration conditions and distinguish qualifying activity from background traffic. Internal transformation evidence alone does not establish stored enforcement or protected access. Defaults and live policy changes remain unresolved.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
