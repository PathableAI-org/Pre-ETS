# Implementation Plan: Protect Application Entry Points and Bind Tenant Authentication

**Branch**: `162-protect-entry-points-plan` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature contract in `specs/162-protect-entry-points/spec.md` and
`specs/162-protect-entry-points/verification.md`; delivery issue
[#154](https://github.com/PathableAI-org/Pre-ETS/issues/154), delivery-plan slice S1

## Summary

Add one default protection gate to `@pathableai/pre-ets-frontend-services`, `createProtectionProxy`, and run it from the
Next app's `src/proxy.ts` for every path except framework build assets. The gate admits a closed set of designated
public `GET`/`HEAD` resources without session state; every other page, route handler, and Server Action request —
including resources added later — must present a usable session bound to the independently resolved request tenant.
Otherwise tenant failure keeps its 404/500, a missing session sends classified navigations (Fetch Metadata
`sec-fetch-mode: navigate`, or `sec-fetch-dest: document`) to tenant login (307) and every other request — RSC fetches,
prefetches, refreshes, subresources, Server Actions, and requests without Fetch Metadata — 401, so login is never
started by a non-navigation, a tenant mismatch yields HTTP 403 (an accessible forbidden page for documents), and
undeterminable session state yields 503. Deliberate navigations and protected Server Action submissions renew the
session and re-issue its cookie. A small client guard makes history traversal revalidate with the server. The callback's
confirmed branch now navigates to `/`; its freshness confirmation keeps the fail-closed default owned by #158.

Non-success work completes now. Real login, matching-tenant admission through login, cross-instance
recognition/renewal/expiry, valid-session joining, and history of a page viewed under a real session are explicitly
gated on #158 (increment 5). Recovery content and Server Action HTTP 401 recovery remain #157's. No new service, Layer,
package, or dependency is added.

## Technical Context

**Language/Version**: TypeScript 6.0.3 on Node.js 26+

**Primary Dependencies**: Next.js 16.4.5 App Router (Node.js proxy, `experimental.authInterrupts`), React 19.3.1,
Effect 4.1.2 and `@effect/platform-node` 4.1.2 (named `effect` catalog), `@pathableai/react` 0.3.0, `redis` 6.3.1,
`openid-client` 6.8.9 (unchanged)

**Storage**: Existing frontend-services-owned Redis session and OIDC transaction records only; the existing host-only
`pathable-session` cookie (re-issued on renewal) and synthetic `preets-ref-effect` receipt cookie; no new store or
schema

**Testing**: Vitest 5.1.0 with `@effect/vitest` 4.1.2 and `@fast-check/vitest` 0.5.0 (frontend-services), frontend
Vitest, real-Redis integration suite, Cucumber 13.3.0 requirements BDD with Playwright 1.65.0 Chromium, manual
agent-executable procedure

**Target Platform**: Self-hosted `next start` on Node.js; two independently running frontend processes sharing local
Redis and the tracked Keycloak realm for composed evidence

**Project Type**: Existing pnpm monorepo web application; Effect host adapters in `packages/frontend-services`,
presentation and Next host files in `packages/frontend`, BDD support at the root

**Performance Goals**: No numeric target. A protected request adds one tenant-file read and one Redis operation in the
proxy (prefetches included); public requests and build assets add none. No per-request runtime or Redis client.

**Constraints**: Fail closed (no pass-through on any failure or defect); tenant resolved before session; no session
tenant substitution; no protected content, effect, or cacheable response on denial; no automatic OIDC for Server
Actions; host-only cookies; Next app imports no Effect; no freshness comparison, tolerance, or `CallbackFreshness`
default change; no telemetry assertions; no credentials, references, or PHI in output

**Scale/Scope**: One new public gate (plus one changed callback outcome) in frontend-services; in the Next app the
proxy, one internal protected page, two new feature entries (one extracted, one client guard), and changes to the
forbidden page, `/login-unavailable`, and the reference consumer. Inventory after change: protected pages `/`,
`/access-denied`; protected Server Action `runReferenceOperation`; no protected route handler; public `GET`/`HEAD`
resources `/auth/callback`, `/auth/login`, `/login-unavailable`, `/_test/**`; unmatched build assets
`/_next/static/**` (provisional, F-1).

## Constitution Check

_GATE: Passed before Phase 0 research and re-checked after Phase 1 design. No violation requires Complexity Tracking._

| Principle                                     | Pre-design gate                                                                                                                                                                      | Post-design result                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Evidence-grounded specification            | `spec.md`, `verification.md`, issue #154 scope as recorded in the spec, S1 of the delivery plan, and PREETS-SESSION-001–005/009/013 on `origin/main` `43215557` read as authorities. | Pass. No acceptance criterion or verification obligation is changed. B6 stays an execution gate. Three findings are reported in the five-part format ([research.md](research.md#findings)); none is resolved by assumption.                                                                                                                                  |
| II. Explicit ownership and authoritative data | Session, tenant, and OIDC workflows belong to frontend-services; the Next app owns presentation; no backend or domain data.                                                          | Pass. The gate and all Effect composition live in frontend-services; the Next app supplies a matcher, presentations, and client UI only. Redis stays the only session store; no domain record or backend call.                                                                                                                                               |
| III. Tenant isolation                         | Request tenant resolved independently per request; mismatch must fail closed; host-only cookies.                                                                                     | Pass. The gate resolves tenant from Host before any session read, admits only `readForTenant`/`refreshForTenant` matches, maps mismatch to 403 everywhere, never substitutes the session tenant, and preserves 404/500 tenant failures. Rejection paths are first-class evidence.                                                                            |
| IV. Accessible, server-rendered UI            | UI changes use installed `@pathableai/react`; SSR default; client components justified.                                                                                              | Pass. Pages stay server-rendered. Client code: the existing action consumer (action state) and `RestoredPageGuard` (browser history events only, renders nothing). The forbidden page and consumer keep library components; keyboard/focus is verified in the composed experience (V-018). Implementation reads the installed pathable-react guidance first. |
| V. Meaningful behavioral tests                | Evidence names claims and separates module, framework, application, and manual observations.                                                                                         | Pass. Module evidence in [contracts/modules.md](contracts/modules.md) is claim-based; [quickstart.md](quickstart.md) maps every V-claim without duplicating module observations; no telemetry tests; the temporary undesignated-resource probe is never committed.                                                                                           |
| VI. Simplicity and verifiable quality         | Every new abstraction needs a current consumer and owner.                                                                                                                            | Pass. One public function and one interface with one consumer; one re-export of an existing session function with one consumer; one extracted feature entry (three consumers); one client guard (one consumer); no services, Layers, packages, dependencies, or re-exports without consumers.                                                                |

Architecture constraints: frontend/backend separation unchanged; frontend-services keeps the shared `ManagedRuntime`,
reused in-process by the Node proxy; `packages/frontend` imports no Effect; Fallow zones unchanged (`fallow guard` run
on every file the design touches; all are inside existing zones or the configured proxy exemption).

## Project Structure

### Documentation (this feature)

```text
specs/162-protect-entry-points/
├── spec.md              # approved feature contract (unchanged)
├── verification.md      # approved verification plan (unchanged)
├── checklists/          # specification checklist (unchanged)
├── plan.md              # this file
├── research.md          # facts, decisions D1–D13, findings F-1–F-3
├── contracts/
│   └── modules.md       # module decisions, public contracts, contract evidence
└── quickstart.md        # implementation-aware execution of verification.md
```

`data-model.md` is not produced: the feature adds no stored entity or schema. The closed request classes and outcome
matrix are public-contract semantics and live in [contracts/modules.md](contracts/modules.md).

### Source Code (repository root)

```text
packages/frontend-services/
├── src/
│   ├── index.ts                    # + createProtectionProxy, type ProtectionResponses
│   ├── session.ts                  # + re-export of existing decodeSessionReference
│   ├── next.ts                     # + re-export from next/protection.ts
│   └── next/
│       ├── protection.ts           # NEW private child: designation, classification, outcome program
│       ├── request.ts              # NEW private child: resolveRequestTenant, navigationStatus
│       ├── session.ts              # readSessionRequest uses resolveRequestTenant
│       ├── login.ts                # refuses explicit non-navigations (401, nothing prepared)
│       ├── cookies.ts              # + remainingIdleSeconds (extracted); existing setSessionCookie reused
│       └── callback.ts             # confirmed branch → 303 Location: /
└── tests/
    ├── unit/protection.test.ts     # NEW: examples + Fast-Check property via src/next.ts
    ├── unit/authentication-entry*.test.ts   # 204 → 303; login non-navigation refusal
    └── integration/protection-redis.test.ts # NEW: real SessionService on owned-prefix Redis

packages/frontend/
├── src/
│   ├── proxy.ts                    # gate wiring + matcher
│   ├── app/
│   │   ├── layout.tsx              # renders RestoredPageGuard
│   │   ├── forbidden.tsx           # + link to the application entry
│   │   ├── access-denied/page.tsx  # NEW protected internal page → forbidden()
│   │   ├── login-unavailable/page.tsx  # + requireTenantConfig()
│   │   └── auth/{login,callback}/route.ts  # import from features/access-responses.ts
│   └── features/
│       ├── access-responses.ts     # NEW entry (moved from app/auth/presentation.tsx)
│       ├── access-responses/presentation.tsx
│       ├── history-protection.ts   # NEW entry
│       ├── history-protection/restored-page-guard.tsx
│       └── session-reference/reference-operation.tsx  # rejected invocation → Denied
└── tests/unit/proxy.test.ts        # matcher and wiring

tests/bdd/                          # scenario revisions and additions (quickstart §4)
docs/authentication.md, docs/session-state.md   # current-behavior updates in implementation
```

**Structure Decision**: Extend the existing `frontend-services` Next host-adapter module with one private child and
one public export; keep the Next app's host files thin; move the shared response presentation behind a Bulletproof
feature entry because it gains a consumer outside `app/auth`. `(app)/page.tsx`, `(app)/actions.ts`, and
`readSessionRequest` keep their resource-level checks.

## Phased Engineering Design

### Phase 1 — Module architecture

Decisions per responsibility are tabulated in [contracts/modules.md](contracts/modules.md#module-architecture-decisions).
In short: **extend** `frontend-services/src/next.ts` with the protection gate (private child
`next/protection.ts`); **add** private `next/request.ts` so the gate and `readSessionRequest` share one request-tenant step and the gate and
login handler share one navigation predicate; **preserve** `SessionService`, `TenantConfigService`, the
`readSessionRequest` contract, and the runtime; **extend** the `session.ts` entry with a re-export of the existing
`decodeSessionReference` so the gate can reuse `setSessionCookie`; **extend behavior** of `createCallbackHandler`
(success navigation) and `createLoginHandler` (refuse non-navigations) without signature change; **extract** the auth
response presentation to `features/access-responses.ts` because the proxy becomes a consumer outside `app/auth`;
**add** `features/history-protection.ts` for the only browser-side concern; **extend** the reference consumer,
`/login-unavailable`, and the forbidden page; **add** the internal `/access-denied` page as the forbidden rewrite target.

Why a proxy and not something else: it is the only boundary that sees all three entry kinds before resource code, so
new resources are protected with no opt-in (research D1). Why the authoritative read in the proxy rather than Next's
optimistic cookie check: a future resource without its own check must still reject forged, missing-record, expired, and
invalidated references. Why resource-level checks stay: Next recommends verification inside each Server Function, the
page needs identity anyway, and a matcher regression must not silently open the existing resources. No new service or
Layer is warranted: the gate is a per-request composition of existing services with one consumer.

### Phase 2 — Public module contracts

[contracts/modules.md](contracts/modules.md#public-contracts) records exact signatures. Compatibility-sensitive points:

- `createProtectionProxy(responses: ProtectionResponses) => (request: NextRequest) => Promise<NextResponse>` is
  additive. Its outcome matrix (public pass-through; 404/500; 307 vs 401; host 403 vs 403; 503; pass-through with
  `private, no-store` and optional cookie re-issue) is the HTTP contract the app and #157 build on. Expected failures
  are translated into responses; defects reject and never pass through.
- The public designation is a closed set owned privately by the gate; #157 adds its recovery path there.
- `createCallbackHandler` keeps its signature; the confirmed branch changes 204 → 303 `/`.
- `createLoginHandler` keeps its signature; an explicit non-navigation gets 401 and prepares nothing.
- `session.ts` re-exports `decodeSessionReference` (one consumer: the gate); `SessionService` is unchanged.
- Request classification uses Fetch Metadata, because Next strips Flight headers (`rsc`, prefetch headers) from the
  proxy request; `skipProxyUrlNormalize` is rejected as a global change (research D3).
- `proxy.ts` matcher literal `"/((?!_next/static/|_next/webpack-hmr|__nextjs).*)"`; build-asset exclusion is
  provisional under F-1.
- Frontend feature entries: `access-responses` (moved, behavior unchanged), `history-protection`
  (`RestoredPageGuard`), `session-reference` (exports unchanged, denial behavior added).

### Phase 3 — Module contract evidence

Claim-based evidence is tabulated per module in [contracts/modules.md](contracts/modules.md):

- **Durable, public-interface (frontend-services Vitest through `src/next.ts`)**: a Fast-Check property that a request
  passes without a usable session iff it is in the public designation (generated pathnames, methods, and header
  subsets, with named examples for designated paths, near-misses, and percent-encoded spellings); table-driven outcome-matrix examples including Fetch Metadata combinations (navigate, cors, no-cors image for
  `/favicon.ico` and `/_next/image`, absent) that prove only navigations can receive the login redirect; login handler
  examples that non-navigations prepare nothing; tenant-first
  ordering and 404/500 preservation in host and static semantics; renewal activity/policy selection and cookie
  re-issue with a fixed `Clock`; no session read for public requests; rejection on defect. Revised callback adapter
  scenarios for 303.
- **Durable, real integration**: `protection-redis.test.ts` runs the gate over the real `SessionService` with owned
  Redis prefixes to show expired, invalidated, mismatched, and outage outcomes reach the HTTP mapping unchanged. This is
  the automated stand-in for prepared-record running-app rows before #158 (F-2).
- **Durable, framework wiring (frontend Vitest)**: matcher literal and path examples; `forbiddenDocument` rewrite.
- **Existing evidence reused**: session service/store suites (#218–#221), tenant service suites, OIDC initiation and
  callback BDD, two-process harness.
- **Transient/manual module evidence**: a browser probe of `RestoredPageGuard` behavior during implementation
  (quickstart §5); no durable test owns browser history internals. No telemetry is asserted anywhere.

### Phase 4 — Implementation architecture

**Gate program** (`next/protection.ts`): a pure classifier produces `public | { entry: "document" | "application";
renewal: QualifyingSessionActivity | undefined }` from method, pathname, `next-action`, and `navigationStatus(headers)`
(`sec-fetch-mode`, then `sec-fetch-dest`; absent metadata is unknown and classified as application). For protected
requests an `Effect.fn("protectRequest")` program runs the shared `resolveRequestTenant(host)` step (the same one
`readSessionRequest` now uses), then calls
`SessionService.refreshForTenant({ activity, policy: effectiveSessionPolicy(config), reference, tenantAlias })` for
qualifying renewal or `readForTenant({ reference, tenantAlias })` otherwise. `Effect.matchEffect` maps the typed
failures (`TenantFailure` → `responses.tenantFailure(tenantFailureStatus(f))`, `SessionServiceUnavailable` → 503,
`SessionTenantMismatch` → document `forbiddenDocument` / application 403) and successes (`NoUsableSession` → 307 or
401, `Location` = `new URL("/auth/login", request.nextUrl)`; `UsableSession` → `NextResponse.next` with
`PRIVATE_NO_STORE` and, after renewal, `setSessionCookie(response, request, reference, remainingIdleSeconds(deadline,
now))` where `reference` comes from `decodeSessionReference` on the request cookie and `now` from
`Clock.currentTimeMillis`). The gate sets `PRIVATE_NO_STORE` on host-factory responses (forbidden rewrite, tenant
failure) as well. The program runs through the existing `toNext`, which maps `StartupNotReady` to 503.
Branching is on `_tag`, as `next/session.ts` does, because chunk duplication varies class identity.

**Runtime and resources**: Node proxy runs in-process (installed `next-server.js`), reads the runtime published by
`startProductionRuntime`, and never constructs one. Before startup completes the gate answers 503.

**Next host composition**: `src/proxy.ts` exports `proxy = createProtectionProxy({ forbiddenDocument, tenantFailure:
tenantFailureResponse })` and the matcher. `/access-denied/page.tsx` calls `forbidden()`. Root layout renders
`<RestoredPageGuard />`. `/login-unavailable` awaits `requireTenantConfig()`. The reference consumer wraps
`action(previousState, formData)` in a client function that converts a rejection into `Denied`. `next.config.ts`
keeps `authInterrupts` and its existing `/` header.

**Callback**: `establishSession` returns `new NextResponse(null, { status: 303, headers: { location: "/",
"cache-control": PRIVATE_NO_STORE } })` with the existing cookie writes. `CallbackFreshness` is untouched.

**Configuration and infrastructure**: none new. Existing `SESSION_KEY_PREFIX`, `OIDC_*`, and `REDIS_URL` apply.

**Telemetry**: the gate is a traced `Effect.fn` span with no attribute containing a reference, identity, or Host
beyond what existing spans record. Observability is verified manually only if a probe is used; nothing durable.

**Documentation**: implementation updates `docs/authentication.md` (proxy is no longer pass-through; callback 303) and
`docs/session-state.md` (default protection, outcome matrix, renewal sources, inventory). `specs/` outside this
directory are not touched.

**Implementation increments** (each a reviewable implementation branch or commit series; gates in bold):

| # | Increment                      | Content                                                                                                                                                                                                                                                                | Evidence completed                                                                                                                                                                       | Gate                                                    |
| - | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1 | Protection contract            | `next/protection.ts`, `next/request.ts` (and `readSessionRequest` moved onto it), login non-navigation refusal, `remainingIdleSeconds` extraction, `decodeSessionReference` re-export, `next.ts`/`index.ts` exports; unit, property, and real-Redis integration suites | Module evidence for the gate                                                                                                                                                             | None                                                    |
| 2 | Application default protection | `proxy.ts` + matcher, `/access-denied`, `access-responses` extraction, `/login-unavailable` tenant resolution, forbidden link, consumer denial, BDD revisions/additions, docs                                                                                          | V-001, V-002 (probe), V-003, V-005, V-006 (non-success), V-009 (application-level), V-011, V-012 (fabricated references), V-013 (direct), V-016, V-017, V-018 (sign-in error, forbidden) | None. **Final asset designation and V-004 wait on F-1** |
| 3 | Fresh entry and history        | `RestoredPageGuard` and its probe; running-app fresh-entry verification with fabricated and removed references (renewal mechanics ship in increment 1)                                                                                                                 | V-014 (fresh-entry part), V-015 mechanism (no viewed-under-session precondition)                                                                                                         | None                                                    |
| 4 | Callback success navigation    | 303 to `/` in the confirmed branch; adapter scenarios revised                                                                                                                                                                                                          | Module evidence only                                                                                                                                                                     | None for implementation                                 |
| 5 | Success-path feature evidence  | Real-login Cucumber scenarios and manual gated steps: login A→B, joining, renewal on A/expiry on B, mismatch with a real cookie, history step 7b, confirmed-vs-unconfirmed V-006                                                                                       | V-007, V-008, V-014 (joining), V-015 (step 7b), V-006 (distinction), V-009/V-010 with real cookies, SESSION-005 AC1                                                                      | **#158 B6 freshness confirmation functioning**          |
| — | Recovery composition           | Recovery content and its public path; Server Action 401 recovery; running-tab modal                                                                                                                                                                                    | SESSION-004 AC2 composition                                                                                                                                                              | **#157** (separate feature; SESSION-004 shipping gate)  |

Increments 1–4 may merge with `@partial` BDD and an evidence record that reports increment-5 claims as incomplete.
The S1 shipping gates (#157 recovery, #158 verified freshness) remain as the specification states.

### Phase 5 — Feature verification integration

[quickstart.md](quickstart.md) operationalizes [verification.md](verification.md) without replacing it: exact
prerequisites, commands, Cucumber scenario revisions and additions, the manual procedure mapped to the implemented
outcomes (prepared records only through a transient public-service preparer, F-2), expected observations, cleanup,
retained records, and limitations. Module evidence (Phase 3) is cited, not re-run as feature evidence; each V-claim
is observed once at its responsible boundary. Gated claims (V-007, V-008, joining in V-014, step 7b of V-015, the
V-006 distinction, real-login SESSION-005 AC1) are reported incomplete until #158 functions, never satisfied with
prepared records or a provided `CallbackFreshness`. V-004 remains open until F-1 is decided.

## Complexity Tracking

No Constitution Check violation requires justification.
