# Multi-tenancy strategy

This note records how the frontend identifies a tenant on an incoming request
and loads that tenant’s configuration. What happens next on an unauthenticated
request is described in [authentication.md](./authentication.md). Session
state after that is described in [session-state.md](./session-state.md). How
session state differs from backend domain persistence is described in
[domain-persistence.md](./domain-persistence.md).

The frontend owns tenant configuration. The Next.js app is the only reader of
this data when rendering UI. Binding the host to a slug and loading
configuration are first-party modules; there is no tenancy library. The
persistence mechanism behind that read is an implementation detail of the
frontend; locally it is Postgres from Compose, as described in
[docker-compose.md](./docker-compose.md). Other modules depend only on the
tenant slug.

## Tenant slug

Each tenant has a unique **slug**. The slug is the identifier used to query
tenant configuration. It is not a display name, and it is not inferred from
path, query string, or request headers other than the URL’s host.

Users belong to a single tenant. A request is always for exactly one tenant.

## Binding: slug from the URL

The UI binds a request to a tenant by reading the host of the request URL.

Production hosts follow `{slug}.pathable.com`. The label immediately to the left
of `pathable.com` is the slug. For example, `springfield.pathable.com` yields
`springfield`.

Only this binding step may parse the URL. It returns a slug or fails. It does
not load configuration, and it does not fall through to a default tenant.

The host must be a known application pattern. Reject the request (treat it as
an unknown tenant) when:

- the host is the apex (`pathable.com`) or another non-tenant host such as
  `www.pathable.com`
- the host has extra labels (`a.b.pathable.com`)
- the host does not match the application’s tenant URL scheme

When the app sits behind a proxy, the binding step must use one trusted source
for the original host (`Host` or a single agreed forwarded-host header) and
ignore any other caller-supplied host value.

Other environments may use a different host pattern (for example
`{slug}.localhost`) by swapping only this binding step. The rest of the app
continues to receive a slug.

## Loading tenant configuration

The slug from the binding step is the key used to load tenant configuration
from the frontend’s persistence layer:

```text
request URL → slug → tenant configuration
```

A missing or unknown slug, or a slug with no configuration row, is a not-found
result. The UI does not substitute another tenant’s configuration.

Downstream frontend modules receive the slug (and the configuration it loaded).
They do not parse the request URL again to decide which tenant they are in.
