# Session state

This note records how the frontend keeps per-request UI state in a Redis key
store. Tenant identification is described in
[multi-tenancy.md](./multi-tenancy.md). How an unauthenticated request starts
login is described in [authentication.md](./authentication.md). The line
between this store and backend domain persistence is described in
[domain-persistence.md](./domain-persistence.md). How the backend verifies
tokens remains out of scope here.

The frontend owns session state. It is not domain data. A first-party session
module (`server-only`, `cookies()` from `next/headers`) is the store. The
cookie names the session; Redis holds the state. When that state becomes a
real domain instance, the backend persists it, as described in
[domain-persistence.md](./domain-persistence.md).

The Redis client is the official [`redis`](https://github.com/redis/node-redis)
package, used only from the Node runtime (Server Components, Server Actions,
Route Handlers). Local development runs Redis from Compose, as described in
[docker-compose.md](./docker-compose.md). Do not use the Upstash SDK unless
Redis must be reached from the Edge. Do not use iron-session, Auth.js, Better
Auth, or `express-session` as the session store.

## Session id cookie

A request that participates in session state carries a session cookie. The
cookie is host-only for the tenant host (for example
`springfield.pathable.com`). It is not scoped to `.pathable.com`, so a session
from one slug is not sent to another.

The cookie value is a token signed with [`jose`](https://github.com/panva/jose).
It names the session id, the tenant slug, and an expiry. It does not contain
the user id or any other session payload. Middleware may verify the signature
without reading Redis. The Redis record remains the session state.

## Loading session state

Any page that needs session state reads the signed cookie, then uses the
session id as the Redis key (or as the discriminant of a key prefix). The
store returns the session record for that id, or nothing.

```text
request URL → slug → tenant configuration
request cookie → jose verify → session id → session record
```

The session record is bound to the slug resolved from the URL. If the record’s
slug does not match the request’s slug, treat the session as missing. Do not
use another tenant’s state.

A missing cookie, an unknown id, or a slug mismatch is an empty session, not a
lookup of someone else’s record.

## Authenticated user

If the user has already completed login, the session record includes the
authenticated user id. Pages that need “who is this” read it from Redis via the
session id. They do not parse identity out of the cookie.

An unauthenticated request may still have a session id (for in-progress UI
state). In that case the record has no user id. A successful OIDC callback
writes the user id onto a session that is already bound to the current slug.
The session’s tenant cannot change; the user id is set once for that session.

Downstream frontend modules receive the slug and, when present, the session
record. They do not invent a second place to store the current user.
