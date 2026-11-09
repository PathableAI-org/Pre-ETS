# Module Architecture and Public Contracts: Protect Application Entry Points and Bind Tenant Authentication

**Plan**: [plan.md](../plan.md)

**Feature verification**: [verification.md](../verification.md)

**Status**: Planned design — Next.js 16.4.5, React 19.3.1, and Effect 4.1.2 signatures checked against the installed
declarations in `packages/frontend` and `packages/frontend-services` (see [research.md](../research.md#installed-dependency-facts))

## Module architecture decisions

| Concern                                   | Current owner and consumers                                                                         | Decision                                                                                          | Public boundary                                                                                                             | Private decomposition                                                                                                                                                                                                                                                              | Rationale and non-goals                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default entry-point protection            | None; `src/proxy.ts` is pass-through                                                                | Extend the existing Next host-adapter module `frontend-services/src/next.ts`                      | `createProtectionProxy`, `ProtectionResponses` (package root re-export)                                                     | New child `src/next/protection.ts` (designation, classification, outcome program); new child `src/next/request.ts` (shared request-tenant resolution and navigation predicate); existing `setSessionCookie` plus an extracted remaining-idle `Max-Age` helper in `next/cookies.ts` | The proxy is the only hook that sees pages, handlers, and actions before resource code (research D1). The Next app must not import Effect, so the gate lives with the other host adapters. No new service, Layer, provider interface, or package.                                                                                                  |
| Public-resource designation               | Implicit: public resources are whatever does not call `readSessionRequest`                          | Decompose into a private closed designation inside the protection child                           | Behavior of `createProtectionProxy` only                                                                                    | Constant designation in `next/protection.ts`                                                                                                                                                                                                                                       | Security policy stays with the code that enforces it; `/auth/callback`, `/auth/login`, and `/login-unavailable` are already `frontend-services` paths. Not exported: no consumer needs the list. #157 adds the recovery path here.                                                                                                                 |
| Session read, admission, renewal          | `frontend-services/src/session.ts` `SessionService`; callback, `readSessionRequest`, tests          | Preserve `SessionService`; extend the `session.ts` public entry with one re-export                | `SessionService` unchanged; `session.ts` re-exports the existing `decodeSessionReference` from its `session/codec.ts` child | Unchanged `session/codec.ts`, `session/store.ts`                                                                                                                                                                                                                                   | `readForTenant` and `refreshForTenant` already provide admission and renewal. The gate needs a branded `SessionReference` to call the existing `setSessionCookie` after renewal; `next/` may not import the codec child, and returning the reference from the service would put it on `UsableSession`, which reaches page rendering (research D6). |
| Tenant resolution                         | `frontend-services/src/tenant.ts` `TenantConfigService`                                             | Preserve                                                                                          | Unchanged                                                                                                                   | Unchanged                                                                                                                                                                                                                                                                          | `getAlias` + `getConfigFromAlias` + `effectiveSessionPolicy` are sufficient; no new tenant API.                                                                                                                                                                                                                                                    |
| Callback completion and login preparation | `frontend-services/src/next/callback.ts`, `next/login.ts`; `src/app/auth/{callback,login}/route.ts` | Extend behavior without signature change                                                          | Unchanged `createCallbackHandler`, `CallbackResponses`, `createLoginHandler`                                                | `establishSession` returns 303 to `/` and uses the extracted `Max-Age` helper; login refuses explicit non-navigations via the shared navigation predicate                                                                                                                          | A 204 is not navigable (research D9); a non-navigation must never prepare a login (research D13). `CallbackFreshness` keeps its fail-closed default and stays unexported from the package root.                                                                                                                                                    |
| Request session read for resources        | `frontend-services/src/next/session.ts` `readSessionRequest`; `(app)/page.tsx`, `(app)/actions.ts`  | Preserve contract; share private tenant step                                                      | Unchanged                                                                                                                   | Uses the new private `next/request.ts` tenant step instead of its inline `getAlias`/`getConfigFromAlias`                                                                                                                                                                           | Resource-level identity retrieval and defense in depth after the gate. One tenant-resolution step serves both the gate and this adapter. Renewal stays in the gate so a resource read never renews.                                                                                                                                                |
| Next proxy wiring                         | `packages/frontend/src/proxy.ts`                                                                    | Extend                                                                                            | Next `proxy` export and static `config.matcher`                                                                             | None                                                                                                                                                                                                                                                                               | Thin host file: matcher literal plus host responses. Fallow `allowUnmatched` already covers it.                                                                                                                                                                                                                                                    |
| Authentication and tenant-failure bodies  | `packages/frontend/src/app/auth/presentation.tsx`; auth login and callback routes                   | Extract into a feature public entry because the proxy becomes a third consumer outside `app/auth` | `src/features/access-responses.ts`                                                                                          | `src/features/access-responses/presentation.tsx` (moved file, unchanged behavior)                                                                                                                                                                                                  | The recursive module rule forbids the proxy from reaching into the `app/auth` segment's private helper. Moving it behind a feature entry satisfies both the rule and Bulletproof (`app` → `features`; proxy unrestricted).                                                                                                                         |
| Forbidden presentation                    | `src/app/forbidden.tsx` (`forbidden()` convention)                                                  | Preserve as the single forbidden presentation; add one internal protected page                    | Route `/access-denied`                                                                                                      | `src/app/access-denied/page.tsx` calls `forbidden()`                                                                                                                                                                                                                               | One presentation for proxy and resource-level 403 (research D4). No new feature module: the page has no UI of its own.                                                                                                                                                                                                                             |
| History restoration protection            | None                                                                                                | New feature public entry                                                                          | `src/features/history-protection.ts` → `RestoredPageGuard`                                                                  | `src/features/history-protection/restored-page-guard.tsx` (`"use client"`)                                                                                                                                                                                                         | Browser-only events (research D8). One consumer (root layout). Not placed in `session-reference`, which is the reference action feature, not an application-wide concern.                                                                                                                                                                          |
| Protected Server Action consumer          | `src/features/session-reference.ts`; `(app)/page.tsx`                                               | Extend private behavior; public exports unchanged                                                 | Unchanged `ReferenceOperation`, `ReferenceActionState`                                                                      | `reference-operation.tsx` maps a rejected invocation to `Denied`                                                                                                                                                                                                                   | FR-005/FR-026 observable denial (research D10). No new domain workflow.                                                                                                                                                                                                                                                                            |
| Public sign-in error page tenant binding  | `src/app/login-unavailable/page.tsx`                                                                | Extend                                                                                            | Route behavior                                                                                                              | Calls existing `requireTenantConfig` from `(app)/tenant-context.ts`                                                                                                                                                                                                                | FR-008: public status must not bypass request tenant resolution (research D5). Reuses the helper `/_test/onsite` already imports.                                                                                                                                                                                                                  |
| Runtime and resources                     | `frontend-services/src/runtime.ts` process `ManagedRuntime`                                         | Preserve                                                                                          | Unchanged `Runtime.runPromise`                                                                                              | Unchanged                                                                                                                                                                                                                                                                          | Node proxy runs in-process and reads the published runtime slot; no per-request runtime or Redis client.                                                                                                                                                                                                                                           |

Every new public symbol has a current consumer: `createProtectionProxy`/`ProtectionResponses` (Next `src/proxy.ts`),
`access-responses` (auth routes and proxy), `RestoredPageGuard` (root layout), `/access-denied` (the proxy's
`forbiddenDocument`).

## Public contracts

### `@pathableai/pre-ets-frontend-services` — `src/next.ts` protection gate (new)

**Responsibility**: Decide, before any resource code runs, whether a request may proceed: designated public requests
pass without session state; every other request is admitted only with a usable session bound to the independently
resolved request tenant, and otherwise receives the denial outcome for its request class.

**Actual consumers**:

- `packages/frontend/src/proxy.ts`: the Next proxy for every matched path.
- `frontend-services` module tests through the public `src/next.ts` entry.

**Proposed signatures**:

```ts
import type { NextRequest, NextResponse } from "next/server"

import type { TenantFailureResponse } from "./next/tenant-failure.js"

/** Responses the Next host presents for protection outcomes it owns. */
export interface ProtectionResponses {
  /**
   * A tenant mismatch on a document entry. The response MUST carry HTTP 403 semantics and no protected content.
   * The Next app rewrites to `/access-denied`. The gate sets `Cache-Control: private, no-store` on the returned
   * response, and `/access-denied` is dynamic, so the rendered 403 is never cacheable.
   */
  readonly forbiddenDocument: (request: NextRequest) => Promise<NextResponse>
  /** The host's existing tenant-failure presentation (404 missing page, 500). */
  readonly tenantFailure: TenantFailureResponse
}

/** Default protection gate for the Next.js proxy. */
export const createProtectionProxy: (
  responses: ProtectionResponses
) => (request: NextRequest) => Promise<NextResponse>
```

Package root (`src/index.ts`) adds `createProtectionProxy` and `type ProtectionResponses` to its existing re-export
from `./next.js`.

**Inputs and validation ownership**: All request input is untrusted. Method, pathname (`request.nextUrl.pathname`),
`host`, `next-action`, `sec-fetch-mode`, `sec-fetch-dest`, and the `pathable-session` cookie are read here. Flight
headers (`rsc`, `next-router-prefetch`, …) are stripped by Next before the proxy and are never read (research D3).
Host decoding stays in `TenantConfigService.getAlias`; reference classification stays in `SessionService`; the gate
decodes the reference only to re-issue the cookie after a successful renewal. No other
header, query value, or cookie supplies tenant or identity context. `responses` is trusted host code.

**Request classes (closed sets)**:

| Term                | Definition                                                                                                                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public request      | `GET`/`HEAD` and pathname exactly `/auth/callback`, `/auth/login`, `/login-unavailable`, `/_test`, or beginning with `/_test/`                                                                                                                                                     |
| Navigation status   | `sec-fetch-mode` present → navigation iff `navigate`; else `sec-fetch-dest` present → navigation iff `document`; else unknown                                                                                                                                                      |
| Document entry      | Protected, `GET`/`HEAD`, no `next-action` header, navigation status is navigation                                                                                                                                                                                                  |
| Application request | Any other protected request: RSC soft navigations, prefetches, `router.refresh()`, subresources (`/favicon.ico`, `/_next/image`), Server Action invocations, every non-`GET`/`HEAD` method, and every request whose navigation status is unknown (fail safe: no login side effect) |
| Qualifying renewal  | Document entry → `deliberate-page-request`; `POST` with `next-action` → `deliberate-form-submission`; nothing else                                                                                                                                                                 |

**Success semantics and invariants**:

| Condition (evaluated in order)         | Document entry                                                                                                                            | Application request |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Public request                         | `NextResponse.next()`, no session read, no header change                                                                                  | (not applicable)    |
| Runtime not started                    | 503                                                                                                                                       | 503                 |
| Tenant failure                         | `responses.tenantFailure(404 \| 500)`                                                                                                     | same                |
| `SessionServiceUnavailable`            | 503                                                                                                                                       | 503                 |
| `NoUsableSession`                      | 307 with `Location` built as `new URL("/auth/login", request.nextUrl)` — the request's own origin, only after tenant resolution succeeded | 401                 |
| `SessionTenantMismatch`                | `responses.forbiddenDocument(request)` with `Cache-Control: private, no-store` set by the gate                                            | 403                 |
| `UsableSession`, no qualifying renewal | `NextResponse.next()` with `Cache-Control: private, no-store`                                                                             | same                |
| `UsableSession`, qualifying renewal    | as above, plus `pathable-session` re-issued with `Max-Age` = remaining idle seconds                                                       | same                |

- The request tenant is always resolved from the request before the session is read and is never replaced by the
  session tenant.
- No non-public request is ever passed through unless the session is usable for the resolved tenant; any defect makes
  the returned promise reject (Next answers 500) rather than pass the request through.
- Every response the gate returns — denials, the rewritten forbidden document, and the tenant-failure response —
  carries `Cache-Control: private, no-store` (the gate sets it after calling a host factory); gate-built denials have an
  empty body and set no session or correlation cookie; none echoes the reference, identity, tenant, or store details.
- The gate performs at most one session-store operation per request: `refreshForTenant` for a qualifying renewal,
  otherwise `readForTenant`; public requests perform none. Resources that also call `readSessionRequest` (`/` and the
  reference action) add one further read of their own.
- Only a document entry can receive the 307 to `/auth/login`; no application request (including unknown navigation
  status) can be redirected into login preparation.
- Renewal policy is `effectiveSessionPolicy` of the configuration loaded for the resolved tenant on this request.
- The gate never creates a session.

**Expected errors**:

| Public error | Meaning for consumers                                         | Owned internal failures translated here                                                                      | Consumer response                      |
| ------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| None         | Every expected outcome is an HTTP response in the table above | `TenantNotFound`, `TenantReadError`, `SessionServiceUnavailable`, `SessionTenantMismatch`, `StartupNotReady` | Return the promised response unchanged |

**Defects and interruption**: Unexpected exceptions, host response factory failures, and interruption propagate as a
rejected promise. They must not be caught into `NextResponse.next()`.

**Effect environment requirements**: Internally an Effect requiring `TenantConfigService | SessionService` run through
the existing `toNext` helper on the host-owned runtime. The public value is a framework adapter returning a Promise,
because the Next app may not import Effect.

**Compatibility and relationships**: Additive export. Reuses `TenantFailureResponse`, `PRIVATE_NO_STORE`,
`SESSION_COOKIE`, `setSessionCookie`, the shared request-tenant step, and the public `decodeSessionReference`
re-export. `readSessionRequest` keeps its behavior for resources. The
recovery-content path is added to the designation by #157; #155 may extend qualifying renewal; neither changes this
signature.

### Contract evidence — protection gate

| Claim                                                                                         | Meaningful violation                                                                                                                                                                                          | Durable evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Manual/transient evidence | Limitations and non-duplication                                                                                                         |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Only designated `GET`/`HEAD` paths pass without a session                                     | An undesignated path, method, or spelling passes through without a usable session                                                                                                                             | Fast-Check property through `createProtectionProxy` with a `NoUsableSession` double: for generated pathnames, methods, and header subsets, pass-through occurs iff the request is in the designation; named examples for the designated paths, `/_test` variants, trailing/case variants, POSTs to public paths, and percent-encoded spellings (`/%5Ftest/x`, `/_test/%2e%2e/`, `/_test/..%2F`, `/_test%2Fx`, `/_test/%5C`) asserting that an encoded `/`, `\`, or `.` under the prefix is protected | None                      | Generated domain is the request shape the gate reads; does not prove Next routes every resource through the proxy (feature V-001/V-002) |
| Public requests read no session state                                                         | Diagnostic or callback depends on, or touches, session state                                                                                                                                                  | Examples asserting the session double is not called for public requests                                                                                                                                                                                                                                                                                                                                                                                                                              | None                      | Session creation by the diagnostic itself is feature evidence (V-003)                                                                   |
| Tenant resolves first and failure keeps 404/500                                               | Session read before tenant, login or 403 on tenant failure, fallback tenant                                                                                                                                   | Examples with tenant doubles failing `getAlias` and `getConfigFromAlias` (host and static semantics), asserting factory status and no session call                                                                                                                                                                                                                                                                                                                                                   | None                      | Real mode-specific selection is existing tenant evidence plus feature V-011                                                             |
| Outcome matrix per request class; login only for navigations                                  | Document gets 401; any non-navigation (RSC fetch, prefetch, refresh, `/favicon.ico` with `sec-fetch-dest: image`, `/_next/image`, metadata-less request) gets 307; mismatch passes; unavailable becomes login | Table-driven examples over the class × session-outcome matrix, with Fetch Metadata combinations including absent metadata and stripped-Flight-header requests                                                                                                                                                                                                                                                                                                                                        | None                      | HTTP behavior through Next is feature evidence                                                                                          |
| Qualifying renewal only for deliberate navigation and action submission, with cookie re-issue | Prefetch/RSC renews; navigation does not renew; renewed cookie keeps the old lifetime                                                                                                                         | Examples asserting `refreshForTenant` activity and policy, `readForTenant` otherwise, and re-issued cookie attributes/`Max-Age`; fixed `Clock`                                                                                                                                                                                                                                                                                                                                                       | None                      | Cross-instance renewal is gated feature evidence (V-008); SESSION-009 completeness is #155's                                            |
| Real store outcomes reach the gate unchanged                                                  | Expired, invalidated, or outage state admitted or turned into login                                                                                                                                           | `tests/integration/protection-redis.test.ts`: real `SessionService` on owned-prefix Redis; establish, expire, invalidate, and mismatch records; disconnected client → 503                                                                                                                                                                                                                                                                                                                            | None                      | Adapter boundary, not running Next (F-2)                                                                                                |
| Non-navigation login requests prepare nothing                                                 | A fetch or prefetch to `/auth/login` creates a transaction or overwrites the correlation cookie                                                                                                               | Login adapter examples: `sec-fetch-mode: cors`/`no-cors`/`same-origin` → 401, no `AuthenticationService.prepare` call, no cookie; `navigate` and absent metadata keep current behavior                                                                                                                                                                                                                                                                                                               | None                      | Cross-site browser behavior not exercised                                                                                               |
| Gate never passes on defect                                                                   | A thrown factory or runtime error yields pass-through                                                                                                                                                         | Example with a throwing factory asserting rejection                                                                                                                                                                                                                                                                                                                                                                                                                                                  | None                      | —                                                                                                                                       |

### `@pathableai/pre-ets-frontend-services` — `createCallbackHandler` (changed behavior)

**Responsibility**: Unchanged — complete a tenant-bound provider return and establish a session only after trusted
validation and confirmed freshness.

**Actual consumers**: `src/app/auth/callback/route.ts`; adapter tests that provide `CallbackFreshness`.

**Proposed signatures**: Unchanged.

```ts
export interface CallbackResponses {
  readonly authenticationReturn: () => Promise<NextResponse>
  readonly tenantFailure: TenantFailureResponse
}
export const createCallbackHandler: (responses: CallbackResponses) => (request: NextRequest) => Promise<NextResponse>
```

**Success semantics and invariants**: On confirmed freshness and successful establishment the response is 303 with
`Location: /`, the host-only `pathable-session` cookie, cleared correlation, and `Cache-Control: private, no-store`
(previously 204). Every other path is unchanged: denial, unavailability, unconfirmed freshness, and establishment
failure return the public authentication-return page with no session cookie.

**Expected errors**: Unchanged (`CallbackExpectedFailure` reasons mapped to the host responses).

**Effect environment requirements**: Unchanged (`AuthenticationService`, `SessionService`, `TenantConfigService`,
`CallbackFreshness` reference with fail-closed default).

**Compatibility and relationships**: Only the confirmed branch changes, and it is unreachable in the running
application until #158 supplies freshness. Existing adapter assertions of 204 are updated.

| Claim                                                | Meaningful violation                                     | Durable evidence                                                                                                             | Manual/transient evidence | Limitations and non-duplication                  |
| ---------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------ |
| Confirmed completion navigates to `/` with a session | Non-navigable response, missing cookie, cookie on denial | Existing `tests/unit/authentication-entry*.test.ts` scenarios with `CallbackFreshness` provided, revised to 303 + `Location` | None                      | Not evidence of login or freshness (V-007 gated) |
| Default freshness still denies                       | Default flipped or bypassed                              | Existing default-path scenarios (no override) keep asserting no session cookie                                               | None                      | —                                                |

### `@pathableai/pre-ets-frontend-services` — `createLoginHandler` (changed behavior)

**Responsibility**: Unchanged — prepare the resolved tenant's fresh-authentication request.

**Actual consumers**: `src/app/auth/login/route.ts`.

**Proposed signatures**: Unchanged — `createLoginHandler(respondToTenantFailure: TenantFailureResponse) => (request:
NextRequest) => Promise<NextResponse>`.

**Success semantics and invariants**: When the request's navigation status (shared predicate, research D3) is an
explicit non-navigation, the handler returns 401 with `Cache-Control: private, no-store`, calls no
`AuthenticationService.prepare`, creates no transaction, and sets no cookie. Navigations and metadata-less requests keep
today's behavior (307 to the provider, `/login-unavailable`, or tenant 404/500). Evidence: the "non-navigation login
requests prepare nothing" row above.

### `@pathableai/pre-ets-frontend-services` — `src/session.ts` public entry (one re-export)

**Responsibility**: Unchanged session ownership.

**Actual consumers**: the gate (`next/protection.ts`), to brand the request's reference for `setSessionCookie` after a
successful renewal.

**Proposed signatures**:

```ts
export { decodeSessionReference } from "./session/codec.js"
// (value: string | undefined) => Option.Option<SessionReference>  — existing child function, unchanged
```

`SessionService`, `UsableSession`, and `NoUsableSession` are unchanged. Not added to the package root: the Next app has
no use for it. Evidence: the renewal row of the gate evidence (cookie re-issued with the request's own reference).

### Private `next/` helpers (named for review; not exported from `next.ts`)

```ts
// next/request.ts
export type NavigationStatus = "navigation" | "non-navigation" | "unknown"
export const navigationStatus: (headers: Headers) => NavigationStatus
export const resolveRequestTenant: (
  host: string
) => Effect.Effect<{ readonly alias: TenantAlias; readonly config: TenantConfig }, TenantFailure, TenantConfigService>

// next/cookies.ts (extracted from callback.ts)
export const remainingIdleSeconds: (idleDeadlineEpochMilliseconds: number, nowEpochMilliseconds: number) => number
```

`resolveRequestTenant` replaces the inline alias-then-configuration step in `readSessionRequest` and is used by the gate;
`navigationStatus` is used by the gate and the login handler; `remainingIdleSeconds` is used by the callback and the
gate with the existing `setSessionCookie`.

### `packages/frontend` — `src/proxy.ts` (changed)

**Responsibility**: Bind the Next proxy convention to the protection gate and host presentations.

**Actual consumers**: Next.js.

**Proposed signatures**:

```ts
import type { NextProxy } from "next/server"

export const proxy: NextProxy // createProtectionProxy({ forbiddenDocument, tenantFailure: tenantFailureResponse })

export const config: {
  readonly matcher: readonly ["/((?!_next/static/|_next/webpack-hmr|__nextjs).*)"]
}
```

`forbiddenDocument` is `(request) => Promise.resolve(NextResponse.rewrite(new URL("/access-denied", request.url)))`.
The matcher literal is final for increment 2 and is the only place build assets are excluded; its asset exclusion is
provisional under finding F-1.

**Inputs and validation ownership**: None beyond the gate.

**Success semantics and invariants**: Every application path, including `/`, absent paths, `/favicon.ico` and other
metadata paths, `/_next/image`, and Server Action posts, is matched. Only framework build assets and development
tooling are unmatched. Matched subresources without a session receive 401 (never a login redirect); their final
designation is part of finding F-1.

**Expected errors**: None (gate outcomes).

**Effect environment requirements**: None; not an Effect workspace.

**Compatibility and relationships**: Replaces the pass-through proxy and its two-path matcher.

| Claim                                          | Meaningful violation                    | Durable evidence                                                                                                                                                                     | Manual/transient evidence                                  | Limitations and non-duplication                                 |
| ---------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------- |
| Matcher excludes only build assets and tooling | An application path is unmatched        | `tests/unit/proxy.test.ts`: matcher literal equality and path-to-regexp examples (`/`, absent path, `/favicon.ico`, `/_next/image`, `/_test/x` matched; `/_next/static/x` unmatched) | V-002 probe observes a new page/handler/action being gated | Literal test does not prove Next honors it; feature V-001/V-002 |
| Mismatch document rewrites to `/access-denied` | Mismatch renders the requested resource | Unit example with a mocked gate factory capturing `forbiddenDocument`                                                                                                                | Manual step 6                                              | 403 rendering is feature evidence (V-009)                       |

### `packages/frontend` — `src/features/access-responses.ts` (new public entry, moved behavior)

**Responsibility**: Authentication-return (sign-in failure) and tenant-failure response bodies for route handlers and
the proxy.

**Actual consumers**: `src/app/auth/login/route.ts`, `src/app/auth/callback/route.ts`, `src/proxy.ts`.

**Proposed signatures**:

```ts
import type { TenantFailureResponse } from "@pathableai/pre-ets-frontend-services"
import type { renderToReadableStream } from "react-dom/server.edge"

export const authenticationReturnBody: () => ReturnType<typeof renderToReadableStream>
export const tenantFailureResponse: TenantFailureResponse
```

Behavior is unchanged from `src/app/auth/presentation.tsx`, which keeps rendering with `react-dom/server.edge` (whose
types re-export `renderToReadableStream` but not the stream interface, hence `ReturnType`); that file moves to
`src/features/access-responses/presentation.tsx` and the old path is removed.

| Claim                   | Meaningful violation                      | Durable evidence                                                                          | Manual/transient evidence | Limitations                    |
| ----------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------- | ------------------------------ |
| Move preserves outcomes | Tenant 404/500 or sign-in failure changes | Existing `authentication-entry`/`authentication-return` unit tests and tenant-failure BDD | Manual step 5             | Accessibility is feature V-018 |

### `packages/frontend` — `src/features/history-protection.ts` (new public entry)

**Responsibility**: Ensure a history traversal of any page reaches the server instead of reusing restored content.

**Actual consumers**: `src/app/layout.tsx`.

**Proposed signatures**:

```tsx
export function RestoredPageGuard(): null
```

**Success semantics and invariants**: Renders nothing. On `pageshow` with `persisted === true` reloads the document; on
`popstate` refreshes the current route from the server (`router.refresh()`, or `location.reload()` if the
implementation probe in quickstart §5 shows refresh does not hard-navigate on 401). Registers listeners once and
removes them on unmount. Reads no session state.

**Effect environment requirements**: None; client component (Principle IV reason: browser history events).

| Claim                                     | Meaningful violation                           | Durable evidence                             | Manual/transient evidence                                          | Limitations                                                                |
| ----------------------------------------- | ---------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Restored pages revalidate with the server | Back/forward shows usable content after expiry | None at module level (browser-only behavior) | Transient browser probe during implementation; feature V-014/V-015 | Cross-document and bfcache behavior vary by browser; Chromium only locally |

### `packages/frontend` — `src/features/session-reference.ts` (unchanged exports, changed behavior)

**Responsibility**: Browser consumer of the protected reference Server Action.

**Actual consumers**: `src/app/(app)/page.tsx`.

**Proposed signatures**: Unchanged — `ReferenceOperation({ action })`, `type ReferenceActionState`.

**Success semantics and invariants**: A rejected action invocation (gate 401/403/503 or transport failure) yields the
`Denied` state with a generic "operation was not performed" message in the existing `role="status"` region; the button
remains keyboard-operable; no client retry. The action's own `Denied` result is unchanged.

| Claim                      | Meaningful violation                                | Durable evidence                                                                  | Manual/transient evidence             | Limitations                |
| -------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------- | -------------------------- |
| Gate denial is perceivable | Denial reaches the client error screen or is silent | None at module level; Cucumber consumer scenario requires a session (increment 5) | Manual step 8 with a prepared session | Recovery content is #157's |

### `packages/frontend` — routes `/access-denied` (new), `/login-unavailable`, `forbidden.tsx` (changed)

- `/access-denied`: `export default function AccessDeniedPage(): never` calling `forbidden()`; `export const dynamic =
  "force-dynamic"`. Protected by default; always 403 when reached.
- `/login-unavailable`: awaits `requireTenantConfig()` before rendering; tenant failure keeps 404/500.
- `forbidden.tsx`: adds one keyboard-reachable `Link` to `/` with a meaningful name; heading and explanation unchanged.

Evidence: feature V-009/V-011/V-018 (Cucumber and manual); no separate module test.

## Cross-module dependency direction

- `packages/frontend` → `@pathableai/pre-ets-frontend-services` package root only. `src/proxy.ts` →
  `features/access-responses.ts`; `app/auth/*` → `features/access-responses.ts`; `app/layout.tsx` →
  `features/history-protection.ts`. Features never import `app`.
- In `frontend-services`: `index.ts` → `next.ts` → `next/protection.ts` → (`next/request.ts`, `next/handler.ts`,
  `next/cookies.ts`, `next/tenant-failure.ts`) and services (`session.ts`, `tenant.ts`); `next/session.ts` and
  `next/login.ts` also use `next/request.ts`. `next/` imports `decodeSessionReference` only through the `session.ts`
  public entry, never `session/codec.ts`. Children of `next/` are imported only by
  `next.ts` or by sibling children under the same parent, as today. No service imports `next/` or the runtime.
- Fallow zones: `next/protection.ts` and `next/request.ts` join the existing `next` zone; the two new frontend feature directories are
  covered by the Bulletproof `features` zone. No `allowUnmatched` or zone change.

## Rejected abstractions and alternatives

- A `ProtectionService` Effect service or Layer: the gate composes existing services per request; no lifecycle or
  second implementation needs a service.
- Exporting the public designation or a `classifyRequest` helper: no consumer outside `next/`.
- Adding the reference to `UsableSession` or the refresh result: it would reach page rendering.
- `skipProxyUrlNormalize`: a global change to Next URL normalization and Flight-header stripping (research D3).
- A request-scoped "trusted identity" header from proxy to resources: resources already read the session through
  `readSessionRequest`; a forwarded header would create a forgeable identity channel.
- A generic `withProtection` wrapper for route handlers and actions: per-resource opt-in (FR-002).
- A return-to URL store for login: no requirement; open-redirect surface.
- A placeholder recovery page: #157 owns recovery content.

## Open decisions

### Blocking contract decisions

- None for public contracts. Finding F-1 (public asset designation: build output, `/favicon.ico` and metadata routes,
  `/_next/image`) blocks only the final asset designation and V-004
  completion; no proposal changes a signature. Findings F-2 and F-3 have planned resolutions awaiting reviewer
  acknowledgement. See [research.md](../research.md#findings).

### Implementation choices left to tasks

- Exact Fast-Check arbitraries and example tables for the gate.
- `router.refresh()` versus `location.reload()` on `popstate` (quickstart §5 probe).
- Wording of the generic consumer denial message and the forbidden-page link label.
