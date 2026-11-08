---
description: "Task list for the Shared Session State convergence and evidence implementation"
---

# Tasks: Shared Session State

**Input**: Design documents from `specs/161-shared-session-state/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [verification.md](./verification.md),
[contracts/modules.md](./contracts/modules.md), [data-model.md](./data-model.md), [research.md](./research.md),
[quickstart.md](./quickstart.md)

**Tests and evidence**: Required by the approved [verification.md](./verification.md). This is a convergence
slice: the plan preserves the delivered `TenantConfigService`, `SessionService`, `readSessionRequest`, and host
runtime, so evidence tasks first audit the existing public-boundary suites against V-001–V-012, close only a concrete
gap found by that audit, then execute the suites and record semantic results. No new requirements BDD, no durable
log/span/telemetry assertion, and no per-operation test is generated.

**Organization**: Phases follow the spec's user stories (US1–US4). The mandatory composed manual observation spans
all four stories and runs after them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story from [spec.md](./spec.md) (US1–US4)
- Paths are repository-relative from `/home/jake/PathableAI/Pre-ETS`

## Fixed constraints carried from the plan and contracts

- Preserve the public signatures in [contracts/modules.md](./contracts/modules.md) exactly:
  `TenantConfigService` (`effectiveSessionPolicy`, `getAlias`, `getConfigFromAlias`, `getConfigFromHost`, tag
  `"@pathableai/pre-ets-frontend/TenantConfigService"`), `SessionService` (`establish`, `invalidate`, `read`,
  `readForTenant`, `refreshForTenant`, tag `"@pathableai/pre-ets-frontend/SessionService"`), and root-package
  `readSessionRequest(input: ReadSessionRequestInput): Promise<ResolvedSessionRequest>` with
  `SESSION_COOKIE = "pathable-session"`.
- Keep `NoUsableSession` a fieldless result and `SessionTenantMismatch` / `SessionServiceUnavailable` fieldless
  `Schema.TaggedError` classes with current tags. Do not merge mismatch or outage into absence.
- Only `src/tenant.ts` imports `src/tenant/config.ts`; only `src/session.ts` imports `src/session/codec.ts` and
  `src/session/store.ts`. Tests and probes consume parents, never private children.
- The package root (`packages/frontend-services/src/index.ts`) stays limited to the adapter, cookie name, and safe
  session/tenant types. Do not export `SessionService`, `SessionStore`, Redis, keys, records, or references.
- StoredSession v1 stays exactly: `version` literal `1`; `issuer` non-empty string; `subject` non-empty string;
  `tenantAlias` branded tenant alias; `idleDeadlineEpochMilliseconds` "positive safe whole number" with "equality is
  expired"; `warningLeadMinutes` "nonnegative whole number" where "0 means warning disabled, not expiration disabled";
  `telemetryId` UUID. "The decoder rejects missing, extra, malformed, or unknown-version fields."
- Effective policy: `idleTimeoutMinutes` "Explicit values are 5 through 30 inclusive; omission resolves to 30; invalid
  explicit values fail configuration." `warningLeadMinutes` "Omission resolves to 5 except when timeout is 5, where
  it resolves to 0; explicit 0 disables warning; a nonzero value is positive and strictly below timeout."
- No new workspace, dependency, runtime, Redis provider, lock, coordination key, tombstone, public export, or policy
  module. No change to CI cadence. Any finding that changes behavior, scope, acceptance, or verification obligations
  stops implementation and returns to the owning workflow; do not edit `spec.md`, `verification.md`, `plan.md`,
  `contracts/`, `data-model.md`, `research.md`, requirements, or the delivery plan.
- Retained evidence lives only in [quickstart.md §7 Implementation results](./quickstart.md#7-implementation-results)
  and contains safe semantic observations only: never opaque references, Redis keys or prefixes, cookies, raw records,
  credentials, tokens, PHI, telemetry payloads, or client-identifying data.

---

## Phase 1: Setup (Baseline and declaration inspection)

**Purpose**: Fix the exact revision and environment, and confirm the planned APIs against installed declarations
before any conformance judgement.

- [ ] T001 Record the baseline for [quickstart.md §Prerequisites](./quickstart.md#prerequisites): run
      `git rev-parse HEAD`, `node --version` (must be Node 26+; select `.nvmrc` 26.13.0 if the shell default is
      older), `pnpm --version` (12.16.1), `docker --version`, and `docker compose version`; confirm installed product
      pins from the root lockfile (Effect, `@effect/platform-node`, `@effect/vitest` 4.1.2; `redis` client 6.3.1;
      TypeScript 6.0.3) and the `redis:8.10.3` image in `compose.yaml`. Keep the values in a scratch note outside
      the repository for T048; do not commit raw output.
- [ ] T002 [P] Verify against installed declarations under `packages/frontend-services/node_modules/effect` and
      `packages/frontend-services/node_modules/@effect/platform-node` (not the 4.0.5 local Effect checkout, per
      research Decision 6) that `Context.Service`, `Schema.TaggedError`, `Clock`, `Layer.provide`/`Layer.provideMerge`,
      `ManagedRuntime`, `effect/persistence/Redis` scripts, and `NodeRedis` used by
      `packages/frontend-services/src/session.ts`, `src/session/store.ts`, `src/runtime.ts`, and
      `src/production-runtime.ts` still match their current usage. Record any drift as a conformance finding for T004.
- [ ] T003 [P] Run `pnpm install --frozen-lockfile` from the repository root and confirm `git status --short` is clean
      apart from intended work; do not change the lockfile.

---

## Phase 2: Foundational (Static contract conformance — blocks all stories)

**Purpose**: Plan Phase 4 step 1 and [quickstart.md §1](./quickstart.md#1-static-conformance-before-execution).
Decide, before any execution, whether any production or evidence gap exists. Every story phase depends on this
result.

**⚠️ CRITICAL**: No gap-closure task in Phases 3–6 may start until T008 records the conformance result.

- [ ] T004 Compare `packages/frontend-services/src/tenant.ts` and `src/tenant/config.ts` to the
      `TenantConfigService` contract in [contracts/modules.md](./contracts/modules.md#tenantconfigservice): exact
      service shape and tag, `TenantFailure = TenantNotFound (status 404) | TenantReadError (status 500)`, Schema
      decoding of untrusted tenant JSON in the private child, omission not adding fields to the decoded document, and
      no fallback tenant or policy. Note supported invariants and concrete gaps.
- [ ] T005 Compare `packages/frontend-services/src/session.ts`, `src/session/codec.ts`, and `src/session/store.ts`
      to the `SessionService` contract in [contracts/modules.md](./contracts/modules.md#sessionservice) and
      [data-model.md](./data-model.md): every exported interface and the `RefreshSessionForTenantInput` union
      (excluded activity with `policy?: never`, qualifying activity with required `policy`), closed
      `ExcludedSessionActivity`/`QualifyingSessionActivity` literal sets, the StoredSession v1 fields above, Effect
      `Clock` use, `SET NX PX` creation, `DEL` invalidation, one decoded Lua transition for read/expiry/tenant
      admission/excluded/qualifying refresh, decoding every `unknown` Redis reply, translation of codec/transport/
      malformed-reply/exhausted-collision failures to fieldless `SessionServiceUnavailable`, and no retry of an
      ambiguous mutation reply. Note supported invariants and concrete gaps.
- [ ] T006 Compare `packages/frontend-services/src/session-request.ts`, `src/index.ts`, `src/runtime.ts`,
      `src/production-runtime.ts`, `packages/frontend/src/app/(app)/page.tsx`, and
      `packages/frontend/src/app/(app)/actions.ts` to the `readSessionRequest` contract and dependency direction in
      [contracts/modules.md](./contracts/modules.md#root-package-readsessionrequest): tenant configuration loaded
      before tenant-bound admission, mismatch mapped to Next `forbidden()`, `SessionServiceUnavailable` propagated
      (never protected success, redirect, or login substitution), no replacement session, one host-owned
      `ManagedRuntime` (none per request), Redis hidden, and no `effect` import in `packages/frontend`.
- [ ] T007 Inspect module ownership per [docs/engineering/fallow.md](../../docs/engineering/fallow.md):
      frontend-services has no Fallow boundary zones, so run
      `pnpm --filter @pathableai/pre-ets-frontend-services exec fallow architecture --cycles --file <path>` for
      `src/tenant.ts`, `src/session.ts`, `src/session-request.ts`, `src/index.ts`, and `src/runtime.ts`, and confirm by
      search that no file other than each parent imports `src/tenant/config.ts`, `src/session/codec.ts`, or
      `src/session/store.ts` (tests included), since Fallow does not encode that ownership rule.
- [ ] T008 Record the static conformance result in
      [quickstart.md §7](./quickstart.md#7-implementation-results) (above the results table): each contract
      (tenant policy, session, bounded request, runtime composition, StoredSession v1, root surface) marked
      conformant or with its concrete gap, every planned source change or the explicit statement "no source change is
      required", and the downstream limitations that remain intentionally incomplete (#154–#158). If any gap changes
      behavior, scope, acceptance, or verification obligations, stop and report it for the owning workflow instead of
      continuing.

**Checkpoint**: Conformance decided. Story phases may proceed; gap-closure tasks apply only to gaps named in T008.

---

## Phase 3: User Story 1 — Use one session across independent consumers (Priority: P1) 🎯 MVP

**Goal**: Independent consumers share identity, tenant, deadline, and warning policy, and honor each other's updates
and terminal state without creator affinity (FR-001–FR-003, FR-011, FR-015; V-001, V-002, V-003).

**Independent Test**: [quickstart.md §3](./quickstart.md#3-real-shared-state-evidence) real-Redis suite —
establishment on one independently scoped NodeRedis client is read with strict-equal public state on another and on
a recreated client; refresh and invalidation through one client are honored by the other.

### Evidence for User Story 1

- [ ] T009 [US1] Audit `packages/frontend-services/tests/integration/session-redis.test.ts` against V-001–V-003 and
      the `SessionService` "Establish/read preserve exact safe state" and "Shared state needs no creator affinity"
      contract-evidence rows: confirm scenarios cover establish-on-A/strict-equal read on B and a recreated B,
      tenant match and mismatch without identity leakage, cross-client refresh adoption with an unchanged sibling,
      cross-client invalidation without recreation, missing/deleted/evicted records as `NoUsableSession`, and
      validated owned-prefix cleanup (`test:session:<uuid>:`). List any uncovered claim for T010.
- [ ] T010 [US1] Only for a US1 evidence gap named in T008/T009: add the smallest scenario to
      `packages/frontend-services/tests/integration/session-redis.test.ts` that consumes `SessionService` through
      `../../src/session.ts` (never `src/session/*`), uses independently scoped `ManagedRuntime`/NodeRedis clients
      and a validated owned prefix, and asserts semantic public outcomes. Otherwise mark not required in T014.

### Implementation for User Story 1

- [ ] T011 [US1] Only for a US1 production gap named in T008: change only the owning parent
      `packages/frontend-services/src/session.ts` or its private child `src/session/store.ts`/`src/session/codec.ts`,
      preserving every signature in [contracts/modules.md](./contracts/modules.md#sessionservice), StoredSession v1,
      and the single-key atomic transition (research Decisions 3–4). Run
      `pnpm --filter @pathableai/pre-ets-frontend-services typecheck` and
      `pnpm --filter @pathableai/pre-ets-frontend-services exec fallow architecture --file <path>` /
      `fallow dead-code --file <path>` on each edited file. Otherwise mark not required in T014.

### Execution for User Story 1

- [ ] T012 [US1] Start or select an isolated local Redis without disturbing another run:
      `docker compose up -d --wait redis` and `docker compose exec redis redis-cli ping` (requires the repository's
      local Compose environment). Never flush, scan, or stop a shared Redis.
- [ ] T013 [US1] Run `REDIS_URL=redis://127.0.0.1:6379 pnpm --filter @pathableai/pre-ets-frontend-services test:integration`
      and inspect the named session scenarios (ignore authentication-Redis scenarios for attribution). Confirm owned
      prefixes are cleaned.
- [ ] T014 [US1] Record US1 rows (V-001, V-002, V-003) in [quickstart.md §7](./quickstart.md#7-implementation-results)
      with the executed boundary, safe semantic observation, result, cleanup, and the limitation "independent clients
      are scopes in one process, not independently running authenticated applications"; state whether T010/T011 were
      required.

**Checkpoint**: US1 shared-state evidence executed and recorded against the exact revision.

---

## Phase 4: User Story 2 — Enforce the authoritative idle deadline (Priority: P1)

**Goal**: Establishment derives the deadline from effective policy; only qualifying pre-deadline activity renews
using then-effective policy; excluded traffic never renews; at/after the deadline nothing revives, including after a
timeout increase or a race (FR-006–FR-010; V-005, V-006, V-007, V-008; V-003 for cross-client expiry).

**Independent Test**: Deterministic `SessionService` scenarios under the Effect test clock plus real-Redis
renewal/expiration orderings and released races.

### Evidence for User Story 2

- [ ] T015 [P] [US2] Audit `packages/frontend-services/tests/lib/session.test.ts` against V-005–V-008 and the
      "Deadline and policy adoption are authoritative" contract-evidence row: establishment deadline from the active
      Effect clock and effective timeout, disabled warning preserved, every closed excluded-activity value leaving
      record and deadline unchanged, excluded activity carrying policy rejected, qualifying adoption of changed timeout
      and warning together, unrefreshed sessions keeping their own policy, read/refresh exactly at and after the
      deadline returning `NoUsableSession`, no revival after a timeout increase, and the policy properties
      (Fast-Check) per [property-based-testing.md](../../docs/engineering/testing/property-based-testing.md). List
      uncovered claims for T017.
- [ ] T016 [P] [US2] Audit `packages/frontend-services/tests/lib/session-policy-refresh.test.ts` and the renewal/
      expiration scenarios in `packages/frontend-services/tests/integration/session-redis.test.ts` (renewal before a
      later expiration attempt, no recreation after expiration wins, overlapping renewal/expiration accepting either
      winner with no later usable read) against V-003, V-006, V-007. List uncovered claims for T017.
- [ ] T017 [US2] Only for a US2 evidence gap named in T008/T015/T016: add the smallest public-boundary example or
      property to `packages/frontend-services/tests/lib/session.test.ts` (`it.effect` with the real service, a fresh
      scenario Layer, and `TestClock`), or a real-Redis ordering to
      `packages/frontend-services/tests/integration/session-redis.test.ts`. Do not weaken or exclude generated inputs.
      Otherwise mark not required in T020.

### Implementation for User Story 2

- [ ] T018 [US2] Only for a US2 production gap named in T008: change only `packages/frontend-services/src/session.ts`
      or its private `src/session/store.ts` transition, keeping "Equality or later is expired", excluded activity
      never changing record or TTL, and qualifying refresh replacing deadline, warning, and TTL atomically
      ([data-model.md §State transitions](./data-model.md#state-transitions)). Run the package typecheck and scoped
      Fallow checks. Otherwise mark not required in T020.

### Execution for User Story 2

- [ ] T019 [US2] Run `pnpm --filter @pathableai/pre-ets-frontend-services test tests/lib/session.test.ts tests/lib/session-policy-refresh.test.ts`
      and inspect the named scenarios listed in [quickstart.md §2](./quickstart.md#2-deterministic-public-contract-evidence);
      reuse the T013 integration run for the real-Redis orderings unless T017/T018 changed them, in which case rerun
      T013's command.
- [ ] T020 [US2] Record US2 rows (V-005, V-006, V-007, V-008, and V-003 expiry) in
      [quickstart.md §7](./quickstart.md#7-implementation-results) with the limitations "one Effect clock does not
      prove distributed-clock behavior" and "finite orderings do not prove every interleaving"; state whether
      T017/T018 were required.

**Checkpoint**: US1 and US2 evidence executed and recorded.

---

## Phase 5: User Story 3 — Reject invalid policy without fallback (Priority: P2)

**Goal**: Timeout and warning configuration resolve to the authorized effective policy or fail configuration with no
default substitution (FR-004, FR-005; V-004, V-012).

**Independent Test**: `TenantConfigService` scenarios over boundary, omitted, disabled, fractional, nonnumeric,
negative, equal-to-timeout, greater-than-timeout, and out-of-range values; invalid policy fails before any session
store command.

### Evidence for User Story 3

- [ ] T021 [P] [US3] Audit `packages/frontend-services/tests/lib/tenant-policy.test.ts` against V-004 and V-012
      through `TenantConfigService` (not only a helper): timeouts 5 and 30 accepted; omission → 30 without adding
      fields to the decoded file; explicit out-of-range, fractional, nonnumeric/null/boolean timeouts rejected
      without 30 fallback; omitted warning → 5 for timeout > 5 and → 0 for timeout 5; explicit `0` disables warning at
      any permitted timeout; valid positive whole leads strictly below the timeout accepted; negative, fractional,
      nonnumeric, equal-to-timeout, and greater-than-timeout leads rejected without default substitution; failures
      surface as `TenantNotFound` (status 404) in host mode, not as a usable policy. Also confirm
      `packages/frontend-services/tests/lib/session-policy-refresh.test.ts` rejects invalid policy before any store
      command. List uncovered claims for T022.
- [ ] T022 [US3] Only for a US3 evidence gap named in T008/T021: add the smallest example or Fast-Check property to
      `packages/frontend-services/tests/lib/tenant-policy.test.ts` through `TenantConfigService` with deterministic
      filesystem/path Layers. Otherwise mark not required in T025.

### Implementation for User Story 3

- [ ] T023 [US3] Only for a US3 production gap named in T008: change only `packages/frontend-services/src/tenant.ts`
      or its private `src/tenant/config.ts` schema, keeping `effectiveSessionPolicy` pure over decoded configuration,
      the 404/500 semantics, and no new policy module or export. Run `pnpm --filter <package> typecheck` and
      `pnpm --filter <package> exec fallow architecture --file <path>` / `fallow dead-code --file <path>` on each
      edited file.
      Otherwise mark not required in T025.

### Execution for User Story 3

- [ ] T024 [US3] Run `pnpm --filter @pathableai/pre-ets-frontend-services test tests/lib/tenant-policy.test.ts tests/lib/session-policy-refresh.test.ts`
      and inspect the boundary, omission, disabled, valid-lead, and rejection cases.
- [ ] T025 [US3] Record US3 rows (V-004, V-012) in [quickstart.md §7](./quickstart.md#7-implementation-results) with
      the limitations "does not establish warning presentation" and "does not prove configuration distribution across
      a production fleet"; state whether T022/T023 were required.

**Checkpoint**: US1–US3 evidence executed and recorded.

---

## Phase 6: User Story 4 — Fail closed under invalidation and service failure (Priority: P2)

**Goal**: Invalidation is final against overlapping renewal; usable, no-usable, mismatch, and service-failure
outcomes remain distinct; the bounded reference consumer never grants protected success or creates a replacement
session on failure (FR-012–FR-014, FR-016; V-009, V-010, V-011).

**Independent Test**: Real-Redis invalidation/renewal orderings, disconnected-adapter and isolated owned-store outage
runs, and bounded request/page/action tests.

### Evidence for User Story 4

- [ ] T026 [P] [US4] Audit the invalidation and failure scenarios in
      `packages/frontend-services/tests/integration/session-redis.test.ts` (renewal-before-invalidation,
      invalidation-before-renewal, released together; disconnected establishment, tenant admission, read, refresh,
      invalidation) and `packages/frontend-services/tests/lib/session.test.ts` (missing vs invalidated terminal
      outcome, DEL dispatch failure, DEL-applied-then-reply-failure without retry, refresh final-write failure without
      retry, corrupted/unknown-version records, exhausted collisions) against V-009 and V-010.
- [ ] T027 [P] [US4] Audit `packages/frontend-services/tests/integration/session-redis-outage.test.ts` against V-010:
      pre-dispatch read/refresh/invalidation and paused in-flight operations fail within the owned-store loss bound as
      fieldless `SessionServiceUnavailable`; it owns a unique temporary Compose file, project, `redis:8.10.3`
      container, and loopback port, and its teardown restarts, re-evaluates, cleans sessions, and removes container,
      volume, and temporary directory.
- [ ] T028 [P] [US4] Audit `packages/frontend-services/tests/unit/reference-session-enforcement.test.ts` and
      `packages/frontend/tests/unit/reference-session-enforcement.test.ts` against V-010, V-011 and the
      `readSessionRequest` contract-evidence rows: tenant selection before admission, mismatch → `forbidden()` with
      no receipt, `NoUsableSession` → page redirect / action denial with no login start or receipt, service and tenant
      failures propagated with no protected result or receipt, and public-route/raw-diagnostic exclusions.
- [ ] T029 [US4] Only for a US4 evidence gap named in T008/T026–T028: add the smallest scenario to the owning file
      among those audited (public parents only; service doubles only at the adapter boundary; real store for store
      claims; the outage suite only for owned-store loss). Otherwise mark not required in T034.

### Implementation for User Story 4

- [ ] T030 [US4] Only for a US4 production gap named in T008: change only the owner —
      `packages/frontend-services/src/session.ts` (and private `src/session/store.ts`) for invalidation/failure
      translation, or `packages/frontend-services/src/session-request.ts` / `packages/frontend/src/app/(app)/page.tsx`
      / `packages/frontend/src/app/(app)/actions.ts` for bounded-consumer mapping — preserving the root export surface
      and the "never protected success or login substitution" response. If `packages/frontend` UI changes, first read
      `agent-guidance/pathable-react/SKILL.md` from the installed `@pathableai/react` package. Run `pnpm --filter <package> typecheck`
      and `pnpm --filter <package> exec fallow architecture --file <path>` / `fallow dead-code --file <path>`.
      Otherwise mark not required in T034.

### Execution for User Story 4

- [ ] T031 [US4] Run `pnpm --filter @pathableai/pre-ets-frontend-services test tests/unit/reference-session-enforcement.test.ts tests/lib/session.test.ts`
      and reuse T013's integration run for invalidation/disconnected scenarios unless T029/T030 changed them (then
      rerun T013's command).
- [ ] T032 [US4] Run `pnpm --filter @pathableai/pre-ets-frontend-services build` then
      `pnpm --filter @pathableai/pre-ets-frontend test:unit`; confirm usable success, no-usable redirect/denial,
      mismatch denial, service/tenant failure propagation, no protected receipt on failure, and public-route
      exclusions.
- [ ] T033 [US4] Run the opt-in outage suite separately:
      `pnpm --filter @pathableai/pre-ets-frontend-services test:integration:outage`. Confirm both outage scenarios,
      then confirm with `docker compose ls --all` and `docker volume ls` that no owned outage project, container, or
      volume remains and that the temporary Compose directory is gone; report any residue and do not call the run
      clean if cleanup failed.
- [ ] T034 [US4] Record US4 rows (V-009, V-010, V-011) in [quickstart.md §7](./quickstart.md#7-implementation-results)
      with the limitations "adapter tests use service doubles", "local injection does not establish every
      managed-service failure", and "one bounded page/action is not comprehensive application protection"; state
      whether T029/T030 were required.

**Checkpoint**: All four stories' automated evidence executed and recorded.

---

## Phase 7: Agent-executable manual composed parent observation (US1–US4)

**Purpose**: The mandatory composed lifecycle in [verification.md](./verification.md#agent-executable-manual-feature-verification-mandatory)
executed exactly per [quickstart.md §5](./quickstart.md#5-manual-composed-parent-observation). The probe is a
temporary, uncommitted execution artifact at the fixed path `tests/bdd/session/shared-session-parent.manual.test.ts`;
it is not a durable test, product interface, or BDD scenario.

- [ ] T035 Create the temporary probe `tests/bdd/session/shared-session-parent.manual.test.ts` (do not `git add` it)
      following the [probe composition contract](./quickstart.md#probe-composition-contract): import
      `./fixture-hooks.mjs` and `./fixture-register.mjs` first; import `applicationBrowser`, `freePort`,
      `type SiteOptions`, `spawnFrontend`, `stopProcess`, `waitUntilReady` from `../../support/oidc/harness.ts`;
      reproduce in the file only the minimum orchestration of the test-local patterns `sessionLayer`, `establish`,
      `read`, `refreshAt`, `invalidate`, `withClients`, `deleteOwnedPrefix` (from
      `packages/frontend-services/tests/integration/session-redis.test.ts`) and `freeLoopbackPort`,
      `composeDefinition`, `createOutageStore`, `stopStore`, `startStore`, `destroyOutageStore` (from
      `packages/frontend-services/tests/integration/session-redis-outage.test.ts`) without exporting or importing
      them. Obtain `SessionService` only through the session parent's built output
      `packages/frontend-services/dist/session.js` (as the existing reference fixture uses `./dist/session.js`),
      never a `dist/session/*` child; the source tree uses `.js` specifiers that `node --test` cannot run directly.
- [ ] T036 In the probe, implement setup per [quickstart.md §5 Setup](./quickstart.md#setup): an isolated
      `redis:8.10.3` Compose project on a free loopback port with a validated unique prefix; two independently scoped
      `SessionService` clients A and B on the same owned URL and prefix; the synthetic `springfield` fixture tenant
      (`fixtures/tenant-config/springfield.json`, test data only), `.test` issuers, two synthetic subjects, policy P1
      `30/5` and P2 `5/0`; the bounded consumer started via `spawnFrontend` with the adapted `siteOptions`
      (`path.resolve("fixtures/tenant-config")`, `runtime: "production"`, owned `redisUrl`/`sessionPrefix`,
      probe-owned `transactionPrefix`) on a `freePort`, `waitUntilReady`, then `applicationBrowser` for
      `springfield.localhost:<port>`, capturing the returned handle and every Playwright context. No real provider
      credentials; opaque values stay in memory only.
- [ ] T037 In the probe, implement lifecycle observation steps 1–8 of
      [quickstart.md §5 Lifecycle observation](./quickstart.md#lifecycle-observation): P1 establish/cross-read A and B
      (V-001–V-003); P2 selected without refresh leaves both on P1 (V-006); excluded activity for A changes nothing
      (V-008); qualifying A then B adopt P2 independently (V-006); coordinated A renewal vs invalidation from the other
      client ends unusable and a later refresh cannot recreate A (V-009); bounded page/action success with exactly one
      non-session receipt, then cookie reset to only `pathable-session`; `stopStore` then the same action shows the
      unavailable result, no new receipt, unchanged session cookie, no redirect, and no usable identity on either
      client (V-010, V-011); `startStore` only for re-evaluation and cleanup, treating any indeterminate mutation as
      failure without retry.
- [ ] T038 In the probe, implement the `try`/`finally` cleanup order of
      [quickstart.md §5 Cleanup](./quickstart.md#cleanup), each step guarded for partial setup: restart a stopped
      owned store; re-evaluate and invalidate every readable synthetic session, `deleteOwnedPrefix`, and verify zero
      remaining owned keys; dispose both client runtimes; close every Playwright page/context then await the
      `applicationBrowser` handle's `close`; `stopProcess` the frontend; `destroyOutageStore` (project, containers,
      volumes, temporary Compose directory).
- [ ] T039 Run from the repository root exactly: `pnpm --filter @pathableai/pre-ets-frontend build` then
      `node --test tests/bdd/session/shared-session-parent.manual.test.ts`. Record start time, safe action labels,
      semantic observations, and per-claim pass/fail in the scratch note; keep no transcript containing opaque values.
- [ ] T040 Remove the probe and verify absence of it and generated output:
      `rm -- tests/bdd/session/shared-session-parent.manual.test.ts`,
      `test ! -e tests/bdd/session/shared-session-parent.manual.test.ts`, `git status --short`, plus
      `docker compose ls --all` to confirm no owned probe project remains. Report any residue rather than calling the
      run clean.
- [ ] T041 Record the manual composed observation rows in [quickstart.md §7](./quickstart.md#7-implementation-results)
      using only revision, environment, safe action label, semantic observation, pass/fail, cleanup, and limitation,
      and explicitly retain the limits from
      [quickstart.md §Expected semantic result](./quickstart.md#expected-semantic-result): fixture identity is not real
      OIDC/provider freshness; clients are independent service/store scopes, not complete authenticated application
      instances; one bounded page/action is not comprehensive protection; no browser activity detection, cross-tab
      warning, continuation, recovery, accessibility, provider compatibility, distributed-clock, telemetry, or
      universal race claim.

**Checkpoint**: Composed manual evidence executed, probe deleted, owned infrastructure removed, results recorded.

---

## Phase 8: Polish & cross-cutting completion

**Purpose**: Repository quality gates, conditional current-behavior documentation, and evidence-record closure.

- [ ] T042 Only if T011, T018, T023, or T030 changed production behavior: record the current behavior in
      `docs/session-state.md` (and `docs/multi-tenancy.md` for tenant-policy changes) per
      [git-workflow.md §Artifacts](../../docs/engineering/git-workflow.md#artifacts). Otherwise make no documentation
      change; do not edit any other `specs/` directory.
- [ ] T043 Run the full deterministic suite once on the final revision:
      `pnpm --filter @pathableai/pre-ets-frontend-services test`, and, if any source or test changed after T013/T033/T039,
      rerun the affected integration, outage, or manual procedure so every recorded row is attributable to the final
      revision.
- [ ] T044 Run `pnpm lint`, then `pnpm format:write` only after lint fixes, then `pnpm format:check` and `pnpm lint`
      again until both pass.
- [ ] T045 Run `pnpm typecheck` and `pnpm build`.
- [ ] T046 Run `pnpm check:unused` and `pnpm check:health` for every scope, then `pnpm check:changes`. Fix introduced
      findings without suppressions, ignore patterns, baselines, `allowUnmatched`, or weaker thresholds; report
      pre-existing findings separately and ask for human review of any apparent false positive.
- [ ] T047 Stop any Redis the run started for T012 if it was not already running before the run
      (`docker compose stop redis`); leave a pre-existing shared service untouched.
- [ ] T048 Complete [quickstart.md §7](./quickstart.md#7-implementation-results): replace the `Pending` row with one
      row per executed boundary (US1 T013, US2 T019, US3 T024, US4 T031–T033, manual T039), and record the exact final
      revision, branch, date/time, host environment, and dependency/service versions from T001 immediately above the
      table. Confirm every V-001–V-012 maps to at least one executed boundary and semantic result, and that automated,
      real-infrastructure, and manual results remain distinct.
- [ ] T049 Tick the [quickstart.md §8](./quickstart.md#8-evidence-record-checklist) checklist items only where T048
      supports them, keeping the statement that passing checks are not human approval or full requirement
      verification and that PREETS-SESSION-006 AC2–3, PREETS-SESSION-008 protected HTTP/browser enforcement, and
      PREETS-SESSION-011 presentation remain with #154–#158.
- [ ] T050 Review the staged diff before commit: only intended source/test changes (if any), `quickstart.md` §7–§8,
      this `tasks.md`, and conditional `docs/` updates; no probe, scratch note, raw output, `.specify/feature.json`,
      credentials, references, keys, cookies, or records.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: none. T002 and T003 are parallel with each other after T001 begins.
- **Phase 2 (Conformance)**: depends on T002 for API drift. T004–T007 inspect different files; T008 depends on all
  of them and blocks every gap-closure task (T010, T011, T017, T018, T022, T023, T029, T030).
- **Phases 3–6 (US1–US4)**: depend on T008. Audits may start in parallel across stories. Real-Redis execution (T013)
  is shared: US2 and US4 reuse it unless their own gap closure changed integration scenarios.
- **Phase 7 (Manual)**: depends on Phases 3–6 being green, because it composes all four stories' capabilities and
  must run on the revision being recorded. T035→T036→T037→T038 edit one file sequentially; T039 depends on T038;
  T040 depends on T039; T041 depends on T040.
- **Phase 8 (Polish)**: T042 depends on any production change; T043 depends on all execution tasks; T044–T046 run on
  the final tree; T048–T049 depend on T043; T050 is last.

### User story dependencies

- **US1 (P1)**: independent after T008; needs a local Redis (T012).
- **US2 (P1)**: independent after T008; reuses T013 for real-Redis orderings.
- **US3 (P2)**: independent after T008; deterministic only.
- **US4 (P2)**: independent after T008; reuses T013 and owns the separate outage run (T033).

### Within each story

Audit the public-boundary evidence first; close only a named evidence gap; change production code only for a gap
named in T008, inside its owning parent or private child; execute; then record. All recording tasks
(T008, T014, T020, T025, T034, T041, T048, T049) write `quickstart.md` and therefore run sequentially.

### Parallel opportunities

- T002 ∥ T003.
- T004 ∥ T005 ∥ T006 ∥ T007 (read-only inspection of different files; T008 merges them).
- After T008: T009, T015, T016, T021, T026, T027, T028 are read-only audits and can run in parallel.
- T024 (US3 deterministic) can run while T012/T013 (US1 real Redis) run.
- T033 (outage suite) owns its own Compose project and loopback port, so it may run alongside T024, but not alongside
  T039, which also creates owned Docker projects and should be observed without contention.

---

## Parallel Example: after conformance (T008)

```bash
Task: "T009 [US1] Audit tests/integration/session-redis.test.ts for V-001–V-003"
Task: "T015 [US2] Audit tests/lib/session.test.ts for V-005–V-008"
Task: "T021 [US3] Audit tests/lib/tenant-policy.test.ts for V-004/V-012"
Task: "T027 [US4] Audit tests/integration/session-redis-outage.test.ts for V-010"
Task: "T028 [US4] Audit both reference-session-enforcement tests for V-010/V-011"
```

---

## Implementation Strategy

### MVP first (User Story 1)

1. Phase 1 baseline and declaration check.
2. Phase 2 conformance; stop on any authority-changing gap.
3. Phase 3: execute and record V-001–V-003 shared-state evidence.
4. Validate independently before continuing.

### Incremental delivery

US2 → US3 → US4 each add recorded evidence rows without changing earlier rows. The manual composed observation runs
once all four are green, followed by quality gates and the evidence checklist. If no conformance gap exists, the
implementation diff is expected to be `tasks.md` plus the `quickstart.md` §7–§8 evidence record.

### Traceability

| Claim | Automated evidence tasks     | Manual (Phase 7) | Gap-closure tasks |
| ----- | ---------------------------- | ---------------- | ----------------- |
| V-001 | T009, T013, T014             | T037 step 1      | T010, T011        |
| V-002 | T009, T013, T014             | T037 step 1      | T010, T011        |
| V-003 | T009, T013, T014, T016, T020 | T037 steps 1, 4  | T010, T011, T017  |
| V-004 | T021, T024, T025             | T036 policies    | T022, T023        |
| V-005 | T015, T019, T020             | T037 step 1      | T017, T018        |
| V-006 | T015, T016, T019, T020, T021 | T037 steps 2, 4  | T017, T018        |
| V-007 | T015, T016, T019, T020       | —                | T017, T018        |
| V-008 | T015, T019, T020             | T037 step 3      | T017, T018        |
| V-009 | T026, T031, T034             | T037 step 5      | T029, T030        |
| V-010 | T026, T027, T031, T033, T034 | T037 step 7      | T029, T030        |
| V-011 | T028, T031, T032, T034       | T037 steps 6–7   | T029, T030        |
| V-012 | T021, T024, T025             | T036 policies    | T022, T023        |

Module contracts: `TenantConfigService` → T004, T021–T025; `SessionService` → T005, T009–T020, T026–T027, T029–T031,
T033; `readSessionRequest` and runtime → T006, T028, T030, T032; module ownership → T007, T046. Intentionally reused
existing evidence: the delivered suites named in [quickstart.md §2–§4](./quickstart.md#2-deterministic-public-contract-evidence),
rerun on the exact revision rather than cited from prior child runs. Approved limitations: those in
[verification.md §Limitations](./verification.md#limitations-and-incomplete-claims), carried into T014, T020, T025,
T034, T041, and T049.

## Notes

- Observability: no claim; any temporary log/trace inspection used to diagnose a failure is not retained and becomes
  no durable assertion.
- Do not stop, pause, flush, or scan a shared Redis for outage evidence; only T033 and T039 stop owned stores.
- Do not commit the temporary probe, scratch notes, raw output, or `.specify/feature.json`.
