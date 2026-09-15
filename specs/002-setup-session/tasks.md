# Tasks: Set Up a Session

**Input**: `specs/002-setup-session/spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/session-setup.md`, and `quickstart.md`.
**Organization**: Shared setup and foundations, then US1 (P1 MVP), US2 (P1), US3 (P2), and polish/evidence.
**Tests**: Required by Principle V, the approved plan, and the session contracts. Write failing unit/contract assertions and complete pending Cucumber steps before treating runtime behavior as verified; dry-run discovery alone is not acceptance.
**Branch**: `002-setup-session-tasks` (targets `002-setup-session-plan`).

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Pin session dependencies and introduce Redis-only local Compose without enabling Proxy session routing yet.

- [ ] T001 Add and pin frontend runtime dependencies `redis` and `jose` in `packages/frontend/package.json` and the root `pnpm-lock.yaml`; keep versions compatible with Node >=24 / ESM. Do not import them from `proxy.ts` module top-level in a way that requires secrets at build time. Validate repository gates and commit this tool setup separately from Compose docs.
- [ ] T002 Create Redis-only `compose.yaml` at the repository root with official image `redis:8.2.9`, publish `127.0.0.1:6379:6379` only, add a ping healthcheck, and start no frontend/backend/Postgres/broker services. Update `docs/docker-compose.md` and README pointers in the same focused commit so docs describe the Redis-only layout that actually exists (FR-009, SC-005).
- [ ] T003 [P] Extend `packages/frontend/.env.example` with non-secret placeholders and comments for `REDIS_URL` (loopback example `redis://127.0.0.1:6379`; non-local requires TLS + ACL/mTLS), `SESSION_SIGNING_SECRET` (no usable embedded key), `SESSION_TTL_SECONDS` default `86400`, `SESSION_STORE_TIMEOUT_MS` default `2000`, and optional `SESSION_KEY_PREFIX`. Document generation of the signing secret with the `node -e` one-liner from `specs/002-setup-session/quickstart.md` (FR-010).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Session module seams, lazy configuration, and mode-aware tenant operations that every story requires. **No user story Proxy enablement until this phase is complete.** Prefer landing CI Redis + synthetic session env (T010) before any merge that routes `/` through `setupSession` on the default test path.

- [ ] T004 Write failing unit cases in `packages/frontend/tests/unit/session-types.test.ts` for the exact record/claim/config rules in T005–T006: id is 32 random bytes as unpadded base64url (43 characters); record JSON is exact `{ tenantId, expiresAt }` only; `expiresAt` / cookie `exp` are future Unix seconds on the application clock; cookie claims are exactly `sid` / `tenant` / `exp`; reject unexpected application claims, wrong types, duplicate cookie names, and non-positive/non-representable TTL without comparing `SESSION_TTL_SECONDS` to `SESSION_STORE_TIMEOUT_MS` as integers (FR-006, FR-007).
- [ ] T005 Define readonly session types and lazy config validation in `packages/frontend/src/lib/session/types.ts`: production Redis key suffix rules; cookie name `pathable-session`; attributes `Path=/`, `HttpOnly`, `SameSite=Lax`, no `Domain`, `Secure` outside development; absolute `Expires` matching `exp`; `REDIS_URL` loopback-vs-TLS+auth rules; `SESSION_SIGNING_SECRET` “Required base64url encoding of at least 32 random bytes; no committed default”; `SESSION_TTL_SECONDS` “Provisional fixed default `86400` … no sliding renewal”; `SESSION_STORE_TIMEOUT_MS` “`2000`; finite positive integer within the Node timer-safe range”; optional `SESSION_KEY_PREFIX` default `pre-ets:session:`. Parse lazily on first use—not at module import—so clean-checkout `pnpm build` / `pnpm typecheck` succeed without secrets (FR-006, FR-007, FR-010).
- [ ] T006 [P] Implement HS256 cookie sign/verify in `packages/frontend/src/lib/session/cookie.ts` using `jose`: protected header `alg: HS256` + `typ: JWT`; emit only `sid`/`tenant`/`exp`; reject invalid signatures/algorithms, wrong claim shapes, unexpected claims, and expired tokens (`expiration at equality; no clock tolerance extending lifetime`) without Redis lookup (FR-006, FR-007). Make T004 cookie cases pass.
- [ ] T007 Write failing Redis adapter cases in `packages/frontend/tests/unit/session-store.test.ts` (constructor-injected prefix allowed) covering `read` missing/unusable vs transport failure, `create` via `SET NX EXAT`, collision handling (one retry then controlled failure), shared in-flight connect promise, failed-init reset, disabled offline queue, 2s deadline, and non-adoption of client-supplied ids after write-timeout (FR-005, FR-008).
- [ ] T008 Implement the store in `packages/frontend/src/lib/session/store.ts`: lazy single client with shared in-flight connect promise; `read(id)` / `create(id, record)`; atomic `SET NX EXAT` using application-clock Unix seconds; no record/negative caching; reset failed initialization; reject non-local cleartext Redis; never log credential-bearing URLs or record bodies (FR-005, FR-008). Make T007 pass against real local Redis where the suite provisions it.
- [ ] T009 Implement ordered `setupSession(request)` in `packages/frontend/src/lib/session/setup.ts` and the server-only request accessor export surface in `packages/frontend/src/lib/session/index.ts`. Accept narrow cookie/store/clock/id/tenant operation seams for direct tests. Enforce: inspect/verify cookie → await candidate read → mode-aware tenant validate → reuse only when cookie tenant = stored tenant = validated tenant and expiry agrees → otherwise fresh id + persist before cookie → typed terminal outcomes for 403/500/503. Never mutate/delete foreign records; never adopt presented ids on create; emit only safe outcome classes `reuse` | `create` | `403` | `500` | `503` (FR-001–FR-004, FR-008, FR-012).
- [ ] T010 Provision Redis and synthetic `REDIS_URL` / `SESSION_SIGNING_SECRET` / unique `SESSION_KEY_PREFIX` (or isolated DB) in `.github/workflows/ci-bdd.yml` for jobs that run `pnpm test:bdd` and `pnpm test:bdd:session` (`CUCUMBER_SESSION=1`). Extend path filters to include `packages/frontend/src/**` (especially `proxy.ts` and `lib/session/**`). Do not edit a non-existent root `ci.yml` (FR-009, FR-010).
- [ ] T011 Extract transport-independent, mode-aware tenant operations inside `packages/frontend/src/lib/tenant/` (refactor `dev.ts` / `prod.ts` / `index.ts` as needed): host mode binds trusted `Host`; development static mode resolves `TENANT_LOCAL_CONFIG_JSON` without Host binding; production always uses host mode and never imports static config. Preserve existing rejection and static-mode guidance semantics for later Proxy adapters (FR-002, FR-011).

**Checkpoint**: Session types/cookie/store/setup unit contracts pass; clean tree builds without secrets; CI can reach Redis; tenant operations are callable without `forbidden()`-only adapters.

---

## Phase 3: User Story 1 — Start and continue a tenant session (Priority: P1) 🎯 MVP

**Goal**: First visit creates a tenant-bound session before SSR; revisits reuse it; continuity survives frontend restart while Redis remains available.
**Independent Test**: Open a known tenant without a cookie, revisit with the returned cookie, restart only the frontend with a preserved cookie jar, and confirm the same session id/tenant (SC-001, SC-003).

### Tests for User Story 1

- [ ] T012 [P] [US1] Add failing setup-ordering and continuity unit cases in `packages/frontend/tests/unit/session-setup.test.ts`: cookie inspection/read completes before tenant operation; persistence precedes cookie issuance; same-request repeated access creates once; matching live session is reused unchanged with no sliding renewal; clock-controlled default/`86400` and custom TTL alignment of cookie `exp`, record `expiresAt`, and Redis `EXAT` (FR-001–FR-007, SC-001).
- [ ] T013 [P] [US1] Replace pending US1 stubs in `tests/bdd/steps/session.steps.ts` for `features/session-continuity.feature` with failing assertions over real HTTP/browser evidence; tag lifecycle cases that need a real jar with `@browser`; preserve cookie jar (or capture/replay) across frontend restart; keep `@production` Secure/header proofs distinct from HTTP browser continuity (SC-001, SC-003).

### Implementation for User Story 1

- [ ] T014 [US1] Create `packages/frontend/src/proxy.ts` matching `/` including real Next 16.3.5 RSC requests for that page; strip caller `x-pathable-session-context` and every `x-preets-tenant-*`; call `setupSession`; on success forward exactly `x-pathable-session-context` (compact ASCII JSON `{sessionId,tenantId,expiresAt}`), `x-preets-tenant-slug`, and `x-preets-tenant-origin` (`host-associated` | `local-static`) via `NextResponse.next({ request: { headers } })`; set response cookie only on create/replace; map typed failures to 403 `Access denied.` / 500 / 503 `Service unavailable.` with `Cache-Control: private, no-store`; never put context on response headers. Prove matcher participation for `/` RSC early in this slice (FR-001–FR-003, FR-008, FR-011).
- [ ] T015 [US1] Apply the **Supersedes** Refusal update in `specs/001-tenant-resolution/contracts/tenant-context.md` for Proxy-matched `/` routes; keep dual-layer regression coverage with layout `forbidden()` for non-participating routes (plan Compatibility section).
- [ ] T016 [US1] Rename `packages/frontend/src/app/(tenant)/` → `(app)/` and `TenantLayout` → `AppLayout` in this delivery slice only; update imports/tests under `packages/frontend/tests/**`, BDD path/step references, and path mentions in `specs/001-tenant-resolution/**`, `specs/002-setup-session/**`, README, `docs/multi-tenancy.md`, and `docs/session-state.md` listed in `plan.md`. `AppLayout` consumes the server-only session accessor, loads `tenantConfig` from the tenant source via `tenantId` (not headers), and fails closed on missing/malformed context without creating sessions or setting cookies (FR-011, FR-012).
- [ ] T017 [US1] Run US1 cases from `features/session-continuity.feature` via `pnpm test:bdd:session`; prove first-visit create, revisit reuse, restart continuity, fixed lifetime, production cookie flags, asset exclusion, and Display Name preservation. Record evidence gaps vs claims in `specs/002-setup-session/quickstart.md` Lifecycle checklist (SC-001, SC-003).

**Checkpoint**: US1 scenarios pass independently; tenant page still renders Display Name with zero extra visitor actions.

---

## Phase 4: User Story 2 — Recover safely from missing or unusable sessions (Priority: P1)

**Goal**: Unusable cookies/records start fresh sessions for the validated tenant; cross-tenant state is never exposed; store outages fail closed with 503 and no new cookie.
**Independent Test**: Exercise missing/malformed/expired/unknown/cross-tenant cookies and Redis stop/start against known and unknown hosts (SC-002, SC-004).

### Tests for User Story 2

- [ ] T018 [P] [US2] Add failing recovery/isolation unit cases in `packages/frontend/tests/unit/session-setup.test.ts` and `packages/frontend/tests/unit/session-response.test.ts`: every unusable-reference row; cookie/record tenant mismatch leaves the foreign record byte-for-byte unchanged; invalid/unknown host returns 403 with no write/cookie when store is available; read and write failures independently yield bounded 503; write-timeout retry may mint a new sid; forged `x-pathable-session-context` / `x-preets-tenant-*` cannot skip checks or choose ids (FR-002–FR-004, FR-008, SC-002, SC-004).
- [ ] T019 [P] [US2] Replace pending US2 stubs in `tests/bdd/steps/session.steps.ts` for `features/session-recovery.feature` with failing real HTTP/store assertions, including removed-tenant denial and storage failure/recovery outlines (SC-002, SC-004).

### Implementation for User Story 2

- [ ] T020 [US2] Complete recovery behavior in `packages/frontend/src/lib/session/setup.ts` and Proxy adapters in `packages/frontend/src/proxy.ts` so all T018/T019 cases pass: treat mismatch/expiry/malformed as missing; never expose or reassign foreign records; retain Access denied for invalid/unknown tenants when storage is available; accept that outage may 503 before invalid-host 403; after recovery, unknown tenants again return 403 (FR-002, FR-004, FR-008).
- [ ] T021 [US2] Run all US2 cases from `features/session-recovery.feature` through `pnpm test:bdd:session` and record isolation/failure/recovery evidence in `specs/002-setup-session/quickstart.md` (SC-002, SC-004).

**Checkpoint**: US1 and US2 both pass; no cross-tenant leakage in HTTP or Redis fixtures.

---

## Phase 5: User Story 3 — Run sessions locally (Priority: P2)

**Goal**: Developers start Redis via Compose, configure the host-run frontend from docs, and verify host-associated and static local modes plus Redis stop/start failure/recovery.
**Independent Test**: From a clean checkout, follow README/quickstart to create and reuse a session without a hosted Redis account (SC-005).

### Tests for User Story 3

- [ ] T022 [P] [US3] Replace pending US3 stubs in `tests/bdd/steps/session.steps.ts` for `features/local-session-development.feature` with failing assertions for documented Compose startup, loopback publish, host + static local continuity, Redis stop 503, Redis restart recovery, and production bypass denial on localhost (FR-009–FR-011, SC-004, SC-005).

### Implementation for User Story 3

- [ ] T023 [US3] Finish local developer documentation in README, `docs/docker-compose.md`, `docs/session-state.md`, and `packages/frontend/.env.example`: startup (`docker compose up -d --wait redis`), ping verification, `.env.local` settings, host `springfield.localhost` and static `localhost` flows, shutdown (`docker compose down`), and explicit “never `FLUSHALL`” cleanup guidance (FR-009, FR-010, SC-005).
- [ ] T024 [US3] Ensure BDD/process fixtures in `tests/bdd/support/server.ts` and `tests/bdd/support/hooks.ts` inject unique `SESSION_KEY_PREFIX` (or isolated DB) into spawned frontend environments, track scenario-owned keys, delete only that namespace, supply synthetic session settings to tenant cases that now need Redis, and preserve cookie jars across owned-process restart (FR-005, FR-010).
- [ ] T025 [US3] Run all US3 cases from `features/local-session-development.feature` via `pnpm test:bdd:session` and complete the SC-005 local-setup checklist entries in `specs/002-setup-session/quickstart.md`.

**Checkpoint**: Clean-checkout local docs path works; host and static modes both establish sessions; Redis stop/start matches Story 2 failure semantics.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T026 [P] Synchronize `docs/session-state.md` and `docs/multi-tenancy.md` with implemented ordering (lookup before tenant resolution; host/tenant validation before accept/persist), provisional fixed 86,400s lifetime / no sliding renewal, Proxy cookie-before-SSR boundary, exact header set, and named follow-up for clear-session timeout / capacity policy. Keep authentication and signing-key rotation marked as future work.
- [ ] T027 Ensure `.github/workflows/ci-bdd.yml` runs `pnpm test:bdd:session` (or `CUCUMBER_SESSION=1`) in addition to `pnpm test:bdd`, with Redis + synthetic env already present from T010; confirm path filters cover session source changes.
- [ ] T028 Run `pnpm test:bdd:dry`, `pnpm --filter @pathableai/pre-ets-frontend test:unit`, `pnpm test:bdd:session`, and full `pnpm test:bdd`; require pending/undefined session steps to be gone for implemented scenarios, separate reports, and no skipped tenant coverage merely because session infra is required. Record counts and limitations in `specs/002-setup-session/quickstart.md`.
- [ ] T029 Run `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm check:unused`, and `git diff --check` from the root (plus explicit dprint on `specs/002-setup-session` if needed). Confirm clean-checkout build/typecheck still pass without session secrets. Investigate findings; apply lint fixes before formatting; do not commit generated Cucumber reports.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories. T004 before T005–T006; T007 before T008; T009 after cookie+store seams; T011 before Proxy enablement; T010 before merging default-path `setupSession` routing.
- **User Story 1 (Phase 3)**: Depends on Foundational. MVP = Setup + Foundational + US1.
- **User Story 2 (Phase 4)**: Depends on Foundational; practically follows US1 because it extends the same Proxy/`setupSession` path, but keeps its own acceptance fixtures.
- **User Story 3 (Phase 5)**: Depends on Foundational and Compose from Setup; docs/fixtures can proceed once US1 HTTP path exists for local continuity checks.
- **Polish (Phase 6)**: Depends on desired stories being complete.

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependency on US2/US3 for MVP demo of create/reuse/restart.
- **US2 (P1)**: After Foundational — shares Proxy/setup with US1; independently testable via `features/session-recovery.feature`.
- **US3 (P2)**: After Foundational + Compose — independently testable via `features/local-session-development.feature` and documented clean-checkout path.

### Within Each User Story

- Tests MUST fail before implementation.
- Models/types and store/cookie seams before orchestration.
- Orchestration before Proxy/AppLayout integration.
- Story checkpoint before moving to the next priority when staffing is sequential.

### Parallel Opportunities

- T003 can run beside T001–T002 once dependency pinning strategy is agreed.
- T006 cookie implementation can proceed in parallel with T007–T008 store work after T005 types exist.
- T012 unit tests and T013 Cucumber stubs edit different files.
- T018 unit/response tests and T019 Cucumber stubs edit different files.
- T022 Cucumber stubs and T023 docs edit different files.
- T026 docs sync can run beside T027 CI script verification.
- Do **not** parallelize writers on shared `setup.ts`, `proxy.ts`, or `session.steps.ts`.

---

## Parallel Example: User Story 1

```bash
# After Foundational completes, launch US1 test authoring together:
Task: "Add failing setup-ordering and continuity unit cases in packages/frontend/tests/unit/session-setup.test.ts"
Task: "Replace pending US1 stubs in tests/bdd/steps/session.steps.ts for features/session-continuity.feature"

# Then implement Proxy → rename/AppLayout → run session BDD sequentially.
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — includes CI Redis before default-path enablement)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE** create/reuse/restart via quickstart Lifecycle checks
5. Demo internally; do not claim deployment readiness

### Incremental Delivery

1. Setup + Foundational → session seams and CI Redis ready
2. US1 → transparent create/reuse/restart (MVP)
3. US2 → isolation and controlled store failure
4. US3 → documented local Compose developer path
5. Polish → strategy docs, full suite, repository gates

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. After Foundational:
   - Developer A: US1 Proxy/AppLayout/continuity
   - Developer B: US2 recovery fixtures/assertions (coordinate on `setup.ts` / `proxy.ts`)
   - Developer C: US3 docs and process isolation fixtures
3. Join before Phase 6 full-suite gate

---

## Requirement coverage index

| Requirements / outcomes | Primary tasks                    |
| ----------------------- | -------------------------------- |
| FR-001–FR-004, SC-001   | T009, T012–T017, T018–T021       |
| FR-005, SC-003          | T007–T008, T013, T017, T024      |
| FR-006–FR-007           | T004–T006, T012, T014, T017      |
| FR-008, SC-002, SC-004  | T007–T009, T018–T021, T022, T025 |
| FR-009–FR-010, SC-005   | T001–T003, T010, T022–T025, T027 |
| FR-011                  | T011, T014–T017, T020, T022–T025 |
| FR-012                  | T009, T016, T026                 |

---

## Notes

- [P] = different files, no incomplete-task dependency within the marked set.
- [USn] maps to spec user stories for traceability.
- Pending BDD steps must remain reported as pending until implemented—never count dry-run discovery as runtime verification.
- Capacity/rate/clear-timeout policy and signing-key rotation stay out of scope; do not invent them in these tasks.
- Rollback reminder: if session-setup 503s block tenant pages after enablement, revert Proxy/session integration; Redis-only Compose may remain.
