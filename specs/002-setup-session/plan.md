# Implementation Plan: Set Up a Session

**Branch**: `002-setup-session-plan` | **Date**: 2026-09-15 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/002-setup-session/spec.md` on `002-setup-session`.

## Summary

Establish anonymous frontend-owned Redis sessions before rendering tenant pages. A Node-runtime
Next.js Proxy inspects the signed session cookie and loads its record before invoking the existing
mode-aware tenant owner. It accepts matching state or persists a fresh tenant-bound session, then
forwards the exact bounded header set to downstream rendering and issues a cookie only after a
successful write. Renamed `AppLayout` consumes that context as the application-wide session and
conditional tenant check.

**Assumptions / framing**: Need evidence is `docs/session-state.md`, `docs/multi-tenancy.md`, and
`docs/docker-compose.md`. SC-001–005 are observed via [quickstart.md](./quickstart.md) Lifecycle
checks (no public session UI). Cost of inaction: later auth/UI-state features cannot meet restart
continuity without this slice. During store outage, controlled 503 may precede invalid-host 403;
after recovery, unknown tenants again return Access denied.

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
(`rediss://` or equivalent) **and** authenticated ACL credentials or mTLS. Process state may retain a
connection (shared in-flight connect promise), never authoritative sessions. Redis persistence across
its own restart is not required. Capacity/rate/eviction policy is deferred to the next session-timeout
feature; this slice disables unbounded offline queuing and relies on later Redis `maxmemory` ops.

**Testing**: Existing Vitest frontend tests and Cucumber/Playwright harness. Add cookie/orchestration
unit contracts, real Redis adapter integration checks, and real Next HTTP/browser lifecycle checks.
CI (`.github/workflows/ci-bdd.yml`) and BDD fixtures must provision Redis plus synthetic session
settings before session steps are required; run `pnpm test:bdd:session` (or `CUCUMBER_SESSION=1`),
not only `pnpm test:bdd`; path filters must include `packages/frontend/src/**`. Process fixtures
isolate keys via `SESSION_KEY_PREFIX` (or a dedicated Redis DB).

**Target Platform**: Host-run Next.js Node server; production HTTPS tenant hosts, local development
HTTP host association and explicit static mode. Backend remains a separate host process.

**Project Type**: SSR web frontend with external session storage.

**Performance Goals**: Soft expectation: setup I/O completes well under the hard deadline on a healthy
local Redis. Hard bound: store operations time out at a 2-second default (capped to Node timer-safe
range) and fail closed. At most one candidate record read and normally at most one creation write per
participating request; no unbounded offline queue or request retry loop. No new formal latency SLO.

**Constraints**: Lookup before tenant resolution; trusted Host remains authoritative in host mode;
static development mode retains Host-independent selection; **provisional** fixed lifetime default
86,400 seconds with no sliding renewal (setup continuity only; detailed timeout/clear-session and
precise expiry-safety predicates deferred to the next session-timeout feature); cookie/`expiresAt`/
`EXAT` aligned on the application clock; private/no-store responses; no session payload or Display
Name in cookies/headers; no successful tenant response or new cookie after failed storage; no frontend
session access by backend; lazy session config parse so build gates need no secrets; signing-key
rotation deferred to a later ops/authentication note (secret change invalidates prior references).

**Scale/Scope**: Current tenant application path `/` including its RSC navigation requests. Static and
framework resources do not create sessions. No login, callbacks, logout, identity, drafts, durable
business data, new UI, production infrastructure, rate-limiter, or cross-tab coordination.

## Constitution Check

Pre-research review passed: scope and ownership are explicit; the cookie-write request boundary was a
technical research item resolved in [research.md](./research.md), not an unresolved product rule.

| Principle                          | Design gate and post-design result                                                                                                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Evidence-grounded specification | PASS: FR-001–012 and SC-001–005 map to contracts and validation below. **Provisional** fixed 86,400s / no sliding renewal is accepted for this setup-only slice; detailed clear-session timeout is the named follow-up feature. Research distinguishes current code from planned behavior. |
| II. Explicit ownership             | PASS: session module and Redis dependency belong to frontend; backend, tenant configuration storage, and domain persistence are untouched.                                                                                                                                                 |
| III. Tenant isolation              | PASS: lookup is provisional until trusted host/configuration and cookie/record bindings agree. Unknown tenants remain denied; session and tenant internal headers are stripped and overwritten to the exact set below. Rejection tests are required.                                       |
| IV. Accessible SSR UI              | PASS: no new interface or client boundary. Preserve existing Display Name and Access denied outcome. Any later UI edit must read installed PathAble guidance and report library gaps per repository policy.                                                                                |
| V. Meaningful behavioral tests     | PASS: real requests and Redis prove continuity, expiry, failures, and isolation; browser navigation proves transparent setup. Ordering is a lower-layer contract, not inferred from page text. Session BDD runs in CI via `test:bdd:session`.                                              |
| VI. Simplicity and quality         | PASS: one setup owner, one tenant policy, one connection adapter. Existing test tooling and all repository gates are retained. Capacity/rate policy deferred rather than invented here.                                                                                                    |

Post-design review passes with no constitutional exceptions. Redis I/O in Proxy is a deliberate narrow
choice for FR-001/003: initial GET must persist and issue its cookie before SSR with no redirect or
visitor action. Keep it limited to the session lookup/write, not general domain data loading.
Constitution I for lifetime is satisfied by the provisional setup-only decision plus the named
session-timeout follow-up; it is not a permanent substitute for clear-timeout product rules.

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
.github/workflows/ci-bdd.yml        # Redis service + synthetic session env; test:bdd:session;
                                    # path filters include packages/frontend/src/**
packages/frontend/
├── .env.example
├── package.json
├── src/proxy.ts
├── src/lib/session/
│   ├── index.ts                    # Read-only request context accessor (+ config via tenant source)
│   ├── setup.ts                    # Sole ordered setup flow
│   ├── cookie.ts                   # jose signing and validation
│   ├── store.ts                    # Shared in-flight connect promise; read; atomic create
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
   Early proof (end of slice 2 or start of 3): real Next 16.3.5 `/` RSC request shape hits the matcher.
2. Strip reserved `x-pathable-session-context` and every `x-preets-tenant-*` request header.
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
   candidate. Otherwise create a fresh id and atomically store its record with expiry. Never mutate or
   delete the foreign candidate. Align cookie `exp`, record `expiresAt`, and Redis `EXAT` on the
   application clock. Precise TTL-vs-timeout safety margins and clear-timeout behavior are deferred to
   the next session-timeout feature. Failed persistence returns controlled 503. A write-timeout 503 may
   leave an expiring orphan; retry establishes a **new** session id.
5. Forward exactly these upstream request headers via `NextResponse.next({ request: { headers } })`:
   - `x-pathable-session-context`: compact ASCII JSON `{ "sessionId", "tenantId", "expiresAt" }`
     (`sessionId` unpadded base64url; `tenantId` canonical slug; `expiresAt` Unix seconds). Never
     Display Name / `tenantConfig`.
   - `x-preets-tenant-slug`: same canonical slug as `tenantId`.
   - `x-preets-tenant-origin`: `host-associated` or `local-static` only.
     Set the response cookie only for creation/replacement. Never put internal context into response
     headers or rely on a process-global request cache.
6. Rename `(tenant)` → `(app)` and `TenantLayout` → `AppLayout` **only in delivery slice 3**.
   `AppLayout` reads the server-only session accessor, confirms validated context, and performs the
   conditional tenant/config consumption for rendering. It does not create sessions, interpret Host, or
   set cookies. Missing/malformed context fails closed. The accessor obtains `tenantConfig` from the
   tenant source using the forwarded slug, not from the header. Forged-header integration tests
   (including legacy `x-preets-tenant-*`) enforce this trust boundary.
7. Return HTTP 403 with the existing `Access denied.` outcome for invalid hosts/unknown tenants,
   HTTP 500 for invalid selected tenant or session configuration (static mode retains current guidance
   copy), and HTTP 503 with a generic service-unavailable message for storage errors. These occur before
   normal content/streaming. Preserve private/no-store for success and all terminal responses, without
   redirects or sensitive diagnostics. Observability: emit only safe outcome classes
   (`reuse` | `create` | `403` | `500` | `503`)—never secrets, raw cookies, or session ids.

### Supersedes (001 Refusal)

**Supersedes** `specs/001-tenant-resolution/contracts/tenant-context.md` Refusal sentence
“Do not put tenant refusal back in Proxy to force a status code.” for Proxy-matched participating
routes (`/`): those routes MAY terminate invalid-host / unknown-tenant / configuration failures in
Proxy with the same visible outcomes (`Access denied.` / static-mode guidance / generic 500).
Layout-only `forbidden()` remains valid for non-participating routes until they join the matcher.
Implementation MUST update the 001 Refusal paragraph in `tenant-context.md` in the Proxy/SSR delivery
slice and keep dual-layer regression coverage.

## Delivery Sequence and Validation

Later tasks should follow these dependent, reviewable slices (no additional branches created here):

1. Frontend dependency/configuration and Redis-only Compose setup, with adapter integration proof
   (shared in-flight connect promise + failure reset; TLS+ACL/mTLS URL rules; no offline queue),
   `docs/docker-compose.md` / README alignment, and lazy config parse gates in the same focused commit
   as the new tool setup. **CI Redis + synthetic session env in `.github/workflows/ci-bdd.yml` must
   land before any merge that routes `/` through `setupSession` on the default test path** (may ship
   as part of this slice or slice 4, but never after default-path enablement).
2. Signed-cookie/record validation and ordered setup contracts; test invalid signatures, finite expiry
   (cookie/`expiresAt`/`EXAT` application-clock alignment; provisional 86,400s default), tenant
   mismatch, failed writes (including write-timeout → new sid on retry), recovery, and no adoption of
   presented ids before integration. End of slice: early Next 16.3.5 matcher/`/` RSC participation
   proof (or first check of slice 3).
3. Compatibility update to the tenant context contract (apply Supersedes Refusal text); mode-aware
   tenant resolver extraction; rename `(tenant)` → `(app)` / `TenantLayout` → `AppLayout`; Proxy/SSR
   exact-header integration. **Rename touchpoints (bound to this slice)**:
   `packages/frontend/src/app/(tenant)/` → `(app)/`; layout export `TenantLayout` → `AppLayout`;
   imports/tests under `packages/frontend/tests/**`; BDD paths/steps referencing `(tenant)` or
   TenantLayout; `specs/001-tenant-resolution/**` and `specs/002-setup-session/**` path mentions;
   README / `docs/multi-tenancy.md` / `docs/session-state.md` route-group names. Preserve tenant
   regression behavior and prove first HTTP response, same-request context, forged session and legacy
   tenant header rejection, static-mode localhost, matcher coverage, and AppLayout session gate.
4. Complete session BDD scaffolding and isolated real Redis/browser lifecycle proof; ensure
   `.github/workflows/ci-bdd.yml` runs `pnpm test:bdd:session` (or `CUCUMBER_SESSION=1`) with path
   filters covering `packages/frontend/src/**`; document `SESSION_KEY_PREFIX` (or DB) isolation and
   cookie-jar-preserving restart; add `@browser` lifecycle coverage where a real jar is required;
   update README, `docs/session-state.md`, and `docs/multi-tenancy.md`. Authentication and signing-key
   rotation remain future work. Capacity/rate/clear-timeout policy remains the next session-timeout
   feature.

**Rollback**: If session setup 503s block tenant pages after enablement, revert the Proxy/session
integration deploy; Redis-only Compose may remain. **Observability**: log/metric only safe outcome
classes (`reuse`, `create`, `403`, `500`, `503`)—never secrets, raw cookies, or session ids.

The exact interfaces and requirement mapping are in [contracts/session-setup.md](./contracts/session-setup.md).
Run [quickstart.md](./quickstart.md) for validation order. All five repository gates and `git diff --check`
are required before commits; preserve lint-staged and the root `check:changes` hook. Pending BDD steps
must be reported as pending until implemented, never counted as runtime verification.

## Complexity Tracking

No constitution violations or exceptions. The internal request context bridges Proxy and SSR without
assuming shared memory; the small store/cookie seams support required failure and isolation checks.
The tenant-contract compatibility update (Supersedes Refusal) is required complexity to keep approved
interfaces consistent. Provisional TTL plus named timeout follow-up resolves Constitution I without
over-scoping this slice.
