# Multi-tenancy strategy

This note records how the frontend identifies a tenant on an incoming request
and loads that tenant’s configuration. What happens next on an unauthenticated
request is described in [authentication.md](./authentication.md). Session
state after that is described in [session-state.md](./session-state.md). How
session state differs from backend domain persistence is described in
[domain-persistence.md](./domain-persistence.md).

The frontend owns tenant configuration. The Next.js app is the only reader of
this data when rendering UI. Binding the host to a slug and loading
configuration are first-party modules; there is no tenancy library. Durable
tenant storage, authentication, and session architecture remain future work.
This increment supplies a Display Name from either host-associated known
records or one development-only static record. Local configuration needs no
external services and does not use Compose.

## Tenant slug

Each tenant has a unique **slug**. The slug is the identifier used to query
tenant configuration. It is not a display name, and it is not inferred from
path, query string, or request headers other than the URL’s host.

Users belong to a single tenant. A request is always for exactly one tenant.

## Binding: slug from the URL

The UI binds a request to a tenant by reading the `Host` header.

Production hosts follow `{slug}.pathable.com`. The label immediately to the left
of `pathable.com` is the slug. For example, `springfield.pathable.com` yields
`springfield`. Local host association uses `{slug}.localhost` with the same
label rules. Only this binding step may parse the host. It returns a slug or
fails. It does not load configuration, and it does not fall through to a
default tenant.

The host must be a known application pattern. Refuse the request with HTTP
**403** (`Access denied.`) and no redirect when:

- the host is the apex (`pathable.com`) or another non-tenant host such as
  `www.pathable.com`
- the host has extra labels (`a.b.pathable.com`)
- the host does not match the application’s tenant URL scheme
- the slug is unknown

When the app sits behind a proxy, the binding step must use one trusted source
for the original host (`Host`) and ignore caller-supplied `X-Forwarded-Host`,
query values, and inbound `x-preets-tenant-*` headers. Deployment ingress must
still present the original host; this application cannot make untrusted
forwarded headers authoritative.

## Loading tenant configuration

The slug from the binding step is the key used to load tenant configuration:

```text
request URL → slug → tenant configuration
```

A missing, unreadable, or unknown host is a 403 refusal. Invalid selected
configuration is a 500. A temporarily unavailable configuration source is a
503. The UI does not substitute another tenant’s configuration, a default
tenant, or the slug as a Display Name.

In development, an explicit `TENANT_RESOLUTION=static` setting may supply
exactly one local record and show only that Display Name on `localhost`. That
exception is honored only when `NODE_ENV=development`. Any other runtime,
including unset, `test`, and `staging`, keeps host association. Unsupported
mode values also keep host association and emit a safe `invalid-mode`
diagnostic.

Downstream frontend modules receive the slug (and the configuration it loaded).
They do not parse the request URL again to decide which tenant they are in.
