# Tasks: Tenant Resolution

**Input**: `specs/001-tenant-resolution/spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`.
**Organization**: Shared setup and foundations, then US1 (P1), US2 (P1), US3 (P2), and completion evidence.
**Tests**: Required by the approved Vitest/Cucumber plan and user decisions. Write failing behavioral assertions before the corresponding implementation; dry-run discovery alone is not acceptance.
**Status**: Implementation complete except T031 (independent human walkthrough). Cucumber lives at the repository root (`cucumber.mjs`, `tests/bdd/`, `pnpm test:bdd`) rather than `packages/frontend`, per the platform-wide BDD decision.

## Phase 1: Setup

- [x] T001 Add and pin frontend runtime dependency `server-only` and frontend development dependency `vitest` in `packages/frontend/package.json` and `pnpm-lock.yaml`; configure explicit Node-environment unit discovery in `packages/frontend/vitest.config.ts`, strict test/config inclusion in `packages/frontend/tsconfig.json`, and `test:unit`. Validate repository gates and commit this tool setup separately.
- [x] T002 Add and pin `@cucumber/cucumber` and `playwright` in `packages/frontend/package.json` and `pnpm-lock.yaml`; configure ESM erasable-TypeScript loading in `packages/frontend/cucumber.mjs` and strict support-code inclusion in `packages/frontend/tsconfig.json`. Add direct `test:bdd:dry` and production-first `test:bdd` scripts from `specs/001-tenant-resolution/plan.md`, distinct partition reports, and generated-artifact exclusions in `.gitignore`. Prove pinned Node/Cucumber loading; validate and commit this setup separately from T001.
- [x] T003 Scaffold non-passing, deduplicated bindings for all root `features/*.feature` scenarios in `packages/frontend/tests/bdd/steps/tenant.steps.ts` and scenario-local typed evidence in `packages/frontend/tests/bdd/support/world.ts`; run dry discovery and account for 52 expanded cases, 27 production and 25 remaining, without claiming pending steps pass.
- [x] T004 Implement owned server/browser/request lifecycle in `packages/frontend/tests/bdd/support/server.ts` and `packages/frontend/tests/bdd/support/hooks.ts`: lazy startup after Given overrides, isolated synthetic environment, no inherited tenant settings, bounded listener/process readiness tolerating intentional errors, occupied-port refusal, restart, cleanup on failure, and loopback hostname mapping. Run serial partitions with production fully stopped before development and no existing-server reuse.

## Phase 2: Foundational contracts

**Blocks story implementation.** Honor the recorded Principle III exception only for explicit development static mode; its scope, authorization, and removal trigger remain in `plan.md`. No database, backend, authentication, or extra configuration fields.

- [x] T005 Write failing shared model/source validation cases in `packages/frontend/tests/unit/tenant-source.test.ts` for the exact constraints in T006–T007, empty known sets, duplicate names versus duplicate slugs, missing/mismatched records, and unavailable sources (FR-003, FR-006, FR-013, FR-015).
- [x] T006 Define readonly identity/configuration/context/failure types in `packages/frontend/src/tenant/model.ts`: slug is a “canonical lowercase ASCII DNS label: 1–63 characters, letters/digits with optional interior hyphens, no leading/trailing hyphen”; “`www` is reserved and cannot identify a tenant”; “configured slugs must already be canonical.” For `displayName`, enforce “Required; nonempty after checking trimmed whitespace; preserve valid supplied text.” Preserve “Unknown configuration fields are rejected for this slice.” Origins are exactly `host-associated` and `local-static`; failures are exactly `invalid-host`, `unknown-tenant`, `invalid-settings`, `invalid-config`, `config-unavailable`, `invalid-context` (FR-001, FR-006, FR-009, FR-015).
- [x] T007 Implement the async replaceable `readTenantRecord(slug)` source contract and immutable static source in `packages/frontend/src/tenant/source.ts`; enforce “A source lookup for one slug must return that same slug or fail” and “Duplicate slugs invalidate static-source configuration; duplicate Display Name values are allowed.” Keep HTTP and environment globals out, parse no durable source, expose no write interface, and make T005 pass (FR-003, FR-005, FR-006, FR-013).
- [x] T008 Write failing mode/settings cases in `packages/frontend/tests/unit/tenant-policy.test.ts` and `packages/frontend/tests/unit/tenant-settings.test.ts`: omitted/invalid mode, production static attempt, selected-source-only parsing, lazy initialization, safe diagnostic capture, and logging failure that cannot alter resolution (FR-007, FR-010, FR-014).
- [x] T009 Implement pure `selectTenantMode` in `packages/frontend/src/tenant/mode.ts` and server-only composition in `packages/frontend/src/tenant/settings.ts`. Apply “The application mode has exactly two values: `host` and `static`. Absence selects `host`”; static is development-only and “requires exactly one explicit local record.” Unsupported values select host and return the exact optional readonly `invalid-mode` record specified in `contracts/tenant-context.md`; log it through a captured/testable warning sink to stderr once per lazy initialization per worker, never through HTTP. Parse only the selected environment source, keep records fixed until restart, and make T008 pass.

**Checkpoint**: Shared validation and settings tests pass without Next page imports; all model constraints and diagnostic payloads match the design.

## Phase 3: US1 — Reach the correct tenant (P1, MVP)

**Goal**: A production host selects one tenant and the landing page shows its Display Name.
**Independent test**: Two synthetic production hosts show their respective names under reload/concurrency; invalid/unknown hosts return real 403 with no redirect or fallback. Contract injection proves source replacement and safe failure handling.

- [x] T010 [P] [US1] Add failing production host, spoofing, and orchestration cases in `packages/frontend/tests/unit/tenant-policy.test.ts` and `packages/frontend/tests/unit/tenant-context.test.ts`: complete host grammar/port limits, one binder call, repeated bound reads without binding, source substitution, and failure outcomes (FR-001–FR-005, FR-012–FR-014).
- [x] T011 [P] [US1] Replace the US1 stubs in `packages/frontend/tests/bdd/steps/tenant.steps.ts` with assertions for `features/tenant-landing-page.feature`; separate injected contract results, response-adapter results, and live browser/HTTP evidence using the plan matrix. Assert actual 500/no redirect for invalid names and preserve safe mismatch/unavailability diagnostics. Demonstrate failure before implementation (SC-001, SC-002, SC-005–SC-007).
- [x] T012 [US1] Implement production Host parsing in `packages/frontend/src/tenant/host.ts` and host-mode `resolveTenant`/`readBoundTenant` in `packages/frontend/src/tenant/resolve.ts`; use only authoritative Host, normalize host case, enforce `{slug}.pathable.com` and all rejection rules from `contracts/tenant-context.md`, bind once, validate matching records, and never rebind or fall back (FR-001–FR-005, FR-013).
- [x] T013 [US1] Implement upstream identity encoding/validation in `packages/frontend/src/tenant/handoff.ts` and the HTTP adapter in `packages/frontend/src/proxy.ts`; overwrite all incoming `x-preets-tenant-*` values, forward only slug/origin, map failures to specified 403/500/503 safe text, and explicitly set outgoing `Cache-Control: private, no-store` on both successful tenant-dependent HTML/RSC/prefetch responses and all refusal/error responses without relying on framework defaults. Cover every tenant-consuming HTML/RSC/prefetch path with no client-controlled skip bypass; add adapter assertions in `packages/frontend/tests/unit/tenant-response.test.ts` (FR-002–FR-004, FR-013).
- [x] T014 [US1] Prove production-build refusals and spoofed-header/RSC/prefetch protection before page wiring using `packages/frontend/tests/bdd/steps/tenant.steps.ts`; include direct HTTP variants not expressible by browser navigation, distinguish transport rejection from application 403, and record real status/header evidence in `specs/001-tenant-resolution/quickstart.md` (FR-002–FR-004, SC-002, SC-006).
- [x] T015 [US1] Implement server-only React-cached `getCurrentTenant` and delegating `getCurrentTenantConfig` in `packages/frontend/src/tenant/current.ts`; validate established handoff and matching immutable source, refuse invalid context, and avoid Host parsing, global state, or persistent caching. Complete repeated-reader and concurrent-request coverage in `packages/frontend/tests/unit/tenant-context.test.ts` (FR-004, FR-005, FR-012).
- [x] T016 [US1] Locate and read installed `@pathableai/react/agent-guidance/pathable-react/SKILL.md` and relevant text guidance before updating `packages/frontend/src/app/page.tsx`; render `Tenant: {displayName}` through PathAble `Text` after the existing heading, preserve SSR, button behavior and keyboard path, allow long-name wrapping, and expose no slug/debug UI (FR-016).
- [x] T017 [US1] Run the US1 browser/HTTP/contract cases in `features/tenant-landing-page.feature` through `packages/frontend/cucumber.mjs`; prove two-tenant isolation under overlap/reloads, escaped accessible text, focus continuity, safe source errors, final served `Cache-Control: private, no-store` on successful HTML/RSC/prefetch and refusal/error responses, and equal-name/distinct-slug evidence. Record actual results and remaining deployment ingress prerequisites in `specs/001-tenant-resolution/quickstart.md` (SC-001, SC-002, SC-005–SC-007).

## Phase 4: US2 — Work locally with supplied configuration (P1)

**Goal**: Explicit static mode shows one supplied name on bare localhost and refreshes it after restart.
**Independent test**: Visit localhost with supplied config, change name and restart, observe the new name; invalid data returns actual 500/no redirect and no tenant fallback.

- [x] T018 [P] [US2] Add failing static-context, no-binder, origin, and malformed/missing local-record assertions in `packages/frontend/tests/unit/tenant-context.test.ts` (FR-009, FR-010, SC-005).
- [x] T019 [P] [US2] Implement failing US2 bindings in `packages/frontend/tests/bdd/steps/tenant.steps.ts` for `features/local-static-tenant-configuration.feature`: initial visit/restart in one scenario, safe text/focus assertions, actionable invalid-data messages, real 500/no redirect, and pure static-origin evidence (SC-003–SC-005, SC-007).
- [x] T020 [US2] Implement static-mode resolution and bound reads in `packages/frontend/src/tenant/resolve.ts`, integrating the selected local record through `packages/frontend/src/tenant/settings.ts` and development error guidance in `packages/frontend/src/proxy.ts`; do not invoke Host binding, fabricate host association, use fallback records, or enable static mode in production (FR-007, FR-009, FR-010).
- [x] T021 [US2] Document static startup and JSON record examples in `packages/frontend/.env.example` and `README.md`, including `TENANT_LOCAL_CONFIG_JSON`, ignored `.env.local`, restart after name changes, and missing/invalid-data recovery; use only synthetic records and keep Display Name the only configuration field (FR-006, FR-011).
- [x] T022 [US2] Run all US2 cases from `features/local-static-tenant-configuration.feature` and relevant unit tests; record initial/updated names, static-origin contract proof, actual failures, accessible text and keyboard results in `specs/001-tenant-resolution/quickstart.md` (SC-003–SC-005, SC-007).

## Phase 5: US3 — Exercise production-like resolution locally (P2)

**Goal**: Developers explicitly enable local host binding with production-equivalent known/unknown behavior.
**Independent test**: Known `{slug}.localhost` addresses show matching names across ports; bare/unknown/invalid hosts return 403. Unsupported mode keeps binding and reports its safe diagnostic; local settings cannot bypass production.

- [x] T023 [P] [US3] Add failing local suffix/port and unsupported-mode known/unknown-host tests in `packages/frontend/tests/unit/tenant-policy.test.ts`; capture exact selector metadata and verify no local static record is consulted (FR-007, FR-008, FR-014).
- [x] T024 [P] [US3] Implement failing US3 bindings in `packages/frontend/tests/bdd/steps/tenant.steps.ts` for `features/local-host-tenant-resolution.feature`; share fixtures but keep browser Display Name separate from pure slug evidence, capture mode diagnostics in World, and retain `@production` on production bypass cases (SC-002, SC-003, SC-006, SC-007).
- [x] T025 [US3] Add the fixed development `{slug}.localhost` host pattern in `packages/frontend/src/tenant/host.ts` and integrate runtime selection in `packages/frontend/src/tenant/resolve.ts`; retain bare-localhost refusal, valid port invariance, host default/invalid-mode behavior, and production rejection of static bypass (FR-007, FR-008, FR-014).
- [x] T026 [US3] Complete both-mode enable/disable instructions and known-record JSON examples in `README.md` and `packages/frontend/.env.example`, covering default/unsupported modes, accepted-mode diagnostic guidance, production restrictions, and stopping/restarting the owning process (FR-011, FR-014).
- [x] T027 [US3] Run all US3 cases from `features/local-host-tenant-resolution.feature` against their specified runtimes; rebuild before production cases and record host/refusal, diagnostic, port, accessible-name and keyboard evidence in `specs/001-tenant-resolution/quickstart.md` (SC-002, SC-003, SC-006, SC-007).

## Phase 6: Polish and completion evidence

- [x] T028 [P] Synchronize `docs/multi-tenancy.md`, `docs/authentication.md`, `docs/domain-persistence.md`, and `docs/docker-compose.md` with research decision 8: unknown tenant is 403, this increment supplies static Display Name only, durable configuration/auth/session architecture remains future work, and local configuration needs no external services. Preserve the approved local-only exception and deployment trust limitations.
- [x] T029 [P] Extend existing Quality/Build jobs in `.github/workflows/ci.yml` with frontend Vitest and production-first Cucumber respectively; install Chromium using the frontend-filtered pinned CLI and retain existing check names and root policy. Verify test/config discovery in `.fallowrc.json` without blanket suppressions or a second lockfile.
- [x] T030 Run full `test:bdd:dry`, unit tests, fresh build, and both Cucumber partitions configured in `packages/frontend/cucumber.mjs`; require all 52 cases, zero pending/undefined/ambiguous failures, separate reports, and actual HTTP assertions. Then rebuild after development and prove a production known-tenant request. Record pinned runtime, partition counts, lifecycle results, build duration and full-suite duration in `specs/001-tenant-resolution/quickstart.md`; optimize process reuse only if measured cost warrants it.
- [ ] T031 Have one developer independently execute both local setup workflows and a Display Name change/restart from `README.md` and `specs/001-tenant-resolution/quickstart.md`; fill the existing walkthrough record with date/environment, per-step pass/fail, observed names/statuses, and corrections followed by reruns. Keep this task pending until actual human workflow evidence exists (SC-003).
- [x] T032 Run `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm format:check`, and `pnpm check:unused`, plus applicable feature tests, from the root; investigate failures, apply lint fixes before formatting, preserve the normal hook audit, and record results in `specs/001-tenant-resolution/quickstart.md`. Review code ownership, synthetic fixtures, configuration scope, server-only boundaries, and the scoped exception against `specs/001-tenant-resolution/plan.md`; do not claim deployment readiness or commit generated output.

## Dependencies and execution order

Setup T001–T004 → foundations T005–T009 → US1 T010–T017 → US2 T018–T022 → US3 T023–T027 → completion T028–T032.

Within foundations, T005 precedes T006–T007; T008 precedes T009. Within each story, tests must fail before implementation and the checkpoint must pass before proceeding. T014 is an intentional boundary proof before T015–T016 page wiring. T016 requires T015. T030 requires all stories and T029; T031 requires final documentation and completed runtime workflows; T032 is the final gate.

US2 and US3 reuse US1's resolver, Proxy and page, so implementation is intentionally sequential rather than falsely independent. Each story still has a self-contained acceptance fixture and can be validated without relying on a previous scenario's state. MVP is setup + foundations + US1; it is an internal production-build demonstration, not completion of both P1 stories or deployment approval.

## Parallel examples

Only the following same-phase groups are marked `[P]`; start them after their phase prerequisites, and join before implementation:

- US1: T010 unit tests and T011 Cucumber assertions edit different files.
- US2: T018 unit tests and T019 Cucumber assertions edit different files.
- US3: T023 unit tests and T024 Cucumber assertions edit different files.
- Completion: T028 strategy documentation and T029 CI/discovery configuration edit different files.

Do not run story implementation in parallel across shared resolver/settings/step files. Setup dependency changes share the manifest and lockfile and remain sequential focused commits.

## Requirement coverage index

| Requirements  | Primary tasks                                |
| ------------- | -------------------------------------------- |
| FR-001–FR-004 | T006–T007, T010–T014, T017                   |
| FR-005–FR-006 | T005–T007, T010–T012, T015–T017, T021        |
| FR-007–FR-008 | T008–T009, T020, T023–T027                   |
| FR-009–FR-011 | T006, T008–T009, T018–T022, T026, T031       |
| FR-012–FR-013 | T007, T010–T015, T017                        |
| FR-014        | T008–T009, T023–T027                         |
| FR-015–FR-016 | T005–T007, T011, T016–T019, T022, T024, T027 |
| SC-001–SC-002 | T014, T017, T024, T027, T030                 |
| SC-003–SC-004 | T019–T022, T026–T027, T031                   |
| SC-005–SC-006 | T010–T015, T017–T020, T024, T027             |
| SC-007        | T011, T016–T019, T022, T024, T027            |

## Implementation strategy

Deliver the US1 MVP first and demonstrate actual refusal/name behavior. Add static configuration and its restart workflow next, then local host parity. Maintain passing completed-story checks while later-story stubs remain explicitly pending; only the final full-suite gate can claim feature acceptance. Keep tool setup commits focused, and validate before each commit. Run `$speckit-analyze` on these artifacts before implementation.
