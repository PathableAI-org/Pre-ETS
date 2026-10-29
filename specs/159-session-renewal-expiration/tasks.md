# Tasks: Renew and Expire Authoritative Sessions

**Input**: [spec.md](spec.md), [verification.md](verification.md), [plan.md](plan.md),
[research.md](research.md), [data-model.md](data-model.md), [module contracts](contracts/modules.md), and
[quickstart.md](quickstart.md)

**Branch**: `159-session-renewal-expiration-impl` · **Delivery**: #220 / S2-F · **Design revision**: approved
specification and plan documents on this branch

**Status**: Planned implementation work. Every task remains unchecked until its stated behavior or evidence has been
completed at an identified implementation revision. Passing static checks does not establish runtime renewal or
expiration. `verification.md` and `quickstart.md` stay planned procedures; execution records are written separately
and do not edit those files.

**Tests**: Required by the approved verification plan. Write the named public-service, tenant-consumer, and real-Redis
evidence before the private behavior it protects, observe a meaningful failing result, and then make it pass.
Requirements BDD is not completion evidence: the running-application boundary belongs to #154–#156. No operational
observability claim is in scope. Do not add durable assertions over logs, spans, attributes, telemetry payloads, or
exporter output.

**Scope**: Extend the existing frontend-services session capability so qualifying server-side activity renews a
still-usable Redis session under the current validated tenant policy, and so equality, lateness, excluded activity,
and a winning expiration cannot revive it. Preserve `StoredSessionV1`, `TenantConfigService`, the shared runtime, the
package-root export, and the existing fieldless errors. Do not add HTTP or browser adapters, a renewal service, a
public store contract, tombstones, or an absolute lifetime.

## Format and execution conventions

`- [ ] Tnnn [P?] [USn?] Action with exact paths`

- Paths are repository-relative. New paths named below are intentional.
- `[P]` means different files and no dependency on another unfinished task. It never authorizes concurrent edits to a
  shared file or a shared mutable Redis prefix.
- `spec.md`, `verification.md`, `plan.md`, `contracts/modules.md`, requirements, delivery plans, and issue #220 are
  read-only. A newly discovered product decision stops the implementation workflow; it does not become a task that
  edits those authorities.
- Only `packages/frontend-services/src/session.ts` imports `packages/frontend-services/src/session/codec.ts` and
  `packages/frontend-services/src/session/store.ts`. Tests, temporary probes, and downstream consumers use the public
  parents `session.ts` and `tenant.ts`. Do not import `tenant/config.ts` from the session module.
- Before Effect work, read `docs/engineering/effect-guidance.md`, `packages/frontend-services/AGENTS.md`, and the
  available Effect v4 checkout's `LLMS.md`, then only the linked examples for services, Layers, clock, Redis scripts,
  and tests. Installed Effect 4.0.5 declarations in this workspace remain authoritative.
- Before test work, read `docs/engineering/testing/README.md` and, for properties,
  `docs/engineering/testing/property-based-testing.md`.
- Use synthetic tenants, users, sessions, and owned key prefixes. Do not retain PHI, production credentials, tokens,
  cookie or session references, raw store records, Redis keys, or identifying partner data.
- Do not add suppressions, Fallow ignore patterns, baselines, or weaker complexity thresholds. Do not commit generated
  output, temporary probes, or verification transcripts.

## Phase 1: Baseline and declaration inspection

**Purpose**: Reconfirm read-only authority and the installed APIs before any session edit.

- [x] T001 Refresh `origin/main` and record its SHA. Re-read issue #220 and compare the accepted requirement files at
      `c1d87a22a55cd5190bc702a6a3c33cfed2ca23ef` plus the S2 baseline at `e206d165f0f30999220922f57a3f92549c15f4cc`
      with current `origin/main` for the in-scope criteria named in `specs/159-session-renewal-expiration/spec.md`:
      PREETS-SESSION-008 AC3–5, the service/store portion of PREETS-SESSION-006 AC3, the server
      classification/enforcement portion of PREETS-SESSION-009 AC1–4, and the server policy/renewal portion of
      PREETS-SESSION-011 AC2–4. Stop for the owning specification or planning workflow on material drift. Do not edit
      `specs/159-session-renewal-expiration/spec.md`, `specs/159-session-renewal-expiration/verification.md`, or
      `specs/159-session-renewal-expiration/plan.md`.
- [x] T002 [P] Confirm the installed Effect 4.0.5 and `@effect/platform-node` 4.0.5 declarations used by
      `packages/frontend-services/src/session.ts` and `packages/frontend-services/src/session/store.ts`:
      `Clock.currentTimeMillis`, `TestClock`, `Effect.fn`, `Redis.script` / `Redis.eval`, `Effect.all`, `Deferred`,
      and `Latch`, plus `@effect/vitest` 4.0.5 and `@fast-check/vitest` 0.5.0. Confirm Compose Redis 8.10.2. The
      script API must be able to express one key, full validation, and at most one final `DEL` or `SET ... PX`. Stop
      if the installed API cannot. Effect clock remains the deadline authority; Redis TTL stays cleanup.
- [x] T003 [P] Run `pnpm --filter @pathableai/pre-ets-frontend-services exec fallow guard src/session.ts src/session/store.ts`
      from `packages/frontend-services` before adding a module. `docs/engineering/fallow.md` says this workspace has
      no boundary zones; leave it unconfigured. Keep activity classification private in
      `packages/frontend-services/src/session.ts`. Split a child only when `fallow health --complexity` on that file
      reports a concrete complexity problem, and only `session.ts` may import that child.

**Checkpoint**: Authority and installed API truth are known. Foundation work waits on T001. T002 and T003 may run
together after T001.

## Phase 2: Foundational public contract

**Purpose**: Publish the shared activity vocabulary and `refreshForTenant` signature that every story consumes.
Depends on T001–T003.

- [x] T004 Add the closed activity and refresh input types to `packages/frontend-services/src/session.ts` exactly as
      specified in `specs/159-session-renewal-expiration/contracts/modules.md`. Export `QualifyingSessionActivity` as
      `"deliberate-page-request" | "deliberate-form-submission" | "intentional-control-activation" |
      "keyboard-interaction" | "text-entry" | "touch-interaction" | "user-driven-meaningful-input-focus" |
      "continue-session"`. Export `ExcludedSessionActivity` as `"automatic-polling" |
      "unrelated-background-traffic" | "raw-pointer-movement" | "programmatic-focus"`. Export
      `RefreshSessionForTenantInput` as the union whose qualifying variant requires
      `activity: QualifyingSessionActivity`, `policy: EffectiveSessionPolicy`, optional `reference?: string`, and
      `tenantAlias: TenantAlias`, and whose excluded variant has `activity: ExcludedSessionActivity`,
      `policy?: never`, optional `reference?: string`, and `tenantAlias: TenantAlias`. Callers cannot add categories
      or pass a boolean that bypasses classification. Do not export these types from
      `packages/frontend-services/src/index.ts`.
- [x] T005 Extend `SessionService` in `packages/frontend-services/src/session.ts` with `refreshForTenant(input:
      RefreshSessionForTenantInput): Effect.Effect<NoUsableSession | UsableSession, SessionServiceUnavailable |
      SessionTenantMismatch>`. Keep `establish`, `read`, and `readForTenant` source-compatible. The existing layer
      continues to require `Redis` and configuration; callers of a provided `SessionService` gain no new environment
      requirement. Include the member on the layer object with `Effect.die` until T012 replaces that defect. Do not
      map the unimplemented member to `NoUsableSession` or `SessionServiceUnavailable`. Do not change
      `packages/frontend-services/src/runtime.ts`, `packages/frontend-services/src/session-request.ts`, or
      `packages/frontend-services/src/session/codec.ts`.
- [x] T006 [P] Add `refreshForTenant` to the complete `SessionService["Service"]` double in
      `packages/frontend-services/tests/unit/reference-session-enforcement.test.ts`. Match the T005 signature and die
      when called, using the same unused-member pattern as `establish` and `read`. This migration is required because
      `refreshForTenant` is a required member of `SessionService["Service"]`; it does not add renewal behavior to the
      #219 reference consumer.
- [x] T007 [P] Add the same unused `refreshForTenant` member to both `Layer.succeed(SessionService, ...)` objects in
      `packages/frontend-services/tests/unit/authentication-entry-failures.test.ts`. Preserve the existing safe
      failure pages, correlation disposition, and the assertions that failed tenant lookup or failed establishment
      does not emit a session cookie.

**Checkpoint**: Public tests can name `refreshForTenant` and the activity union. The die member is a scaffold, not
renewal behavior.

## Phase 3: User Story 1 — Renew a still-usable session (Priority: P1) 🎯 MVP

**Goal**: Qualifying activity received strictly before the authoritative deadline keeps the session usable and
exposes a new deadline and warning policy taken together from the effective policy supplied for that refresh.
Independent sessions adopt a changed policy only on their own qualifying refresh. A selected tenant that does not
match the stored tenant changes nothing.

**Independent Test**: Establish a session with a known deadline, submit each qualifying activity, including
`continue-session`, before that deadline through the public session consumer, and observe the resulting authoritative
deadline together with the effective timeout and warning policy used for the renewal. Refresh only one of two
sessions after a policy change and observe that the other keeps its established deadline and warning policy.

### Public evidence before private behavior

- [x] T008 [US1] Add failing public-service scenarios to `packages/frontend-services/tests/lib/session.test.ts` for
      `SessionService.refreshForTenant`, using `TestClock` and `makeSessionMemoryRedis` from
      `packages/frontend-services/tests/helpers/session.ts`. Import only `packages/frontend-services/src/session.ts`.
      For each qualifying literal in T004, activity strictly before the stored deadline returns `UsableSession` whose
      new `idleDeadlineEpochMilliseconds` is `receivedAt + idleTimeoutMinutes * 60_000` and whose
      `warningLeadMinutes` comes from that same `EffectiveSessionPolicy` (V-001, V-002, FR-001–FR-003, FR-005). Cover
      a policy change that updates timeout and warning together, including a transition to and from a disabled
      warning of `0`. Establish two sessions and refresh only one; the other retains its established deadline and
      warning lead (V-003, FR-004). Absent or invalid `reference` returns fieldless `NoUsableSession` with no Redis
      lookup. A `tenantAlias` that differs from the stored tenant returns fieldless `SessionTenantMismatch`,
      including when the stored deadline is already expired, and a later read shows unchanged bytes and unchanged TTL
      (contracts/modules.md mismatch invariant). Observe a meaningful failure before T010–T012.
- [x] T009 [US1] Add bounded `@fast-check/vitest` properties in `packages/frontend-services/tests/lib/session.test.ts`
      that, for generated receipt times strictly before the stored deadline and generated valid policy pairs, the
      renewed deadline equals `receivedAt + idleTimeoutMinutes * 60_000` and the stored warning lead equals that same
      input's `warningLeadMinutes`. Properties must not mix deadline and warning fields from two policies. A finite
      sample count is an implementation choice and is not a proof of unexercised timings. Keep these properties in
      the public-service file; do not import private session children.

### Private renewal behavior

- [x] T010 [US1] Extend `packages/frontend-services/tests/helpers/session.ts` so the memory Redis used by
      `packages/frontend-services/tests/lib/session.test.ts` models the script operation confirmed in T002. Preserve
      existing `GET` and `SET key payload NX PX ttl` behavior for establishment. Script evaluation for a qualifying
      refresh must apply at most one final `SET ... PX` after validation, and must perform no write on tenant
      mismatch or malformed payload. This helper is test infrastructure, not a second production contract.
- [x] T011 [US1] Extend the private `SessionStore` in `packages/frontend-services/src/session/store.ts` with one
      one-key script for tenant-bound refresh. Validate the complete exact `StoredSessionV1` shape, including
      version, field types, constraints, and excess properties, and finish every fallible result or replacement
      before any mutation. Compare `tenantAlias` before deadline evaluation. On mismatch, return a store mismatch and
      leave bytes and TTL unchanged even when `idleDeadlineEpochMilliseconds <= receivedAt`. On a match, a qualifying
      replacement may be written only when `receivedAt` is strictly before the stored deadline: change
      `idleDeadlineEpochMilliseconds` and `warningLeadMinutes` together from one policy, keep `version`, `issuer`,
      `subject`, `tenantAlias`, and `telemetryId`, and issue one final `SET ... PX`. The new deadline is
      `receivedAt + idleTimeoutMinutes * 60_000`. Missing keys and invalid references stay non-mutating. Same-tenant
      expiry may return non-usable without `SET` here; the one final `DEL` is T016. Do not edit
      `packages/frontend-services/src/session/codec.ts`. Use `Effect.fnUntraced` for the store operation.
- [x] T012 [US1] Replace the T005 defect in `packages/frontend-services/src/session.ts` with
      `Effect.fn("SessionService.refreshForTenant")`. Sample `Clock.currentTimeMillis` as receipt time before
      storage. Decode `reference` with the existing parent decoder; absent or invalid input returns `NoUsableSession`
      without Redis. Pass `tenantAlias`, receipt time, the closed activity, and `policy` only for a qualifying
      variant. Map store mismatch to fieldless `SessionTenantMismatch` and Redis, codec, script, or result-decoding
      failure to fieldless `SessionServiceUnavailable`. After a usable store result, sample `Clock.currentTimeMillis`
      again and return `NoUsableSession` when the returned deadline has been reached, before any
      `Effect.annotateCurrentSpan("session.id", telemetryId)`. Annotate only a result that is still usable at that
      second sample. Do not retry, do not import `packages/frontend-services/src/tenant/config.ts`, and do not add a
      public error. Make T008 and T009 pass.
- [ ] T013 [US1] Run the User Story 1 scenarios in `packages/frontend-services/tests/lib/session.test.ts` and record
      the revision, command, and V-001/V-002/V-003 public-service results in the implementation PR using the
      execution template in `specs/159-session-renewal-expiration/quickstart.md`. State the limits: a deterministic
      store does not prove real Redis ordering, invalid tenant files, browser timers, or HTTP protection.

**Checkpoint / MVP demo**: Qualifying pre-deadline refresh, including `continue-session`, renews one authoritative
deadline and warning policy, and an unrefreshed sibling session keeps its prior policy. Excluded activity, equality
deletion, races, and invalid tenant files remain later stories.

## Phase 4: User Story 2 — Refuse nonqualifying or late renewal (Priority: P2)

**Goal**: Excluded activity never changes the authoritative deadline. At or after that deadline, qualifying activity,
Continue, and a later timeout increase cannot revive usable identity. Server-side evaluation does this without a
browser timer.

**Independent Test**: Exercise qualifying and nonqualifying activity immediately before, exactly at, and after a
known deadline through the public session consumer. Only qualifying activity received before the deadline renews the
session. Advance time without a browser timer and observe that consumers no longer receive usable identity.

### Public evidence before private behavior

- [x] T014 [US2] Extend `packages/frontend-services/tests/lib/session.test.ts` with failing scenarios for every
      excluded literal from T004. Before the deadline, `refreshForTenant` returns the current `UsableSession` and
      leaves the stored payload and TTL unchanged (V-004, FR-006, SC-002). The excluded variant's `policy?: never`
      must reject an input that carries policy. At the stored deadline and after it, qualifying activity and
      `continue-session` return `NoUsableSession`, a later larger `idleTimeoutMinutes` does not revive the session,
      and a subsequent read stays non-usable (V-005, FR-007, SC-001). Update the existing scenario "returns
      `NoUsableSession` at and after the stored deadline", which currently expects `redis.entries.size` to stay `1`:
      a tenantless read at or after the deadline performs one final `DEL` and still returns `NoUsableSession`
      (data-model state transition; V-008, V-010). Add a controlled delayed-store case whose storage result completes
      only after `TestClock` crosses the returned deadline; the public read or refresh returns `NoUsableSession`
      despite a pre-storage receipt time (contracts/modules.md delayed-read claim, V-010). Do not import private
      session children.

### Expiration behavior

- [x] T015 [US2] Extend `packages/frontend-services/tests/helpers/session.ts` so script evaluation can return the
      current record with no write for excluded activity, issue one final `DEL` for same-tenant or tenantless expiry,
      and delay a usable result long enough for the public parent to advance `TestClock` past the returned deadline.
      Preserve the T010 qualifying-write and mismatch non-mutation behavior.
- [x] T016 [US2] Complete the private script in `packages/frontend-services/src/session/store.ts`. Excluded activity
      returns the current valid record and performs no write. For a tenantless read, or a tenant-matching refresh,
      `deadline <= receivedAt` returns expired and performs one final `DEL`. Mismatch still precedes that deletion
      and leaves bytes and TTL unchanged. Malformed state still fails before any mutation. Issue no mutation or
      exactly one final `DEL` or `SET ... PX`; do not rely on script rollback.
- [x] T017 [US2] Route `read` in `packages/frontend-services/src/session.ts` through the same receipt-time script so
      authoritative expiration does not depend on a separate `GET` plus a browser timer (V-010, FR-008). Keep the
      absent or malformed reference short-circuit with no Redis lookup. Apply the post-storage Effect-clock sample
      before exposing identity or annotating `session.id`. Keep `readForTenant` as admission of an already usable
      read: mismatch on a still-usable session remains `SessionTenantMismatch`, and an expired record follows `read`
      to `NoUsableSession`. The mismatch-before-expiration rule stays on `refreshForTenant`. Make T014 pass.
- [ ] T018 [US2] Run the User Story 2 scenarios in `packages/frontend-services/tests/lib/session.test.ts` and record
      V-004, V-005, and V-010 deterministic results, including the changed expiry assertion, in the implementation PR
      using `specs/159-session-renewal-expiration/quickstart.md`. Real Redis ordering and storage-failure races
      remain User Story 3.

**Checkpoint**: Excluded traffic leaves the deadline unchanged, and equality or lateness stays non-usable without a
browser timer. Independent-client races are not yet proved.

## Phase 5: User Story 3 — Observe one consistent session outcome (Priority: P3)

**Goal**: Independent clients converge on the ordered winner of renewal versus expiration. Usable session, no usable
session, and storage failure stay distinguishable. Missing and expired state share the non-usable outcome without a
retained tombstone.

**Independent Test**: Use two independently scoped clients of real Redis to race renewal and expiration at the
authoritative boundary. Later reads from both clients agree on renewed usable state when a valid pre-deadline renewal
wins, and on non-usable state when expiration wins. A stale operation does not recreate expired state. Injected
storage failure is not reported as no-session or as identity.

### Public and real-store evidence before the remaining private behavior

- [x] T019 [P] [US3] Extend `packages/frontend-services/tests/lib/session.test.ts` with failing public scenarios that
      distinguish outcomes (V-007, V-008, FR-010, FR-011, SC-005). Missing state and state removed by the T016 `DEL`
      both return `NoUsableSession` with no tombstone or expiration marker. Reuse the existing establishment and read
      failure scenarios; add refresh cases where a controlled Redis, script, or result-decoding failure returns
      fieldless `SessionServiceUnavailable` and not `NoUsableSession` or `UsableSession`. A malformed or non-V1
      record, including an invalid or missing identity field and an excess property, returns
      `SessionServiceUnavailable`, stays byte-for-byte unchanged, and does not reset or extend TTL. A controlled
      commit-then-fail case returns `SessionServiceUnavailable`, does not run the script again with the stale policy,
      and a later public read observes whatever authoritative state the single final write committed. Public
      diagnostics contain no raw reference, key, stored record, identity, token, policy document, or partner name.
      Import only the session parent.
- [x] T020 [P] [US3] Extend `packages/frontend-services/tests/integration/session-redis.test.ts` with two
      independently scoped `SessionService` runtimes and one scenario-owned prefix. Preserve the existing
      establish-on-A/read-on-B case and the disconnected-client `SessionServiceUnavailable` cases for establishment,
      read, and tenant admission. Add: refresh through client B and read the new deadline and warning policy through
      client A (V-002, V-003, V-006); a renewal-first gate that releases and observes renewal before expiration
      dispatch; an expiration-first gate that inverts those gates; and one start-barrier case that releases both
      dispatches without awaiting either, bounds both completions, and accepts either permitted winner. Each race
      asserts both operation results and later reads from both clients. The overlapping case cannot replace either
      forced order. A stale loser must not recreate a deleted key or overwrite the winner. Add a real-Redis record
      with a valid tenant and future deadline but an invalid or missing identity field; public `refreshForTenant`
      returns `SessionServiceUnavailable` with identical bytes and no TTL reset or extension. Remove only owned keys
      and close both clients. Do not import private session children. Finite schedules are not a proof of every
      deployment topology (V-006, SC-004).

### Failure and ordering behavior

- [x] T021 [US3] Extend `packages/frontend-services/tests/helpers/session.ts` with the bounded failure controls T019
      needs: malformed payload left unchanged, and a script result that fails after the helper has applied the one
      final mutation. Do not add a second production store.
- [x] T022 [US3] Finish exhaustive result decoding in `packages/frontend-services/src/session/store.ts`. Unknown
      script results and malformed records fail closed before mutation. A transport or decoding failure after the one
      final `DEL` or `SET ... PX` surfaces as store unavailability without another mutation. The private result
      encoding may be chosen here; it must be exhaustive and fail closed, and it must preserve mismatch precedence
      and the prepare-then-single-mutation invariant from `specs/159-session-renewal-expiration/contracts/modules.md`.
- [x] T023 [US3] In `packages/frontend-services/src/session.ts`, map those store failures to fieldless
      `SessionServiceUnavailable` for `establish` where already required, and for `read`, `readForTenant`, and
      `refreshForTenant`. Do not retry a failed refresh with the stale policy. Leave defects and interruption
      untranslated. Make T019 pass.
- [ ] T024 [US3] Start the pinned Redis with `docker compose up -d --wait redis`, confirm `docker compose exec redis
      redis-cli ping`, and run `packages/frontend-services/tests/lib/session.test.ts` plus `REDIS_URL=redis://127.0.0.1:6379`
      for `packages/frontend-services/tests/integration/session-redis.test.ts`. Record V-006, V-007, and V-008, and
      the distributed portion of V-002, V-003, V-005, and V-010, in the implementation PR using
      `specs/159-session-renewal-expiration/quickstart.md`. Clean only owned keys. Real-store outage recovery remains
      #221; the existing disconnected-client cases prove only the public storage-failure outcome.

**Checkpoint**: Independent clients agree on the authorized winner, and storage failure stays distinct from no usable
session. Invalid tenant-file consumption remains User Story 4.

## Phase 6: User Story 4 — Reject invalid session policy at tenant consumption (Priority: P4)

**Goal**: Invalid explicit timeout or warning values fail when the selected tenant configuration is consumed, so
initialization and renewal never receive an effective policy from that document.

**Independent Test**: Exercise the real `TenantConfigService` with invalid timeout and warning values and observe
rejection without an effective session policy being supplied to `establish` or `refreshForTenant`.

### Tenant-consumer evidence

- [x] T025 [P] [US4] Create `packages/frontend-services/tests/lib/session-policy-refresh.test.ts`. Compose the real
      `TenantConfigService` from `packages/frontend-services/src/tenant.ts` with `SessionService`. Do not import
      `packages/frontend-services/src/tenant/config.ts` or private session children. Keep the exhaustive invalid and
      valid domain matrix in `packages/frontend-services/tests/lib/tenant-policy.test.ts`: integral timeout values
      from 5 through 30 minutes, integral warning values at least zero and strictly less than the effective timeout,
      defaults 30/5, and a five-minute timeout defaulting to a zero-minute warning. The new file must show each spec
      edge class—fractional, nonnumeric, below the timeout range, above the timeout range, and a nonzero warning
      equal to or greater than the effective timeout—rejected by that consumer before `establish` or
      `refreshForTenant` is invoked (V-009, FR-012, SC-006). Use distinguishable synthetic tenant files. Do not claim
      PREETS-TENANT-004 HTTP failure mapping.
- [x] T026 [US4] Extend `packages/frontend-services/tests/lib/session-policy-refresh.test.ts` so a selected valid
      configuration supplies `effectiveSessionPolicy` only to a qualifying refresh. The renewed public session
      exposes that timeout and warning lead, including a change and a transition to or from a disabled warning of
      `0`. An unrefreshed second session keeps the policy from its own establishment (V-003, SC-003). This task waits
      until T012 has replaced the `refreshForTenant` defect.
- [ ] T027 [US4] Run `packages/frontend-services/tests/lib/tenant-policy.test.ts` and
      `packages/frontend-services/tests/lib/session-policy-refresh.test.ts`. Record V-003 and V-009 tenant-consumer
      results in the implementation PR using `specs/159-session-renewal-expiration/quickstart.md`. Do not change
      `packages/frontend-services/src/tenant.ts` or `packages/frontend-services/src/tenant/config.ts` to make renewal
      pass. If an in-scope invalid domain is accepted by the existing consumer, stop for the tenant-owning workflow
      instead of copying validation into the session module.

**Checkpoint**: Invalid selected policy cannot become a refresh input. User Stories 1–3 remain the session behavior
under a policy the tenant consumer has already accepted.

## Phase 7: Polish and cross-cutting completion

**Purpose**: Optional bounded #219 observation, the mandatory manual procedure, cleanup, repository gates, and a
claim-level execution record. Depends on the stories required by each procedure.

- [ ] T028 Record the bounded #219 fixture already delivered in
      `packages/frontend-services/tests/unit/reference-session-enforcement.test.ts`. Reuse it only to observe that a
      usable `readSessionRequest` result still exposes `idleDeadlineEpochMilliseconds` and `warningLeadMinutes`, and
      that `NoUsableSession`, `SessionTenantMismatch`, and `SessionServiceUnavailable` expose no protected identity.
      Add a case in that file only when that observation is missing. Do not call `refreshForTenant` there, do not add
      application routes, and do not treat the fixture as comprehensive HTTP enforcement. If no case is added, record
      that reuse and the unexercised application paths in the implementation PR. The fixture is optional evidence for
      V-001–V-010 and is not a completion dependency.
- [ ] T029 Execute the manual procedure in `specs/159-session-renewal-expiration/quickstart.md` and the matching steps
      in `specs/159-session-renewal-expiration/verification.md`. Create an uncommitted probe at
      `packages/frontend-services/tests/manual/session-renewal.probe.ts` that imports only the public session and
      tenant parents. Instantiate two independently scoped clients against one owned prefix and a controllable Effect
      clock. Through A, establish two synthetic sessions under the initial policy; through B, read both and record
      matching safe identity labels, deadlines, warning policies, and usable outcomes. Change the selected synthetic
      tenant policy without refreshing and confirm both clients still see the established deadlines and warnings.
      Before the first deadline, present `continue-session` with the changed policy through B and confirm A sees the
      same renewed deadline and warning. Confirm the second session keeps the initial policy until its own qualifying
      refresh. Present `unrelated-background-traffic` and confirm the deadline is unchanged. Advance to exactly that
      deadline, present qualifying activity, then increase the timeout and try again after the deadline; both clients
      return `NoUsableSession`. Consume one schema-invalid synthetic tenant policy through `TenantConfigService` and
      record rejection before an effective session policy exists. Write the execution record from the quickstart
      template in the implementation PR, including V-001, V-002, V-003, V-004, V-005, V-006, V-009, and V-010. Do not
      edit `verification.md`. Do not retain raw records, credentials, tokens, or partner identifiers.
- [x] T030 Leave operational observability unclaimed. Preserve the existing `session.id` annotation in
      `packages/frontend-services/src/session.ts` only on usable paths. Do not add a durable log, span, attribute,
      telemetry-payload, or exporter test. If a temporary trace or log probe was used to diagnose a race, remove it
      before T031 and retain only safe revision-attributable observations. An empty log, Tempo, Loki, or Prometheus
      result is not evidence of renewal or expiration.
- [ ] T031 Delete `packages/frontend-services/tests/manual/session-renewal.probe.ts` and any local transcript. Remove
      only scenario-owned session and tenant fixtures, dispose both clients and runtimes, and stop only Compose or
      processes that T024 or T029 started. Never flush or broadly clear a shared Redis. Confirm `git status` contains
      no probe, generated report, credential, or temporary instrumentation.
- [ ] T032 Run the automated evidence in `specs/159-session-renewal-expiration/quickstart.md` from the repository
      root: `pnpm --filter @pathableai/pre-ets-frontend-services test`, then `docker compose up -d --wait redis`,
      `docker compose exec redis redis-cli ping`, and
      `REDIS_URL=redis://127.0.0.1:6379 pnpm --filter @pathableai/pre-ets-frontend-services test:integration`. Record
      commands, revision, store version, owned-prefix cleanup, and failures separately from the plan. Do not treat a
      skipped Redis as a passed race.
- [ ] T033 Run the root `package.json` scripts `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm format:check`,
      `pnpm check:unused`, `pnpm check:health`, and `pnpm check:changes`, plus
      `pnpm --filter @pathableai/pre-ets-frontend-services exec fallow health --complexity` on
      `packages/frontend-services/src/session.ts` and `packages/frontend-services/src/session/store.ts` when those
      files grew large enough to split. Fix underlying findings. Apply lint fixes before formatting. These gates are
      repository quality, not V-001–V-010 execution evidence.
- [ ] T034 Reconcile the completion map in `specs/159-session-renewal-expiration/tasks.md` with the implementation PR
      record: exact revision, environment and dependency versions, safe inputs, public outcomes by claim ID,
      automated and manual results, cleanup, and limitations. Every checked task must have its named evidence or an
      explicit approved limitation. Do not edit requirements, delivery plans,
      `specs/159-session-renewal-expiration/spec.md`, `specs/159-session-renewal-expiration/verification.md`,
      `specs/159-session-renewal-expiration/plan.md`, or `specs/159-session-renewal-expiration/contracts/modules.md`.

## Dependencies and execution order

```text
T001 → (T002 || T003)
         ↓
T004 → T005 → (T006 || T007)
         ↓
US1 evidence T008 → T009
         ↓
US1 behavior T010 → T011 → T012 → T013
         ↓
US2 evidence T014 → T015 → T016 → T017 → T018
         ↓
US3 evidence (T019 || T020) → T021 → T022 → T023 → T024
         ↓
US4 evidence T025 → T026 → T027
         ↓
T028 → T029 → T030 → T031 → T032 → T033 → T034
```

- T002 and T003 follow T001 and may run together. T006 and T007 follow T005 and may run together.
- T008 and T009 share `packages/frontend-services/tests/lib/session.test.ts` and stay sequential. They depend on the
  T005 signature and are expected to fail until T012.
- T010 precedes T011 so the memory helper understands the script the private store will use. T011 precedes T012.
  T012 is the first production behavior for `refreshForTenant`.
- User Story 2 edits the same test, helper, store, and parent files as User Story 1, so it starts after T013.
  T014's expiry assertion changes the current `redis.entries.size === 1` expectation only when T016–T017 implement
  the approved `DEL`.
- T019 and T020 may run together after T018. They use different files. T020 may be authored beside late User Story 2
  work only when that work is not editing `packages/frontend-services/tests/integration/session-redis.test.ts`.
  T024 waits until T017 and T023 are complete.
- T025 may start after T005 because invalid consumption must not call session renewal. T026 waits for T012. User
  Story 4 does not edit session production files, so it may proceed beside User Story 2 and User Story 3 after T012.
  T027 waits for T026.
- T028 follows T007 because both may touch `packages/frontend-services/tests/unit/reference-session-enforcement.test.ts`.
  T029 follows the automated story evidence it cross-checks. T030 and T031 are mandatory even when T029 fails.
  T032 follows cleanup so a leftover probe is not an automated result. T033 follows T032. T034 is last.

## Parallel execution examples

These are scheduling examples, not authorization to spawn agents during task generation.

| Phase or story     | Concurrent work after the entry gate                                              | Join point         |
| ------------------ | --------------------------------------------------------------------------------- | ------------------ |
| Baseline           | T002 installed Effect and Redis declarations; T003 Fallow guard                   | Before T004        |
| Foundation         | T006 reference-session double; T007 authentication-entry doubles                  | Before story tests |
| US1                | None. T008 and T009 share `tests/lib/session.test.ts`                             | T010               |
| US2                | None. The story continues the US1 files                                           | T018               |
| US3                | T019 public failure scenarios; T020 real-Redis races and malformed identity       | T021               |
| US4 beside US2/US3 | T025 invalid-policy composition file after T005; production edits stay in US2/US3 | T026 after T012    |
| Cross-cutting      | None. The manual probe, Redis prefix, and cleanup are shared                      | T034               |

Do not share a mutable Redis prefix, client, or temporary probe between parallel workers. Deterministic scenarios use
a fresh memory Redis per case.

## Implementation strategy

### MVP first: User Story 1

1. Complete T001–T007.
2. Write T008–T009 and observe them fail.
3. Implement T010–T012 and record T013.
4. Stop and validate qualifying pre-deadline renewal and independent policy adoption through the public service.
5. Do not call the feature complete until User Stories 2–4, the manual procedure, cleanup, and the quality gates
   finish.

### Incremental delivery

1. **US1** renews a still-usable session from one current policy and refuses a mismatched tenant without mutation.
2. **US2** keeps excluded activity from writing and makes equality, lateness, and timeout increases non-reviving
   without a browser timer.
3. **US3** proves two real clients converge, and keeps storage failure distinct from no usable session.
4. **US4** proves the real tenant consumer rejects invalid policy before a session input exists.
5. **Cross-cutting completion** runs the manual two-client procedure, removes probes, and records limits.

## Contract and verification completion map

| Contract or claim                                                                          | Primary tasks                      | Evidence boundary and approved limitation                                                                                               |
| ------------------------------------------------------------------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `QualifyingSessionActivity`, `ExcludedSessionActivity`, and `RefreshSessionForTenantInput` | T004, T008, T014                   | Closed literals and `policy?: never` at the public parent. Downstream provenance remains #154–#156.                                     |
| `SessionService.refreshForTenant` signature and errors                                     | T005–T007, T012, T017, T023        | Existing `establish`, `read`, and `readForTenant` stay source-compatible. Package-root `src/index.ts` stays unchanged.                  |
| Prepare-then-single-mutation, mismatch before expiry, no stale retry                       | T011, T012, T016, T019, T022, T023 | Public outcomes plus memory-helper and real-Redis non-mutation. Script return encoding may vary if it stays exhaustive and fail closed. |
| Post-storage Effect-clock sample                                                           | T012, T014, T017                   | Delayed public read/refresh returns `NoUsableSession`. Receipt time remains the renewal-eligibility input.                              |
| `StoredSessionV1` unchanged                                                                | T011, T016                         | No codec migration. Identity, tenant, version, and telemetry ID stay with the replaced deadline and warning lead.                       |
| `TenantConfigService` owns policy validation                                               | T025–T027                          | Existing `tests/lib/tenant-policy.test.ts` matrix is reused. Session code does not import the tenant config child.                      |
| V-001 usable deadline, warning, identity, and tenant                                       | T008, T012, T020, T028, T029       | Public service, optional #219 read fixture, and manual two-client read.                                                                 |
| V-002 every qualifying category renews, including Continue                                 | T008, T009, T012, T020, T029       | `continue-session` is the server category for Continue or Keep working.                                                                 |
| V-003 current policy on refresh only                                                       | T008, T012, T020, T026, T029       | Unrefreshed sessions keep established state. Real consumer composition is T026.                                                         |
| V-004 excluded activity does not write                                                     | T014, T016, T018, T029             | Deadline before and after each excluded literal is identical.                                                                           |
| V-005 no revival at or after the deadline                                                  | T014, T016, T017, T020, T029       | Equality is expired. A later timeout increase does not revive.                                                                          |
| V-006 independent clients and races                                                        | T020, T024, T029                   | Two forced orders plus one overlapping barrier. Finite schedules are not every topology.                                                |
| V-007 usable, no-usable, and storage failure stay distinct                                 | T019, T020, T023, T024             | Existing establish/read failure tests are reused. Commit-then-fail is not retried. Outage recovery remains #221.                        |
| V-008 missing and expired need no tombstone                                                | T014, T016, T019, T024             | The previous public-service assertion that expiry leaves the key in place is replaced by one final `DEL`.                               |
| V-009 invalid policy never reaches session use                                             | T025, T027, T029                   | Domain matrix reused from `tenant-policy.test.ts`. This is not PREETS-TENANT-004 HTTP mapping.                                          |
| V-010 no browser timer                                                                     | T014, T017, T020, T029             | Server-side clock and real-store reads after the deadline.                                                                              |
| Manual procedure                                                                           | T029–T031, T034                    | Live two-client observation beyond the automated matrices. The probe is deleted.                                                        |
| Operational observability                                                                  | T030                               | No new monitoring claim and no durable telemetry test.                                                                                  |

## Intentionally reused evidence and approved limitations

- `packages/frontend-services/tests/lib/tenant-policy.test.ts` remains the exhaustive owner of integral timeout 5–30,
  warning strictly below the effective timeout, omitted defaults 30/5, and the five-minute timeout defaulting to
  warning `0`. User Story 4 adds the proof that those rejections occur before a session policy is supplied.
- Existing `packages/frontend-services/tests/lib/session.test.ts` establishment, absent or malformed reference,
  shared-read, and storage-failure scenarios stay in place. The at-and-after-deadline scenario is updated because the
  approved transition deletes the owned key.
- Existing `packages/frontend-services/tests/integration/session-redis.test.ts` independent reads and disconnected
  establish, read, and tenant-admission cases stay in place. User Story 3 adds refresh, the three race schedules, and
  the malformed-identity non-mutation case.
- `packages/frontend-services/tests/unit/reference-session-enforcement.test.ts` and
  `packages/frontend-services/tests/unit/authentication-entry-failures.test.ts` change only by gaining the required
  `refreshForTenant` double. Their current admission and callback-failure claims are reused.
- Requirements BDD, browser activity production, warning accessibility, cross-tab coordination, logout, and recovery
  are not tasks. They remain #154–#158.
- Comprehensive page, route-handler, Server Action, and protected HTTP enforcement remain #154. A bounded #219
  fixture does not establish that coverage.
- Backend persistence, backend expiration-response policy, absolute maximum lifetime, cloud or ingress behavior,
  heartbeat, connection loss, and CI cadence are not established.
- Real-store outage, recovery, and their races remain #221. This slice only preserves the public storage-failure
  outcome.
- Fresh-authentication comparison, clock tolerance, and provider compatibility remain outside ordinary idle
  renewal evidence.
- No store, application, browser, or operational procedure has been executed by this task list. Checked boxes belong
  to implementation, after evidence exists.
