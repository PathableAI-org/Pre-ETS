# Research: Protect Application Entry Points and Bind Tenant Authentication

**Plan**: [plan.md](plan.md) | **Feature contract**: [spec.md](spec.md), [verification.md](verification.md)

This record establishes current implementation and dependency facts, then records the technical decisions the plan
depends on. It does not change the approved specification or verification plan. Inspected revision: branch
`162-protect-entry-points-plan` on top of `929566a`; requirement baseline `origin/main` at
`43215557c35380322d759d2918456e02c3a0c7b2`.

## Current implementation facts

| Area                       | Fact (source)                                                                                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proxy                      | `packages/frontend/src/proxy.ts` is pass-through with `matcher: ["/", "/auth/callback"]`; it enforces nothing.                                                                                                                                                                                          |
| Protected consumers        | Only `(app)/page.tsx` (`/`) and `(app)/actions.ts` (`runReferenceOperation`) call `readSessionRequest`. No route handler is protected. A new page, handler, or action is unprotected today.                                                                                                             |
| Request adapter            | `frontend-services/src/next/session.ts` `readSessionRequest` resolves tenant, loads its configuration, then `SessionService.readForTenant`; tenant failure → `notFound()`/throw, mismatch → `forbidden()`, store failure → throw.                                                                       |
| Session service            | `SessionService` exposes `establish`, `invalidate`, `read`, `readForTenant`, and `refreshForTenant` (#220). No application code calls `refreshForTenant`; renewal is not wired at any HTTP boundary.                                                                                                    |
| Callback                   | `createCallbackHandler` denies every trusted identity because `CallbackFreshness` defaults to `confirmed: () => false` (`next/freshness.ts`). The confirmed branch, reachable only in adapter tests, establishes a session and returns **HTTP 204** with the session cookie — not a navigable response. |
| Login                      | `createLoginHandler` resolves tenant, prepares `max_age=0` + PKCE + state/nonce, returns 307 to the provider or `/login-unavailable`; tenant failures keep 404/500.                                                                                                                                     |
| Public pages               | `/login-unavailable` performs no tenant resolution. `/_test/onsite` calls `requireTenantConfig`; `/_test/tenant-config` calls `tenantConfigResponse`. `/auth/*` resolve tenant inside `frontend-services`.                                                                                              |
| Presentation               | `src/app/auth/presentation.tsx` renders the sign-in failure body and the tenant 404 body with `react-dom/server.edge`; `src/app/forbidden.tsx` is the `forbidden()` presentation; `experimental.authInterrupts` is on.                                                                                  |
| Caching                    | `next.config.ts` sets `Cache-Control: private, no-store` for `/` only; dynamic pages also receive Next's own no-store header.                                                                                                                                                                           |
| BDD policy                 | Cucumber is the only BDD runner; steps never connect to Redis or session stores (`features/README.md`, `tests/bdd/steps/README.md`, #335). Two-process callback routing, a scoped browser proxy, owned prefixes, and fabricated `pathable-session` cookie values already exist in `tests/bdd/support/`. |
| Existing baseline scenario | `tenant-failures.feature` uses an unauthenticated `GET /this-page-is-absent` → 404 as the "ordinary missing page" baseline for invalid tenants.                                                                                                                                                         |
| Module evidence pattern    | `frontend-services/tests/unit/*` mock `src/runtime.ts` and provide `SessionService`/`TenantConfigService` doubles through the public `src/next.ts`; session scenarios run the production Lua script on real Redis.                                                                                      |

## Installed dependency facts

Verified against the owning workspaces' installed declarations and source (Next.js 16.4.5, React 19.3.1, Effect 4.1.2,
`@pathableai/react` 0.3.0):

- `next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`: Proxy "defaults to using the Node.js
  runtime"; Server Functions are POSTs to the route where they are used, so a matcher that excludes a path skips
  them; Next recommends verifying inside each Server Function as well.
- `next/dist/server/next-server.js` (`runMiddleware`): Node.js proxy is loaded with `require(distDir/server/middleware.js)`
  and "runs in-process". The process-wide `Symbol.for("@pathableai/pre-ets-frontend/ManagedRuntime")` slot published
  by `startProductionRuntime` from `instrumentation.ts` is therefore visible to proxy code; an absent slot yields
  `StartupNotReady`, which `toNext` already maps to 503.
- `next/dist/server/web/spec-extension/response.d.ts`: `NextResponse.next(init?: MiddlewareResponseInit)`,
  `NextResponse.rewrite(destination, init?)`, `NextResponse.redirect(url, init?)`; `MiddlewareResponseInit` extends
  `ResponseInit` (headers allowed). `next/server` exports `NextProxy`.
- `next/dist/client/components/app-router-headers.d.ts`: `rsc`, `next-action`, `next-router-prefetch`,
  `next-router-segment-prefetch` header names.
- `next/dist/client/components/router-reducer/fetch-server-response.js`: a non-Flight or non-OK RSC response makes the
  client router perform a hard (MPA) navigation to the response URL.
- `next/dist/server/app-render/action-handler.js`: Server Action requests can be forwarded to another worker
  (`x-action-forwarded`, `selectWorkerForForwarding`), so an action is not tied to the path that hosts its page.
- `next/navigation`: `forbidden(): never`, `useRouter(): AppRouterInstance` with `refresh(): void`.
- `@fast-check/vitest` 0.5.0 and `@effect/vitest` 4.1.2 are installed in `frontend-services`; no new dependency is
  needed. Every Effect API the design uses (`Effect.fn`, `Effect.fnUntraced`, `Effect.matchEffect`, `Effect.catchTag`,
  `Effect.result`, `Effect.fromResult`, `Clock.currentTimeMillis`, `Result`) is already used in this workspace.

## Decisions

### D1. Default protection through a Node.js proxy gate plus in-resource checks

**Decision**: `frontend-services` exports one proxy factory, `createProtectionProxy`, that every matched request
passes through. It classifies the request, admits designated public resources without reading session state, and
otherwise resolves the request tenant, reads (or renews) the session for that tenant, and either passes the request
on or returns the denial outcome. The Next app's `src/proxy.ts` matches every path except framework build assets and
development tooling. Existing protected resources keep their own `readSessionRequest` check (identity retrieval and
defense in depth).

**Rationale**: FR-001/FR-002 require protection for pages, route handlers, and Server Actions, including resources added
later with no per-resource opt-in. The proxy is the only framework hook that sees all three kinds before any resource
code runs. The authoritative Redis read in the proxy (not an optimistic cookie-presence check) is required because a
future resource with no own check must still deny forged, missing-record, expired, and invalidated references
(FR-021). Node proxy runs in-process, so it reuses the host-owned runtime rather than constructing one.

**Alternatives considered**:

- Layout guard: does not cover route handlers or Server Actions, and layouts do not re-run on every navigation.
- Per-resource wrapper or helper calls: per-resource opt-in, contrary to FR-002.
- Lint or inventory rule requiring each resource to call a guard: still opt-in; a missed rule leaves a resource open.
- Optimistic cookie-only proxy (Next's documented example): cannot reject forged or expired references for a resource
  without its own check.
- `specs/158-*` rejected proxy enforcement for its bounded reference slice because a proxy cannot _replace_
  resource-level enforcement. This plan keeps resource-level checks and adds the proxy as the default layer that slice
  explicitly left to #154.

### D2. Public designation by method and exact path

**Decision**: A request is public only when its method is `GET` or `HEAD` and its pathname is exactly `/auth/callback`,
`/auth/login`, or `/login-unavailable`, or is `/_test` or begins with `/_test/`. Every other matched request is
protected, including every non-`GET`/`HEAD` request on any path. Requests under `/_next/static/`, `/_next/webpack-hmr`,
and `/__nextjs` are not matched by the proxy (see D11 and finding F-1 for build assets).

**Rationale**: Server Actions are POSTs that can target any rendered route path and can be forwarded between workers;
progressive-enhancement submissions carry the action in the form body rather than the `next-action` header. Making
every non-`GET`/`HEAD` request protected guarantees that no Server Action invocation bypasses the gate through a public
path. Every current public resource is `GET`. Next applies trailing-slash redirects before the proxy, so exact matching
does not reject the canonical paths. Path matching is exact and case-sensitive; any other spelling is protected (fail
closed). This narrows FR-006's "all routes under `/_test`" for hypothetical future non-`GET` routes; see finding F-3.

**Alternatives considered**: method-agnostic prefixes (lets an action invocation through a public path); detecting
actions by `next-action` only (misses progressive-enhancement posts); a public list supplied by the Next app (splits
security policy from the adapter that enforces it; the callback, login, and `/login-unavailable` paths are already
owned by `frontend-services`).

The dedicated expired/missing-session recovery content does not exist yet; #157 creates it and adds its path to this
closed designation. #154 preserves the exception category rather than inventing a placeholder page.

### D3. Request classification and denial outcomes

**Decision**: A protected request is a **document entry** when it is `GET`/`HEAD` and carries neither `rsc` nor
`next-action`; every other protected request is an **application request**. Outcomes after successful tenant
resolution:

| Session outcome              | Document entry                                                | Application request (RSC, prefetch, Server Action, other methods) |
| ---------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| No usable session            | 307 to same-origin `/auth/login`                              | 401, empty body                                                   |
| Tenant mismatch              | Host forbidden document (HTTP 403, accessible forbidden page) | 403, empty body                                                   |
| Session state undeterminable | 503, empty body                                               | 503, empty body                                                   |
| Usable, matching session     | Pass through                                                  | Pass through                                                      |

Tenant failure precedes all of these and uses the host's existing 404/500 tenant-failure response. All
proxy-generated responses carry `Cache-Control: private, no-store` and no session or correlation cookie.

**Rationale**: FR-004 requires automatic tenant login for page entry; FR-025/V-016 forbid automatic OIDC for Server
Actions; an RSC soft navigation that receives a non-Flight 401 makes the client router hard-navigate, which re-enters as
a document and reaches login (installed `fetch-server-response.js`). A route handler `GET` is indistinguishable from a
page entry and receives the same 307, which satisfies AC2 (no protected content or effect). 401 for application
requests is the status #157 will extend with recovery content; #154 adds no recovery content. 503 keeps
undeterminable state distinct from absence, mismatch, and success (FR-021) and matches the existing `StartupNotReady`
mapping.

### D4. Forbidden document through a protected internal page

**Decision**: The Next app's `forbiddenDocument` response rewrites the request to a new protected page,
`/access-denied`, whose only behavior is `forbidden()`. The existing `src/app/forbidden.tsx` remains the single
forbidden presentation and gains a keyboard-reachable link back to the application entry.

**Rationale**: One presentation for proxy-level and resource-level forbidden outcomes, rendered inside the root layout,
with Next's own HTTP 403 semantics. A rewrite from proxy does not re-enter the proxy; a direct request to
`/access-denied` is an ordinary protected request and can only ever produce login, 403, or the forbidden page.

**Alternative considered**: render forbidden HTML inside the proxy as `presentation.tsx` does for the tenant 404 —
duplicates the forbidden presentation outside the app layout.

### D5. Tenant failures and public resources

**Decision**: For protected requests the proxy resolves the tenant first and returns the host `TenantFailureResponse`
(existing `tenantFailureResponse`: 404 missing page, 500 empty) on failure, before any session read. Public resources
are passed through without proxy tenant resolution; each owns its tenant resolution. `/login-unavailable` gains request
tenant resolution through the existing `requireTenantConfig`.

**Rationale**: FR-020 and FR-008. Pre-resolving tenant in the proxy for public resources would replace the
diagnostic's accepted JSON failure body (`tenantFailureJson`) with the HTML failure. `/login-unavailable` was the only
public resource that bypassed tenant resolution.

### D6. Renewal from deliberate requests only

**Decision**: When the session is usable, the proxy renews it through `SessionService.refreshForTenant` with the
tenant's `effectiveSessionPolicy` only for (a) a document entry whose `sec-fetch-mode` is `navigate`
(`deliberate-page-request`) and (b) a POST carrying `next-action` (`deliberate-form-submission`). Every other protected
request uses `readForTenant` and never renews. After a qualifying renewal the proxy re-issues the existing host-only
`pathable-session` cookie with `Max-Age` equal to the remaining idle budget.

**Rationale**: FR-016/V-008 need renewal at the application boundary. These two sources are unambiguous deliberate
requests under PREETS-SESSION-009 AC1 and are never background traffic, so AC3 cannot be violated. Prefetches, RSC
soft navigations, `router.refresh()`, and requests from non-browser clients do not renew. Without cookie re-issue the
browser would discard a renewed session at its original deadline. Complete qualifying-activity classification (soft
navigation, input activity, polling) belongs to #155 (S3 owns PREETS-SESSION-009).

### D7. No cacheable protected response

**Decision**: The proxy sets `Cache-Control: private, no-store` on every protected pass-through response.

**Rationale**: A future static page or static route handler would otherwise be served with shared-cache directives
after passing the gate. Whether Next preserves the proxy header over its own static-output header is an
implementation verification point (quickstart §3, V-002 probe). If it does not, implementation stops and returns the
contract to this plan rather than silently adding per-resource configuration.

### D8. History restoration guard

**Decision**: A client island, `RestoredPageGuard`, is rendered once from the root layout. On `pageshow` with
`persisted` it reloads the document; on `popstate` it calls `router.refresh()`. Together with D7 and D3 every history
traversal reaches the proxy, which starts tenant sign-in when no valid session exists.

**Rationale**: FR-023/FR-024. Back-forward cache and the App Router's client cache can restore a protected page without
a server request. The browser events exist only on the client (Principle IV justification). The refresh's RSC request
receives 401 without a session and the client router hard-navigates into login (D3). Verification point: if
`router.refresh()` does not hard-navigate on 401 in the installed router, use `window.location.reload()` on `popstate`;
the choice is private. The guard runs on public pages too; reloading a restored public page is harmless. #157's
running-tab modal remains the owner of in-tab expiration presentation (FR-025).

### D9. Callback success navigates to the application entry

**Decision**: When freshness is confirmed and establishment succeeds, the callback returns 303 to `/` with the session
cookie and cleared correlation instead of 204. No return-to target is stored.

**Rationale**: A 204 to a top-level navigation leaves the user on the provider page; FR-013/FR-015 require the next
protected request to use the established identity. No requirement asks for return-to, and a stored destination adds an
open-redirect surface. `CallbackFreshness` keeps its fail-closed default; this change is only observable in adapter
tests that provide confirmation, and in the running application after #158.

### D10. Observable Server Action denial in the browser consumer

**Decision**: The `ReferenceOperation` client consumer wraps the action invocation; a rejected invocation (proxy 401,
403, or 503, which Next surfaces as a rejected action call) becomes the existing `Denied` state announced through the
`role="status"` live region with a generic "operation was not performed" message. The action's own denial path stays.

**Rationale**: FR-005/FR-026. Without the wrapper a rejected invocation reaches the default client error screen. The
client cannot distinguish 401 from 403 or network failure; #157 adds specific recovery content.

### D11. Absent paths without a session

**Decision**: An unauthenticated document request for a path with no resource receives the same 307 as any protected
document entry. The ordinary missing-page baseline in `tenant-failures.feature` moves to an unmatched path under the
public `/_test/` prefix.

**Rationale**: The proxy cannot know whether a path has a resource without coupling to build internals, and treating
unknown paths as protected also avoids disclosing which paths exist. PREETS-TENANT-005 still compares invalid-tenant
navigation with the ordinary missing page; that page remains observable without a session under `/_test/`.

### D12. Freshness gate

**Decision**: No freshness comparison, clock tolerance, provider policy, or change to `CallbackFreshness` is designed
here. Success-path feature evidence is gated on #158 (plan increment 5).

**Rationale**: FR-012 and the maintainer's direction ("we will cross that bridge when we come to 158").

## Findings

### F-1. Framework build assets and "any other asset remains protected" (blocks final asset designation only)

1. **Source**: spec FR-006 and User Story 4 scenario 3; verification V-003/V-004; PREETS-SESSION-001 AC2 on
   `origin/main` `43215557`.
2. **Ambiguity**: Assets "needed to display unauthenticated pages" and containing no protected information may be
   public; "any other asset remains protected". Next.js build output under `/_next/static/` is content-hashed and shared
   across routes. Chunks used only by protected pages (for example the protected Server Action consumer) contain
   application code and fixed copy but no user, tenant, session, or secret data. Strictly, those chunks are "other
   assets" and must be protected, but the framework provides no supported per-request way to know whether a chunk is
   needed by a public page.
3. **Impact**: Determines the proxy matcher, whether build assets pass through the gate, and the V-004 assessment
   scope. No public module contract changes under any proposal.
4. **Decision required**: Whether framework build output that carries no protected information may be designated as
   one public asset class, or whether protected-page-only build assets must require a session.
5. **Proposals**: (A) Designate `/_next/static/**` as the public build-asset class, require that protected data is
   only ever server-rendered and never enters client bundles, and assess every built asset for protected information
   under V-004. (B) Gate build assets per route by deriving an allowlist of public-route chunks from Next build
   manifests at startup; couples to undocumented internals and still exposes shared chunks. (C) Remove page-specific
   client assets from protected pages; not achievable while FR-005 requires a browser consumer.

Until decided, increment 2 keeps today's behavior for `/_next/static/**` (already publicly served because the current
proxy does not match it), so no regression is introduced; V-004 and the final asset designation remain open.

### F-2. Prepared-record and outage evidence versus the BDD policy (non-blocking; planned resolution A)

1. **Source**: verification.md automated rows for V-009/V-010/V-011 ("pair a prepared tenant-A session"), V-012
   (controlled real-store outage), and V-014/V-015; `features/README.md` and `tests/bdd/steps/README.md` (Cucumber only;
   tests never connect to Redis or session stores; #335).
2. **Conflict**: Cucumber steps cannot create synthetic session records or control Redis availability, and real login
   cannot produce a session before #158. The automated running-application rows that need a usable session or an
   outage therefore cannot execute as written before #158.
3. **Impact**: Before #158, running-application observations with a usable or real expired/invalidated session, and
   outage observations, are available only through the manual procedure; automated evidence for those outcomes sits at
   the `frontend-services` adapter boundary with real Redis.
4. **Decision required**: Reviewer acknowledgement of the evidence mapping, or a change to the BDD policy.
5. **Proposals**: (A, planned) Manual steps 6, 7, and the outage exercise use a transient, uncommitted preparer that
   calls only public `SessionService.establish`/`invalidate` under owned prefixes; automated evidence uses a real-Redis
   adapter integration suite; Cucumber covers no-session, fabricated-reference, public, tenant-failure, and default
   cases now and adds real-login mismatch, expiry, joining, and history scenarios in increment 5. (B) Amend the BDD
   policy to sanction a support hook that prepares records through the public session service (testing-documentation
   owner decision). (C) Defer those automated rows entirely to #158 without adapter integration evidence.

### F-3. Method scope of the `/_test` exemption (non-blocking; planned resolution A)

1. **Source**: spec FR-006 ("all routes under `/_test`"); PREETS-SESSION-001 AC2.
2. **Ambiguity**: A method-agnostic `/_test` exemption would admit a Server Action invocation posted to a `/_test` path
   (D2). Every current `/_test` route is `GET`.
3. **Impact**: Only a hypothetical future non-`GET` `/_test` route is affected; no current resource changes
   reachability.
4. **Decision required**: Confirm that the exemption covers `GET`/`HEAD` requests under `/_test`, with any future
   non-`GET` `/_test` route requiring an explicit, reviewed designation.
5. **Proposals**: (A, planned) `GET`/`HEAD` only. (B) All methods except requests detected as Server Action invocations
   (`next-action` header or form-encoded POST), accepting detection risk. (C) All methods, relying on each Server
   Action's own check.
