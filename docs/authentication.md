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
request URL → slug → tenant configuration → session setup → OIDC initiation (broker)
```

1. Bind the request to a slug and load that tenant’s configuration, or refuse
   the request with HTTP 403. Do not start login for an unknown host, and do not
   fall through to another tenant’s identity provider. Shared tenant config
   requires Display Name **and** nested OIDC settings including required
   `clientAuth` (`public` or `confidential`—the app’s registration mode).
2. After the session module returns a ready outcome (`reuse` or `create`) for a
   **document** navigation to `/`:
   - If the session record already has an authenticated `userId`, Proxy
     short-circuits to SSR the landing page (tenant Display Name + signed-in
     user name). It does **not** call initiation.
   - Otherwise Proxy **initiates OIDC**. Creating or reusing an anonymous
     session does not suppress login. Non-document requests that need login
     receive `401` without an IdP redirect.
3. The Next.js app starts a standard OIDC authorization request against the
   broker with `openid-client` (PKCE S256, `scope=openid`) using only the
   resolved tenant’s issuer, client id, and optional connection (`kc_idp_hint`
   for local Keycloak). Caller query values cannot override those fields. The
   callback URL is on the same host the user hit, for example
   `https://springfield.pathable.com/auth/callback`.
4. A short-lived Redis transaction holds the PKCE verifier and bindings; a
   host-only `pathable-oidc` cookie carries signed `state` / `tenant` / `exp`.
   The `pathable-session` cookie is set on this response **only** when setup
   created a new session and initiation returns a successful document IdP
   `302`. Failures never attach that cookie.
5. Missing or invalid OIDC config (including confidential without a server-only
   secret) yields HTTP 403 with extended “login cannot start” copy—not the
   provider-failure page. Discovery or transaction failures redirect to
   `/login-unavailable`. Malformed `OIDC_CLIENT_SECRETS_JSON` yields HTTP 500.
6. The broker authenticates the user at the tenant’s identity provider (SAML
   or OIDC). PathAble sees only the broker’s OIDC tokens afterward.
7. On `GET /auth/callback` (document navigation), Proxy runs callback
   completion: verify `pathable-oidc` against query `state`, consume the Redis
   transaction once, exchange the authorization code (PKCE + confidential
   secret when required), validate ID token `nonce`, and write `userId` /
   `userName` onto the existing Redis session (no tokens stored). Success
   clears `pathable-oidc` and redirects `303` to `/`. Failures clear the
   correlation cookie without authenticating and redirect to
   `/login-unavailable` or return extended 403 as appropriate. Non-document
   callback requests receive `401`.
8. The next document visit to `/` with an authenticated session short-circuits
   to the landing page showing tenant Display Name and the signed-in user name.

ACS URLs and other SAML endpoints live on the broker so tenant metadata stays
stable when the Next.js app moves. Downstream frontend modules receive the
slug and, after login, the authenticated session. They do not choose an
identity provider from the URL.
