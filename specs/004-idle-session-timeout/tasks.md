---

## description: "Task list for tenant-configurable idle session timeout"

# Tasks: Tenant-Configurable Idle Session Timeout

**Input**: Design documents from `/specs/004-idle-session-timeout/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included — plan.md and FR-012 / SC-002–SC-004 require unit, contract/HTTP clock proof, and `@browser` / `@idle-session-timeout` BDD; Gherkin already drafted under `features/`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Frontend ownership: `packages/frontend/src/…`, `packages/frontend/tests/unit/…`
- Repo BDD: `features/`, `tests/bdd/steps/`, `cucumber.mjs`, root `package.json`
- Docs: `docs/session-state.md`, `docs/multi-tenancy.md`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Wire idle BDD discovery and confirm UI guidance before implementation

- [ ] T001 [P] Read installed `@pathableai/react` `agent-guidance/pathable-react/SKILL.md` and `references/server-and-client.md` (Modal client-boundary rules) before any recovery UI work
- [ ] T002 Register `@idle-session-timeout` feature discovery behind `CUCUMBER_IDLE=1` in `cucumber.mjs` for `features/idle-session-expiration.feature`, `features/idle-session-recovery.feature`, and `features/tenant-idle-timeout-policy.feature`, importing `tests/bdd/steps/idle.steps.ts` only when enabled (same pending-stub-safe pattern as OIDC)
- [ ] T003 [P] Add `pnpm test:bdd:idle` (and extend `test:bdd:dry` to include `CUCUMBER_IDLE=1`) in root `package.json` so default CI partitions do not fail on pending idle stubs

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Session/idle primitives and centralized enforcement that MUST exist before any user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Extend authenticated `SessionRecord` in `packages/frontend/src/lib/session/types.ts` with `idleDurationMinutes` (integer 5–30 fixed at authentication), `lastActivityAt` (Unix seconds), and `idleExpiresAt` (Unix seconds = `lastActivityAt + idleDurationMinutes * 60`); expand authenticated parser key-count allowlists to accept these fields and reject unknown keys
- [ ] T005 [P] Extend anonymous `SessionRecord` parsing in `packages/frontend/src/lib/session/types.ts` to allow optional `accessEndedCause: "inactivity"` (omit otherwise); anonymous records MUST NOT accept authenticated idle fields
- [ ] T006 [P] Add idle deadline helpers in `packages/frontend/src/lib/session/idle.ts` (`computeIdleExpiresAt`, `isIdleExpired`, `endSessionForInactivity`) enforcing: activity must not extend `expiresAt`; when `activityAt >= idleExpiresAt` deadline wins; missing store ≠ inactivity claim
- [ ] T007 Add store update/clear helpers in `packages/frontend/src/lib/session/store.ts` to clear authenticated + idle fields (or replace with anonymous tenant session), set `accessEndedCause: "inactivity"` on post-clearance anonymous record (consume-once per session end), and clear temporary session draft fields
- [ ] T008 Implement centralized authenticated idle+absolute gate in `packages/frontend/src/lib/session/setup.ts` (and export for handlers) requiring `now < idleExpiresAt`, `now < expiresAt`, tenant bind, and `userId` present before any protected authenticated outcome
- [ ] T009 [P] Unit-test parser allowlists and idle helpers in `packages/frontend/tests/unit/session-types.test.ts` and `packages/frontend/tests/unit/session-idle.test.ts`: reject-unknown; accept-new idle fields; anonymous unchanged (no idle fields); anonymous + consume-once cause; deadline math; no absolute TTL extension

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - End unattended authenticated access (Priority: P1) 🎯 MVP

**Goal**: Authoritative idle expiration ends authenticated access; qualifying activity renews idle deadline only; delayed/cross-tenant activity and missing store cannot revive or mislabel access

**Independent Test**: With an authenticated session and an approved tenant duration, attempt protected work before and at the inactivity deadline (including suspended browser). Demonstrate rejection through expired access independently of the modal. Authentication prerequisite (OIDC callback writing `userId` / `userName`) must be available.

### Tests for User Story 1

> **NOTE: Write these tests FIRST where practical; ensure they FAIL before implementation**

- [ ] T010 [P] [US1] Add unit coverage for activity acceptance/rejection and fail-closed store timeout in `packages/frontend/tests/unit/session-activity.test.ts` (accept deliberate activity before deadline; reject late activity; leave `expiresAt` / `idleDurationMinutes` unchanged; coalesce ~1s redundant writes)
- [ ] T011 [P] [US1] Add contract/HTTP clock tests proving denial at `idleExpiresAt`, late activity rejection, tenant isolation, and missing store ≠ inactivity in `packages/frontend/tests/unit/` (extend session-setup / proxy-oriented suites as appropriate—no public diagnostic endpoints)
- [ ] T012 [P] [US1] Scaffold Cucumber step defs for expiration scenarios in `tests/bdd/steps/idle.steps.ts` covering `@idle-session-timeout` tags from `features/idle-session-expiration.feature`

### Implementation for User Story 1

- [ ] T013 [US1] Stamp idle fields at authentication in `packages/frontend/src/lib/oidc/callback.ts`: set `idleDurationMinutes` from effective tenant policy (default **30** when omitted until US3 lands full parse), `lastActivityAt` = auth time, `idleExpiresAt` = auth time + duration; do not extend absolute `expiresAt`
- [ ] T014 [US1] Enforce idle expiry on authenticated Proxy short-circuit and session reuse in `packages/frontend/src/proxy.ts` and `packages/frontend/src/lib/session/setup.ts` so protected authenticated outcomes fail closed at/after `idleExpiresAt` independently of browser timers
- [ ] T015 [US1] Implement `recordQualifyingActivity` Server Action or Route Handler under `packages/frontend/src/app/` (e.g. `packages/frontend/src/app/(app)/session/activity/route.ts` or colocated server action): same-tenant authenticated cookie only; deny missing/mismatch/unauthenticated/`at >= idleExpiresAt`/`at >= expiresAt`; on accept update `lastActivityAt` / `idleExpiresAt` only; coalesce ~1s; store failure fails closed; no public diagnostic route
- [ ] T016 [US1] Add client activity-capture island in `packages/frontend/src/components/session/idle-activity-island.tsx` that reports only deliberate `keydown` / `pointerdown` / `touchstart` / scroll; MUST NOT report passive reading, polling, prefetch, or automated keepalives; client debounce MUST NOT create grace past `idleExpiresAt`
- [ ] T017 [US1] Mount activity island for authenticated `(app)` UI in `packages/frontend/src/app/(app)/layout.tsx` (or equivalent authenticated shell) without moving unrelated SSR data loading into the client
- [ ] T018 [US1] Wire expiration BDD steps in `tests/bdd/steps/idle.steps.ts` and verify `@contract` / clock scenarios from `features/idle-session-expiration.feature` for shared-tab renewal, independent sessions, and delayed activity no-revival

**Checkpoint**: User Story 1 is fully functional and independently testable (denial without requiring the recovery modal)

---

## Phase 4: User Story 2 - Understand expiration and log in again (Priority: P1)

**Goal**: While authenticated UI is running, client revalidation confirms inactivity with the server, clears protected content and temporary drafts, presents an accessible PathAble Modal with “Log in again”, and syncs shared-session tabs without inventing cause from client timers

**Independent Test**: While authenticated UI remains open, confirm client-driven revalidation discovers server-confirmed inactivity without relying on a later full navigation; use the modal by keyboard/AT; complete reauthentication; verify temporary session data cleared and protected content removed. Client timing alone must never grant continued access.

### Tests for User Story 2

- [ ] T019 [P] [US2] Add unit/contract coverage for confirm/read + cause consume-once and non-inactivity failure stance in `packages/frontend/tests/unit/session-recovery.test.ts`
- [ ] T020 [P] [US2] Extend `tests/bdd/steps/idle.steps.ts` for `features/idle-session-recovery.feature` (`@browser` modal focus/keyboard, running-app expiry without full navigation, multi-tab both show inactivity explanation, login-again cancel/fail)

### Implementation for User Story 2

- [ ] T021 [US2] Implement authenticated same-tenant session confirm/read handler in `packages/frontend/src/app/(app)/session/status/route.ts` (or server action): return authenticated-still-valid vs ended-with-`inactivity` vs ended-without-inactivity vs transport/store failure; consume `accessEndedCause` once per session end on recovery UI read; no full session diagnostic dump
- [ ] T022 [US2] Implement inactivity recovery client island in `packages/frontend/src/components/session/inactivity-recovery-island.tsx`: required non-authoritative revalidation (deadline-aligned and/or `visibilitychange`/`focus`); on server-confirmed inactivity remove protected content, open PathAble `Modal`, broadcast `inactivity-confirmed` on `BroadcastChannel`; on transport/5xx retry without claiming inactivity; never grant access past `idleExpiresAt`
- [ ] T023 [P] [US2] Implement PathAble `Modal` recovery UI in `packages/frontend/src/components/session/inactivity-ended-modal.tsx` with meaningful accessible name/explanation that inactivity ended the session (MAY note unsaved temporary work cleared); primary button accessible name **“Log in again”**; focus moves into modal and stays usable; keyboard-operable; no advance-warning/countdown/extend control
- [ ] T024 [US2] Wire recovery island + SSR cause presentation into `packages/frontend/src/app/(app)/layout.tsx` and/or `packages/frontend/src/app/(app)/page.tsx` so document load with retained cause can also present Modal while Server Components keep session/tenant reads
- [ ] T025 [US2] On “Log in again”, start originating tenant OIDC initiation (existing journey via `packages/frontend/src/lib/oidc/initiate.ts` / Proxy); cancel/fail leaves access dead with retry (`packages/frontend/src/app/login-unavailable/page.tsx` and/or re-shown Modal); success creates **new** authenticated session with current policy and MUST NOT restore cleared drafts or revive expired access
- [ ] T026 [US2] Handle shared-session sibling tabs in `packages/frontend/src/components/session/inactivity-recovery-island.tsx`: first successful server inactivity confirmation notifies siblings via `BroadcastChannel` `inactivity-confirmed`; siblings clear content and open inactivity Modal from that established signal without requiring Redis cause still present after consume-once
- [ ] T027 [US2] Complete recovery BDD wiring in `tests/bdd/steps/idle.steps.ts` for running-app revalidation, a11y keyboard path, multi-tab sync, and login-again / IdP SSO new-session rules from `features/idle-session-recovery.feature`

**Checkpoint**: User Stories 1 and 2 both work independently (expiration denial + accessible recovery)

---

## Phase 5: User Story 3 - Apply an approved tenant timeout (Priority: P2)

**Goal**: Optional tenant `idleTimeoutMinutes` (whole minutes 5–30) from trusted env JSON governs new authenticated sessions; invalid explicit values fail closed; policy changes do not mutate existing sessions

**Independent Test**: Establish a permitted tenant choice through the existing trusted config process (env JSON + restart); prove it governs access after a new session begins; attempt invalid and cross-tenant changes. No new administration application.

### Tests for User Story 3

- [ ] T028 [P] [US3] Unit-test `idleTimeoutMinutes` parse bounds in `packages/frontend/tests/unit/tenant-idle-policy.test.ts`: omitted → effective 30; integers 5–30 inclusive accepted; fractional, `<5`, `>30`, non-integer, boolean/string disable, `null` fail closed without substituting 30
- [ ] T029 [P] [US3] Scaffold/wire policy scenarios in `tests/bdd/steps/idle.steps.ts` for `features/tenant-idle-timeout-policy.feature` (Springfield vs Shelbyville isolation; policy fixed at auth; login-again uses new policy)

### Implementation for User Story 3

- [ ] T030 [US3] Extend `TenantConfig` in `packages/frontend/src/lib/tenant/types.ts` with optional `idleTimeoutMinutes` (`number | omitted`): when present MUST be safe integer, whole minutes, **5–30 inclusive**; when omitted effective policy **30** for new authenticated sessions; explicit invalid values make the tenant record unusable at the trusted config boundary—do not substitute 30; disablement is not a representable stored value
- [ ] T031 [US3] Export effective idle duration resolver (omit → 30) from `packages/frontend/src/lib/tenant/` and use it in `packages/frontend/src/lib/oidc/callback.ts` so new sessions copy `idleDurationMinutes` at auth; existing Redis sessions retain prior `idleDurationMinutes` when config changes after process restart
- [ ] T032 [US3] Document optional `idleTimeoutMinutes` and restart reload semantics in `docs/multi-tenancy.md` (trusted env JSON process; no new admin UI)
- [ ] T033 [US3] Complete policy BDD assertions in `tests/bdd/steps/idle.steps.ts` for whole-minute 5–30 choices, reject-above-ceiling/disable, and invalid explicit config fail-closed from `features/tenant-idle-timeout-policy.feature`

**Checkpoint**: All three user stories independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, regression, and delivery validation across stories

- [ ] T034 [P] Update `docs/session-state.md` with idle fields, qualifying activity rules, authoritative enforcement, cause labeling, consume-once + BroadcastChannel multi-tab latch, and absolute-vs-idle independence
- [ ] T035 [P] Confirm `docs/multi-tenancy.md` idle policy notes match shipped behavior (cross-check T032)
- [ ] T036 Run regression `pnpm test:bdd:session` and `pnpm test:bdd:oidc` after Proxy/session touchpoints; keep partitions green on delivery PR
- [ ] T037 [P] Run frontend unit suite `pnpm --filter @pathableai/pre-ets-frontend test:unit` and idle BDD dry-run `pnpm test:bdd:dry` / `pnpm test:bdd:idle` per `specs/004-idle-session-timeout/quickstart.md`
- [ ] T038 Run root quality gates via scripts in `package.json` (`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm check:unused`) for touched workspaces under `packages/frontend/`
- [ ] T039 [P] Surface release checklist items (do not invent product claims): D-001/FR-011 policy approval memo, D-005/SC-005 workflow thresholds, D-006 delivery appetite — track outside Spec Kit per quickstart; observability metrics remain deferred out of scope

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP; no dependency on US2/US3 (may use default 30 until US3)
- **User Story 2 (Phase 4)**: Depends on Foundational; practically builds on US1 enforcement + cause-setting side effects
- **User Story 3 (Phase 5)**: Depends on Foundational; can proceed after or in parallel with US2 once US1 auth stamping exists; completes configurable policy
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational — independently testable via authoritative denial without modal
- **User Story 2 (P1)**: After Foundational + US1 idle clearance/`accessEndedCause` path — independently testable via running-app revalidation + Modal
- **User Story 3 (P2)**: After Foundational — independently testable via env JSON policy + new-session duration; integrates with US1 callback stamping

### Within Each User Story

- Tests (where included) should fail before implementation where practical
- Models/parsers before services/handlers
- Server authority before client islands
- Story complete before treating next priority as done

### Parallel Opportunities

- T001 / T003 in Setup; T004 sequential with T005–T006 parallel after types shape agreed
- T009 foundational unit tests after T004–T006
- After Foundational: US1 test tasks T010–T012 in parallel; US2 tests T019–T020 and US3 tests T028–T029 can start once interfaces stabilize
- T023 Modal UI can proceed in parallel with T021 confirm/read once island contract is agreed
- T034 / T035 / T039 documentation tasks in parallel during Polish

---

## Parallel Example: User Story 1

```bash
# Launch US1 test scaffolds together:
Task: "Add unit coverage for activity acceptance/rejection in packages/frontend/tests/unit/session-activity.test.ts"
Task: "Add contract/HTTP clock tests for idle denial in packages/frontend/tests/unit/"
Task: "Scaffold Cucumber step defs in tests/bdd/steps/idle.steps.ts for idle-session-expiration.feature"

# After foundational types exist, implementation sequence:
Task: "Stamp idle fields in packages/frontend/src/lib/oidc/callback.ts"
Task: "Enforce idle on packages/frontend/src/proxy.ts and setup.ts"
Task: "Implement activity handler under packages/frontend/src/app/(app)/session/"
```

---

## Parallel Example: User Story 2

```bash
# Tests in parallel:
Task: "session-recovery unit/contract tests in packages/frontend/tests/unit/session-recovery.test.ts"
Task: "Recovery BDD steps in tests/bdd/steps/idle.steps.ts for idle-session-recovery.feature"

# UI + server confirm can fork after confirm contract is sketched:
Task: "confirm/read handler in packages/frontend/src/app/(app)/session/status/route.ts"
Task: "InactivityEnded Modal in packages/frontend/src/components/session/inactivity-ended-modal.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (authoritative idle end + activity renewal)
4. **STOP and VALIDATE**: Denial at deadline without modal; unit + contract clocks
5. Demo/ship MVP if delivery appetite allows; then add US2 recovery UX

### Incremental Delivery

1. Setup + Foundational → idle primitives ready
2. Add User Story 1 → Test independently → MVP
3. Add User Story 2 → Test independently → accessible recovery
4. Add User Story 3 → Test independently → tenant-configurable durations
5. Polish docs + regression partitions

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (enforcement + activity)
   - Developer B: User Story 2 (Modal + revalidation) after cause-clearance API from A
   - Developer C: User Story 3 (tenant policy parse) in parallel with B once callback stamp hook exists
3. Integrate and run quickstart validation order

---

## Notes

- [P] tasks = different files, no incomplete-task dependencies
- [Story] label maps task to US1/US2/US3 for traceability
- Server is sole authority for `idleExpiresAt`; client revalidation never grants access
- No new admin app, backend session store, advance-warning/extend UI, or observability metrics in this slice
- Release claims remain gated by D-001, D-005, and D-006 (T039)
- Commit after each task or logical group when implementing (`/speckit-implement`)
- Avoid: vague tasks, same-file conflicts, treating missing Redis as inactivity
