# Tasks: Tenant-Configurable Idle Session Timeout

**Input**: `specs/004-idle-session-timeout/spec.md`, `plan.md`, `research.md`, `data-model.md`,
`contracts/` (`idle-expiration.md`, `inactivity-recovery.md`, `tenant-idle-policy.md`), and
`quickstart.md`.
**Organization**: Shared setup and foundations (incl. Phase A dual-read), then US1 (P1 MVP),
US2 (P1), US3 (P2), and polish.
**Tests**: Required by Principle V, the approved plan/quickstart, and existing idle Gherkin with
pending steps. Write failing unit/contract assertions and complete Cucumber steps before treating
runtime behavior as verified; dry-run discovery alone is not acceptance. Treat Gherkin
“Unsent practice note” as a **client-only protected UI fixture**—**no** Redis draft keys in this
slice.
**Branch**: implement on a delivery branch targeting the plan (e.g. from
`004-idle-session-timeout-plan` or `004-idle-session-timeout` once tasks land).

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the idle BDD pending stub **before** runner wiring, mirror the OIDC
`CUCUMBER_*` partition pattern, and update discovery-status docs. Prefer one focused setup commit
for stub + `cucumber.mjs` + `package.json` + `features/README.md`.

- [ ] T001 [P] Read installed `@pathableai/react` `agent-guidance/pathable-react/SKILL.md` and
      `references/server-and-client.md` (Modal client-boundary rules) before any recovery UI work
      (quickstart PathAble note; FR-009).
- [ ] T002 Create a **pending stub** `tests/bdd/steps/idle.steps.ts` (Pending-safe bindings for
      `@idle-session-timeout` steps) **before** registering it in Cucumber—same pending-stub-safe
      pattern as OIDC `oidc.steps.ts` (Copilot ordering: stub → register → scripts).
- [ ] T003 Register `@idle-session-timeout` feature discovery behind `CUCUMBER_IDLE=1` in
      `cucumber.mjs` for `features/idle-session-expiration.feature`,
      `features/idle-session-recovery.feature`, and `features/tenant-idle-timeout-policy.feature`,
      importing `tests/bdd/steps/idle.steps.ts` only when enabled (depends on T002).
- [ ] T004 Add `pnpm test:bdd:idle` (`CUCUMBER_IDLE=1` + tags `@idle-session-timeout`) and extend
      `test:bdd:dry` to include `CUCUMBER_IDLE=1` in root `package.json` so default CI partitions do
      not fail on pending idle stubs (parallel to `test:bdd:oidc` / `CUCUMBER_OIDC`).
- [ ] T005 Update idle execution-status notes in `features/README.md` (currently states no step
      scaffolds/runner wiring) to document `CUCUMBER_IDLE=1`, `pnpm test:bdd:idle`, dry-run
      discovery, and pending-stub safety after T002–T004.

**Checkpoint**: `CUCUMBER_IDLE=1 pnpm exec cucumber-js --dry-run` (or `pnpm test:bdd:idle -- --dry-run`)
discovers idle features against the pending stub; default `pnpm test:bdd` still omits idle.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Idle-aware session/context shapes, explicit serialize round-trip, Phase A dual-read +
`legacyAuthenticated` reject, atomic store CAS primitives, `guard.ts` + `getRequestSession`
re-read, and setup recovery-signal seams every story needs. **Do not enable Phase B idle-shaped
authenticated writes or Proxy idle enforcement until this phase is complete.**

- [ ] T006 Write failing unit cases in `packages/frontend/tests/unit/session-types.test.ts` for:
      authenticated idle fields (`idleDurationMinutes` integer **5–30**, `lastActivityAt`,
      `idleExpiresAt`); anonymous optional `accessEndedCause: "inactivity"` +
      `sessionEndGeneration`; required authenticated `SessionContext.idleExpiresAt` while retaining
      `expiresAt`; reject-unknown; anonymous unchanged (no idle auth fields); **explicit
      `serializeSessionRecord` / parse round-trip** for new idle + cause/latch fields; dual-read
      discriminant `legacyAuthenticated: true` for four-key authenticated JSON (data-model E3 /
      rollout).
- [ ] T007 Extend `packages/frontend/src/lib/session/types.ts`: authenticated `SessionRecord` idle
      fields; anonymous cause/latch; `SessionContext` required `idleExpiresAt` when authenticated
      (keep `expiresAt`); update `parseSessionContextJson` / key-count allowlists,
      `serializeSessionContext`, `sessionContextFromRecord`, and **`serializeSessionRecord`** so
      T006 passes—do not only update types without serialize/parse (FR-004, data-model).
- [ ] T008 [P] Write failing unit cases in `packages/frontend/tests/unit/session-idle.test.ts` for
      deadline helpers: `idleExpiresAt = lastActivityAt + idleDurationMinutes * 60`; activity MUST
      NOT extend `expiresAt`; `now >= idleExpiresAt` deadline wins; missing store ≠ inactivity
      claim; equality pin when `idleExpiresAt === expiresAt` → inactivity clearance path
      (`contracts/idle-expiration.md`).
- [ ] T009 Implement idle helpers in `packages/frontend/src/lib/session/idle.ts` (`computeIdleExpiresAt`,
      idle/absolute checks, end-for-inactivity shaping of anonymous cause + `sessionEndGeneration`
      latch retained until ended session absolute `expiresAt`); make T008 pass.
- [ ] T010 [P] Write failing unit/contract cases in
      `packages/frontend/tests/unit/session-store-idle-cas.test.ts` for atomic renewal/clearance:
      per-session idle mutation lock; CAS (no blind `SET` after separate read); post-apply `now1`
      re-check under lock (deadline wins); concurrent renew vs clearance interleaving; store
      timeout / WATCH abort fail closed; ~**1s** coalesce when computed `idleExpiresAt` unchanged;
      **no** session draft-key cleanup ops (data-model Temporary session data).
- [ ] T011 Implement atomic conditional update/clear helpers in
      `packages/frontend/src/lib/session/store.ts`: per-session idle lock + CAS + post-apply re-check
      for renewal **and** idle clearance; stamp activity from **application clock only** (no Redis
      `TIME` as product clock); set anonymous `accessEndedCause: "inactivity"` +
      `sessionEndGeneration` on clearance; **do not** clear temporary session draft fields (none in
      this slice); make T010 pass (`contracts/idle-expiration.md`).
- [ ] T012 [P] Write failing unit cases in `packages/frontend/tests/unit/session-guard.test.ts` for
      centralized protected-op check: Redis re-read; `now < idleExpiresAt` and `now < expiresAt`;
      tenant bind; fresh clock sample after Redis load before success; missing/503 → deny without
      inactivity claim.
- [ ] T013 Implement `packages/frontend/src/lib/session/guard.ts` and wire
      `getRequestSession` in `packages/frontend/src/lib/session/index.ts` so protected SSR / Server
      Actions / Route Handlers that treat `userId` as authenticated use guard Redis re-read—not
      Proxy alone / not forwarded context alone (plan Structure Decision; FR-004).
- [ ] T014 Write failing unit cases in `packages/frontend/tests/unit/session-setup.test.ts` for
      **Phase A dual-read**: parse legacy four-key + idle-shaped authenticated JSON; expose
      `legacyAuthenticated`; `setupSession.canReuse` **rejects** legacy (force reauth); typed
      setup result signal `kind: "inactivity-recovery"` when anonymous record has consumable
      cause/latch (not stuffed into authenticated `SessionContext` allowlist).
- [ ] T015 Extend `packages/frontend/src/lib/session/setup.ts` for Phase A dual-read +
      `canReuse` legacy reject + typed `inactivity-recovery` signal to Proxy; sample **fresh**
      application clock after Redis load before any authenticated success outcome; make T014 pass.
      **Do not** enable Phase B idle-shaped authenticated writes in this task (gate behind flag
      default-off or defer writes to US1 T021).
- [ ] T016 Document Phase A→B→drain rollout (configured `SESSION_TTL_SECONDS` /
      `SessionConfig.ttlSeconds` drain window; rollback only to Phase A dual-read; four-key-only
      rollback unsupported while idle-shaped keys remain) in `docs/session-state.md` (data-model
      Rollout / legacy).

**Checkpoint**: Unit contracts for types/serialize, idle math, CAS lock, guard, and Phase A
setup pass; clean tree builds/typechecks; Proxy still does not enforce idle writes or recovery
SSR shell.

---

## Phase 3: User Story 1 — End unattended authenticated access (Priority: P1) 🎯 MVP

**Goal**: Authoritative idle expiration ends authenticated access; qualifying trusted activity
renews the idle deadline only (application clock; cookie-derived session identity; atomic CAS);
delayed/cross-tenant activity and missing store cannot revive or mislabel access—independently of
the recovery modal.
**Independent Test**: With an authenticated session and an approved tenant duration (default
**30** until US3), attempt protected work before and at the inactivity deadline (including
suspended browser). Demonstrate rejection through expired access independently of the modal.
Authentication prerequisite (OIDC callback writing `userId` / `userName`) must be available.

### Tests for User Story 1

- [ ] T017 [P] [US1] Add failing unit coverage in
      `packages/frontend/tests/unit/session-activity.test.ts`: accept deliberate activity before
      deadline; reject late activity; leave `expiresAt` / `idleDurationMinutes` unchanged; no
      client-supplied `at`; cookie-derived identity only; coalesce ~**1s** redundant writes; store
      timeout fails closed.
- [ ] T018 [P] [US1] Add failing contract/HTTP clock cases in
      `packages/frontend/tests/unit/session-setup.test.ts` and
      `packages/frontend/tests/unit/session-idle-expiration-http.test.ts`: denial at
      `idleExpiresAt`; late activity rejection; tenant isolation; missing store ≠ inactivity;
      slow-read crossing deadline (fresh clock after Redis load); equality pin
      `idleExpiresAt === expiresAt` → inactivity clearance; no public diagnostic endpoints
      (`contracts/idle-expiration.md`).
- [ ] T019 [P] [US1] Add failing concurrent race cases in
      `packages/frontend/tests/unit/session-activity-cas.test.ts`: renew vs clearance under
      per-session lock; post-apply re-check prevents chaining renewals on not-yet-validated writes;
      lost CAS vs anonymous clearance does not overwrite (T010/T011 protocol).
- [ ] T020 [P] [US1] Scaffold/replace pending expiration steps in `tests/bdd/steps/idle.steps.ts`
      for `features/idle-session-expiration.feature` (`@contract` / clock / shared-tab /
      independent-session / delayed-activity scenarios).

### Implementation for User Story 1

- [ ] T021 [US1] **Phase B — idle writes**: enable idle-shaped authenticated writes; stamp idle
      fields at authentication in `packages/frontend/src/lib/oidc/callback.ts` on the **new**
      `sessionId` only: `idleDurationMinutes` from effective tenant policy (omit → **30** until
      US3 lands full parse), `lastActivityAt` = auth time, `idleExpiresAt` = auth time + duration;
      do not extend absolute `expiresAt`; keep dual-read until drain (data-model / tenant-idle-policy).
- [ ] T022 [US1] Enforce idle + absolute expiry on authenticated Proxy short-circuit and session
      reuse in `packages/frontend/src/proxy.ts` and `packages/frontend/src/lib/session/setup.ts`
      (and via `guard.ts` for protected SSR/actions): fresh clock after Redis load; when
      `idleExpiresAt === expiresAt` and `now >=` that instant on a still-present record, perform
      atomic idle clearance + latch and label **inactivity**; fail closed independently of browser
      timers (FR-004, FR-006, FR-008).
- [ ] T023 [US1] Implement `recordQualifyingActivity` as a **POST-only** same-origin
      CSRF-protected Server Action (preferred) under `packages/frontend/src/app/` (e.g.
      `packages/frontend/src/app/(app)/session/activity.ts` or colocated action)—**not** GET:
      derive `sessionId` / `tenantId` **only** from verified `pathable-session` cookie; omit any
      client `at` (stamp from application clock); atomic lock+CAS+post-apply re-check via T011;
      deny missing/mismatch/unauthenticated/`now >= idleExpiresAt`/`now >= expiresAt`; coalesce
      ~**1s**; store failure fails closed; no public diagnostic route
      (`contracts/idle-expiration.md`).
- [ ] T024 [US1] Add client activity-capture island in
      `packages/frontend/src/components/session/idle-activity-island.tsx` that reports only
      deliberate user-originated DOM events with `event.isTrusted === true`: `keydown`,
      `pointerdown`, `touchstart`, or scrolling driven by trusted `wheel` / touch / pointer /
      keyboard—**MUST NOT** renew on bare `scroll` alone, script-generated/untrusted events,
      passive reading, polling, prefetch, or automated keepalives; client debounce MUST NOT create
      grace past `idleExpiresAt` (FR-005).
- [ ] T025 [US1] Mount activity island for authenticated `(app)` UI in
      `packages/frontend/src/app/(app)/layout.tsx` (or equivalent authenticated shell) without moving
      unrelated SSR data loading into the client.
- [ ] T026 [US1] Wire expiration BDD steps in `tests/bdd/steps/idle.steps.ts` and verify
      `@contract` / clock scenarios from `features/idle-session-expiration.feature` (shared-tab
      renewal, independent sessions, delayed activity no-revival); keep drain-window dual-read
      until at least one configured absolute TTL after Phase B (document remaining drain in
      `docs/session-state.md` if not finished in T016).

**Checkpoint**: User Story 1 is fully functional and independently testable (denial without
requiring the recovery modal); unit + contract clocks green for authoritative expiry.

---

## Phase 4: User Story 2 — Understand expiration and log in again (Priority: P1)

**Goal**: While authenticated UI is running, a **required** deadline-aligned timer at
`min(idleExpiresAt, expiresAt)` drives confirm/read; on server-confirmed inactivity remove
protected UI (client fixture only—**no** Redis drafts), present PathAble Modal with
**“Log in again”**, sync siblings via BroadcastChannel (`sessionId` + generation), SSR recovery
outside `(app)`, and rotate session id before OIDC—without inventing cause from client timers or
5xx.
**Independent Test**: While authenticated UI remains open, confirm client-driven revalidation
discovers server-confirmed inactivity without relying on a later full navigation; use the modal
by keyboard/AT; complete reauthentication; verify protected content removed and login-again does
not restore the client fixture. Client timing alone must never grant continued access.

### Tests for User Story 2

- [ ] T027 [P] [US2] Add failing unit/contract coverage in
      `packages/frontend/tests/unit/session-recovery.test.ts`: confirm/read outcomes; latch
      retained until ended session `expiresAt`; string cause consume-once OK only if latch remains;
      BroadcastChannel payload shape (`sessionId` + `sessionEndGeneration`); session-mismatch +
      tombstone handoff after cookie rotation; confirm/5xx → fail closed for visible protected UI
      (generic auth-unavailable, **not** inactivity claim); SSR recovery signal vs generic OIDC.
- [ ] T028 [P] [US2] Extend `tests/bdd/steps/idle.steps.ts` for
      `features/idle-session-recovery.feature` (`@browser` modal focus/keyboard, running-app expiry
      without full navigation, multi-tab both show inactivity explanation + missed-BroadcastChannel
      latch recovery, login-again cancel/fail, client-only “Unsent practice note” fixture).

### Implementation for User Story 2

- [ ] T029 [US2] Implement authenticated same-tenant session confirm/read as a **POST-only**
      same-origin CSRF-protected Server Action (preferred) under `packages/frontend/src/app/` (e.g.
      `packages/frontend/src/app/(app)/session/confirm.ts`)—GET probes if any MUST be non-mutating:
      return authenticated-still-valid (include cookie-bound `sessionId`, `idleExpiresAt`,
      `expiresAt`) vs ended-with-`inactivity` (include opaque `sessionEndGeneration` +
      `sessionId`) vs ended-without-inactivity vs transport/store failure; session-mismatch bit +
      **tombstone handoff** lookup of mounted old `sessionId` when cookie rotated; consume string
      `accessEndedCause` only while generation latch remains; no full session diagnostic dump
      (`contracts/inactivity-recovery.md`).
- [ ] T030 [US2] Add cause-bearing SSR recovery route under
      `packages/frontend/src/app/(recovery)/…` **OUTSIDE** `(app)` (no `getRequestSession`
      authenticated layout that rejects anonymous): PathAble Modal shell + “Log in again”; Server
      Components own session/tenant/cause presentation (FR-009, plan Structure Decision).
- [ ] T031 [US2] Wire `packages/frontend/src/proxy.ts` to **branch on typed setup
      `inactivity-recovery` signal** and forward to the SSR recovery shell **before** generic OIDC
      initiation; anonymous without recovery signal continues existing OIDC redirect; update Proxy
      matcher/routes as needed (FR-008, FR-009).
- [ ] T032 [US2] Implement inactivity recovery client island in
      `packages/frontend/src/components/session/inactivity-recovery-island.tsx`: **MUST** schedule
      deadline-aligned timer at `min(idleExpiresAt, expiresAt)` while authenticated UI is mounted
      (visibility/focus confirm are **supplemental only**); on server-confirmed inactivity remove
      protected content, open Modal, broadcast `inactivity-confirmed` with **`sessionId` +
      `sessionEndGeneration`** (receivers ignore foreign session ids); on confirm/5xx **fail closed
      for visible protected UI** with generic authorization-unavailable (retry without inactivity
      claim); never grant access past deadlines (FR-009).
- [x] T033 [P] [US2] Implement PathAble `Modal` recovery UI in
      `packages/frontend/src/components/session/inactivity-ended-modal.tsx` with meaningful
      accessible name/explanation that inactivity ended the session (MAY note possible unsaved
      temporary work lost—copy only); primary button accessible name **“Log in again”**; focus
      moves into modal and stays usable; keyboard-operable; no advance-warning/countdown/extend
      control (FR-009, FR-010).
- [x] T034 [US2] Implement dedicated CSRF-protected login-again Server Action (preferred) or
      POST route (indicative `packages/frontend/src/app/auth/login-again/…` / action)—**not** bare
      `/`: rotate **new** `sessionId` + host-bound `pathable-session` cookie **before** calling
      `packages/frontend/src/lib/oidc/initiate.ts`; OIDC tx targets new sid only; callback writes
      authenticated fields only to new Redis key; leave old-key tombstone until old `expiresAt` (or
      handoff consume); mounted tabs MUST run server-driven **session-mismatch handshake** via
      confirm/read (FR-010, research §6).
- [x] T035 [US2] Add client-only protected UI fixture support in BDD/app test helpers (e.g.
      `tests/bdd/support/` and/or authenticated demo UI) for Gherkin “Unsent practice note”: seed in
      DOM/client state—**not** Redis; on confirmed inactivity remove with protected content;
      login-again MUST NOT restore it (data-model Temporary session data).
- [x] T036 [US2] Complete recovery BDD **contract** wiring in `tests/bdd/steps/idle.steps.ts` for
      running-app revalidation, multi-tab sync (both tabs show inactivity explanation),
      missed-BroadcastChannel latch, and login-again / IdP SSO **new-session-only** contract rules
      from `features/idle-session-recovery.feature`. Pure `@browser` keyboard, assistive-technology,
      and live login-again steps remain intentional Pending residuals (see `features/README.md`).

**Checkpoint**: User Stories 1 and 2 both work independently (expiration denial + accessible
recovery with SSR path and login-again rotation).

---

## Phase 5: User Story 3 — Apply an approved tenant timeout (Priority: P2)

**Goal**: Optional tenant `idleTimeoutMinutes` (whole minutes **5–30** inclusive; omit → effective
**30**) from trusted env JSON governs **new** authenticated sessions; invalid explicit values
fail closed at the whole-source boundary; policy changes do not mutate existing sessions.
**Independent Test**: Establish a permitted tenant choice through the existing trusted config
process (env JSON + restart); prove it governs access after a new session begins; attempt invalid
and cross-tenant changes. No new administration application.

### Tests for User Story 3

- [ ] T037 [P] [US3] Unit-test `idleTimeoutMinutes` parse bounds in
      `packages/frontend/tests/unit/tenant-idle-policy.test.ts`: omitted → effective **30**;
      integers **5–30** inclusive accepted; fractional, `<5`, `>30`, non-integer, boolean/string
      disable, `null` → whole-source fail-fast (`CONFIG_UNAVAILABLE`) without substituting **30**
      (`contracts/tenant-idle-policy.md`, FR-001–FR-003).
- [ ] T038 [P] [US3] Scaffold/wire policy scenarios in `tests/bdd/steps/idle.steps.ts` for
      `features/tenant-idle-timeout-policy.feature` (Springfield vs Shelbyville isolation; policy
      fixed at auth; login-again uses new policy).

### Implementation for User Story 3

- [ ] T039 [US3] Extend `TenantConfig` in `packages/frontend/src/lib/tenant/types.ts` with optional
      `idleTimeoutMinutes` (`number | omitted`): when present MUST be safe integer, whole minutes,
      **5–30 inclusive**; when omitted effective policy **30** for new authenticated sessions;
      explicit invalid values make the **entire** tenant source unusable at the trusted boundary—do
      not substitute **30**; disablement is not a representable stored value; unknown keys still
      rejected (FR-001, FR-002).
- [ ] T040 [US3] Export effective idle duration resolver (omit → **30**) from
      `packages/frontend/src/lib/tenant/` and use it in
      `packages/frontend/src/lib/oidc/callback.ts` so new sessions copy `idleDurationMinutes` at
      auth; existing Redis sessions retain prior `idleDurationMinutes` when config changes after
      process restart (FR-003).
- [ ] T041 [US3] Document optional `idleTimeoutMinutes` and restart reload semantics in
      `docs/multi-tenancy.md` (trusted env JSON process; no new admin UI; whole-source fail-fast).
- [ ] T042 [US3] Complete policy BDD assertions in `tests/bdd/steps/idle.steps.ts` for
      whole-minute **5–30** choices, reject-above-ceiling/disable, and invalid explicit config
      fail-closed from `features/tenant-idle-timeout-policy.feature`.

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation triad, regression partitions, and delivery validation across stories.

- [x] T043 [P] Update `docs/session-state.md` with idle fields, qualifying activity (`isTrusted`),
      authoritative enforcement, cause/latch rules, BroadcastChannel payload, CAS/lock protocol,
      Phase A/B drain, absolute-vs-idle independence, and **no draft keys** in this slice.
- [x] T044 [P] Update `docs/authentication.md` for idle stamping on **new** sid after login-again
      rotation, callback target rules, and recovery/OIDC Proxy branching (plan Constraints; research
      docs alignment).
- [x] T045 [P] Confirm `docs/multi-tenancy.md` idle policy notes match shipped behavior
      (cross-check T041).
- [x] T046 Run regression `pnpm test:bdd:session` and `pnpm test:bdd:oidc` after Proxy/session
      touchpoints; keep partitions green on delivery PR (quickstart).
- [x] T047 [P] Run frontend unit suite `pnpm --filter @pathableai/pre-ets-frontend test:unit` and
      idle BDD dry-run / `pnpm test:bdd:idle` per
      `specs/004-idle-session-timeout/quickstart.md`.
- [x] T048 Run root quality gates from `package.json`: `pnpm typecheck`, **`pnpm build`**,
      `pnpm lint`, `pnpm format:check`, `pnpm check:unused` for touched workspaces under
      `packages/frontend/` (lint before format; no generated Cucumber reports committed).
- [x] T049 [P] Surface release checklist items (do not invent product claims): D-001/FR-011 policy
      approval memo for **5–30** and default **30**, D-005/SC-005 workflow thresholds, D-006
      delivery appetite—track outside Spec Kit per quickstart; observability metrics remain deferred
      out of scope.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately; T002 **before** T003–T005 wiring.
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories. Types/serialize
  (T006→T007) before idle helpers/store/guard/setup; Phase A dual-read (T014–T016) before Phase B
  writes in US1.
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP; no dependency on US2/US3 (may use
  default **30** until US3).
- **User Story 2 (Phase 4)**: Depends on Foundational; practically builds on US1 enforcement +
  cause/latch clearance side effects + forwarded `idleExpiresAt`.
- **User Story 3 (Phase 5)**: Depends on Foundational; can proceed after or in parallel with US2
  once US1 auth stamping exists; completes configurable policy.
- **Polish (Phase 6)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational — independently testable via authoritative denial
  without modal.
- **User Story 2 (P1)**: After Foundational + US1 idle clearance/`accessEndedCause` + latch path —
  independently testable via running-app revalidation + Modal + SSR recovery + login-again
  rotation.
- **User Story 3 (P2)**: After Foundational — independently testable via env JSON policy +
  new-session duration; integrates with US1 callback stamping.

### Within Each User Story

- Tests (where included) should fail before implementation where practical
- Models/parsers/serialize before services/handlers
- Server authority (CAS, guard, Proxy) before client islands
- Story complete before treating next priority as done

### Parallel Opportunities

- T001 with T002 in Setup; T003–T005 sequential after stub exists
- After T007: T008/T010/T012 unit scaffolds in parallel; T009/T011/T013 implementations follow
  their tests
- T014→T015 sequential on `setup.ts` (do not mark same-file work `[P]`)
- After Foundational: US1 test tasks T017–T020 in parallel; US2 tests T027–T028 and US3 tests
  T037–T038 can start once interfaces stabilize
- T033 Modal UI can proceed in parallel with T029 confirm/read once island contract is agreed
- T043 / T044 / T045 / T049 documentation tasks in parallel during Polish

---

## Parallel Example: User Story 1

```bash
# Launch US1 test scaffolds together:
Task: "Add unit coverage in packages/frontend/tests/unit/session-activity.test.ts"
Task: "Add contract/HTTP clock tests in packages/frontend/tests/unit/session-setup.test.ts and session-idle-expiration-http.test.ts"
Task: "Add concurrent CAS race tests in packages/frontend/tests/unit/session-activity-cas.test.ts"
Task: "Scaffold Cucumber steps in tests/bdd/steps/idle.steps.ts for idle-session-expiration.feature"

# After foundational types/CAS exist, implementation sequence:
Task: "Phase B idle writes + stamp fields in packages/frontend/src/lib/oidc/callback.ts"
Task: "Enforce idle on packages/frontend/src/proxy.ts and setup.ts (+ guard)"
Task: "Implement CSRF POST activity action under packages/frontend/src/app/"
Task: "Trusted-only activity island in packages/frontend/src/components/session/idle-activity-island.tsx"
```

---

## Parallel Example: User Story 2

```bash
# Tests in parallel:
Task: "session-recovery unit/contract tests in packages/frontend/tests/unit/session-recovery.test.ts"
Task: "Recovery BDD steps in tests/bdd/steps/idle.steps.ts for idle-session-recovery.feature"

# Server confirm + Modal can fork after confirm contract is sketched:
Task: "confirm/read CSRF action under packages/frontend/src/app/"
Task: "SSR recovery shell under packages/frontend/src/app/(recovery)/"
Task: "InactivityEnded Modal in packages/frontend/src/components/session/inactivity-ended-modal.tsx"
# Then: Proxy recovery branch, deadline timer island, login-again rotation + mismatch handshake
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (stub → cucumber → scripts → README)
2. Complete Phase 2: Foundational (CRITICAL — Phase A dual-read, CAS, guard, serialize)
3. Complete Phase 3: User Story 1 (Phase B idle writes + authoritative idle end + activity renewal)
4. **STOP and VALIDATE**: Denial at deadline without modal; unit + contract clocks; equality pin
5. Demo/ship MVP if delivery appetite allows; then add US2 recovery UX

### Incremental Delivery

1. Setup + Foundational → idle primitives + Phase A dual-read ready
2. Add User Story 1 → Test independently → MVP (authoritative expiry)
3. Add User Story 2 → Test independently → accessible recovery + login-again rotation
4. Add User Story 3 → Test independently → tenant-configurable durations **5–30**
5. Polish docs (`session-state`, `multi-tenancy`, `authentication`) + regression partitions +
   `pnpm build`

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (enforcement + activity CAS)
   - Developer B: User Story 2 (Modal + revalidation + SSR recovery) after cause-clearance API from A
   - Developer C: User Story 3 (tenant policy parse) in parallel with B once callback stamp hook exists
3. Integrate and run quickstart validation order

---

## Notes

- `[P]` tasks = different files, no incomplete-task dependencies—**never** mark two incomplete
  tasks `[P]` when both edit the same file (e.g. both touching `types.ts`)
- `[Story]` label maps task to US1/US2/US3 for traceability; Setup/Foundational/Polish have none
- Server is sole authority for `idleExpiresAt`; client deadline timer never grants access
- Activity: application clock only; cookie-derived session identity only; `event.isTrusted === true`
- Clearance/renewal: atomic CAS + per-session idle lock + post-apply re-check (deadline wins)
- Latch: `sessionEndGeneration` until ended session `expiresAt`; BroadcastChannel includes
  `sessionId` + generation
- No new admin app, backend session store, advance-warning/extend UI, Redis draft keys, or
  observability metrics in this slice
- Release claims remain gated by D-001, D-005, and D-006 (T049)
- Commit after each task or logical group when implementing (`/speckit-implement`)
- Avoid: vague tasks, same-file `[P]` conflicts, treating missing Redis as inactivity, blind
  `SET` after separate read, client-supplied `at`, bare-scroll heartbeats
