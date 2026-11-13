# Tasks: Complete Fresh Tenant OIDC Recovery With a New Session

**Input**: [plan.md](plan.md), [spec.md](spec.md), [verification.md](verification.md),
[contracts/modules.md](contracts/modules.md), [contracts/telemetry.md](contracts/telemetry.md),
[research.md](research.md), [quickstart.md](quickstart.md)

**Organization**: Tasks are grouped by the implementation slices in [plan.md](plan.md#phase-7--implementation-slices),
in slice order, and by user story within each slice. Paths are relative to the repository root;
`fs/` abbreviates `packages/frontend-services/`.

## Slice S1 — Freshness confirmation (`382-fresh-oidc-recovery-impl`)

Implements the `authentication.ts` contract, `authentication/freshness.ts`, the provider claim change, the callback
mapping, T-001, and T-002. Advances V-004, V-005, V-006, V-008, V-009, V-016, and V-017, and V-001 and V-003 in part.

### Baseline

- [x] T001 Confirm the installed declarations the contract relies on: `Schema.optionalKey`, `Schema.Literals`,
      `Schema.TaggedError`, `Duration.seconds`, `Effect.annotateCurrentSpan`, `Effect.logWarning`, and
      `Effect.annotateLogs` in `effect` 4.1.2, and `oauth4webapi` 3.8.8 `validateIdTokenAuthTimeClaim`
      (research R4). Record any mismatch as a plan correction, not a workaround.

### Public contract and evidence first (US3, US4)

- [x] T002 [US3] Add `AuthenticationNotFresh` (`evidence: Schema.Literals(["missing", "stale"])`) and add it to the
      `CallbackExpectedFailure` reason union in `fs/src/authentication.ts`. Narrow `TrustedIdentity` to
      `{ issuer, subject, tenantAlias }` (contracts/modules.md, research D5, D7).
- [x] T003 [US3] Add a freshness `describe` block to `fs/tests/lib/authentication.test.ts`, through
      `AuthenticationService` only, reusing that file's signed-token, mocked-fetch, and in-memory Redis world.
      Keeping it there instead of a new `authentication-freshness.test.ts` avoids moving the world into helpers. Use `TestClock` for `createdAt` and the
      callback time (research R6). Examples: - Admitted, at three points: `auth_time` exactly at `startedAt − 30 s`, exactly at `callbackAt + 30 s`, and
      between the bounds. - Denied as `stale`, at three points: one second before the lower bound, one second after the upper bound,
      and far in the future. - Denied as `missing` when `auth_time` is absent. - After each denial: correlation is `clear`, a replay of the same return is `AuthenticationDenied`, and a new
      `prepare` succeeds.

      This covers V-004, V-005, and V-006.
- [x] T004 [US3] In the same file, Fast-Check properties with `@fast-check/vitest` over generated start times,
      callback delays, and `auth_time` offsets, through `it.effect.prop` with Schema inputs: success holds iff
      `startedAt − 30 000 ≤ auth_time × 1 000 ≤ callbackAt + 30 000`, and otherwise the result is
      `AuthenticationNotFresh`/`stale`. Tokens with arbitrary or absent `amr`/`acr` never change the outcome. A second
      property generates tenant files in both client-auth modes with arbitrary valid optional fields (display name,
      connection, idle timeout, warning lead) and shows the outcome depends only on the times (V-008). Use 60 runs
      each for RSA cost.
      This covers V-004, V-008, and V-009.
- [x] T005 [US3] In `fs/tests/lib/authentication.test.ts`: - Change the "missing auth_time" row to expect `AuthenticationNotFresh`/`missing` with `clear`. - Keep the "non-integer auth_time" row as `AuthenticationUnavailable` (research D4). - Drop `authenticatedAt` from the expected trusted identity.
- [x] T006 [US3] In `fs/tests/unit/authentication-entry.test.ts` and `fs/tests/unit/authentication-entry-failures.test.ts`: - Remove every `CallbackFreshness` import and provision. - Drop `authenticatedAt` from stubbed identities. - Add examples where a stubbed `AuthenticationService` fails with `AuthenticationNotFresh` (both categories,
      `clear`). Each response must be the same `authenticationReturn` response as `AuthenticationDenied`, with the
      correlation cookie cleared and no `pathable-session` (V-016, adapter part).

### Private implementation (US1, US3)

- [x] T007 [US3] Create the leaf `fs/src/authentication/freshness.ts`. It exports `FRESHNESS_TOLERANCE`
      (`Duration.seconds(30)`) and a pure `freshnessPosition({ authTimeSeconds, callbackAtMs, startedAtMs })`
      returning `"inside" | "before_window" | "after_window" | "missing"`, compared in integer milliseconds with
      inclusive bounds (research D2). It imports only `effect`.
- [x] T008 [US3] In `fs/src/authentication/provider.ts`: - `IdentityClaims.auth_time` becomes `Schema.optionalKey(Schema.Int)`. - `ProviderIdentity.authenticatedAt` becomes `number | undefined`. - The map passes it through (research D4).
- [x] T009 [US1] In `fs/src/authentication.ts` `complete`: - Read `callbackAt` with `Clock.currentTimeMillis` before qualification (research D3). - After the provider exchange, compute the position from `attempt.createdAt`. - Fail with `callbackFailure(new AuthenticationNotFresh({ evidence }), "clear")` unless `inside`, where
      `evidence` is `missing` or else `stale`. - Return the narrowed `TrustedIdentity`.

      Only `authentication.ts` imports `authentication/freshness.ts`.

### Telemetry (US4)

- [x] T010 [US4] Implement T-001 on the `AuthenticationService.complete` span in `fs/src/authentication.ts`: - `preets.tenant.alias` once resolved. - `preets.authentication.transaction_started_ms` and `preets.authentication.callback_ms` after consumption. - `preets.authentication.freshness`, `preets.authentication.freshness_position`, and
      `preets.authentication.freshness_tolerance_ms` after the exchange. - `preets.outcome = confirmed` on success. - On failure, `preets.outcome` is set via the `Effect.fn` second-argument `tapError` pipeline with
      `annotateOutcome`: `denied`, `unavailable`, `tenant_failure`, `not_fresh_missing`, or `not_fresh_stale`.

      Never emit `auth_time`, `sub`, tokens, code, state, nonce, or PKCE (contracts/telemetry.md). No test asserts
      these signals.
- [x] T011 [US4] Implement T-002 in `fs/src/authentication.ts`: on a freshness denial, emit
      `Effect.logWarning("Authentication freshness denied")` annotated only with `preets.tenant.alias` and
      `preets.authentication.freshness`.

### Adapter integration (US1, US3)

- [x] T012 [US1] In `fs/src/next/callback.ts`: - Remove the `CallbackFreshness` read; `respondToTrustedIdentity` goes straight to `establishSession`, keeping
      its `SessionServiceUnavailable` fail-closed catch. - Map `AuthenticationNotFresh` in `responseForReason` to `responses.authenticationReturn()`.
- [x] T013 [US1] Delete `fs/src/next/freshness.ts` and its export from `fs/src/next.ts`. Confirm no consumer remains
      in `packages/frontend`.

### Feature evidence and docs (US1)

- [x] T014 [US1] In `tests/bdd/requirements/tenant-oidc-callback.feature` and `tests/bdd/steps/authentication.ts`,
      change the real-provider scenario so the cross-instance return establishes a session (research R7): - 303 to `/` - a host-only `pathable-session` cookie and cleared correlation - the next document `/` admitted for the same tenant

      Keep every denial scenario. Update the feature prose to say that freshness confirmation and establishment are
      now observed. Reuse existing steps from `tests/bdd/steps/` before adding any. This covers V-003 in part.
- [x] T015 [US1] Update the prose in `tests/bdd/requirements/default-entry-protection.feature` about unestablished
      `auth_time` validation and session admission to match the reachable behavior, without adding claims beyond S1.
- [x] T016 [US4] In `docs/authentication.md` and `docs/session-state.md`: - Replace the stand-in paragraphs with the confirmed B6 behavior. - Add the T-001 and T-002 rows to the verification signals, with the outcome set and example queries.

      In `features/README.md`, update the sentence saying success scenarios stop at provider arrival.

### Close the slice

- [x] T017 Run `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm check:unused`,
      `pnpm check:health`, `pnpm check:changes`, the frontend-services `test` and `test:integration`, and
      `pnpm test:bdd`. Run `fallow architecture --boundaries` in frontend-services for the new file. Fix findings
      without suppressions.
- [ ] T018 Commit as a Conventional Commit, push, and submit the draft pull request from the implementation
      template with `Contributes to #158`.
- [ ] T019 Request verification with the branch, pushed SHA, slice S1, and the claims and quickstart sections: - claims V-004, V-005, V-006, V-008, V-009, V-016, V-017, and V-001 and V-003 in part - [quickstart.md](quickstart.md) §1, §2, and §4 step 8 (module-boundary context for V-017)
- [ ] T020 Address the report and summarize it in [quickstart.md](quickstart.md#execution-results) as an
      evidence-only commit naming the verified SHA in the pull request body.

## Slice S2 — Real-provider re-entry evidence (`382-fresh-oidc-recovery-impl-reentry`)

Evidence only. Advances V-001, V-002, V-003, V-007, V-010–V-013, V-015, and V-014 in part. Also advances
V-005/V-006/V-017 for the real stale case if research D9 succeeds.

- [x] T021 [US2] Spike research D9: add a tracked Keycloak client with a hardcoded-claim mapper setting `auth_time`
      to a fixed past value in `docker/keycloak/pre-ets-realm.json`, and check the issued ID token through the app's
      T-001 outcome. Keep it only if the outcome is `not_fresh_stale`. Otherwise revert it and record the approved
      limitation.
- [x] T022 [US1] [US2] [US5] [US6] Create `tests/bdd/requirements/fresh-oidc-recovery.feature`. Tag it
      `@partial @preets-session-013`, plus `@preets-session-004` on entry scenarios. Its steps go in
      `tests/bdd/steps/fresh-recovery.ts`, reusing existing steps. Every scenario's browser context first signs in at
      Keycloak directly. Scenarios ([quickstart.md](quickstart.md) §3): - first visit with SSO shows the provider form, then admission - a second page with a valid session sends no provider request - after logout, new tab, refresh, and back/forward show no protected content, then the provider form, then a
      different session cookie - the old reference is denied after the new login - cancel or a provider error leaves no session, and `/` starts login - keyboard Log in from the signed-out notice leads to the provider form and a new session
- [x] T023 [US3] If T021 kept the stale client, add its scenario and tenant fixture: safe page, no session, and a new
      login can start.
- [x] T023a [US1] [US3] Close evidence gaps found in review: - The journey browser keeps Chromium's back-forward cache, which Playwright turns off by default. It records
      `pageshow` events with `persisted`, so a protected page restored from history fails the "no protected content"
      step. - A forward history entry after logout in another page joins the back, refresh, and new-page entries. - A tracked `consent-web` client and Consent tenant let the visitor sign in and then decline at Keycloak's
      grant page. That is a real cancellation at the provider, and the next `/` starts login again (V-007). - The stale and controlled-denial scenarios now also show that the next `/` delegates to login. The stale and
      cancel scenarios also show that a new authorization request starts (V-006, V-007).
- [ ] T024 Run the checks from T017, commit, push, and submit the draft pull request with `Contributes to #158`.
- [ ] T025 Request verification for slice S2 with the claims above and quickstart §3 and §4 (all steps, including
      natural expiry with a scratch five-minute tenant).
- [ ] T026 Address the report and record it in quickstart execution results as an evidence-only commit.

## Slice S3 — Explicit recovery through #157 (`382-fresh-oidc-recovery-impl-explicit`)

Blocked until #157's recovery content and expiration modal exist. Completes V-014 and closes #158.

- [ ] T027 [US6] Add keyboard Log in scenarios from #157's recovery content and modal to
      `tests/bdd/requirements/fresh-oidc-recovery.feature`, and drop `@partial` only if every claim is then covered.
- [ ] T028 Run the checks, commit, push, and submit the draft pull request with `Closes #158`. Request verification
      for V-014 with quickstart §5, then record the report.

## Dependencies

- S1 → S2 (S2 needs live establishment) → S3 (S3 also needs #157).
- Within S1: T001 → T002 → T003–T006 (evidence written against the contract, failing first) → T007 → T008 → T009 →
  T010–T011 → T012–T013 → T014–T016 → T017–T020.
- Parallel: T005 and T006 touch different files from T003/T004 and may proceed together after T002. T015 and T016
  are parallel with T014.

## Traceability

| Claim        | Tasks                  | Reused existing evidence                      | Approved limitation                          |
| ------------ | ---------------------- | --------------------------------------------- | -------------------------------------------- |
| V-001        | T014, T022             | Initiation BDD asserting `max_age=0`          | —                                            |
| V-002        | T025 (manual)          | —                                             | Local Keycloak only                          |
| V-003        | T014, T022             | Session establishment suites                  | —                                            |
| V-004        | T003, T004             | —                                             | Module boundary by design                    |
| V-005, V-006 | T003, T005, T021, T023 | Transaction single-use suites                 | Missing: module only; stale app-level via D9 |
| V-007        | T022                   | Callback denial suites                        | —                                            |
| V-008, V-009 | T004, T019             | —                                             | No real ignoring provider                    |
| V-010–V-013  | T022, T025             | `RestoredPageGuard` suites; no-revival suites | Natural expiry manual; B5 pre-script paint   |
| V-014        | T022 (notice), T027    | —                                             | #157 entry points in S3 only                 |
| V-015        | T022                   | —                                             | —                                            |
| V-016        | T006, T014             | —                                             | —                                            |
| V-017        | T010, T011, T019, T025 | —                                             | Real missing unavailable; real stale via D9  |
| T-001, T-002 | T010, T011             | Existing session spans for `session.id`       | —                                            |
