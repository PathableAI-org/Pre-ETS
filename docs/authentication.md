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

The server-only [TenantSecrets](../packages/frontend/src/lib/tenant-secrets.ts) service
accepts a reference and returns an Effect `Redacted<string>` value or a typed
`TenantSecretLookupError`. Implementations must translate provider failures into this
safe failure without preserving raw provider errors or credentials. A deterministic
synthetic implementation exists in the service contract tests. No concrete provider
is selected or installed in the application runtime; future authentication composition
must supply it. Tenant loading and diagnostics never resolve credentials and do not
require that provider.

After reading validated configuration through `TenantConfigService`, an authentication
consumer explicitly calls `resolveClientSecret(config)`. Public clients return
`Option.none()` without acquiring the secrets capability. Confidential clients use
`clientSecretRef` and return `Option.some(Redacted)` or the typed lookup failure. The
authentication composition supplies `TenantSecrets` only for this separate operation;
it is not acquired while constructing the tenant service or reading tenant files.

## Session policy handoff

[TenantConfig and effectiveSessionPolicy](../packages/frontend/src/lib/tenant-config.ts)
provide validated integration data and shared effective timeout/warning values. File
parsing preserves omitted fields; the tenant service also exposes that shared function
as `service.effectiveSessionPolicy(config)`. The policy derivation supplies omitted defaults
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
