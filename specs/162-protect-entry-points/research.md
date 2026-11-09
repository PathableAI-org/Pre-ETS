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
  `next-router-segment-prefetch` header names; `FLIGHT_HEADERS` lists `rsc`, `next-router-state-tree`,
  `next-router-prefetch`, `next-hmr-refresh`, and `next-router-segment-prefetch`.
- `next/dist/server/web/adapter.js` (about lines 148–156) and installed `proxy.md` (about line 474): before the proxy
  runs, Next **deletes every `FLIGHT_HEADERS` header** from the proxy's `request.headers` (unless the global
  `skipProxyUrlNormalize` is set) and normalizes the `_rsc` query away. The proxy therefore cannot tell an RSC soft
  navigation, prefetch, or `router.refresh()` from an HTML request by those headers. `next-action` is not a Flight
  header and remains visible.
- Browsers send Fetch Metadata (`sec-fetch-mode`, `sec-fetch-dest`) to potentially trustworthy origins (HTTPS and
  loopback/`*.localhost`): a top-level navigation is `navigate`/`document`; RSC fetches, prefetches, and Server Action
  calls are `cors` or `same-origin` with destination `empty`; `/favicon.ico` and `/_next/image` loads have destination
  `image`. The BDD raw-HTTP helper already sends `sec-fetch-dest: document` for document requests
  (`tests/bdd/support/server.ts:33`).
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
does not reject the canonical paths. Path matching is exact and case-sensitive on the
pathname the proxy receives; any other spelling is protected (fail closed). The WHATWG URL parser already resolves
literal and `%2e`-encoded dot segments before the proxy sees the pathname. Because Next may decode the path further
when routing, a pathname under the designated prefix that contains a percent-encoded `/`, `\`, or `.`
(`%2f`, `%5c`, `%2e`, any case) is treated as protected, so the dangerous direction — the gate seeing a public path
while Next routes to a protected resource — cannot occur. The safe direction is accepted: `/%5Ftest/...` is protected
by the gate even if Next routes it to a `/_test` resource. This narrows FR-006's "all routes under `/_test`" for hypothetical future non-`GET` routes; see finding F-3.

**Alternatives considered**: method-agnostic prefixes (lets an action invocation through a public path); detecting
actions by `next-action` only (misses progressive-enhancement posts); a public list supplied by the Next app (splits
security policy from the adapter that enforces it; the callback, login, and `/login-unavailable` paths are already
owned by `frontend-services`).

The dedicated expired/missing-session recovery content does not exist yet; #157 creates it and adds its path to this
closed designation. #154 preserves the exception category rather than inventing a placeholder page.

### D3. Request classification and denial outcomes

**Decision**: Classification uses Fetch Metadata, never Flight headers (which the proxy cannot see). Define the
request's **navigation status**:

- `sec-fetch-mode` present → navigation iff it equals `navigate`;
- else `sec-fetch-dest` present → navigation iff it equals `document`;
- else (no Fetch Metadata) → **unknown**.

A protected request is a **document entry** only when it is `GET`/`HEAD`, carries no `next-action`, and its navigation
status is navigation. Every other protected request — RSC soft navigations, prefetches, `router.refresh()`,
subresources such as `/favicon.ico` and `/_next/image`, Server Action calls, other methods, **and every request whose
navigation status is unknown** — is an **application request**. Outcomes after successful tenant resolution:

| Session outcome              | Document entry                                                | Application request |
| ---------------------------- | ------------------------------------------------------------- | ------------------- |
| No usable session            | 307 to `/auth/login` on the request's own origin              | 401, empty body     |
| Tenant mismatch              | Host forbidden document (HTTP 403, accessible forbidden page) | 403, empty body     |
| Session state undeterminable | 503, empty body                                               | 503, empty body     |
| Usable, matching session     | Pass through                                                  | Pass through        |

Tenant failure precedes all of these and uses the host's existing 404/500 tenant-failure response. All responses the
gate returns or rewrites carry `Cache-Control: private, no-store` and no session or correlation cookie. Login
initiation is therefore reachable from the gate only through a 307 answered to a classified navigation; no fetch,
prefetch, refresh, or subresource request can be redirected into `/auth/login`, create an OIDC transaction, or
overwrite the `oidc-correlation` cookie through the gate (see also D13 for the login handler itself).

**Rationale**: FR-004 requires automatic tenant login for page entry; FR-025/V-016 forbid automatic OIDC for Server
Actions. Redirecting a fetch to `/auth/login` would make `fetch` follow it, prepare an OIDC transaction in Redis,
overwrite the correlation cookie of any login in progress, and then fail CORS at the provider; a `Link` prefetch on a
public page (for example `/login-unavailable` → `/`) would start login as a side effect. A non-Flight 401 to an RSC
request makes the client router hard-navigate (installed `fetch-server-response.js`), and that document navigation
then reaches login, so soft navigation and refresh still end at sign-in. Prefetch failures are ignored by the router.
A route handler `GET` navigated to directly receives the same 307 as a page, which satisfies AC2.

Unknown navigation status is classified as an application request because it is the fail-safe choice: it never starts
login and never exposes content. Its only cost is that a client without Fetch Metadata receives 401 instead of
automatic login. Every supported browser sends Fetch Metadata to HTTPS and loopback origins, and a non-loopback plain
HTTP origin cannot hold the `Secure` session cookie anyway, so no supported configuration loses automatic login. 401 is
the status #157 will extend with recovery content; 503 keeps undeterminable state distinct (FR-021) and matches
`StartupNotReady`.

**Alternatives considered**: the `rsc` header (stripped before the proxy — installed `adapter.js`); `Accept: text/html`
(sent by subresource and some fetch requests, not authoritative); treating unknown status as a document (lets a
metadata-less request trigger login, contrary to the requirement that login never start from a non-navigation);
setting `skipProxyUrlNormalize` to see Flight headers — rejected because it is a global change to URL normalization and
header stripping for every request, which Next documents as keeping RSC and HTML handling aligned, and it would change
the pathname semantics the designation relies on.

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

Request tenant resolution (alias, then that alias's configuration) is one private step in `next/` shared by the gate
and `readSessionRequest`, so both resolve the tenant identically.

**Rationale**: FR-020 and FR-008. Pre-resolving tenant in the proxy for public resources would replace the
diagnostic's accepted JSON failure body (`tenantFailureJson`) with the HTML failure. `/login-unavailable` was the only
public resource that bypassed tenant resolution.

### D6. Renewal from deliberate requests only

**Decision**: When the session is usable, the gate renews it through `SessionService.refreshForTenant` with the
tenant's `effectiveSessionPolicy` only for (a) a document entry (`deliberate-page-request`) and (b) a POST carrying
`next-action` (`deliberate-form-submission`). Every other protected request uses `readForTenant` and never renews.
After a qualifying renewal the gate re-issues the host-only `pathable-session` cookie through the existing
`setSessionCookie`, with `Max-Age` from the same remaining-idle calculation the callback uses (extracted into
`next/cookies.ts`). The gate obtains the branded `SessionReference` for that call from a new public re-export of the
existing `decodeSessionReference` in `session.ts`; `SessionService` itself is unchanged.

**Rationale**: FR-016/V-008 need renewal at the application boundary. A classified navigation and a protected action
submission are unambiguous deliberate requests under PREETS-SESSION-009 AC1 and never background traffic, so AC3 cannot
be violated. Prefetches, RSC soft navigations, `router.refresh()`, subresources, and metadata-less requests do not
renew. Without cookie re-issue the browser would discard a renewed session at its original deadline. Returning the
reference from `refreshForTenant` was rejected because `UsableSession` flows to page rendering; the reference must not.
Complete qualifying-activity classification (soft navigation, input activity, polling) belongs to #155.

### D7. No cacheable protected response

**Decision**: The proxy sets `Cache-Control: private, no-store` on every protected pass-through response.

**Rationale**: A future static page or static route handler would otherwise be served with shared-cache directives
after passing the gate. Whether Next preserves the proxy header over its own static-output header is an
implementation verification point (quickstart §3, V-002 probe). If it does not, implementation stops and returns the
contract to this plan rather than silently adding per-resource configuration.

### D8. History restoration guard

**Decision**: A client island, `RestoredPageGuard`, is rendered once from the root layout. On `pageshow` with
`persisted` it reloads the document; on `popstate` it calls `router.refresh()`. Together with D7 and D3 every history
traversal reaches the gate, which starts tenant sign-in when no valid session exists.

**Rationale**: FR-023/FR-024. Back-forward cache and the App Router's client cache can restore a protected page without
a server request. The browser events exist only on the client (Principle IV justification). A `location.reload()` is a
navigation (`sec-fetch-mode: navigate`) and receives the 307 directly. `router.refresh()` issues an RSC fetch whose Fetch
Metadata is not a navigation, so without a session the gate answers 401 (D3), and the installed router treats a
non-Flight, non-OK response by hard-navigating to the URL; that navigation receives the 307. Verification point: if the
installed router does not hard-navigate after a 401 on refresh, use `window.location.reload()` on `popstate`; the choice
is private. The guard runs on public pages too; reloading a restored public page is harmless. #157's running-tab modal
remains the owner of in-tab expiration presentation (FR-025).

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

### D13. Login preparation refuses explicit non-navigations

**Decision**: `createLoginHandler` answers 401 with `Cache-Control: private, no-store`, no transaction, and no cookie
when the request's navigation status (D3) is an explicit non-navigation. Navigations and metadata-less requests keep
the existing behavior.

**Rationale**: The gate never redirects a non-navigation into login (D3), but `/auth/login` is itself public. A fetch,
prefetch, or cross-site subresource request to it would otherwise prepare a Redis transaction and overwrite the
correlation cookie of a login in progress. Metadata-less direct requests are explicit login requests (and the existing
raw-HTTP BDD sends `sec-fetch-dest: document`), so they are not refused. The navigation predicate is shared with the
gate as one private helper in `next/`.

## Findings

### F-1. Public assets loaded by unauthenticated pages (blocks final asset designation only)

1. **Source**: spec FR-006 and User Story 4 scenario 3; verification V-003/V-004; PREETS-SESSION-001 AC2 on
   `origin/main` `43215557`.
2. **Ambiguity**: Assets "needed to display unauthenticated pages" and containing no protected information may be
   public; "any other asset remains protected". Three asset groups are affected:
   - Next.js build output under `/_next/static/` is content-hashed and shared across routes. Chunks used only by
     protected pages (for example the protected Server Action consumer) contain application code and fixed copy but no
     user, tenant, session, or secret data. Strictly they are "other assets", but the framework provides no supported
     per-request way to know whether a chunk is needed by a public page.
   - `/favicon.ico` and other metadata routes (`icon`, `apple-icon`, `manifest`, `robots`, `sitemap`): none exists today
     (no `public/` directory or icon file), yet browsers request `/favicon.ico` on every page, including public ones.
     Under D3 an unauthenticated request receives 401 (never a login redirect), which is safe but leaves a public page's
     browser-requested asset protected.
   - `/_next/image`: matched and protected; no current page uses it, but a future public page might.
3. **Impact**: Determines the proxy matcher, whether these assets pass through the gate, and the V-004 assessment
   scope. No public module contract changes under any proposal.
4. **Decision required**: Whether framework build output and browser/metadata assets that carry no protected
   information may be designated as public asset classes, and which ones.
5. **Proposals**: (A) Designate `/_next/static/**` as the public build-asset class (protected data only ever
   server-rendered, never in client bundles), keep `/favicon.ico`, metadata routes, and `/_next/image` protected until a
   public page actually needs one, then designate that specific asset with a V-004 assessment. (B) As A, but also
   designate `/favicon.ico` and metadata routes now as public `GET`/`HEAD` paths, assessed under V-004 when they exist.
   (C) Gate build assets per route from Next build manifests at startup; couples to undocumented internals and still
   exposes shared chunks. (D) Remove page-specific client assets from protected pages; not achievable while FR-005
   requires a browser consumer.

Until decided, increment 2 keeps today's behavior for `/_next/static/**` (already publicly served because the current
proxy does not match it) and keeps `/favicon.ico`, metadata routes, and `/_next/image` protected (401 without a
session, never a login redirect). V-004's assessment scope is every asset a public page loads, including any of these
that the decision makes public; V-004 and the final asset designation remain open.

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
   reachability. Until acknowledged, the planned `POST /_test/... → 401` observation is module evidence only and is not
   asserted in requirement-tagged BDD.
4. **Decision required**: Confirm that the exemption covers `GET`/`HEAD` requests under `/_test`, with any future
   non-`GET` `/_test` route requiring an explicit, reviewed designation.
5. **Proposals**: (A, planned) `GET`/`HEAD` only. (B) All methods except requests detected as Server Action invocations
   (`next-action` header or form-encoded POST), accepting detection risk. (C) All methods, relying on each Server
   Action's own check.
