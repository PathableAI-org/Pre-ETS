# Implementation Plan: Set Up a Session

**Branch**: `002-setup-session-plan` | **Date**: 2026-09-15 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/002-setup-session/spec.md` on `002-setup-session`.

## Summary

Establish anonymous frontend-owned Redis sessions before rendering tenant pages. A Node-runtime
Next.js Proxy inspects the signed session cookie and loads its record before invoking the existing
trusted tenant owner. It accepts matching state or persists a fresh tenant-bound session, then supplies
validated context to downstream rendering and issues a cookie only after a successful write.

This PR contains Phase 0 research and Phase 1 design, plus the route-group rename from `(tenant)`
to `(app)` to reflect application-wide request validation. The rename preserves current behavior. It targets `002-setup-session`, whose
specification and BDD scaffolding form the preceding stack entry. Implementation and task generation
remain later increments; this plan does not make the existing pending session steps pass.

## Technical Context

**Language/Version**: Strict TypeScript 6.0.3, ESM, Node >=24; pnpm 12.4.1.

**Primary Dependencies**: Existing Next.js 16.3.5 / React 19.3.0; add official `redis` and `jose` to
frontend dependencies during implementation, pinning compatible released versions in the root lockfile.
No authentication framework, shared package, or backend dependency.

**Storage**: Frontend-owned Redis string records with atomic expiry. Local Compose uses official
`redis:8.2.9` and `127.0.0.1:6379:6379`; no other services. Process state may retain a connection,
never authoritative sessions. Redis persistence across its own restart is not required.

**Testing**: Existing Vitest frontend tests and Cucumber/Playwright harness. Add cookie/orchestration
unit contracts, real Redis adapter integration checks, and real Next HTTP/browser lifecycle checks.

**Target Platform**: Host-run Next.js Node server; production HTTPS tenant hosts, local development
HTTP host association and explicit static mode. Backend remains a separate host process.

**Project Type**: SSR web frontend with external session storage.

**Performance Goals**: No new latency SLO is specified. Each participating request performs at most
one candidate record read and normally at most one creation write. Bound store operations to a
2-second default timeout; no unbounded offline queue or request retry loop.

**Constraints**: Lookup before tenant resolution; trusted Host remains authoritative; fixed lifetime
(default 86,400 seconds); no sliding renewal; private/no-store responses; no session payload in cookies;
no successful tenant response or new cookie after failed storage; no frontend session access by backend.

**Scale/Scope**: Current tenant application path `/` including its RSC navigation requests. Static and
framework resources do not create sessions. No login, callbacks, logout, identity, drafts, durable
business data, new UI, production infrastructure, or cross-tab coordination.

## Constitution Check

Pre-research review passed: scope and ownership are explicit; the cookie-write request boundary was a
technical research item resolved in [research.md](./research.md), not an unresolved product rule.

| Principle                          | Design gate and post-design result                                                                                                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Evidence-grounded specification | PASS: FR-001–012 and SC-001–005 map to contracts and validation below. The 24-hour default remains the spec's reviewable assumption. Research distinguishes current code from planned behavior.                       |
| II. Explicit ownership             | PASS: session module and Redis dependency belong to frontend; backend, tenant configuration storage, and domain persistence are untouched.                                                                            |
| III. Tenant isolation              | PASS: lookup is provisional until trusted host/configuration and cookie/record bindings agree. Unknown tenants remain denied; internal headers are stripped and overwritten before use. Rejection tests are required. |
| IV. Accessible SSR UI              | PASS: no new interface or client boundary. Preserve existing Display Name and Access denied outcome. Any later UI edit must read installed PathAble guidance and report library gaps per repository policy.           |
| V. Meaningful behavioral tests     | PASS: real requests and Redis prove continuity, expiry, failures, and isolation; browser navigation proves transparent setup. Ordering is a lower-layer contract, not inferred from page text.                        |
| VI. Simplicity and quality         | PASS: one setup owner, one tenant policy, one connection adapter. Existing test tooling and all repository gates are retained.                                                                                        |

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
compose.yaml
packages/frontend/
├── .env.example
├── package.json
├── src/proxy.ts
├── src/lib/session/
│   ├── index.ts                    # Read-only request context accessor
│   ├── setup.ts                    # Sole ordered setup flow
│   ├── cookie.ts                   # jose signing and validation
│   ├── store.ts                    # Redis connection, read, atomic create
│   └── types.ts                    # Record/context/config validation
├── src/lib/tenant/                 # Existing owner; extract explicit-host operations
├── src/app/(app)/               # Consume validated request tenant context
└── tests/                         # Existing unit tests plus Redis integration tests
features/session-*.feature          # Existing acceptance definitions retained
features/local-session-development.feature
tests/bdd/                         # Complete existing steps and extend isolated fixtures
```

**Structure Decision**: Keep all session logic in the frontend. Split only at cookie, storage, and
orchestration seams requiring independent failure tests. Extract transport-independent tenant
operations inside `lib/tenant`; retain its environment split, config validation, and `bindHost`.
No generalized repository layer, plugin system, HTTP session API, or shared contract workspace.

## Request and Rendering Design

1. Match `/` in `src/proxy.ts`, including actual Next RSC requests for that page. Do not match assets,
   favicon, image optimization, or unrelated paths. Explicitly review matcher coverage when adding routes.
2. Strip the reserved `x-pathable-session-context` request header. Parse/verify the session cookie;
   only well-formed signed unexpired references may reach Redis. Await candidate read before tenant lookup.
3. Call the tenant owner's explicit-Host resolver and configuration lookup. Refactor existing
   `headers()`/`forbidden()` adapters rather than calling render-only interrupts from Proxy.
   Preserve production/development selection and configuration error semantics exactly.
4. Compare resolved slug with both cookie and record, plus matching expiry. Reuse only a fully valid
   candidate. Otherwise create a fresh id and atomically store its record with expiry; never mutate or
   delete the foreign candidate. Failed persistence returns controlled 503.
5. Forward minimal validated context and tenant config in the upstream request header using
   `NextResponse.next({ request: { headers } })`. Set the response cookie only for creation/replacement.
   Never put internal context into response headers or rely on a process-global request cache.
6. The server-only accessor validates and returns this context (request-scoped React cache if needed).
   Layout/page consume its tenant/config instead of resolving hosts or setting up sessions again.
   Missing/malformed context fails closed, without fallback creation. Every participating rendering
   path must pass through Proxy; forged-header integration tests enforce this trust boundary.
7. Return HTTP 403 with the existing `Access denied.` outcome for invalid hosts/unknown tenants,
   HTTP 500 for invalid selected tenant configuration, and HTTP 503 with a generic service-unavailable
   message for storage errors. These occur before normal content/streaming. Preserve private/no-store
   for success and all terminal responses, without redirects or sensitive diagnostics.

## Delivery Sequence and Validation

Later tasks should follow these dependent, reviewable slices (no additional branches created here):

1. Frontend dependency/configuration and Redis-only Compose setup, with adapter integration proof and
   local documentation in the same focused commit as the new tool setup.
2. Signed-cookie/record validation and ordered setup contracts; test invalid signatures, finite expiry,
   tenant mismatch, failed writes, recovery, and no adoption of presented ids before integration.
3. Existing tenant resolver extraction plus Proxy/SSR context integration; preserve tenant regression
   behavior and prove the first HTTP response, same-request context, header spoofing rejection, and matcher.
4. Complete session BDD scaffolding and isolated real Redis/browser lifecycle proof; update README,
   `docs/session-state.md`, `docs/multi-tenancy.md`, and `docs/docker-compose.md` to reflect implemented
   ordering, fixed expiry, and Redis-only local services. Authentication remains future work.

The exact interfaces and requirement mapping are in [contracts/session-setup.md](./contracts/session-setup.md).
Run [quickstart.md](./quickstart.md) for validation order. All five repository gates and `git diff --check`
are required before commits; preserve lint-staged and the root `check:changes` hook. Pending BDD steps
must be reported as pending until implemented, never counted as runtime verification.

## Complexity Tracking

No constitution violations or exceptions. The internal request context bridges Proxy and SSR without
assuming shared memory; the small store/cookie seams support required failure and isolation checks.
