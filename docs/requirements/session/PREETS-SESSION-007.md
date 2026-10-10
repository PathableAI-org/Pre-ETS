---
id: PREETS-SESSION-007
classifications:
  - Functional
---

# Explicit expired-session page

## Description

A user making an SSR protected-page request with an expired application session must be redirected to a dedicated unauthenticated session-expired page explaining expiration and offering explicit reauthentication.

## Rationale

Expiration should be understandable and must not silently send an unattended browser through login.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Authentication and protected resources; Server-authoritative idle timeout.”
- Source clarification: Maintainer direction on 2026-10-05 authorizes accessible expiration recovery, addressing the [Copilot review comment](https://github.com/PathableAI-org/Pre-ETS/pull/112#discussion_r4184264246).
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

## Acceptance criteria

1. An expired-session SSR page request redirects to the session-expired page without automatically initiating OIDC.
2. The page is accessible unauthenticated, explains that the previous session expired, and provides an explicit authenticate-again action.
3. Protected content is not returned in the expired-session response.
4. Keyboard and assistive-technology users can perceive the expiration explanation, locate the authenticate-again action, and activate it with visible focus and appropriate focus movement.

## Open questions

How long and by what contract a prior expiration remains distinguishable from a missing session needs design; API expiration responses are deferred.

## Verification Plan

HTTP checks observe redirect and protected-content denial at and after expiry; browser Gherkin follows the redirect, establishes the accessible explanation and recovery action, and completes keyboard recovery with visible focus and appropriate focus movement. Include assistive-technology observations of the explanation and action; semantic markup alone does not establish the complete experience. Include expired references whose transient state has been removed once recognition semantics are decided.

Evidence assumptions follow the shared session context. Unresolved verification conditions follow the Open questions above; no additional operational monitoring claim is introduced.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
