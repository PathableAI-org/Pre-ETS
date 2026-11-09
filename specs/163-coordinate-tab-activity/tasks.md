---
description: "Tasks for coordinating intentional activity and logout across session-sharing tabs (#155, S3)"
---

# Tasks: Coordinate Intentional Activity and Logout Across Session-Sharing Tabs

**Input**: `specs/163-coordinate-tab-activity/` — [spec.md](spec.md), [verification.md](verification.md),
[plan.md](plan.md), [contracts/modules.md](contracts/modules.md), [research.md](research.md),
[data-model.md](data-model.md), [quickstart.md](quickstart.md)

**Branch**: `163-coordinate-tab-activity-impl` (stacked on the plan branch)

**Scope**: plan increments 1–4. Increment 5 (live multi-tab evidence) is gated on #158's B6 freshness confirmation
and is listed in Phase 9 as not executable here (research F-1, S1 precedent). Logout presentation follows maintainer
decision A (research D8, F-3); logout ends the application session only (research F-2).

**Tests**: generated from [verification.md](verification.md) and the contract-evidence tables in
[contracts/modules.md](contracts/modules.md). Module evidence supports, but is not reported as, feature evidence.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an unfinished contract)
- **[Story]**: US1–US6 from [spec.md](spec.md)

## Phase 1: Setup — baseline and declarations

- [ ] T001 Record the baseline revision and confirm installed declarations named in research "Installed dependency
      facts": `NextResponse.json`, `Schema.fromJsonString`, `Schema.Literals`, `Schema.decodeUnknownEffect`,
      `Clock.currentTimeMillis` in `packages/frontend-services`; `Alert`, `Button`, `Heading` (forwardRef), `Link`,
      `Text`, `Input`, `Select`, `Checkbox`, `Textarea`, `Label`, `FormGroup` in `@pathableai/react` 0.3.0; DOM
      `BroadcastChannel` and `navigator.locks` in the frontend TypeScript lib.
- [ ] T002 Run `fallow guard` on the files this plan changes (`packages/frontend-services/src/next.ts`,
      `src/next/{session,cookies}.ts`; `packages/frontend/src/app/(app)/layout.tsx`,
      `src/features/session-reference/reference-operation.tsx`) and on each new file before writing it.

## Phase 2: Foundational — coordination server contract (increment 1)

Blocks every story: the snapshot, tag, and three endpoints are what every tab consumes.

- [ ] T003 Write `packages/frontend-services/tests/unit/coordination.test.ts` through `src/next.ts` only:
      Fast-Check property that activity and logout reach the store iff the body tag equals the cookie's derived tag
      and the request is same-origin JSON (recording `SessionService` Layer); tag property (deterministic per
      reference, distinct across references, never the SHA-256 store-key digest); examples for `sec-fetch-site`
      `cross-site`/`same-site`/absent with foreign `Origin`/absent with matching `Origin`, `text/plain` → 415,
      malformed and excess-property bodies → 400, mismatch 403, outage 503, tenant failure 404/500, no usable
      session 401; status never calls `refreshForTenant`; every response `Cache-Control: private, no-store` and
      non-200 bodies empty (contracts "Contract evidence — frontend-services adapters").
- [ ] T004 Implement private child `packages/frontend-services/src/next/coordination.ts`: `InPageSessionActivity`,
      `SessionCoordinationSnapshot`, `SessionActivityRequestBody`, `LogoutRequestBody` (exact signatures from
      contracts/modules.md); tag `base64url(SHA-256("preets:session-coordination:v1\0" + reference))` with
      `timingSafeEqual` comparison; module-level `Schema.decodeUnknownEffect(Schema.fromJsonString(...))` with
      `onExcessProperty: "error"`; same-origin check (`sec-fetch-site`, else `Origin` vs `request.nextUrl.origin`);
      programs `Effect.fn("sessionActivity")`, `Effect.fn("sessionStatus")`, `Effect.fn("logout")` with the HTTP
      outcome table; private `CoordinationTagMismatch` and `CrossOriginRequest` tagged errors; `_tag` matching.
- [ ] T005 Add `clearSessionCookie(response, request)` (`Max-Age=0`, same attributes) to
      `packages/frontend-services/src/next/cookies.ts`.
- [ ] T006 Extend `ResolvedSessionRequest` with `readonly coordination: SessionCoordinationSnapshot | undefined`
      in `packages/frontend-services/src/next/session.ts`; present exactly when `session` is `UsableSession`; add a
      `readSessionRequest` example to `tests/unit/reference-session-enforcement.test.ts` (present iff usable; no
      reference or identity in the snapshot).
- [ ] T007 Re-export `createSessionActivityHandler`, `createSessionStatusHandler`, `createLogoutHandler` and the
      wire types from `packages/frontend-services/src/next.ts` and `src/index.ts`.
- [ ] T008 Write `packages/frontend-services/tests/integration/coordination-redis.test.ts` on owned prefixes:
      activity returns the stored renewed deadline; activity after invalidation or expiry → 401 and no record; logout
      → 204, `Max-Age=0`, record absent; status twice across time leaves the stored deadline unchanged; a
      disconnected store → 503 for status/activity/logout with no cookie change.

**Checkpoint**: module evidence for the adapters passes (quickstart §1, first two commands).

## Phase 3: US2 — Count only intentional activity (P1) (increment 2, part)

**Goal**: only classified, trusted in-page interaction is communicated, in B5-W windows (FR-004–FR-008).

**Independent test**: frontend unit suite; browser evidence V-006–V-008 is gated (Phase 9).

- [ ] T009 [US2] Write `packages/frontend/tests/unit/session-coordination.test.ts` through
      `src/features/session-coordination.ts`: D4 classification table with plain event-shaped objects (each row, each
      exclusion, untrusted, disabled/`inert`/`aria-hidden` targets, lone modifier keys); Fast-Check B5-W property over
      generated interaction times, deadlines, and tab interleavings (every interaction covered by a send within 60 s;
      sends ≥ 60 s apart unless the deadline was < 60 s away; first interaction after ≥ 60 s of silence sends at
      once); foreign-tag record decides like no record. Add `@fast-check/vitest` 0.5.0 to frontend devDependencies
      (already in the lockfile for frontend-services).
- [ ] T010 [P] [US2] Implement `classifySessionActivity(event, { gestureInCurrentTask })` in
      `packages/frontend/src/features/session-coordination/activity-classification.ts` (research D4).
- [ ] T011 [P] [US2] Implement `decideActivityCommunication(record, { coordinationTag, deadline, now })` and the
      window-end flush rule in `packages/frontend/src/features/session-coordination/activity-window.ts` (research D5;
      record fields `coordinationTag`, `lastCommunicatedAt: number | undefined`, `pendingSince: number | undefined`).
- [ ] T012 [US2] Implement `packages/frontend/src/features/session-coordination/session-endpoints.ts`
      (`POST /session/activity`, `GET /session/status` with `AbortSignal.timeout(1500)`, `POST /auth/logout`; narrow
      JSON; map statuses to coordinator outcomes; type-only imports from frontend-services).
- [ ] T013 [US2] Implement `packages/frontend/src/features/session-coordination/tab-channel.ts`: `BroadcastChannel
      ("preets-session-coordination")` messages `renewed`/`pending`/`logged-out` (data-model), `localStorage` record
      `preets-session-activity:v1` (try/catch; malformed = absent), `navigator.locks.request
      ("preets-session-activity")`; without locks, send immediately.

## Phase 4: US1 + US4 — Shared deadline across tabs and joining tabs (P1/P2) (increment 2, part)

**Goal**: tabs adopt the latest snapshot, broadcast renewals, and confirm before acting on a local deadline
(FR-001, FR-002, FR-011, FR-012; research D6, D7).

- [ ] T014 [US1] Implement `packages/frontend/src/features/session-coordination/coordinator.tsx` (client): state
      machine in data-model "Tab coordination states"; capture-phase listeners on the content wrapper; gesture flag
      cleared with `setTimeout(0)`; snapshot conversion `localNow + (deadline - serverTime)`; adopt-if-later and
      broadcast `renewed` on mount (join, US4), activity 200, and status 200; one confirmation timer at the local
      deadline; 401/other tag → `Ended`; 403/503/network/timeout → `Concealed` with retry.
- [ ] T015 [P] [US1] Add shared `packages/frontend/src/providers/session-confirmation.tsx`
      (`SessionConfirmationProvider`, `useSessionConfirmation`; outside a provider resolves without effect).
- [ ] T016 [US1] Expose `SessionCoordinator`, `classifySessionActivity`, `decideActivityCommunication` and the
      window types from `packages/frontend/src/features/session-coordination.ts`.
- [ ] T017 [US1] `ReferenceOperation` calls `useSessionConfirmation()` after its action settles in
      `packages/frontend/src/features/session-reference/reference-operation.tsx` (research D6).

## Phase 5: US3 — Log out once, everywhere (P1) (increment 2, part)

- [ ] T018 [P] [US3] `packages/frontend/src/features/session-coordination/logout-control.tsx`: `Button` "Log out",
      busy while `LoggingOut`, immediate send (FR-009, FR-013).
- [ ] T019 [P] [US3] `packages/frontend/src/features/session-coordination/signed-out-notice.tsx`: `Alert` with
      `Heading`, polite live region, `Link href="/"` "Log in"; focus the heading only in the initiating tab
      (FR-015, FR-023; decision A).
- [ ] T020 [US3] Wire logout outcomes in the coordinator: 204 → broadcast `logged-out` and `Ended`; 401/409 →
      `Ended` and broadcast without claiming to have ended a session; 403/503/network → `LogoutFailed` (concealed,
      retry), no broadcast (FR-014, FR-021). `Ended` unmounts protected content.

## Phase 6: US5 — Keep other sessions independent (P2)

- [ ] T021 [US5] Ignore channel messages and storage records for another tag in the coordinator and tab channel;
      treat a status snapshot with another tag as ended (research D2, D13). Server-side refusal is T003/T004.

## Phase 7: US6 — Resume a suspended tab safely (P2)

- [ ] T022 [US6] In the coordinator, handle `visibilitychange` (visible), `resume`, and `pagehide` (`persisted`):
      past local deadline → conceal (`hidden` + `inert`) then confirm; otherwise confirm with content visible and
      conceal on ended/undeterminable; bfcache concealment at `pagehide`; `RestoredPageGuard` unchanged (research
      D9).

## Phase 8: Application composition (increment 3)

- [ ] T023 Add route files `packages/frontend/src/app/session/activity/route.ts` (`POST`),
      `src/app/session/status/route.ts` (`GET`), `src/app/auth/logout/route.ts` (`POST`), each
      `dynamic = "force-dynamic"`.
- [ ] T024 Extend `packages/frontend/src/app/(app)/layout.tsx`: read host and cookie, `readSessionRequest`, redirect
      to `/auth/login` without a usable session, render `SessionCoordinator` with `resolved.coordination`.
- [ ] T025 [P] Add the fixture feature `packages/frontend/src/features/coordination-fixtures.ts` with
      `coordination-fixtures/{roster,participant,fixture-action-form,action-state}.tsx|ts` (`RosterFixture`,
      `ParticipantFixture`, `FixtureActionState`; synthetic content only; link between pages; button, text input,
      select, checkbox, textarea; "focus later" control after 2 s; Server Action form calling
      `useSessionConfirmation()`), the pages `src/app/(app)/coordination/{roster,participant}/page.tsx`, and the
      action `src/app/(app)/coordination/actions.ts` (research D11).
- [ ] T026 Update current-behavior docs: `docs/session-state.md` (endpoints, outcome table, tag, browser coordination,
      logout, inventory) and `docs/authentication.md` (logout ends the application session only).
- [ ] T027 Requirements BDD: read PREETS-SESSION-009 on `origin/main`; add `@partial`
      `tests/bdd/requirements/session-tab-coordination.feature` with the ungated scenario that needs no session
      (activity without a usable session does not revive access, SESSION-009 AC4), reusing existing steps; record
      that the prepared-record rows of quickstart §3 are manual (BDD steps must not open session stores) and that
      every session-requiring scenario is gated on #158. Run `pnpm test:bdd:dry` and the tagged scenarios.

## Phase 9: Evidence and completion

- [ ] T028 Increment 4: execute quickstart §3 against a production build with a transient, uncommitted scratchpad
      preparer importing only the built public `SessionService`, owned prefixes, and cleanup; execute the V-015
      server rows (status and logout with the store unavailable). Record results under quickstart "Execution
      results" without cookie values, tags, or references.
- [ ] T029 Transient browser probe (quickstart §1 note): programmatic `element.focus()` in a timeout vs Tab focus
      through the classifier on a public scratch page; log, then remove. Record the result.
- [ ] T030 Record increment 5 (V-001–V-004, V-006–V-008, V-009 browser part, V-010–V-014, V-015 browser part, V-016, V-017)
      as **incomplete — gated on #158** in quickstart "Execution results".
- [ ] T031 Quality gates: `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm check:unused`,
      `pnpm check:health`, `pnpm check:changes`, frontend-services unit and integration suites, frontend unit suite.

## Dependencies

- Phase 2 blocks everything. T009 precedes T010/T011. T012–T013 precede T014. T015 precedes T014 and T017.
  T018–T019 precede T020. T014 precedes T020–T022. Phase 8 needs Phases 2–7. Phase 9 needs Phase 8.
- Parallel: T010 ∥ T011; T015 ∥ T012/T013; T018 ∥ T019; T025 ∥ T023/T024.

## Traceability

| Claim                                        | Implementation  | Evidence here                    | Status after increments 1–4 |
| -------------------------------------------- | --------------- | -------------------------------- | --------------------------- |
| V-005 HTTP part                              | gate (S1), T004 | T028 (manual, prepared records)  | executed                    |
| V-009 HTTP denial part                       | T004, S2        | T008, T027, T028                 | executed                    |
| V-015 server part                            | T004            | T003, T008, T028                 | executed                    |
| V-001–V-004, V-006–V-008, V-010–V-014, V-016, V-017 | T010–T025       | module evidence T003, T008, T009 | incomplete (#158)           |

Reused evidence: S2 session service and store suites (renewal, no revival, invalidation, outage); S1 gate unit,
property, and integration suites.
