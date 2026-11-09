# Tasks: Protect Application Entry Points and Bind Tenant Authentication

**Input**: Design documents from `specs/162-protect-entry-points/` — [spec.md](spec.md), [verification.md](verification.md),
[plan.md](plan.md), [research.md](research.md), [contracts/modules.md](contracts/modules.md),
[quickstart.md](quickstart.md); delivery issue [#154](https://github.com/PathableAI-org/Pre-ETS/issues/154), slice S1

**Prerequisites**: Approved specification (PR #352) and engineering plan (PR #353). Generated on the implementation
branch `162-protect-entry-points-impl`.

**Tests**: Required by the approved [verification.md](verification.md) and the contract evidence in
[contracts/modules.md](contracts/modules.md). Evidence tasks below are the ones those documents name; no test is added
for coverage alone. No durable test asserts logs, spans, attributes, telemetry payloads, or exporter behavior.

**Organization**: Phases follow the plan's implementation increments (plan.md, Phase 4 table). Increment 1 is the
foundational module contract that blocks every story; increments 2–4 deliver user stories; increment 5 and the final
asset designation are listed as **BLOCKED** phases and are not executable now. Story labels map to spec.md user
stories.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished contract or capability)
- **[Story]**: US1 deny unauthenticated access · US2 sign in through the tenant provider · US3 forbid cross-tenant use ·
  US4 public resources, diagnostics, tenant failures · US5 join or fresh entry
- **BLOCKED** tasks name their blocker and must not be started until it is resolved

## Standing constraints (apply to every task)

- Run every Spec Kit script with `export SPECIFY_FEATURE_DIRECTORY=specs/162-protect-entry-points`; the ignored
  `.specify/feature.json` must point there and is never committed.
- Read-only authorities: `spec.md`, `verification.md`, `checklists/`, `plan.md`, `research.md`, `contracts/modules.md`,
  requirements, delivery plans, and issue #154. A contract gap discovered during implementation stops the affected task
  and is reported to the owning phase (git-workflow.md, Corrections); it is never resolved inside implementation.
  `quickstart.md` may receive execution results only (git-workflow.md, Artifacts).
- `CallbackFreshness` keeps its fail-closed default (`next/freshness.ts`, `confirmed: () => false`). No task provides a
  freshness override to the running application, compares freshness, or adds a tolerance (#158, research D12).
- Interim asset behavior (research F-1): `/_next/static/**` stays unmatched and publicly served as today;
  `/favicon.ico`, metadata routes, and `/_next/image` are matched and protected — 401 without a session, never a login
  redirect.
- F-3 resolution A: the `/_test` exemption covers `GET`/`HEAD` only. `POST /_test/...` → 401 is module evidence only and
  is never asserted in requirement-tagged BDD.
- #157 recovery content, Server Action HTTP 401 recovery, and the running-tab modal are out of scope; no placeholder
  recovery path is added to the designation.
- `packages/frontend` imports no `effect`. Tests and consumers use public parents (`src/next.ts`, `src/index.ts`,
  `features/*.ts`), never private children. Optional properties are `readonly x?: T | undefined`. No `eslint-disable`,
  `@ts-*` suppression, `fallow-ignore`, `@effect-diagnostics`, Fallow ignore/baseline, or weaker threshold.
- Never commit generated output, coverage, build directories, tool reports, transcripts, probes, the transient session
  preparer, cookie values, references, tokens, callback parameters, or store contents. Remove only owned Redis keys.
- Implementation auto-commit is disabled: make the explicit Conventional Commits named at each **Commit boundary**,
  each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Before each commit run the affected
  workspace's `typecheck`, `lint`, and tests plus `pnpm format:check` and `pnpm check:changes` (the pre-commit hook also
  runs lint-staged and `check:changes`).

---

## Phase 1: Setup (baseline and declaration inspection)

**Purpose**: Confirm the baseline, the installed APIs the contracts name, and the zones of every file the design
touches, before any public contract is written.

- [x] T001 Confirm branch `162-protect-entry-points-impl` on top of `ffd8ca8`, clean `git status`, `SPECIFY_FEATURE_DIRECTORY` exported, and `.specify/feature.json` = `{"feature_directory": "specs/162-protect-entry-points"}`; record `git rev-parse HEAD`, `node --version`, `pnpm --version`, `docker compose version` (quickstart.md, Prerequisites)
- [x] T002 Run the baseline gates before editing — `pnpm typecheck`, `pnpm lint`, `pnpm --filter @pathableai/pre-ets-frontend-services test`, `pnpm --filter @pathableai/pre-ets-frontend test:unit`, `pnpm check:unused`, `pnpm check:health` — with `docker compose up -d --wait redis`; record pre-existing findings so later reports can separate introduced from pre-existing
- [x] T003 [P] Read docs/engineering/effect-guidance.md, packages/frontend-services/AGENTS.md, packages/frontend/AGENTS.md, and the local Effect v4 checkout's `LLMS.md`; verify against installed declarations in packages/frontend-services/node_modules that `Effect.fn`, `Effect.matchEffect`, `Clock.currentTimeMillis`, `Option`, and the `next/server` types `NextRequest`, `NextResponse.next/rewrite`, `NextProxy` match research.md "Installed dependency facts"; stop and report if any differs
- [x] T004 [P] Locate the installed `@pathableai/react` package and read `agent-guidance/pathable-react/SKILL.md` plus only the reference relevant to links, status regions, and buttons (needed by T026, T027, T028)
- [x] T005 [P] Run `pnpm --filter @pathableai/pre-ets-frontend-services exec fallow guard src/next.ts src/next/protection.ts src/next/request.ts src/next/session.ts src/next/login.ts src/next/cookies.ts src/next/callback.ts src/session.ts src/index.ts` and `pnpm --filter @pathableai/pre-ets-frontend exec fallow guard src/proxy.ts src/features/access-responses.ts src/features/access-responses/presentation.tsx src/features/history-protection.ts src/features/history-protection/restored-page-guard.tsx src/app/access-denied/page.tsx src/app/layout.tsx src/app/forbidden.tsx src/app/login-unavailable/page.tsx`; confirm every path is in the zones named in contracts/modules.md "Cross-module dependency direction" (no zone or `allowUnmatched` change); stop and report otherwise
- [x] T006 [P] `git fetch origin main` and read PREETS-SESSION-001–005 and PREETS-TENANT-004/005 on current `origin/main`; record the baseline SHA and compare with `43215557` used by the spec; report unavailable baseline access rather than assuming approval (docs/engineering/testing/requirements-bdd.md)

**Checkpoint**: APIs, zones, and requirement baseline confirmed; no source changed.

---

## Phase 2: Foundational — Increment 1: Protection contract (blocks all stories)

**Purpose**: Deliver the `frontend-services` module contract — `createProtectionProxy`, its private request
classification, shared request-tenant step, login non-navigation refusal, renewal cookie re-issue — with its durable
module evidence (plan.md increment 1; contracts/modules.md "protection gate", "createLoginHandler", "session.ts public
entry", "Private next/ helpers").

**⚠️ CRITICAL**: No story phase can begin until this phase is committed.

### 2a. Shared request step and login refusal

- [x] T007 Add login non-navigation examples to packages/frontend-services/tests/unit/authentication-entry.test.ts through the public `src/next.ts` `createLoginHandler`: `sec-fetch-mode` `cors`, `no-cors`, `same-origin` → 401 with `Cache-Control: private, no-store`, no `AuthenticationService.prepare` call, no `Set-Cookie`; `navigate` and absent Fetch Metadata keep today's 307/`/login-unavailable`/404/500 behavior (contracts/modules.md "Non-navigation login requests prepare nothing"; research D13). Confirm the new examples fail first
- [x] T008 Create private packages/frontend-services/src/next/request.ts exporting `type NavigationStatus = "navigation" | "non-navigation" | "unknown"`, `navigationStatus(headers: Headers): NavigationStatus` (`sec-fetch-mode` present → navigation iff `navigate`; else `sec-fetch-dest` present → navigation iff `document`; else `unknown`), and `resolveRequestTenant(host: string): Effect.Effect<{ readonly alias: TenantAlias; readonly config: TenantConfig }, TenantFailure, TenantConfigService>` built from `TenantConfigService.getAlias` then `getConfigFromAlias` (contracts/modules.md "Private next/ helpers"; research D3)
- [x] T009 Replace the inline alias-then-configuration step in packages/frontend-services/src/next/session.ts `readSessionRequest` with `resolveRequestTenant`; keep its public contract (tenant failure → `notFound()`/throw, mismatch → `forbidden()`, store failure → throw) unchanged; existing packages/frontend-services/tests/unit/reference-session-enforcement.test.ts must pass unmodified (depends on T008)
- [x] T010 Make packages/frontend-services/src/next/login.ts return 401 + `PRIVATE_NO_STORE` for `navigationStatus(request.headers) === "non-navigation"` without calling `prepare`, creating a transaction, or setting a cookie, so T007 passes (depends on T008)
- [x] T011 Extract `remainingIdleSeconds(idleDeadlineEpochMilliseconds: number, nowEpochMilliseconds: number): number` from packages/frontend-services/src/next/callback.ts into packages/frontend-services/src/next/cookies.ts and use it from `establishSession`; callback behavior unchanged (still 204 in this increment), existing callback examples pass unmodified (contracts/modules.md "Private next/ helpers")
- [x] T012 Run `pnpm --filter @pathableai/pre-ets-frontend-services typecheck`, `lint` (includes `lint:effect`), `test`, and `exec fallow dead-code` / `exec fallow dupes`; fix introduced findings

**Commit boundary 1**: `feat(frontend-services): refuse login preparation for non-navigation requests for #154`
(T007–T012).

### 2b. Protection gate contract and behavior

- [x] T013 Write packages/frontend-services/tests/unit/protection.test.ts (`describe` titles cite `[PREETS-SESSION-001]`, `[PREETS-SESSION-005]`, and `[PREETS-TENANT-004, PREETS-TENANT-005]` where the block supplies that evidence) importing `createProtectionProxy` only from `src/next.ts`, mocking `src/runtime.ts` and providing `TenantConfigService`/`SessionService` doubles as the existing unit suites do. Fast-Check property: for generated pathnames, methods, and Fetch Metadata/`next-action` header subsets with a `NoUsableSession` double, pass-through (`x-middleware-next`) occurs iff method ∈ {`GET`,`HEAD`} and pathname is exactly `/auth/callback`, `/auth/login`, `/login-unavailable`, `/_test`, or begins with `/_test/`. Named examples: each designated path; `/_testing`, `/auth/login/extra`, trailing-slash and case variants; `POST` to every public path including `POST /_test/tenant-config` → 401 (F-3 resolution A, module evidence only); percent-encoded `/%5Ftest/x`, `/_test/%2e%2e/`, `/_test/..%2F`, `/_test%2Fx`, `/_test/%5C` protected (contracts/modules.md, first evidence row). Confirm it fails first
- [x] T014 In packages/frontend-services/tests/unit/protection.test.ts add table-driven examples over request class × session outcome (contracts/modules.md "Success semantics and invariants"): public → no session double call and no header change; runtime not started (`StartupNotReady`) → 503; `getAlias` and `getConfigFromAlias` failures in host and static semantics → `responses.tenantFailure(404 | 500)` with no session call (tenant first); `SessionServiceUnavailable` → 503; `NoUsableSession` → document 307 with `Location` = `new URL("/auth/login", request.nextUrl)`, application 401; `SessionTenantMismatch` → document `forbiddenDocument(request)`, application 403; `UsableSession` → pass-through with `Cache-Control: private, no-store`. Fetch Metadata rows: `navigate`/`document`, `cors`/`empty`, `same-origin`/`empty`, `no-cors`/`image` for `/favicon.ico` and `/_next/image`, absent metadata → application (never 307). Every gate response, including host-factory results, carries `private, no-store`; gate-built denials have empty bodies and no `Set-Cookie`
- [x] T015 In packages/frontend-services/tests/unit/protection.test.ts add renewal examples with a fixed `Clock`: document entry → `refreshForTenant({ activity: "deliberate-page-request", policy: effectiveSessionPolicy(config), reference, tenantAlias })`; `POST` with `next-action` → `deliberate-form-submission`; RSC/prefetch/absent-metadata/other → `readForTenant` only; at most one store call per request; renewed `pathable-session` re-issued via `setSessionCookie` with the request's own reference and `Max-Age` = `remainingIdleSeconds(deadline, now)`; plus a throwing `forbiddenDocument`/`tenantFailure` factory and a defecting double each make the promise reject (never pass through)
- [x] T016 Add `export { decodeSessionReference } from "./session/codec.js"` to packages/frontend-services/src/session.ts (unchanged signature `(value: string | undefined) => Option.Option<SessionReference>`; not added to the package root) (contracts/modules.md "src/session.ts public entry")
- [x] T017 Create private packages/frontend-services/src/next/protection.ts: closed designation constant (exact paths above, `GET`/`HEAD` only); pure classifier returning `public | { entry: "document" | "application"; renewal: QualifyingSessionActivity | undefined }` from method, `request.nextUrl.pathname`, `next-action`, and `navigationStatus`; `Effect.fn("protectRequest")` program running `resolveRequestTenant(host)` then `refreshForTenant` or `readForTenant`, mapped with `Effect.matchEffect` branching on `_tag` per the outcome table; `decodeSessionReference` imported only via `../session.js`; `Clock.currentTimeMillis` for `now`; executed through the existing `toNext` from `next/handler.ts`; no span attribute carrying reference, identity, or Host beyond existing spans (plan.md Phase 4 "Gate program"; depends on T008, T011, T016)
- [x] T018 Export `createProtectionProxy(responses: ProtectionResponses): (request: NextRequest) => Promise<NextResponse>` and `interface ProtectionResponses { readonly forbiddenDocument: (request: NextRequest) => Promise<NextResponse>; readonly tenantFailure: TenantFailureResponse }` with the doc comments from contracts/modules.md from packages/frontend-services/src/next.ts, and re-export `createProtectionProxy` and `type ProtectionResponses` from packages/frontend-services/src/index.ts; T013–T015 pass (depends on T017)
- [x] T019 Run `pnpm --filter @pathableai/pre-ets-frontend-services typecheck`, `lint` (incl. `lint:effect`), `test`, `exec fallow dead-code`, `exec fallow health --complexity`; fix any complexity finding by changing the representation (for example a table of outcomes), not by single-use helpers

**Commit boundary 2**: `feat(frontend-services): add default protection gate for #154` (T013–T019).

### 2c. Real-store integration evidence

- [x] T020 Create packages/frontend-services/tests/integration/protection-redis.test.ts (`describe` cites `[PREETS-SESSION-001, PREETS-SESSION-005]`): real `SessionService` over Redis with an owned per-run key prefix and the existing helpers in packages/frontend-services/tests/helpers/; establish a record then show expired → document 307 / application 401, invalidated → 307/401, other-tenant record → 403/`forbiddenDocument`, disconnected client → 503 with no login redirect and no new cookie; remove only owned keys in a scoped finalizer (contracts/modules.md "Real store outcomes reach the gate unchanged"; research F-2 resolution A)
- [x] T021 Run `pnpm --filter @pathableai/pre-ets-frontend-services test:integration -- tests/integration/protection-redis.test.ts` with `docker compose up -d --wait redis`; record the result

**Commit boundary 3**: `test(frontend-services): exercise the protection gate over real Redis for #154` (T020–T021).

**Checkpoint**: Gate contract and module evidence complete. Not yet wired into the application; no feature claim is
established by this phase.

---

## Phase 3: Increment 2 — Application default protection (US1 P1 🎯 MVP, with US3 and US4)

**Goal**: Every page, route handler, and Server Action except the designated public `GET`/`HEAD` resources and build
assets is gated by the proxy; denial outcomes, forbidden presentation, public-resource tenant binding, and consumer
denial are observable in the running application.

**Independent Test**: Without a session, every inventoried and undesignated entry is denied (307 for navigations, 401
otherwise), public resources stay reachable, tenant failures keep 404/500, and a temporary undesignated resource of each
kind is denied with no opt-in (verification.md V-001, V-002, V-003, V-005, V-011, V-012 fabricated, V-013 direct,
V-016, V-017).

### 3a. Move access responses behind a feature entry

- [ ] T022 [US4] Move packages/frontend/src/app/auth/presentation.tsx to packages/frontend/src/features/access-responses/presentation.tsx unchanged, add public entry packages/frontend/src/features/access-responses.ts exporting `authenticationReturnBody: () => ReturnType<typeof renderToReadableStream>` and `tenantFailureResponse: TenantFailureResponse`, delete the old file, and point packages/frontend/src/app/auth/login/route.ts, packages/frontend/src/app/auth/callback/route.ts, and packages/frontend/tests/unit/authentication-return.test.ts at the entry (contracts/modules.md "access-responses")
- [ ] T023 [US4] Run `pnpm --filter @pathableai/pre-ets-frontend typecheck`, `lint`, `test:unit`, `exec fallow dead-code`; existing `authentication-entry`/`authentication-return` tests pass unmodified apart from the import path

**Commit boundary 4**: `refactor(frontend): move access responses behind a feature entry for #154` (T022–T023).

### 3b. Proxy wiring and presentations

- [ ] T024 [US1] Rewrite packages/frontend/tests/unit/proxy.test.ts first: `config.matcher` equals `["/((?!_next/static/|_next/webpack-hmr|__nextjs).*)"]`; path-to-regexp examples — `/`, an absent path, `/favicon.ico`, `/_next/image`, `/_test/x` matched, `/_next/static/x` unmatched; a mocked `createProtectionProxy` captures `forbiddenDocument` and shows it returns a rewrite to `/access-denied` on the request's origin (contracts/modules.md "src/proxy.ts" evidence)
- [ ] T025 [US1] Replace packages/frontend/src/proxy.ts with `export const proxy: NextProxy = createProtectionProxy({ forbiddenDocument: (request) => Promise.resolve(NextResponse.rewrite(new URL("/access-denied", request.url))), tenantFailure: tenantFailureResponse })` and `export const config = { matcher: ["/((?!_next/static/|_next/webpack-hmr|__nextjs).*)"] }`, importing from `@pathableai/pre-ets-frontend-services` and `@/features/access-responses` only; T024 passes (depends on T018, T022, T024)
- [ ] T026 [P] [US3] Create packages/frontend/src/app/access-denied/page.tsx: `export const dynamic = "force-dynamic"` and `export default function AccessDeniedPage(): never { forbidden() }`; protected by default, no public designation (contracts/modules.md "routes"; research D4)
- [ ] T027 [P] [US3] Add one keyboard-reachable `@pathableai/react`-conformant link to `/` with a meaningful name to packages/frontend/src/app/forbidden.tsx; heading and explanation unchanged (FR-018, FR-026; contracts/modules.md "forbidden.tsx")
- [ ] T028 [P] [US1] In packages/frontend/src/features/session-reference/reference-operation.tsx wrap `action(previousState, formData)` in a client function that converts a rejected invocation (gate 401/403/503 or transport failure) into the existing `Denied` state with a generic "operation was not performed" message in the existing `role="status"` region; no retry; exports of packages/frontend/src/features/session-reference.ts unchanged (FR-005, FR-026; research D10)
- [ ] T029 [P] [US4] Make packages/frontend/src/app/login-unavailable/page.tsx await `requireTenantConfig()` from `src/app/(app)/tenant-context.ts` before rendering so tenant failure keeps 404/500 (FR-008, FR-020; research D5)
- [ ] T030 [US1] Run `pnpm --filter @pathableai/pre-ets-frontend typecheck`, `lint`, `test:unit`, `build`, and `exec fallow dead-code` / `exec fallow health --complexity`; confirm `next.config.ts` still enables `experimental.authInterrupts` and its `/` header is unchanged

**Commit boundary 5**: `feat(frontend): protect every entry point by default for #154` (T024–T030).

### 3c. Transient undesignated-resource probe (V-002; never committed)

- [ ] T031 [US1] Execute quickstart.md §3 in a scratch worktree under the scratchpad at the commit-5 revision: add a probe page, a probe route handler (`GET` and marker-cookie `POST`), and a probe Server Action with no designation; inspect the route inventory and the designation constant; without a session record navigation `GET`s → 307 to `/auth/login` with no marker, `cors`/`empty` `GET`s → 401, `POST`s and the action → 401 with no marker cookie; with a transient prepared session (T052 preparer) record that both `GET`s pass with `Cache-Control: private, no-store` and no `public`/`s-maxage`. **If Next replaces the proxy header on static output, stop and return the contract to the plan (research D7).** Delete the scratch worktree and confirm the assessed checkout's `git status` is unchanged (V-002; SESSION-001 AC3)

### 3d. Requirements-backed BDD (feature-level `@partial`)

- [ ] T032 [US4] Using the `requirements-bdd-author` and `requirements-bdd-scaffold` skills and the requirement text from T006, revise tests/bdd/requirements/tenant-failures.feature ("An absent path on a reachable tenant is not found") and the `invalid tenant navigation presents the ordinary missing page` step in tests/bdd/steps/presentation.ts to use `/_test/this-page-is-absent` as the ordinary-missing-page baseline; invalid-tenant `/` must still equal that baseline text — if the gate's `tenantFailureResponse` body differs, fix the host presentation in packages/frontend/src/features/access-responses/presentation.tsx, not the comparison (quickstart.md §4 Revisions; research D11)
- [ ] T033 [US4] Update tests/bdd/requirements/authentication-public-resources.feature: description states comprehensive protection is in scope, asset assessment incomplete pending F-1, recovery content pending #157; add `/_test/this-page-is-absent` → 404, no redirect, no cookie (quickstart.md §4 Revisions). `tests/bdd/requirements/tenant-oidc-callback.feature` keeps its assertions and is re-run under the gate
- [ ] T034 [US1] Create tests/bdd/requirements/default-entry-protection.feature (`@partial @preets-session-001`; `@preets-session-004` only on automatic-login rows; `@preets-tenant-004`/`@preets-tenant-005` only on tenant-failure rows) whose description states the established slice and the remaining #157/#158/F-1 gaps, with scenarios: "Undesignated navigations delegate to tenant login" (`/`, `/access-denied`, `/an-undesignated-path`, `/_testing`, `/auth/login/extra` × no cookie, malformed cookie, well-formed unknown 43-character reference → 307 same-origin `/auth/login`, no protected content, not cacheable, no application cookie); "Non-navigation requests are denied without starting login" (`GET /` with `cors`/`empty`, `GET /` without Fetch Metadata, `/favicon.ico` and `/_next/image?url=%2Fx&w=16&q=75` with `no-cors`/`image`, `POST /`, `POST /an-undesignated-path` → 401, no `Location`, no protected content, no application or correlation cookie); "A direct protected action request performs no effect" (`POST /` with the real `runReferenceOperation` ID → 401, no receipt cookie, no `Location`); "Tenant failure wins over protection" (`GET /` and `POST /` at `capital-city.example.test`, static mode with a missing selected file, `GET /login-unavailable` at an invalid host → 404 host / 500 static, never 307/401/403). No `POST /_test/...` row (F-3) (quickstart.md §4 New feature; V-001, V-005, V-011, V-012, V-013, V-016)
- [ ] T035 [US1] Bind the T032–T034 steps in tests/bdd/steps/http.ts, tests/bdd/steps/authentication.ts, and tests/bdd/support/server.ts: raw-HTTP requests state Fetch Metadata explicitly (document → `sec-fetch-mode: navigate` + `sec-fetch-dest: document`; RSC/action → `cors`/`empty`; image → `no-cors`/`image`; metadata-less rows omit both); the action ID is read from the production build's server-reference manifest in a support helper; steps never open Redis or session stores; fabricated references are cookie strings only (tests/bdd/steps/README.md)
- [ ] T036 [US1] Run `pnpm lint:gherkin`, `pnpm format:gherkin:check`, `pnpm test:bdd:dry` (discovery only), then `pnpm test:bdd` with Redis and Keycloak ready; review with the `requirements-bdd-review` skill; record command, scenario counts, failures, and browser cache condition (a dry run or skipped scenario is not evidence)

**Commit boundary 6**: `test(bdd): require default entry protection for #154` (T032–T036).

### 3e. Current-behavior documentation

- [ ] T037 [P] [US1] Update docs/authentication.md (proxy is no longer pass-through; login refuses non-navigations with 401; `/login-unavailable` resolves tenant) and docs/session-state.md (default protection, closed public designation with `GET`/`HEAD` only for `/_test`, request classes and outcome matrix, renewal sources and cookie re-issue, entry-point inventory, interim asset behavior pending F-1, #157/#158 gaps); then `pnpm format:check` (plan.md Phase 4 "Documentation")

**Commit boundary 7**: `docs: describe default entry protection for #154` (T037). May be folded into commit 5 if the
reviewer prefers one decision per commit.

**Checkpoint**: US1 delivered as MVP; US3 and US4 non-success parts implemented. Running-app mismatch with a usable
session is observed only manually (Phase 8) until #158 (F-2).

---

## Phase 4: Increment 3 — Fresh entry and history (US5, P2)

**Goal**: Fresh entry without a valid session (refresh, new tab, back/forward) reaches the tenant provider directly,
and history traversal revalidates with the server.

**Independent Test**: With a fabricated or removed-record reference, reload `/` and open a new page — each reaches the
Springfield provider with `max_age=0`, never a session-expired page; Back after invalidation reaches the provider
(verification.md V-014 fresh-entry part, V-015 mechanism).

- [ ] T038 [US5] Create packages/frontend/src/features/history-protection/restored-page-guard.tsx (`"use client"`) and public entry packages/frontend/src/features/history-protection.ts exporting `function RestoredPageGuard(): null`: renders nothing; on `pageshow` with `persisted === true` reloads; on `popstate` calls `router.refresh()` (initial choice, settled by T040); registers listeners once and removes them on unmount; reads no session state (contracts/modules.md "history-protection"; research D8)
- [ ] T039 [US5] Render `<RestoredPageGuard />` from packages/frontend/src/app/layout.tsx, importing only `@/features/history-protection`; run `pnpm --filter @pathableai/pre-ets-frontend typecheck`, `lint`, `test:unit`, `build`, `exec fallow dead-code`
- [ ] T040 [US5] Execute the transient history-guard probe (quickstart.md §5) in a scratch build under the scratchpad with a temporary protected page linking to `/` and a transient prepared session from T052: soft-navigate, invalidate, press Back → expect provider arrival; record whether `router.refresh()` hard-navigated on 401 and, if not, switch T038 to `location.reload()` and repeat; then cross-document to `/login-unavailable`, Back → expect `pageshow` reload and provider arrival. Delete the scratch build; nothing from the probe is committed
- [ ] T041 [US5] Add scenario "Fresh entry without a valid session starts tenant sign-in" (`@preets-session-004`) to tests/bdd/requirements/default-entry-protection.feature with bindings in tests/bdd/steps/authentication.ts and tests/bdd/support/browser.ts: Chromium at `springfield.localhost:3000` with a fabricated well-formed reference cookie opens `/`, reloads, and opens a new page in the same context; each arrives at the Springfield provider with `max_age=0` and no protected content first; then `pnpm lint:gherkin`, `pnpm format:gherkin:check`, `pnpm test:bdd` (quickstart.md §4 table row 5; V-014)

**Commit boundary 8**: `feat(frontend): revalidate restored pages with the server for #154` (T038–T041; split the
T041 scenario into `test(bdd): require fresh entry to start tenant sign-in for #154` if preferred).

**Checkpoint**: US5 fresh-entry and history mechanism delivered; joining and step 7b remain BLOCKED (Phase 6).

---

## Phase 5: Increment 4 — Callback success navigation (US2, P1; module evidence only)

**Goal**: The callback's confirmed branch returns a navigable 303 to `/`; it stays unreachable in the running
application because `CallbackFreshness` keeps its fail-closed default.

**Independent Test**: Adapter scenarios with `CallbackFreshness` provided show 303 `Location: /`, host-only
`pathable-session`, cleared correlation, `private, no-store`; default-path scenarios show no session cookie.

- [ ] T042 [US2] Revise the confirmed-branch examples in packages/frontend-services/tests/unit/authentication-entry.test.ts (current 204 assertions near lines 223 and 244) to expect 303 with `Location: /`, the session cookie, cleared correlation, and `Cache-Control: private, no-store`; keep the default-freshness scenarios asserting no session cookie unchanged (contracts/modules.md "createCallbackHandler" evidence). Confirm they fail first
- [ ] T043 [US2] Change `establishSession` in packages/frontend-services/src/next/callback.ts to return `new NextResponse(null, { status: 303, headers: { location: "/", "cache-control": PRIVATE_NO_STORE } })` with the existing cookie writes; do not touch packages/frontend-services/src/next/freshness.ts; T042 passes; run workspace `typecheck`, `lint` (incl. `lint:effect`), `test` (depends on T042)
- [ ] T044 [P] [US2] Update docs/authentication.md: confirmed completion now navigates to `/` with 303; it remains unreachable until #158 supplies freshness confirmation

**Commit boundary 9**: `feat(frontend-services): navigate to the application entry after confirmed sign-in for #154`
(T042–T044).

**Checkpoint**: Increments 1–4 complete. Implementation PR may proceed with `@partial` BDD and an evidence record that
reports increment-5 claims and V-004 as incomplete.

---

## Phase 6: Increment 5 — Success-path feature evidence (US2, US3, US5) — **BLOCKED on #158**

**Blocker**: #158 B6 freshness confirmation functioning in the running application. "We will cross that bridge when we
come to 158." These tasks are listed for traceability only. Do not execute them, do not override `CallbackFreshness`,
and do not substitute prepared records.

- [ ] T045 [US2] **BLOCKED (#158)** Add real-login Cucumber scenarios to tests/bdd/requirements/default-entry-protection.feature (or a new `@partial` feature): login through instance A recognized only through instance B, renewal through A observed on B, expiry enforced on B observed on A (V-007, V-008; SESSION-003 AC1/AC3, real-login SESSION-005 AC1)
- [ ] T046 [US5] **BLOCKED (#158)** Add Cucumber scenarios: a new page in the same context joins without login; Back/Forward and reload after expiry of a page viewed under a real session restore nothing usable (V-014 joining, V-015 step 7b)
- [ ] T047 [US3] **BLOCKED (#158)** Add Cucumber scenarios presenting a captured real tenant-A cookie to Shelbyville on `/`, `/access-denied`, and the protected action → 403, forbidden page for the document, no receipt (V-009, V-010 with real cookies)
- [ ] T048 [US2] **BLOCKED (#158)** Add Cucumber scenarios distinguishing confirmed-fresh from freshness-unconfirmed callback returns, and the protected-action consumer denial scenario that needs a session at page load (V-006 distinction; contracts/modules.md "session-reference" evidence)
- [ ] T049 [US2] **BLOCKED (#158)** Execute manual verification steps 7b, 9, and 10 (quickstart.md §6) and record per-claim results

---

## Phase 7: Final public-asset designation — **BLOCKED on F-1**

**Blocker**: research.md finding F-1 decision on which asset classes (`/_next/static/**` build output, `/favicon.ico`
and metadata routes, `/_next/image`) are designated public. Until decided, the interim behavior in Standing constraints
applies and V-004 is reported incomplete.

- [ ] T050 [US4] **BLOCKED (F-1)** Apply the decided asset designation in packages/frontend-services/src/next/protection.ts and/or the matcher in packages/frontend/src/proxy.ts with matching examples in packages/frontend-services/tests/unit/protection.test.ts and packages/frontend/tests/unit/proxy.test.ts, and update docs/session-state.md
- [ ] T051 [US4] **BLOCKED (F-1)** Complete the V-004 assessment of every asset class the decision makes public (quickstart.md §6 step 4) and record the result

---

## Phase 8: Polish, feature verification, and quality gates

**Purpose**: Agent-executable manual feature verification, transient probes, store-outage observation, evidence
recording, cleanup, and repository gates for increments 1–4.

- [ ] T052 Write a transient, uncommitted session preparer under the scratchpad that imports only the public `SessionService` from built `frontend-services` sources and calls `establish`/`invalidate` under an owned `SESSION_KEY_PREFIX`; it prints only a safe label and hands references to the browser/HTTP client in memory (quickstart.md Prerequisites "Prepared sessions"; F-2). Used by T031, T040, T054 for denial/isolation only
- [ ] T053 Build and start instances A (3000) and B (3001) per quickstart.md §2 with owned prefixes and `OTEL_SDK_DISABLED=true`; wait for `GET /login-unavailable` → 200 on each
- [ ] T054 Execute manual verification quickstart.md §6 steps 1–6, 7, and 8 (verification.md Procedure; V-001, V-003, V-005, V-006 non-success, V-009, V-010 incl. one static-mode repeat, V-011, V-013, V-014 fresh entry, V-016, V-017, V-018 keyboard/visible focus on sign-in error, forbidden page, and consumer): include step 3's network-log check that the `/` prefetch and `/favicon.ico` get 401 and no `/auth/login` request follows a non-navigation with the `oidc-correlation` cookie unchanged; step 4's asset capture and review of packages/frontend/.next/static/ recorded as V-004 **incomplete pending F-1**; record steps 7b, 9, 10 **incomplete (#158)**
- [ ] T055 Execute the store-outage observation (quickstart.md §6 "Store outage") only against an owned Redis container on a free port with a dedicated instance: `docker pause` → `/` and the action answer 503, no login redirect, no new cookie; `docker unpause` and confirm readiness; record incomplete if no owned Redis is available (V-012)
- [ ] T056 Cleanup (quickstart.md §6 step 11): delete only owned session and transaction keys, close browser contexts, stop instances and owned containers, delete the T031/T040 scratch worktrees and the T052 preparer; confirm `git status --short` shows no probe, transcript, build, or tool output
- [ ] T057 Record the execution results (revision, environment, safe aliases and user label, ports, owned-prefix labels, "B6 freshness policy: absent", per-step observations, per-claim pass/fail/incomplete, probe outcomes and removal, cleanup, limitations) in a results section appended to specs/162-protect-entry-points/quickstart.md (permitted by git-workflow.md Artifacts) and summarize in the PR body; never cookie values, references, tokens, callback parameters, or store contents. Mark V-007, V-008, V-014 joining, V-015 step 7b, V-006 distinction, real-login SESSION-005 AC1 incomplete (#158); V-004 incomplete (F-1); SESSION-004 AC2 composition incomplete (#157)
- [ ] T058 Confirm docs/authentication.md and docs/session-state.md describe the final increment-1–4 behavior (T037, T044) and that no path under `specs/` outside specs/162-protect-entry-points/ changed (`git diff --name-only origin/main...HEAD -- specs`)
- [ ] T059 Run final validation from the repository root and record each result: `pnpm typecheck`; `pnpm build`; `pnpm lint` (includes `lint:effect` for frontend-services and `lint:gherkin`); `pnpm --filter @pathableai/pre-ets-frontend-services test`; `pnpm --filter @pathableai/pre-ets-frontend-services test:integration`; `pnpm --filter @pathableai/pre-ets-frontend test:unit`; `pnpm test:bdd` (with Redis and Keycloak ready; record scenario counts); `pnpm format:check`; `pnpm check:unused`; `pnpm check:health`; `pnpm check:changes`
- [ ] T060 Report every unresolved Fallow, lint, or test finding as pre-existing (per T002) or introduced; fix introduced ones; ask for human review for any suspected false positive or legitimate exception rather than suppressing it
- [ ] T061 Open the implementation PR description with `Contributes to #154` (not `Closes`, since #158-gated claims, V-004, and #157 composition remain incomplete), the BDD command and result actually run, and the limitations from quickstart.md "Limitations"; do not push or merge without explicit human instruction

**Commit boundary 10**: `docs(evidence): record protected entry point verification for #154` (T057–T058, quickstart
results only).

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: none.
- **Phase 2 (Increment 1)**: after Phase 1; 2a → 2b → 2c. Blocks every later phase.
- **Phase 3 (Increment 2, US1/US3/US4)**: after Phase 2. 3a → 3b → 3c/3d → 3e.
- **Phase 4 (Increment 3, US5)**: after Phase 3 commit boundary 5 (needs the gate in the running app); T040 needs T052.
- **Phase 5 (Increment 4, US2)**: after Phase 2 only; independent of Phases 3–4 (different files except
  docs/authentication.md, so T044 follows T037).
- **Phase 6**: BLOCKED on #158. **Phase 7**: BLOCKED on F-1.
- **Phase 8**: after Phases 3–5. T031 (Phase 3) and T040 (Phase 4) use the T052 preparer; write T052 when first needed.

### Story dependencies

- US1 is the MVP and depends only on the increment-1 contract.
- US3 and US4 tasks ship inside increment 2 because they share the proxy composition; running-app mismatch with a usable
  session is manual (F-2) until #158.
- US5 depends on US1's running gate.
- US2 module work (increment 4) depends only on increment 1; its feature evidence is BLOCKED (#158).

### Within each phase

Contract evidence (failing tests through the public parent) → private implementation → composition/framework
adapter → feature evidence.

## Parallel Opportunities

- Phase 1: T003, T004, T005, T006.
- Phase 3b after T025's dependencies are met: T026, T027, T028, T029 (separate files).
- Phase 5 can run in parallel with Phases 3–4 by a second worker (different files); T044 waits for T037.
- Not parallel: T013–T015 share protection.test.ts; T007/T042 share authentication-entry.test.ts; T034/T041 share the
  feature file.

```text
# Phase 3b once T018 and T022 are committed:
T026 packages/frontend/src/app/access-denied/page.tsx
T027 packages/frontend/src/app/forbidden.tsx
T028 packages/frontend/src/features/session-reference/reference-operation.tsx
T029 packages/frontend/src/app/login-unavailable/page.tsx
```

## Implementation Strategy

1. Phases 1–2: module contract with property, examples, and real-Redis evidence (commit boundaries 1–3).
2. Phase 3: wire the gate — **MVP**: US1 default protection observable through HTTP and BDD (boundaries 4–7).
3. Phase 4: fresh entry and history (boundary 8). Phase 5: callback 303 (boundary 9).
4. Phase 8: manual verification, outage, cleanup, evidence record, final gates (boundary 10).
5. Phases 6–7 stay BLOCKED; the PR reports their claims incomplete.

## Traceability

| Claim / contract                                             | Implementation     | Evidence                                    | Status after increments 1–4 |
| ------------------------------------------------------------ | ------------------ | ------------------------------------------- | --------------------------- |
| Gate designation, classification, outcomes, renewal, defects | T008, T016–T018    | T013–T015 (unit/property), T020 (Redis)     | Module evidence             |
| Login non-navigation refusal                                 | T008, T010         | T007                                        | Module evidence             |
| `readSessionRequest` shared tenant step                      | T009               | existing reference-session-enforcement test | Reused evidence             |
| Callback 303 / default freshness denies                      | T043               | T042                                        | Module evidence             |
| Matcher, forbidden rewrite                                   | T025               | T024                                        | Framework evidence          |
| Access-responses move                                        | T022               | existing tests, T032                        | Reused evidence             |
| V-001, V-012 (fabricated), V-013 direct, V-016               | T025, T028         | T034–T036, T054 steps 2, 8                  | Planned                     |
| V-002                                                        | T025               | T031 probe                                  | Planned                     |
| V-003, V-017                                                 | T025, T029         | T033, T036, T054 step 4                     | Planned                     |
| V-004                                                        | —                  | T054 (partial), T051                        | **Incomplete (F-1)**        |
| V-005                                                        | T025               | existing initiation BDD, T034, T054 step 3  | Planned                     |
| V-006 non-success / distinction                              | unchanged callback | existing callback BDD, T054 step 5 / T048   | Planned / **#158**          |
| V-007, V-008                                                 | T043               | T045, T049                                  | **Incomplete (#158)**       |
| V-009, V-010                                                 | T025, T026, T027   | T014, T020, T054 step 6 / T047              | Planned / real cookie #158  |
| V-011                                                        | T025, T029, T032   | T014, T034, T036                            | Planned                     |
| V-012 expired/invalidated/outage                             | T017               | T020, T054 step 7, T055                     | Planned                     |
| V-014 fresh entry / joining                                  | T025, T038         | T041, T054 step 7 / T046                    | Planned / **#158**          |
| V-015 mechanism / step 7b                                    | T038–T039          | T040 probe / T046, T049                     | Planned / **#158**          |
| V-018                                                        | T027, T028         | T054 steps 5, 6, 8                          | Planned                     |
| SESSION-004 AC2 recovery composition                         | —                  | —                                           | **Out of scope (#157)**     |

Intentionally reused existing evidence: session service/store suites (#218–#221), tenant service suites,
tenant-oidc-initiation and tenant-oidc-callback BDD, the two-process harness in tests/bdd/support/harness.ts.
Operational observability: none claimed (verification.md); no durable telemetry test, and any temporary diagnostic probe
is removed before completion.
