---

## description: "Implementation tasks for complete session invalidation and failure behavior"

# Tasks: Complete Session Invalidation and Failure Behavior

**Input**: Design documents from `specs/160-session-invalidation-failures/`

**Prerequisites**: `plan.md`, `spec.md`, `verification.md`, `contracts/modules.md`, `research.md`, `data-model.md`, and `quickstart.md`

**Tests**: The approved verification plan requires public-service, real-Redis, dedicated-store outage, and manual composed evidence. Requirements-backed Gherkin is intentionally excluded because application-wide request, browser, recovery, and provider behavior remains downstream.

**Organization**: Tasks are grouped by user story. Shared contract and controlled-adapter work precedes story evidence; each later story retains its own independent verification criterion.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and does not depend on unfinished behavior.
- **[Story]**: Maps work to the prioritized user story in `spec.md`.
- Every task names exact paths and the contract or verification claim it realizes.

## Phase 1: Setup and Baseline Validation

**Purpose**: Confirm that the fetched PR #302 baseline and installed APIs still support the approved plan before implementation begins.

- [x] T001 Revalidate the `SessionService`, `Redis.Redis["Service"].send`, and `@effect/vitest` APIs against `packages/frontend-services/node_modules/effect/`, `packages/frontend-services/node_modules/@effect/platform-node/`, `packages/frontend-services/node_modules/@effect/vitest/`, `packages/frontend-services/package.json`, and `pnpm-workspace.yaml`; run `fallow guard` for `packages/frontend-services/src/session.ts`, `packages/frontend-services/src/session/store.ts`, `packages/frontend-services/tests/helpers/session.ts`, `packages/frontend-services/tests/lib/session.test.ts`, `packages/frontend-services/tests/unit/authentication-entry-failures.test.ts`, `packages/frontend-services/tests/unit/reference-session-enforcement.test.ts`, `packages/frontend-services/tests/integration/session-redis.test.ts`, and planned `packages/frontend-services/tests/integration/session-redis-outage.test.ts`, and stop for the owning plan workflow if dependency drift changes an approved signature or behavior.
- [x] T002 [P] Identify and record the intentionally reused #220 authoritative expiration/renewal cases in `packages/frontend-services/tests/lib/session.test.ts` and `packages/frontend-services/tests/integration/session-redis.test.ts` that continue to establish V-004, without duplicating their matrix in this feature.

---

## Phase 2: Foundational Public Contract and Controlled Store

**Purpose**: Establish the approved public signature and the faithful controlled Redis behavior required by every story.

**Critical contract**: `invalidate({ readonly reference?: string }): Effect.Effect<NoUsableSession, SessionServiceUnavailable>`; missing/malformed input avoids storage, valid input addresses exactly one hashed key, Redis `DEL` accepts only numeric `0` or `1`, and neither success nor failure exposes protected fields or adds telemetry.

- [x] T003 Add the exact readonly `SessionService.invalidate` member to `packages/frontend-services/src/session.ts` and migrate the complete `SessionService["Service"]` doubles in `packages/frontend-services/tests/unit/authentication-entry-failures.test.ts` and `packages/frontend-services/tests/unit/reference-session-enforcement.test.ts` without changing existing read, refresh, request, runtime, or package-export contracts.
- [x] T004 Extend `packages/frontend-services/tests/helpers/session.ts` with a faithful single-key `DEL` command that returns numeric `0` or `1`, operation recording, strict unexpected-reply control, pre-command failure, and an apply-delete-then-fail control distinct from the existing `EVALSHA` post-mutation control; do not add retry, tombstone, cause-retention, telemetry, or production-facing helper contracts.

**Checkpoint**: The public contract and controlled dependency surface are available; story evidence can now drive the private implementation.

---

## Phase 3: User Story 1 — Invalidate a Shared Session (Priority: P1) MVP

**Goal**: One consumer can invalidate an opaque session reference and every independent consumer subsequently receives no usable session from reads or renewal.

**Independent Test**: Establish a usable tenant-bound session through client A, read and invalidate it through independent client B, then require both clients' later read and refresh calls to return exact fieldless `NoUsableSession` with no replacement key or session.

- [x] T005 [US1] Add initially failing public-capability scenarios in `packages/frontend-services/tests/lib/session.test.ts` for absent/malformed references with no store command; current, expired, malformed stored bytes, missing, unknown, and already removed state; strict `DEL` replies `0` and `1`; and exact `{ _tag: "NoUsableSession" }` with no identity, tenant, policy, deadline, reference, key, payload, deletion count, cause, or Redis diagnostic, establishing V-001, V-002, V-005, and V-008.
- [x] T006 [US1] Implement private single-key invalidation in `packages/frontend-services/src/session/store.ts` and compose it through `packages/frontend-services/src/session.ts`: validate with the existing reference decoder before storage, hash with the existing owned prefix, issue exactly one `redis.send<unknown>("DEL", key)`, accept only numeric `0`/`1`, map expected private failure through the existing fieldless `SessionServiceUnavailable`, return fieldless `NoUsableSession` for both terminal replies, and add no record decode, retry, replacement, annotation, tombstone, or cause distinction.
- [x] T007 [US1] Add independent-client real-Redis evidence in `packages/frontend-services/tests/integration/session-redis.test.ts` that establishes through client A, reads and invalidates through client B, then reads and refreshes through both clients using a scenario-owned prefix and owned cleanup, proving V-001, V-002, and V-008 without importing private `session/*` children.
- [x] T008 [US1] Run the focused public and normal Redis integration scenarios from `packages/frontend-services/tests/lib/session.test.ts` and `packages/frontend-services/tests/integration/session-redis.test.ts`, confirm the User Story 1 independent criterion, and record only safe outcome categories and limitations in `specs/160-session-invalidation-failures/quickstart.md`.

**Checkpoint**: Shared explicit invalidation is independently functional. This is the suggested MVP, but it does not complete issue #221 without race, failure, and manual evidence.

---

## Phase 4: User Story 2 — Keep Invalidation and Expiration Final During Races (Priority: P2)

**Goal**: Renewal cannot recreate usable state after invalidation completes or after authoritative expiration wins.

**Independent Test**: Execute renewal-first, invalidation-first, and barrier-released concurrent-invocation schedules; after each schedule require both independent clients' later reads and refreshes to return `NoUsableSession` and observe no replacement key. Retained #220 at/after-deadline cases must continue to pass.

- [x] T009 [US2] Add three bounded real-Redis schedules to `packages/frontend-services/tests/integration/session-redis.test.ts`: renewal completes before invalidation dispatch, invalidation completes before renewal dispatch, and both public operations cross a start barrier and are released before either result is awaited; after every schedule re-read and refresh through both clients, assert no replacement state, and explicitly retain the limitation that concurrent release does not prove Redis command-boundary overlap, establishing V-003.
- [x] T010 [US2] Execute the new invalidation schedules and the identified existing #220 deterministic and real-Redis expiration/renewal cases in `packages/frontend-services/tests/lib/session.test.ts` and `packages/frontend-services/tests/integration/session-redis.test.ts`; record the exercised ordering, reused V-004 evidence, environment, and finite-schedule limitation in `specs/160-session-invalidation-failures/quickstart.md`.

**Checkpoint**: The exercised invalidation and expiration orderings end in terminal no-usable state; finite schedules remain bounded evidence rather than a timing proof.

---

## Phase 5: User Story 3 — Fail Closed When Shared Session State Is Unavailable (Priority: P3)

**Goal**: Read, refresh, and invalidation return exact service failure during real store loss, never ordinary absence, usable identity, authorization success, or silent replacement.

**Independent Test**: Against an exclusively owned Redis instance, prove pre-dispatch and bounded mid-flight failures for all three public operations, restart the same store, and authoritatively re-evaluate every affected reference without inferring mutation status from the failure.

- [x] T011 [P] [US3] Complete controlled public failure scenarios in `packages/frontend-services/tests/lib/session.test.ts` for command failure, non-numeric or numeric-not-`0`/`1` replies, exact fieldless `SessionServiceUnavailable`, and apply-one-`DEL`-then-fail behavior that performs no retry or success claim and requires a later public read/invalidate for authoritative re-evaluation, establishing V-005 and V-007.
- [x] T012 [P] [US3] Add disconnected real-adapter read, refresh, and invalidate failure scenarios plus healthy-client authoritative re-evaluation to `packages/frontend-services/tests/integration/session-redis.test.ts`, using only public `SessionService` outcomes and owned cleanup to establish the pre-dispatch portion of V-005, V-006, and V-007.
- [x] T013 [P] [US3] Add an opt-in `test:integration:outage` script to `packages/frontend-services/package.json`, create `packages/frontend-services/vitest.outage.config.ts` that includes only `tests/integration/session-redis-outage.test.ts`, and exclude that file from `packages/frontend-services/vitest.integration.config.ts` so the normal shared-store suite can never stop the dedicated outage store.
- [x] T014 [US3] Create `packages/frontend-services/tests/integration/session-redis-outage.test.ts` with a unique Redis 8.10.3 Compose project and dynamically selected loopback endpoint; own bounded readiness, pre-dispatch stop, `CLIENT PAUSE 30000 ALL`, 250-millisecond pending checks, store stop before pause expiry, 10-second public failure bounds for read/refresh/invalidate, restart and public re-evaluation, client/runtime disposal, prefix-only cleanup, and unconditional Compose teardown, while retaining no credentials, raw references, keys, records, protected values, or telemetry assertions.
- [x] T015 [US3] Run `pnpm --filter @pathableai/pre-ets-frontend-services test:integration:outage` independently, confirm exact `SessionServiceUnavailable` and zero ordinary absence/success/replacement outcomes for every planned outage case, and record the revision, Redis version, safe topology, cleanup, and local-controlled-outage limitation in `specs/160-session-invalidation-failures/quickstart.md`.

**Checkpoint**: Controlled and real-adapter/store failure remains distinct from absence and success, with mutation status re-evaluated only after recovery.

---

## Phase 6: Cross-Cutting Feature Verification and Quality Gates

**Purpose**: Execute the required composed consumer journey, clean all temporary controls, and validate every contract and claim without expanding into downstream application/browser scope.

- [x] T016 Create only temporary uncommitted `/private/tmp/preets-session-invalidation-probe.ts` and `/private/tmp/preets-session-invalidation-redis.yml` support for the mandatory manual procedure, calling public `SessionService` around the existing #219 bounded consumer with a synthetic tenant, owned prefix, unique Compose project, bounded synchronization, and no private-store import or retained fixture change.
- [x] T017 Execute the success-before-invalidation, renewal/invalidation race, post-invalidation bounded-consumer denial, and pre-dispatch dedicated-store outage procedure from `specs/160-session-invalidation-failures/quickstart.md`; update that same file with exact revision/environment, safe labels, ordering, public outcome categories, bounded consumer result, V-001–V-003 and V-005–V-007 dispositions, cleanup status, skipped cases, and limitations only.
- [x] T018 Remove `/private/tmp/preets-session-invalidation-probe.ts`, `/private/tmp/preets-session-invalidation-redis.yml`, raw transcripts, temporary instrumentation, and owned Compose resources; restore the store, re-evaluate and invalidate any surviving owned session through the public service, remove only owned keys, dispose clients/processes, and confirm `git status` contains no generated output, secret, raw reference, key, record, PHI, protected content, or identifying partner data.
- [x] T019 Run `pnpm --filter @pathableai/pre-ets-frontend-services test` and `REDIS_URL=redis://127.0.0.1:6379 pnpm --filter @pathableai/pre-ets-frontend-services test:integration` plus the opt-in outage command from `packages/frontend-services/package.json`, and record the actual commands, conditions, results, and limitations in `specs/160-session-invalidation-failures/quickstart.md`.
- [x] T020 Run `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm check:unused`, `pnpm check:health`, and `FALLOW_AUDIT_BASE=origin/main pnpm check:changes` from the repository root; investigate every result, fix introduced findings without suppression, and distinguish pre-existing or external findings in `specs/160-session-invalidation-failures/quickstart.md`.
- [x] T021 Complete the V-001–V-008 and affected-module-contract trace in `specs/160-session-invalidation-failures/quickstart.md`, naming intentionally reused V-004 evidence and approved limitations; mark a task `[X]` in `specs/160-session-invalidation-failures/tasks.md` only after its implementation or evidence has actually completed.

---

## Dependencies and Execution Order

### Phase Dependencies

- **Phase 1** has no implementation dependency. T001 and T002 may run in parallel.
- **Phase 2** depends on T001 confirming no decision-changing API drift. T003 must precede story implementation; T004 supplies the controlled dependency used by US1 and US3.
- **User Story 1** depends on Phase 2 and establishes the public capability used by both later stories.
- **User Story 2** depends on US1's public invalidation implementation but remains independently verifiable through its three schedules and retained expiration evidence.
- **User Story 3** depends on US1's public invalidation implementation. T011, T012, and T013 may proceed in parallel; T014 depends on T013, and T015 depends on T014.
- **Phase 6** depends on all selected stories. T016–T018 are sequential because they share temporary resources; T019 and T020 run only after cleanup; T021 is last.

### User Story Dependencies

- **US1 (P1)**: Required first and independently deliverable as the shared-invalidation MVP.
- **US2 (P2)**: Reuses US1 and existing #220 expiration behavior; it does not add another public contract.
- **US3 (P3)**: Reuses US1 and the shared controlled adapter; it does not change the public error vocabulary.

### Parallel Opportunities

- T002 can run while T001 validates installed declarations and Fallow ownership.
- After US1, T009/T010 race work and T011–T014 failure work use distinct scenario groups, but edits to `session-redis.test.ts` must be serialized.
- Within US3, T011, T012, and T013 touch different files and can proceed in parallel; T014 starts after the outage configuration exists.
- Repository-wide gates are intentionally serialized after feature evidence and cleanup so their results describe the final tree.

## Parallel Example: User Story 3

```text
Task T011: Controlled failure and post-mutation cases in packages/frontend-services/tests/lib/session.test.ts
Task T012: Disconnected-adapter cases in packages/frontend-services/tests/integration/session-redis.test.ts
Task T013: Opt-in suite routing in packages/frontend-services/package.json and Vitest configs
```

## Implementation Strategy

### MVP First

1. Complete baseline and public-contract phases.
2. Write US1 public scenarios before the private behavior they exercise.
3. Implement single-key invalidation and validate the two-client outcome.
4. Stop and review US1 independently if a smaller PR becomes necessary; do not describe #221 as complete.

### Complete Delivery

1. Add the three explicit race schedules and retain #220 V-004 evidence.
2. Add controlled, disconnected-adapter, and exclusively owned-store outage evidence.
3. Execute the mandatory bounded-consumer journey and remove every temporary artifact.
4. Run feature checks and repository gates, then finish the claim/contract trace.

## Verification Trace and Approved Limitations

| Claim or contract                           | Implementation/evidence tasks | Reused evidence                                                     | Approved limitation                                                                          |
| ------------------------------------------- | ----------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| V-001 explicit shared invalidation          | T003–T008, T017               | None                                                                | Bounded two-client and reference-consumer observations are not application-wide enforcement. |
| V-002 no renewal/replacement                | T005–T010, T017               | Existing refresh no-create behavior                                 | Finite schedules do not prove every topology or timing.                                      |
| V-003 invalidation race finality            | T009, T010, T017              | None                                                                | Concurrent release does not prove Redis command-boundary overlap.                            |
| V-004 expiration race finality              | T002, T010, T021              | Existing #220 deterministic and real-Redis expiration/renewal cases | No duplicate expiration matrix is added.                                                     |
| V-005 outcome/privacy distinction           | T005, T011–T017               | Existing read/refresh outcome vocabulary                            | No browser cookie clearing, UI, or provider behavior is established.                         |
| V-006 real-store failure                    | T012–T017                     | None                                                                | Local outage does not establish every partition or managed-service failure.                  |
| V-007 no false completion/retry             | T011–T017                     | Existing fieldless service-error vocabulary                         | Controlled reply loss establishes service policy, not real-world probability.                |
| V-008 no retained cause required            | T005–T008, T021               | Existing missing/expired no-usable outcomes                         | No invalidation/expiration cause is retained or distinguished.                               |
| `SessionService.invalidate` public contract | T003, T005–T008, T011–T017    | Existing `NoUsableSession` and `SessionServiceUnavailable` types    | Comprehensive application integration remains #154–#158.                                     |
| Private `SessionStore.invalidate` contract  | T004–T007, T009, T011–T015    | Existing key hashing/prefix owner and renewal script                | Redis `DEL` serialization is exercised only through bounded schedules.                       |

## Notes

- Requirements, delivery plans, issue #221, and sibling Spec Kit directories remain read-only.
- Only `specs/160-session-invalidation-failures/` may change under `specs/` in this implementation PR.
- No durable test may assert logs, spans, attributes, telemetry payloads, or exporter behavior.
- Never commit temporary probes, raw transcripts, credentials, references, keys, records, generated reports, or partner/client identifiers.
- A checked task means the described implementation or evidence actually completed; it is not a planning status marker.
