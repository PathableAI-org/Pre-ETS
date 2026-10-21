# Authentication strategy

The root uses `SessionService.hasSession()` before request-tenant lookup. The
current production capability always reports absence and redirects to `/auth/login`;
it does not read cookies, Redis or tenant files. The enclosing layout performs no
eager tenant read and this feature has no positive-session rendering path.

The public login server page resolves the request tenant through `TenantConfigService`
and prepares the configured provider's authorization request using `openid-client`.
It requests code/openid, PKCE S256, fresh state/nonce and `max_age=0`, then returns a
dynamic HTTP 307. Provider preparation has one five-second cancellable deadline.
Tenant errors retain actual login 404/500 outcomes; expected provider failure redirects
to `/login-unavailable`. Root's separate first hop remains 307 even when tenant lookup
will fail.

No application session or correlation cookie is created. The server discards the
verifier after constructing the destination; `/auth/callback` remains a denying
fallback. Provider arrival does not establish callback acceptance or verified freshness.
Public diagnostics return the complete permitted selected JSON without depending on
provider availability. The proxy remains pass-through.

## Callback and local-provider settings

`OIDC_CALLBACK_ORIGINS_JSON` is a non-secret JSON map from resolved tenant alias to
exact public origin, default `{}`. Origins forbid credentials, non-root paths, query
and fragment. Login appends `/auth/callback`; incoming Host, forwarded headers and
query data cannot supply the callback authority. A malformed explicit map fails
runtime startup; an absent selected alias makes preparation unavailable while
diagnostics remain usable.

`OIDC_ALLOW_INSECURE_LOOPBACK` defaults to false. Explicit true permits HTTP only for
`localhost`, `.localhost` names, `127.0.0.0/8` and `::1`, checked separately at issuer,
actual discovery, authorization and callback boundaries. External HTTP, lookalikes,
wildcard addresses, direct metadata-document issuer shortcuts and discovery redirects
are rejected. Invalid explicit boolean configuration fails startup. HTTPS is the default.

For the tracked Keycloak realm, start the repository Compose service and verify realm
discovery before opening the app or running successful-delegation BDD. Example frontend
settings (other required tenant settings remain in `.env.example`):

```dotenv
OIDC_CALLBACK_ORIGINS_JSON={"springfield":"http://localhost:3000","shelbyville":"http://shelbyville.localhost:3000"}
OIDC_ALLOW_INSECURE_LOOPBACK=true
```

Host-mode browser checks use the registered `springfield.localhost:3000` and
`shelbyville.localhost:3000` origins. BDD supplies those explicit callback origins
independently of its logical request Hosts and random application ports. Nightly/manual
BDD remains main-only and provisions a pinned ephemeral Keycloak with tracked realm,
bounded discovery readiness, diagnostics and unconditional owned-container cleanup.
See the [verification guide](../specs/007-initiate-tenant-oidc/quickstart.md).

[#217](https://github.com/PathableAI-org/Pre-ETS/issues/217) must persist correlation
and verifier context before redirect together with callback recovery and consumption.
[#218](https://github.com/PathableAI-org/Pre-ETS/issues/218) owns authenticated session
establishment; #219/#154 retain later enforcement/application integration. Valid-session
access must independently resolve and compare the request tenant. No Microsoft/broker
compatibility, real signed-token freshness, or complete authentication round trip is
established by initiation.

## Configuration for OIDC consumers

Every tenant file requires `oidc.issuer`, `oidc.clientId`, and `oidc.clientAuth`.
Issuer and client ID must be nonempty strings containing a non-whitespace character.
`clientAuth` is `public` or `confidential`; the optional `connection` string preserves
provider integration data without introducing provider-specific application logic.

A public client has no credential reference. A confidential client must supply a
nonempty, non-secret `oidc.clientSecretRef` lookup key. Credentials, tokens, private
keys, and provider credentials do not belong in tenant files. Unknown fields,
including embedded credential fields, are rejected at root and nested boundaries.
This validation cannot detect a secret pasted into an otherwise permitted text field;
configuration producers remain responsible for those values.

The non-secret reference remains configuration data. There is no secrets module,
provider contract, or credential lookup operation yet: add them when an actual
authentication consumer needs to read a real secret. Tenant loading and diagnostics
do not resolve references or depend on a secrets provider.

## Session policy handoff

[TenantConfigService](../packages/frontend/src/lib/tenant.ts) provides validated
integration data and shared effective timeout/warning values through
`service.effectiveSessionPolicy(config)`. The Config recipe and policy implementation
are private children of the tenant module. File parsing preserves omitted fields;
the policy derivation supplies omitted defaults
without changing the diagnostic document. See the
[policy contract](./multi-tenancy.md#idle-timeout-and-warning-policy) for the accepted
values and examples.

Session creation ([#218](https://github.com/PathableAI-org/Pre-ETS/issues/218)) and
policy refresh ([#220](https://github.com/PathableAI-org/Pre-ETS/issues/220)) should use
this derivation with the then-current validated tenant configuration. Credential
resolution and callback exchange belong to
[#217](https://github.com/PathableAI-org/Pre-ETS/issues/217). This configuration work
does not implement expiration enforcement, warning UI, or session policy adoption.
See [session-state.md](./session-state.md) for the current minimal presence boundary.
