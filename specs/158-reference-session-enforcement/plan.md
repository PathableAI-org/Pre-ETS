# Implementation Plan: Enforce Sessions in Reference Application Paths

**Branch**: `158-reference-session-enforcement-plan` | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature contract in `specs/158-reference-session-enforcement/spec.md` and
`specs/158-reference-session-enforcement/verification.md`

## Summary

Extend the existing frontend `SessionService` with one tenant-bound read that admits an existing usable session only
when its tenant equals the independently resolved request tenant. Replace the root's temporary always-absent session
check with a bounded SSR protected page and independently enforced Server Action. Preserve tenant 404/500 mappings,
redirect page absence to the selected tenant's existing OIDC initiation, map mismatch to actual Next.js 403 semantics,
and keep service failure distinct and fail closed. The action returns accessible success/denial state and emits a safe
short-lived receipt cookie as an independently observable synthetic effect. Existing Redis, OIDC, browser, and BDD
fixtures are extended; no backend, durable domain record, new runtime, or comprehensive application guard is added.

## Technical Context

**Language/Version**: TypeScript 6.0.3 on Node.js 26+

**Primary Dependencies**: Next.js 16.4.3 App Router, React 19.3.1, Effect 4.0.5,
`@effect/platform-node` 4.0.5, `@pathableai/react` 0.3.0, Redis client 6.3.0

**Storage**: Existing frontend-owned Redis session records only; one short-lived host-only synthetic response cookie;
no new durable schema or domain record

**Testing**: Vitest 5.0.5, `@effect/vitest` 4.0.5, `@fast-check/vitest` 0.5.0, real-Redis integration tests,
Cucumber 13.3.0 requirements BDD, Playwright 1.64.1 through the shared harness, and issue-level Node test runner

**Target Platform**: SSR-first Next.js frontend on Node.js; two independently running host processes sharing local
Redis and Keycloak for composed evidence

**Project Type**: Existing pnpm monorepo web application; implementation remains in `packages/frontend` with root-owned
BDD/evidence support

**Performance Goals**: No new numeric latency target. Each protected page/action performs one existing tenant
resolution/configuration read and at most one existing session-store read through the process-owned runtime; no
per-request runtime or Redis client is constructed.

**Constraints**: Request tenant resolves before session admission; fail closed on mismatch/unreadable state; actual 403
before streaming; no protected content/effect on denial; public exceptions stay public without bypassing tenant/safety
rules; host-only cookies; no PHI, credentials, raw references, or identifying partner data; no telemetry assertions;
no renewal, invalidation, recovery, freshness-policy invention, backend work, or default application-wide protection

**Scale/Scope**: One public session operation, one protected reference page (`/`), one protected Server Action, one
minimal client island, one bounded forbidden presentation, existing public reference routes, and retained two-process/
Redis/OIDC/action fixtures for later #154/#157/#220/#221 work

## Constitution Check

_GATE: Passed before Phase 0 research, re-checked after Phase 1 design, and re-checked after the 2026-10-25 critique revision. The revision does not weaken a gate._

| Principle                                     | Pre-design gate                                                                                                                                                                                     | Post-design result                                                                                                                                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Evidence-grounded specification            | `spec.md`, `verification.md`, issue #219, S2-E, and current `origin/main` PREETS-SESSION-001/003/004/005/006 were read as immutable authorities. #218 is present on `origin/main`; B6 remains open. | Pass. No accepted behavior is changed. B6 limits successful real-login execution and remains an explicit incomplete claim rather than an assumption.                                                          |
| II. Explicit ownership and authoritative data | Frontend owns OIDC/session/UI state; no business workflow or backend data is needed.                                                                                                                | Pass. Redis session ownership is unchanged; the synthetic receipt is bounded temporary UI state with no business data.                                                                                        |
| III. Tenant isolation                         | The request tenant must be resolved independently and compared with the session tenant; mismatch must fail closed.                                                                                  | Pass. The reference adapter normalizes Host to the lowercase hostname before unchanged `getAlias`, then `readForTenant`. Unparseable hosts are tenant 404s. Mismatch stays fieldless and maps to forbidden without substitution.                                                                                           |
| IV. Accessible, server-rendered UI            | The feature changes UI and must use installed `@pathableai/react`, SSR by default, keyboard semantics, visible focus, and perceivable outcomes.                                                     | Pass. The page stays server-rendered; only action state is a client island. Installed component guidance/declarations were read and composed-browser verification remains required.                           |
| V. Meaningful behavioral tests                | Evidence must name claims and separate module, adapter, real infrastructure, requirements BDD, and manual composed observations.                                                                    | Pass. [contracts/modules.md](contracts/modules.md) and [quickstart.md](quickstart.md) map non-duplicative evidence and preserve BDD/current-main limits. Quickstart records the named root BDD scenario revisions as implementation obligations. No telemetry test is added.                          |
| VI. Simplicity and verifiable quality         | Actual consumers must justify public types, services, packages, storage, and tools.                                                                                                                 | Pass. The existing session owner is extended, its placeholder is removed, and existing runtime/harnesses are reused. Host normalization stays a private pure function. The `"use server"` module exports only `runReferenceOperation`; action state is a sibling module. No service, Layer, workspace, dependency, Redis value API, or middleware guard is added. |

Architecture constraints also pass: frontend/backend separation is unchanged; direct installed declarations were
checked for Effect, Next.js, React, and `@pathableai/react`; the host-owned `ManagedRuntime` is reused; and exact public
signatures precede private design. Critique findings E1–E3 stay inside those gates. Host normalization reuses
authentication's pure acceptance rules without a new tenant API. The BDD revisions follow the approved tenant-first
page. The action-state split removes a runtime export that a file-level `"use server"` module cannot provide, without
adding a public module.

## Project Structure

### Documentation (this feature)

```text
specs/158-reference-session-enforcement/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── verification.md
└── contracts/
    ├── modules.md
    └── reference-application.md
```

`tasks.md` is intentionally absent. The stack workflow creates it only on the later implementation branch after plan
review.

### Source Code (repository root)

```text
packages/frontend/
├── src/
│   ├── app/
│   │   ├── (app)/
│   │   │   ├── actions.ts                 # "use server"; only runtime export is runReferenceOperation
│   │   │   ├── page.tsx                   # replace root placeholder with protected reference page
│   │   │   ├── reference-action-state.ts  # ReferenceActionState and initial state; no "use server"
│   │   │   ├── session-context.ts         # planned private tenant/cookie/runtime outcome adapter
│   │   │   └── tenant-context.ts          # normalize Host, then cache branded alias + config
│   │   ├── auth/cookie.ts                 # share the existing session-cookie name with protected adapters
│   │   └── forbidden.tsx                  # bounded tenant/session mismatch indication
│   ├── components/session/
│   │   └── reference-operation.tsx        # planned minimal useActionState client island
│   └── lib/
│       ├── runtime.ts                     # unchanged host-owned SessionService/TenantConfigService runtime
│       ├── session.ts                     # extend public read contract; remove hasSession placeholder
│       ├── session/                       # unchanged private codec/store ownership
│       └── tenant.ts                      # unchanged public tenant operations consumed by private adapter
└── tests/
    ├── integration/session-redis.test.ts  # extend real Redis independent-client evidence
    ├── lib/session.test.ts                # public tenant-bound service examples/property
    └── unit/
        └── reference-session-enforcement.test.ts # framework adapter/page/action mappings

tests/
├── bdd/
│   ├── requirements/
│   │   └── session-reference-enforcement.feature # bounded current-main requirements BDD
│   ├── session/
│   │   └── reference-session-enforcement.test.ts # issue-level two-process/browser/action evidence
│   ├── steps/                             # reuse/extend semantic HTTP/auth/presentation steps
│   └── support/                           # reuse two-process world; no direct session-store access
└── support/oidc/harness.ts                # reuse runner-neutral real-provider/process/browser fixture
```

**Structure Decision**: The public contract stays in the existing session parent. Framework-specific request state and
outcome mapping remain private to the `(app)` reference boundary. The client island owns only action state. Root BDD
keeps stakeholder evidence outside workspace internals, while issue-level infrastructure evidence reuses the existing
harness.

## Complexity Tracking

No constitution violation requires justification.

## Phased Engineering Design

### Phase 1 — Module architecture

1. **Extend the existing public session parent**. `lib/session.ts` already owns session establishment, raw read,
   public usable/absent/failure outcomes, and the private codec/store children. Add tenant-bound read behavior there
   because #218 explicitly deferred that consumer contract to #219. Do not add an enforcement service, Layer, package,
   or child module. Remove the temporary `hasSession()` operation after its only production consumer migrates.
2. **Preserve tenant ownership**. `TenantConfigService` remains the only owner of alias selection, selected file
   loading, and approved 404/500 errors. The private `(app)` adapter applies the same pure acceptance rules as
   authentication's unexported `parseRequestHost`, passes only the lowercase hostname to existing `getAlias`, and then
   calls `getConfigFromAlias`. An unparseable host is the existing tenant 404 and does not call `getAlias`. Do not
   change `getAlias`, `getConfigFromHost`, or the diagnostic route, and do not add a host-parsing service or Effect
   wrapper. The session module never sees a host or tenant file. `/_test/onsite` keeps its current `requireTenantConfig`
   outcomes. Details are in [research.md](research.md) Decision 2.
3. **Replace the bounded root placeholder**. `/` becomes the reference protected page. A private
   `session-context.ts` reads async Next headers/cookies, invokes tenant then session public operations through the
   existing `Runtime`, and returns/maps the result before rendering. Public callback, login/failure/recovery, and
   `/_test` resources do not import this adapter.
4. **Add one independently protected action**. `runReferenceOperation` is the only runtime export of the `"use server"`
   module `(app)/actions.ts`. `ReferenceActionState` and `initialReferenceActionState` live in the sibling
   `(app)/reference-action-state.ts`, which has no `"use server"` directive. The action repeats host normalization,
   tenant resolution, cookie reading, and `readForTenant` on every invocation. It does not accept identity/tenant
   authority from the page or form. A private action helper emits the bounded receipt after admission. This private
   concern does not warrant a service or public module.
5. **Keep UI server-first**. The page and protected identity/policy presentation stay server-rendered. One
   `components/session/reference-operation.tsx` client island owns `useActionState`, pending state, native form submit,
   and the status announcement because those are browser interactions. Installed `@pathableai/react` supplies the
   page/layout/form/button primitives.
6. **Preserve runtime and infrastructure**. `ApplicationServices`, `applicationLayer`, the shared Redis Layer, OIDC
   services, and process lifecycle remain unchanged. The feature adds no backend, config, exporter, runtime, or
   persistent model.

These decisions and rejected abstractions are recorded in [contracts/modules.md](contracts/modules.md) and
[research.md](research.md).

### Phase 2 — Public module contracts

[contracts/modules.md](contracts/modules.md) defines the exact change to `SessionService`:

- add `ReadSessionForTenantInput`;
- add fieldless `SessionTenantMismatch`;
- add `readForTenant`, returning the existing `NoUsableSession | UsableSession` success union and the explicit
  `SessionServiceUnavailable | SessionTenantMismatch` error union;
- remove the always-false `hasSession()` placeholder; and
- preserve `establish`, raw `read`, the stored wire format, the Redis adapter, and every existing result field.

The matching operation returns the unchanged `UsableSession`; it does not recompute policy/deadline, decode a host, or
convert service failures. `TenantConfigService` remains an unchanged upstream dependency. No new runtime service or
environment requirement is introduced.

[contracts/reference-application.md](contracts/reference-application.md) defines the bounded page/action/UI/cookie
contract. It is an external browser contract, not another public TypeScript service and not a stable Next-generated
action URL.

### Phase 3 — Module contract evidence

Evidence follows consumer → claim → violation → smallest boundary:

- Extend public `SessionService` `@effect/vitest` scenarios with matching, mismatch, absence pass-through, and service
  failure. Use actual `SessionService.layer` with isolated in-memory Redis. A bounded Fast-Check property varies valid
  request aliases and establishes that admission occurs only on equality; named examples keep equality/difference and
  fieldless-error disclosure explicit.
- Reuse existing raw-read examples for absent, malformed, missing, expired, corrupt, and store-failure classification.
  `readForTenant` cases assert consumption of those outcomes without repeating codec/store internals.
- Extend the real-Redis test only where it adds infrastructure uncertainty: one client establishes, independently
  scoped clients perform matching/mismatched tenant-bound reads, and disconnected reads remain
  `SessionServiceUnavailable`. This still does not prove running application instances.
- Framework adapter tests inject public service outcomes to establish tenant-first ordering, page redirect, action
  denial, forbidden invocation, server-failure distinction, unchanged protected result, and exact zero/one receipt
  calls. They include the `alias.localhost:3000` example: `getAlias` is called with `alias.localhost` and not the
  port. An unparseable host, such as `alias.localhost/extra`, is a tenant 404 and does not call `getAlias`. These
  tests do not claim actual HTTP 403 or browser accessibility.
- No durable test asserts logs, spans, attributes, exporter output, or raw cookie values. This feature adds no
  observability claim; temporary diagnostics must be removed.

Claim-by-claim evidence and limitations are tabulated in [contracts/modules.md](contracts/modules.md). Feature HTTP,
browser, infrastructure, and handoff evidence remain in Phase 5 rather than duplicating the module claim.

### Phase 4 — Implementation architecture

1. Add `SessionTenantMismatch` and `readForTenant` inside `SessionService.layer`. Implement it by calling the existing
   local `read`, returning `NoUsableSession` unchanged, returning `UsableSession` unchanged only on strict branded-alias
   equality, and otherwise failing with the fieldless mismatch. Preserve defects/interruption. Remove `hasSession` and
   update only its root/test fixtures.
2. Export the existing session-cookie name, or one narrow read helper, from `app/auth/cookie.ts` so callback writing and
   protected page/action reading cannot drift. Keep the untrusted string outside browser-visible props and let
   `SessionService.read` own decoding.
3. Extend `tenant-context.ts` so the reference adapter reads async `headers().get("host")`, normalizes it with the
   `parseRequestHost` acceptance rules in [research.md](research.md) Decision 2, and caches a request-scoped
   `{ tenantAlias, config }` from `TenantConfigService.getAlias(hostname)` and `getConfigFromAlias`. Pass only the
   lowercase hostname. An unparseable host is the existing tenant 404 and does not call `getAlias`. Keep `getAlias`,
   `getConfigFromHost`, and `GET /_test/tenant-config` on the raw-host contract. Keep `/_test/onsite`'s current
   `requireTenantConfig` outcomes. Tenant errors continue through `httpErrorPage`. Add the adapter example that
   `alias.localhost:3000` calls `getAlias` with `alias.localhost`. During implementation, replace the superseded
   `docs/authentication.md` and `docs/session-state.md` sentences named in Decision 2. This planning pass does not edit
   those docs.
4. Add a private session-context adapter that obtains the cookie through async `cookies()`, calls `readForTenant` via
   the existing `Runtime`, and maps typed results only at the awaited Next boundary. Do not construct a per-request
   runtime or catch Next control-flow errors.
5. Replace root `page.tsx` with a dynamic, private/no-store server page. Resolve the tenant before session access.
   `NoUsableSession` redirects to `/auth/login`; mismatch invokes `forbidden()` before streaming; service failure
   remains a safe server failure; a usable match renders only bounded identity, tenant, deadline, warning policy, and
   the action control. Revise `app/forbidden.tsx` to generic mismatch copy without tenant/identity details.
6. Implement the Server Action split. `packages/frontend/src/app/(app)/reference-action-state.ts` has neither
   `"use server"` nor `server-only` and defines:

   ```ts
   export type ReferenceActionState =
     | { readonly _tag: "Ready" }
     | { readonly _tag: "Denied"; readonly message: string }
     | { readonly _tag: "Succeeded"; readonly message: string }

   export const initialReferenceActionState: ReferenceActionState = {
     _tag: "Ready"
   }
   ```

   `packages/frontend/src/app/(app)/actions.ts` has a file-level `"use server"` directive. Its only runtime export is:

   ```ts
   export async function runReferenceOperation(
     previousState: ReferenceActionState,
     formData: FormData
   ): Promise<ReferenceActionState>
   ```

   The client island imports the state type and initial value from the sibling module and the action from the server
   module. It still receives no tenant config, cookie, session reference, or identity props. Re-run host
   normalization and all enforcement on submission. For a usable match, set exactly one short-lived host-only receipt
   cookie and return `Succeeded`; for absence return `Denied` without OIDC/effect; for mismatch call `forbidden()`;
   for service/tenant failure expose no protected result or receipt. The receipt value has no semantic contract and is
   never logged or retained.
7. Implement the minimal client island with installed `Form`, `Button`, and result presentation. Keep a meaningful
   accessible button name, native keyboard behavior, visible focus, disabled/pending state, and a polite status region.
   Do not move data loading or page composition into the client.
8. Revise the named requirements BDD scenarios as implementation obligations. Do not open Redis or add a pending
   authenticated scenario. In `tests/bdd/requirements/tenant-oidc-initiation.feature`, replace only
   `Scenario Outline: Root delegates before tenant-dependent work without protected content`. A valid Springfield
   tenant, including a fabricated cookie on `springfield.example.test`, still redirects to same-origin `/auth/login`
   with no protected content. Invalid JSON for the selected Springfield file returns 404 with no login redirect. The
   bare base host `example.test` returns 404 with no login redirect. Keep
   `Scenario: First-time browser entry delegates automatically to the selected real provider` and
   `Scenario Outline: Unavailable preparation leaves access denied with public failure content` as login delegation
   for the document request at `springfield.localhost:3000`. In `tests/bdd/requirements/tenant-failures.feature`,
   change only the document request that is itself the tenant failure, to the 404 or 500 that row already expects from
   `/auth/login`, with no login redirect and no fallback tenant:
   `capital-city.example.test` becomes 404; `example.test`, `unknown.example.test`, and `127.0.0.1` become 404;
   directory failures become 500; unusable selected files become 404; missing selected files become 404 in host mode
   and 500 in static mode; and `Scenario: A static alias with no tenant file is a server failure` changes its document
   request at `springfield.example.test` to 500. Leave the valid Springfield document requests in the absent-path,
   host-mode missing-file, and outside-pattern scenarios as login delegation. Leave the absent-path 404 and the
   `/auth/login` and `/_test/tenant-config` assertions. Replace the feature sentence "Root is a separate
   session-missing redirect; complete session lookup, authenticated access and other tenant-dependent consumers remain
   incomplete." with text that `/` resolves the tenant before session admission and that a tenant failure on the
   document request returns that failure's 404 or 500. Do not revise `tenant-context.feature` or
   `onsite-prototype.feature`. Add only current-main-tagged bounded scenarios. Extend the issue-level two-process Node
   workflow for actual HTTP/action/receipt behavior and keep the successful real-login A-to-B case incomplete until B6
   works. [quickstart.md](quickstart.md) section 4 is the execution checklist for these edits.
9. Record the delivered path/fixture inventory and downstream categories in the implementation handoff. Then run
   focused behavior checks, the manual procedure, and repository quality gates. No implementation step may broaden
   this reference boundary into #154's comprehensive integration.

Installed APIs verified for this architecture:

- Effect 4.0.5: existing `Context.Service`, `Schema.TaggedError`, `Effect.fn`, `Layer`, and `ManagedRuntime` declarations;
- Next.js 16.4.3: async `headers()`/`cookies()`, Server Actions, and `forbidden(): never` for Server Components/Server
  Functions under the already enabled `authInterrupts`. A file-level `"use server"` module exports only async
  functions, so `initialReferenceActionState` stays in the sibling module. Actual HTTP evidence remains required
  because `forbidden()` is experimental;
- React 19.3.1: `useActionState` and Server Action form types;
- `@pathableai/react` 0.3.0: public `Form`, `Button`, page/layout, alert/text, and native attribute forwarding.

### Phase 5 — Feature verification integration

[verification.md](verification.md) remains the claim authority. [quickstart.md](quickstart.md) turns it into this
execution order:

1. public tenant-bound service examples/property;
2. real-Redis independent-client and disconnected-client evidence;
3. page/action adapter scenarios;
4. one production build and the issue-level running HTTP/action/two-process workflow;
5. current-main requirements BDD for bounded missing-session/public/tenant behavior;
6. agent-executed real browser keyboard/focus, A-to-B (when B6 permits), cross-tenant, stale-action, public diagnostic,
   tenant-failure, and controlled outage observations;
7. delivered-route/fixture/downstream inventory review;
8. cleanup and repository quality gates.

Module evidence does not duplicate framework status or browser claims. Existing tenant/session tests retain ownership of
decoding and 404/500 rules. Requirements BDD uses feature-level `@partial` and cannot fabricate sessions, open Redis,
or assert issue-only service-failure/handoff behavior. Actual 403, receipt presence/count, keyboard focus, and two
running processes are observed through the composed application. Real-login V-002 is recorded incomplete when the B6
freshness gate is unavailable; skipped execution, direct Redis setup, redirects, or application-session creation alone
do not satisfy it.

Evidence records name the exact revision, safe conditions, observed claim/result, cleanup, and limitations. They omit
credentials, provider/callback values, cookies, session references, Redis records/keys, identity-bearing raw output,
PHI, and identifying partner data. Temporary probes are removed and shared Redis is never flushed.
