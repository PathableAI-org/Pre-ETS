# Tasks: Establish Distributed Application Sessions

**Input**: [spec.md](spec.md), [verification.md](verification.md), [plan.md](plan.md),
[research.md](research.md), [data-model.md](data-model.md), [module contracts](contracts/modules.md),
[callback contract](contracts/callback-http.md), [quickstart.md](quickstart.md), and the
[clean critique](critiques/critique-20261023-165112.md).

**Branch**: `156-distributed-sessions-plan` · **Delivery**: #218 / S2-D · **Design revision**: current plan documents on this branch

**Status**: Planned implementation work. Every task remains unchecked until its stated behavior or evidence has been
completed at an identified implementation revision. Passing static checks does not establish runtime session behavior.

**Tests**: Required by the approved verification plan. Write the named public-service, adapter, real-Redis, issue-level
browser, and bounded BDD evidence before the implementation it protects, observe a meaningful failing result, and then
make it pass.
Keep telemetry verification manual or transient; never retain assertions over logs, spans, attributes, exporter
payloads, or exporter wiring.

**Scope**: Establish and read initial frontend-owned Redis session state after a freshness-confirmed callback. Preserve the
root `hasSession()` compatibility result as false. Do not add protected-entry enforcement, renewal, invalidation,
warning UI, recovery coordination, backend session consumption, arbitrary session values, or provider-neutral
freshness claims; those remain with #219/#154/#220/#221/#155–#158.

## Format and execution conventions

`- [ ] Tnnn [P?] [USn?] Action with exact paths`

- Paths are repository-relative. New paths named below are intentional; do not add parallel services, runners,
  exporters, identity stacks, or diagnostic product endpoints.
- `[P]` means different files and no dependency on another unfinished task in the phase. It never authorizes concurrent
  edits to a shared file or use of a shared mutable Redis prefix/provider fixture.
- `spec.md`, `verification.md`, the delivery issue/plan, and current-main requirements are read-only authorities.
  Implementation tasks may record evidence separately but must not revise those authorities to fit the code.
- Only `packages/frontend/src/lib/session.ts` imports `packages/frontend/src/lib/session/codec.ts` and
  `packages/frontend/src/lib/session/store.ts`. Tests, the callback, the runtime, the issue-level browser test, and temporary probes use the
  public parent. Authentication and tenant modules do not import session.
- Before Effect work, read `docs/engineering/effect-guidance.md`, `packages/frontend/AGENTS.md`, the available Effect v4
  checkout's `LLMS.md`, and only the linked examples needed for services/Layers, tests, time, runtime, and tracing.
  Installed frontend declarations remain authoritative. Before modifying Next Route Handler/cookie behavior, inspect
  the installed Next 16.4.2 documentation under `packages/frontend/node_modules/next/dist/docs/`.
- Before test work, read `docs/engineering/testing/README.md`. Requirements BDD work also reads
  `docs/engineering/testing/requirements-bdd.md`, refreshes current `origin/main`, and uses
  `requirements-bdd-author`, `requirements-bdd-scaffold`, and `requirements-bdd-review` as applicable.
- Use only synthetic fixtures and owned prefixes. Never retain provider tokens, credentials, callback parameters,
  cookie/reference values, derived Redis keys, encoded records, identity payloads, or the complete `session.id`.
- Do not add suppressions. Apply lint fixes before formatting, preserve the root pre-commit hook, and do not commit
  generated output, temporary probes, credentials, or verification transcripts containing sensitive values.

## Phase 1: Baseline and declaration inspection

**Purpose**: Reconfirm authority and the installed APIs before implementation. Requirements, plans, and issues remain
read-only.

- [ ] T001 Refresh `origin/main`, record its current SHA, re-read issue #218 and the reviewed S2-D slice, and compare baseline `f43cbef2f426bf59cf2bade4cc2534231676b4cc` with current `origin/main` for `docs/requirements/session/PREETS-SESSION-003.md`, `docs/requirements/session/PREETS-SESSION-006.md`, `docs/requirements/session/PREETS-SESSION-008.md`, `docs/requirements/session/PREETS-SESSION-013.md`, and `docs/engineering/testing/requirements-bdd.md`; stop for the owning specification/planning workflow on material drift rather than editing `specs/009-distributed-sessions/spec.md` or `specs/009-distributed-sessions/verification.md`.
- [ ] T002 Inspect `.node-version`, `package.json`, `packages/frontend/package.json`, `packages/frontend/src/lib/session.ts`, `packages/frontend/src/lib/authentication.ts`, `packages/frontend/src/lib/runtime.ts`, installed Effect 4.0.5/Redis declarations under `packages/frontend/node_modules/`, and the relevant Next 16.4.2 Route Handler/cookie documentation under `packages/frontend/node_modules/next/dist/docs/`; confirm the planned `Context.Service`, `Schema.TaggedError`, `Effect.fn`, `Effect.annotateCurrentSpan`, `Clock`/`DateTime`, Redis `send`, `Layer`, `ManagedRuntime`, and multi-`Set-Cookie` APIs before dependent edits.

**Checkpoint**: Current authority and installed API truth are known. Any incompatible declaration or authority drift is a
planning blocker, not an implementation-time invention.

## Phase 2: Foundational public boundaries

**Purpose**: Establish the exact additive contracts consumed by every story. Depends on T001–T002.

- [ ] T003 [P] Export the existing readonly `TrustedIdentity` interface from `packages/frontend/src/lib/authentication.ts` and type `tenantAlias` as the branded `TenantAlias` exported from `packages/frontend/src/lib/tenant.ts`. `complete` already returns the alias from `getAlias`; do not widen it to `string` or add a cast. Do not change `AuthenticationService.complete`'s callback validation, provider-token ownership, or existing expected failures. The exported fields remain `authenticatedAt`, `issuer`, `subject`, and `tenantAlias`, and session persistence must never receive provider tokens. Export the existing `TenantAlias` schema and type without changing `TenantConfigService` operations.
- [ ] T004 [P] Replace the presence-only public shape in `packages/frontend/src/lib/session.ts` with the exact contract from `specs/009-distributed-sessions/contracts/modules.md`: branded `SessionReference`; `SessionIdentity`; `EffectiveSessionPolicy`; `EstablishSessionInput`; `EstablishedSession`; `UsableSession`; fieldless `NoUsableSession`; fieldless `SessionServiceUnavailable`; `establish(input): Effect<EstablishedSession, SessionServiceUnavailable>`; `read({ reference? }): Effect<UsableSession | NoUsableSession, SessionServiceUnavailable>`; and unchanged `hasSession(): Effect<boolean>`. Declare `SessionService.layer` as requiring Config and Effect Redis, keep the telemetry identifier private, and retain `hasSession()` as false until #219 supplies request reference and independent tenant binding.

**Checkpoint**: Public consumers and tests can target exact success/error semantics without importing future private
children. Foundation alone is not a working session flow.

## Phase 3: User Story 1 — Establish a tenant-bound session (P1) 🎯 MVP

**Goal**: A confirmed-fresh real callback establishes exactly one session for the validated issuer/subject and tenant,
derives the initial deadline/warning policy, and issues one host-only `pathable-session` cookie only after persistence
succeeds. A trusted result whose freshness is unconfirmed does not.

**Independent test**: When freshness has been confirmed, complete real local-Keycloak authentication through
`/auth/callback`, observe the empty private 204 and one correctly scoped cookie, and read the resulting reference
through the public session capability to compare the synthetic identity, trusted tenant, initial deadline, and
effective warning policy. Rejected authentication, and a trusted result whose freshness is unconfirmed, create neither
a record nor a session cookie. Do not choose the comparison or clock policy in this test.

### Tests first

- [ ] T005 [P] [US1] Create fresh-world public-service scenarios in `packages/frontend/tests/lib/session.test.ts` and a deterministic Redis test Layer in `packages/frontend/tests/helpers/session.ts` for successful establishment and usable read through `SessionService` only. Cover default/omitted, warning-disabled, and explicit valid policies with the controlled Effect clock; compare issuer/subject, exact tenant alias, derived deadline, and warning lead, and assert the returned 43-character reference exposes none of those values. Do not import `src/lib/session/codec.ts` or `src/lib/session/store.ts`, inspect private calls, or assert telemetry.
- [ ] T006 [P] [US1] Extend callback adapter scenarios in `packages/frontend/tests/unit/authentication-entry.test.ts` so a freshness-confirmed trusted `AuthenticationService.complete` result passes branded `tenantAlias` to `TenantConfigService.getConfigFromAlias` with no cast, supplies its effective policy to `SessionService.establish`, returns the existing empty private/no-store 204, clears `oidc-correlation`, and writes exactly one `pathable-session` only after establishment succeeds. A trusted result with unconfirmed freshness does not call `establish` or write a cookie. Assert `HttpOnly`, `SameSite=Lax`, `Path=/`, omitted `Domain`, the existing loopback `Secure` rule, and lifetime no later than the authoritative deadline without retaining the cookie value, choosing a freshness comparison, or duplicating Redis behavior.
- [ ] T007 [P] [US1] Add runner-neutral harness regression checks in `tests/bdd/checks/oidc-harness.test.ts` for the planned `tests/support/oidc/harness.ts`: owned application hops retain logical Host, callback routing can target the intended frontend process, external Keycloak traffic keeps its real destination, process readiness is bounded, and owned browser/process resources always close. Assert observable routing/lifecycle outcomes rather than helper calls; add no second provider implementation or dependency.
- [ ] T008 [P] [US1] Create the initially failing issue-level workflow in `tests/bdd/session/session-establishment.test.ts` and run it with `node --test tests/bdd/session/session-establishment.test.ts` after Redis and Keycloak are ready. Use the `playwright` library through the shared harness. Do not add the file under `tests/bdd/checks/`, and do not restore an `e2e/` directory, `@playwright/test`, or `pnpm test:e2e`. Complete real Keycloak sign-in only when freshness has been confirmed; otherwise record that the success path is blocked. Observe callback status/body/cache behavior and host-only cookie metadata, pass the captured reference without printing it to an independently scoped public `SessionService`, and compare the returned synthetic identity/tenant/deadline/warning policy. Include a rejected-provider case and a trusted result with unconfirmed freshness, both with no session cookie or usable session. Keep these issue-level V-001–V-004/V-008 assertions out of requirements BDD.

### Implementation and integration

- [ ] T009 [US1] Implement strict private reference and version-1 record schemas/encoders in `packages/frontend/src/lib/session/codec.ts`. Preserve these model constraints verbatim: the browser reference is "32 random bytes encoded as unpadded base64url (43 characters)"; `version` is literal `1`; issuer/subject/tenant alias are non-empty; `idleDeadlineEpochMilliseconds` is a positive integer later than the establishment clock; `warningLeadMinutes` is an integer at least zero and strictly less than the establishment timeout; and `telemetryId` is a random UUID independent from the reference. The record contains no provider token, credential, callback evidence, role, arbitrary value, refresh timestamp, maximum lifetime, or tombstone.
- [ ] T010 [US1] Implement the private Redis adapter in `packages/frontend/src/lib/session/store.ts` with Config-owned `SESSION_KEY_PREFIX` (use the versioned session-only default `preets:session:v1` and explicit owned prefixes in tests), SHA-256 addressing of the opaque reference, `SET key payload NX PX ttl`, and non-consuming `GET`. Return only store-level created/exists/payload outcomes to the parent; translate Redis transport/command causes without logging payloads, references, keys, identity fields, or unsafe causes. Never use `GETDEL`, `FLUSHALL`, a second Redis service, process memory, or arbitrary value operations.
- [ ] T011 [US1] Implement `SessionService.layer` in `packages/frontend/src/lib/session.ts` using the private codec/store from T009–T010. `establish` uses Effect time/randomness, computes deadline and Redis TTL from the already validated policy, retries at most three random-reference collisions, returns only after a successful write, and maps encode/store/exhausted-collision failure to `SessionServiceUnavailable`; ambiguous writes never return a reference. `read` decodes the untrusted optional reference before Redis, returns `UsableSession` only before the stored deadline, and keeps the telemetry ID private. Add useful `Effect.fn("SessionService.establish")` and `Effect.fn("SessionService.read")` spans; annotate `session.id` only after successful write/usable read, never on failure/no-usable outcomes, and add no durable telemetry assertions.
- [ ] T012 [US1] Recompose `packages/frontend/src/lib/runtime.ts` around one `NodeRedis.layer` value shared by the authentication transaction graph and `SessionService.layer`; preserve the existing URL, offline-queue, ping, socket-timeout, eager readiness, ConfigProvider, NodeServices, logger, observability, `ManagedRuntime`, and disposal behavior. Do not construct Redis clients/runtimes per request or add another exporter/service.
- [ ] T013 [P] [US1] Add the `pathable-session` name and framework cookie write behavior to `packages/frontend/src/app/auth/cookie.ts`: opaque reference only; `HttpOnly`; `SameSite=Lax`; `Path=/`; no `Domain`; `Secure` except the existing explicit loopback allowance; and lifetime bounded by the established deadline. Preserve the existing callback-path correlation clear so both `Set-Cookie` values survive on success.
- [ ] T014 [US1] Extend `packages/frontend/src/app/auth/callback/route.ts` as the sole callback-to-session consumer: after trusted completion whose freshness has been confirmed, pass branded `TrustedIdentity.tenantAlias` to `TenantConfigService.getConfigFromAlias` with no cast, derive `effectiveSessionPolicy`, call `SessionService.establish`, and only then emit the session cookie with the existing empty 204/private-no-store response and correlation clear. A trusted result without freshness confirmation, and rejected authentication, never invoke establishment or emit a session cookie. Do not choose the authentication-time comparison or clock tolerance. Keep framework execution on the shared runtime and preserve tenant/provider validation ownership; do not add a coordinator service, protected read, retry of the callback, or identity/policy in the response/cookie.
- [ ] T015 [US1] Extract only runner-neutral browser/process/Keycloak mechanics from `tests/bdd/support/browser.ts` and `tests/bdd/support/server.ts` into `tests/support/oidc/harness.ts`; adapt `tests/bdd/support/browser.ts`, `tests/bdd/support/server.ts`, and `tests/bdd/session/session-establishment.test.ts` to consume that shared fixture while retaining Cucumber world-specific state in `tests/bdd/support/`. Give every runner unique `SESSION_KEY_PREFIX` and `OIDC_TX_KEY_PREFIX`, preserve bounded readiness/finalizers, and make T007 pass without parallel provider harnesses, a restored `e2e/` runner, or shared mutable prefixes.
- [ ] T016 [US1] Make `tests/bdd/session/session-establishment.test.ts` pass against real Redis and Keycloak after T009–T015, using `node --test tests/bdd/session/session-establishment.test.ts` and only the public `SessionService` for the second-client read and scoped disposal for every runtime/browser/process. If the B6/#158 freshness confirmation is still absent, the confirmed-fresh success case stays blocked and the unconfirmed/rejected cases must pass with no cookie. Record the exercised revision, service versions, owned prefixes, safe comparisons, command result, cleanup, and limitations in the implementation PR using `specs/009-distributed-sessions/quickstart.md`; do not retain cookie/reference/key/record/telemetry values or claim protected-entry behavior.
- [ ] T017 [US1] Use `requirements-bdd-author` and `requirements-bdd-scaffold` to revise `tests/bdd/requirements/tenant-oidc-callback.feature` and `tests/bdd/steps/authentication.ts`: remove the successful-callback claim/step that creates no application session, update the feature-level `@partial` description, and preserve only current-main PREETS-SESSION-003 establishment/rejection assertions that the running boundary can actually observe. Keep failure/replay no-session assertions where still true; do not add cookie-shape, Redis, `session.id`, failure-vs-absence, or hidden user/tenant-binding assertions, and do not create a diagnostic endpoint.

**Checkpoint / MVP demo**: The real callback can establish and expose one bounded session through the public capability.
This is the smallest useful construction demo; US2 independent-client consistency, US3 fail-closed completion, and the
final manual/telemetry evidence remain required before feature completion.

## Phase 4: User Story 2 — Retrieve consistent shared session state (P2)

**Goal**: Independently scoped session clients read identical user, tenant, authoritative deadline, and warning policy
from one Redis record without creator affinity or read-time mutation.

**Independent test**: Establish through client/runtime A, read repeatedly through independently scoped client/runtime B
against real Redis, and compare every public field. Dispose and recreate B, then read the same unchanged record again.

### Evidence and completion

- [ ] T018 [P] [US2] Extend `packages/frontend/tests/lib/session.test.ts` with public-service scenarios showing repeated usable reads preserve identical issuer, subject, tenant alias, deadline, and warning lead without recomputing defaults or exposing telemetry ID; use fresh deterministic Layers and the controlled clock, and keep `hasSession()` false for the no-input root consumer.
- [ ] T019 [P] [US2] Create `packages/frontend/tests/integration/session-redis.test.ts` with unique owned prefixes and at least two independently scoped `NodeRedis`/`SessionService` runtimes: establish on A, read on B, dispose/recreate B, and compare only the public user/tenant/deadline/warning fields on repeated reads. Inspect safe TTL/key-count metadata only, never import private session children or retain reference/key/payload/telemetry values, and remove only owned keys in a scoped finalizer.
- [ ] T020 [US2] Run the focused public-service and real-Redis success cases in `packages/frontend/tests/lib/session.test.ts` and `packages/frontend/tests/integration/session-redis.test.ts`; record separate deterministic-Layer versus real-adapter results, revision, Redis version, owned-prefix cleanup, and the explicit limit that this is not independently running protected HTTP recognition in the implementation PR using `specs/009-distributed-sessions/quickstart.md`.

**Checkpoint**: A second client can recover stable public state without affinity. No protected request consumes it yet.

## Phase 5: User Story 3 — Fail closed for unavailable sessions (P3)

**Goal**: Consumers distinguish usable state, ordinary no-usable-session outcomes, and typed service failure; no failure
creates a cookie, replacement login, identity, or policy.

**Independent test**: Through the public service, exercise absent, malformed, expired, deleted, corrupt, collision, and
real Redis outage conditions. Confirm only the usable result exposes identity/policy, and pair real-adapter failure
translation with callback mapping after a trusted authentication result.

### Tests first

- [ ] T021 [P] [US3] Extend `packages/frontend/tests/lib/session.test.ts` with public-service scenarios for absent and malformed references (malformed performs no Redis lookup), missing records, still-present records read at/after the authoritative deadline, deleted records, strict record corruption/unknown version, create collisions, and Redis read/write failure. Assert missing/malformed/expired/deleted produce fieldless `NoUsableSession`; corrupt/transport/exhausted-collision conditions produce `SessionServiceUnavailable`; and no non-usable outcome exposes identity, tenant, deadline, policy, reference, key, payload, or telemetry ID.
- [ ] T022 [US3] Extend `packages/frontend/tests/integration/session-redis.test.ts` with real-adapter missing/deleted/expired and controlled unavailable-store cases for establish and read. Restore Redis readiness before later cases and clean only the validated owned prefix. Treat real outage translation to `SessionServiceUnavailable` as adapter evidence only; do not claim that stopping the shared Redis instance exercises post-authentication callback session failure because OIDC transaction recovery would fail first.
- [ ] T023 [P] [US3] Add callback failure mapping scenarios in `packages/frontend/tests/unit/authentication-entry-failures.test.ts`: begin with a trusted `AuthenticationService.complete` result, then inject tenant lookup failure or `SessionServiceUnavailable`; require the existing generic private/no-store "Sign-in could not continue" page and return-to-entry link, clear consumed correlation, emit no `pathable-session`, and never silently retry/create a replacement. Keep pre-consumption rejection disposition unchanged and assert no raw provider/storage/cause data in the HTTP response.

### Failure implementation and verification

- [ ] T024 [P] [US3] Complete failure semantics in `packages/frontend/src/lib/session/codec.ts`, `packages/frontend/src/lib/session/store.ts`, and `packages/frontend/src/lib/session.ts` to make T021–T022 pass: absent/malformed/missing/expired/deleted are `NoUsableSession`; strict decode corruption, Redis transport/command failure, ambiguous create, and three exhausted collisions are `SessionServiceUnavailable`; defects and interruption remain defects/interruption. Do not add tombstones, retained reasons, renewal/invalidation operations, replacement sessions, or telemetry on unsuccessful paths.
- [ ] T025 [P] [US3] Complete post-validation tenant/session failure mapping in `packages/frontend/src/app/auth/callback/route.ts` and `packages/frontend/src/app/auth/cookie.ts` to make T023 pass. Preserve the existing safe presentation in `packages/frontend/src/app/auth/presentation.tsx` unchanged unless a demonstrated contract defect requires a bounded correction; issue no session cookie after any failed/ambiguous write and preserve both pre-/post-consumption correlation dispositions.
- [ ] T026 [US3] Run `packages/frontend/tests/lib/session.test.ts`, `packages/frontend/tests/integration/session-redis.test.ts`, and `packages/frontend/tests/unit/authentication-entry-failures.test.ts`; record the paired V-007 evidence explicitly: real adapter unavailability becomes `SessionServiceUnavailable`, while a trusted callback with injected `SessionServiceUnavailable` produces the safe no-cookie response. Record limits and restored readiness in the implementation PR using `specs/009-distributed-sessions/quickstart.md`; do not describe the pair as one fully composed whole-store-outage callback.

**Checkpoint**: All public session outcomes are distinct and fail closed. Completed outage recovery remains #221.

## Phase 6: Polish and cross-cutting completion

**Purpose**: Synchronize implementation documentation, execute the complete evidence plan, inspect real exported
telemetry, clean temporary resources, and run repository gates after all stories.

- [ ] T027 [P] Update `docs/session-state.md` and `docs/authentication.md` from the implemented public behavior: trusted callback establishment, server-held Redis record, opaque host-only `pathable-session`, initial deadline/warning state, shared-reader capability, typed failure/no-usable distinction, and explicit #219/#154/#220/#221 limits. Remove superseded statements that callback always creates no session, but do not claim protected-entry consumption, renewal, invalidation, warning UI, or production verification.
- [ ] T028 [P] Update `packages/frontend/.env.example` and `docs/docker-compose.md` with `REDIS_URL`, versioned `SESSION_KEY_PREFIX`, separate `OIDC_TX_KEY_PREFIX`, local Keycloak/session prerequisites, owned-prefix cleanup, and rollback/TTL behavior. Remove the stale `SESSION_SIGNING_SECRET` instruction because this design uses an opaque random lookup reference, and retain TLS/authentication requirements for non-local Redis without committing credentials.
- [ ] T029 Use `requirements-bdd-review` on `tests/bdd/requirements/tenant-oidc-callback.feature`, `tests/bdd/steps/authentication.ts`, and the shared fixture changes; run `pnpm test:bdd:checks`, `pnpm lint:gherkin`, `pnpm format:gherkin:check`, `pnpm test:bdd:dry`, and actual `pnpm test:bdd`. Record actual execution separately from dry-run discovery, preserve supported current-main tags/feature-level `@partial`, and defer unobservable successful user/tenant binding to #219/#154.
- [ ] T030 Run the focused and full automated evidence through `package.json` and `packages/frontend/package.json`: session public-service tests, callback success/failure adapters, real Redis integration, `node --test tests/bdd/session/session-establishment.test.ts`, full frontend unit/integration suites, and existing authentication/tenant regressions. Record commands, revision, service versions, cleanup, failures, and limitations; do not reinterpret skipped/unready infrastructure, a blocked freshness-confirmation success, or static checks as runtime evidence.
- [ ] T031 Execute the composed browser/public-client procedure in `specs/009-distributed-sessions/quickstart.md` with real Redis, Keycloak, frontend, and owned prefixes: record safe environment metadata, complete a confirmed-fresh callback only when that confirmation exists, and always complete rejected and unconfirmed-freshness callbacks. Inspect the 204/private-no-store response and cookie attributes/content by presence only, and read a successful reference through a second scoped public `SessionService`. Create `packages/frontend/tests/manual/session-read.probe.test.ts` only as temporary instrumentation; provide a fresh `NodeRedis.layer`, `NodeServices.layer`, environment ConfigProvider, existing `observabilityLayer`, and scoped `ManagedRuntime`, print only safe synthetic comparisons, dispose the runtime before trace inspection, and run the probe with `packages/frontend/vitest.config.ts` rather than `vitest.integration.config.ts`.
- [ ] T032 Inspect the real exported traces from T031 through Tempo using `docs/observability.md`: find the successful `SessionService.establish` span under `pre-ets-frontend` and usable `SessionService.read` span under `pre-ets-frontend-session-probe`; confirm the same `session.id` is present on both, differs from/cannot retrieve the cookie or Redis key, and is absent from rejected authentication, failed establishment, and no-usable reads. Inspect span names, attributes, events, status descriptions, and exceptions for Cookie, Authorization, callback parameters, provider tokens, credentials, raw references/keys, encoded records, identity payloads, and secret causes. Retain trace IDs, span names, and presence/equality/secrecy results only—not the full `session.id`—and add no telemetry test.
- [ ] T033 Complete cleanup from `specs/009-distributed-sessions/quickstart.md`: delete `packages/frontend/tests/manual/session-read.probe.test.ts` and any local input/transcript, remove only exact records or keys beneath the validated owned prefix, close browser contexts, dispose runtimes, stop only processes/services started by the run, restore Redis readiness, and verify `git status` contains no generated reports, browser output, credentials, temporary instrumentation, or unrelated package-manager edits. Never use `FLUSHALL`.
- [ ] T034 Exercise the rollback check from `specs/009-distributed-sessions/quickstart.md` when the local/deployment environment supports revision rollback: restore the prior application revision, confirm prior callback behavior and that a remaining `pathable-session` cookie cannot grant protected access, allow new records to expire by TTL, and use only validated deployment-owned-prefix cleanup if necessary. Otherwise record the rollback check as unexecuted with the concrete environment limitation; do not add a feature flag without a newly approved deployment constraint.
- [ ] T035 Run `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm check:unused`, `pnpm format:check`, targeted Spec Kit document formatting, `git diff --check`, and the normal `pnpm check:changes`/pre-commit audit from root `package.json`; fix underlying findings without suppressions and rerun lint after any formatting/fix pass. These gates establish repository quality only, not V-001–V-008.
- [ ] T036 Consolidate the implementation PR execution record using the template and limits in `specs/009-distributed-sessions/quickstart.md`: exact revision/current `origin/main`, environment/service versions, safe synthetic inputs, V-001–V-008 observations, commands/results, Tempo query/trace IDs, redacted `session.id` equality, telemetry secrecy review, cleanup, rollback status, and unexecuted claims. Reconcile every checked task and public contract against this record; preserve the limits on protected entry, application-instance HTTP recognition, renewal/invalidation races, warning/recovery UI, Microsoft/provider-neutral compatibility, production ingress, and SLOs.

## Dependencies and execution order

```text
T001 → T002 → foundation (T003 || T004)
                  ↓
US1 tests (T005 || T006 || T007 || T008)
                  ↓
US1 implementation (T009 → T010 → T011 → T012; T013 → T014; T007 → T015)
                  ↓
US1 integration/evidence (T016 → T017)
                  ↓
US2 evidence (T018 || T019) → T020
                  ↓
US3 tests (T021 || T023; T019 → T022)
                  ↓
US3 implementation (T024 || T025) → T026
                  ↓
Docs (T027 || T028) → BDD/automated evidence (T029 → T030)
                  ↓
Manual feature run (T031 → T032 → T033) → rollback status T034
                  ↓
Quality gates T035 → final evidence reconciliation T036
```

- T003 and T004 are additive contracts in separate files. T005–T008 depend on both stable public shapes where consumed;
  the tests are expected to fail meaningfully until their implementation tasks complete.
- T009 precedes T010 so store addressing consumes the validated private reference shape. T011 owns public semantics and
  precedes the shared runtime T012. T013 can proceed independently, but T011–T013 all precede callback composition T014.
- T007 precedes fixture extraction T015; T015 precedes real-provider execution T016. T017 runs only after the new
  success behavior exists, so BDD removes the superseded assertion without adding issue-only promises.
- US2 reuses the public read capability delivered for US1's composed proof. T018 and T019 add distinct deterministic
  and real-adapter consistency evidence; no duplicate product API is introduced.
- T022 extends the same integration file created by T019 and is serialized. T021 and T023 can be authored in parallel;
  their corresponding implementation work T024 and T025 touches separate module/framework files.
- Final manual and telemetry tasks are sequential because they share a browser session, opaque reference, owned Redis
  prefix, and trace correlation. Cleanup T033 is mandatory even when T031 or T032 fails or trace export is inconclusive.

## Parallel execution examples

These are scheduling examples, not authorization to spawn agents during task generation.

| Phase/story   | Concurrent work after the entry gate                                                                | Join point                                      |
| ------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Foundation    | T003 authentication type export; T004 session public contract                                       | Before all story tests                          |
| US1           | T005 service scenarios; T006 callback adapter scenarios; T007 harness checks; T008 browser workflow | Before corresponding implementation/integration |
| US2           | T018 deterministic repeated-read evidence; T019 real-Redis independent-client evidence              | T020 execution record                           |
| US3           | T021 public failure scenarios; T023 callback failure scenarios                                      | T024/T025 implementation, then T026             |
| Cross-cutting | T027 session/authentication docs; T028 environment/Compose docs                                     | Before final BDD/automated/manual verification  |

Do not share a mutable Redis prefix, browser context, frontend process, or temporary probe between parallel workers.
Tests with mutable Layers use fresh worlds per scenario.

## Implementation strategy

### MVP first: User Story 1

1. Complete baseline and foundational tasks T001–T004.
2. Write US1 evidence T005–T008 before implementation.
3. Implement T009–T015, then execute T016–T017.
4. Stop and demonstrate the bounded real callback/session/cookie handoff.
5. Do not call the feature complete until US2, US3, manual telemetry, cleanup, and final gates finish.

### Incremental delivery

1. **US1** establishes the public record/callback handoff and real-provider reference consumer.
2. **US2** proves stable state through independently scoped real-store clients without affinity.
3. **US3** completes no-usable/service-failure behavior and paired outage evidence.
4. **Cross-cutting completion** reconciles BDD, documentation, full automation, live `session.id` correlation, cleanup,
   rollback status, and repository quality.

## Contract and verification completion map

| Contract or claim                                            | Primary tasks                                | Evidence boundary and approved limitation                                                                            |
| ------------------------------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `SessionService` exact public shapes, invariants, and errors | T004–T005, T009–T12, T018–T24                | Public service plus real Redis; no protected request, renewal, invalidation operation, or arbitrary values           |
| `TrustedIdentity` handoff                                    | T003, T006, T014, T017                       | Confirmed-fresh success enters session composition; the alias stays branded; authentication suites retain validation |
| `TenantConfigService` effective policy ownership             | T006, T014, T016, T027                       | Callback loads the trusted alias and existing service derives policy; no duplicate defaults/validation               |
| Callback HTTP/cookie contract                                | T006, T013–T17, T023, T025                   | Actual framework/real-provider outcomes; no protected-entry consumption or recovery expansion                        |
| Runtime/Redis resource ownership                             | T010–T12, T019, T022                         | One shared production Layer and independently scoped integration clients; backend never reads Redis sessions         |
| Telemetry-safe `session.id`                                  | T011, T031–T33, T036                         | Real exported Tempo spans only; telemetry complements but does not prove cookie/store/public outcomes                |
| V-001 trusted callback establishes bound session/cookie      | T005–T8, T011–T16, T031, T036                | Public/adapter/real-provider/manual evidence; protected use remains #219/#154                                        |
| V-002 rejection establishes no session/cookie                | T006, T008, T014, T017, T023, T031–T32, T036 | Real rejection and callback mapping; no universal provider claim                                                     |
| V-003 initial deadline/effective warning policy              | T005, T009–T11, T016, T018–T20, T031, T036   | Controlled clock plus real shared read; renewal/current policy remains #220                                          |
| V-004 independent clients read identical state               | T008, T011, T016, T018–T20, T031–T32, T036   | Real Redis and second public client; not independent protected HTTP recognition                                      |
| V-005 three public outcome classes                           | T004–T5, T021–T26, T036                      | Public service and real adapter; exact missing/expired/deleted reason is intentionally not promised                  |
| V-006 unavailable sessions expose no identity/policy         | T021–T24, T026, T036                         | Absent/malformed/missing/expired/deleted cases; no tombstone contract                                                |
| V-007 storage failure fails closed                           | T021–T26, T032, T036                         | Real adapter failure plus trusted callback injected typed failure; not one whole-store callback outage               |
| V-008 host-only non-secret cookie                            | T006, T008, T013–T16, T031–T32, T036         | Framework, issue-level browser, and manual inspection; cookie presence alone does not prove bound state              |

## Intentionally reused evidence and approved limitations

- Existing authentication service/unit/integration suites retain ownership of OIDC transaction, provider, issuer,
  token, state/nonce, and trusted-identity validation; session tests consume only the exported trusted result.
- Existing tenant policy public tests retain file decoding, 5–30 minute timeout, warning-before-timeout, disabled-zero,
  and omitted-default ownership; session tests establish that supplied effective policy is preserved.
- The existing Keycloak/browser/process fixture is extracted into one runner-neutral owner and reused by Cucumber and
  the issue-level `node --test` browser workflow through the `playwright` library. No mock, second provider harness, or
  restored Playwright Test `e2e/` runner is authorized.
- Existing callback failure presentation and correlation disposition remain the UX/error vocabulary; this feature adds
  no recovery page or diagnostic endpoint.
- Existing observability/exporter/runtime composition is reused. Only live exported traces or a deleted temporary probe
  provide telemetry evidence; a missing sampled/exported trace is inconclusive.
- Approved limitations remain: no comprehensive protected-entry use, independently running protected HTTP recognition,
  renewal/current-policy adoption, expiration/invalidation races, explicit invalidation, warning/recovery UI,
  Microsoft/provider-neutral proof, production ingress, capacity target, alert, or SLO claim.

All tasks remain unchecked until their stated outcome is completed and its evidence and limitations are recorded.
