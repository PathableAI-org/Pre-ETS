# Session state

This note records how the frontend keeps anonymous per-request session state in a
Redis key store before rendering tenant pages. Tenant identification is described in
[multi-tenancy.md](./multi-tenancy.md). How an unauthenticated request starts
login is described in [authentication.md](./authentication.md). The line
between this store and backend domain persistence is described in
[domain-persistence.md](./domain-persistence.md). How the backend verifies
tokens remains out of scope here.

The frontend owns session state. It is not domain data. A first-party session
module under `packages/frontend/src/lib/session` (`server-only` request accessor,
Proxy-owned setup) is the store owner. The cookie names the session; Redis holds
the minimal record. When that state becomes a real domain instance, the backend
persists it, as described in [domain-persistence.md](./domain-persistence.md).

The Redis client is the official [`redis`](https://github.com/redis/node-redis)
package, used only from the Node runtime (Proxy, Server Components). Local
development runs Redis from Compose, as described in
[docker-compose.md](./docker-compose.md). Do not use the Upstash SDK unless
Redis must be reached from the Edge. Do not use iron-session, Auth.js, Better
Auth, or `express-session` as the session store.

## Ordered setup (Proxy)

Participating requests for `/` enter `src/proxy.ts` before SSR:

1. Strip caller `x-pathable-session-context` and every `x-preets-tenant-*` header.
2. Inspect/verify the `pathable-session` cookie (signature, claims, expiry). Only a
   verified reference may reach Redis; absent/invalid/expired cookies skip the store
   read.
3. Await any candidate Redis read.
4. Validate the current tenant through mode-aware tenant operations (Host binding or
   static local record). Production always uses host mode.
5. Reuse only when cookie tenant = stored tenant = validated tenant and expiry agrees.
6. Otherwise generate a fresh id, persist `{ tenantId, expiresAt }` with Redis
   `SET NX EXAT`, then issue the cookie. Persistence precedes cookie issuance.
7. Forward exactly `x-pathable-session-context`, `x-preets-tenant-slug`, and
   `x-preets-tenant-origin` via `NextResponse.next({ request: { headers } })`.

`AppLayout` (route group `(app)`) consumes the server-only session accessor, loads
`tenantConfig` from the tenant source via `tenantId`, and never creates sessions or
sets cookies. Missing/malformed context fails closed.

```text
cookie inspect → optional Redis read → tenant validate → reuse or create+cookie → SSR
```

Provisional fixed lifetime default is 86,400 seconds with no sliding renewal.
Cookie `exp`, record `expiresAt`, and Redis `EXAT` align on the application clock.
Clear-session timeout and capacity policy are named follow-ups; authentication and
signing-key rotation remain future work.

## Session id cookie

A request that participates in session state carries cookie `pathable-session`.
The cookie is host-only for the tenant host (for example
`springfield.pathable.com`). It is not scoped to `.pathable.com`, so a session
from one slug is not sent to another.

Attributes: `Path=/`, `HttpOnly`, `SameSite=Lax`, no `Domain`, `Secure` outside
development, absolute `Expires` matching `exp`.

The cookie value is a compact HS256 token signed with
[`jose`](https://github.com/panva/jose). Application claims are exactly `sid`,
`tenant`, and `exp`. It does not contain a user id or any other session payload.
Proxy verifies the signature before Redis. The Redis record remains the session
state.

## Loading session state

```text
request Host / static config → validated tenant
request cookie → jose verify → session id → Redis record
```

The session record is bound to the validated tenant. If the record’s slug does not
match, treat the session as missing and create a fresh one for the current tenant.
Never mutate, delete, or reassign another tenant’s record.

A missing cookie, an unknown id, or a slug mismatch is an empty session, not a
lookup of someone else’s record. Store outages return HTTP 503 with no new cookie.

## Authenticated user

If the user has already completed login, a later feature may attach an
authenticated user id to the session record. That work is out of scope here.
This slice establishes anonymous tenant-bound sessions only.

Downstream frontend modules receive the slug and session context through the
server-only accessor. They do not invent a second place to store the current user.
