# Tasks: Warn Before Expiration and Continue Accessibly Across Tabs

**Input**: [plan.md](plan.md), [spec.md](spec.md), [verification.md](verification.md),
[contracts/modules.md](contracts/modules.md), [contracts/telemetry.md](contracts/telemetry.md),
[research.md](research.md), [quickstart.md](quickstart.md)

**Organization**: Tasks are grouped by the implementation slices in [plan.md](plan.md#phase-7--implementation-slices),
in slice order. Each slice is one stacked pull request and is marked ready only after its verification report passes
the [verification gate](../../docs/engineering/verification-harness.md#gate-and-escalation) and its code review has
no open blocking finding. Paths are relative to the repository root; `fs/` abbreviates `packages/frontend-services/`
and `fe/` abbreviates `packages/frontend/`. `[P]` marks a task that can run in parallel with the other `[P]` tasks of
the same group. Story labels map to [spec.md](spec.md) user stories.

Every slice ends with the [Before committing](../../AGENTS.md#before-committing) checks: `pnpm typecheck`,
`pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm check:unused`, `pnpm check:health`, and `pnpm check:changes`.
No check is suppressed. Durable tests never assert spans, facts, or attributes; instrumentation tasks name the
telemetry row they implement, and the verifier observes it.

## Slice A — Warn every sharing tab and Continue (`384-expiration-warning-continue-impl`)

Every sharing tab shows the warning only after the server confirms the threshold, and Continue renews at once as
`continue-session`; only a renewal or the session's end closes it. Lands T-001 to T-005. Asserts V-006, V-007, V-008,
V-010, and V-018 in full, and V-003 (lead of timeout minus 1 only) and V-009 (page-load renewals under gap G2, VL-2) in
part. Not yet blocking: the library close control is visible and does nothing, and the background is not inert, so A
asserts neither V-014 nor V-015. `Contributes to #156`.

### Baseline

- [ ] T001 Re-verify the installed facts the contracts rely on (modules.md "Status"): Effect 4.1.4 `Schema.Literals`
      and its `literals` member; `@pathableai/react` 0.3.0 `Modal` (`open`, `onClose`, `title`, `description`, `footer`,
      `initialFocusRef`, always-rendered close button, Escape calls `onClose`, Tab cycles only inside) and `Button`
      (no ref); `refreshForTenant` already accepts `continue-session` (research F2); the web SDK's default context
      manager does not carry a fact's scope across a Web Lock callback.

### Continue reaches the server (US1, FR-008, research D1; T-005)

- [ ] T002 [US1] In `fs/src/next/coordination.ts`, accept `continue-session` in the activity body:
      `SessionActivityRequestBody.activity` becomes `"continue-session" | InPageSessionActivity`, still derived from the
      handler's schema; `InPageSessionActivity` keeps its five members. Every other check (same origin, JSON, excess
      properties, the observed session's tag, the tenant's effective policy) is unchanged. T-005 becomes reachable
      with `preets.session.activity = continue-session` on the existing `SessionService.refreshForTenant` span.
- [ ] T003 [US1] In `fs/tests/unit/coordination.test.ts`, extend the binding property's activity arbitrary to include
      `continue-session`, so origin, content type, and tag decide its renewal exactly as for in-page kinds, and add a
      renewal example: a `continue-session` body renews with that activity and the tenant's effective policy and
      answers the snapshot without a cookie (modules.md contract evidence, row 1).

### Warning period (US1, US3, FR-001, FR-005, research D2)

- [ ] T004 [P] [US1] Create `fe/src/features/session-coordination/warning-period.ts` with
      `warningThreshold(snapshot): number | undefined` (deadline minus lead minutes on the server clock; `undefined` at
      lead 0) and `inWarningPeriod(snapshot, serverTime): boolean` (lead positive, `serverTime` at or after the
      threshold and before the deadline), over
      `Pick<SessionCoordinationSnapshot, "idleDeadlineEpochMilliseconds" | "warningLeadMinutes">`.
- [ ] T005 [P] [US1] In `fe/tests/unit/session-coordination.test.ts`, a Fast-Check property over deadline, lead, and
      server time (none at lead 0; the period is `[threshold, deadline)`) with boundary examples at the threshold, one
      millisecond before it, and at the deadline (modules.md contract evidence, row 3).

### Browser facts (T-001 to T-004)

- [ ] T006 [US1] In `fe/src/shared/browser-tracing.ts`, add `FocusTarget` `warning_continue` (T-004), `TransitionCause`
      `continue`, `renewal`, and `threshold`, `UiState` `warning_shown`, optional `TransitionTiming.warningLeadMinutes`
      recorded as `preets.session.warning_lead_minutes` (T-002), `recordWarningThreshold(cause, timing): TraceScope`
      recording `TabCoordination.threshold` with `preets.outcome = reached` (T-001), and
      `recordContinueActivation(): TraceScope` recording `Interaction.continue` with `preets.outcome = activated`
      (T-003). No recorder accepts free text.
- [ ] T007 [US1] In `fe/src/shared/browser-tracing/export-filter.ts`, allow-list `TabCoordination.threshold`,
      `Interaction.continue`, and `preets.session.warning_lead_minutes`.

### Opening, closing, and Continue in a tab (US1, US2, FR-005, FR-006, FR-008–FR-011, FR-018, research D3–D7)

- [ ] T008 [US1] In `fe/src/features/session-coordination/session-endpoints.ts`, widen
      `sendActivity(activity: SessionActivityRequestBody["activity"], coordinationTag, timeout?)`; with a timeout the
      request is undetermined when no answer arrives in time.
- [ ] T009 [US1] In `fe/src/features/session-coordination/tab-coordination.ts`, add the warning behind the unchanged
      public entry: `TabViewState.warning?: { continuation: "failed" | "idle" | "sending" } | undefined`, and
      `continueSession(): Promise<void>`, which never throws. - Opening (D3): applying a deadline with a positive held lead schedules a `warning` timer at the local threshold.
      When it fires, pending coalesced activity is sent first under the window lock and the threshold is checked
      again within one second (D5); otherwise the tab records T-001 (`threshold`) and reads the status inside its
      scope, without concealing. On resume past the local threshold the tab records T-001 (`resume`) and confirms
      the same way, inside the concealment's scope when it is also past its local deadline. - After every `Usable` answer to its own request whose revision is the held one and whose server time is in the
      warning period, an active tab opens the warning (T-002 `warning_shown`, cause `threshold` or `resume`, with the
      answer's server time and the held lead). A cross-tab message never opens it. An answer before the threshold
      checks again when the server's threshold arrives, at least 250 ms later. - No in-page activity is classified while the warning is open (D5). - Closing (D4): adopting a higher revision that takes the session out of its warning period clears the flag
      (T-002 to `content_shown`, cause `continue`, `peer`, or `renewal` by adoption source). Leaving the `active`
      view clears it. Concealment leaves it (D7); the deadline still conceals and confirms behind it. - Continue (D6): one activation records T-003 and sends `continue-session` inside its scope in the same task,
      with a 10-second limit, outside the activity window; activations while it is in flight send nothing. `Usable`
      adopts and broadcasts; `Ended` follows the existing ended path of an activity report; anything else leaves the
      warning open with `continuation: "failed"`.
- [ ] T010 [US1] In `fe/tests/unit/session-coordination.test.ts`, controller examples with fake timers and stubbed
      answers (modules.md contract evidence, rows 4–7): no read and no warning before the threshold, a read at it, and
      a warning only on an in-period answer; a later deadline in the answer prevents the warning and moves the
      threshold; no warning at lead 0; pending activity at the threshold is sent before any read; a key press in the
      content while the warning is open is not classified; a renewed message and another answer with a higher
      revision close it, an equal revision and a message for another tag do not; Continue `Usable` closes and
      broadcasts, `Ended` follows the ended path, and a failure leaves it open with `failed`; one activation sends one
      `continue-session` request at once with the activity window open, and a second activation while in flight sends
      nothing.

### Warning dialog (US1, US5 in part, FR-007, FR-014 in part, FR-015 in part, research D8, D9)

- [ ] T011 [US1] Create `fe/src/features/session-coordination/warning-modal.tsx`:
      `WarningModal({ continuation, onContinue })` renders the library `Modal` with title "Your session is about to
      expire", description "For your security, your session will end soon because of inactivity. Select Continue to
      keep working.", a no-op `onClose`, and library `Button` "Continue" in `footer` as `initialFocusRef`, focused
      through `moveFocus(…, "warning_continue")` (T-004); with `failed` it shows the alert "We could not continue your
      session. Try again." inside the dialog. The close control stays visible and does nothing until slice B.
- [ ] T012 [US1] In `fe/src/features/session-coordination/coordinator.tsx`, render `WarningModal` while
      `state.warning` is present in a running view and pass `continueSession`; `SessionCoordinator` keeps its props.

### Feature evidence and documentation

- [ ] T013 [US3] In `tests/bdd/steps/expired-recovery.ts`, add a step that sets the Springfield tenant's
      `warningLeadMinutes` in the scenario-owned tenant file, beside the timeout step.
- [ ] T014 [US1] Create `tests/bdd/requirements/expiration-warning.feature` (`@preets-session-011`) and
      `tests/bdd/steps/warning.ts` for quickstart §A cases 1–6: two sharing tabs, a Shelbyville tab, and a second
      browser open the warning within 2 s of their own thresholds with focus on Continue; Escape and an outside press
      leave it open and the deadline unchanged; a Continue answered 503 by request routing leaves both open with the
      failure alert; Enter on Continue renews and closes both within 2 s; a protected page in a new tab closes both
      (G2 recorded, not asserted as a pass); a second browser sharing the cookie at a stale threshold shows no dialog
      and adopts the later deadline. Reuse the multi-tab, sharing-browser, and timing helpers in
      `tests/bdd/steps/expiration.ts` by exporting them (planned for C; needed here because the warning steps act on
      those tabs).
- [ ] T015 [P] [US1] Document T-001 to T-004 in `docs/observability.md` (browser harness facts) and the warning,
      Continue, and T-005's `continue-session` in `docs/session-state.md`.
- [ ] T016 Run the A checks and module evidence (quickstart "Module evidence"), `pnpm test:bdd:dry`, and the §A BDD
      scenarios; commit; push the draft pull request; request verification of §A and review of the slice. Address the
      report and findings, then record the final report in [quickstart.md](quickstart.md#execution-results) with
      `pnpm verify:render --write` as an evidence-only commit and name the verified SHA in the pull request body.

## Slice B — Accessible blocking (`384-expiration-warning-continue-impl-b`)

Continue is the dialog's only control, the background is inert, focus stays inside, and focus returns afterwards,
using the library `Modal` with recorded workarounds. Asserts V-014 and V-015 in part (all but the screen-reader part,
L-3). No telemetry rows. `Contributes to #156`.

- [ ] T017 [US5] Create `fe/src/features/session-coordination/blocking.ts` with
      `blockBackground(surface: Element): () => void` (every other child of `document.body` gets `inert`; the undo
      restores each earlier value) and `restoreFocus(previous: Element | null, fallback: HTMLElement | null): void`
      (FR-016, FR-017, research D8 workarounds 3 and 5).
- [ ] T018 [US5] In `fe/tests/unit/session-coordination.test.ts`, DOM examples for `blockBackground` (including a child
      that was already inert) and `restoreFocus` (connected, removed, disabled, and none) (modules.md contract
      evidence, rows 8–9).
- [ ] T019 [US5] In `fe/src/features/session-coordination/warning-modal.tsx`, disable and remove from rendering and the
      accessibility tree every library-rendered control that is not Continue, by structure (workaround 2); block the
      background while open; keep focus from resting outside the dialog (workaround 4).
- [ ] T020 [US5] In `fe/src/features/session-coordination/coordinator.tsx`, record the focused element before the
      background becomes inert and restore focus when the warning closes while the tab stays active, falling back to
      the first `main` in the protected content or the content container.
- [ ] T021 [US5] Extend `tests/bdd/requirements/expiration-warning.feature` and `tests/bdd/steps/warning.ts` for
      quickstart §B cases 1–5 (accessibility tree, containment, inert background, Space, restoration); add an
      accessibility-tree helper to `tests/bdd/support/browser.ts` only if the existing one is not enough.
- [ ] T022 [P] [US5] Document the blocking behavior and its removal condition in `docs/session-state.md`, and extend
      #400 to name the warning (a person or the owning workflow updates the issue; this task records the request in
      the pull request body).
- [ ] T023 Run the B checks and module evidence, commit, push the draft, request verification of §B and review, and
      record the final report as in T016. The screen-reader parts stay an outstanding manual check (L-3).

## Slice C — Expiration still wins (`384-expiration-warning-continue-impl-c`)

Resumed tabs confirm first, a late Continue is refused into the expired outcome, and disabled warnings still expire.
Asserts V-011, V-012, V-013, V-016, and V-017 in full. No product change unless the evidence finds a defect.
`Contributes to #156`.

- [ ] T024 [P] [US7] In `fs/tests/lib/session.test.ts`, a Fast-Check property with `TestClock`: a `continue-session`
      refresh renews exactly when received before the deadline, never at or after it (research D15; V-011).
- [ ] T025 [P] [US7] In `fs/tests/unit/coordination.test.ts`, handler examples for a `continue-session` body exactly at
      and after the deadline answering 401 with no renewal (research D15; V-011).
- [ ] T026 [US6] Extend `tests/bdd/requirements/expiration-warning.feature` and `tests/bdd/steps/warning.ts` for
      quickstart §C cases 1–6 (three resume cases, late Continue held past the deadline, resume after the end, and
      disabled warnings), reusing the resume helpers exported from `tests/bdd/steps/expiration.ts`.
- [ ] T027 [P] [US7] Update `docs/session-state.md` only if the composed run changes what it states.
- [ ] T028 Run the C checks and module evidence, commit, push the draft, request verification of §C and review, and
      record the final report as in T016.

## Slice D — Tenant policy end to end and completion (`384-expiration-warning-continue-impl-d`)

Defaults, `0`, valid leads, rejection, and adoption on renewal hold end to end, and #156's completion evidence is met.
Asserts V-001 to V-005 in full, and V-014 and V-015 in part (L-3). `Closes #156` only when its completion evidence is
satisfied.

- [ ] T029 [US3] Create `tests/bdd/requirements/warning-policy.feature` and extend `tests/bdd/steps/warning.ts` for
      quickstart §D cases 1–4, including the `@long-idle` 30-minute scenario; add the invalid warning values to
      `tests/bdd/steps/tenant.ts`.
- [ ] T030 [P] Raise the nightly BDD job's timeout in `.github/workflows/ci-bdd.yml` for the added scenarios
      (research D13).
- [ ] T031 [P] [US3] Update `docs/multi-tenancy.md` only if the composed run changes its policy section.
- [ ] T032 Run the D checks and module evidence, commit, push the draft, request verification of §D plus the full
      [verification.md procedure](verification.md#procedure), and record the final report as in T016. The
      screen-reader steps stay an outstanding manual check for a person (L-3).

## Traceability

| Claim | Slice and tasks                     | Reused existing evidence                                     | Limitation            |
| ----- | ----------------------------------- | ------------------------------------------------------------ | --------------------- |
| V-001 | D: T029                             | `tenant-policy.test.ts`                                      | —                     |
| V-002 | D: T029                             | `tenant-policy.test.ts`                                      | —                     |
| V-003 | A: T004, T005, T013, T014 (part); D | —                                                            | —                     |
| V-004 | D: T029                             | `tenant-policy.test.ts`, `tenant.test.ts`, the rejection log | —                     |
| V-005 | D: T029                             | `session-policy-refresh.test.ts`                             | —                     |
| V-006 | A: T009, T010, T011, T014           | —                                                            | L-1                   |
| V-007 | A: T009, T010, T014                 | —                                                            | —                     |
| V-008 | A: T002, T003, T009, T010, T014     | —                                                            | —                     |
| V-009 | A: T009, T010, T014 (part)          | —                                                            | VL-2 (gap G2)         |
| V-010 | A: T009, T010, T011, T014           | —                                                            | —                     |
| V-011 | C: T024, T025, T026                 | `session-redis.test.ts` renewal and expiry race              | —                     |
| V-012 | C: T026                             | —                                                            | L-2                   |
| V-013 | C: T026                             | —                                                            | L-2, pre-script paint |
| V-014 | B: T019, T021 (part); D             | —                                                            | L-3                   |
| V-015 | B: T017–T021 (part); D              | —                                                            | L-3, L-4              |
| V-016 | C: T026                             | #157's expiration modal                                      | —                     |
| V-017 | C: T026                             | #157's expiration modal                                      | —                     |
| V-018 | A: T009, T014                       | tag-filter examples                                          | —                     |

| Contract or row                                            | Slice and tasks     |
| ---------------------------------------------------------- | ------------------- |
| Activity endpoint body (`continue-session`)                | A: T002, T003       |
| `warning-period.ts`                                        | A: T004, T005       |
| `TabCoordination` warning and `continueSession`            | A: T009, T010       |
| `sendActivity`                                             | A: T008             |
| `WarningModal`                                             | A: T011; B: T019    |
| `blockBackground`, `restoreFocus`                          | B: T017, T018       |
| T-001 `TabCoordination.threshold`                          | A: T006, T007, T009 |
| T-002 `TabCoordination.transition` (`warning_shown`)       | A: T006, T009       |
| T-003 `Interaction.continue`                               | A: T006, T007, T009 |
| T-004 `Focus.move` `warning_continue`                      | A: T006, T011       |
| T-005 `SessionService.refreshForTenant` `continue-session` | A: T002             |

Approved limitations that may remain: verification.md VL-1 to VL-6 as numbered by `pnpm verify:request`, and plan
limitations L-1 to L-4.
