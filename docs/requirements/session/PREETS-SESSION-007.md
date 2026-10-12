---
id: PREETS-SESSION-007
classifications:
  - Functional
---

# Explicit recovery for expired or missing sessions

## Description

When a protected frontend Server Action encounters an expired session or a missing session record, it must
return HTTP 401, deny the protected operation, and display dedicated unauthenticated recovery content with
an explanation and an explicit Login action. This outcome does not require an HTTP redirect or a particular
rendering mechanism.
New-tab entry, existing-tab refresh, and browser back/forward navigation to a protected page follow
PREETS-SESSION-004’s fresh-entry flow instead.

## Rationale

The browser timer normally explains expiration through a modal. Server enforcement must still deny an
expired action and provide understandable recovery when that action reaches the server before the modal
prevents interaction, or when browser timers do not run as expected.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Authentication and protected resources; Server-authoritative idle timeout.”
- Source clarification: Maintainer direction on 2026-10-05 authorizes accessible expiration recovery, addressing the [Copilot review comment](https://github.com/PathableAI-org/Pre-ETS/pull/112#discussion_r4184264246).
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

- Decision: Maintainer direction on 2026-10-12 replaces the originally accepted expired-SSR redirect policy.
  Fresh protected-page entry through a new tab, refresh, or browser back/forward navigation without a valid
  session starts tenant OIDC directly. Already-open authenticated tabs retain the blocking expiration modal.
  Expired or missing-record protected Server Actions return HTTP 401 and display dedicated unauthenticated
  recovery content with an explanation and Login action, without automatic OIDC. Explain expiration when
  known and an unavailable session when its cause is unknown. The active modal blocks in-page navigation;
  its expiration explanation and recovery are equivalent to the Server Action recovery content.
  Rendering mechanisms belong to engineering. No expiration-recognition retention period is required by
  this policy. This refinement is subject to Git/PR approval.

## Acceptance criteria

1. A protected Server Action encountering an expired session or missing session record returns actual HTTP
   401, does not execute its protected operation, and displays dedicated unauthenticated recovery content
   without automatically initiating OIDC. An HTTP redirect is not required.
2. The recovery content is available without authentication, explains expiration when known or that the
   session is no longer available when its cause is unknown, and provides an explicit Login action.
3. Protected content is not returned or exposed in the expired- or missing-session recovery response.
4. Keyboard and assistive-technology users can perceive the expiration explanation, locate the authenticate-again action, and activate it with visible focus and appropriate focus movement.

## Open questions

None for expired- or missing-session Server Action recovery. API/backend expiration responses remain deferred.
Engineering chooses how to render the recovery content while preserving HTTP 401 and preventing protected
content from being returned or exposed.

## Verification Plan

Application/HTTP evidence must establish actual HTTP 401 for protected Server Actions with expired sessions
or missing records, denial of their protected operations, and absence of protected content. Include expiry
between browser interaction and server receipt and disabled/delayed browser timers. Observing recovery content
alone does not establish the action’s status or absence of protected side effects.

Browser Gherkin establishes that the denied action displays unauthenticated recovery content, explains known
expiration or an unavailable session without inventing its cause, and offers explicit Login without automatic
OIDC. Complete keyboard recovery with visible focus and appropriate focus movement, supplemented by
assistive-technology observations. Semantic markup alone does not establish the complete experience. Compare
known-expiration recovery content with PREETS-SESSION-012’s modal for equivalent explanation and recovery.
Fresh entry through a new tab, refresh, or browser back/forward navigation belongs to PREETS-SESSION-004’s
automatic-login evidence. Framework-specific rendering and transport behavior must be exercised at the actual
application boundary; no rendering mechanism is prescribed by this contract.

Evidence assumptions follow the shared session context. No additional operational monitoring claim is introduced.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
