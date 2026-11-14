# Implementation Plan: Protect Expired Content and Offer Explicit Accessible Recovery

**Branch**: `383-expired-content-recovery-plan` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature contract in `specs/383-expired-content-recovery/spec.md` and
`specs/383-expired-content-recovery/verification.md` (claims V-001–V-024); delivery issue
[#157](https://github.com/PathableAI-org/Pre-ETS/issues/157), delivery-plan slice S5 (S5-A, S5-B) with the S6-C
composition, under the B5 and B6 decisions in [docs/delivery/session-management.md](../../docs/delivery/session-management.md).
Maintainer planning decisions of 2026-11-13 are recorded in [research.md](research.md) (D3, D6, D8, D14).

## Summary

Compose the delivered gate, session classification, tab coordinator, and fresh login into explicit recovery.

- **S5-A.** The protection gate already denies a Server Action without a usable session with an empty 401. It now
  answers a denied no-script submission with a host-rendered 401 recovery document, and a denied fetch action with a
  401 `text/plain` cause token. The session read reports when it observed an expired record. Protected action forms
  become progressively enhanced, and an action-level `no_session` becomes `unauthorized()`. In a running tab, a
  denied action replaces the tab's content with accessible recovery content, without changing other tabs. The content
  says "expired" when the gate saw expiry, or when the tab's held deadline has passed on the server clock and the tab
  saw no logout. Otherwise it says the session is no longer available.
- **S5-B.** Confirmed expiry becomes a distinct coordinator view. The tab conceals at its local deadline, confirms,
  and then shows the expiration modal with protected content and the header unmounted. The ended record carries a
  cause, so the expired state propagates to every sharing tab while logout keeps the signed-out notice. Resume, refresh,
  and back/forward reuse S3, #154, and #158. The modal is the library `Modal` with a no-op `onClose`. Its inert close
  button is tracked by [#400](https://github.com/PathableAI-org/Pre-ETS/issues/400) and
  [styles#264](https://github.com/PathableAI-org/styles/issues/264).
- **S6-C.** Every Log in is a link to `/`, the same fresh-entry boundary the signed-out notice uses. A last
  evidence slice proves fresh login, failures, and no revival from both entry points with the real provider. That
  slice is the one that closes #157, and it also supplies #158's S3 evidence.

No package, Effect service, Layer, dependency, configuration, stored server field, or public route is added.

## Technical Context

**Language/Version**: TypeScript 6.0.3 on Node.js 26+

**Primary Dependencies**: Next.js 16.4.5 (App Router, proxy, `experimental.authInterrupts` already on), React 19.3.1
(`useActionState` with permalink), `@pathableai/react` 0.3.0 (`Modal`, `Alert`, `Link`, `Heading`), Effect 4.1.2 in
`frontend-services` (unchanged services), OpenTelemetry browser facade (existing)

**Storage**: Existing Redis session records (unchanged). Browser `localStorage` ended record gains a `cause` field.

**Testing**: Vitest (frontend-services `lib`/`unit`, frontend `unit` with jsdom), Fast-Check for the
known-expiration predicate, Cucumber requirements BDD with Playwright Chromium against the tracked Keycloak realm,
the agent-executable manual procedure with a screen reader and Grafana MCP

**Target Platform**: Self-hosted `next start` on Node.js; local Redis, Keycloak, and otel-lgtm for composed evidence

**Project Type**: Existing pnpm monorepo web application. Changes are confined to `packages/frontend-services`
(gate and session flag), `packages/frontend` (host responses, recovery feature, provider, coordinator, browser
facts), root `tests/bdd`, and `docs/`.

**Performance Goals**: B5 bound: concealment and modal within 2 s of the authoritative deadline in running tabs.
No new server round trips except one status read after a denied action (already performed today).

**Constraints**: 401 for every denied action and no automatic OIDC (FR-001, FR-002); no change to other tabs on a
denial (FR-008); no expired state while valid (FR-010); logout precedence (FR-019); no forbidden telemetry; no
telemetry assertions in tests; no check suppressions

**Scale/Scope**: 5 implementation slices, each about 15 hand-written files or fewer (Phase 7)

## Constitution Check

_GATE: Passed before Phase 0 research and re-checked after Phase 1 design. One documented workaround (Principle IV)
is recorded below. No violation requires Complexity Tracking._

| Principle                                  | Pre-design gate                                                                                                                          | Post-design result                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Evidence-grounded specification         | `spec.md`, `verification.md`, #157, S5/S6, B5, B6, and SESSION-004/007/012/013 at `8ab3e692` read as authorities                         | Pass. No acceptance criterion or verification obligation changes. Plan limitations L-1–L-4 (research) narrow nothing the spec requires. L-3 is a sub-millisecond race in which no operation runs.                                                                                                                                                                                                                                                                                |
| II. Explicit ownership, authoritative data | Gate in frontend-services; presentation in the Next host                                                                                 | Pass. frontend-services renders no React. The host supplies the documents through `ProtectionResponses`, as the 403 document already does. The server stays authoritative; tabs never expire on a local deadline alone.                                                                                                                                                                                                                                                          |
| III. Tenant and security isolation         | Session, tenant, and context isolation preserved                                                                                         | Pass. Propagation stays per coordination tag in one browser context (V-023). No session values in copy, documents, tokens, or telemetry (FR-025).                                                                                                                                                                                                                                                                                                                                |
| IV. Accessible, server-rendered UI         | `@pathableai/react` guidance read. Client state limited to interactions that need it                                                     | Pass with a documented workaround. The library `Modal` lacks a non-dismissible mode. Issue filed ([styles#264](https://github.com/PathableAI-org/styles/issues/264)), adoption tracked in [#400](https://github.com/PathableAI-org/Pre-ETS/issues/400), removal condition in research D8. The recovery document is server-rendered. Client code is limited to the coordinator, which already is a client component, and the form boundary that progressive enhancement requires. |
| V. Meaningful behavioral tests             | Tests trace to FR and claim IDs                                                                                                          | Pass. Module examples protect the transport table, the flag, the D7 predicate, and the terminal views. BDD covers the composed journeys. Telemetry is observed, not asserted.                                                                                                                                                                                                                                                                                                    |
| VI. Simplicity and verifiable quality      | Smallest change composing delivered capabilities                                                                                         | Pass. One optional field, two host-response members, one new feature module, one replaced provider hook, and private coordinator views. No new tool or dependency.                                                                                                                                                                                                                                                                                                               |
| Architecture constraints and workflow      | Plan PR stacked on the spec PR #398; slices follow [Implementation slices](../../docs/engineering/git-workflow.md#implementation-slices) | Pass. Five slices of one decision each, every slice vertical.                                                                                                                                                                                                                                                                                                                                                                                                                    |

## Project Structure

### Documentation (this feature)

```text
specs/383-expired-content-recovery/
├── spec.md              # Approved in the specification PR (#398)
├── verification.md      # Approved in the specification PR (#398)
├── checklists/requirements.md
├── plan.md              # This file
├── research.md          # Current facts and decisions D1–D15, limitations L-1–L-4
├── data-model.md        # Session end cause, tab views, ended record
├── quickstart.md        # Per-slice execution guide and results
├── contracts/
│   ├── modules.md       # Public module contracts and evidence
│   └── telemetry.md     # T-001–T-005
└── tasks.md             # Created on the first implementation branch
```

### Source Code (repository root)

```text
packages/frontend-services/src/
├── session.ts                          # NoUsableSession.expired (A1)
├── next.ts, index.ts                   # export SessionEndCause (A1)
└── next/protection.ts                  # recoveryDocument (A1), actionDenial (A3), T-001 (A1)

packages/frontend/src/
├── proxy.ts                            # wires the new ProtectionResponses members (A1, A3)
├── app/(app)/actions.ts, session-request.ts, coordination/actions.ts   # unauthorized() on NoUsableSession (A2)
├── features/session-recovery.ts        # NEW public entry (A1)
├── features/session-recovery/session-end-notice.tsx   # NEW (A1)
├── features/access-responses.ts, access-responses/presentation.tsx   # recovery document (A1), denial body (A3)
├── features/session-reference/reference-operation.tsx # ProtectedActionForm (A2)
├── features/coordination-fixtures/roster.tsx          # ProtectedActionForm (A2)
├── features/session-coordination/coordinator.tsx      # recovery view (A3), expired view (B)
├── features/session-coordination/tab-coordination.ts  # deny, D7 predicate (A3); expiry, deadline concealment (B)
├── features/session-coordination/session-endpoints.ts # Date header on Ended (A3)
├── features/session-coordination/tab-channel.ts       # ended record cause (B)
├── features/session-coordination/expiration-modal.tsx # NEW (B)
├── providers/session-confirmation.tsx  # ProtectedActionForm (A2), deny (A3)
├── providers/action-denial.ts          # NEW (A3)
└── shared/browser-tracing.ts, browser-tracing/export-filter.ts   # T-002, T-004, T-005 (A3); T-003 (B)

tests/bdd/
├── requirements/expired-content-recovery.feature      # NEW (A1; extended A2, A3)
├── requirements/expiration-protection.feature         # NEW (B)
├── requirements/expired-recovery-login.feature        # NEW (C)
└── steps/expired-recovery.ts, steps/expiration.ts      # NEW (A1, B; extended later)
```

**Structure Decision**: Extend the existing workspaces in place. The new `features/session-recovery` module is the
only new public module. It is justified by three consumers that must share meaning (FR-020). See
[contracts/modules.md](contracts/modules.md#module-architecture-decisions).

## Complexity Tracking

No constitution violation requires justification. The Principle IV workaround (library `Modal` with a no-op
`onClose`) is documented with its issue and removal condition in research D8.

## Phased Engineering Design

### Phase 1 — Module architecture

Every affected concern and its decision is in the [module architecture table](contracts/modules.md#module-architecture-decisions).
In summary:

- **Preserved.** The gate stays the only place that decides protection, and `authorizeSessionAction` is unchanged.
  The coordinator's public entry keeps its props.
- **Extended.** `NoUsableSession` gets an optional server-observed expiry flag. `ProtectionResponses` gets two host
  members. The app-private `admitSubmission` returns the outcome. The confirmation provider replaces its hook with a
  progressively enhanced form component and gains `deny`. Browser facts get closed-set additions.
- **Extracted.** A new `features/session-recovery` holds the one copy of the session-end explanation and Log in, for
  three consumers.
- **Decomposed privately.** The coordinator gets `recovery` and `expired` views, the D7 predicate, deadline
  concealment, and a private `expiration-modal.tsx`.

Rejected: a public recovery route, a required cause on `NoUsableSession`, a local dialog, a status-body cause, and a
separate expiration feature ([rejected abstractions](contracts/modules.md#rejected-abstractions-and-alternatives)).

### Phase 2 — Public module contracts

[contracts/modules.md](contracts/modules.md) states every signature. The compatibility-sensitive decisions are:

- `NoUsableSession.expired?: true | undefined` is optional, so existing values and assertions remain valid.
- `ProtectionResponses.recoveryDocument` (A1) and `.actionDenial` (A3) are required members. Their only implementer
  is `proxy.ts`, updated in the same slice. The gate re-wraps both to 401 and `private, no-store`.
- `useSessionConfirmedActionState` is removed in A2. Both consumers move to `ProtectedActionForm` in the same slice.
- `SessionConfirmationProvider` gains a required `deny` prop in A3. Its only caller is `SessionCoordinator`.
- `recordUiTransition` gains an optional `detail`, so existing calls are unchanged.

### Phase 3 — Module contract evidence

The [contract evidence table](contracts/modules.md#contract-evidence) maps each consumer claim to its violation and
its evidence:

- Durable examples: the `expired` flag (`TestClock`), the gate's transport and status table with a host that returns
  a wrong status, response bodies, `readActionDenial`, `unauthorized()` on `NoUsableSession`, recovery-view effects
  (no record, no message), ended-record compatibility, and logout precedence.
- A Fast-Check property: the D7 known-expiration predicate over deadline, server time, and logout observed.
- Feature evidence instead of module tests: progressive enhancement (a production build is the only honest
  boundary), focus and visible content, timing, and copy equivalence.
- Manual feasibility record (A2): build-output inspection for React's action fields (research D4).

Telemetry is never asserted in these tests.

### Phase 4 — Implementation architecture

Detailed decisions with rationale are in [research.md](research.md). The sequencing they imply:

1. **Gate (D1, D2).** `protectRequest` carries the candidate transport (`fetch` / `document` / `none`) in its
   classification. On `NoUsableSession` for a candidate, it chooses the host member by transport, maps `expired` to
   the cause, re-wraps the host response to 401 with `private, no-store`, and annotates T-001. `exposeOutcome` and
   `exposeIfStillUsable` set `expired: true` on their expired branches.
2. **Host (D1, D3, D12).** `recoveryDocumentResponse` renders a self-contained HTML document with
   `SessionEndNotice`, following `forbiddenDocumentResponse`. `actionDenialResponse` returns
   `ACTION_DENIAL_BODY[cause]` as `text/plain`.
3. **Forms (D4, D5).** `ProtectedActionForm` renders `<Form action>` from `useActionState(serverAction, initial)`
   inside a private error boundary, plus the tag field. Confirmation runs in an effect after each settled state.
   Actions call `unauthorized()` on `NoUsableSession`. The A2 feasibility gate comes first.
4. **In-place recovery (D6, D7).** The boundary calls `deny(readActionDenial(error))`. `TabCoordination.deny`
   reads the status (or trusts an `expired` token), computes the cause with the D7 predicate using the `Date` header
   that `readSessionStatus` now returns on `Ended`, and enters `recovery`. It never calls `recordEnded` or posts.
   The coordinator renders `SessionEndNotice` and moves focus to its heading through `moveFocus`
   (`recovery_heading`). The Log in link records T-005.
5. **Expiry (D8–D10).** At the local deadline the tab conceals (cause `deadline`) and confirms. `Ended` with D7
   enters `expired` and records `{ cause: "expired" }`. Peers adopt the cause from the record. Resume uses the same
   path (cause `resume`). `expired` renders `ExpirationModal` (library `Modal`, no-op `onClose`, `initialFocusRef`
   on Log in), and `pagehide` hides it. T-003 attributes are recorded on these transitions.
6. **Composition (D11, D14).** Log in links to `/` everywhere. Slice C adds only evidence.

The Effect code changes are limited to `session.ts` and `next/protection.ts`. Both keep their existing `Effect.fn`
spans and Layers, and both use the host-owned runtime. No new Effect service is warranted, because the change adds
no workflow.

### Phase 5 — Feature verification integration

[quickstart.md](quickstart.md) turns [verification.md](verification.md) into per-slice sections (§A1, §A2, §A3, §B,
§C). Each section gives exact BDD commands and scenarios, the manual steps with the screen reader, telemetry
queries, cleanup, and the claim map. Module evidence is cited, not repeated. The full verification.md procedure
(steps 1–12) runs once at the C revision. Each earlier slice runs only its section and records V-019–V-022 as
incomplete, as verification.md permits.

Approved limitations from verification.md apply unchanged: pre-script paint, emulated freeze, the screen reader and
browser pair used, missing freshness evidence at the module boundary only, late Continue (#156), connection loss,
and local provider only. Plan limitations L-1–L-4 are in [research.md](research.md#plan-limitations-beyond-verificationmd).

### Phase 6 — Verification telemetry contract

[contracts/telemetry.md](contracts/telemetry.md) covers every claim whose channel includes telemetry (V-001, V-002,
V-009, V-010, V-016, V-019–V-022):

- **T-001**: `protectRequest` annotations `preets.protection.server_action` and `preets.protection.denial_cause`.
- **T-002**: recovery transitions (`recovery_expired`, `recovery_unavailable`, cause `action_denied`).
- **T-003**: the `expired` state, deadline and resume concealment causes, and server-clock timing
  (`preets.session.deadline_ms`, `preets.session.server_time_ms`).
- **T-004**: focus targets `recovery_heading` and `expiration_log_in` (diagnostic).
- **T-005**: the `Interaction.login` fact with `preets.login.entry`.

Existing session, authorization, login, and freshness spans are reused. Never emitted: page text, accessible names,
screen-reader output, cookie and session values, tokens, identity, and tab identifiers. Each is verified through
browser interaction, assistive technology, `session.id`, or step order instead. No metrics.

### Phase 7 — Implementation slices

| Slice  | Branch                                 | Decision a reviewer accepts                                                                                                                                                              | Contracts and modules                                                                                                                                                                                                                  | Telemetry rows                                                 | Claim IDs advanced                                                                                                                                        | Est. hand-written files |
| ------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **A1** | `383-expired-content-recovery-impl`    | A denied Server Action is 401 with recovery meaning: the gate answers a no-script submission with the accessible recovery document, with its cause decided from what the server observed | `session.ts` (`expired`); `next/protection.ts`, `next.ts`, `index.ts` (`SessionEndCause`, `recoveryDocument`); `features/session-recovery` (new); `access-responses` (`recoveryDocumentResponse`); `proxy.ts`                          | T-001                                                          | V-001 (gate), V-002 (HTTP and server), V-004 (no-script unknown; server-expired best effort), V-005 (HTTP part), V-006 (HTTP part), V-024 (response part) | ~15                     |
| **A2** | `383-expired-content-recovery-impl-a2` | Protected action forms work without scripts, and an action-level missing session is a real 401                                                                                           | `providers/session-confirmation.tsx` (`ProtectedActionForm`, hook removed); `reference-operation.tsx`, `roster.tsx`; `session-request.ts`, `actions.ts`, `coordination/actions.ts` (`unauthorized()`)                                  | None new (existing `authorizeSessionAction`)                   | V-006 (full), V-004 (scripts-off removed record), V-001 (action-level path)                                                                               | ~9                      |
| **A3** | `383-expired-content-recovery-impl-a3` | A denied action in a running tab replaces its content with accessible recovery that explains known expiration, and leaves other tabs alone                                               | `providers/action-denial.ts` (new); `session-confirmation.tsx` (`deny`); `next/protection.ts` + `proxy.ts` + `access-responses` (`actionDenial`); coordinator `recovery` view, D7 predicate, `session-endpoints` `Date`; browser facts | T-002, T-004 (`recovery_heading`), T-005 (`action_recovery`)   | V-003, V-004 (JS cases), V-005, V-007, V-008, V-002 (browser part), V-024 (page part); V-018 (recovery side)                                              | ~16                     |
| **B**  | `383-expired-content-recovery-impl-b`  | Confirmed expiry conceals every sharing tab behind an unbypassable, accessible expiration modal within 2 s, and logout keeps precedence                                                  | Coordinator `expired` view, deadline concealment, resume path, `pagehide`; `tab-channel` record cause; `expiration-modal.tsx` (new, library `Modal`); browser facts                                                                    | T-003, T-004 (`expiration_log_in`), T-005 (`expiration_modal`) | V-009–V-018, V-023, V-024 (modal part)                                                                                                                    | ~13                     |
| **C**  | `383-expired-content-recovery-impl-c`  | Log in from the recovery content and from the modal is explicit and fresh, failures show nothing and allow retry, and no tab revives the old session; #157's completion evidence is met  | None (evidence only)                                                                                                                                                                                                                   | Uses T-001–T-005 and existing                                  | V-019, V-020, V-021, V-022 (full); full manual procedure for all claims                                                                                   | ~4                      |

**Planned files per slice** (hand-written; there are no lockfile or generated changes):

- **A1 (15):** `frontend-services/src/session.ts`, `src/next/protection.ts`, `src/next.ts`, `src/index.ts`,
  `tests/lib/session.test.ts`, `tests/unit/protection.test.ts`; `frontend/src/proxy.ts`,
  `src/features/session-recovery.ts`, `src/features/session-recovery/session-end-notice.tsx`,
  `src/features/access-responses.ts`, `src/features/access-responses/presentation.tsx`, `tests/unit/proxy.test.ts`;
  `tests/bdd/requirements/expired-content-recovery.feature`, `tests/bdd/steps/expired-recovery.ts`;
  `docs/session-state.md` (T-001 attributes).
- **A2 (9):** `frontend/src/providers/session-confirmation.tsx`,
  `src/features/session-reference/reference-operation.tsx`, `src/features/coordination-fixtures/roster.tsx`,
  `src/app/(app)/session-request.ts`, `src/app/(app)/actions.ts`, `src/app/(app)/coordination/actions.ts`,
  `tests/unit/reference-session-enforcement.test.ts`; `tests/bdd/requirements/expired-content-recovery.feature`,
  `tests/bdd/steps/expired-recovery.ts` (scripts-disabled context).
- **A3 (15):** `frontend-services/src/next/protection.ts`, `tests/unit/protection.test.ts`;
  `frontend/src/proxy.ts`, `src/features/access-responses/presentation.tsx`, `src/providers/action-denial.ts`,
  `src/providers/session-confirmation.tsx`, `src/features/session-coordination/coordinator.tsx`,
  `src/features/session-coordination/tab-coordination.ts`, `src/features/session-coordination/session-endpoints.ts`,
  `src/features/session-recovery/session-end-notice.tsx` (focus and activation props),
  `src/shared/browser-tracing.ts`, `src/shared/browser-tracing/export-filter.ts`,
  `tests/unit/session-coordination.test.ts`; `tests/bdd/steps/expired-recovery.ts` with its feature file;
  `docs/observability.md` (browser facts). That is about 16, slightly over the guideline. It is one decision: the
  fetch token has no consumer without the in-place view, and the view has no cause without the token. Moving the
  docs row to the next slice would leave the exported facts undocumented.
- **B (13):** `frontend/src/features/session-coordination/tab-coordination.ts`, `tab-channel.ts`, `coordinator.tsx`,
  `expiration-modal.tsx` (new), `src/shared/browser-tracing.ts`, `src/shared/browser-tracing/export-filter.ts`,
  `tests/unit/session-coordination.test.ts`; `tests/bdd/requirements/expiration-protection.feature`,
  `tests/bdd/steps/expiration.ts`, `tests/bdd/steps/tenant.ts` (5-minute tenant step), `tests/bdd/support/browser.ts`
  (lifecycle and clock helpers); `docs/observability.md`, `docs/session-state.md` (expired view replaces the
  stand-in).
- **C (4):** `tests/bdd/requirements/expired-recovery-login.feature`, `tests/bdd/steps/expired-recovery.ts` (Log in
  journeys reusing `fresh-recovery.ts` steps), `quickstart.md` execution results, and a `docs/session-state.md` note
  if the composed run changes what that guide states.

**Order and vertical checks.** Each slice is stacked on the one below it and passes typecheck, lint,
`check:unused`, and `check:health` on its own:

- A1's `recoveryDocument` lands with its HTTP-boundary consumer (the navigation `POST` in BDD) and its tests.
- A2 makes real browser submissions reach that document and removes the old hook in the same slice, so nothing is
  left unused.
- A3 adds `actionDenial` together with its only consumer, the client recovery path.
- B builds on A3's predicate, endpoint `Date` header, and copy.
- C needs both entry points, and it is the only slice whose pull request says `Closes #157`. A1–B say
  `Contributes to #157` and record V-019–V-022 as incomplete. Per research D14, #158's S3 cites C's scenarios.

**Verification per slice.** The implementation session asks the verifier to run the matching quickstart section:
A1 → §A1; A2 → §A2; A3 → §A3; B → §B; C → §C plus the full procedure. Module evidence runs for every slice.
Each slice is marked ready only when the latest report passes the
[verification gate](../../docs/engineering/verification-harness.md#gate-and-escalation) for its telemetry rows and
claims. Limitations already approved in verification.md or listed here as L-1–L-4 may remain.

## Gaps and follow-ups

- [#400](https://github.com/PathableAI-org/Pre-ETS/issues/400): adopt a non-dismissible library `Modal` once
  [styles#264](https://github.com/PathableAI-org/styles/issues/264) ships, then re-run V-011, V-013, and V-014.
- #158 S3: cite slice C's scenarios rather than duplicate them (research D14).
- #156: late-Continue races extend §B once Continue exists. That work is out of scope here.
