# Tasks: Tenant OIDC Login Initiation

**Input**: `specs/003-tenant-oidc-login/spec.md`, `plan.md`, `research.md`, `data-model.md`,
`contracts/` (`tenant-oidc-config.md`, `oidc-login-initiation.md`, `local-keycloak.md`), and
`quickstart.md`.
**Organization**: Shared setup and foundations, then US1 (P1 MVP), US2 (P1), US3 (P2), and polish.
**Tests**: Required by Principle V, the approved plan/quickstart, and existing OIDC Gherkin with
pending steps. Write failing unit/contract assertions and complete Cucumber steps before treating
runtime behavior as verified; dry-run discovery alone is not acceptance.
**Branch**: implement on a delivery branch targeting the plan (e.g. from `cursor/tenant-oidc-login-plan`
or `003-tenant-oidc-login` once tasks land).

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Pin `openid-client`, add Keycloak beside Redis in Compose, and document env/docs without
wiring Proxy initiation yet. Prefer one focused setup commit for deps + Compose + `.env.example` +
docker-compose/README alignment (same pattern as session setup slice 1).

- [x] T001 Add and pin frontend runtime dependency `openid-client` (compatible released major) in
      `packages/frontend/package.json` and root `pnpm-lock.yaml`; keep Node >=24 / ESM. Do not import
      it from `proxy.ts` in a way that requires secrets or live discovery at build time (FR-006,
      research §5).
- [x] T002 Extend root `compose.yaml` to preserve `redis:8.2.9` on `127.0.0.1:6379` and add
      `keycloak` with image `quay.io/keycloak/keycloak:26.7.4`, command `start-dev`, publish
      `127.0.0.1:8080:8080`, bootstrap admin via env (no committed passwords), and a healthcheck that
      supports `docker compose up -d --wait redis keycloak`. Start no frontend/backend/Postgres
      (FR-010, `contracts/local-keycloak.md`).
- [x] T003 [P] Update `docs/docker-compose.md` and root `README.md` for Redis+Keycloak loopback layout,
      issuer identity `http://127.0.0.1:8080/realms/pre-ets`, and “apps stay on host” (FR-010, FR-011).
- [x] T004 [P] Extend `packages/frontend/.env.example` with synthetic `oidc` examples including
      required `clientAuth` (`"public"` \| `"confidential"`), `issuer`, `clientId`, optional
      `connection`, and empty `OIDC_CLIENT_SECRETS_JSON` / optional `OIDC_TX_*` placeholders; no usable
      secrets; document restart-after-change (FR-001, FR-002, data-model).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared `TenantConfig` schema (`displayName` + required nested `oidc` with
`clientAuth` = spec “registration mode”), secrets map rules, fixture/test migration, and OIDC module
seams every story needs. **Do not enable Proxy login redirection until this phase is complete.**

- [x] T005 Write failing unit cases in `packages/frontend/tests/unit/tenant-oidc-config.test.ts` for
      the **shared** `TenantConfig` parser (not login-boundary-only validation): keep required
      `displayName`; require nested `oidc`; `issuer` absolute URL with https-outside-dev /
      loopback-http-in-dev; nonempty `clientId`; required `clientAuth` closed set `"public"` \|
      `"confidential"` (explicit map: spec “registration mode” → `oidc.clientAuth`); optional nonempty
      `connection`; reject unknown keys; Display Name-only records unusable (FR-001, FR-002, FR-007,
      data-model, `contracts/tenant-oidc-config.md`).
- [x] T006 Extend `packages/frontend/src/lib/tenant/types.ts` (and parsers used by `source.ts` /
      operations) so shared `TenantConfig` **keeps `displayName` and requires nested `oidc`** with
      fields/constraints from T005—including required `oidc.clientAuth` as registration mode; keep
      restart/immutability semantics; make T005 pass (FR-001). Do **not** defer `oidc` enforcement to
      login-only validation.
- [x] T007 Migrate existing Display Name-only fixtures/tests to the shared `displayName` + `oidc`
      shape: update `packages/frontend/tests/unit/tenant-source.test.ts` and related tenant
      runtime/operations tests (`tenant-runtime.test.ts`, `tenant-operations.test.ts`, and any other
      Display Name-only tenant fixtures under `packages/frontend/tests/`); then run the existing
      frontend tenant unit suite at this Foundational checkpoint and make it green (FR-001, Copilot
      T006).
- [x] T008 [P] Write failing unit cases in `packages/frontend/tests/unit/oidc-secrets.test.ts` for
      `OIDC_CLIENT_SECRETS_JSON`: lazy parse; malformed map → typed process failure (HTTP 500 at
      Proxy); `"public"` allows absent secret; `"public"` + nonempty secrets-map entry is **valid and
      unused** (never logged/emitted); `"confidential"` requires nonempty slug secret else config
      refusal; never log secret values (FR-002, research §2, analysis U1).
- [x] T009 [P] Implement `packages/frontend/src/lib/oidc/secrets.ts` (`resolveOidcClientSecret(slug,
      clientAuth)`) per T008 and `contracts/tenant-oidc-config.md`; make T008 pass.
- [x] T010 Write failing unit cases in `packages/frontend/tests/unit/oidc-types.test.ts` for
      transaction record exact shape `{ tenantId, issuer, clientId, connection?, redirectUri, nonce,
      codeVerifier, sessionId, expiresAt }`, default TTL `600` / `OIDC_TX_TTL_SECONDS`, key prefix
      default `pre-ets:oidc-tx:`, and correlation cookie claims `state` / **`tenant`** / `exp`
      (claim name `tenant` matches session cookie—not `tenantId`) (data-model, research §6).
- [x] T011 Define OIDC types/helpers in `packages/frontend/src/lib/oidc/types.ts` per T010; parse
      `OIDC_TX_*` lazily; make T010 pass.
- [x] T012 [P] Implement Redis transaction helpers in `packages/frontend/src/lib/oidc/transaction.ts`:
      create with `SET NX EXAT` under `{OIDC_TX_KEY_PREFIX}{state}`; one collision retry; no
      cross-tenant mutation; share session store timeout fail-closed; never persist verifier outside
      Redis (FR-006, research §6).
- [x] T013 [P] Implement correlation cookie sign/verify in `packages/frontend/src/lib/oidc/cookie.ts`
      (cookie name `pathable-oidc`; HS256 via `jose`; claims `{ state, tenant, exp }`;
      `OIDC_TX_SIGNING_SECRET` or `SESSION_SIGNING_SECRET`; host-only HttpOnly Lax; Secure outside
      development) (FR-006).
- [x] T014 [P] Implement discovery + in-process issuer cache in
      `packages/frontend/src/lib/oidc/discovery.ts` using `openid-client`; discovery must **not**
      override `clientAuth`; document frontend restart after Keycloak reprovision (research §5, E3).
- [x] T015 Implement `initiateLogin` in `packages/frontend/src/lib/oidc/initiate.ts` per
      `contracts/oidc-login-initiation.md` ordered steps: load oidc → resolve secret by `clientAuth`
      → discover → PKCE/state/nonce → approved `{origin}/auth/callback` → persist tx + correlation
      cookie → auth URL with S256 PKCE, `scope=openid`, `kc_idp_hint` when `connection` set
      (Keycloak-local). Return typed outcomes for redirect / 403-config / login-unavailable /
      401-nondoc / **process-config HTTP 500** (malformed `OIDC_CLIENT_SECRETS_JSON`, with Proxy
      mapping) without attaching session cookie on failures (FR-003–FR-007).

**Checkpoint**: Unit contracts for config/secrets/tx/cookie/discovery pass; Display Name-only tenant
fixtures migrated and tenant unit suite green; clean tree builds/typechecks without OIDC secrets;
Proxy still does not redirect to IdP.

---

## Phase 3: User Story 1 — Reach my tenant's login page (Priority: P1) 🎯 MVP

**Goal**: Unauthenticated document navigations to `/` initiate tenant-bound OIDC (PKCE + protected
tx) and never SSR application landing; cookie only on successful create→IdP `302`.
**Independent Test**: Two synthetic tenants with distinguishable connections; fresh browsers reach
each matching provider login page with zero chooser and zero application content first (SC-001).

### Tests for User Story 1

- [x] T016 [P] [US1] Add failing Proxy/initiation unit cases in
      `packages/frontend/tests/unit/oidc-initiate-proxy.test.ts` (or extend existing proxy tests):
      `/auth/callback` excluded **before** `setupSession`; unauthenticated `reuse` and `create` both
      initiate on document `/`; terminals 403/500/503 unchanged; malformed secrets → HTTP 500;
      successful document `create` 302 sets `pathable-session` + `pathable-oidc`; failures and nondoc
      `401` omit `pathable-session` Set-Cookie; caller query cannot override
      issuer/client/connection/return host; PKCE verifier absent from Location; early Next 16.3.5
      RSC/`Accept` signal for nondoc `401` recorded (FR-003–FR-006, FR-013, E2, E4).
- [ ] T017 [P] [US1] Replace pending US1 stubs in `tests/bdd/steps/oidc.steps.ts` for
      `features/tenant-oidc-login.feature` with failing real HTTP/browser assertions (including
      anonymous-reuse re-initiation, cookie-absence outline, tampering, tx failure) (SC-001–SC-003,
      SC-005).

### Implementation for User Story 1

- [x] T018 [US1] Complete extended forbidden UX for OIDC-config 403 on the existing forbidden surface
      (no new route): explain login cannot start; clear next action; a11y; no secrets; distinct from
      `login-unavailable`. **Dependency of Proxy enablement (T019)**—do this before claiming
      FR-007/SC-005 for config refusal in the US1 MVP (analysis C1; FR-007, FR-008, P4).
- [x] T019 [US1] Wire `packages/frontend/src/proxy.ts`: **first branch** exclude `/auth/callback`
      (pass-through; no `setupSession`, no initiation); then `setupSession` + unauthenticated ready →
      `initiateLogin` **only** on document entry `/`; matcher covers `/` and `/auth/callback`; never
      SSR landing without authenticated user id (out of scope / always initiate); map malformed
      secrets to HTTP 500; safe diagnostics outcome classes only (FR-003, FR-005, FR-013, E7, E9).
- [x] T020 [US1] Add `packages/frontend/src/app/auth/callback/page.tsx` stub outside login re-entry;
      no code exchange; no initiation (FR-013).
- [x] T021 [US1] Add `packages/frontend/src/app/login-unavailable/page.tsx` **outside** `(app)` per
      plan E11/P5: PathAble-accessible “login cannot start” + one keyboard-operable next action; no
      secrets/cross-tenant details; read installed
      `agent-guidance/pathable-react/SKILL.md` before composing UI (FR-008, SC-005).
- [x] T022 [US1] Apply **Supersedes** updates in the same delivery slice as Proxy initiation:
      `specs/001-tenant-resolution/contracts/landing-page.md` and tenant-context as required by plan
      Compatibility; keep dual-layer regression intent documented (Constitution I / Governance).
- [ ] T023 [US1] Same-slice **behavioral supersession** retarget for inventoried features (plan
      inventory): `features/session-continuity.feature`, `session-recovery.feature`,
      `local-session-development.feature`, `tenant-landing-page.feature`,
      `local-host-tenant-resolution.feature`, `local-static-tenant-configuration.feature` — replace
      unauthenticated `/` “tenant page / Display Name” success with initiate-or-fail; retain session
      cookie/tenant-binding observables; update related pending steps as needed (FR-003, SC-002, E1).
- [ ] T024 [US1] Run US1 partition via `pnpm test:bdd:oidc` (and unit suite); prove two-tenant
      isolation, PKCE/tx binding, reuse re-initiation, cookie-absence on failures, extended-forbidden
      config refusal; record gaps in `specs/003-tenant-oidc-login/quickstart.md` (SC-001–SC-003,
      SC-005).

**Checkpoint**: US1 acceptance green for initiation MVP; unauthenticated `/` never lands Display Name;
FR-007/SC-005 config-refusal claims require T018 complete.

---

## Phase 4: User Story 2 — Configure each tenant's login connection (Priority: P1)

**Goal**: Trusted OIDC settings (incl. `clientAuth` = registration mode) drive destinations; config
defects use extended 403 (T018); provider/tx failures use `login-unavailable`; secrets stay
server-only.
**Independent Test**: Change one tenant’s OIDC settings + restart; only that tenant’s next
unauthenticated visit changes; exercise defects independently (SC-002, SC-003).

### Tests for User Story 2

- [x] T025 [P] [US2] Add failing unit/HTTP cases for config defects and confidential credentials in
      `packages/frontend/tests/unit/oidc-config-failures.test.ts` (and proxy/HTTP as needed): all
      defect rows from `features/tenant-oidc-configuration.feature` including `clientAuth:
      "confidential"` without secret → extended 403 (not `login-unavailable`); public needs no
      secret; `"public"` + unused nonempty secrets-map entry; secret never in
      redirects/HTML/diagnostics; connection omit vs required (FR-001, FR-002, FR-004, FR-007,
      FR-008, FR-009).
- [ ] T026 [P] [US2] Replace pending US2 stubs in `tests/bdd/steps/oidc.steps.ts` for
      `features/tenant-oidc-configuration.feature` with failing assertions (incl. client auth column /
      confidential scenario) (SC-002, SC-003, SC-005).

### Implementation for User Story 2

- [x] T027 [US2] Ensure provider metadata / discovery failures route to `login-unavailable` (T021)
      without collapsing into 403; no auto redirect loop (FR-007, US2 scenario 6).
- [x] T028 [US2] Document reload/restart procedure for OIDC JSON + secrets in
      `packages/frontend/.env.example` and operator-facing docs pointers (FR-009, FR-011).
- [ ] T029 [US2] Run US2 cases via `pnpm test:bdd:oidc` and record evidence in
      `specs/003-tenant-oidc-login/quickstart.md` (SC-002, SC-003, SC-005).

**Checkpoint**: US1 + US2 green; config refusal vs provider failure taxonomy holds.

---

## Phase 5: User Story 3 — Exercise login locally (Priority: P2)

**Goal**: Documented Compose Keycloak + host-run app demonstrates two synthetic tenant logins and
static mode without production accounts.
**Independent Test**: Clean local provider state → both tenant login UIs; stop Keycloak → specified
failure without access or loop (SC-004).

### Tests for User Story 3

- [ ] T030 [P] [US3] Replace pending US3 stubs in `tests/bdd/steps/oidc.steps.ts` for
      `features/local-oidc-development.feature` with failing assertions for Compose readiness, shared
      issuer `127.0.0.1`, static mode, unknown-host refusal, provider-stopped outcomes (FR-010–FR-012,
      SC-004).

### Implementation for User Story 3

- [x] T031 [US3] Finish local provisioning docs in `docs/docker-compose.md`, README, and
      `contracts/local-keycloak.md` alignment: realm/clients/`clientAuth: "public"`/IdP aliases/
      redirect URIs; no committed secrets (FR-011, FR-012).
- [x] T032 [US3] Ensure BDD fixtures can supply synthetic OIDC tenant JSON + optional secrets map and
      unique `SESSION_KEY_PREFIX` / `OIDC_TX_KEY_PREFIX` for spawned frontends (`tests/bdd/support/**`)
      (FR-010, FR-012).
- [x] T033 [US3] Document CI Keycloak policy (E8) in `.github/workflows/ci-bdd.yml` comments and/or
      workflow: CI runs `@contract`/`@http` without live Keycloak; `@browser` provider-arrival is
      local / `pnpm test:bdd:oidc` with Compose—do not require live Keycloak in CI until explicitly
      added (plan Testing).
- [ ] T034 [US3] Run US3 local/quickstart checks and `features/local-oidc-development.feature` where
      environment allows; complete SC-004 checklist in `specs/003-tenant-oidc-login/quickstart.md`.

**Checkpoint**: Clean-checkout local path works for two tenants + static; provider stop matches spec.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T035 [P] Sync `docs/authentication.md` with unauthenticated initiate-for-both, `clientAuth`
      (registration mode), cookie-on-success-only, and mid-journey (provider arrival only) claims
      (research §11).
- [ ] T036 Require OIDC delivery PR keeps `pnpm test:bdd:session` green **after** T023 retarget (E5);
      confirm path filters cover `packages/frontend/src/lib/oidc/**` and `proxy.ts`.
- [ ] T037 Run `pnpm test:bdd:dry`, `pnpm --filter @pathableai/pre-ets-frontend test:unit`,
      `pnpm test:bdd:oidc`, `pnpm test:bdd:session`; require pending OIDC steps gone for implemented
      scenarios; record counts/limitations in `specs/003-tenant-oidc-login/quickstart.md`.
- [ ] T038 Run `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm check:unused`
      from root; confirm clean-checkout build/typecheck without OIDC secrets; lint before format; no
      generated Cucumber reports committed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately; T001–T004 preferably one focused setup commit.
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories. T005→T006→T007
  (shared parser then fixture migration + tenant suite); T008→T009; T010→T011; T012–T014 can proceed
  in parallel after T011 types exist; T015 after secrets + discovery + tx + cookie seams.
- **User Story 1 (Phase 3)**: Depends on Foundational. MVP = Setup + Foundational + US1 (through
  T024). **T018 (extended forbidden UX) before T019 (Proxy enablement)**—do not claim FR-007/SC-005
  config refusal until T018. T023 retarget is same-slice as Proxy enablement (T019)—do not ship
  initiation without it.
- **User Story 2 (Phase 4)**: Depends on Foundational; shares Proxy/initiation with US1; independently
  testable via `tenant-oidc-configuration.feature`. Extended 403 UX already landed in T018.
- **User Story 3 (Phase 5)**: Depends on Setup Compose + Foundational; local demo needs US1 HTTP path.
- **Polish (Phase 6)**: Depends on desired stories complete.

### User Story Dependencies

- **US1 (P1)**: After Foundational — MVP demo of provider-page arrival for two tenants; config-refusal
  UX (T018) required for FR-007/SC-005 claims.
- **US2 (P1)**: After Foundational — config/`clientAuth`/403 taxonomy; Constitution III completeness
  for tampering and secret isolation expects US2 (T025–T029).
- **US3 (P2)**: After Compose + US1 path — independently testable via local-oidc feature + quickstart.

### Within Each User Story

- Tests written and failing before implementation
- Config/types before Proxy wiring
- Extended forbidden UX (T018) before Proxy enablement (T019)
- Core initiation before BDD green claims
- Story complete before next priority when sequential

### Parallel Opportunities

- T003/T004 after T001–T002 strategy agreed
- T008/T009 parallel with T005–T007 once schemas agreed
- T012/T013/T014 after T011
- T016/T017 parallel; T025/T026 parallel
- US2 and US3 can proceed in parallel after US1 Proxy path exists if staffed

---

## Parallel Example: User Story 1

```bash
# After Foundational:
Task: "T016 failing Proxy/initiation unit cases in packages/frontend/tests/unit/oidc-initiate-proxy.test.ts"
Task: "T017 failing US1 stubs in tests/bdd/steps/oidc.steps.ts for features/tenant-oidc-login.feature"

# Then T018 extended forbidden UX → T019–T023 Proxy/stub/supersession; validate with T024
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL—shared `oidc` parser + fixture migration)
3. Complete Phase 3: User Story 1 (T018 before Proxy; including same-slice Gherkin retarget T023)
4. **STOP and VALIDATE**: two-tenant initiation without landing; config 403 extended UX
5. Demo provider-page arrival

### Incremental Delivery

1. Setup + Foundational → seams ready; tenant suite green with `oidc`
2. US1 → MVP initiation (extended 403 UX + Proxy)
3. US2 → remaining config defects / confidential / provider failure taxonomy
4. US3 → local Keycloak developer path
5. Polish → docs sync + full gates

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Dev A: US1 Proxy/initiation (after T018); Dev B: US2 config/failure coverage (after T015); Dev C:
   US3 docs/fixtures

---

## Notes

- [P] = different files, no incomplete-task dependencies
- [USn] maps to spec user stories
- Never-land, shared `oidc` + `displayName`, and `clientAuth` (registration mode) are non-negotiable
- Correlation cookie claim is **`tenant`** (same name as session cookie)—not `tenantId`
- Callback completion / authenticated user id short-circuit remain out of scope (placeholder only)
- Prefer `pnpm` from repo root; follow AGENTS.md quality gates before commit
