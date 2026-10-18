# External contracts: initiation only

These are planned application contracts for #216, not executed evidence. Requirements remain the main-branch
contracts referenced by [spec.md](../spec.md).

## Automatic protected-page entry

1. `GET /` without an application session validates the request tenant using the existing page boundary.
2. A usable tenant receives an automatic same-origin HTTP 307 to `/auth/login`, without protected welcome content.
3. `GET /auth/login` independently resolves that request's tenant and prepares initiation. Successful persistence
   yields HTTP 307 to the configured authorization endpoint and the transaction cookie below.

Initiation-handler responses use `Cache-Control: private, no-store`, including failed preparation, so per-attempt
redirect/cookie data cannot become a cached login attempt. Cover this module contract in the handler examples;
do not infer a new durable requirement from an implementation header choice.

This is a two-hop application flow; there is no login button or local credential form. A caller observing only
the first response cannot conclude that provider preparation succeeded. GET/HEAD are initiation transport methods;
do not extend this redirect policy to protected Server Actions or other methods. Valid-session reuse remains
unimplemented; no authenticated application sessions are created by this increment.

## Provider request

The final application redirect carries the selected client ID, exact configured callback URI, code response,
`scope=openid`, fresh state/nonce, PKCE S256 challenge, and `max_age=0`. The issuer/discovered metadata determines
the provider authorization endpoint; application code adds no Keycloak/Microsoft policy or vendor-specific
connection hint. The PKCE verifier stays server-side. Client credentials are not needed for this stage.

Use HTTPS by default. An explicit loopback-only local switch is necessary for the tracked HTTP Keycloak fixture;
validate the discovered authorization endpoint too, not just the issuer. Do not silently allow external HTTP.
Do not infer verified fresh authentication from `max_age=0`, a redirect, provider UI, or a new transaction handle.

## Public capability and errors

`AuthenticationService.begin({ host })` is a framework-independent Effect. Its success contains only the prepared
authorization destination and cookie issuance data the host must send. It uses the shared process Layer graph,
typed tenant context, Effect clock, cryptographic randomness, and bounded external adapters.

- Existing public tenant errors retain 404/500 semantics; `HttpError` is not expanded to model provider outages.
- `AuthenticationUnavailable` is a separate safe category for missing callback setup, unacceptable provider
  metadata/transport, or transaction persistence failure. Raw URLs, library errors and stored payloads are not
  returned or attached as unsafe causes to public errors/telemetry.
- Expected failures yield no new successful transaction cookie/provider redirect. A timed-out Redis command can
  have created an orphan record; TTL bounds it. No rollback or absence-of-write claim is made for ambiguous I/O.
- Interruption/defects retain their distinct Effect behavior; do not catch every failure into a successful fallback.

The HTTP adapter maps initiation unavailability to a same-origin redirect to the existing public
`/login-unavailable`. It contains no error payload in a query string and grants no access. Direct login-route
tenant failures retain their status via safe error mapping; root tenant failures preserve the ordinary missing
page/500 experience before entering this handler. Exact provider error wording is not part of the contract.

## Callback authority and transaction handoff

Callback authority comes from `OIDC_CALLBACK_ORIGINS_JSON[resolvedTenantAlias]`, never request/forwarded headers,
query return targets, or mutable last-used tenant state. Append fixed `/auth/callback` and persist the exact URI.
Static mode's arbitrary Host does not change the configured callback origin. The normal browser entry must use
its canonical configured host so the host-only cookie can accompany the callback; no broader cookie domain is added
to accommodate arbitrary static-mode aliases.

Cookie `preets_oidc_tx`: opaque independent handle, host-only, HttpOnly, SameSite=Lax, Path `/auth/callback`,
remaining lifetime at most 600 seconds, Secure except explicit local HTTP. The record is versioned and scoped by
tenant plus handle, with issuer/client/auth-mode, exact redirect URI, state, nonce, verifier and issue/expiry times.
See [data-model.md](../data-model.md) for the wire fields. No application session cookie or identity is issued.

One pending cookie per browser host means re-initiation replaces the earlier attempt's browser handle. #217 adds
atomic consume/replay prevention and all callback validations. Persisted records are untrusted at that later read
boundary and must be decoded. This feature does not expose a speculative consume/token/session operation.

## Public exceptions and unchanged failures

`/auth/callback`, `/login-unavailable`, all `/_test` routes, existing recovery content and required safe assets
remain authentication-independent. `/auth/login` is explicitly the public initiation transport. Exceptions
preserve applicable tenant resolution, safe configuration, and separate production ingress obligations.

`GET /_test/tenant-config` keeps complete permitted selected JSON, no-store and existing 404/500 outcomes, and
creates no application session or login transaction. A provider or Redis outage alone must not make this
diagnostic or existing public error page inaccessible after valid process configuration.

Host-mode invalid/missing tenants and malformed/unreadable selected files remain ordinary 404; unavailable
directories and a missing static selected file remain 500. Invalid explicit process settings fail startup.
No fallback provider, protected page body, or authenticated session is a valid failure result.
