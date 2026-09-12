# Authentication strategy

This note records what the frontend does when an initial request is
unauthenticated. How a session id cookie maps to Redis state (including the
authenticated user id) is described in [session-state.md](./session-state.md).
The backend verifies broker tokens with `jose` as noted in
[domain-persistence.md](./domain-persistence.md); the request-level checks
themselves remain out of scope here.

Tenant identification happens first and is described in
[multi-tenancy.md](./multi-tenancy.md). Auth starts only after a slug has
resolved to tenant configuration. Users belong to a single tenant; surviving
that tenant’s identity provider is enough to treat them as a member.

## Protocols

PathAble applications speak **OpenID Connect**. The Next.js app is an OIDC
relying party. It uses [`openid-client`](https://github.com/panva/openid-client)
for discovery, authorization-code + PKCE, and the callback. It does not
implement SAML and does not accept SAML configuration from tenants.

Tenants typically already have a SAML identity provider. A **broker**
(Authentik or Keycloak) sits between PathAble and those providers: it is a
SAML service provider to the tenant and an OIDC issuer to PathAble. Tenant
SAML metadata (entity ID, SSO URL, certificate) is stored on the broker, not
in the Next.js app. The broker is infrastructure, not an application library. Local development
runs Keycloak from Compose, as described in
[docker-compose.md](./docker-compose.md).

A tenant that already speaks OIDC uses a different connection type on the same
broker. The Next.js app still starts an OIDC login with `openid-client` either
way.

Do not use Better Auth or Auth.js as the session owner. They introduce a
second user and session model. `openid-client` stops at tokens; the session
module in [session-state.md](./session-state.md) is what persists the user id.

## Unauthenticated request

An unauthenticated request is handled in this order:

```text
request URL → slug → tenant configuration → OIDC login (broker)
```

1. Bind the request to a slug and load that tenant’s configuration, or reject
   the request as not found. Do not start login for an unknown host, and do not
   fall through to another tenant’s identity provider.
2. Configuration includes presentation data (branding, copy) and the broker
   **connection** to use for this slug. The login page may render that
   tenant’s chrome before the user authenticates.
3. The Next.js app starts a standard OIDC authorization request against the
   broker with `openid-client` and asks for that connection. The callback URL
   is on the same host the user hit, for example
   `https://springfield.pathable.com/auth/callback`.
4. The OIDC `state` (and any equivalent nonce) includes the slug resolved in
   step 1. On callback, the host and the completed connection must match that
   slug. A mismatch is a failed login, not a session for a different tenant.
5. The broker authenticates the user at the tenant’s identity provider (SAML
   or OIDC). PathAble sees only the broker’s OIDC tokens afterward.
6. A successful callback creates a session already bound to that slug. The
   session’s tenant cannot change.

ACS URLs and other SAML endpoints live on the broker so tenant metadata stays
stable when the Next.js app moves. Downstream frontend modules receive the
slug and, after login, the authenticated session. They do not choose an
identity provider from the URL.
