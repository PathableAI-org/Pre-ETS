# Research: Protect Application Entry Points and Bind Tenant Authentication

**Plan**: [plan.md](plan.md) | **Feature contract**: [spec.md](spec.md), [verification.md](verification.md)

This record establishes current implementation and dependency facts, then records the technical decisions the plan
depends on. It does not change the approved specification or verification plan. Inspected revision: branch
`162-protect-entry-points-plan` on top of `929566a`; requirement baseline `origin/main` at
`43215557c35380322d759d2918456e02c3a0c7b2`.

## Review corrections (2026-11-09)

Code review of PRs #353 and #355 found plan decisions that contradicted the unchanged specification. The plan is the
earliest owning phase, so these decisions changed here. Requirement baseline re-read on `origin/main`
(PREETS-SESSION-001, -004, -005, -007, -013).

| Decision                 | Change                                                                                                                                                                                                                                                                                                             | Finding                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| D2 / F-3                 | `/_test` and `/_test/…` are public for every method except Server Action candidates; F-3 resolved with proposal B. The other public paths stay `GET`/`HEAD` only.                                                                                                                                                  | `/_test` narrowed to `GET`/`HEAD` contradicted PREETS-SESSION-001 AC2 and FR-006.                            |
| D4                       | The forbidden document is rendered by the proxy response itself from the shared forbidden presentation, without a rewrite; `/access-denied` is dropped.                                                                                                                                                            | The rewrite becomes an external proxy when Next binds a loopback address (#356); violates SESSION-005 AC2.   |
| D5 (tenant context)      | `requireTenantConfig` moves from `src/app/(app)/tenant-context.ts` to `src/app/tenant-context.ts`, the common parent of its consumers.                                                                                                                                                                             | `login-unavailable` and `/_test/onsite` imported a private child of the `(app)` route group.                 |
| D13                      | Login resolves the request tenant before refusing a non-navigation, so tenant failures keep 404/500.                                                                                                                                                                                                               | Refusal before tenant lookup let a public exception bypass tenant resolution (FR-008, SESSION-001 AC2).      |
| D4 (document head)       | The forbidden document carries its own `<head>`: `<meta charSet="utf-8">`, the root layout's viewport (`width=device-width, initial-scale=1`), and `<title>Access denied – Pre-ETS</title>`. App stylesheets are not linked (accepted limitation).                                                                 | The proxy document had an empty `<head>` and no title (WCAG 2.4.2, FR-018); D4 misdescribed the root layout. |
| D2 evidence              | The designation property's action oracle is Next's installed `getServerActionRequestMetadata` plus the gate's separate `next-action`-on-any-method widening, over generated content-type variants.                                                                                                                 | The oracle restated the gate's own content-type predicate, so it could not detect drift from Next.           |
| F-3                      | The residual narrowing (a form-encoded non-action `POST` to a future `/_test` Route Handler is protected) needs explicit maintainer acknowledgement on #353.                                                                                                                                                       | Resolution B still narrows PREETS-SESSION-001 AC2 for that case; it was recorded as settled.                 |
| D14, quickstart §4 (BDD) | Requirement-tagged rows assert only promised outcomes: redirect chains to the tenant provider, no protected content, no reference-operation receipt. Status-code and cookie mechanics stay module evidence; `max_age=0` rows carry `@preets-session-013`; the direct action sends the browser's encoded arguments. | Rows encoded private mechanics as product promises, and the action request could not reach the operation.    |

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
- Proxy rewrites and loopback binding (#356). `next/dist/server/next-server.js` (`runMiddleware`, about line 1164)
  builds the proxy request URL from `fetchHostname`, the formatted `-H` value (`base-server.js` about line 352), or
  `localhost`. `next/dist/server/web/next-url.js` (`parseURL`) rewrites every loopback hostname (`127.x.x.x`, `[::1]`,
  `localhost`) to `localhost`, so `request.url`, `request.nextUrl`, and `request.nextUrl.clone()` all report
  `http://localhost:<port>` when Next binds `127.0.0.1`. `next/dist/server/web/adapter.js` (about lines 354–366)
  re-serializes an `x-middleware-rewrite` destination through `NextURL` whenever its host equals `request.nextUrl.host`,
  so it is always `localhost` for a loopback destination. `next/dist/server/lib/router-utils/resolve-routes.js` (about
  lines 118 and 468–476) then relativizes it against `initUrl` (`http://<-H hostname>:<port>`). A different origin keeps
  its protocol and `router-server.js` (about line 468) proxies it externally. Redirects differ: `adapter.js` (about lines
  418–431) relativizes `Location` against the request's own `NextURL`, so `new URL("/auth/login", request.nextUrl)`
  stays same-origin. A transient script using the installed `NextRequest`, `NextURL`, and `parseRelativeURL` showed the
  rewrite is internal when Next binds `localhost` or `0.0.0.0` and external when it binds `127.0.0.1`. This held for all
  three forms: `new URL(…, request.url)`, `new URL(…, request.nextUrl)`, and a cloned `nextUrl` with a new pathname. No
  rewrite destination is internal by construction under loopback binding (research D4).
- Server Action transport. `next/dist/client/components/router-reducer/reducers/server-action-reducer.js`
  (`fetchServerAction`) posts `encodeReply(usedArgs)` to the current URL with `next-action: <id>`, `Accept:
  text/x-component`, and `next-router-state-tree`. `omitUnusedArgs` drops arguments the ID marks unused; both arguments
  of `runReferenceOperation` are used. `next/dist/compiled/react-server-dom-turbopack/cjs/*-client.*.production.js`
  (`processReply`) encodes a `FormData` argument by appending its entries under a `_<n>_` prefix and referencing it as
  `"$K<n>"`, and then writes the root model as field `0` of a `multipart/form-data` body. Running the installed client
  `encodeReply` on the consumer's arguments (`[{ _tag: "Ready" }, new FormData()]`) gives one field, `0` =
  `[{"_tag":"Ready"},"$K1"]`. The form has no named controls, so the browser's `FormData` is empty. On the server,
  `next/dist/server/lib/server-action-request-meta.js` treats a `POST` with `next-action` as a fetch action. Any `POST`
  with a `multipart/form-data` or `application/x-www-form-urlencoded` body is a possible (progressive-enhancement)
  action (`isPossibleServerAction`). The comparison is case-sensitive on the raw header value: the form-urlencoded
  type must equal `application/x-www-form-urlencoded` exactly (no parameters), and the multipart type must start with
  `multipart/form-data`; `next-action` counts only on `POST`. The module is importable from tests as
  `next/dist/server/lib/server-action-request-meta.js` with its own declarations. `action-handler.js` decodes multipart
  fetch actions with `decodeReply` or `decodeReplyFromBusboy`. The `$K` case in the server decoder rebuilds the `FormData`. `action-handler.js` (about
  lines 434–456) rejects an `Origin` whose host differs from `Host` or `x-forwarded-host`, and only warns when `Origin`
  is absent.
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

### D2. Public designation by path, with method limits outside `/_test`

**Decision** (corrected 2026-11-09, finding F-3 resolved with proposal B): A request is a **Server Action candidate**
when it carries a `next-action` header (any method), or when it is a `POST` whose `content-type` is
`multipart/form-data` or `application/x-www-form-urlencoded`. This is Next's own possible-action predicate
(`isPossibleServerAction`, installed `server-action-request-meta.js`). A Server Action candidate is never public. A
request that is not a candidate is public when either:

- its pathname is `/_test` or begins with `/_test/` and contains no percent-encoded `/`, `\`, or `.`
  (`%2f`, `%5c`, `%2e`, any case), for **every method**; or
- its method is `GET` or `HEAD` and its pathname is exactly `/auth/callback`, `/auth/login`, or `/login-unavailable`.

Every other matched request is protected. Requests under `/_next/static/`, `/_next/webpack-hmr`, and `/__nextjs` are
not matched by the proxy (see D11 and finding F-1 for build assets).

**Rationale**: PREETS-SESSION-001 AC2 designates "all routes under `/_test`" without a method limit, and FR-006 repeats
it. The earlier `GET`/`HEAD` limit was narrower than the requirement (review finding on PR #353). AC1 makes Server
Actions protected entry points in their own right. Next routes an action `POST` to whatever page URL it is sent to
(the page's worker, or another worker through forwarding), so a method-free `/_test` exemption without the candidate
exception would let `POST /_test/x` with `next-action` reach an action without the gate. Progressive-enhancement
submissions carry the action ID in a form-encoded body instead of the header. Next decides whether to decode an action
from exactly this method-and-content-type predicate, so reusing it keeps the gate's view of an action invocation the
same as Next's. The cost is that a form-encoded `POST` to a `/_test` resource is protected. No current `/_test`
resource accepts one, and a future one needs an explicit, reviewed designation. AC2's method-free wording is specific
to `/_test`. The callback, login, and sign-in error page are all `GET`, so they keep the narrower reviewed
`GET`/`HEAD` designation. Next applies trailing-slash redirects before the proxy, so exact matching does not reject
the canonical paths. Path matching is exact and case-sensitive on the pathname the proxy receives; any other spelling
is protected (fail closed). The WHATWG URL parser already resolves literal and `%2e`-encoded dot segments before the
proxy sees the pathname. Next may decode the path further when routing, so a pathname under the `/_test` prefix that
contains an encoded separator or dot is protected. The dangerous direction therefore cannot occur: the gate never sees
a public path while Next routes to a protected resource. The safe direction is accepted: `/%5Ftest/...` is protected
by the gate even if Next routes it to a `/_test` resource.

**Alternatives considered**: a method-agnostic `/_test` prefix with no action exception (lets an action invocation
through a public path — F-3 proposal C); `GET`/`HEAD` only (narrower than AC2 — F-3 proposal A, superseded); detecting
actions by `next-action` only (misses progressive-enhancement posts, which Next still decodes); a public list supplied
by the Next app (splits security policy from the adapter that enforces it; the callback, login, and
`/login-unavailable` paths are already owned by `frontend-services`).

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
gate returns, including the host-rendered forbidden document, carry `Cache-Control: private, no-store` and no session or correlation cookie. Login
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

### D4. Forbidden document rendered by the proxy response

**Decision** (corrected 2026-11-09, #356): The Next app's `forbiddenDocument` returns the forbidden document directly.
It is a `NextResponse` with status 403, `content-type: text/html; charset=utf-8`, and a body rendered with
`react-dom/server.edge`, the same way `tenantFailureResponse` renders the tenant 404. The forbidden content is one
component, `ForbiddenNotice`, in `src/features/access-responses`: heading, explanation, and a keyboard-reachable link
back to the application entry. `src/app/forbidden.tsx` (the `forbidden()` convention used by resource-level checks)
renders the same `ForbiddenNotice`, so proxy-level and resource-level forbidden outcomes share one presentation. No
rewrite and no `/access-denied` page exist.

**Rationale**: PREETS-SESSION-005 AC2 and FR-018 require HTTP 403 with an accessible forbidden page at every
protected entry point. The planned rewrite to `/access-denied` failed under `next start -H 127.0.0.1`, which the BDD
harness uses: the request received 404 in host mode or 500 in static mode. Building the destination from
`request.nextUrl` does not fix this. Next normalizes every loopback host in the proxy request to `localhost`. It
compares the rewrite destination with the bound `-H` origin only after that normalization. So no rewrite destination is
internal by construction ([installed facts](#installed-dependency-facts)). A response body involves no second routing
step, so it is the same under every binding. The tenant 404 already uses this host-rendered pattern. Rendering `ForbiddenNotice` in
both places keeps one presentation, which was the earlier objection to proxy rendering.

**Document head** (corrected 2026-11-09): The root layout does more than `<html lang>` and `<body>`: through Next it
contributes `<meta charSet="utf-8">`, the default viewport `<meta name="viewport" content="width=device-width,
initial-scale=1">` (the layout exports no `viewport`, so Next's `createDefaultViewport` applies), the `metadata` title
`Pre-ETS`, and the app stylesheets that `@pathableai/react` imports, which Next emits as hashed
`/_next/static/css/*.css` links. A proxy-rendered document gets none of these, so it states its own `<head>`:
`<meta charSet="utf-8">`, the same viewport meta, and `<title>Access denied – Pre-ETS</title>`. An untitled page fails
WCAG 2.4.2 (level A), and FR-018 requires an accessible forbidden experience. The stylesheets are not linked: their
paths are content hashes known only from the build manifest, so linking them would couple the proxy to build output,
and inlining the package CSS would duplicate the design system's delivery. The accepted limitation is an unstyled
document. Its native link keeps the browser's default visible focus indicator, and keyboard reachability and visible
focus remain manual evidence (quickstart §6 step 6). The `forbidden()` convention page still renders through the root
layout with styles.

**Alternatives considered**: `NextResponse.rewrite(new URL("/access-denied", request.nextUrl))` or a cloned `nextUrl`
(still external under loopback binding, verified above); a redirect to a public forbidden page (adds a public
designation the specification does not list, and turns the original request's 403 into a redirect); rewriting only
when not loopback-bound (deployment-dependent behavior); passing the request through with a trusted header for
resources to read (per-resource opt-in and a forgeable channel).

### D5. Tenant failures and public resources

**Decision**: For protected requests the proxy resolves the tenant first and returns the host `TenantFailureResponse`
(existing `tenantFailureResponse`: 404 missing page, 500 empty) on failure, before any session read. Public resources
are passed through without proxy tenant resolution; each owns its tenant resolution. `/login-unavailable` gains request
tenant resolution through the existing `requireTenantConfig`. The login handler resolves the tenant before it refuses
a non-navigation (D13).

Request tenant resolution (alias, then that alias's configuration) is one private step in `next/` shared by the gate,
`readSessionRequest`, and the login handler's non-navigation branch, so all three resolve the tenant identically.

`requireTenantConfig` (React `cache`d, `server-only`, unchanged behavior) moves from `src/app/(app)/tenant-context.ts`
to `src/app/tenant-context.ts` (corrected 2026-11-09). Its consumers are `src/app/login-unavailable/page.tsx` and
`src/app/%5Ftest/onsite/page.tsx`. No file inside `(app)` uses it today. Under the recursive module rule, a file under
`(app)/` is a private child of that route group, and neither consumer is in the group. `src/app` is the nearest common
parent. `fallow guard` places `src/app/tenant-context.ts` in the Bulletproof `app` zone, the same zone as both
consumers, so the move needs no zone change. `src/features/` holds feature UI, not a request helper, and
`packages/frontend/AGENTS.md` keeps `src/server` absent while the helper's callers all live in `src/app`.

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

### D13. Login preparation refuses explicit non-navigations after tenant resolution

**Decision** (corrected 2026-11-09): When the request's navigation status (D3) is an explicit non-navigation,
`createLoginHandler` first resolves the request tenant through the shared private `resolveRequestTenant(host)`. A
tenant failure goes to the existing tenant-failure response (404 missing page, 500). Only after the tenant resolves
does the handler answer 401 with `Cache-Control: private, no-store`, no transaction, and no cookie. Navigations and
metadata-less requests keep the existing path unchanged: `AuthenticationService.prepare` performs its own tenant lookup,
so a normal login does not look the tenant up twice. The signature is unchanged.

**Rationale**: The gate never redirects a non-navigation into login (D3), but `/auth/login` is itself public. A fetch,
prefetch, or cross-site subresource request to it would otherwise prepare a Redis transaction and overwrite the
correlation cookie of a login in progress. Metadata-less direct requests are explicit login requests (and the existing
raw-HTTP BDD sends `sec-fetch-dest: document`), so they are not refused. The gate does not resolve the tenant for public
paths (D5). If the handler refused first, a non-navigation at an unknown host or with a missing static tenant file would
get 401 instead of 404/500. A public exception would then bypass tenant resolution, contrary to FR-008 and
PREETS-SESSION-001 AC2 (review finding on PR #353). The navigation predicate and the tenant step are shared with the gate
as private helpers in `next/request.ts`.

### D14. Direct Server Action evidence uses the browser's own encoding

**Decision**: The running-application request that shows a protected Server Action performs no effect sends the same
request the browser sends for the reference consumer. It is `POST /` with `next-action` set to the real
`runReferenceOperation` ID from the production build's server-reference manifest, `Origin` equal to the request
origin, action-fetch Fetch Metadata, and a `multipart/form-data` body whose only field `0` is
`[{"_tag":"Ready"},"$K1"]` ([installed facts](#installed-dependency-facts)). The observed effect is the absence of the
`preets-ref-effect` receipt.

**Rationale**: A request with `next-action` and no body cannot decode into `(previousState, formData)`.
`runReferenceOperation` reads `previousState._tag` before its own session check, so without the gate it would fail with
500 anyway. Such a request cannot show that protection prevented the operation (review finding on PR #355). With the
browser's own encoding, the request would reach the operation if nothing denied it. BDD cannot run a gate-bypassed
control, because steps do not alter the application. The bounded claim is therefore: the request is a well-formed
invocation of the real action, shown by matching the installed client encoder's output; the response is a denial; and
no receipt is issued. That the gate rather than the action's own check denied it is module evidence (outcome matrix:
an application request without a session gets 401 before any resource runs). If implementation finds the decoder
rejects this body, record the direct action row as an open item rather than inventing an encoding.

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

### F-3. Method scope of the `/_test` exemption (resolved 2026-11-09 with proposal B; residual narrowing awaits acknowledgement)

1. **Source**: spec FR-006 ("all routes under `/_test`"); PREETS-SESSION-001 AC1 (Server Actions are protected entry
   points) and AC2 (all routes under `/_test` are public), `origin/main` `43215557`.
2. **Ambiguity**: A method-agnostic `/_test` exemption would admit a Server Action invocation posted to a `/_test` path
   (D2); a `GET`/`HEAD`-only exemption is narrower than AC2's method-free wording.
3. **Impact**: Determines whether non-`GET` requests under `/_test` pass the gate. No current resource changes
   reachability; no signature changes.
4. **Decision required**: Which requests under `/_test` are public.
5. **Proposals**: (A) `GET`/`HEAD` only. (B) All methods except requests detected as Server Action invocations
   (`next-action` header or form-encoded POST), accepting detection risk. (C) All methods, relying on each Server
   Action's own check.

**Resolution**: B. Planning had proposed A, but review of PR #353 found that A contradicts PREETS-SESSION-001 AC2 and
FR-006. B keeps AC2 (every non-action request under `/_test` is public whatever its method) and AC1 (no action
invocation passes through a public path). Detection uses Next's own possible-action predicate, so the gate and Next
agree on what an action invocation is. The remaining narrowing is that a form-encoded `POST` to a `/_test` resource is
protected; no current resource is affected (D2). `POST /_test/tenant-config` without a form body is public and may be
asserted in requirement-tagged BDD as not denied by protection.

**Open acknowledgement** (2026-11-09): B is not fully settled. It still narrows PREETS-SESSION-001 AC2 for one case: a
form-encoded `POST` (`multipart/form-data…` or exactly `application/x-www-form-urlencoded`) without `next-action` to a
future `/_test` Route Handler is protected, because the proxy cannot read the body to tell it from a
progressive-enhancement action. This residual narrowing needs explicit maintainer acknowledgement on #353 before it is
treated as accepted.
