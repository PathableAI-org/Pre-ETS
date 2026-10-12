---
id: PREETS-SESSION-001
classifications:
  - Functional
---

# Authentication required by default

## Description

Users must authenticate before accessing frontend application pages, route handlers, and Server Actions,
including `/`, unless the resource is explicitly designated unauthenticated. New application resources are
protected by default. Backend/API expiration-response policy remains outside this contract.

## Rationale

A default protection boundary prevents accidental public exposure. Authentication-independent test routes allow
verification before login without creating a diagnostic application session; production ingress protection
remains independently required. The OIDC callback must be reachable before an authenticated session exists,
and sign-in failures must be explainable without authenticated access.

## Sources

- Source: Maintainer-supplied discovery summary (2026-10-05), “Authentication and protected resources.”
- Decision: Maintainer approval on 2026-10-05 ("mark these requirements as approved") accepts this requirement and its acceptance criteria. Open policy and design questions remain delivery gates.

- Decision: Maintainer direction on 2026-10-12 exempts all `/_test` routes from authentication and confirms
  that `GET /_test/tenant-config` does not create an application session. The same direction exempts the OIDC
  callback and sign-in error page from authentication so login can complete and failures can be explained before
  session establishment. The maintainer also confirms default protection for all other frontend pages, route
  handlers, and Server Actions, including `/`; static assets needed to display unauthenticated pages may be
  accessible without a session only when they contain no protected information. These refinements are subject
  to Git/PR approval.

## Acceptance criteria

1. A request without valid authentication cannot obtain protected content from any protected frontend page,
   route handler, or Server Action, including `/`. Protection applies at each of these entry points, not only
   to navigation through another page.
2. Explicitly designated public resources include the OIDC callback, sign-in error page, all routes under
   `/_test`, and the dedicated expired/missing-session recovery content required by PREETS-SESSION-007.
   These resources and recovery content are available without authentication; this does not require a
   separate recovery page or a particular rendering mechanism. The callback must still validate
   authentication before establishing an authenticated session under PREETS-SESSION-003.
   Static assets needed to display unauthenticated pages may load without a session only when they contain
   no protected information. `GET /_test/tenant-config` does not create an application session.
   These exceptions do not bypass tenant resolution, the non-secret configuration requirement, or production
   ingress blocking under PREETS-TENANT-006, PREETS-SECURITY-001, and PREETS-INFRA-001.
3. Adding an application resource leaves it protected unless it is explicitly designated public.

## Open questions

None for the current public-resource policy and frontend scope. Engineering must choose an enforcement
mechanism that protects every in-scope entry point by default; this contract does not prescribe that mechanism.

## Verification Plan

HTTP/application checks of frontend pages, route handlers, and Server Actions, including direct requests
and `/`, plus route-policy inspection, establish default enforcement and public exceptions; browser Gherkin
establishes the protected navigation outcome. A finite route sample alone cannot establish the default for new routes. Application-boundary HTTP evidence
must demonstrate that `/_test` routes do not require authentication and that a diagnostic request without a
session does not create one. HTTP/application evidence must also establish unauthenticated callback reachability
and sign-in error presentation, while failed or rejected callbacks do not establish authenticated access.
Application/resource-content assessment must demonstrate that publicly accessible assets needed for these
pages contain no protected information. No specific authentication-failure response for deferred backend
resources is established here.
Diagnostic configuration safety and production ingress protection require their
own evidence; unauthenticated application access does not establish either.

Evidence assumptions follow the shared session context. Unresolved verification conditions follow the Open questions above; no additional operational monitoring claim is introduced.

## Observability

No additional operational observability obligation is established by the current sources. Migration preserves the existing externally observable behavior; future operational obligations require a separate requirements decision.

## Shared context

The [session scope, sources, and verification context](../context/session-management.md) qualify this contract.
