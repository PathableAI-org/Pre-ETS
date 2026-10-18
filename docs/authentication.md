# Authentication strategy

The current Next.js app provides tenant configuration but does not implement login,
OIDC discovery, callback token exchange, or authenticated sessions. Redis and Keycloak
are not required to open its routes:

- `/` renders the welcome page.
- `/auth/callback` renders the authentication-return fallback.
- `GET /_test/tenant-config` reads the selected tenant configuration. See
  [multi-tenancy.md](./multi-tenancy.md).

The proxy forwards incoming request headers on `/` and `/auth/callback`; it does not
create a session, set cookies, or redirect to an identity provider.

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
The existing [session-state.md](./session-state.md) describes historical session work;
its Redis, cookie, and rollout descriptions are not evidence of current runtime behavior.
