---
id: PREETS-SESSION-006
classifications:
  - Functional
---

# Shared transient session storage

## Description

Application instances must use distributed transient session storage and retrieve consistent session state
across horizontally scaled instances without affinity to one instance. Other requirements define the
session contents needed by their behavior; this contract does not define a general-purpose application-value
representation or capacity policy.

## Rationale

Session correctness must survive request routing between instances.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Session storage and horizontal scaling.”
- Source clarification: Maintainer direction on 2026-10-05 authorizes cross-instance application-value retrieval, addressing the [Copilot review comment](https://github.com/PathableAI-org/Pre-ETS/pull/112#discussion_r4184264204).
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

- Decision: Maintainer direction on 2026-10-12 narrows this contract to distributed session storage. Later
  requirements will define additional session contents; value representation and capacity do not belong in
  this contract. This supersedes the earlier arbitrary application-value obligation while retaining
  cross-instance identity, activity, and expiration guarantees. The refinement is subject to Git/PR approval.

## Acceptance criteria

1. Session state is held in distributed storage shared by application instances; requests can use that state
   through different instances without affinity to the instance that established it.
2. A session established on one instance is recognized with the same user and tenant state on another instance.
3. An activity update or expiration enforced by one instance is honored by another; requests need not return to the previous instance.

## Open questions

None for distributed-storage scope. Other requirements define required session contents and behavioral
constraints. Engineering selects storage mechanics that preserve those obligations, including expiration
and cross-instance consistency; this contract does not add a general-purpose value or retention policy.

## Verification Plan

Multi-instance application evidence must establish shared session recognition and consistent authentication,
renewal, expiration, and protected access without affinity. Establish a session through one independently
running application instance and use its identity through another; activity and expiration on one instance
must be honored by another, including concurrent renewal/expiration conditions governed by PREETS-SESSION-008.
Same-process or test-owned maps do not establish distributed consistency. Additional application-value
contents require their own requirements and evidence; no general-purpose serialization or capacity claim
is established here.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
