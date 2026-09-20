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

After a successful OIDC callback, the session record stores `userId` (ID token
`sub`) and `userName` (ID token `name`, else `preferred_username`, else `sub`).
Access and refresh tokens are not written to Redis. The signed session cookie
still carries only `sid` / `tenant` / `exp`.

When `userId` is present on the Redis record, Proxy short-circuits document
navigations to `/`: it forwards session context (including `userName`) to SSR
and does not re-initiate login. Downstream modules read identity through the
server-only session accessor; they do not invent a second place to store the
current user.

## Idle timeout rollout (Phase A → B → drain)

Tenant-configurable idle timeout extends authenticated Redis records with
`idleDurationMinutes`, `lastActivityAt`, and `idleExpiresAt`, and may set
anonymous `accessEndedCause: "inactivity"` plus `sessionEndGeneration` after
idle clearance. Rollout is two-phase:

1. **Phase A — dual-read**: Parsers and `SessionStore.read` accept both legacy
   four-key authenticated JSON and idle-shaped records, exposing
   `legacyAuthenticated` for the four-key shape. `setupSession` reuse **rejects**
   legacy authenticated records (force reauthentication). Do not enable
   idle-shaped authenticated **writes** until Phase A parsers are proven.
2. **Phase B — idle writes** (current for new authentications): OIDC callback
   stamps `idleDurationMinutes` / `lastActivityAt` / `idleExpiresAt` from the
   effective tenant policy at auth time. Protected operations re-check Redis with
   a fresh application clock (`guardAuthenticatedAccess`, `setupSession` reuse,
   activity renewal, `getRequestSession`). Idle clearance persists
   `accessEndedCause: "inactivity"` and `sessionEndGeneration` on the anonymous
   tombstone. Dual-read remains required while legacy four-key records may still
   exist.
3. **Drain**: Keep dual-read until at least one full configured absolute session
   TTL (`SESSION_TTL_SECONDS` / `SessionConfig.ttlSeconds`) has elapsed after
   Phase B starts.
4. **Rollback**: During the drain window, roll back only to a **Phase A
   dual-read** build. Rolling back to a four-key-only parser while idle-shaped
   keys remain is unsupported (those records parse as missing / force reauth).

Redis plus the **application clock** are authoritative for idle and absolute
deadlines. Browser timers never grant access past `idleExpiresAt` / `expiresAt`.
There is no public idle diagnostic API. Qualifying activity renews idle only
(cookie-bound Server Action); it does not extend absolute `expiresAt`.

## Idle clearance and recovery paths

When authenticated access ends for inactivity, the Redis key is cleared to an
anonymous **tombstone** with `accessEndedCause: "inactivity"` and a monotonic
`sessionEndGeneration` latch retained until that record’s absolute `expiresAt`.
CAS renew/clear paths refuse to invent inactivity from missing store or absolute-only
expiry.

Two product recovery paths:

| Path                                                             | Behavior                                                                                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Running app** (open authenticated tab past idle)               | Client confirm/read (or matching same-origin `BroadcastChannel`) establishes cause → protected UI cleared → PathAble Modal → **Log in again**                                  |
| **Closed tab / typed URL / fresh document** after idle clearance | **No SSR inactivity shell**. Setup refuses inactivity tombstones as entry sessions, mints a fresh anonymous sid, and Proxy starts **generic OIDC**. Modal is running-app only. |

There are **no** Redis draft keys in this slice. Client-only temporary UI (for example
an “Unsent practice note” fixture) is cleared with protected content and is not restored
after login-again. Durable saved records are unaffected.
