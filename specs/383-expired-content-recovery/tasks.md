# Tasks: Protect Expired Content and Offer Explicit Accessible Recovery

**Input**: [plan.md](plan.md), [spec.md](spec.md), [verification.md](verification.md),
[contracts/modules.md](contracts/modules.md), [contracts/telemetry.md](contracts/telemetry.md),
[research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md)

**Organization**: Tasks are grouped by the implementation slices in [plan.md](plan.md#phase-7--implementation-slices),
in slice order. Each slice is one stacked pull request and is marked ready only after its verification report passes
the [verification gate](../../docs/engineering/verification-harness.md#gate-and-escalation). Paths are relative to the
repository root; `fs/` abbreviates `packages/frontend-services/` and `fe/` abbreviates `packages/frontend/`.
`[P]` marks a task that can run in parallel with the other `[P]` tasks of the same group.

Every slice ends with the [Before committing](../../AGENTS.md#before-committing) checks: `pnpm typecheck`,
`pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm check:unused`, `pnpm check:health`, and `pnpm check:changes`.
No check is suppressed.

## Slice A1 — Gate recovery for denied actions (`383-expired-content-recovery-impl`)

A denied Server Action is 401 with recovery meaning. The gate answers a no-script submission with the accessible
recovery document, and its cause comes from what the server observed. Lands T-001. Advances V-001 (gate), V-002
(HTTP and server), V-004 (no-script unknown; server-expired best effort), V-005 (HTTP part), V-006 (HTTP part), and
V-024 (response part). `Contributes to #157`.

### Baseline

- [x] T001 Confirm the installed facts the slice relies on: `NoUsableSession` has no cause today; the gate returns an
      empty 401 for every denied application request (research F1, F2); `forbiddenDocumentResponse` renders through
      `react-dom/server.edge` (research D1).

### Server-observed expiry (FR-004, research D2)

- [x] T002 In `fs/src/session.ts`, add `readonly expired?: true | undefined` to `NoUsableSession` and return a
      flagged value from `exposeOutcome` (store `Expired`) and `exposeIfStillUsable` (decoded record at or past its
      deadline). Missing, no-reference, malformed, and invalidated outcomes stay unflagged.
- [x] T003 In `fs/tests/lib/session.test.ts`, examples with `TestClock`: a record read after its deadline but before
      eviction is `{ _tag: "NoUsableSession", expired: true }`; a missing record and an absent reference carry no
      flag.

### Gate transport, cause, and T-001 (FR-001, FR-002, FR-006, research D1)

- [x] T004 In `fs/src/next/protection.ts`, export `SessionEndCause = "expired" | "unknown"` and add the required
      `ProtectionResponses.recoveryDocument({ cause })`. `classify` records the candidate transport: `fetch` with
      `next-action`, `document` for a candidate navigation without it, otherwise `none`. A denied `document`
      candidate gets the host document re-wrapped to 401 and `private, no-store`; every other denial keeps the empty
      401. Annotate `preets.protection.server_action` on every gated request and `preets.protection.denial_cause` on a
      denied candidate (contracts/telemetry.md T-001). Export `SessionEndCause` through `fs/src/next.ts` and
      `fs/src/index.ts`.
- [x] T005 In `fs/tests/unit/protection.test.ts`: the transport table (candidate × `next-action` × Fetch Metadata)
      decides between the recovery document and the empty 401; a host that returns another status and cache header
      is re-wrapped to 401 `private, no-store` with no cookie or `location`; `cause` is `expired` only when the read
      returned `expired: true`; a host rejection rejects rather than passing through.

### Host recovery document (FR-004, FR-006, FR-020, FR-025, research D11, D12)

- [x] T006 Create `fe/src/shared/session-recovery.ts` exporting `sessionEndCopy` and `SessionEndNotice`, and its
      private `fe/src/shared/session-recovery/session-end-notice.tsx` (server-renderable heading, explanation, and the
      library `Link` "Log in again" to `LOG_IN_HREF = "/"`; research D12 copy). Placement: the plan named
      `features/session-recovery`, but Fallow's Bulletproof preset rejects one feature importing another
      (`features/access-responses → features`), and the frontend guide reserves the `shared` zone for shared UI.
      The module has the planned public contract in `src/shared/`. `LOG_IN_HREF` stays private until a consumer
      outside the module needs it (A3 or B).
- [x] T007 In `fe/src/features/access-responses/presentation.tsx` add `recoveryDocumentResponse` (self-contained
      document like the 403 document: charset, viewport, title, one `h1`), export it from
      `fe/src/features/access-responses.ts`, and wire it in `fe/src/proxy.ts`.
- [x] T008 In `fe/tests/unit/proxy.test.ts`, render both causes: `text/html`, one `h1` with the cause's heading, the
      Log in link to `/`, title and metadata, and no tenant or session values.

### Feature evidence and documentation

- [x] T009 Create `tests/bdd/requirements/expired-content-recovery.feature` (`@partial @preets-session-007`) and
      `tests/bdd/steps/expired-recovery.ts`: a real session signed in through the tracked provider, its record removed
      by logging out in a second browser context holding a copy of the cookie, then the reference action posted as a
      fetch action (empty 401) and as a no-script navigation (401 recovery document, "no longer available"); and a
      5-minute tenant whose session's deadline passes before the navigation `POST` arrives (in-flight case). Each
      asserts no receipt, no login delegation, no application or correlation cookie, no protected content, and no
      session reference or tenant value in the response (quickstart §A1).
- [x] T010 Document the T-001 attributes in `docs/session-state.md` (verification signals).
- [ ] T011 Run the A1 checks, push, open the draft pull request, and request verification of quickstart §A1 and the
      module evidence. Record the final report in [quickstart.md](quickstart.md#execution-results) and the pull
      request body.

## Slice A2 — Progressively enhanced forms and the action-level 401 (`383-expired-content-recovery-impl-a2`)

Advances V-006 (full), V-004 (scripts-off removed record), and V-001 (action-level path).

- [x] T012 Feasibility gate (research D4), first: in a production build, record that the server-rendered reference
      form carries React's action fields and no `javascript:` action, that a no-script submission reaches the gate as
      a form-encoded navigation `POST`, and that a rejected fetch action reaches an error boundary without an
      unhandled rejection. If (a) or (b) fails, stop and correct the plan through the corrections path.
      Record (2026-11-13, production build of the A2 branch, scripts-disabled Chromium): (a) the reference form is
      `<form action="" enctype="multipart/form-data" method="POST">` with React's `$ACTION_REF_1`, `$ACTION_1:0`,
      `$ACTION_1:1`, and `$ACTION_KEY` fields and the tag field; no `javascript:` action. (b) Enter on the submit
      button sends a `multipart/form-data` navigation `POST` to `/`; the gate answers it (401 recovery document after
      a removed record; 200 with the result state and receipt with a usable session). (c) With scripts, the rejected
      fetch action produced React's caught-error console report and no `pageerror`. Gate passed.
- [x] T013 Replace `useSessionConfirmedActionState` with `ProtectedActionForm` in
      `fe/src/providers/session-confirmation.tsx` (`useActionState` with the Server Function, the tag field, a private
      error boundary settling as `notPerformed`, confirmation in an effect after each settled state).
- [x] T014 Move `fe/src/features/session-reference/reference-operation.tsx` and
      `fe/src/features/coordination-fixtures/roster.tsx` to `ProtectedActionForm`; remove the old hook.
      `CoordinationTagField` is now private: `ProtectedActionForm` renders it and no other consumer remains
      (check:unused).
- [x] T015 `admitSubmission` in `fe/src/app/(app)/session-request.ts` returns the `AuthorizedSessionAction` tag;
      `fe/src/app/(app)/actions.ts` and `fe/src/app/(app)/coordination/actions.ts` call `unauthorized()` on
      `NoUsableSession` and keep `Denied` on `SessionChanged`. Deviation: `admitSubmission` calls `unauthorized()`
      itself and still returns whether the action is authorized, so both actions keep their `Denied` branch unchanged.
      Calling it in each action duplicated the same nine lines (check:changes). Behavior matches research D5.
- [x] T016 `fe/tests/unit/reference-session-enforcement.test.ts`: `unauthorized()` on `NoUsableSession`, no receipt.
- [x] T017 Extend the feature and steps with a `javaScriptEnabled: false` context: keyboard submission after a removed
      record shows the recovery document with keyboard-operable Log in; a valid session submits successfully; scripts
      enabled still shows "The operation was not performed." then the signed-out notice (quickstart §A2). The
      scripts-enabled scenario delays the tab's `/session/activity` reports by 2 s. The keyboard submission is also
      activity, and its refused report can end the tab first (about 1 run in 5), so "not performed" never renders.
      That race predates A2: the removed hook had it too.
- [ ] T018 Checks, draft pull request, verification of §A2, results recorded.

## Slice A3 — In-tab recovery after a denied action (`383-expired-content-recovery-impl-a3`)

Advances V-003, V-004 (JS cases), V-005, V-007, V-008, V-002 (browser part), V-024 (page part), V-018 (recovery
side). Lands T-002, T-004 (`recovery_heading`), T-005 (`action_recovery`).

- [x] T019 `fe/src/providers/action-denial.ts` (new, not a client module): `ACTION_DENIAL_BODY` and
      `readActionDenial`; unit examples accepting only the two exact bodies. The bodies are `session-expired` and
      `session-unavailable`. `readActionDenial` decodes the message through a closed-set map, because the lint rule
      against branching on message text exists for human-readable text and Next gives the rejection no other field
      (research D3, L-4).
- [x] T020 `ProtectionResponses.actionDenial` in `fs/src/next/protection.ts` for `fetch` denials, re-wrapped to 401
      `private, no-store`; `actionDenialResponse` (`text/plain`, no charset) in `access-responses`; wired in
      `fe/src/proxy.ts`; transport-table and body examples (`fs/tests/unit/protection.test.ts`,
      `fe/tests/unit/proxy.test.ts`). Every request carrying `next-action` is a candidate, so a `GET` carrying it
      also receives the token. The integration suites' host stubs gained the required member.
- [x] T021 `readSessionStatus` returns the `Date` header on `Ended` (`session-endpoints.ts`); the D7 known-expiration
      predicate and `TabCoordination.deny` enter `recovery` with a cause, write no ended record, and post no message.
      The predicate is the private `session-coordination/known-expiration.ts`, so B's property test reaches it
      without a test-only export (check:unused). "Observed a logout" is an unresolved logout attempt of the tag, this
      tab's or another's; a received logout message or record has already ended the tab. Entering recovery stops the
      controller (listeners, channel, reads, timers), so nothing later changes the view. The submission is also
      activity, and its refused activity report usually arrived before the action's 401 (verifier run `b7c10e61`):
      for 5 seconds after a protected submission leaves the tab, an `Ended` activity answer waits for the action's
      outcome, and without one a confirmation ends the tab as before.
- [x] T022 `SessionConfirmationProvider` gains `deny`; the form boundary calls `deny(readActionDenial(error))`. `deny`
      reads the status itself, so the boundary no longer starts a separate confirmation.
- [x] T023 Coordinator `recovery` view renders `SessionEndNotice` (add `headingProps`, `headingRef`, `onLogIn`), moves
      focus to the heading (`recovery_heading`), and records `Interaction.login` (`action_recovery`). The status
      region announces nothing in recovery; the focus move announces the heading.
- [x] T024 Browser facts in `fe/src/shared/browser-tracing.ts` and `export-filter.ts` (T-002, T-004, T-005);
      `docs/observability.md`; current behavior in `docs/session-state.md`. The SDK flushes its batch on `pagehide`; the
      `Interaction.login` record is made just before the navigation and was otherwise lost (verifier run `ed737dfe`).
      Deviation: the T-002 transition is recorded after the status read resolves, so it is a root span correlated by
      order (submit, gate denial, transition, `Focus.move`), not a child of the `sessionStatus` read as the telemetry
      contract's correlation column says. The activity-in-flight `pending` message can precede the transition; it
      changes no other tab.
- [x] T025 `fe/tests/unit/session-coordination.test.ts` controller examples (no record, no message, cause by D7).
- [x] T026 BDD: known expiration with suspended timers, unknown cause, sharing tab untouched (quickstart §A3). The
      A1 fetch-action scenario now expects the `session-unavailable` token, and A2's scripts-enabled scenario became
      the unknown-cause recovery scenario with a second tab. A logout observed in a second tab shows the signed-out
      notice (case 3). The scenarios no longer delay activity reports. The page-text check excludes inline scripts: Next's serialized render data stays in the
      document but is never displayed, focusable, or exposed to assistive technology.
- [ ] T027 Checks, draft pull request, verification of §A3, results recorded.

## Slice B — Expiration modal across tabs (`383-expired-content-recovery-impl-b`)

Advances V-009–V-018, V-023, V-024 (modal part). Lands T-003, T-004 (`expiration_log_in`), T-005
(`expiration_modal`).

- [ ] T028 Deadline concealment (cause `deadline`), `Ended` with D7 enters `expired`, resume path (cause `resume`),
      and `pagehide` hides the modal in `tab-coordination.ts` and `coordinator.tsx`.
- [ ] T029 Ended record `cause` in `tab-channel.ts`; a missing cause reads as `ended`; peers adopt `expired` unless a
      logout was observed (FR-019).
- [ ] T030 `expiration-modal.tsx` (new): library `Modal`, no-op `onClose`, `initialFocusRef` on Log in (L-1, #400).
- [ ] T031 Browser facts (T-003, `expiration_log_in`, `expiration_modal`) and export-filter allow-lists.
- [ ] T032 Controller examples and the Fast-Check D7 property in `session-coordination.test.ts`.
- [ ] T033 BDD `expiration-protection.feature` with `steps/expiration.ts`, the 5-minute tenant step in
      `steps/tenant.ts`, and lifecycle and clock helpers in `support/browser.ts` (quickstart §B).
- [ ] T034 `docs/observability.md`, `docs/session-state.md` (the expired view replaces the stand-in).
- [ ] T035 Checks, draft pull request, verification of §B, results recorded.

## Slice C — Fresh Log in from both entry points (`383-expired-content-recovery-impl-c`)

Advances V-019–V-022 in full and runs the full verification.md procedure. The only slice that says `Closes #157`.

- [ ] T036 `tests/bdd/requirements/expired-recovery-login.feature` and Log in journeys in
      `tests/bdd/steps/expired-recovery.ts` reusing `fresh-recovery.ts` steps (quickstart §C).
- [ ] T037 Full verification.md procedure at the C revision; results in quickstart.md; `docs/session-state.md` note
      if the composed run changes it.
- [ ] T038 Checks, draft pull request, verification of §C plus the full procedure, results recorded.

## Dependencies

A1 → A2 → A3 → B → C, each stacked on the one below. Within A1, T002 precedes T004 (the gate reads the flag), and
T004 precedes T007 (the host implements the new member). T009 needs T004–T007.
