---
description: "Task list for reference session enforcement implementation"
---

# Tasks: Enforce Sessions in Reference Application Paths

**Input**: [spec.md](spec.md), [verification.md](verification.md), [plan.md](plan.md),
[research.md](research.md), [data-model.md](data-model.md), [module contracts](contracts/modules.md),
[reference application contract](contracts/reference-application.md), and [quickstart.md](quickstart.md)

**Branch**: `158-reference-session-enforcement-impl` · **Delivery issue**: #219 · **Spec Kit feature**:
`specs/158-reference-session-enforcement`

**Status**: Planned implementation work. Every task remains unchecked until its stated behavior or evidence is complete
at an identified revision. Passing static checks, dry-run discovery, a skipped test, or opening a pull request does not
establish runtime enforcement.

**Tests**: Required by the approved verification plan. Write the named public-service, adapter, real-Redis, frontend
wiring, issue-level, and requirements-BDD evidence before the implementation it protects, observe a meaningful failing
result, then make it pass. Keep observability manual or transient. Do not add durable assertions over logs, spans,
attributes, telemetry payloads, or exporter output. This feature has no operational monitoring claim.

**Scope**: Add tenant-bound admission to the existing frontend session capability and demonstrate it through one
protected reference page (`/`) and one browser-invoked frontend Server Action. Do not add application-wide protection,
a new Effect service or Layer, backend or domain persistence, renewal, invalidation, recovery content, freshness
policy, or a telemetry contract. GitHub #154, #157, #158, #220, and #221 keep the excluded completion claims. GitHub
#158 is the freshness owner; it is not this Spec Kit number.

## Format and execution conventions

`- [ ] Tnnn [P?] [USn?] Action with exact paths`

- Paths are repository-relative. New paths named below are intentional. Do not add a parallel enforcement service,
  runtime, workspace, middleware guard, diagnostic endpoint, Redis value API, or browser runner.
- `[P]` means a different file and no dependency on an unfinished task in the same wave. It never authorizes concurrent
  edits to one file or use of one mutable Redis prefix, browser context, or frontend process.
- `spec.md`, `verification.md`, `plan.md`, `contracts/`, delivery plans, requirements, and GitHub issues are read-only.
  Do not edit them to fit the implementation. Record execution separately from those plans.
- Tests and the Next app use public parents only. Do not import `packages/frontend-services/src/session/codec.ts`,
  `packages/frontend-services/src/session/store.ts`, or `packages/frontend-services/src/tenant/` children. The Next app
  does not import `effect`, `Runtime`, `SessionService`, or `TenantConfigService`.
- Before Effect edits, read `docs/engineering/effect-guidance.md` and `packages/frontend-services/AGENTS.md`, then only
  the installed Effect 4.0.5 declarations needed for `Context.Service`, `Schema.TaggedError`, `Effect.fn`, `Layer`, and
  `ManagedRuntime`. Before UI edits, locate installed `@pathableai/react` and read
  `agent-guidance/pathable-react/SKILL.md` plus the linked Form, Button, and page guidance actually used.
- Before test edits, read `docs/engineering/testing/README.md`. Requirements BDD also reads
  `docs/engineering/testing/requirements-bdd.md`, uses current `origin/main` requirement text, and follows
  `requirements-bdd-author`, `requirements-bdd-scaffold`, and `requirements-bdd-review`.
- Use synthetic fixtures and owned prefixes only. Never retain provider tokens, credentials, callback parameters,
  cookie or reference values, Redis keys or records, identity-bearing raw output, PHI, or identifying partner or client
  names. Springfield and Shelbyville are the repository's existing synthetic tenants.
- Do not add check suppressions, Fallow ignore patterns, `allowUnmatched` entries, or weaker complexity thresholds.
  Do not commit generated output, temporary probes, or transcripts that contain sensitive values.

## Phase 1: Baseline and declaration inspection

**Purpose**: Confirm read-only authority and installed APIs before editing. No project scaffolding, logging, or
security-hardening work belongs here.

- [ ] T001 Compare the recorded `origin/main` baseline `f11843150903be95b62a759ea012f1a8bc966e2c` in `specs/158-reference-session-enforcement/spec.md` with the current requirement text for `docs/requirements/session/PREETS-SESSION-001.md`, `docs/requirements/session/PREETS-SESSION-003.md`, `docs/requirements/session/PREETS-SESSION-004.md`, `docs/requirements/session/PREETS-SESSION-005.md`, and `docs/requirements/session/PREETS-SESSION-006.md`, and with open delivery issue #219. Do not fetch or rebase in a way that moves `158-reference-session-enforcement-impl`. On material drift, stop for the owning specification or planning workflow. Do not edit `specs/158-reference-session-enforcement/spec.md`, `specs/158-reference-session-enforcement/verification.md`, `specs/158-reference-session-enforcement/plan.md`, or `specs/158-reference-session-enforcement/contracts/`.
- [ ] T002 Inspect `packages/frontend-services/src/session.ts`, `packages/frontend-services/src/entry.ts`, `packages/frontend-services/src/index.ts`, `packages/frontend-services/src/auth/cookie.ts`, the private `parseRequestHost` in `packages/frontend-services/src/authentication.ts`, `packages/frontend-services/src/tenant.ts`, `packages/frontend-services/src/runtime.ts`, `packages/frontend/src/app/(app)/page.tsx`, `packages/frontend/src/app/forbidden.tsx`, and `packages/frontend/next.config.ts`. Confirm installed Effect 4.0.5 `Context.Service`, `Schema.TaggedError`, `Effect.fn`, `Layer`, and `ManagedRuntime`; Next.js 16.4.3 async `headers()` and `cookies()`, experimental `forbidden()` with `authInterrupts` already enabled, and file-level `"use server"` modules exporting only async functions; and `@pathableai/react` `Form`, `Button`, `Page`, `Container`, `Stack`, `Heading`, `Text`, and `Alert`. Stop if an installed declaration contradicts `specs/158-reference-session-enforcement/contracts/modules.md` or `specs/158-reference-session-enforcement/contracts/reference-application.md`. Do not invent a substitute API.
- [ ] T003 Run `pnpm --filter @pathableai/pre-ets-frontend exec fallow list --boundaries` and `pnpm --filter @pathableai/pre-ets-frontend exec fallow guard` for `src/app/(app)/page.tsx`, `src/app/(app)/actions.ts`, `src/app/forbidden.tsx`, `src/features/session-reference.ts`, `src/features/session-reference/action-state.ts`, and `src/features/session-reference/reference-operation.tsx` before creating those modules. Follow the reported Bulletproof direction and the stricter recursive rule: only `packages/frontend/src/features/session-reference.ts` imports its children, and the feature never imports `src/app`. `packages/frontend-services` has no Fallow zones; keep ownership in `packages/frontend-services/AGENTS.md`. Do not add `allowUnmatched` or a weaker threshold.

**Checkpoint**: Authority and installed API truth are known. An incompatible declaration is a planning blocker, not an
implementation invention.

## Phase 2: Foundational public session and request contracts

**Purpose**: Establish the shared tenant-bound read and request adapter that every story consumes. Depends on T001–T003.
No user story is complete until this phase passes.

### Evidence first

- [ ] T004 [P] Add failing public-service scenarios to `packages/frontend-services/tests/lib/session.test.ts` through `SessionService.layer` and the existing isolated in-memory Redis helper in `packages/frontend-services/tests/helpers/session.ts`. Cover `readForTenant` only. A matching branded `TenantAlias` returns the exact `UsableSession` object from `read`, including `identity`, `tenantAlias`, `idleDeadlineEpochMilliseconds`, and `warningLeadMinutes`, compared with that `read` result rather than recomputed from policy and clock (V-010). A different branded alias yields only fieldless `SessionTenantMismatch`, and its public diagnostic contains no issuer, subject, or tenant (V-003). Absent and malformed references stay fieldless `NoUsableSession`, distinct from mismatch and `SessionServiceUnavailable` (V-005, V-006). Add one `@fast-check/vitest` property that varies valid request aliases and admits only on branded equality. Remove the `hasSession()` scenario in this file. Do not import `packages/frontend-services/src/session/codec.ts` or `packages/frontend-services/src/session/store.ts`, and do not assert logs or spans.
- [ ] T005 [P] Create failing adapter scenarios in `packages/frontend-services/tests/unit/reference-session-enforcement.test.ts` for `readSessionRequest` from `packages/frontend-services/src/session-request.ts`. Inject public `TenantConfigService` and `SessionService` outcomes. Assert raw `getAlias(host)` happens before any normalization; a direct success does not parse the host; an unresolvable host in static mode still selects the configured alias; `alias.localhost:3000` retries `getAlias("alias.localhost")` only after direct failure; an unparseable host or failed retry preserves the original direct-selection failure through existing `httpErrorPage` in `packages/frontend-services/src/error.ts` and does not redirect to `/auth/login`. Assert `getConfigFromAlias` runs before `readForTenant`. A match returns that same `UsableSession` instance. Mismatch rejects through the existing `next/navigation` forbidden stub without a resolved session or identity payload. `NoUsableSession` passes through with no protected fields. `SessionServiceUnavailable` stays distinct from absence, mismatch, and success. Do not catch redirect, forbidden, or not-found control flow. These scenarios do not prove actual HTTP status.
- [ ] T006 [P] Extend `packages/frontend-services/tests/integration/session-redis.test.ts` so one client establishes a session and independently scoped clients call `readForTenant` for the matching alias and a different branded alias. Matching admission preserves the public identity, tenant, deadline, and warning policy. Mismatch is `SessionTenantMismatch`. A disconnected client yields `SessionServiceUnavailable`, not `NoUsableSession` or admission. Clean only the validated owned prefix. Do not treat this file as two running application processes.

### Shared implementation

- [ ] T007 Implement the exact `SessionService` contract in `packages/frontend-services/src/session.ts` so T004 passes. Add fieldless `SessionTenantMismatch` with tag `@pathableai/pre-ets-frontend/SessionTenantMismatch` and this operation, removing `hasSession`: `readForTenant(input: ReadSessionForTenantInput) => Effect.Effect<NoUsableSession | UsableSession, SessionServiceUnavailable | SessionTenantMismatch>`, where `ReadSessionForTenantInput` is `{ readonly reference?: string; readonly tenantAlias: TenantAlias }`. Delegate classification to the existing `read`. Return `NoUsableSession` unchanged. On strict branded alias equality, return the exact `UsableSession` object from `read`. Otherwise fail with fieldless `SessionTenantMismatch` and never substitute the stored tenant. Preserve defects and interruption. Use `Effect.fn("SessionService.readForTenant")` without annotating identity, tenant, reference, or cookie, and without a new telemetry contract. Keep `establish`, `read`, `SessionService.layer`'s `Layer.Layer<SessionService, Config.ConfigError, Redis>` requirement, the stored wire format, and the private codec and store. Remove `hasSession` from `packages/frontend-services/src/entry.ts` (delete that file if it has no remaining export), `packages/frontend-services/src/index.ts`, `packages/frontend-services/tests/lib/runtime-composition.test.ts`, `packages/frontend-services/tests/unit/authentication-entry.test.ts`, `packages/frontend-services/tests/unit/authentication-entry-failures.test.ts`, and `packages/frontend/tests/unit/authentication-entry.test.ts`. Update service doubles so they typecheck and cannot admit a session. In `packages/frontend/src/app/(app)/page.tsx`, replace the `hasSession` import with an unconditional `redirect("/auth/login")` and no protected content until T014. Do not export Redis or a new service.
- [ ] T008 Implement `packages/frontend-services/src/session-request.ts` so T005 passes, after T007. Export `SESSION_COOKIE` with value `pathable-session` from this module, consume it in `packages/frontend-services/src/auth/cookie.ts` instead of a second literal, and export `readSessionRequest`, `ReadSessionRequestInput`, `ResolvedSessionRequest`, `SESSION_COOKIE`, and the types named by that signature (`NoUsableSession`, `UsableSession`, `SessionIdentity`, and `TenantAlias`) from `packages/frontend-services/src/index.ts`. The signatures are `ReadSessionRequestInput = { readonly host: string; readonly reference?: string }`, `ResolvedSessionRequest = { readonly session: NoUsableSession | UsableSession; readonly tenantAlias: TenantAlias }`, and `readSessionRequest(input: ReadSessionRequestInput): Promise<ResolvedSessionRequest>`. Call `TenantConfigService.getAlias` with the raw host first. Only after that failure, apply the private `parseRequestHost` acceptance rules without exporting them: reject an empty value, surrounding whitespace, `/`, `?`, `#`, `@`, or `\`, an invalid `opaque://` URL, an empty hostname, or a non-empty path, query, or fragment; retry `getAlias` with only the lowercase hostname. Then call `getConfigFromAlias` and `readForTenant`. Map tenant failure through existing `httpErrorPage`, mismatch through `forbidden()` before content, and service failure as a safe server rejection that is not login, not 403, and not success, with no raw cause, identity, tenant, cookie, or stored value. Do not catch Next control flow. Do not export `SessionService`, `TenantConfigService`, `Runtime`, or Effect. Do not change `getAlias`, `getConfigFromHost`, or `GET /_test/tenant-config`. Run `pnpm --filter @pathableai/pre-ets-frontend-services exec fallow dead-code --file src/session-request.ts` and fix any introduced finding without a suppression.
- [ ] T009 Run `pnpm --filter @pathableai/pre-ets-frontend-services test -- tests/lib/session.test.ts tests/unit/reference-session-enforcement.test.ts` and, with Redis ready, `pnpm --filter @pathableai/pre-ets-frontend-services test:integration -- tests/integration/session-redis.test.ts`. Record the revision, commands, owned-prefix cleanup, and the limit that this is not two application instances or actual HTTP 403, separately from `specs/158-reference-session-enforcement/verification.md`. Do not retain references, keys, or payloads.

**Checkpoint**: Matching admission, mismatch, absence, and service failure are distinct at the public service and
adapter. The reference page still redirects every request to login.

## Phase 3: User Story 1 — Continue authenticated access across instances (Priority: P1) 🎯 MVP

**Goal**: A usable session whose tenant equals the independently resolved request tenant is consumed on another
running reference instance, and the reference page and browser-invoked Server Action show that same user and tenant
together with the unchanged idle deadline and warning policy.

**Independent Test**: Authenticate through reference instance A, then open the reference protected path and invoke its
rendered Server Action on independently running instance B. Observe the same user and tenant and the protected result
without returning to A. Until an approved B6 freshness policy is functioning, record this authenticated journey
incomplete; do not treat signed `auth_time`, a redirect, or `SessionService.establish` as confirmation.

### Tests first

- [ ] T010 [P] [US1] Create failing wiring scenarios in `packages/frontend/tests/unit/reference-session-enforcement.test.ts`. For a matching `UsableSession`, the server page renders bounded identity, tenant, the exact `idleDeadlineEpochMilliseconds`, and the exact `warningLeadMinutes`, and passes `runReferenceOperation` into the feature client. The client receives no tenant config, cookie, session reference, or identity props. A matching action returns `{ readonly _tag: "Succeeded"; readonly message: string }` and emits exactly one receipt. Import neither `effect` nor `packages/frontend-services` internals. Do not claim actual HTTP status, keyboard focus, or two processes.
- [ ] T011 [P] [US1] Create `tests/bdd/session/reference-session-enforcement.test.ts` and run it with `node --test tests/bdd/session/reference-session-enforcement.test.ts` after `pnpm --filter @pathableai/pre-ets-frontend build`. Drive the rendered form through the `playwright` library and `tests/support/oidc/harness.ts`. When GitHub #158 freshness confirmation is approved and functioning, establish a real local-provider session on instance A and consume it on instance B for the same synthetic tenant, asserting the same safe user and tenant, the unchanged deadline and warning values, and exactly one receipt, with no request back to A (V-002). Otherwise skip that success case and record it incomplete. Do not satisfy V-002, PREETS-SESSION-003, or freshness with `SessionService.establish`. Do not print cookie values or add the file under `tests/bdd/checks/`.

### Reference consumer

- [ ] T012 [P] [US1] Add required `sessionPrefix` to `SiteOptions` and `siteEnv` in `tests/support/oidc/harness.ts`, setting `SESSION_KEY_PREFIX` the same way `transactionPrefix` sets `OIDC_TX_KEY_PREFIX`. Two processes in one execution must receive the same explicit prefix. Do not read or write Redis from the harness.
- [ ] T013 [P] [US1] Add the feature modules after reading the installed `@pathableai/react` guidance. `packages/frontend/src/features/session-reference/action-state.ts` has neither `"use server"` nor `server-only` and exports exactly `export type ReferenceActionState = { readonly _tag: "Ready" } | { readonly _tag: "Denied"; readonly message: string } | { readonly _tag: "Succeeded"; readonly message: string }` and `export const initialReferenceActionState: ReferenceActionState = { _tag: "Ready" }`. `packages/frontend/src/features/session-reference.ts` re-exports that type, the initial value, and the client component. `packages/frontend/src/features/session-reference/reference-operation.tsx` owns `useActionState`, an `@pathableai/react` `Form`, and a `Button type="submit"` with a meaningful visible accessible name, native keyboard operation, visible focus, pending disabled state, and a polite status region for success or denial. It imports state from its feature sibling and receives the action as a prop. It imports nothing from `src/app` and accepts no tenant, cookie, reference, or identity props. Copy may vary; denial copy must not contain protected identity, tenant, session, or result data. Run `pnpm --filter @pathableai/pre-ets-frontend exec fallow architecture --file src/features/session-reference.ts` and fix an introduced boundary or cycle without a suppression.
- [ ] T014 [US1] Replace the placeholder in `packages/frontend/src/app/(app)/page.tsx` and add `packages/frontend/src/app/(app)/actions.ts` so T010 passes. Keep the page a dynamic, private, no-store Server Component. Read `headers().get("host")` and the `SESSION_COOKIE` value, then call `readSessionRequest` from `@pathableai/pre-ets-frontend-services`. Render a match with the exact identity, tenant, `idleDeadlineEpochMilliseconds`, and `warningLeadMinutes` from that `UsableSession`, plus the feature island. Pass `runReferenceOperation` as the action prop. `packages/frontend/src/app/(app)/actions.ts` has a file-level `"use server"` directive and its only runtime export is `export async function runReferenceOperation(previousState: ReferenceActionState, formData: FormData): Promise<ReferenceActionState>`. Import `ReferenceActionState` as a type from `packages/frontend/src/features/session-reference.ts`. On every call, reread the host and cookie and call `readSessionRequest`; `previousState` and `formData` confer no authority. For a match, set exactly one host-only receipt cookie (`HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`, `Secure` except explicit loopback, short-lived, no identity, tenant, reference, provider value, or business data) and return `Succeeded`. Apply the reference outcome table in the same functions: page `NoUsableSession` is `redirect("/auth/login")` with no protected content and no receipt; action `NoUsableSession` returns `Denied` and does not start OIDC or set a receipt; mismatch calls `forbidden()` before content or a receipt; service failure is a safe server failure with no protected result and no receipt. Do not log or retain the receipt name or value. Run `pnpm --filter @pathableai/pre-ets-frontend exec fallow architecture --file src/app/(app)/page.tsx` and `--file src/app/(app)/actions.ts`.
- [ ] T015 [US1] Run the frontend unit scenario and `node --test tests/bdd/session/reference-session-enforcement.test.ts` from `specs/158-reference-session-enforcement/quickstart.md` sections 1 and 3. Record the revision, safe synthetic labels, deadline and warning comparison, receipt count, cleanup, and whether V-002 ran or remains incomplete because B6 is unresolved. A fixture-backed session is not V-002 evidence. Do not retain cookie values or claim #154 coverage.

**Checkpoint**: The reference page can present one matching tenant-bound session and one protected action result.
Confirmed-fresh cross-instance authentication remains incomplete while B6 is open. Denial mappings are not yet the
acceptance evidence.

## Phase 4: User Story 2 — Deny unusable, mismatched, or unreadable sessions (Priority: P1)

**Goal**: The reference page and Server Action fail closed for absence, malformation, a missing record, a forged
context, a tenant mismatch, and session-store failure. Mismatch is actual HTTP 403. Store failure is not treated as
absence and does not start replacement login or create a session.

**Independent Test**: Exercise the reference page and protected operation with absent, malformed, missing-record,
tenant-mismatched, forged-context, and store-failure conditions. Confirm that none exposes protected content or
performs the protected effect, while each authoritative HTTP behavior remains distinguishable.

### Tests first

- [ ] T016 [P] [US2] Extend `packages/frontend/tests/unit/reference-session-enforcement.test.ts` so absence on the page redirects to same-origin `/auth/login` with no protected identity, content, action result, or receipt; action `NoUsableSession` returns `Denied`, does not start OIDC, and sets no receipt; mismatch invokes `forbidden()` before a receipt or protected result; service or tenant failure exposes no protected result and sets no receipt. Assert receipt count zero, not the receipt value. Do not import Effect.
- [ ] T017 [P] [US2] Extend `tests/bdd/session/reference-session-enforcement.test.ts` so the running app shows: a no-session reference page resolves the tenant and returns 307 to same-origin `/auth/login` before protected content; a forged or malformed reference yields no protected content or action result; a direct HTTP request to instance B with tenant B's `Host` (a portful `shelbyville.localhost:<port>` is valid) and tenant A's `pathable-session` cookie returns actual 403, bounded forbidden content, the request tenant, and no receipt. Do not use cross-host browser navigation for that cookie. A fixture from public `SessionService.establish` may back the stale-action and outage cases only: after the owned record is removed, the rendered action shows denial, no automatic OIDC, no protected result, and no receipt; with Redis stopped only in an isolated local Compose owned by the run, a valid reference produces a server failure distinct from login, 403, and success, and zero receipts, then Redis is restored and answers `PONG` before later cases. A cookie-free request is not outage evidence. The fixture is never Cucumber, freshness, PREETS-SESSION-003, or V-002 evidence. Submit the rendered form; do not invent a stable POST URL.

### Denial behavior and execution

- [ ] T018 [US2] Run T016 and T017 before editing denial behavior. Make any failing assertion pass in `packages/frontend/src/app/(app)/page.tsx`, `packages/frontend/src/app/(app)/actions.ts`, `packages/frontend-services/src/session-request.ts`, and `packages/frontend/src/app/forbidden.tsx`. If T014 already satisfied an assertion, keep it and do not weaken it. Preserve the reference contract: page absence is 307 to `/auth/login` after tenant success and sets no application, correlation, or effect cookie; page and action mismatch call `forbidden()` before streaming or mutation; action absence returns `Denied` and does not start OIDC; service failure stays a safe server failure; host-mode tenant 404 and selected-configuration 404 or 500 are not rewritten into login, 403, or success. Revise `packages/frontend/src/app/forbidden.tsx` from login-configuration copy to a bounded generic forbidden indication with no props and no tenant or identity values, using installed `@pathableai/react` page primitives and a meaningful heading. Do not catch Next control flow. Do not add a domain record or Redis counter.
- [ ] T019 [US2] Run the frontend unit scenario and `node --test tests/bdd/session/reference-session-enforcement.test.ts`. Record statuses, redirect destination, forbidden indication, receipt counts, outage restoration, owned-prefix cleanup, and skipped cases separately from `specs/158-reference-session-enforcement/verification.md`. Do not retain cookie values, and do not describe this as #221 outage recovery or #154 coverage.

**Checkpoint**: Exercised denial paths expose no protected content or effect, and mismatch is actual HTTP 403 at the
reference boundary.

## Phase 5: User Story 3 — Preserve public exceptions and tenant failures (Priority: P2)

**Goal**: Callback, sign-in failure, recovery, and exercised `/_test` resources stay reachable without a session.
Diagnostic requests create no application session. Host-mode invalid or unknown hosts stay 404, static mode ignores
Host, and selected-configuration failures keep their approved 404 or 500 mapping.

**Independent Test**: Without a usable session, exercise the existing callback, sign-in failure, recovery, and
diagnostic categories at the bounded reference boundary. Confirm they remain reachable, that the diagnostic request
creates no application session, and that tenant-dependent requests preserve the approved 404 and 500 mappings.

### Scenarios and matrix

- [ ] T020 [P] [US3] Using `requirements-bdd-author` and `requirements-bdd-scaffold`, revise only `Scenario Outline: Root delegates before tenant-dependent work without protected content` in `tests/bdd/requirements/tenant-oidc-initiation.feature`. A valid Springfield tenant, including a fabricated cookie on `springfield.example.test`, still redirects to same-origin `/auth/login` with no protected content, is not cacheable, and issues no application or correlation cookie. Invalid JSON for the selected Springfield file returns 404 with no login redirect and no fallback tenant. The bare base host `example.test` returns 404 with no login redirect and no fallback tenant. Keep `Scenario: First-time browser entry delegates automatically to the selected real provider` and `Scenario Outline: Unavailable preparation leaves access denied with public failure content` as login delegation for the document request at `springfield.localhost:3000`. Keep feature-level `@partial` and current-main tags. Do not open Redis, add a pending authenticated scenario, or edit `tests/bdd/requirements/tenant-context.feature` or `tests/bdd/requirements/onsite-prototype.feature`.
- [ ] T021 [P] [US3] In `tests/bdd/requirements/tenant-failures.feature`, replace the sentence "Root is a separate session-missing redirect; complete session lookup, authenticated access and other tenant-dependent consumers remain incomplete." with text that `/` resolves the tenant before session admission and that a document request that is itself a tenant failure returns that failure's 404 or 500. Change only that document request, to the status its `/auth/login` row already expects, with no login redirect and no fallback tenant: `capital-city.example.test` becomes 404; `Scenario: A static alias with no tenant file is a server failure` at `springfield.example.test` becomes 500; `example.test`, `unknown.example.test`, and `127.0.0.1` become 404; directory failures become 500; unusable selected files become 404; missing selected files become 404 in host mode and 500 in static mode. Leave valid Springfield document requests that delegate to login, the absent-path 404 for `/this-page-is-absent`, every `/auth/login` assertion, and every `/_test/tenant-config` assertion unchanged.
- [ ] T022 [P] [US3] Extend `tests/bdd/session/reference-session-enforcement.test.ts` for the running reference boundary: static mode with an unresolvable Host still selects the configured alias and then applies session admission; host-mode invalid or unknown hosts return 404 with no login redirect and no fallback tenant; missing, unreadable, or malformed selected configuration keeps its approved mode-specific 404 or 500 and is not converted into a session outcome. Do not duplicate the Cucumber scenarios and do not change `packages/frontend-services/src/tenant.ts`.
- [ ] T023 [P] [US3] Add a wiring assertion to `packages/frontend/tests/unit/reference-session-enforcement.test.ts` that `packages/frontend/src/app/auth/callback/route.ts`, `packages/frontend/src/app/auth/login/route.ts`, `packages/frontend/src/app/login-unavailable/page.tsx`, `packages/frontend/src/app/%5Ftest/`, and `packages/frontend-services/src/tenant-request.ts` do not call `readSessionRequest`. Keep `GET /_test/tenant-config` on raw `getConfigFromHost`. Reuse `tests/bdd/requirements/authentication-public-resources.feature` for callback, `/login-unavailable`, and unauthenticated `GET /_test/tenant-config` creating no application or correlation cookie. Do not create `tests/bdd/requirements/session-reference-enforcement.feature`; the executable session and tenant scenarios stay in the revised feature files, and matching, mismatch, service-failure, and cross-instance claims stay outside Cucumber while they require a stored session or unresolved B6 freshness.

### BDD execution

- [ ] T024 [US3] Run `requirements-bdd-review` on `tests/bdd/requirements/tenant-oidc-initiation.feature`, `tests/bdd/requirements/tenant-failures.feature`, `tests/bdd/requirements/authentication-public-resources.feature`, and their steps under `tests/bdd/steps/`. Then run `pnpm test:bdd:dry`, `pnpm lint:gherkin`, `pnpm format:gherkin:check`, `pnpm test:bdd`, and `pnpm test:bdd:checks` from the repository root. Record actual `pnpm test:bdd` separately from dry-run discovery. Do not open Redis, fabricate a session, or assert issue-only service-failure or handoff vocabulary in Cucumber. If a scenario fails because T008 or T018 drifted from the approved 404, 500, or login mapping, fix that mapping in `packages/frontend-services/src/session-request.ts` or `packages/frontend/src/app/(app)/page.tsx`; do not weaken the scenario.

**Checkpoint**: Public exceptions remain public, and tenant failure mappings are unchanged by session enforcement.

## Phase 6: User Story 4 — Hand off the bounded enforcement contract (Priority: P3)

**Goal**: A reviewer can see the reusable outcomes, exercised paths, denial behavior, retained fixtures, and every
known unexercised entry-point category without mistaking this increment for application-wide protection.

**Independent Test**: Review the handoff against the delivered reference behavior. Every exercised page and operation,
successful and denied outcome, reusable fixture, and remaining page, handler, and action category is explicitly
accounted for.

- [ ] T025 [US4] Update `docs/authentication.md` and `docs/session-state.md` from the implemented behavior. Remove these superseded sentences: "The root uses `SessionService.hasSession()` before request-tenant lookup."; "Root's separate first hop remains 307 even when tenant lookup will fail."; "`hasSession()` remains `false` for the current no-input root consumer; it does not read cookies, Redis, or request-tenant identity, and does not turn presence into authorization."; and "The root consumer uses absence to redirect to `/auth/login` before tenant lookup." State that `/` resolves the tenant under the configured mode and then reads the session, that a resolved tenant with no usable session redirects to `/auth/login`, that a host-mode invalid host or other tenant failure on `/` remains that tenant 404 or 500, that static mode stays independent of Host, and that `hasSession()` is removed. In `docs/session-state.md`, add the V-009 inventory: delivered consumers are `GET /` and `runReferenceOperation`; outcomes are matching 200 with unchanged deadline and warning policy, absence 307 to `/auth/login`, mismatch 403, and distinct fail-closed service failure; public exceptions remain `/auth/callback`, `/login-unavailable`, `/auth/login`, and `/_test/*` including `GET /_test/tenant-config`; reusable fixtures are the OIDC harness, distributed Redis tests, two-process routing, and receipt-count observation; unexercised categories remain other pages, Route Handlers, Server Actions, direct and new resources, final forbidden and recovery UI, action HTTP 401, history and freshness, and renewal, invalidation, and outage recovery. Use no identifying partner or client names. Do not edit requirements, delivery plans, issues, `spec.md`, `plan.md`, `verification.md`, or `contracts/`.
- [ ] T026 [US4] Compare the implementation diff with `specs/158-reference-session-enforcement/contracts/reference-application.md` and the inventory in `docs/session-state.md`, using the category table in `specs/158-reference-session-enforcement/quickstart.md` section 6. Record a disposition for delivered protected consumers, delivered public consumers, reusable fixtures, unexercised pages, Route Handlers, Server Actions, direct and new-resource paths, and deferred behavior. The inventory is not evidence that listed paths work.

**Checkpoint**: The bounded increment and its exclusions are visible without changing the approved contracts.

## Phase 7: Polish and cross-cutting verification

**Purpose**: Perform the agent-executable manual procedure, clean temporary resources, run repository gates, and
reconcile the evidence record. Depends on the user stories being implemented.

- [ ] T027 Execute the manual procedure in `specs/158-reference-session-enforcement/verification.md` and `specs/158-reference-session-enforcement/quickstart.md` section 5 with a temporary uncommitted probe that uses `freePort`, `spawnFrontend`, `applicationBrowser`, `waitUntilReady`, and `stopProcess` from `tests/support/oidc/harness.ts`. Start instances A and B from one production build with the same tenant fixtures, Redis URL, `sessionPrefix`, and transaction prefix, and different loopback ports. When B6 permits, complete real local-provider login on A and consume it on B, recording the same user and tenant, unchanged deadline and warning policy, keyboard-only focus on the protected operation, one receipt, and no return to A (V-001, V-002, V-008, V-010). Otherwise mark V-002 incomplete and use a labeled `SessionService.establish` fixture only for the non-authentication observations. Record direct-HTTP 403 for cross-tenant use, no-session OIDC initiation without a second login, unauthenticated `GET /_test/tenant-config` with no session cookie, host-mode 404, static Host independence, and approved configuration 404 or 500 results. For an owned local Redis only, stop Redis, observe distinct server failure and zero receipts, then restore readiness. Do not commit the probe, screenshots, or raw network dumps, and do not retain cookie values, tokens, references, PHI, or partner or client names.
- [ ] T028 Complete cleanup from `specs/158-reference-session-enforcement/quickstart.md`: delete the temporary probe and raw output, close browser contexts, stop both frontend process groups with `stopProcess`, delete only keys under the validated owned session and transaction prefixes, and stop Redis or Keycloak only if this procedure started them and nothing else is using them. Never run `FLUSHALL`. Confirm `git status` contains no generated reports, credentials, or temporary instrumentation.
- [ ] T029 Run `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm check:unused`, `pnpm check:health`, and `pnpm check:changes` from the repository root `package.json`. Fix an introduced finding in the files this feature changed, without a suppression or a weaker threshold, then rerun the failed gate. These commands establish repository quality only, not V-001–V-010.
- [ ] T030 Reconcile the implementation evidence record using `specs/158-reference-session-enforcement/quickstart.md`: exact revision, environment and service versions, safe synthetic labels, each claim V-001 through V-010 with pass, fail, or incomplete, commands, keyboard and focus observation, outage restoration when run, cleanup, and limitations. Include the T026 inventory disposition. Preserve the approved limits below. Do not treat static checks, dry-run discovery, skipped tests, or pull-request creation as runtime verification, and do not close issue #219 from this task list.

## Dependencies and execution order

```text
T001 → T002 → T003
          ↓
tests T004 || T005 || T006
          ↓
T007 → T008 → T009
          ↓
US1 tests T010 || T011
          ↓
T012 || T013 → T014 → T015
          ↓
US2 tests T016 || T017 → T018 → T019
          ↓
US3 scenarios T020 || T021 || T022 || T023 → T024
          ↓
T025 → T027 → T028 → T026 → T029 → T030
```

- T004–T006 are failing evidence for the shared contract and do not share files. T007 implements `readForTenant` and
  removes `hasSession`. T008 depends on that operation and implements the one request adapter. T009 records execution.
- US1 tests wait for the foundational signatures. T012 and T013 touch different files and start only after T010 and
  T011 exist and fail. T014 joins them. T015 records US1 execution, including an explicit incomplete V-002 when B6 is
  unresolved.
- US2 extends the same page, action, adapter, and issue-level test after US1. T016 and T017 are parallel; T018 is not.
- US3 scenario files are parallel with each other and follow US2 because the issue-level file and reference page
  already exist. T024 runs only after those scenario edits.
- T025 writes the durable handoff. T026 reviews it after the manual procedure and cleanup so the disposition matches
  what was actually exercised. T029 is last among code gates. T030 reconciles the record.

### User story dependencies

- User Story 1 depends on the foundational service and adapter. It does not depend on US2–US4 for the matching render
  and action, but it is not a safe release without US2.
- User Story 2 depends on US1's page, action, and feature island. It is independently testable with absent, forged,
  mismatched, and failing sessions.
- User Story 3 depends on the adapter's tenant-first mapping and on US2's no-session page behavior. Public routes
  themselves stay outside the new consumer.
- User Story 4 depends on the delivered paths from US1–US3. It records the handoff; it does not add behavior.

### Parallel opportunities

| Wave       | Parallel tasks                                                                                             | Join            |
| ---------- | ---------------------------------------------------------------------------------------------------------- | --------------- |
| Foundation | T004 service scenarios; T005 adapter scenarios; T006 real-Redis scenarios                                  | T007, then T008 |
| US1 tests  | T010 frontend wiring; T011 issue-level cross-instance workflow                                             | T012 and T013   |
| US1 build  | T012 harness `sessionPrefix`; T013 feature state and client island                                         | T014            |
| US2 tests  | T016 frontend denial wiring; T017 running HTTP, action, and outage workflow                                | T018            |
| US3 files  | T020 initiation feature; T021 tenant-failure feature; T022 issue-level matrix; T023 public-route assertion | T024            |

Do not run user stories in parallel. They share `packages/frontend-services/src/session-request.ts`,
`packages/frontend/src/app/(app)/page.tsx`, `packages/frontend/src/app/(app)/actions.ts`, and
`tests/bdd/session/reference-session-enforcement.test.ts`.

## Parallel example: User Story 1

```text
Wave 1, after T009:
Task: "T010 [US1] Frontend wiring scenarios in packages/frontend/tests/unit/reference-session-enforcement.test.ts"
Task: "T011 [US1] Issue-level workflow in tests/bdd/session/reference-session-enforcement.test.ts"

Wave 2, after those tests fail for the missing consumer:
Task: "T012 [US1] sessionPrefix in tests/support/oidc/harness.ts"
Task: "T013 [US1] Feature modules under packages/frontend/src/features/session-reference.ts"
```

## Implementation strategy

### MVP first

1. Complete baseline and foundational tasks T001–T009.
2. Complete User Story 1 tasks T010–T015 and stop to inspect the matching reference page and action.
3. Treat confirmed-fresh instance A to instance B as incomplete unless B6 is approved and functioning.
4. Complete User Story 2 before any claim that enforcement fails closed. US1 and US2 are both P1.
5. User Story 3, the handoff, the manual procedure, cleanup, and repository gates remain required for feature completion.

### Incremental delivery

1. Foundation makes tenant-bound admission reusable without a reference UI.
2. US1 shows one matching protected page and action, with V-002 conditional.
3. US2 proves distinguishable denial, actual 403, and zero protected effects.
4. US3 keeps public exceptions and approved tenant failures.
5. US4 plus the manual procedure and evidence record hand the bounded result to later integration.

## Contract and verification completion map

| Contract or claim                                                                                                       | Tasks                                                | Evidence boundary and approved limitation                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SessionService.readForTenant`, `ReadSessionForTenantInput`, fieldless `SessionTenantMismatch`, removal of `hasSession` | T004, T006, T007, T009                               | Public service and real Redis. `establish`, `read`, wire format, and callback behavior stay source-compatible.                                                      |
| Exact `UsableSession` deadline and warning handoff                                                                      | T004, T005, T007, T008, T010, T014, T015, T027, T030 | Equality is against the object returned by `read`, not a recomputed policy.                                                                                         |
| `readSessionRequest`, `ReadSessionRequestInput`, `ResolvedSessionRequest`, shared `SESSION_COOKIE`                      | T005, T008, T009                                     | Raw host first, then failed-host normalization, then `getConfigFromAlias`, then `readForTenant`. The app does not import Effect.                                    |
| Unchanged `TenantConfigService.getAlias`, `getConfigFromAlias`, `getConfigFromHost`                                     | T002, T005, T008, T020, T021, T022, T024             | No new tenant method, error, Layer, or schema. Diagnostic route keeps the raw Host.                                                                                 |
| Reference page and `runReferenceOperation` outcome table                                                                | T010, T014, T016, T017, T018, T019                   | Running HTTP and the rendered form. Direct action import is not the application claim. `forbidden()` remains experimental, so actual 403 is required.               |
| `ReferenceActionState` and feature entry                                                                                | T010, T013, T014                                     | Public entry only. The `"use server"` module exports only the async action.                                                                                         |
| Synthetic receipt                                                                                                       | T010, T014, T016, T017, T018                         | Presence and count only. Name and value are not a contract and are not retained.                                                                                    |
| V-001 independent tenant admission                                                                                      | T004, T005, T007, T008, T010, T014, T015, T027, T030 | Request tenant stays authoritative. Module evidence does not prove HTTP rendering.                                                                                  |
| V-002 instance A consumed on instance B                                                                                 | T011, T012, T015, T027, T030                         | Incomplete until approved B6 freshness confirmation works. A fixture or signed `auth_time` does not substitute. Finite two-instance evidence is not every topology. |
| V-003 mismatch HTTP 403 and no effect                                                                                   | T004, T005, T007, T016, T017, T018, T019, T027, T030 | Service evidence proves the fieldless error. Only the running boundary proves HTTP 403. The forbidden page is not #154's final experience.                          |
| V-004 no-session page starts tenant OIDC                                                                                | T014, T016, T017, T018, T019, T020, T024, T027       | No protected content first. Final refresh, history, and post-expiration journeys remain #157 and #158.                                                              |
| V-005 denied Server Action has no effect                                                                                | T004, T005, T010, T014, T016, T017, T018, T019, T027 | The rendered browser consumer invokes the action. Existing `read` tests own cause classification.                                                                   |
| V-006 store failure distinct and fail closed                                                                            | T004, T006, T007, T008, T009, T017, T018, T019, T027 | Controlled outage plus restoration. This does not establish #221.                                                                                                   |
| V-007 public exceptions and tenant failures                                                                             | T005, T008, T020, T021, T022, T023, T024, T027       | Reuses `tests/bdd/requirements/authentication-public-resources.feature`. Production `/_test/*` ingress blocking stays separate infrastructure evidence.             |
| V-008 keyboard operation and visible focus                                                                              | T013, T014, T027, T030                               | Composed manual browser procedure. Component choice and markup do not satisfy it. Final recovery accessibility remains downstream.                                  |
| V-009 handoff inventory                                                                                                 | T025, T026, T030                                     | An inventory is not behavioral proof of unexercised paths. #154 owns comprehensive integration.                                                                     |
| V-010 unchanged deadline and warning policy                                                                             | T004, T005, T007, T008, T010, T014, T015, T027, T030 | Admission returns the session object unchanged. This feature does not present warnings or renew the session.                                                        |

## Intentionally reused evidence and approved limitations

- Existing `packages/frontend-services/tests/lib/session.test.ts` scenarios keep ownership of reference decoding,
  expiry, corrupt records, collisions, and store-failure classification. New tests assert `readForTenant` consumption
  of those outcomes and do not repeat the codec or store matrix.
- Existing `packages/frontend-services/tests/integration/session-redis.test.ts` independent-client and disconnected-client
  evidence is extended for tenant-bound reads, not replaced.
- `tests/bdd/requirements/authentication-public-resources.feature` remains the evidence that `/auth/callback`,
  `/login-unavailable`, and unauthenticated `GET /_test/tenant-config` stay reachable and create no application session.
- Existing tenant BDD and tenant unit tests keep ownership of alias parsing and configuration 404 or 500 rules. This
  feature proves session enforcement does not rewrite them.
- No durable telemetry test is added. Temporary diagnostic probes are removed before completion. An empty log, trace,
  or metric is not enforcement evidence.
- The plan's source tree names `tests/bdd/requirements/session-reference-enforcement.feature`, while quickstart section
  4 assigns the executable BDD edits to the existing initiation, tenant-failure, and public-resource features and
  forbids a pending authenticated scenario. T023 does not create a duplicate or empty feature file. Matching admission,
  mismatch, service failure, and cross-instance recognition remain on the issue-level workflow and manual procedure
  until a stored session can be established without opening Redis and without inventing B6 freshness.
- Approved limitations remain those in `specs/158-reference-session-enforcement/verification.md`: no comprehensive
  default protection, no final forbidden or recovery experience, no completed freshness or browser-history journeys,
  no renewal or invalidation races, no complete outage recovery, no Microsoft or universal provider claim, and no
  production ingress proof. Successful real-login V-002 stays incomplete until GitHub #158's B6 policy is approved and
  functioning.

## Notes

- `[P]` tasks in one wave still wait for the predecessor named in the dependency graph.
- Commit after each completed task or logical group. Do not commit `.specify/feature.json`, probes, or generated output.
- Stop at a checkpoint to validate that story without starting the next one.
- All tasks use the unchecked checklist form `- [ ] Tnnn [P?] [USn?]` and name at least one repository path.
