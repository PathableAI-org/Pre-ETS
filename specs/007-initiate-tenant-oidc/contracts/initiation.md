# External contracts: session-missing initiation only

Proposed #216 contracts; no runtime evidence is claimed. The maintainer's 2026-10-18 refinement supersedes the
previous design's root tenant precheck, Redis issuance and correlation-cookie contract.

## Session presence and root entry

The public session capability reports whether a usable session exists. Its implementation always reports false
in this feature and performs no cookie, store or request-tenant lookup. Root checks it before tenant-dependent
work and returns automatic same-origin HTTP 307 to `/auth/login`, without protected content.

Both the root and its enclosing `(app)` layout must stop eager tenant reads. A layout alone cannot ensure that
child rendering stops; the root consumer must make its own session decision before returning content. Runtime
construction may decode process settings but does not resolve the request's tenant.

There is no supported positive-session rendering path in this feature. Future true/Some outcomes must be based
on a real usable session, followed by independent request-tenant resolution and session/tenant comparison before
protected access. A forged/present cookie or presence predicate alone must not authorize protected content.

## Login request and provider redirect

`GET /auth/login` is a public server page. It independently resolves the current tenant through the public tenant
service before provider work. The preparation capability returns the authorization destination to this page;
redirect outside catch blocks that would swallow framework navigation interrupts.

The final application response is an automatic provider HTTP 307 carrying the selected client, configured exact
callback, code/openid, S256 challenge, state/nonce and `max_age=0`. Request values are fresh per preparation.
The verifier stays server-local, with no persistence or browser correlation cookie. Do not return transient
context through HTML or query debug fields. Do not map `connection` to a vendor hint or resolve credentials here.

Provider HTTPS is default; an explicit loopback-only setting permits the tracked HTTP local integration. Validate
issuer/discovery/authorization and callback URLs at their relevant boundaries. Canonical callback authority comes
from the process map keyed by resolved tenant alias, never incoming Host/forwarded/query data.

The loopback HTTP exception applies only to parsed URL hosts `localhost`, names ending in `.localhost`, IPv4
addresses in `127.0.0.0/8`, and IPv6 `::1`; it does not include wildcard bind addresses, private-network hosts or
lookalikes such as `localhost.example.test`. Validate the issuer, actual discovery target, authorization endpoint
and callback separately. Supply an issuer URL to discovery, not a direct discovery-document URL. Preserve manual
HTTP redirect handling and reject discovery redirects instead of following them. The client's insecure-HTTP escape
does not enforce this application policy by itself.

Root/login must decide before streaming commits 200. Keep dynamic responses non-cacheable; verify real production
307 and the no-store response directive, without imposing an incidental complete Cache-Control string. No cookie
write requires a Route Handler yet. #217 may introduce a cookie-writing host adapter when persistence is connected.

## Public service outcomes and failures

`AuthenticationService.prepare({ host })` is a framework-independent Effect. Success returns only the prepared
authorization destination needed by the login consumer. Existing tenant `HttpError` and a separate safe
`AuthenticationUnavailable` remain distinguishable. No current API returns an authenticated identity, stored
session or transaction record. Introduce dependency seams only for actual preparation/transport needs.

Tenant failure at `/auth/login` uses the existing page error boundary: actual ordinary 404/missing page or actual
500, with no fallback provider. Root's preceding 307 remains a separate session-routing response. Provider
preparation failure directs to the public sign-in error page without protected content or raw upstream payloads.
Invalid explicit process settings fail startup; missing callback entry is request-time preparation unavailability.
Interruption/defects stay distinct from expected failures and must not become a successful default.

The provider phase, after tenant resolution, has one five-second Effect deadline spanning discovery and request
construction. Its private client transport combines Effect interruption with the client's signal, retaining manual
redirect handling. Deadline expiry cancels pending transport and becomes safe `AuthenticationUnavailable`; caller
interruption remains interruption. The client's own safety timeout cannot extend the enclosing deadline. This is
an internal failure bound, not a product login-completion SLO or a timeout for filesystem tenant selection.

The browser follows the root hop and therefore sees the ordinary missing-page experience on invalid-tenant login.
Tests must assert the actual tenant-dependent response status and final presentation; a raw root 307 or error text
alone cannot establish TENANT-004/005.

## Recoverable attempts are deferred

This increment constructs a request and then discards its server-local attempt context. It cannot accept an OIDC
callback or complete an authentication round trip. The current callback remains a denying fallback even if a real
provider returns a code. No in-memory substitute, persistence-provider interface, Redis client, TTL, storage wire
schema, signing secret, or correlation cookie is introduced here.

#217 must connect both sides: persist correlation/verifier context before redirect and recover/consume it on
callback before accepting provider evidence. That work chooses actual storage/cookie/expiry contracts with their
consumers and adds corresponding failure/race tests. #218 continues to own authenticated application sessions.

## Public exceptions and diagnostics

Callback/error/test/recovery content and required safe assets retain their existing authentication-independent
policy. `/auth/login` is explicitly public initiation transport. Preserve each route's applicable tenant checks;
root's routing exception does not exempt tenant-dependent login or diagnostic work.

`GET /_test/tenant-config` returns full permitted selected JSON and no-store with actual 404/500, no new session
or correlation cookie, and no dependency on Redis or provider availability. Existing preview environment gating
and its explicit tenant check remain unchanged. Other methods/Server Actions do not acquire automatic OIDC behavior
from this root/login flow. Production ingress, callback acceptance and full default protection remain downstream.
