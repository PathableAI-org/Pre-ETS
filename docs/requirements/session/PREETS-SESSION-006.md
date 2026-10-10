---
id: PREETS-SESSION-006
classifications:
  - Functional
---

# Shared transient session storage

## Description

Application consumers must be able to store arbitrary session-associated values transiently and retrieve consistent session state across horizontally scaled application instances without affinity to one instance.

## Rationale

Session correctness must survive request routing between instances.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Session storage and horizontal scaling.”
- Source clarification: Maintainer direction on 2026-10-05 authorizes cross-instance application-value retrieval, addressing the [Copilot review comment](https://github.com/PathableAI-org/Pre-ETS/pull/112#discussion_r4184264204).
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

## Acceptance criteria

1. A session-associated application value stored through one application instance can be retrieved with the same value through another instance during the session lifetime, without affinity to the writing instance.
2. A session established on one instance is recognized with the same user and tenant state on another instance.
3. An activity update or expiration enforced by one instance is honored by another; requests need not return to the previous instance.

## Open questions

Supported value representation, capacity, transient retention, and consistency guarantees under concurrent operations need design.

## Verification Plan

Multi-instance application evidence must establish retrieval of independently expected session-associated values across instances and consistent authentication, renewal, expiration, and protected access without affinity. Same-process or test-owned maps do not establish horizontal consistency. Supported value representation and concurrency/retention guarantees remain unresolved and limit the evidence conditions.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
