# Implementation Plan: Set Up a Session

**Branch**: `002-setup-session-plan` | **Date**: 2026-09-15 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/002-setup-session/spec.md` on `002-setup-session`.

## Summary

Establish anonymous frontend-owned Redis sessions before rendering tenant pages. A Node-runtime
Next.js Proxy inspects the signed session cookie and loads its record before invoking the existing
mode-aware tenant owner. It accepts matching state or persists a fresh tenant-bound session, then
forwards bounded validated context to downstream rendering and issues a cookie only after a successful
write. Renamed `AppLayout` consumes that context as the application-wide session and conditional
tenant check.

This PR contains Phase 0 research and Phase 1 design only. It targets `002-setup-session`, whose
specification and BDD scaffolding form the preceding stack entry. Implementation and task generation
remain later increments; this plan does not make the existing pending session steps pass.

## Technical Context

**Language/Version**: Strict TypeScript 6.0.3, ESM, Node >=24; pnpm 12.4.1.

**Primary Dependencies**: Existing Next.js 16.3.5 / React 19.3.0; add official `redis` and `jose` to
frontend dependencies during implementation, pinning compatible released versions in the root lockfile.
No authentication framework, shared package, or backend dependency.

**Storage**: Frontend-owned Redis string records with atomic expiry. Local Compose uses official
`redis:8.2.9` and `127.0.0.1:6379:6379`; no other services. Non-local Redis URLs require TLS
(`rediss://` or equivalent). Process state may retain a connection, never authoritative sessions.
Redis persistence across its own restart is not required.

**Testing**: Existing Vitest frontend tests and Cucumber/Playwright harness. Add cookie/orchestration
unit contracts, real Redis adapter integration checks, and real Next HTTP/browser lifecycle checks.
CI and BDD fixtures must provision Redis plus synthetic session settings before session steps are
required; process fixtures isolate keys via `SESSION_KEY_PREFIX` (or a dedicated Redis DB).

**Target Platform**: Host-run Next.js Node server; production HTTPS tenant hosts, local development
HTTP host association and explicit static mode. Backend remains a separate host process.

**Project Type**: SSR web frontend with external session storage.

**Performance Goals**: No new latency SLO is specified. Each participating request performs at most
one candidate record read and normally at most one creation write. Bound store operations to a
2-second default timeout (capped to Node timer-safe range); no unbounded offline queue or request
retry loop.

**Constraints**: Lookup before tenant resolution; trusted Host remains authoritative in host mode;
static development mode retains Host-independent selection; fixed lifetime (default 86,400 seconds)
with a minimum above the store timeout; no sliding renewal; private/no-store responses; no session
payload or Display Name in cookies/headers; no successful tenant response or new cookie after failed
storage; no frontend session access by backend; lazy session config parse so build gates need no secrets.

**Scale/Scope**: Current tenant application path `/` including its RSC navigation requests. Static and
framework resources do not create sessions. No login, callbacks, logout, identity, drafts, durable
business data, new UI, production infrastructure, or cross-tab coordination.

## Constitution Check

Pre-research review passed: scope and ownership are explicit; the cookie-write request boundary was a
technical research item resolved in [research.md](./research.md), not an unresolved product rule.

| Principle                          | Design gate and post-design result                                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Evidence-grounded specification | PASS: FR-001–012 and SC-001–005 map to contracts and validation below. The 24-hour default remains the spec's reviewable assumption. Research distinguishes current code from planned behavior.                                      |
| II. Explicit ownership             | PASS: session module and Redis dependency belong to frontend; backend, tenant configuration storage, and domain persistence are untouched.                                                                                           |
| III. Tenant isolation              | PASS: lookup is provisional until trusted host/configuration and cookie/record bindings agree. Unknown tenants remain denied; session and legacy tenant internal headers are stripped and overwritten. Rejection tests are required. |
| IV. Accessible SSR UI              | PASS: no new interface or client boundary. Preserve existing Display Name and Access denied outcome. Any later UI edit must read installed PathAble guidance and report library gaps per repository policy.                          |
| V. Meaningful behavioral tests     | PASS: real requests and Redis prove continuity, expiry, failures, and isolation; browser navigation proves transparent setup. Ordering is a lower-layer contract, not inferred from page text.                                       |
| VI. Simplicity and quality         | PASS: one setup owner, one tenant policy, one connection adapter. Existing test tooling and all repository gates are retained.                                                                                                       |

Post-design review passes with no constitutional exceptions. Redis I/O in Proxy is a deliberate narrow
choice for FR-001/003: initial GET must persist and issue its cookie before SSR with no redirect or
visitor action. Keep it limited to the session lookup/write, not general domain data loading.

## Project Structure

### Documentation (this feature)

```text
specs/002-setup-session/
├── spec.md                         # Existing approved-scope input
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── session-setup.md
```

`tasks.md` is generated later by speckit-tasks, not by this planning command.

### Source Code (planned changes)

```text
compose.yaml                        # Redis-only; docs/docker-compose.md updated in same slice
.github/workflows/ci.yml            # Redis service + synthetic session env for test:bdd
packages/frontend/
├── .env.example
├── package.json
├── src/proxy.ts
├── src/lib/session/
│   ├── index.ts                    # Read-only request context accessor (+ config via tenant source)
│   ├── setup.ts                    # Sole ordered setup flow
│   ├── cookie.ts                   # jose signing and validation
│   ├── store.ts                    # Redis connection, read, atomic create
│   └── types.ts                    # Record/context/config validation (lazy parse)
├── src/lib/tenant/                 # Existing owner; extract mode-aware operations; revise contract
├── src/app/(app)/                  # Rename (tenant)→(app); AppLayout = session + conditional tenant gate
└── tests/                         # Existing unit tests plus Redis integration tests
features/session-*.feature          # Existing acceptance definitions retained; add @browser lifecycle
features/local-session-development.feature
tests/bdd/                         # Complete steps; prefix/DB isolation; preserve cookie jar on restart
specs/001-tenant-resolution/contracts/tenant-context.md  # Compatibility update with Proxy refusal
```

**Structure Decision**: Keep all session logic in the frontend. Split only at cookie, storage, and
orchestration seams requiring independent failure tests. Extract mode-aware tenant operations inside
`lib/tenant`; retain its environment split, config validation, and `bindHost` for host mode. No
generalized repository layer, plugin system, HTTP session API, or shared contract workspace.

## Request and Rendering Design

1. Match `/` in `src/proxy.ts`, including actual Next RSC requests for that page. Do not match assets,
   favicon, image optimization, or unrelated paths. Explicitly review matcher coverage when adding routes.
2. Strip reserved `x-pathable-session-context` and every established `x-preets-tenant-*` request header.
   Parse/verify the session cookie; only well-formed signed unexpired references may reach Redis.
   Await candidate read before tenant lookup. Session configuration is resolved lazily here (or on first
   store/cookie use), not at module import.
3. Call the tenant owner's **mode-aware** resolver and configuration lookup: host mode binds the trusted
   `Host`; static development mode resolves the configured local record without Host binding; production
   always uses host mode. Refactor existing `headers()`/`forbidden()` adapters into transport-independent
   operations plus Proxy/render adapters rather than calling render-only interrupts from Proxy.
   Preserve production/development selection and configuration error semantics exactly (including
   actionable static-mode local-config guidance).
4. Compare resolved slug with both cookie and record, plus matching expiry. Reuse only a fully valid
   candidate. Otherwise create a fresh id and atomically store its record with expiry; never mutate or
   delete the foreign candidate. Abort creation without a cookie when `expiresAt` is not safely after
   setup completion. Failed persistence returns controlled 503.
5. Forward only bounded validated session fields (`sessionId`, `tenantId`, `expiresAt`)—never Display
   Name / full `tenantConfig`—via `NextResponse.next({ request: { headers } })`. Set the response cookie
   only for creation/replacement. Never put internal context into response headers or rely on a
   process-global request cache.
6. Rename `(tenant)` → `(app)` and `TenantLayout` → `AppLayout`. `AppLayout` is where the former tenant
   check becomes the session-aware gate: it reads the server-only session accessor, confirms validated
   context, and performs the conditional tenant/config consumption for rendering. It does not create
   sessions, interpret Host, or set cookies. Missing/malformed context fails closed. The accessor obtains
   `tenantConfig` from the tenant source using the forwarded slug, not from the header. Forged-header
   integration tests (including legacy `x-preets-tenant-*`) enforce this trust boundary.
7. Return HTTP 403 with the existing `Access denied.` outcome for invalid hosts/unknown tenants,
   HTTP 500 for invalid selected tenant or session configuration (static mode retains current guidance
   copy), and HTTP 503 with a generic service-unavailable message for storage errors. These occur before
   normal content/streaming. Preserve private/no-store for success and all terminal responses, without
   redirects or sensitive diagnostics.

Update `specs/001-tenant-resolution/contracts/tenant-context.md` (and its regression expectations) in the
Proxy/SSR integration slice so approved tenant refusal language matches this Proxy-capable flow.

## Delivery Sequence and Validation

Later tasks should follow these dependent, reviewable slices (no additional branches created here):

1. Frontend dependency/configuration and Redis-only Compose setup, with adapter integration proof,
   `docs/docker-compose.md` / README alignment, TLS vs loopback URL validation, and lazy config parse
   gates in the same focused commit as the new tool setup.
2. Signed-cookie/record validation and ordered setup contracts; test invalid signatures, finite expiry
   (including TTL vs store-timeout minimum), tenant mismatch, failed writes, recovery, clock/EXAT
   alignment rules, and no adoption of presented ids before integration.
3. Compatibility update to the tenant context contract; mode-aware tenant resolver extraction; rename
   `(tenant)` → `(app)` / `TenantLayout` → `AppLayout`; Proxy/SSR bounded-context integration. Preserve
   tenant regression behavior and prove first HTTP response, same-request context, forged session and
   legacy tenant header rejection, static-mode localhost, matcher coverage, and AppLayout session gate.
4. Complete session BDD scaffolding and isolated real Redis/browser lifecycle proof; provision CI Redis
   and synthetic session env for `pnpm test:bdd`; document `SESSION_KEY_PREFIX` (or DB) isolation and
   cookie-jar-preserving restart; add `@browser` lifecycle coverage where a real jar is required; update
   README, `docs/session-state.md`, and `docs/multi-tenancy.md`. Authentication remains future work.

The exact interfaces and requirement mapping are in [contracts/session-setup.md](./contracts/session-setup.md).
Run [quickstart.md](./quickstart.md) for validation order. All five repository gates and `git diff --check`
are required before commits; preserve lint-staged and the root `check:changes` hook. Pending BDD steps
must be reported as pending until implemented, never counted as runtime verification.

## Complexity Tracking

No constitution violations or exceptions. The internal request context bridges Proxy and SSR without
assuming shared memory; the small store/cookie seams support required failure and isolation checks.
The tenant-contract compatibility update is required complexity to keep approved interfaces consistent.
