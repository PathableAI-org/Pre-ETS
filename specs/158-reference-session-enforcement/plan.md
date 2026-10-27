# Implementation Plan: Enforce Sessions in Reference Application Paths

**Branch**: `158-reference-session-enforcement-plan` | **Date**: 2026-10-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature contract in `specs/158-reference-session-enforcement/spec.md` and
`specs/158-reference-session-enforcement/verification.md`

## Summary

Extend `@pathableai/pre-ets-frontend-services`' existing `SessionService` with one tenant-bound read that admits an
existing usable session only when its tenant equals the independently resolved request tenant. Add one exported request
adapter in that workspace so the Next app never imports Effect, runtime, tenant, or session internals. Replace the
root's temporary always-absent check with a bounded SSR protected page and browser-invoked Server Action; keep its UI
behind a Bulletproof feature entry. Preserve mode-specific tenant 404/500 behavior, redirect page absence to the
selected tenant's OIDC initiation, map mismatch to actual Next.js 403 semantics, and keep service failure distinct and
fail closed. The action emits a safe short-lived receipt cookie as an observable synthetic effect. Existing Redis,
OIDC, browser, and BDD fixtures are extended; no backend, durable domain record, new runtime, or comprehensive guard is
added.

## Technical Context

**Language/Version**: TypeScript 6.0.3 on Node.js 26+

**Primary Dependencies**: Next.js 16.4.3 App Router, React 19.3.1, Effect 4.0.5,
`@effect/platform-node` 4.0.5, `@pathableai/react` 0.3.0, Redis client 6.3.0

**Storage**: Existing frontend-services-owned Redis session records only; one short-lived host-only synthetic response
cookie; no new durable schema or domain record

**Testing**: Vitest 5.0.5, `@effect/vitest` 4.0.5, `@fast-check/vitest` 0.5.0, real-Redis integration tests,
Cucumber 13.3.0 requirements BDD, Playwright 1.64.1 through the shared harness, and issue-level Node test runner

**Target Platform**: SSR-first Next.js frontend on Node.js; two independently running host processes sharing local
Redis and Keycloak for composed evidence

**Project Type**: Existing pnpm monorepo web application; Effect/session/request workflows remain in
`packages/frontend-services`, presentation and Server Action hosting remain in `packages/frontend`, and BDD/evidence
support remains root-owned

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

_GATE: Passed before Phase 0 research, re-checked after Phase 1 design, and re-checked after the 2026-10-26 refactor review. The revision does not weaken a gate._

| Principle                                     | Pre-design gate                                                                                                                                                                                     | Post-design result                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Evidence-grounded specification            | `spec.md`, `verification.md`, issue #219, S2-E, and current `origin/main` PREETS-SESSION-001/003/004/005/006 were read as immutable authorities. #218 is present on `origin/main`; B6 remains open. | Pass. No accepted behavior is changed. B6 limits successful real-login execution and remains an explicit incomplete claim rather than an assumption.                                                                                                                                                                                     |
| II. Explicit ownership and authoritative data | The frontend-services workspace owns OIDC/session workflows; the Next app owns presentation; no business workflow or backend data is needed.                                                        | Pass. Redis session ownership stays in `frontend-services`; the Next app calls its exported adapter and owns only the bounded page, Server Action host edge, feature UI, and temporary receipt presentation.                                                                                                                             |
| III. Tenant isolation                         | The request tenant must be resolved independently and compared with the session tenant; mismatch must fail closed.                                                                                  | Pass. The request adapter first gives the raw Host to unchanged mode-aware selection. Only a host-mode failure triggers strict normalization and a lowercase-hostname retry. Static mode therefore ignores Host as required; mismatch stays fieldless and cannot substitute session tenant data.                                         |
| IV. Accessible, server-rendered UI            | The feature changes UI and must use installed `@pathableai/react`, SSR by default, keyboard semantics, visible focus, and perceivable outcomes.                                                     | Pass. The page stays server-rendered; only action state is a client island behind `src/features/session-reference.ts`. Installed component guidance/declarations were read and composed-browser verification remains required.                                                                                                           |
| V. Meaningful behavioral tests                | Evidence must name claims and separate module, adapter, real infrastructure, requirements BDD, and manual composed observations.                                                                    | Pass. [contracts/modules.md](contracts/modules.md) and [quickstart.md](quickstart.md) map non-duplicative evidence and preserve BDD/current-main limits. Quickstart records the named root BDD scenario revisions as implementation obligations. No telemetry test is added.                                                             |
| VI. Simplicity and verifiable quality         | Actual consumers must justify public types, services, packages, storage, and tools.                                                                                                                 | Pass. The existing session owner is extended, its placeholder is removed, and one exported request adapter reuses the shared runtime. The `"use server"` module exports only `runReferenceOperation`; action state stays in the feature module. No service, Layer, workspace, dependency, Redis value API, or middleware guard is added. |

Architecture constraints also pass: frontend/backend separation is unchanged; `frontend-services` keeps all Effect
workflows and the shared `ManagedRuntime`; `frontend` imports only the package's public adapter and owns presentation.
Direct installed declarations were checked for Effect, Next.js, React, and `@pathableai/react`. Raw-first tenant
selection preserves static mode before the adapter applies a host-mode normalization retry. The BDD revisions follow
the approved tenant-first page. The action-state split avoids a runtime object export from a file-level `"use server"`
module, and the feature public entry preserves the Bulletproof and recursive module boundaries.

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
packages/frontend-services/
├── src/
│   ├── auth/cookie.ts               # callback writer consumes the shared public cookie name
│   ├── entry.ts                     # remove hasSession bridge
│   ├── index.ts                     # export the bounded request adapter/cookie contract
│   ├── runtime.ts                   # unchanged shared ManagedRuntime owner
│   ├── session.ts                   # extend public read contract; remove hasSession placeholder
│   ├── session/                     # unchanged private codec/store ownership
│   ├── session-request.ts           # raw-Host/cookie adapter and thin Next outcome mapping
│   └── tenant.ts                    # unchanged public mode-aware tenant operations
└── tests/
    ├── integration/session-redis.test.ts
    ├── lib/session.test.ts
    └── unit/reference-session-enforcement.test.ts

packages/frontend/
├── src/
│   ├── app/
│   │   ├── (app)/
│   │   │   ├── actions.ts         # "use server" host edge; calls frontend-services
│   │   │   └── page.tsx           # protected SSR reference page
│   │   └── forbidden.tsx          # bounded tenant/session mismatch indication
│   ├── features/session-reference.ts   # public Bulletproof feature entry
│   └── features/session-reference/
│       ├── action-state.ts
│       └── reference-operation.tsx    # client island; receives the action as a prop
└── tests/unit/reference-session-enforcement.test.ts # page/action/feature wiring and presentation

tests/
├── bdd/
│   ├── requirements/
│   │   └── session-reference-enforcement.feature # bounded current-main requirements BDD
│   ├── session/
│   │   └── reference-session-enforcement.test.ts # issue-level two-process/browser/action evidence
│   ├── steps/                             # reuse/extend semantic HTTP/auth/presentation steps
│   └── support/                           # reuse two-process world; no direct session-store access
└── support/oidc/harness.ts                # add explicit shared sessionPrefix alongside transactionPrefix
```

**Structure Decision**: The public Effect contract and request adapter stay in `frontend-services`; the Next app does
not import Effect or recreate tenant/session workflows. The app hosts the Server Action and SSR page, while feature UI
and action state live behind `features/session-reference.ts`; the client island receives the action as a prop and never
imports from `src/app`. Root BDD keeps stakeholder evidence outside workspace internals, while issue-level
infrastructure evidence reuses the existing harness.

## Complexity Tracking

No constitution violation requires justification.

## Phased Engineering Design

### Phase 1 — Module architecture

1. **Extend the existing public session parent**. `packages/frontend-services/src/session.ts` owns session
   establishment, raw read, public usable/absent/failure outcomes, and the private codec/store children. Add the
   tenant-bound read there because #218 explicitly deferred that consumer contract to #219. Do not add an enforcement
   service, Layer, package, or child module. Remove `hasSession()` and its `entry.ts`/`index.ts` bridge after the root
   consumer migrates; update runtime, callback, and test service fixtures that implement the interface.
2. **Preserve mode-aware tenant ownership**. `TenantConfigService` remains the only owner of alias selection, selected
   file loading, and approved 404/500 errors. The exported request adapter first calls `getAlias(rawHost)`. Static mode
   therefore ignores even an unresolvable Host. Only when that call fails does the adapter strictly normalize the Host
   and retry `getAlias(lowercaseHostname)`, allowing portful host-mode requests while preserving host-mode 404s. It
   then calls `getConfigFromAlias`. Do not change `getAlias`, `getConfigFromHost`, or diagnostic behavior, and never
   pass a host or tenant file into the session module. Details are in [research.md](research.md) Decision 2.
3. **Expose one bounded request adapter from frontend services**. `session-request.ts` accepts the raw Host and optional
   session reference, runs tenant selection and `readForTenant` through the existing `Runtime`, and owns thin Next
   failure mapping. `index.ts` exports that adapter and the shared session-cookie name. The Next app does not import
   `Runtime`, `SessionService`, `TenantConfigService`, or Effect.
4. **Replace the bounded root placeholder and add one protected action**. `/` calls the public adapter and becomes the
   reference protected page. `runReferenceOperation` is the only runtime export of `(app)/actions.ts`; it rereads
   headers/cookies and calls the adapter on every invocation, accepting no identity or tenant authority from the form.
   A private app-edge helper emits the bounded receipt only after admission.
5. **Keep UI server-first and inside the feature boundary**. The page renders identity and the unchanged authoritative
   deadline/warning policy. `features/session-reference.ts` owns the action-state type/initial value and private client
   island. The page passes `runReferenceOperation` into that island as a prop, so the feature never imports `src/app`.
   Installed `@pathableai/react` supplies the page/layout/form/button primitives.
6. **Preserve runtime and infrastructure**. `ApplicationServices`, `applicationLayer`, the shared Redis Layer, OIDC
   services, and process lifecycle remain unchanged. The feature adds no backend, config, exporter, runtime, or
   persistent model. Before implementation, run `fallow guard` for every planned app/feature file and follow the
   reported Bulletproof direction together with the stricter recursive module rule.

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
convert service failures. This is the plan-level implementation of V-010. `TenantConfigService` remains unchanged and
is composed only by the exported request adapter. No new runtime service or environment requirement is introduced.

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
- Frontend-services request-adapter tests inject public service outcomes to establish tenant-first ordering,
  page/action mappings, server-failure distinction, and unchanged V-010 policy values. They establish raw-first static
  selection for an unresolvable Host and host-mode fallback normalization where `alias.localhost:3000` retries
  `getAlias` with `alias.localhost`. If raw host-mode selection fails and normalization is invalid or the retry fails,
  the existing host-mode 404 remains. Frontend tests cover page/action/feature wiring, presentation, and exact zero/one
  receipt calls without importing Effect. These tests do not claim actual HTTP 403 or browser accessibility.
- No durable test asserts logs, spans, attributes, exporter output, or raw cookie values. This feature adds no
  observability claim; temporary diagnostics must be removed.

Claim-by-claim evidence and limitations are tabulated in [contracts/modules.md](contracts/modules.md). Feature HTTP,
browser, infrastructure, and handoff evidence remain in Phase 5 rather than duplicating the module claim.

### Phase 4 — Implementation architecture

1. In `packages/frontend-services/src/session.ts`, add `SessionTenantMismatch` and `readForTenant`. Call the existing
   local `read`, return `NoUsableSession` unchanged, return the exact `UsableSession` object only on strict branded
   alias equality, and otherwise fail with the fieldless mismatch. Preserve defects/interruption. Remove `hasSession`
   from the service, `entry.ts`, `index.ts`, production composition fixtures, root tests, and callback service doubles.
2. Add `packages/frontend-services/src/session-request.ts`. Export the existing session-cookie name there so
   `auth/cookie.ts` and protected consumers share one owner. Its public request operation accepts raw Host plus the
   optional untrusted cookie string, calls `getAlias(rawHost)` first, and only after that failure applies the strict
   normalization rules and retries `getAlias(lowercaseHostname)`. Then call `getConfigFromAlias` and
   `readForTenant`. Preserve static Host independence, host-mode port support/404, typed service failure, and Next
   control-flow. Export the bounded adapter/cookie contract from `index.ts`; do not export Effect services to the app.
3. Update `docs/authentication.md` and `docs/session-state.md` sentences that still describe the old root `hasSession`
   flow. Keep `getAlias`, `getConfigFromHost`, `GET /_test/tenant-config`, and `/_test/onsite` behavior unchanged.
4. Replace root `page.tsx` with a dynamic, private/no-store server page. It reads async headers/cookies and calls only
   the frontend-services public adapter. `NoUsableSession` redirects to `/auth/login`; mismatch invokes `forbidden()`
   before streaming; service failure remains a safe server failure; a usable match renders bounded identity, tenant,
   exact authoritative deadline/warning policy, and the action control. Revise `app/forbidden.tsx` to generic mismatch
   copy without tenant/identity details.
5. Implement the feature split. `packages/frontend/src/features/session-reference/action-state.ts` has
   neither `"use server"` nor `server-only` and defines:

   ```ts
   export type ReferenceActionState =
     | { readonly _tag: "Ready" }
     | { readonly _tag: "Denied"; readonly message: string }
     | { readonly _tag: "Succeeded"; readonly message: string }

   export const initialReferenceActionState: ReferenceActionState = {
     _tag: "Ready"
   }
   ```

   `packages/frontend/src/features/session-reference.ts` re-exports the type, initial value, and client component. Only
   that public entry is imported outside the feature. `packages/frontend/src/app/(app)/actions.ts` has a file-level
   `"use server"` directive. Its only runtime export is:

   ```ts
   export async function runReferenceOperation(
     previousState: ReferenceActionState,
     formData: FormData
   ): Promise<ReferenceActionState>
   ```

   The client island receives `runReferenceOperation` from the page as a prop; it does not import from `src/app` and
   receives no tenant config, cookie, session reference, or identity props. The action rereads headers/cookies and
   calls the public frontend-services adapter on every submission. For a usable match, set exactly one short-lived
   host-only receipt cookie and return `Succeeded`; for absence return `Denied` without OIDC/effect; for mismatch call
   `forbidden()`; for service/tenant failure expose no protected result or receipt. The receipt value has no semantic
   contract and is never logged or retained.
6. Implement the minimal client island with installed `Form`, `Button`, and result presentation. Keep a meaningful
   accessible button name, native keyboard behavior, visible focus, disabled/pending state, and a polite status region.
   Do not move data loading or page composition into the client. Run workspace-scoped `fallow guard` before adding the
   feature/import layout and targeted checks as soon as boundary, unused, health, or duplication risks appear.
7. Extend `tests/support/oidc/harness.ts` with an explicit `sessionPrefix` in `SiteOptions`/`siteEnv`, parallel to the
   transaction prefix, so two processes and fixture setup demonstrably share one execution-owned session namespace.
   Add an isolated issue-level fixture that establishes a real stored application session through public
   `SessionService.establish`, returns its opaque reference only to the owned browser/HTTP setup, and cleans only its
   owned prefix. It cannot count as Cucumber, provider freshness, PREETS-SESSION-003, or V-002 evidence. When neither
   confirmed-fresh login nor this fixture is available, mark every session-dependent mismatch, stale-action, outage,
   keyboard/action, or policy-handoff check incomplete rather than fabricating state.
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
   works. Static-mode cases must continue selecting the configured alias regardless of Host. The issue-level fixture
   stays outside Cucumber. [quickstart.md](quickstart.md) section 4 is the execution checklist for these edits.
9. Record the delivered path/fixture inventory and downstream categories in the implementation handoff. Then run
   focused behavior checks, the manual procedure, and repository quality gates. No implementation step may broaden
   this reference boundary into #154's comprehensive integration.

Installed APIs verified for this architecture:

- Effect 4.0.5: existing `Context.Service`, `Schema.TaggedError`, `Effect.fn`, `Layer`, and `ManagedRuntime` declarations
  in `frontend-services`; the Next app imports none of them;
- Next.js 16.4.3: async `headers()`/`cookies()`, Server Actions, and `forbidden(): never` for Server Components/Server
  Functions under the already enabled `authInterrupts`. A file-level `"use server"` module exports only async
  functions, so `initialReferenceActionState` stays in the sibling module. Actual HTTP evidence remains required
  because `forbidden()` is experimental;
- React 19.3.1: `useActionState`, Server Action form types, and passing the action into the feature client as a prop;
- `@pathableai/react` 0.3.0: public `Form`, `Button`, page/layout, alert/text, and native attribute forwarding.

### Phase 5 — Feature verification integration

[verification.md](verification.md) remains the claim authority. [quickstart.md](quickstart.md) turns it into this
execution order:

1. public tenant-bound service examples/property;
2. real-Redis independent-client and disconnected-client evidence;
3. page/action adapter scenarios;
4. one production build and the issue-level running HTTP/action/two-process workflow;
5. current-main requirements BDD for bounded missing-session/public/tenant behavior;
6. agent-executed real browser keyboard/focus, A-to-B (only when B6 permits), fixture-backed cross-tenant/stale-action/
   controlled-outage checks, public diagnostics, and mode-aware tenant failures;
7. delivered-route/fixture/downstream inventory review;
8. cleanup and repository quality gates.

Module evidence does not duplicate framework status or browser claims. Existing tenant/session tests retain ownership of
decoding and 404/500 rules. Requirements BDD uses feature-level `@partial` and cannot fabricate sessions, open Redis,
or assert issue-only service-failure/handoff behavior. Actual 403, receipt presence/count, keyboard focus, and two
running processes are observed through the composed application. Real-login V-002 is recorded incomplete when the B6
freshness gate is unavailable. The isolated public-service fixture may support denial, policy-handoff, keyboard/action,
and outage evidence, but never freshness, Cucumber, PREETS-SESSION-003, or V-002; skipped execution, direct Redis setup,
redirects, or application-session creation alone do not satisfy those claims.

Evidence records name the exact revision, safe conditions, observed claim/result, cleanup, and limitations. They omit
credentials, provider/callback values, cookies, session references, Redis records/keys, identity-bearing raw output,
PHI, and identifying partner data. Temporary probes are removed and shared Redis is never flushed.
