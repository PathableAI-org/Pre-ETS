# Research: Set Up a Session

Date: 2026-09-15. Updated after critique `critique-20260915-151255` and Copilot review on
`036d594`. All planning unknowns resolved; implementation must verify the chosen integration against
the installed framework and real Redis. This document records decisions, not completed behavior.

## 1. Cookie-write boundary

**Decision**: Use `src/proxy.ts`, Node runtime by default, without exporting a runtime option. Perform
session setup there and set the outgoing cookie before rendering. Scope the matcher to the actual
application path `/`, including its RSC requests. Prove the real Next 16.3.5 `/` RSC request shape
against the matcher at the end of delivery slice 2 or the start of slice 3 so late discovery cannot
invalidate earlier cookie/store seams.

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

## 2. Mode-aware tenant policy, exact Proxy→SSR headers, and Supersedes Refusal

**Decision**: Extract transport-independent tenant operations inside the existing tenant owner. The
operation is mode-aware: production and development host mode bind the trusted `Host`; development
static mode resolves the configured `TENANT_LOCAL_CONFIG_JSON` record without Host binding; production
always uses host mode. Proxy translates typed tenant failures into HTTP responses.

**Exact Proxy→SSR request header set** (after strip, on successful setup only):

| Header                       | Encoding / value                                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `x-pathable-session-context` | Compact ASCII JSON object `{ "sessionId", "tenantId", "expiresAt" }` (no whitespace). `sessionId`: unpadded base64url sid; `tenantId`: canonical slug; `expiresAt`: Unix seconds integer. Never Display Name / `tenantConfig`. |
| `x-preets-tenant-slug`       | Canonical validated slug (ASCII lowercase), same string as `tenantId`.                                                                                                                                                         |
| `x-preets-tenant-origin`     | Closed set only: `host-associated` \| `local-static` (per `001` BoundTenant origin).                                                                                                                                           |

Strip every caller-supplied `x-pathable-session-context` and every `x-preets-tenant-*` value first, then
overwrite exactly these three names. Do not invent additional `x-preets-tenant-*` fields. SSR never
creates sessions. The server-only session accessor validates the bounded session fields and obtains
configuration through the existing tenant source (memoized within the request) using `tenantId`;
origin remains the closed mode-binding discriminator from the tenant contract.

Rename `(tenant)` → `(app)` and `TenantLayout` → `AppLayout` during delivery slice 3 only (see plan
touchpoints). `AppLayout` consumes the Proxy-established session context and performs the updated
session-aware tenant check; it does not re-run store setup or issue cookies.

**Supersedes** (must land with Proxy/SSR slice; sibling contract mirrors this):

> **Supersedes** `specs/001-tenant-resolution/contracts/tenant-context.md` Refusal sentence
> “Do not put tenant refusal back in Proxy to force a status code.” for Proxy-matched participating
> routes (`/`): those routes MAY terminate invalid-host / unknown-tenant / configuration failures in
> Proxy with the same visible outcomes (`Access denied.` / static-mode guidance / generic 500).
> Layout-only `forbidden()` remains valid for non-participating routes until they join the matcher.
> Implementation MUST update the 001 Refusal paragraph in `tenant-context.md` in the Proxy/SSR
> delivery slice and keep dual-layer regression coverage.

**Rationale**: Existing `dev.ts`/`prod.ts` depend on `next/headers` and `forbidden()`. Their underlying
host/config logic must be reusable without introducing another parser, and static mode must keep working
on bare `localhost` (FR-011). Separate Proxy/render contexts cannot share module memory. Display Name has
no header size/encoding bound (tenant research §5). Locking slug + origin alongside bounded session
fields preserves the established tenant handoff while session context carries setup identity. Exact
supersession removes the dual approved Refusal conflict (Constitution I / Governance).

**Alternatives considered**: Re-reading Redis in each component repeats lookup and can violate ordering;
module globals can leak state between visitors; trusting a browser-provided header defeats tenant
isolation; serializing full config reintroduces Unicode/size policy; leaving Refusal layout-only
conflicts with cookie-before-SSR ordering for denied hosts after a store read; collapsing to a single
opaque session header loses the closed origin discriminator required by static-mode distinguishability.

**Evidence**: `packages/frontend/src/lib/tenant/{index,dev,prod,host,types,source}.ts`;
`specs/001-tenant-resolution/research.md` §5; `specs/001-tenant-resolution/data-model.md` BoundTenant;
`specs/001-tenant-resolution/contracts/tenant-context.md` §Refusal;
[NextResponse request headers](https://nextjs.org/docs/app/api-reference/functions/next-response).

## 3. Session storage, TLS/auth, connection share, and outage behavior

**Decision**: Use official `redis`, a single lazily connected frontend client shared via one in-flight
connection promise (concurrent first requests await the same promise; they must not each call
`connect()`). On connect/command timeout or failure, reset that promise so a later request can
reconnect; register a safe error listener; disable offline queuing; bound operations (default 2
seconds, capped to the Node timer-safe maximum). Namespaced string keys; one atomic `SET` with `NX`
and absolute `EXAT` expiry. Normal creation uses a 32-byte random id; an unlikely collision permits
one new id attempt, then controlled failure. Do not cache records or negative lookups. No unbounded
offline command queue.

`REDIS_URL` validation: allow plain `redis://` only for loopback/local Compose targets. Every
non-local URL requires TLS (`rediss://` or equivalent) **and** authenticated ACL credentials or mTLS.
Reject non-local cleartext and non-local TLS-without-auth at config parse time. Validate without
logging URLs that contain credentials, ACL passwords, or certificate material.

Expiry clock: compute `expiresAt` once from the application clock for cookie `exp` and the JSON
record; pass the same absolute Unix seconds to Redis `EXAT`. Cookie `exp` is the visitor-visible
lifetime; Redis TTL is best-effort cleanup (server clock skew may evict slightly early or late). Do
not extend lifetime for skew. Precise TTL-vs-timeout safety margins, clear-session / timeout UX, and
capacity-driven eviction predicates are **deferred** to the next session-timeout feature (see §4).

Write-timeout note: a timed-out `create` may leave an orphan that expires under Redis TTL while the
client receives 503; a retry establishes a **new** session id (visitor-visible discontinuity is
accepted for this increment).

Outage tradeoff (accepted): during storage failure, setup may return controlled 503 before
invalid-host 403 completes; after recovery, unknown tenants again return Access denied. Emit only
safe outcome-class diagnostics (`reuse` | `create` | `403` | `500` | `503`)—never secrets, raw
cookies, or session ids.

Cookie-less request floods / capacity / rate limiting: acknowledge the risk; do **not** invent a
rate-limiter in this slice. Defer capacity, rate, and eviction policy to the next session-timeout
feature. This slice relies on no unbounded offline queue and later Redis `maxmemory` ops policy.

**Rationale**: Atomic expiry avoids immortal orphan records. Fixed deadlines turn outages into
observable 503 responses. Shared connect promise prevents thundering-herd connect races. TLS plus
ACL/mTLS protects session records off-box. Aligning cookie and record values on one application clock
keeps the signed reference coherent without inventing timeout-policy predicates here.

**Alternatives considered**: Separate SET/EXPIRE can leave immortal records; process-local fallback
breaks restart continuity; queued writes can report misleading late success; using Redis `TIME` for
the cookie couples browser expiry to an opaque remote clock; building a rate-limiter or eviction
policy now exceeds setup-session scope.

**Evidence**: [node-redis](https://github.com/redis/node-redis),
[Redis SET](https://redis.io/docs/latest/commands/set/), and `docs/session-state.md`.

## 4. Signing, provisional fixed lifetime, and lazy configuration

**Decision (provisional for this slice; Constitution I)**: Use `jose` with HS256 explicitly allowed, a
required server-only secret of at least 32 random bytes, and strict claims `{ sid, tenant, exp }`.
Lifetime defaults to **86,400 seconds**, configurable, with **no sliding renewal**. Stakeholder
guidance: the **next** feature/slice focuses on clear session timeout. This increment uses the
provisional fixed default only to keep setup continuity workable; it does **not** over-specify TTL
margins, unit-comparison predicates, clear-timeout semantics, or capacity-driven eviction.

Align cookie `exp`, record `expiresAt`, and Redis `EXAT` on the application clock. Defer to the next
session-timeout feature: detailed timeout / clear-session behavior, precise expiry-safety predicates,
and capacity/rate/eviction policy. Reject non-positive or non-representable TTL values; do not encode
a “strictly greater than `SESSION_STORE_TIMEOUT_MS`” seconds-vs-ms comparison as a product rule here.

Parse session configuration lazily on the first participating request (or first store/cookie use), not
at module import of `proxy.ts` / session modules, so clean-checkout `pnpm build` / `pnpm typecheck`
succeed without secrets. Missing or invalid runtime configuration fails closed with generic HTTP 500
and a safe diagnostic. Unit/contract coverage must prove both: import/build without secrets succeeds,
and a participating request without configuration returns 500 without issuing a cookie.

**Key rotation**: Explicitly deferred to a later ops/authentication note. A secret change invalidates
prior references; normal setup replaces them. Single-secret invalidate-and-replace is accepted until
that note exists; this slice does not define rotation ceremony or dual-key verification.

**Rationale**: Spec and session strategy require signed references, not encrypted payloads or auth.
Lazy parsing matches tenant configuration patterns. Provisional TTL resolves Constitution I for
setup-only without blocking on the forthcoming timeout product rules.

**Alternatives considered**: Unsigned ids fail FR-006; session payloads in JWTs create a second state
store; sliding renewal and full timeout policy belong to the next feature; eager module-load
validation breaks CI build gates; inventing dual-key rotation here expands ops scope.

**Evidence**: [jose](https://github.com/panva/jose), `docs/session-state.md`, spec FR-006/007,
existing tenant env loading in `packages/frontend/src/lib/tenant`; stakeholder guidance that the next
slice owns clear session timeout.

## 5. Local services, CI Redis, and evidence layers

**Decision**: Add only official Redis `8.2.9` on loopback, with a ping healthcheck. Keep app processes
on the host. Update `docs/docker-compose.md` (and README pointers) in the same focused commit as the
Redis-only Compose change. Extend existing Vitest and Cucumber/Playwright rather than introduce a
test framework.

Isolation: unit tests may inject a store prefix via constructor. Real HTTP/BDD fixtures that spawn a
frontend process MUST set a documented test-only `SESSION_KEY_PREFIX` (or dedicated Redis logical
database) in that process environment, track scenario-owned keys/ids, and delete only that namespace.
Never `FLUSHALL`. Cookie-jar continuity across frontend restart MUST preserve the browser context or
capture/replay the raw `Set-Cookie` rather than closing all contexts in `restartOwnedProcess`.

CI: provision Redis (workflow service or fixture-managed lifecycle) and synthetic
`REDIS_URL` / `SESSION_SIGNING_SECRET` / prefix settings in `.github/workflows/ci-bdd.yml` before any
merge that routes `/` through `setupSession` on the default test path (E9). CI must run
`pnpm test:bdd:session` (or equivalent `CUCUMBER_SESSION=1` session partition), not only
`pnpm test:bdd`. Update path filters so changes under `packages/frontend/src/**` (and existing BDD
paths) cannot bypass session BDD. Session lifecycle proofs that need a real cookie jar use `@browser`
(and HTTPS or raw-header assertions for `Secure`).

**Product framing (brief)**: Need evidence is grounded in `docs/session-state.md`,
`docs/multi-tenancy.md`, and `docs/docker-compose.md`. Reviewers observe SC-001–005 via
`quickstart.md` Lifecycle checks (no public session UI). Cost of inaction: later auth/UI state
features cannot meet restart continuity without this slice.

**Rationale**: Compose strategy describes future broker/Postgres services, but this spec narrows this
increment to Redis. Without CI Redis and session BDD on frontend src changes, enabling setup will
fail or silently skip coverage once `/` routes through setup.

**Alternatives considered**: Full architecture Compose exceeds scope; mock-only Redis cannot prove
external continuity; deferring Compose docs or CI Redis until the final slice leaves contradictory
instructions and broken default-path merges.

**Evidence**: [official Redis image](https://hub.docker.com/_/redis), `docs/docker-compose.md`,
`.github/workflows/ci-bdd.yml`, `package.json` scripts `test:bdd` / `test:bdd:session`,
`tests/bdd/support/server.ts`, `tests/bdd/steps/session.steps.ts` (currently pending),
`features/session-continuity.feature`, `features/session-recovery.feature`, and
`features/local-session-development.feature`.
