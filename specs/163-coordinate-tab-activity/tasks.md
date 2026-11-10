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

- [x] T001 Record the baseline revision and confirm installed declarations named in research "Installed dependency
      facts": `NextResponse.json`, `Schema.fromJsonString`, `Schema.Literals`, `Schema.decodeUnknownEffect`,
      `Clock.currentTimeMillis` in `packages/frontend-services`; `Alert`, `Button`, `Heading` (forwardRef), `Link`,
      `Text`, `Input`, `Select`, `Checkbox`, `Textarea`, `Label`, `FormGroup` in `@pathableai/react` 0.3.0; DOM
      `BroadcastChannel` and `navigator.locks` in the frontend TypeScript lib.
- [x] T002 Run `fallow guard` on the files this plan changes (`packages/frontend-services/src/next.ts`,
      `src/next/{session,cookies}.ts`; `packages/frontend/src/app/(app)/layout.tsx`,
      `src/features/session-reference/reference-operation.tsx`) and on each new file before writing it.

## Phase 2: Foundational — coordination server contract (increment 1)

Blocks every story: the snapshot, tag, and three endpoints are what every tab consumes.

- [x] T003 Write `packages/frontend-services/tests/unit/coordination.test.ts` through `src/next.ts` only:
      Fast-Check property that activity and logout reach the store iff the body tag equals the cookie's derived tag
      and the request is same-origin JSON (recording `SessionService` Layer); tag property (deterministic per
      reference, distinct across references, never the SHA-256 store-key digest); examples for `sec-fetch-site`
      `cross-site`/`same-site`/absent with foreign `Origin`/absent with matching `Origin`, `text/plain` → 415,
      malformed and excess-property bodies → 400, mismatch 403, outage 503, tenant failure 404/500, no usable
      session 401; status never calls `refreshForTenant`; every response `Cache-Control: private, no-store` and
      non-200 bodies empty (contracts "Contract evidence — frontend-services adapters").
- [x] T004 Implement private child `packages/frontend-services/src/next/coordination.ts`: `InPageSessionActivity`,
      `SessionCoordinationSnapshot`, `SessionActivityRequestBody`, `LogoutRequestBody` (exact signatures from
      contracts/modules.md); tag `base64url(SHA-256("preets:session-coordination:v1\0" + reference))` with
      `timingSafeEqual` comparison; module-level `Schema.decodeUnknownEffect(Schema.fromJsonString(...))` with
      `onExcessProperty: "error"`; same-origin check (`sec-fetch-site`, else `Origin` vs `request.nextUrl.origin`);
      programs `Effect.fn("sessionActivity")`, `Effect.fn("sessionStatus")`, `Effect.fn("logout")` with the HTTP
      outcome table; private `CoordinationTagMismatch` and `CrossOriginRequest` tagged errors; `_tag` matching.
- [x] T005 Add `clearSessionCookie(response, request)` (`Max-Age=0`, same attributes) to
      `packages/frontend-services/src/next/cookies.ts`.
- [x] T006 Extend `ResolvedSessionRequest` with `readonly coordination: SessionCoordinationSnapshot | undefined`
      in `packages/frontend-services/src/next/session.ts`; present exactly when `session` is `UsableSession`; add a
      `readSessionRequest` example to `tests/unit/reference-session-enforcement.test.ts` (present iff usable; no
      reference or identity in the snapshot).
- [x] T007 Re-export `createSessionActivityHandler`, `createSessionStatusHandler`, `createLogoutHandler` and the
      wire types from `packages/frontend-services/src/next.ts` and `src/index.ts`.
- [x] T008 Write `packages/frontend-services/tests/integration/coordination-redis.test.ts` on owned prefixes:
      activity returns the stored renewed deadline; activity after invalidation or expiry → 401 and no record; logout
      → 204, `Max-Age=0`, record absent; status twice across time leaves the stored deadline unchanged; a
      disconnected store → 503 for status/activity/logout with no cookie change.

**Checkpoint**: module evidence for the adapters passes (quickstart §1, first two commands).

## Phase 3: US2 — Count only intentional activity (P1) (increment 2, part)

**Goal**: only classified, trusted in-page interaction is communicated, in B5-W windows (FR-004–FR-008).

**Independent test**: frontend unit suite; browser evidence V-006–V-008 is gated (Phase 9).

- [x] T009 [US2] Write `packages/frontend/tests/unit/session-coordination.test.ts` through
      `src/features/session-coordination.ts`: D4 classification table with plain event-shaped objects (each row, each
      exclusion, untrusted, disabled/`inert`/`aria-hidden` targets, lone modifier keys); Fast-Check B5-W property over
      generated interaction times, deadlines, and tab interleavings (every interaction covered by a send within 60 s;
      sends ≥ 60 s apart unless the deadline was < 60 s away; first interaction after ≥ 60 s of silence sends at
      once); foreign-tag record decides like no record. Add `@fast-check/vitest` 0.5.0 to frontend devDependencies
      (already in the lockfile for frontend-services).
- [x] T010 [P] [US2] Implement `classifySessionActivity(event, { gestureInCurrentTask })` in
      `packages/frontend/src/features/session-coordination/activity-classification.ts` (research D4).
- [x] T011 [P] [US2] Implement `decideActivityCommunication(record, { coordinationTag, deadline, now })` and the
      window-end flush rule in `packages/frontend/src/features/session-coordination/activity-window.ts` (research D5;
      record fields `coordinationTag`, `lastCommunicatedAt: number | undefined`, `pendingSince: number | undefined`).
- [x] T012 [US2] Implement `packages/frontend/src/features/session-coordination/session-endpoints.ts`
      (`POST /session/activity`, `GET /session/status` with `AbortSignal.timeout(1500)`, `POST /auth/logout`; narrow
      JSON; map statuses to coordinator outcomes; type-only imports from frontend-services).
- [x] T013 [US2] Implement `packages/frontend/src/features/session-coordination/tab-channel.ts`: `BroadcastChannel
      ("preets-session-coordination")` messages `renewed`/`pending`/`logged-out` (data-model), `localStorage` record
      `preets-session-activity:v1` (try/catch; malformed = absent), `navigator.locks.request
      ("preets-session-activity")`; without locks, send immediately.

## Phase 4: US1 + US4 — Shared deadline across tabs and joining tabs (P1/P2) (increment 2, part)

**Goal**: tabs adopt the latest snapshot, broadcast renewals, and confirm before acting on a local deadline
(FR-001, FR-002, FR-011, FR-012; research D6, D7).

- [x] T014 [US1] Implement `packages/frontend/src/features/session-coordination/coordinator.tsx` (client): state
      machine in data-model "Tab coordination states"; capture-phase listeners on the content wrapper; gesture flag
      cleared with `setTimeout(0)`; snapshot conversion `localNow + (deadline - serverTime)`; adopt-if-later and
      broadcast `renewed` on mount (join, US4), activity 200, and status 200; one confirmation timer at the local
      deadline; 401/other tag → `Ended`; 403/503/network/timeout → `Concealed` with retry.
- [x] T015 [P] [US1] Add shared `packages/frontend/src/providers/session-confirmation.tsx`
      (`SessionConfirmationProvider`, `useSessionConfirmation`; outside a provider resolves without effect).
- [x] T016 [US1] Expose `SessionCoordinator`, `classifySessionActivity`, `decideActivityCommunication` and the
      window types from `packages/frontend/src/features/session-coordination.ts`.
- [x] T017 [US1] `ReferenceOperation` calls `useSessionConfirmation()` after its action settles in
      `packages/frontend/src/features/session-reference/reference-operation.tsx` (research D6).

## Phase 5: US3 — Log out once, everywhere (P1) (increment 2, part)

- [x] T018 [P] [US3] `packages/frontend/src/features/session-coordination/logout-control.tsx`: `Button` "Log out",
      busy while `LoggingOut`, immediate send (FR-009, FR-013).
- [x] T019 [P] [US3] `packages/frontend/src/features/session-coordination/signed-out-notice.tsx`: `Alert` with
      `Heading`, polite live region, `Link href="/"` "Log in"; focus the heading only in the initiating tab
      (FR-015, FR-023; decision A).
- [x] T020 [US3] Wire logout outcomes in the coordinator: 204 → broadcast `logged-out` and `Ended`; 401/409 →
      `Ended` and broadcast without claiming to have ended a session; 403/503/network → `LogoutFailed` (concealed,
      retry), no broadcast (FR-014, FR-021). `Ended` unmounts protected content.

## Phase 6: US5 — Keep other sessions independent (P2)

- [x] T021 [US5] Ignore channel messages and storage records for another tag in the coordinator and tab channel;
      treat a status snapshot with another tag as ended (research D2, D13). Server-side refusal is T003/T004.

## Phase 7: US6 — Resume a suspended tab safely (P2)

- [x] T022 [US6] In the coordinator, handle `visibilitychange` (visible), `resume`, and `pagehide` (`persisted`):
      past local deadline → conceal (`hidden` + `inert`) then confirm; otherwise confirm with content visible and
      conceal on ended/undeterminable; bfcache concealment at `pagehide`; `RestoredPageGuard` unchanged (research
      D9).

## Phase 8: Application composition (increment 3)

- [x] T023 Add route files `packages/frontend/src/app/session/activity/route.ts` (`POST`),
      `src/app/session/status/route.ts` (`GET`), `src/app/auth/logout/route.ts` (`POST`), each
      `dynamic = "force-dynamic"`.
- [x] T024 Extend `packages/frontend/src/app/(app)/layout.tsx`: read host and cookie, `readSessionRequest`, redirect
      to `/auth/login` without a usable session, render `SessionCoordinator` with `resolved.coordination`.
- [x] T025 [P] Add the fixture feature `packages/frontend/src/features/coordination-fixtures.ts` with
      `coordination-fixtures/{roster,participant,fixture-action-form,action-state}.tsx|ts` (`RosterFixture`,
      `ParticipantFixture`, `FixtureActionState`; synthetic content only; link between pages; button, text input,
      select, checkbox, textarea; "focus later" control after 2 s; Server Action form calling
      `useSessionConfirmation()`), the pages `src/app/(app)/coordination/{roster,participant}/page.tsx`, and the
      action `src/app/(app)/coordination/actions.ts` (research D11).
- [x] T026 Update current-behavior docs: `docs/session-state.md` (endpoints, outcome table, tag, browser coordination,
      logout, inventory) and `docs/authentication.md` (logout ends the application session only).
- [x] T027 Requirements BDD: read PREETS-SESSION-009 on `origin/main`; add `@partial`
      `tests/bdd/requirements/session-tab-coordination.feature` with the ungated scenario that needs no session
      (activity without a usable session does not revive access, SESSION-009 AC4), reusing existing steps; record
      that the prepared-record rows of quickstart §3 are manual (BDD steps must not open session stores) and that
      every session-requiring scenario is gated on #158. Run `pnpm test:bdd:dry` and the tagged scenarios.

## Phase 9: Evidence and completion

- [ ] T028 Increment 4 (**stale: re-run pending** — the recorded run used the superseded protocol; see quickstart
      "Execution results"): execute quickstart §3 against a production build with a transient, uncommitted scratchpad
      preparer importing only the built public `SessionService`, owned prefixes, and cleanup; execute the V-015
      server rows (status and logout with the store unavailable). Record results under quickstart "Execution
      results" without cookie values, tags, or references.
- [x] T029 Transient browser probe (quickstart §1 note): programmatic `element.focus()` in a timeout vs Tab focus
      through the classifier on a public scratch page; log, then remove. Record the result.
- [x] T030 Record increment 5 (V-001–V-004, V-006–V-008, V-009 browser part, V-010–V-014, V-015 browser part, V-016, V-017)
      as **incomplete — gated on #158** in quickstart "Execution results".
- [x] T031 Quality gates: `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm check:unused`,
      `pnpm check:health`, `pnpm check:changes`, frontend-services unit and integration suites, frontend unit suite.

## Dependencies

- Phase 2 blocks everything. T009 precedes T010/T011. T012–T013 precede T014. T015 precedes T014 and T017.
  T018–T019 precede T020. T014 precedes T020–T022. Phase 8 needs Phases 2–7. Phase 9 needs Phase 8.
- Parallel: T010 ∥ T011; T015 ∥ T012/T013; T018 ∥ T019; T025 ∥ T023/T024.

## Traceability

| Claim                                               | Implementation  | Evidence here                    | Status after increments 1–4                                      |
| --------------------------------------------------- | --------------- | -------------------------------- | ---------------------------------------------------------------- |
| V-005 HTTP part                                     | gate (S1), T004 | T028 (manual, prepared records)  | T028 run on the superseded protocol (historical); re-run pending |
| V-009 HTTP denial part                              | T004, S2        | T008, T027, T028                 | T008 and T027 current; T028 historical, re-run pending           |
| V-015 server part                                   | T004            | T003, T008, T028                 | T003 and T008 current; T028 historical, re-run pending           |
| V-001–V-004, V-006–V-008, V-010–V-014, V-016, V-017 | T010–T025       | module evidence T003, T008, T009 | incomplete (#158)                                                |

Reused evidence: S2 session service and store suites (renewal, no revival, invalidation, outage); S1 gate unit,
property, and integration suites.

## Revised-plan rework (plan `e1c8399`)

The plan was revised after these tasks were generated (review corrections R1–R15). The implementation follows the
revision: `observedAtEpochMilliseconds` from Redis `TIME` in the store transitions; the leaf
`next/coordination-snapshot.ts`; the gate's never-renewing endpoint paths and no cookie on any renewal; a
browser-session cookie written only at establishment; no cookie on activity or logout; `adoptSnapshot` and
`flushActivityCommunication`; the inline mount script with the current and ended records; the Server Action submit
guard with tag-checked actions; and the `logout-started` watch with `keepalive` logout.

## Amended-plan rework (plan `b948d17`, R16–R20)

The plan was amended again after review of #364 (user decisions of 2026-11-10). The implementation follows it:

- **R16**: the stored record is schema version 2 with `revision` (1 at establishment, plus 1 on every store write;
  a version-1 record reads as 0 and is rewritten on its next write). `UsableSession` and the snapshot carry it, and
  `adoptSnapshot` adopts only a higher revision for the same tag. `observedAtEpochMilliseconds` is diagnostic.
  Evidence: `session-redis.test.ts` (interleaved reads, excluded refreshes, qualifying refreshes, and a policy change
  across two clients; version-1 migration), `coordination-redis.test.ts`, and the frontend `adoptSnapshot` examples.
- **R17**: the gate no longer renews Server Actions (property in `protection.test.ts`, replacing S1's action-renewal
  example). `authorizeSessionAction` checks the tag and only then renews as `deliberate-form-submission` (Fast-Check
  property with a recording `SessionService` in `coordination.test.ts`; real-Redis stale and missing tags leave the
  revision and deadline unchanged). Both protected actions call it.
- **R18**: logout distinguishes a definitive refusal (403, 503, or another error status) from an ambiguous network
  failure or 10-second timeout. Only a refusal, or a usable answer after an ambiguous outcome, broadcasts
  `logout-failed`, which stops the other tabs' watch.
- **R19**: a confirmed replay passes the guard once for that form and submitter; when storage cannot hold the hint,
  the confirmed tag is kept in memory.
- **R20**: activity-window records are keyed by tag (`preets-session-activity:v1:<tag>`); others are pruned to four.
- **V-004 support**: the header carries `data-session-deadline` and `data-session-warning-lead`.

## Amended-plan rework (plan `1a58fc9`, R21–R25, gaps G1/G2)

- **Mount script removed** (user decision 2026-11-10): `mount-script.ts`, the pre-paint `data-session-ended` style,
  and `data-protected-content` are gone. On mount the coordinator subscribes, replays the ended record, adopts the
  server-rendered snapshot, writes the current-session hint, and broadcasts `renewed` and `session-current`. A hint
  naming another session is checked on resume, not on mount. Gaps G1 and G2 are acknowledged, not handled. The
  bfcache `pagehide` concealment stays.
- **R21/R22**: the logout body and `logout-started` carry `notAfter` (server clock + 10 s, from the tab's server
  offset). The handler answers 408 with no store operation after it (unit). A 503, 408, 5xx, network failure, or
  timeout is ambiguous; a 503 after an applied `DEL` leaves the record absent (real-Redis integration). Watches run
  until `notAfter` + 2 s; `logout-failed` follows a definitive refusal or a usable status after `notAfter`.
- **R24**: without storage or Web Locks, each tab keeps its tag's window in memory and broadcasts `communicated { at }`
  on every send; receivers update their in-memory window.
- **R25**: the BDD feature keeps only no-session denial scenarios (unchanged).

## Amended-plan rework (plan `b7533fe` and `04392e8`, R26–R29)

- **R26/R28**: each logout attempt has an `attemptId` in `logout-started`, `logout-failed`, and the
  `preets-session-logout-pending:v1` record. Tabs watch while any attempt of their tag is unresolved, until its
  `notAfter` + 3 s, and replay unexpired attempts on mount (before the ended record) and resume.
- **R27**: `SessionService.invalidate` takes an optional `notAfterEpochMilliseconds`; a store script deletes only while
  Redis `TIME` is at or before it, else `InvalidationExpired` → 408. Real-Redis evidence covers both sides of the
  cutoff, a logout admitted before the cutoff that reaches the delete after it (held through the test Redis fault
  helper, which gained a skip count), and a 503 after an applied delete.
- **R29**: deadlines are held on the server clock and converted with a per-tab offset from request timing
  (`clock-offset.ts`, private, with examples in the unit suite). Every timed response may recalibrate, including equal
  revisions; `renewed` carries the server-clock deadline.
- Review of #364: a usable status ends an ambiguous attempt as failed only if its read started after the cutoff, and
  the protected layout keys the coordinator by session tag.

## Amended-plan rework (plan `17fce4e`, R30–R32)

- **R30**: one `localStorage` key per logout attempt, `preets-session-logout-pending:v1:<tag>:<attemptId>` →
  `{ notAfter }`; each writer touches only its own key.
- **R31**: an attempt resolves only by `logged-out`, its own `logout-failed`, a 401 or different tag, or a usable status
  whose Redis `observedAtEpochMilliseconds` is later than `notAfter`; the `notAfter` + 3 s timer is gone. The same rule
  decides that this tab's own ambiguous attempt failed. Keys of resolved attempts are deleted, including on end.
- **R32**: in the no-storage fallback, a received `communicated { at }` clears this tab's pending activity at or before
  `at`; newer activity stays queued.
- The plan now covers former deviations 15–17 (refusal classification, `logout-failed` broadcast with `attemptId`,
  clock-estimator details), so they are removed below.

## Amended-plan rework (plan `6c7288c`, R33–R37)

- **R33**: ended markers are one key per tag, `preets-session-ended:v1:<tag>` → `{ endedAt }`, pruned after 24 hours.
- **R34**: logout `notAfter` is on the Redis clock, from a second per-tab offset calibrated against snapshots'
  `observedAtEpochMilliseconds` with the same estimator. The handler no longer compares clocks; only the store's atomic
  `TIME` check enforces the cutoff (the receipt-time unit example was removed, and the store-cutoff examples remain).
- **R35**: mount and resume replay every unresolved attempt whatever its age (already true since R31).
- **R36**: the window record gains `pendingLatest`; `applyCommunication` clears pending activity when `at ≥
  pendingLatest`, else sets `pendingSince = max(pendingSince, at)`. A Fast-Check property over generated interactions
  and delayed communications checks coverage within 60 s and no unjustified send.
- **R37**: in the fallback, a joining tab broadcasts `window-query`, answered with `communicated { at }`.

## Implementation deviations from the plan (for plan review)

These do not change any acceptance criterion or HTTP outcome. Each needs reviewer confirmation at the plan gate.

1. **Superseded by R16.** `observedAtEpochMilliseconds` keeps the microsecond fraction it had when it was the
   ordering key, but ordering now uses `revision`, so the field is diagnostic only.
2. **Withdrawn after review of #364.** `ResolvedSessionRequest.coordination` was first made optional because the
   required field broke existing constructions. It is now required as planned (`SessionCoordinationSnapshot |
   undefined`), and the frontend test doubles that construct it were updated. `UsableSession.observedAt…` is required,
   as planned, so S1 and S2 test doubles were updated.
3. **Policy functions are not exported from the feature entry.** Frontend Fallow runs dead-code analysis in production
   mode, so entry exports used only by tests are findings, and suppressions are not allowed. The entry exports only
   `SessionCoordinator`; the unit suite imports the private policy children (`activity-classification.ts`,
   `activity-window.ts`, `snapshot-order.ts`), following the existing `onsite-visit-state.test.ts` precedent. This
   settles the plan's recorded reviewer question against its proposal and conflicts with the root AGENTS.md rule that
   external tests use the parent's public interface. **Accepted by the user after review of #364** as an exception
   following that precedent; the policy functions stay unexported.
4. **The shared provider exposes `useSessionConfirmedActionState`, `CoordinationTagField`, and `ProtectedFormAction`
   instead of `useSessionConfirmation()` returning `{ confirm, coordinationTag }`.** The run-then-confirm logic and the
   hidden tag field were otherwise Fallow clones between the reference operation and the fixture form. The field name
   lives in `providers/coordination-tag-field.ts`, a plain module, because a server action cannot read a value
   exported from a `"use client"` module. Behavior is as planned.
5. **Data-model inconsistency, resolved toward the contract.** Data-model says a different current-session hint or a
   `session-current` message ends a tab at once. Research R14 and the contract say a hint never ends a tab. The
   implementation follows R14: a different hint makes the tab confirm (and conceal on resume) and ends it only on a
   server-confirmed 401 or different tag.
6. **Private file changes**: the controller lives in `session-coordination/tab-coordination.ts`; snapshot ordering in
   `snapshot-order.ts`; the fixture form is part of `coordination-fixtures/roster.tsx` (no `fixture-action-form.tsx`).
7. **The `pending` channel message carries the coalesced `activity` kind**, so whichever tab flushes sends a real
   observed kind. No protected content is added.
8. **A status 401 or different tag also records the tag as ended** (data-model lists "401/409 on logout or status";
   research D8 names only logout). No `logged-out` broadcast is sent for it.
9. **The fixture Server Action sets no receipt cookie.** It reports admission only, which the contract permits.
10. **Frontend devDependency `@fast-check/vitest` 0.5.0** for the B5-W property. It was already in the lockfile.
11. **Logout-watch reads use a one-second timeout and a fixed cadence** (review of #364). R11 says other tabs confirm
    each second; with D7's 1.5-second read timeout and a delay counted from each response, a slow read could push
    concealment past FR-015's two seconds. Watch reads start every second regardless of earlier reads, and each gives
    up (undetermined, so concealed) after one second. Other confirmations keep D7's 1.5 seconds.
12. **Superseded by R18.** `logout-failed` is now sent only for a definitive refusal, so receivers stop their watch as
    the plan says; an ambiguous outcome sends nothing and keeps every tab confirming.
13. **Concealment is a flag beside the view, not a `concealed` view** (review of #364). A logout in progress keeps its
    busy state while an undetermined confirmation hides the content (FR-021). The controller sets `hidden` and `inert`
    on the DOM synchronously (FR-017) and reveals on a usable answer whose read started after concealment began.
14. **Superseded by R28.** The planned `preets-session-logout-pending:v1` record replaces the earlier single-entry
    logout record.
