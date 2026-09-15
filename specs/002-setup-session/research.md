# Research: Set Up a Session

Date: 2026-09-15. Updated after Copilot review on PR #18. All planning unknowns
resolved; implementation must verify the chosen integration against the installed
framework and real Redis. This document records decisions, not completed behavior.

## 1. Cookie-write boundary

**Decision**: Use `src/proxy.ts`, Node runtime by default, without exporting a runtime option. Perform
session setup there and set the outgoing cookie before rendering. Scope the matcher to the actual
application path `/`, including its RSC requests.

**Rationale**: The current nested tenant layout calls tenant resolution directly; Server Components
cannot set cookies while rendering. Proxy supports response cookies and upstream request headers.
The official guide discourages slow data fetching in Proxy; this bounded session operation is required
by the specified initial-request ordering. Keep all other data work out of this boundary.

**Alternatives considered**: A Server Action needs a client action; an initialization Route Handler needs
a redirect or extra request; both complicate transparent first visits. Cookie mutation in a layout is
unsupported. An Edge session SDK conflicts with the Node/official Redis strategy.

**Evidence**: `packages/frontend/src/app/(tenant)/layout.tsx`, `packages/frontend/package.json`;
[Next.js Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy),
[cookies](https://nextjs.org/docs/app/api-reference/functions/cookies),
[NextResponse](https://nextjs.org/docs/app/api-reference/functions/next-response).
Initial research used official documentation; after installing locked dependencies, the bundled
`packages/frontend/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
confirmed Node runtime, cookie mutation, and upstream request-header support.

## 2. Mode-aware tenant policy and bounded same-request context

**Decision**: Extract transport-independent tenant operations inside the existing tenant owner. The
operation is mode-aware: production and development host mode bind the trusted `Host`; development
static mode resolves the configured `TENANT_LOCAL_CONFIG_JSON` record without Host binding; production
always uses host mode. Proxy translates typed tenant failures into HTTP responses and must revise the
established tenant contract (`specs/001-tenant-resolution/contracts/tenant-context.md`) so refusal and
configuration failures may terminate in Proxy for participating routes while preserving visible outcomes.

Forward only bounded identity/session fields `{ sessionId, tenantId, expiresAt }` (plus a closed origin
or equivalent short binding if still required by the tenant handoff) in reserved upstream-only headers
after successful validation. Do **not** serialize `tenantConfig` / Display Name into headers. Strip every
caller-supplied `x-pathable-session-context` and every established `x-preets-tenant-*` value first, then
overwrite only the names this feature still uses. The server-only session accessor validates the bounded
fields and obtains configuration through the existing tenant source contract (same immutable process
configuration), memoized within the request. SSR never creates sessions.

Rename `(tenant)` → `(app)` and `TenantLayout` → `AppLayout` during implementation. `AppLayout` is the
application-wide gate that consumes the Proxy-established session context and performs the updated
session-aware tenant check (conditional on validated context), replacing the current layout's direct
`getCurrentTenant()` / `getCurrentTenantConfig()` calls. It does not re-run store setup or issue cookies.

**Rationale**: Existing `dev.ts`/`prod.ts` depend on `next/headers` and `forbidden()`. Their underlying
host/config logic must be reusable without introducing another parser, and static mode must keep working
on bare `localhost` (FR-011). Separate Proxy/render contexts cannot share module memory. Display Name has
no header size/encoding bound (tenant research §5); forwarding only short validated fields preserves that
guarantee. Revising the tenant refusal contract keeps Proxy and render contracts consistent instead of
leaving an approved interface that forbids Proxy refusal while the session plan requires it.

**Alternatives considered**: Re-reading Redis in each component repeats lookup and can violate ordering;
module globals can leak state between visitors; trusting a browser-provided header defeats tenant
isolation; serializing full config reintroduces Unicode/size policy for no present need; leaving refusal
only in the layout conflicts with cookie-before-SSR ordering for denied hosts after a store read.

**Evidence**: `packages/frontend/src/lib/tenant/{index,dev,prod,host,types,source}.ts`;
`specs/001-tenant-resolution/research.md` §5; `specs/001-tenant-resolution/contracts/tenant-context.md`
§Refusal; [NextResponse request headers](https://nextjs.org/docs/app/api-reference/functions/next-response).

## 3. Session storage, TLS, and outage behavior

**Decision**: Use official `redis`, a single lazily connected frontend client, namespaced string keys,
and one atomic `SET` with `NX` and absolute `EXAT` expiry. Normal creation uses a 32-byte random id;
an unlikely collision permits one new id attempt, then controlled failure. Disable offline queuing;
bound connection/command operations (default 2 seconds, capped to the Node timer-safe maximum), register
a safe error listener, and reset failed connection initialization so later requests can reconnect.
Do not cache records or negative lookups.

`REDIS_URL` validation: allow plain `redis://` only for loopback/local Compose targets; require TLS
(`rediss://` or equivalent) for every non-local deployment URL. Reject non-local cleartext at config
parse time.

Expiry clock: compute `expiresAt` once from the application clock for cookie `exp` and the JSON record.
Pass the same absolute Unix seconds to Redis `EXAT`. Document that Redis server clock skew can evict
slightly early or late relative to cookie expiry; acceptance treats cookie `exp` as the visitor-visible
lifetime and Redis TTL as best-effort cleanup. Do not extend lifetime for skew. Fail creation (no cookie)
when `expiresAt` is no longer safely later than "now + store timeout" at write time.

**Rationale**: Atomic expiry avoids immortal orphan records. Fixed deadlines turn outages into observable
503 responses. TLS protects session records and signing-adjacent traffic off-box. Aligning cookie and
record values on one application clock keeps the signed reference coherent; Redis cleanup need not be a
perfect second clock.

**Alternatives considered**: Separate SET/EXPIRE can leave immortal records; process-local fallback breaks
restart continuity and outage requirements; queued writes can report misleading late success; using Redis
`TIME` for the cookie couples browser expiry to an opaque remote clock and complicates unit tests.

**Evidence**: [node-redis](https://github.com/redis/node-redis),
[Redis SET](https://redis.io/docs/latest/commands/set/), and `docs/session-state.md`.

## 4. Signing, fixed lifetime, and lazy configuration

**Decision**: Use `jose` with HS256 explicitly allowed, a required server-only secret of at least 32
random bytes, and strict claims `{ sid, tenant, exp }`. Lifetime defaults to 86,400 seconds. Require a
minimum TTL strictly greater than the configured store timeout (and enough margin to finish setup before
`exp`), with a representable resulting date. Cap `SESSION_STORE_TIMEOUT_MS` to a runtime-supported
positive integer range usable by Node timers (reject values that would clamp or overflow).

Parse session configuration lazily on the first participating request (or first store/cookie use), not at
module import of `proxy.ts` / session modules, so clean-checkout `pnpm build` / `pnpm typecheck` succeed
without secrets. Missing or invalid runtime configuration fails closed with generic HTTP 500 and a safe
diagnostic. Unit/contract coverage must prove both: import/build without secrets succeeds, and a
participating request without configuration returns 500 without issuing a cookie.

**Rationale**: The spec and existing strategy require signed references, not encrypted session payloads
or an authentication system. Lazy parsing matches existing tenant configuration patterns and keeps
repository gates green. A TTL shorter than the setup deadline can issue an already-expired cookie.

**Alternatives considered**: Unsigned ids fail FR-006; session payloads in JWTs create a second state store;
renewal adds lifecycle behavior the spec excludes; eager module-load validation breaks CI build gates.
Key rotation policy is future operational work; a secret change makes prior references unusable and
normal setup replaces them.

**Evidence**: [jose](https://github.com/panva/jose), `docs/session-state.md`, spec FR-006/007,
existing tenant env loading in `packages/frontend/src/lib/tenant`.

## 5. Local services, CI Redis, and evidence layers

**Decision**: Add only official Redis `8.2.9` on loopback, with a ping healthcheck. Keep app processes on
the host. Update `docs/docker-compose.md` (and README pointers) in the same focused commit as the
Redis-only Compose change so operational docs are never contradictory. Extend existing Vitest and
Cucumber/Playwright rather than introduce a test framework.

Isolation: unit tests may inject a store prefix via constructor. Real HTTP/BDD fixtures that spawn a
frontend process MUST set a documented test-only `SESSION_KEY_PREFIX` (or dedicated Redis logical
database) in that process environment, track scenario-owned keys/ids, and delete only that namespace.
Never `FLUSHALL`. Cookie-jar continuity across frontend restart MUST preserve the browser context or
capture/replay the raw `Set-Cookie` rather than closing all contexts in `restartOwnedProcess`.

CI: provision Redis (workflow service or fixture-managed lifecycle) and synthetic
`REDIS_URL` / `SESSION_SIGNING_SECRET` / prefix settings for `pnpm test:bdd` in `.github/workflows/ci.yml`
before session steps are required to pass. Session lifecycle proofs that need a real cookie jar use
`@browser` (and HTTPS or raw-header assertions for `Secure`).

**Rationale**: The Compose strategy describes future broker/Postgres services, but this spec narrows this
increment to Redis. Frontend restart continuity requires Redis to stay running, not durable Redis volume
provisioning. Constructor-only prefixes cannot reach a child frontend process. Without CI Redis, enabling
session setup will fail the existing tenant suite once it routes through setup.

**Alternatives considered**: Full architecture Compose exceeds scope; mock-only Redis cannot prove
external continuity or TTL; checking Display Name alone cannot establish sessions; deferring Compose doc
updates until the final slice leaves contradictory instructions during earlier slices.

**Evidence**: [official Redis image](https://hub.docker.com/_/redis), `docs/docker-compose.md`,
`.github/workflows/ci.yml`, `tests/bdd/support/server.ts`, `tests/bdd/steps/session.steps.ts`
(currently pending), `features/session-continuity.feature`, `features/session-recovery.feature`, and
`features/local-session-development.feature`.
