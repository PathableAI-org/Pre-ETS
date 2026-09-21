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
there is no tenancy library. **Current** tenant configuration is a read-only
filesystem source: one `{alias}.json` file per tenant under `TENANT_CONFIG_DIR`.
Host association opens only the bound alias’s file. Development static mode
names a single alias via `TENANT_STATIC_ALIAS` with `TENANT_RESOLUTION=static`
and reads that same directory. Prefer an absolute `TENANT_CONFIG_DIR`; relative
paths resolve against the process CWD at boot (source construction). After
editing a tenant file, restart the frontend so the process-lifetime parse cache
refreshes. Superseded `TENANT_CONFIG_RECORDS_JSON` / `TENANT_LOCAL_CONFIG_JSON`
are **silently ignored** if still set (no dual source). Authentication and
session architecture are described in the linked notes. Local configuration
needs no external services and does not use Compose for tenant config.
Committed examples and fixtures are synthetic only.

**Postgres** (or another shared mutable multi-node store) remains a longer-term
architecture target when product needs it—not the active source today. See
`specs/005-tenant-config-fs/` for the filesystem contract and constitution
exception recorded while Postgres stays deferred.

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
request URL → slug → tenant configuration (from TENANT_CONFIG_DIR/{alias}.json)
```

Host association reads `{TENANT_CONFIG_DIR}/{slug}.json` only (no directory
scan). A missing file for an otherwise valid host is refused with
`forbidden()`. An unknown or non-canonical slug argument is also
`forbidden()`. Invalid, mismatched, or unreadable selected configuration throws
(HTTP 500). A missing, empty, or non-directory `TENANT_CONFIG_DIR` fails at
source construction (visible configuration unavailable). The UI does not
substitute another tenant’s configuration, a default tenant, or the slug as a
Display Name.

These functions do not store the current tenant on the request object. The
nested layout only gates the request. Any Server Component that needs a slug or
Display Name calls the same functions itself. Session slices may look the
tenant up from the session first.

In development, an explicit `TENANT_RESOLUTION=static` setting may name exactly
one alias via `TENANT_STATIC_ALIAS` and show only that file’s Display Name on
`localhost`. That exception is honored only when `NODE_ENV=development`.
Production always binds `{slug}.pathable.com` and never reads
`TENANT_RESOLUTION` or `TENANT_STATIC_ALIAS`. Unset, `test`, `staging`, and any
other runtime use production host association. Unsupported mode values keep
host association and emit a safe `invalid-mode` diagnostic.

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
