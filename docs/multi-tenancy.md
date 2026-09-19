# Multi-tenancy strategy

This note records how the frontend identifies a tenant on an incoming request
and loads that tenant’s configuration. What happens next on an unauthenticated
request is described in [authentication.md](./authentication.md). Session
state after that is described in [session-state.md](./session-state.md). How
session state differs from backend domain persistence is described in
[domain-persistence.md](./domain-persistence.md).

The frontend owns tenant configuration. The Next.js app is the only reader of
this data when rendering UI. Binding the host to a slug and loading
configuration are first-party modules under `packages/frontend/src/lib/tenant`;
there is no tenancy library. Durable tenant storage, authentication, and session
architecture remain future work. This increment supplies a Display Name from
either host-associated known records or one development-only static record.
Local configuration needs no external services and does not use Compose.

## Tenant slug

Each tenant has a unique **slug**. The slug is the identifier used to query
tenant configuration. It is not a display name, and it is not inferred from
path, query string, or request headers other than the URL’s host.

Users belong to a single tenant. A request is always for exactly one tenant.

## Binding: slug from the URL

The UI binds a request to a tenant by reading the `Host` header in
`getCurrentTenant()`. Production hosts follow `{slug}.pathable.com`. Local host
association uses `{slug}.localhost` with the same label rules. Only this binding
step may parse the host. It returns a slug or calls Next.js `forbidden()`. It
does not load configuration, and it does not fall through to a default tenant.

The host must be a known application pattern. On Proxy-matched `/` routes,
`setupSession` runs before SSR, validates the host tenant, and forwards
`x-pathable-session-context`, `x-preets-tenant-slug`, and
`x-preets-tenant-origin` on the internal request. The nested `(app)` layout and
page code consume that context through the server-only `getRequestSession()`
accessor (which loads tenant configuration from the session tenant id). An
unusable host or unknown slug still renders `app/forbidden.tsx`
(`Access denied.`) with no redirect on non-participating routes and on matched
routes where tenant validation fails before session setup completes:

- the host is the apex (`pathable.com`) or another non-tenant host such as
  `www.pathable.com`
- the host has extra labels (`a.b.pathable.com`)
- the host does not match the application’s tenant URL scheme
- the slug is unknown

When the app sits behind a reverse proxy, the binding step must use one trusted
source for the original host (`Host`) and ignore caller-supplied
`X-Forwarded-Host` and query values. Deployment ingress must still present the
original host; this application cannot make untrusted forwarded headers
authoritative.

## Loading tenant configuration

The slug from the binding step is the argument to `getCurrentTenantConfig`:

```text
request URL → slug → tenant configuration
```

A missing, unreadable, or unknown host is refused with `forbidden()`. An
unknown or non-canonical slug argument is also `forbidden()`. Invalid or
unreadable selected configuration throws (HTTP 500). The UI does not substitute
another tenant’s configuration, a default tenant, or the slug as a Display Name.

These functions do not cache or store the current tenant on the request. The
nested layout only gates the request. Any Server Component that needs a slug or
Display Name calls the same functions itself. A later session slice can look
the tenant up from the session first.

In development, an explicit `TENANT_RESOLUTION=static` setting may supply
exactly one local record and show only that Display Name on `localhost`. That
exception is honored only when `NODE_ENV=development`. Production
always binds `{slug}.pathable.com` and never reads `TENANT_RESOLUTION` or
`TENANT_LOCAL_CONFIG_JSON`. Unset, `test`, `staging`, and any other runtime
use production host association. Unsupported mode values keep host association and
emit a safe `invalid-mode` diagnostic.

Downstream frontend modules that need tenancy call `getCurrentTenant` /
`getCurrentTenantConfig`. They do not parse the request URL themselves to
decide which tenant they are in.

## Idle timeout policy

Tenant configuration may include optional `idleTimeoutMinutes`:

- Whole minutes **5–30** inclusive.
- Omitted → effective **30** minutes for new authenticated sessions.
- Invalid explicit values fail at the trusted configuration boundary for the
  **whole** source (no silent substitution of the default or another tenant’s
  policy).
- Policy is fixed on the session at authentication (OIDC callback idle stamp).
  Changing a tenant’s choice does not rewrite live sessions; login-again and other
  new authentications pick up the **current** effective duration.
- Tenants are isolated: one tenant’s choice never governs another’s sessions.
