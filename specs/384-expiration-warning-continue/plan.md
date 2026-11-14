# Implementation Plan: Warn Before Expiration and Continue Accessibly Across Tabs

**Branch**: `384-expiration-warning-continue-plan` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature contract in `specs/384-expiration-warning-continue/spec.md` and
`specs/384-expiration-warning-continue/verification.md` (claims V-001 to V-018); delivery issue
[#156](https://github.com/PathableAI-org/Pre-ETS/issues/156), delivery-plan slice S4 under the B5 decision in
[docs/delivery/session-management.md](../../docs/delivery/session-management.md). Facts and decisions are in
[research.md](research.md).

**Risk tier**: High. Triggers 1 and 3, as the specification records, and trigger 4: the telemetry contract adds two
exported browser facts, new closed-set values, and one exported attribute key.

## Summary

The server side of the warning already exists: #153 derives and validates the tenant's warning lead and adopts it at
every renewal, and the lead reaches every tab with the deadline. This plan adds the browser consequences and the one
transport Continue needs.

- **Warning.** With a positive lead, a tab confirms with the server when it reaches its local threshold, and on
  resume past it. It opens the warning only when its own answer says the session is in its warning period, so a
  renewal made elsewhere prevents it. Every sharing tab does this for itself.
- **Continue.** Continue sends `continue-session` to the existing `POST /session/activity` at once. A renewal closes
  the warning in that tab and, through the existing `renewed` broadcast, in every sharing tab. A failure closes
  nothing. A Continue that reaches the server at or after the deadline is refused, and the tabs show #157's expired
  outcome.
- **Blocking.** The warning is the library `Modal`. The library cannot make a modal non-dismissible or its
  background inert, so the feature supplies both, removes the library's close control from the dialog, keeps focus
  inside, and restores focus afterwards. The workarounds are recorded with their issue and removal condition
  ([#400](https://github.com/PathableAI-org/Pre-ETS/issues/400), research D8).
- **Expiration is untouched.** The deadline still conceals and confirms, with or without a warning.

No package, Effect service, Layer, configuration setting, dependency, route, stored field, or cross-tab message is
added.

## Technical Context

**Language/Version**: TypeScript 6.0.3 on Node.js 26+

**Primary Dependencies**: Next.js 16.4.5 (App Router), React 19.3.1, `@pathableai/react` 0.3.0 (`Modal`, `Button`,
`Alert`), Effect 4.1.4 in `frontend-services` (one schema literal added; services unchanged), the OpenTelemetry
browser facade (existing)

**Storage**: Existing Redis session records (unchanged). No new browser storage.

**Testing**: Vitest (frontend-services `lib` and `unit`, frontend `unit` with jsdom), Fast-Check for the
warning-period and deadline properties, Cucumber requirements BDD with Playwright Chromium against the tracked
Keycloak realm, the agent-executable manual procedure with Grafana MCP, and a person's screen-reader check

**Target Platform**: Self-hosted `next start` on Node.js; local Redis, Keycloak, and otel-lgtm for composed evidence

**Project Type**: Existing pnpm monorepo web application. Changes are confined to `packages/frontend-services` (the
activity endpoint's body schema), `packages/frontend` (the session coordinator and browser facts), root
`tests/bdd`, the nightly BDD workflow's timeout, and `docs/`.

**Performance Goals**: B5 bounds: the warning opens in every running sharing tab within 2 s of the threshold, and
closes in other tabs within 2 s of a renewal response. One status read per tab at each threshold.

**Constraints**: No warning without server confirmation (FR-006); nothing but a renewal or the session's end closes
it (FR-009); inert background (FR-016); no renewal at or after the deadline (FR-012); no forbidden telemetry; no
telemetry assertions in tests; no check suppressions

**Scale/Scope**: 4 implementation slices, each about 15 hand-written files or fewer (Phase 7)

## Constitution Check

_GATE: Passed before Phase 0 research and re-checked after Phase 1 design. One documented workaround (Principle IV)
is recorded below. No violation requires Complexity Tracking._

| Principle                                  | Pre-design gate                                                                                                                          | Post-design result                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Evidence-grounded specification         | `spec.md`, `verification.md`, #156, S4, B5, and PREETS-SESSION-011 read as authorities at the approved specification                     | Pass. No acceptance criterion, observation, or channel changes. One evidence substitution (real elapsed time, research D13) and limitations L-1 to L-4 are named for the reviewer.                                                                                                                                                                                                                                                                    |
| II. Explicit ownership, authoritative data | Renewal and policy stay in frontend-services; presentation in the Next host                                                              | Pass. The server stays authoritative: a tab never warns on its local clock alone and never renews by itself. frontend-services renders no UI.                                                                                                                                                                                                                                                                                                         |
| III. Tenant and security isolation         | Session, tenant, and browser-context isolation preserved                                                                                 | Pass. Continue carries the tab's coordination tag, so a stale tab cannot renew a later session. No session value in copy or telemetry. A late Continue is refused by the existing atomic transition.                                                                                                                                                                                                                                                  |
| IV. Accessible, server-rendered UI         | `@pathableai/react` guidance read. Client state limited to interactions that need it                                                     | Pass with a documented workaround. The library `Modal` has no non-dismissible mode and no inert background. Issue [styles#264](https://github.com/PathableAI-org/styles/issues/264), adoption tracked in [#400](https://github.com/PathableAI-org/Pre-ETS/issues/400), removal condition in research D8. The client state added lives in the coordinator, which is already a client component because it needs timers, focus, and cross-tab messages. |
| V. Meaningful behavioral tests             | Tests trace to FR and claim IDs                                                                                                          | Pass. Properties protect the warning period and the deadline boundary. Controller examples protect opening, closing, and Continue. BDD covers the composed journeys. Telemetry is observed, not asserted.                                                                                                                                                                                                                                             |
| VI. Simplicity and verifiable quality      | Smallest change composing delivered capabilities                                                                                         | Pass. One accepted literal, one flag beside the view, three private children, and closed-set fact additions. No new tool or dependency.                                                                                                                                                                                                                                                                                                               |
| Architecture constraints and workflow      | Plan PR stacked on the spec PR #399; slices follow [Implementation slices](../../docs/engineering/git-workflow.md#implementation-slices) | Pass. Four slices of one decision each, every slice vertical.                                                                                                                                                                                                                                                                                                                                                                                         |

## Project Structure

### Documentation (this feature)

```text
specs/384-expiration-warning-continue/
├── spec.md              # Approved in the specification PR (#399)
├── verification.md      # Approved in the specification PR (#399)
├── checklists/requirements.md
├── plan.md              # This file
├── research.md          # Current facts F1–F12, decisions D1–D15, limitations L-1–L-4
├── quickstart.md        # Per-slice execution guide and results
├── contracts/
│   ├── modules.md       # Public module contracts and evidence
│   └── telemetry.md     # T-001–T-005
└── tasks.md             # Created on the first implementation branch
```

No `data-model.md`: the feature stores nothing new, and its only new state is the warning flag described in
[contracts/modules.md](contracts/modules.md).

### Source Code (repository root)

```text
packages/frontend-services/
├── src/next/coordination.ts            # activity body accepts continue-session (A)
├── tests/unit/coordination.test.ts     # endpoint examples (A); at and after the deadline (C)
└── tests/lib/session.test.ts           # deadline property (C)

packages/frontend/src/
├── features/session-coordination/warning-period.ts    # NEW pure threshold and period (A)
├── features/session-coordination/tab-coordination.ts  # threshold, confirmation, warning flag, Continue (A)
├── features/session-coordination/session-endpoints.ts # sendActivity accepts continue-session (A)
├── features/session-coordination/warning-modal.tsx    # NEW dialog (A); one control, containment (B)
├── features/session-coordination/blocking.ts          # NEW inert background, focus restoration (B)
├── features/session-coordination/coordinator.tsx      # renders the warning (A); restoration (B)
└── shared/browser-tracing.ts, browser-tracing/export-filter.ts   # T-001–T-004 (A)

packages/frontend/tests/unit/session-coordination.test.ts   # properties and controller examples (A, B)

tests/bdd/
├── requirements/expiration-warning.feature   # NEW (A; extended B, C)
├── requirements/warning-policy.feature       # NEW (D)
├── steps/warning.ts                          # NEW (A; extended later)
└── steps/expired-recovery.ts, steps/expiration.ts, support/browser.ts   # tenant lead step, shared helpers

.github/workflows/ci-bdd.yml                  # nightly timeout (D)
docs/observability.md, docs/session-state.md  # facts and behavior (A, B)
```

**Structure Decision**: Extend the existing workspaces in place. No new public module. The warning's three new files
are private children of `features/session-coordination`, justified in
[contracts/modules.md](contracts/modules.md#module-architecture-decisions).

## Complexity Tracking

No constitution violation requires justification. The Principle IV workaround is documented with its issue and
removal condition in research D8.

## Phased Engineering Design

### Phase 1 — Module architecture

Every affected concern and its decision is in the
[module architecture table](contracts/modules.md#module-architecture-decisions). In summary:

- **Preserved.** Tenant policy derivation and rejection, and the session service's renewal, late refusal, and
  policy adoption. They already satisfy FR-001, FR-002, FR-004, and FR-012; this feature adds evidence for them.
- **Extended.** The activity endpoint's body accepts `continue-session`. Browser facts get closed-set additions and
  two recorders. The session coordinator gains the warning behind its unchanged public entry.
- **Decomposed privately.** The coordinator gets a pure `warning-period.ts`, a `warning-modal.tsx`, and a
  `blocking.ts` for the inert background and focus restoration.

Rejected: a separate warning feature, a new Continue route, a cross-tab "warning opened" message, a local dialog,
and a test clock ([rejected abstractions](contracts/modules.md#rejected-abstractions-and-alternatives)).

### Phase 2 — Public module contracts

[contracts/modules.md](contracts/modules.md) states every signature. The compatibility-sensitive decisions are:

- `SessionActivityRequestBody.activity` widens to `"continue-session" | InPageSessionActivity`. Existing bodies stay
  valid, and `InPageSessionActivity` keeps its five members, so coalesced activity can never carry Continue.
- `SessionCoordinator` keeps its props. The warning is internal state.
- `TransitionCause`, `UiState`, and `FocusTarget` gain values, `TransitionTiming` gains an optional member, and two
  recorders are added. Existing callers are unchanged.

### Phase 3 — Module contract evidence

The [contract evidence table](contracts/modules.md#contract-evidence) maps each consumer claim to its violation and
its evidence:

- Fast-Check properties: the warning period over deadline, lead, and server time (A), and a `continue-session`
  refresh that renews exactly when received before the deadline (C).
- Durable examples: the endpoint's check table extended to `continue-session`, handler answers at and after the
  deadline, controller examples for confirm-before-open, pending activity, the three Continue answers, the three
  adoption sources, and one request per activation, and jsdom examples for the inert background and focus
  restoration.
- Existing evidence cited: tenant policy derivation and rejection, policy adoption on refresh, and the real-Redis
  renewal and expiry race.
- Feature evidence instead of module tests: the dialog's one control and its dismissal attempts, because a jsdom
  test of library markup would test the library.

Telemetry is never asserted in these tests.

### Phase 4 — Implementation architecture

Detailed decisions with rationale are in [research.md](research.md). The sequencing they imply:

1. **Endpoint (D1).** Add the literal to the handler's body schema. The handler, the gate, and the service are
   otherwise unchanged, and both keep their `Effect.fn` spans and the host-owned runtime. No new Effect service is
   warranted, because the change adds no workflow.
2. **Warning period (D2).** `warning-period.ts` holds the two pure functions and their property.
3. **Opening (D3, D5).** `TabCoordination` schedules a `warning` timer when it applies a deadline with a positive
   lead. The timer sends pending activity first, or records T-001 and reads the status inside that fact's scope.
   After every `Usable` answer the tab evaluates the warning period and opens the warning when it holds. Resume
   records T-001 with cause `resume` when the tab is past its local threshold, then uses the same confirmation.
4. **Closing (D4, D7).** Adoption of a higher revision re-evaluates the period and clears the flag, recording the
   close with its cause. Terminal views clear it. Concealment leaves it.
5. **Continue (D6).** `continueSession` records T-003 and sends `continue-session` inside its scope with a
   10-second limit, then applies the answer. `WarningModal` renders the library `Modal` with the copy of D9, the
   failure alert, and Continue, and moves focus to Continue through `moveFocus` (T-004).
6. **Blocking (D8).** Slice B adds the neutralized close control, `blockBackground`, focus containment, and
   `restoreFocus`, and extends #400 to name the warning.
7. **Evidence (D13–D15).** BDD steps reuse #157's multi-tab, shared-cookie, and clock helpers and add a step that
   sets a tenant's warning lead.

### Phase 5 — Feature verification integration

[quickstart.md](quickstart.md) turns [verification.md](verification.md) into per-slice sections (§A, §B, §C, §D).
Each gives the BDD scenarios, the manual and telemetry steps, cleanup, and the claim map. Module evidence is cited,
not repeated. The full verification.md procedure (steps 1 to 13) runs once at the D revision.

Thresholds are observed in real elapsed time with the shortest policies, and the default 30-minute policy once in a
31-minute scenario (research D13). This substitutes for the controllable browser time `verification.md` planned,
which cannot open a warning because each tab confirms with a server whose clock the browser does not control. The
observations and channels are unchanged.

Approved limitations from verification.md apply unchanged: #157 composition for V-016 and V-017 (now on `main`),
gap G2 for page-load renewals, server-unreachable behavior, pre-script paint, and the screen reader actually used.
Plan limitations L-1 to L-4 are in [research.md](research.md#plan-limitations-beyond-verificationmd).

### Phase 6 — Verification telemetry contract

[contracts/telemetry.md](contracts/telemetry.md) covers every claim whose channel includes telemetry (V-004 to
V-009, V-011 to V-013, V-016, V-018):

- **T-001**: a new `TabCoordination.threshold` fact, the parent of the confirmation a tab starts at its threshold or
  on resume past it.
- **T-002**: `TabCoordination.transition` with the `warning_shown` state, opening and closing causes, timing, and
  the held lead.
- **T-003**: a new `Interaction.continue` fact, the parent of the Continue request.
- **T-004**: the `Focus.move` target `warning_continue`.
- **T-005**: the existing `SessionService.refreshForTenant` span, whose `preets.session.activity` gains the
  HTTP-reachable value `continue-session`.

V-004 and V-016 use existing signals only. Never emitted: the warning's text and accessible names, screen-reader
output, which element regained focus, the rejected setting's value, session references, tags, identity, and tab
identifiers. Each is verified through browser interaction, assistive technology, `session.id`, or step order
instead. No metrics.

### Phase 7 — Implementation slices

| Slice | Branch                                   | Decision a reviewer accepts                                                                                                                                                                 | Contracts and modules                                                                                                                                                 | Telemetry rows | Full claims                       | Partial claims                                                                           | Quickstart sections                                            | Est. hand-written files |
| ----- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------- |
| **A** | `384-expiration-warning-continue-impl`   | Every sharing tab shows the warning only after the server confirms the threshold, and Continue renews at once as `continue-session`; only a renewal or the session's end closes it          | Activity endpoint body; `warning-period.ts`; `TabCoordination` warning and `continueSession`; `session-endpoints.ts`; `warning-modal.tsx`; coordinator; browser facts | T-001–T-005    | V-006, V-007, V-008, V-010, V-018 | V-003 (lead of timeout minus 1 only); V-009 (page-load renewals fall under gap G2, VL-2) | Prerequisites; Module evidence; §A; Telemetry queries; Cleanup | ~15                     |
| **B** | `384-expiration-warning-continue-impl-b` | The warning blocks accessibly: Continue is its only control, the background is inert, focus stays inside, and focus returns afterwards, using the library `Modal` with recorded workarounds | `warning-modal.tsx` (one control, containment); `blocking.ts`; coordinator restoration                                                                                | —              | —                                 | V-014 (all but the screen-reader part, L-3); V-015 (all but the screen-reader part, L-3) | Prerequisites; Module evidence; §B; Cleanup                    | ~8                      |
| **C** | `384-expiration-warning-continue-impl-c` | The warning never weakens expiration: resumed tabs confirm first, a late Continue is refused into the expired outcome, and disabled warnings still expire                                   | None new in product code unless the evidence finds a defect; deadline property and handler examples                                                                   | —              | V-011, V-012, V-013, V-016, V-017 | —                                                                                        | Prerequisites; Module evidence; §C; Telemetry queries; Cleanup | ~6                      |
| **D** | `384-expiration-warning-continue-impl-d` | Tenant warning policy holds end to end (defaults, `0`, valid leads, rejection, adoption on renewal), and #156's completion evidence is met                                                  | None (evidence only); nightly BDD timeout                                                                                                                             | —              | V-001, V-002, V-003, V-004, V-005 | V-014 (all but the screen-reader part, L-3); V-015 (all but the screen-reader part, L-3) | Prerequisites; Module evidence; §D; Telemetry queries; Cleanup | ~6                      |

**Planned files per slice** (hand-written; there are no lockfile or generated changes):

- **A (15):** `frontend-services/src/next/coordination.ts`, `tests/unit/coordination.test.ts`;
  `frontend/src/features/session-coordination/warning-period.ts`, `tab-coordination.ts`, `session-endpoints.ts`,
  `warning-modal.tsx`, `coordinator.tsx`, `src/shared/browser-tracing.ts`,
  `src/shared/browser-tracing/export-filter.ts`, `tests/unit/session-coordination.test.ts`;
  `tests/bdd/requirements/expiration-warning.feature`, `tests/bdd/steps/warning.ts`,
  `tests/bdd/steps/expired-recovery.ts` (tenant warning-lead step); `docs/observability.md` (browser facts),
  `docs/session-state.md` (warning and Continue).
- **B (8):** `frontend/src/features/session-coordination/warning-modal.tsx`, `blocking.ts`, `coordinator.tsx`,
  `tests/unit/session-coordination.test.ts`; `tests/bdd/requirements/expiration-warning.feature`,
  `tests/bdd/steps/warning.ts`; `docs/session-state.md`; `tests/bdd/support/browser.ts` (accessibility-tree helper,
  if #157's is not enough).
- **C (6):** `frontend-services/tests/lib/session.test.ts`, `tests/unit/coordination.test.ts`;
  `tests/bdd/requirements/expiration-warning.feature`, `tests/bdd/steps/warning.ts`, `tests/bdd/steps/expiration.ts`
  (shared resume helpers exported for reuse); `docs/session-state.md` if the composed run changes what that guide
  states.
- **D (6):** `tests/bdd/requirements/warning-policy.feature`, `tests/bdd/steps/warning.ts`,
  `tests/bdd/steps/tenant.ts` (invalid warning values), `.github/workflows/ci-bdd.yml` (nightly timeout),
  `quickstart.md` execution results, and `docs/multi-tenancy.md` if the composed run changes what its policy
  section states.

**Order and vertical checks.** Each slice is stacked on the one below it and passes typecheck, lint,
`check:unused`, and `check:health` on its own:

- A lands the endpoint literal with its only consumer, the tab's Continue, and each new browser fact with the
  behavior it observes. After A the warning works across tabs but is not yet fully blocking: the library's close
  control is visible and does nothing, and the background is not inert. A's pull request says so, and A asserts
  neither V-014 nor V-015.
- B completes the blocking behavior. Splitting it from A keeps each near the size limit and gives the library
  workaround its own review.
- C and D add evidence. C comes first because D's full procedure composes its cases. A defect either finds in A's
  or B's code is fixed in the slice that finds it, or through the corrections path when it changes a contract.
- D is the only slice whose pull request says `Closes #156`. A to C say `Contributes to #156`. The screen-reader
  parts of V-014 and V-015 stay an outstanding manual check for a person on B and D (L-3).

**Verification per slice.** The implementation session asks the verifier to run the matching quickstart section:
A → §A; B → §B; C → §C; D → §D plus the full procedure. Module evidence runs for every slice. Each slice is marked
ready only when the latest report passes the
[verification gate](../../docs/engineering/verification-harness.md#gate-and-escalation) for its telemetry rows and
claims. Limitations already approved in verification.md or listed in research as L-1 to L-4 may remain.

## Gaps and follow-ups

- [#400](https://github.com/PathableAI-org/Pre-ETS/issues/400): adopt a non-dismissible library `Modal` with an
  inert background once [styles#264](https://github.com/PathableAI-org/styles/issues/264) ships, remove the
  warning's workarounds, and re-run V-010, V-014, and V-015. Slice B adds the warning to that issue.
- Nightly BDD grows by about 65 minutes, 31 of them the `@long-idle` scenario. A harness clock that shifts the
  server process with each page would remove most of it, and needs a feasibility check and a person's decision
  first (research D13).
- Behavior when the server stays unreachable at a threshold or during Continue waits for the pending
  connection-loss requirement.
