# Module Architecture and Public Contracts: Protect Application Entry Points and Bind Tenant Authentication

**Plan**: [plan.md](../plan.md)

**Feature verification**: [verification.md](../verification.md)

**Status**: Planned design — Next.js 16.4.5, React 19.3.1, and Effect 4.1.2 signatures checked against the installed
declarations in `packages/frontend` and `packages/frontend-services` (see [research.md](../research.md#installed-dependency-facts))

## Module architecture decisions

| Concern                                  | Current owner and consumers                                                                        | Decision                                                                                          | Public boundary                                                         | Private decomposition                                                                                                          | Rationale and non-goals                                                                                                                                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default entry-point protection           | None; `src/proxy.ts` is pass-through                                                               | Extend the existing Next host-adapter module `frontend-services/src/next.ts`                      | `createProtectionProxy`, `ProtectionResponses` (package root re-export) | New child `src/next/protection.ts` (designation, classification, outcome program); cookie re-issue helper in `next/cookies.ts` | The proxy is the only hook that sees pages, handlers, and actions before resource code (research D1). The Next app must not import Effect, so the gate lives with the other host adapters. No new service, Layer, provider interface, or package. |
| Public-resource designation              | Implicit: public resources are whatever does not call `readSessionRequest`                         | Decompose into a private closed designation inside the protection child                           | Behavior of `createProtectionProxy` only                                | Constant designation in `next/protection.ts`                                                                                   | Security policy stays with the code that enforces it; `/auth/callback`, `/auth/login`, and `/login-unavailable` are already `frontend-services` paths. Not exported: no consumer needs the list. #157 adds the recovery path here.                |
| Session read, admission, renewal         | `frontend-services/src/session.ts` `SessionService`; callback, `readSessionRequest`, tests         | Preserve                                                                                          | Unchanged `SessionService`                                              | Unchanged `session/codec.ts`, `session/store.ts`                                                                               | `readForTenant` and `refreshForTenant` already provide admission and renewal. The gate is their first HTTP consumer of `refreshForTenant`.                                                                                                        |
| Tenant resolution                        | `frontend-services/src/tenant.ts` `TenantConfigService`                                            | Preserve                                                                                          | Unchanged                                                               | Unchanged                                                                                                                      | `getAlias` + `getConfigFromAlias` + `effectiveSessionPolicy` are sufficient; no new tenant API.                                                                                                                                                   |
| Callback completion                      | `frontend-services/src/next/callback.ts` `createCallbackHandler`; `src/app/auth/callback/route.ts` | Extend behavior (success response) without signature change                                       | Unchanged `createCallbackHandler`, `CallbackResponses`                  | `establishSession` returns 303 to `/`                                                                                          | A 204 is not navigable (research D9). `CallbackFreshness` keeps its fail-closed default and stays unexported from the package root.                                                                                                               |
| Request session read for resources       | `frontend-services/src/next/session.ts` `readSessionRequest`; `(app)/page.tsx`, `(app)/actions.ts` | Preserve                                                                                          | Unchanged                                                               | Unchanged                                                                                                                      | Resource-level identity retrieval and defense in depth after the gate. Renewal stays in the gate so a resource read never renews twice.                                                                                                           |
| Next proxy wiring                        | `packages/frontend/src/proxy.ts`                                                                   | Extend                                                                                            | Next `proxy` export and static `config.matcher`                         | None                                                                                                                           | Thin host file: matcher literal plus host responses. Fallow `allowUnmatched` already covers it.                                                                                                                                                   |
| Authentication and tenant-failure bodies | `packages/frontend/src/app/auth/presentation.tsx`; auth login and callback routes                  | Extract into a feature public entry because the proxy becomes a third consumer outside `app/auth` | `src/features/access-responses.ts`                                      | `src/features/access-responses/presentation.tsx` (moved file, unchanged behavior)                                              | The recursive module rule forbids the proxy from reaching into the `app/auth` segment's private helper. Moving it behind a feature entry satisfies both the rule and Bulletproof (`app` → `features`; proxy unrestricted).                        |
| Forbidden presentation                   | `src/app/forbidden.tsx` (`forbidden()` convention)                                                 | Preserve as the single forbidden presentation; add one internal protected page                    | Route `/access-denied`                                                  | `src/app/access-denied/page.tsx` calls `forbidden()`                                                                           | One presentation for proxy and resource-level 403 (research D4). No new feature module: the page has no UI of its own.                                                                                                                            |
| History restoration protection           | None                                                                                               | New feature public entry                                                                          | `src/features/history-protection.ts` → `RestoredPageGuard`              | `src/features/history-protection/restored-page-guard.tsx` (`"use client"`)                                                     | Browser-only events (research D8). One consumer (root layout). Not placed in `session-reference`, which is the reference action feature, not an application-wide concern.                                                                         |
| Protected Server Action consumer         | `src/features/session-reference.ts`; `(app)/page.tsx`                                              | Extend private behavior; public exports unchanged                                                 | Unchanged `ReferenceOperation`, `ReferenceActionState`                  | `reference-operation.tsx` maps a rejected invocation to `Denied`                                                               | FR-005/FR-026 observable denial (research D10). No new domain workflow.                                                                                                                                                                           |
| Public sign-in error page tenant binding | `src/app/login-unavailable/page.tsx`                                                               | Extend                                                                                            | Route behavior                                                          | Calls existing `requireTenantConfig` from `(app)/tenant-context.ts`                                                            | FR-008: public status must not bypass request tenant resolution (research D5). Reuses the helper `/_test/onsite` already imports.                                                                                                                 |
| Runtime and resources                    | `frontend-services/src/runtime.ts` process `ManagedRuntime`                                        | Preserve                                                                                          | Unchanged `Runtime.runPromise`                                          | Unchanged                                                                                                                      | Node proxy runs in-process and reads the published runtime slot; no per-request runtime or Redis client.                                                                                                                                          |

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
   * The Next app rewrites to `/access-denied`.
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
`host`, `rsc`, `next-action`, `next-router-prefetch`, `sec-fetch-mode`, and the `pathable-session` cookie are read
here. Host decoding stays in `TenantConfigService.getAlias`; reference decoding stays in `SessionService`. No other
header, query value, or cookie supplies tenant or identity context. `responses` is trusted host code.

**Request classes (closed sets)**:

| Term                | Definition                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public request      | `GET`/`HEAD` and pathname exactly `/auth/callback`, `/auth/login`, `/login-unavailable`, `/_test`, or beginning with `/_test/`                     |
| Document entry      | Protected, `GET`/`HEAD`, no `rsc` header, no `next-action` header                                                                                  |
| Application request | Any other protected request: RSC and prefetch requests, Server Action invocations, every non-`GET`/`HEAD` method                                   |
| Qualifying renewal  | Document entry with `sec-fetch-mode: navigate` → `deliberate-page-request`; `POST` with `next-action` → `deliberate-form-submission`; nothing else |

**Success semantics and invariants**:

| Condition (evaluated in order)         | Document entry                                                                      | Application request |
| -------------------------------------- | ----------------------------------------------------------------------------------- | ------------------- |
| Public request                         | `NextResponse.next()`, no session read, no header change                            | (not applicable)    |
| Runtime not started                    | 503                                                                                 | 503                 |
| Tenant failure                         | `responses.tenantFailure(404 \| 500)`                                               | same                |
| `SessionServiceUnavailable`            | 503                                                                                 | 503                 |
| `NoUsableSession`                      | 307 `Location: /auth/login`                                                         | 401                 |
| `SessionTenantMismatch`                | `responses.forbiddenDocument(request)`                                              | 403                 |
| `UsableSession`, no qualifying renewal | `NextResponse.next()` with `Cache-Control: private, no-store`                       | same                |
| `UsableSession`, qualifying renewal    | as above, plus `pathable-session` re-issued with `Max-Age` = remaining idle seconds | same                |

- The request tenant is always resolved from the request before the session is read and is never replaced by the
  session tenant.
- No non-public request is ever passed through unless the session is usable for the resolved tenant; any defect makes
  the returned promise reject (Next answers 500) rather than pass the request through.
- Gate-generated denials carry `Cache-Control: private, no-store`, an empty body, and set no session or correlation
  cookie; they never echo the reference, identity, tenant, or store details.
- At most one session-store operation per request: `refreshForTenant` for a qualifying renewal, otherwise
  `readForTenant`. Public requests perform none.
- Renewal policy is `effectiveSessionPolicy` of the configuration loaded for the resolved tenant on this request.
- The gate never creates a session and never starts login for an application request.

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
`SESSION_COOKIE`, and the existing cookie attribute rule. `readSessionRequest` keeps its behavior for resources. The
recovery-content path is added to the designation by #157; #155 may extend qualifying renewal; neither changes this
signature.

### Contract evidence — protection gate

| Claim                                                                                         | Meaningful violation                                                                        | Durable evidence                                                                                                                                                                                                                                                                                                    | Manual/transient evidence | Limitations and non-duplication                                                                                                         |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Only designated `GET`/`HEAD` paths pass without a session                                     | An undesignated path, method, or spelling passes through without a usable session           | Fast-Check property through `createProtectionProxy` with a `NoUsableSession` double: for generated pathnames, methods, and header subsets, pass-through occurs iff the request is in the designation; named examples for the designated paths, `/_test` variants, trailing/case variants, and POSTs to public paths | None                      | Generated domain is the request shape the gate reads; does not prove Next routes every resource through the proxy (feature V-001/V-002) |
| Public requests read no session state                                                         | Diagnostic or callback depends on, or touches, session state                                | Examples asserting the session double is not called for public requests                                                                                                                                                                                                                                             | None                      | Session creation by the diagnostic itself is feature evidence (V-003)                                                                   |
| Tenant resolves first and failure keeps 404/500                                               | Session read before tenant, login or 403 on tenant failure, fallback tenant                 | Examples with tenant doubles failing `getAlias` and `getConfigFromAlias` (host and static semantics), asserting factory status and no session call                                                                                                                                                                  | None                      | Real mode-specific selection is existing tenant evidence plus feature V-011                                                             |
| Outcome matrix per request class                                                              | Document gets 401, application request gets 307, mismatch passes, unavailable becomes login | Table-driven examples over the class × session-outcome matrix                                                                                                                                                                                                                                                       | None                      | HTTP behavior through Next is feature evidence                                                                                          |
| Qualifying renewal only for deliberate navigation and action submission, with cookie re-issue | Prefetch/RSC renews; navigation does not renew; renewed cookie keeps the old lifetime       | Examples asserting `refreshForTenant` activity and policy, `readForTenant` otherwise, and re-issued cookie attributes/`Max-Age`; fixed `Clock`                                                                                                                                                                      | None                      | Cross-instance renewal is gated feature evidence (V-008); SESSION-009 completeness is #155's                                            |
| Real store outcomes reach the gate unchanged                                                  | Expired, invalidated, or outage state admitted or turned into login                         | `tests/integration/protection-redis.test.ts`: real `SessionService` on owned-prefix Redis; establish, expire, invalidate, and mismatch records; disconnected client → 503                                                                                                                                           | None                      | Adapter boundary, not running Next (F-2)                                                                                                |
| Gate never passes on defect                                                                   | A thrown factory or runtime error yields pass-through                                       | Example with a throwing factory asserting rejection                                                                                                                                                                                                                                                                 | None                      | —                                                                                                                                       |

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

**Success semantics and invariants**: Every application path, including `/`, absent paths, `/_next/image`, and Server
Action posts, is matched. Only framework build assets and development tooling are unmatched.

**Expected errors**: None (gate outcomes).

**Effect environment requirements**: None; not an Effect workspace.

**Compatibility and relationships**: Replaces the pass-through proxy and its two-path matcher.

| Claim                                          | Meaningful violation                    | Durable evidence                                                                                                                                                     | Manual/transient evidence                                  | Limitations and non-duplication                                 |
| ---------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| Matcher excludes only build assets and tooling | An application path is unmatched        | `tests/unit/proxy.test.ts`: matcher literal equality and path-to-regexp examples (`/`, absent path, `/_next/image`, `/_test/x` matched; `/_next/static/x` unmatched) | V-002 probe observes a new page/handler/action being gated | Literal test does not prove Next honors it; feature V-001/V-002 |
| Mismatch document rewrites to `/access-denied` | Mismatch renders the requested resource | Unit example with a mocked gate factory capturing `forbiddenDocument`                                                                                                | Manual step 6                                              | 403 rendering is feature evidence (V-009)                       |

### `packages/frontend` — `src/features/access-responses.ts` (new public entry, moved behavior)

**Responsibility**: Authentication-return (sign-in failure) and tenant-failure response bodies for route handlers and
the proxy.

**Actual consumers**: `src/app/auth/login/route.ts`, `src/app/auth/callback/route.ts`, `src/proxy.ts`.

**Proposed signatures**:

```ts
import type { TenantFailureResponse } from "@pathableai/pre-ets-frontend-services"
import type { ReactDOMServerReadableStream } from "react-dom/server"

export const authenticationReturnBody: () => Promise<ReactDOMServerReadableStream>
export const tenantFailureResponse: TenantFailureResponse
```

Behavior is unchanged from `src/app/auth/presentation.tsx`; that file moves to
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
- In `frontend-services`: `index.ts` → `next.ts` → `next/protection.ts` → (`next/handler.ts`, `next/cookies.ts`,
  `next/tenant-failure.ts`) and services (`session.ts`, `tenant.ts`). Children of `next/` are imported only by
  `next.ts` or by sibling children under the same parent, as today. No service imports `next/` or the runtime.
- Fallow zones: `next/protection.ts` joins the existing `next` zone; the two new frontend feature directories are
  covered by the Bulletproof `features` zone. No `allowUnmatched` or zone change.

## Rejected abstractions and alternatives

- A `ProtectionService` Effect service or Layer: the gate composes existing services per request; no lifecycle or
  second implementation needs a service.
- Exporting the public designation or a `classifyRequest` helper: no consumer outside the gate.
- A request-scoped "trusted identity" header from proxy to resources: resources already read the session through
  `readSessionRequest`; a forwarded header would create a forgeable identity channel.
- A generic `withProtection` wrapper for route handlers and actions: per-resource opt-in (FR-002).
- A return-to URL store for login: no requirement; open-redirect surface.
- A placeholder recovery page: #157 owns recovery content.

## Open decisions

### Blocking contract decisions

- None for public contracts. Finding F-1 (build-asset designation) blocks only the final asset designation and V-004
  completion; no proposal changes a signature. Findings F-2 and F-3 have planned resolutions awaiting reviewer
  acknowledgement. See [research.md](../research.md#findings).

### Implementation choices left to tasks

- Exact Fast-Check arbitraries and example tables for the gate.
- Whether the cookie re-issue helper takes the request's raw reference or a decoded reference.
- `router.refresh()` versus `location.reload()` on `popstate` (quickstart §5 probe).
- Wording of the generic consumer denial message and the forbidden-page link label.
