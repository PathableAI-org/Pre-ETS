# Research: Set Up a Session

Date: 2026-09-15. All planning unknowns resolved; implementation must verify the chosen integration
against the installed framework and real Redis. This document records decisions, not completed behavior.

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

**Evidence**: `packages/frontend/src/app/(app)/layout.tsx`, `packages/frontend/package.json`;
[Next.js Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy),
[cookies](https://nextjs.org/docs/app/api-reference/functions/cookies),
[NextResponse](https://nextjs.org/docs/app/api-reference/functions/next-response).
Initial research used official documentation; after installing locked dependencies, the bundled
`packages/frontend/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
confirmed Node runtime, cookie mutation, and upstream request-header support.

## 2. One tenant policy and same-request context

**Decision**: Extract explicit-Host operations inside the existing tenant owner. Proxy translates typed
tenant failures into HTTP responses. Forward `{ sessionId, tenantId, expiresAt, tenantConfig }` in a
reserved upstream-only header after successful validation. Strip caller input for this header first.
SSR reads it through one server-only accessor and never creates sessions.

**Rationale**: Existing `dev.ts`/`prod.ts` depend on `next/headers` and `forbidden()`. Their underlying
host/config logic must be reusable without introducing another parser. Separate Proxy/render contexts
cannot be assumed to share module memory. The internal header carries only already-validated temporary
context; Redis remains authoritative across requests. Missing context must fail closed.

**Alternatives considered**: Re-reading Redis in each component repeats lookup and can violate ordering;
module globals can leak state between visitors; trusting a browser-provided header defeats tenant
isolation. Automatically reflecting Set-Cookie into SSR is less explicit than upstream context forwarding.

**Evidence**: `packages/frontend/src/lib/tenant/{index,dev,prod,host,types,source}.ts`;
[NextResponse request headers](https://nextjs.org/docs/app/api-reference/functions/next-response).
Production must still ignore local static settings and forwarded host overrides.

## 3. Session storage and outage behavior

**Decision**: Use official `redis`, a single lazily connected frontend client, namespaced string keys,
and one atomic `SET` with `NX` and absolute `EXAT` expiry. Normal creation uses a 32-byte random id;
an unlikely collision permits one new id attempt, then controlled failure. Disable offline queuing;
bound connection/command operations (default 2 seconds), register a safe error listener, and reset failed
connection initialization so later requests can reconnect. Do not cache records or negative lookups.

**Rationale**: Atomic expiry avoids immortal orphan records. Fixed deadlines turn outages into observable
503 responses. An ambiguous timed-out write may leave an expiring orphan, but must never issue a cookie
or complete setup; a later request creates its own id. Read errors differ from a missing key.

**Alternatives considered**: Separate SET/EXPIRE can leave immortal records; process-local fallback breaks
restart continuity and outage requirements; queued writes can report misleading late success.

**Evidence**: [node-redis](https://github.com/redis/node-redis),
[Redis SET](https://redis.io/docs/latest/commands/set/), and `docs/session-state.md`.

## 4. Signing and fixed lifetime

**Decision**: Use `jose` with HS256 explicitly allowed, a required server-only secret of at least 32
random bytes, and strict claims `{ sid, tenant, exp }`. Lifetime defaults to 86,400 seconds with a positive
integer override. Compute expiry once and share it with cookie and Redis; no sliding renewal.

**Rationale**: The spec and existing strategy require signed references, not encrypted session payloads
or an authentication system. Validate signatures, types, canonical tenant, id shape, expiry, and matching
record binding before use. Signing material must remain stable across frontend restart for continuity.

**Alternatives considered**: Unsigned ids fail FR-006; session payloads in JWTs create a second state store;
renewal adds lifecycle behavior the spec excludes. Key rotation policy is future operational work; a
secret change makes prior references unusable and normal setup replaces them.

**Evidence**: [jose](https://github.com/panva/jose), `docs/session-state.md`, spec FR-006/007.

## 5. Local services and evidence layers

**Decision**: Add only official Redis `8.2.9` on loopback, with a ping healthcheck. Keep app processes on
the host. Extend existing Vitest and Cucumber/Playwright rather than introduce a test framework. Use
isolated key prefixes and synthetic signing keys/tenants; never flush an arbitrary Redis database.

**Rationale**: The Compose strategy describes future broker/Postgres services, but this spec narrows this
increment to Redis. Frontend restart continuity requires Redis to stay running, not durable Redis volume
provisioning. Contract tests prove ordering; real HTTP/store checks prove integration; browser checks
prove automatic first visit and return behavior without adding diagnostic UI.

**Alternatives considered**: Full architecture Compose exceeds scope; mock-only Redis cannot prove
external continuity or TTL; checking Display Name alone cannot establish sessions.

**Evidence**: [official Redis image](https://hub.docker.com/_/redis), `docs/docker-compose.md`,
`tests/bdd/steps/session.steps.ts` (currently pending), `features/session-continuity.feature`,
`features/session-recovery.feature`, and `features/local-session-development.feature`.
