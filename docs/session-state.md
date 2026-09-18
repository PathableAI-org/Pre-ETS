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
current user. Authenticated SSR / Server Actions that treat `userId` as proof of
access re-read Redis through the session guard—they do not trust the forwarded
header alone. When that re-read denies access (stale cookie, pre-idle legacy
shape, missing record, or store failure), SSR fail-closes with an auth interrupt
(`unauthorized` / inactivity redirect) instead of throwing an opaque Error.
Pre-idle authenticated cookies are rejected at Proxy reuse and forced through a
fresh anonymous session before login can stamp idle fields.

## Idle timeout rollout (Phase A → B → drain)

Authenticated Redis records gain idle fields (`idleDurationMinutes`,
`lastActivityAt`, `idleExpiresAt`) in a controlled rollout. Legacy **four-key**
authenticated JSON (`tenantId`, `expiresAt`, `userId`, `userName`) may remain
until absolute TTL expires.

1. **Phase A — dual-read**: Parsers and `SessionStore.read` accept both legacy
   four-key and idle-shaped authenticated JSON and expose `legacyAuthenticated`
   for the four-key shape. `setupSession` reuse **rejects** legacy records
   (force reauthentication / fresh anonymous). Idle-shaped authenticated writes
   stay off (or gated default-off) until Phase A is proven.
2. **Phase B — idle writes**: Enable idle-shaped authenticated writes and idle
   enforcement (guard, activity renewal, clearance). Callback stamps
   `idleDurationMinutes` / `lastActivityAt` / `idleExpiresAt` on the **new**
   `sessionId` at authentication (omit tenant policy → effective **30** until
   US3). Drain window remains open until at least one configured absolute TTL
   elapses after Phase B starts.
3. **Drain window**: Keep dual-read until at least one full **configured**
   absolute TTL has elapsed after Phase B starts—base the window on
   `SESSION_TTL_SECONDS` / `SessionConfig.ttlSeconds`, not
   `DEFAULT_SESSION_TTL_SECONDS` alone. If ops lengthens TTL, extend the drain.
4. **Rollback**: During the drain window, roll back only to a **Phase A
   dual-read** build (idle write flag / client island may be disabled). Rolling
   back to a **four-key-only** parser while idle-shaped keys remain is
   **unsupported** and one-way-unsafe: those records parse as missing and force
   reauth. After drain completes, an idle-only authenticated allowlist is
   allowed. This slice has **no** Redis draft/unsaved-work keys.

## Qualifying activity and recovery

Authoritative idle and absolute deadlines live on the Redis record. The application
clock is the only activity timestamp source; clients must not supply `at`. Qualifying
client events require `event.isTrusted === true` (`keydown`, `pointerdown`,
`touchstart`, trusted `wheel`)—not bare `scroll`, polling, or untrusted scripts.
Renewal and idle clearance use a per-session idle lock plus compare-and-set with a
post-apply re-check (deadline wins). Coalesce ~1s when `idleExpiresAt` is unchanged.

Confirmed inactivity clears authenticated fields, sets
`accessEndedCause: "inactivity"` and `sessionEndGeneration` (latch retained until the
ended session’s absolute `expiresAt`). Proxy branches on setup
`kind: "inactivity-recovery"` to the SSR recovery shell at `/inactivity` before generic
OIDC. Running-app tabs schedule a deadline-aligned timer at
`min(idleExpiresAt, expiresAt)` and sync siblings via BroadcastChannel
`inactivity-confirmed` payloads that include `sessionId` + `sessionEndGeneration`.
Login-again rotates a **new** `sessionId` and cookie before OIDC initiation; callback
writes idle fields only to that new Redis key.
