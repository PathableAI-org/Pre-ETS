# Tasks: Filesystem Tenant Configuration Persistence

**Input**: `specs/005-tenant-config-fs/spec.md`, `plan.md`, `research.md`, `data-model.md`,
`contracts/filesystem-tenant-source.md`, and `quickstart.md`.
**Organization**: Setup (fixtures/env docs) → Foundational FS source → US1 host files (P1 MVP) →
US2 static alias (P1) → US3 JSON cutover (P2) → Polish (BDD ordered gate + quality).
**Tests**: Required by plan Testing section, Principle V, and authored `@tenant-config-fs`
Gherkin. Write failing Vitest cases before implementation where marked; complete Cucumber
steps **before** discovering filesystem features in the default tenant suite (BDD ordering gate).
**Branch**: `005-tenant-config-fs`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: US1 / US2 / US3 for story phases only
- Exact file paths in every task

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Synthetic fixture files and operator-facing env documentation for the new settings
(no runtime cutover yet).

- [x] T001 [P] Add synthetic `springfield.json` and `shelbyville.json` under
      `packages/frontend/fixtures/tenant-config/` as full `TenantRecord` bodies (`slug` equals
      filename stem; distinct `displayName`; valid public OIDC with loopback issuer allowed only
      for local samples; optional `idleTimeoutMinutes` omitted or valid 5–30; no real secrets)
- [x] T002 [P] Update `packages/frontend/.env.example`: document `TENANT_CONFIG_DIR` (prefer
      absolute path example pointing at fixtures; recommend directory permissions limited to the
      Node process user), `TENANT_STATIC_ALIAS`, keep `TENANT_RESOLUTION`; remove or clearly mark
      `TENANT_CONFIG_RECORDS_JSON` / `TENANT_LOCAL_CONFIG_JSON` as ignored/superseded with
      **silent ignore** + restart-after-file-edit callout (contracts/filesystem-tenant-source.md);
      document FR-013 **rollback** (restore prior release and/or correct `TENANT_CONFIG_DIR`
      mount/path—do **not** re-enable JSON env as a dual source)
- [x] T003 Update `docs/multi-tenancy.md` so filesystem under `TENANT_CONFIG_DIR` is described as
      the **current** source and Postgres as **future** (replace the pre-implement “planned 005”
      note); align CWD resolution, silent JSON ignore, and restart vs contract—no dual-source
      instructions

**Checkpoint**: Fixtures and `.env.example` describe the filesystem cutover without requiring app
code changes yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: `createFilesystemTenantSource` with fail-fast directory validation, CWD-at-boot path
resolution, path confinement, immutable process-lifetime cache, and category-only failure
logging. **No user story wiring into `dev.ts`/`prod.ts` until this phase completes.**

- [x] T004 Write failing unit cases in `packages/frontend/tests/unit/tenant-fs-source.test.ts`
      for: construction throws `CONFIG_UNAVAILABLE` when `TENANT_CONFIG_DIR` missing/empty/not a
      directory; relative dir resolves against process CWD at construction; absolute dir works;
      `ENOENT` → `undefined`; malformed JSON / invalid config / `slug`≠filename / path escape /
      nested path / symlink escape → throw; successful read returns frozen/immutable record;
      second read of same alias does not re-open after cache (or assert cache hit behavior);
      host read does not `readdir` the directory (spy); never logs file body (category-only if
      logger injectable)
- [x] T005 Implement `createFilesystemTenantSource` in `packages/frontend/src/lib/tenant/source.ts`
      per `contracts/filesystem-tenant-source.md` and plan policies (fail-fast dir validate;
      resolve relative vs CWD at boot; single-file open; immutable cache; make T004 pass). Retain
      existing in-memory helpers (`createStaticTenantSource`, etc.) for unit injection.
- [x] T006 [P] Add helpers in `packages/frontend/src/lib/tenant/types.ts` for resolving
      `TENANT_CONFIG_DIR` (trim; empty → unavailable), validating/canonicalizing
      `TENANT_STATIC_ALIAS` (must pass `isCanonicalTenantSlug`), and any shared
      `LOCAL_CONFIG_ERROR` / message updates that name directory + static alias + restart—without
      reading superseded JSON env vars
- [x] T007 [P] Add structured category-only failure logging helper used by the FS source (missing
      dir / I/O / parse / mismatch / escape) in `packages/frontend/src/lib/tenant/source.ts` or a
      small adjacent server-only module—never log another tenant’s file body or secrets

**Checkpoint**: Pure FS source is unit-tested and importable; runtime still uses env JSON until
US1 wiring.

---

## Phase 3: User Story 1 — Host-bound tenants from durable files (Priority: P1) 🎯 MVP

**Goal**: Host association loads `{TENANT_CONFIG_DIR}/{alias}.json` only; missing file → 403;
bad file/dir → configuration failure; consumers unchanged.

**Independent Test**: Point `TENANT_CONFIG_DIR` at fixtures; visit `springfield` /
`shelbyville` hosts; confirm Display Names; unknown alias 403; corrupt springfield file → 500
without affecting shelbyville.

### Tests for User Story 1

> Write these FIRST; ensure they FAIL before wiring.

- [x] T008 [P] [US1] Extend or add Vitest coverage in
      `packages/frontend/tests/unit/tenant-operations.test.ts` (and/or `tenant-runtime.test.ts`)
      so host-mode operations use a filesystem temp dir: two tenants isolate; missing file →
      `unknown`; mismatch/malformed → `config-error`; production ignores static settings
- [x] T009 [P] [US1] Update `packages/frontend/tests/unit/tenant-fixtures.ts` (or adjacent helper)
      to create temp tenant-config directories for tests instead of relying on
      `TENANT_CONFIG_RECORDS_JSON` payloads where host-source tests need FS realism

### Implementation for User Story 1

- [x] T010 [US1] Wire `createEnvTenantOperations` in
      `packages/frontend/src/lib/tenant/operations.ts` to construct
      `createFilesystemTenantSource` from `TENANT_CONFIG_DIR` at startup (CWD resolution via T006);
      stop reading `TENANT_CONFIG_RECORDS_JSON` for host records; keep host-binding /
      `TenantOperationResult` shapes unchanged
- [x] T011 [US1] Update `packages/frontend/src/lib/tenant/prod.ts` to use the filesystem source
      from `TENANT_CONFIG_DIR` (fail-fast at module/source construction); never read
      `TENANT_RESOLUTION` / `TENANT_STATIC_ALIAS` / JSON env vars
- [x] T012 [US1] Update `packages/frontend/src/lib/tenant/dev.ts` host-mode path to use the same
      filesystem source for host association (static path still deferred to US2); preserve
      `selectTenantMode` / `invalid-mode` diagnostic behavior
- [x] T013 [US1] Run `pnpm --filter @pathableai/pre-ets-frontend test:unit` and fix regressions in
      tenant unit suites caused by the host-source cutover (make T008–T012 green)

**Checkpoint**: Host MVP works with fixtures + `TENANT_CONFIG_DIR`; static mode may still be
broken/unimplemented until US2.

---

## Phase 4: User Story 2 — Static local mode by tenant name only (Priority: P1)

**Goal**: Development `TENANT_RESOLUTION=static` loads only `TENANT_STATIC_ALIAS` from the same
directory; production cannot bypass; origin remains `local-static`.

**Independent Test**: Static mode + `TENANT_STATIC_ALIAS=springfield` + fixtures → localhost
shows springfield Display Name; blank/unknown alias or bad file → local config error; production
build ignores static alias.

### Tests for User Story 2

- [x] T014 [P] [US2] Write failing Vitest cases in
      `packages/frontend/tests/unit/tenant-operations.test.ts` (or `tenant-runtime.test.ts`) for
      static alias success, missing/blank/non-canonical alias → `config-error`, bad/mismatched
      file → `config-error`, and production forcing host despite static env

### Implementation for User Story 2

- [x] T015 [US2] Implement static-mode loading in
      `packages/frontend/src/lib/tenant/dev.ts` and `operations.ts`: require usable
      `TENANT_STATIC_ALIAS`; `readTenantRecord(alias)` from FS source; adapt local error messaging
      to mention static alias + directory + restart; do not parse `TENANT_LOCAL_CONFIG_JSON`
- [x] T016 [US2] Ensure production paths (`prod.ts` / `createEnvTenantOperations` with
      `production: true`) ignore `TENANT_STATIC_ALIAS` and `TENANT_RESOLUTION=static` (existing
      mode policy); make T014 pass
- [x] T017 [US2] Run frontend unit tests again and confirm static + host cases both green

**Checkpoint**: Host and static filesystem modes both work without JSON env documents.

---

## Phase 5: User Story 3 — Operate without inline multi-tenant JSON (Priority: P2)

**Goal**: Filesystem is the sole runtime source; leftover JSON env vars are silently ignored;
docs/examples no longer require them.

**Independent Test**: With valid `TENANT_CONFIG_DIR`, set conflicting
`TENANT_CONFIG_RECORDS_JSON` / `TENANT_LOCAL_CONFIG_JSON`; outcomes still match files only.

### Tests for User Story 3

- [x] T018 [P] [US3] Add Vitest assertions that when FS source is configured, setting
      `TENANT_CONFIG_RECORDS_JSON` / `TENANT_LOCAL_CONFIG_JSON` to conflicting Display Names does
      not change `createEnvTenantOperations` / runtime results (silent ignore; no diagnostic
      required)

### Implementation for User Story 3

- [x] T019 [US3] Remove dead runtime paths that still call `parseRecordsJson` /
      `parseLocalConfigJson` from `dev.ts`, `prod.ts`, and `operations.ts` (keep pure helpers only
      if still needed by unit tests; otherwise delete unused exports and satisfy
      `pnpm check:unused` / fallow)
- [x] T020 [US3] Sweep `packages/frontend` docs/comments/README snippets that instruct developers
      to set inline JSON as the live source; point to fixtures + `TENANT_CONFIG_DIR` instead
- [x] T021 [US3] Align `specs/001-tenant-resolution/contracts/tenant-context.md` server-settings
      table with a short supersession note linking to
      `specs/005-tenant-config-fs/contracts/filesystem-tenant-source.md` (avoid dual authoritative
      env docs)

**Checkpoint**: No runtime dependency on superseded JSON env vars; documentation consistent.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: BDD ordered gate, harness retarget, quality gates, quickstart validation.

### BDD ordering gate (must follow this order)

- [x] T022 Implement temp-dir tenant fixture helpers in `tests/bdd/support/` (e.g. extend
      `fixtures.ts` / `server.ts`) that write `{alias}.json` files and set `TENANT_CONFIG_DIR` (+
      `TENANT_STATIC_ALIAS` when static)—**do not** inject `TENANT_CONFIG_RECORDS_JSON` /
      `TENANT_LOCAL_CONFIG_JSON` for new filesystem scenarios
- [x] T023 Add/extend step definitions for `@tenant-config-fs` scenarios in
      `tests/bdd/steps/tenant.steps.ts` and/or `tests/bdd/steps/tenant-fs.steps.ts` so
      `features/filesystem-host-tenant-configuration.feature`,
      `features/filesystem-static-tenant-name.feature`, and
      `features/filesystem-tenant-source-cutover.feature` bind (Pending stubs only if temporarily
      needed—prefer real steps once FS runtime exists)
- [x] T024 Include the three `features/filesystem-*.feature` files in the **default tenant**
      feature list in `cucumber.mjs` and update `features/README.md` inventory/counts **only after**
      T022–T023 bind; ensure `pnpm test:bdd:dry` discovers them without undefined steps
- [x] T025 Remove remaining JSON env injection from default tenant BDD support paths in
      `tests/bdd/support/server.ts` / `actions.ts` used by retained 001 scenarios (retarget those
      scenarios’ Given steps to filesystem temp dirs as needed)

### Docs, cleanup, validation

- [x] T026 [P] Walk `specs/005-tenant-config-fs/quickstart.md` scenarios against a local
      `pnpm --filter @pathableai/pre-ets-frontend dev` process; confirm the **Rollback** section
      still instructs operators to restore the prior release and/or correct the
      `TENANT_CONFIG_DIR` mount/path and **not** re-enable JSON env as a dual source (FR-013);
      fix doc/code gaps found
- [x] T027 [P] Run repository quality gates touched by this feature (`pnpm --filter
      @pathableai/pre-ets-frontend typecheck`, `test:unit`, root `pnpm lint` / `pnpm format:check`
      / `pnpm check:unused` as applicable) and fix findings without check-disable comments
- [x] T028 Confirm `pnpm test:bdd` (default tenant partition) stays green with filesystem features
      included and superseded JSON no longer required

**Checkpoint**: Feature complete per spec SC-001–SC-007 evidence paths; ready for PR.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Immediate
- **Foundational (Phase 2)**: After Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational — MVP
- **US2 (Phase 4)**: After Foundational; typically after US1 host wiring (shares `dev.ts` /
  `operations.ts`)
- **US3 (Phase 5)**: After US1+US2 runtime FS paths exist
- **Polish (Phase 6)**: After US3; BDD gate ordered T022 → T023 → T024 → T025

### User Story Dependencies

- **US1**: No dependency on US2/US3
- **US2**: Needs foundational FS source + preferably US1 env wiring patterns
- **US3**: Needs US1+US2 so cutover removes JSON without stranding either mode

### Parallel Opportunities

- T001 ∥ T002 ∥ T003 (Setup)
- T006 ∥ T007 after T005 API shape is known (or with T005 if careful)
- T008 ∥ T009 (US1 tests)
- T014 (US2 tests) can draft in parallel with US1 implementation but must fail until T015
- T026 ∥ T027 (Polish docs vs quality gates) after BDD gate

---

## Parallel Example: User Story 1

```bash
# After Foundational (T005) lands:
Task: "T008 host-mode Vitest FS isolation/unknown/config-error cases"
Task: "T009 temp-dir helpers in tenant-fixtures.ts"

# Then serial wiring:
Task: "T010 operations.ts FS host source"
Task: "T011 prod.ts"
Task: "T012 dev.ts host path"
Task: "T013 unit suite green"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational FS source + unit tests
3. Phase 3 US1 host wiring
4. **STOP**: Validate quickstart §1 host association with fixtures
5. Demo/review before static + cutover

### Incremental Delivery

1. Setup + Foundational → FS source library ready
2. US1 → Host MVP
3. US2 → Static alias DX
4. US3 → JSON fully retired
5. Polish → BDD default suite + gates

### Suggested MVP scope

**US1 only** (Phases 1–3): operators can run host association from `TENANT_CONFIG_DIR` files.

---

## Notes

- Do not discover `features/filesystem-*.feature` in `cucumber.mjs` before steps bind (T024 after
  T023).
- Never reintroduce dual-source reads of JSON env vars.
- No check-disable comments; fix underlying findings.
- Commit after each task or logical group; constitution exception already recorded in `plan.md`.
