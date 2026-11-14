# Module Architecture and Public Contracts: Warn Before Expiration and Continue Accessibly Across Tabs

**Plan**: [plan.md](../plan.md)

**Feature verification**: [verification.md](../verification.md)

**Status**: Planned design. Signatures were checked against the installed Effect 4.1.4 `Schema.Literals`, React
19.3.1 (`inert` as a boolean DOM property), and `@pathableai/react` 0.3.0 `Modal` (`open`, `onClose`, `title`,
`description`, `footer`, `initialFocusRef`, `closeOnBackdropClick`, and pass-through `HTMLAttributes`) and `Button`
(button attributes, no ref). Re-verify them before implementation.

## Module architecture decisions

| Concern                                  | Current owner and consumers                                                                                     | Decision          | Public boundary                                                          | Private decomposition                                                                            | Rationale and non-goals                                                                                                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant warning policy                    | `frontend-services/src/tenant.ts` and `tenant/config.ts`; consumers: gate, coordination handlers, establishment | Preserve          | `tenant.ts` (unchanged)                                                  | None                                                                                             | Defaults, the value domain, and rejection already exist (research F1). This feature adds evidence only.                                                                                  |
| Renewal, late refusal, policy adoption   | `frontend-services/src/session.ts`; consumers: gate, coordination handlers                                      | Preserve          | `session.ts` (unchanged)                                                 | None                                                                                             | `continue-session` is already qualifying, and a request at or after the deadline never renews (F2). Slice C adds the missing boundary property as evidence.                              |
| Communicating Continue                   | `frontend-services/src/next/coordination.ts` (`POST /session/activity`); consumer: the session coordinator      | Extend            | `next.ts` → `createSessionActivityHandler`, `SessionActivityRequestBody` | None                                                                                             | One more accepted literal on the endpoint that already binds activity to the tab's session (research D1). No new route, service, or error.                                               |
| Warning period and threshold             | None                                                                                                            | New private child | `features/session-coordination.ts` (unchanged)                           | `session-coordination/warning-period.ts`                                                         | A pure decision beside `known-expiration.ts` and `snapshot-order.ts`, so it can carry a property (D2).                                                                                   |
| Warning lifecycle in a tab               | `features/session-coordination` (`SessionCoordinator`; private `TabCoordination`)                               | Extend privately  | `features/session-coordination.ts` (unchanged)                           | `tab-coordination.ts`, `session-endpoints.ts`                                                    | The warning is a flag beside the view, like concealment. `SessionCoordinator` keeps its props (D3–D7).                                                                                   |
| Warning dialog and its blocking behavior | None                                                                                                            | New private child | `features/session-coordination.ts` (unchanged)                           | `session-coordination/warning-modal.tsx` (slice A), `session-coordination/blocking.ts` (slice B) | One consumer, the coordinator. The library `Modal` is used as far as it goes, and its gaps are filled here with a recorded removal condition (D8). Not shared UI: nothing else needs it. |
| Browser harness facts                    | `shared/browser-tracing.ts`; consumers: coordinator, fixtures, notices                                          | Extend            | `shared/browser-tracing.ts`                                              | `browser-tracing/export-filter.ts` allow-lists                                                   | Two facts and closed-set additions ([telemetry.md](telemetry.md)).                                                                                                                       |
| BDD time and tenant policy fixtures      | `tests/bdd/steps/expiration.ts`, `steps/expired-recovery.ts`, `support/browser.ts`                              | Extend            | Step definitions (test code)                                             | New `steps/warning.ts`                                                                           | Reuses the multi-tab, clock, and tenant-copy helpers. One new step sets a tenant's warning lead.                                                                                         |

No workspace, package, Effect service, Layer, configuration setting, dependency, route, stored field, or cross-tab
message is added.

## Public contracts

### `@pathableai/pre-ets-frontend-services`: session activity endpoint

**Responsibility**: Lets a tab communicate qualifying activity for the session it observed, and renews that session
with the tenant's current policy.

**Actual consumers**:

- `packages/frontend/src/app/session/activity/route.ts` mounts the handler.
- `packages/frontend/src/features/session-coordination/session-endpoints.ts` sends the body: coalesced in-page
  activity today, and Continue from slice A.

**Proposed signatures**:

```ts
/** The in-page kinds a tab coalesces in B5 windows. Unchanged. */
export type InPageSessionActivity =
  | "intentional-control-activation"
  | "keyboard-interaction"
  | "text-entry"
  | "touch-interaction"
  | "user-driven-meaningful-input-focus"

/** `POST /session/activity` JSON body. `continue-session` is the warning's Continue (slice A). */
export interface SessionActivityRequestBody {
  readonly activity: "continue-session" | InPageSessionActivity
  readonly coordinationTag: string
}

export const createSessionActivityHandler: () => (request: NextRequest) => Promise<NextResponse> // unchanged
```

The body type stays derived from the handler's schema. No new name is exported.

**Inputs and validation ownership**: The handler decodes the untrusted body and rejects excess properties and any
other activity value with 400, as today. The tag, origin, and content-type checks are unchanged and run before any
session operation.

**Success semantics and invariants**:

- `continue-session` is handled exactly as an in-page kind: `refreshForTenant` with that activity and the tenant's
  effective policy at that moment. A 200 answer is the renewed snapshot with a higher revision, the new deadline, and
  the adopted lead.
- A `continue-session` request received at or after the authoritative deadline never renews. The gate answers 401
  when no usable session exists, and the handler answers 401 when the refresh finds the record expired or missing.
- A tag of another session answers 409 and renews nothing.
- No response sets or clears a cookie. Every response is `private, no-store`.
- `SessionService.refreshForTenant` records `preets.session.activity = continue-session` (telemetry T-005).

**Expected errors**:

| Public error                       | Meaning for consumers                         | Owned internal failures translated here                   | Consumer response                                   |
| ---------------------------------- | --------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------- |
| None new (HTTP 401, 409 as today)  | The session ended, or another one is in force | `NoUsableSession`, the handler's private tag mismatch     | The tab follows its ended path (research D6)        |
| None new (HTTP 400, 403, 415, 503) | The request was refused or the state unknown  | Schema, origin, content-type, `SessionServiceUnavailable` | The warning stays open and Continue stays available |

**Defects and interruption**: Unchanged.

**Effect environment requirements**: Unchanged (`SessionService`, `TenantConfigService` through the host-owned
runtime).

**Compatibility and relationships**: Additive. Existing bodies remain valid. `InPageSessionActivity` keeps its five
members, so the frontend's classification table and the `pending` cross-tab message cannot carry `continue-session`.

### Frontend: `features/session-coordination.ts`

**Responsibility**: One tab's participation in its session, now including the pre-expiration warning.

**Actual consumers**: `app/(app)/layout.tsx` renders `SessionCoordinator` around every protected page.

**Proposed signatures**:

```ts
// Public entry: unchanged.
export function SessionCoordinator(props: {
  readonly children: ReactNode
  readonly snapshot: SessionCoordinationSnapshot
}): ReactNode
```

Feature-private shapes that the coordinator's children share (not exported from the entry):

```ts
// session-coordination/warning-period.ts (slice A)
type WarningPolicy = Pick<SessionCoordinationSnapshot, "idleDeadlineEpochMilliseconds" | "warningLeadMinutes">

/** The server-clock time the warning period starts, or `undefined` when the lead is 0. */
export const warningThreshold: (snapshot: WarningPolicy) => number | undefined

/** True when the lead is positive and `serverTime` is at or after the threshold and before the deadline. */
export const inWarningPeriod: (snapshot: WarningPolicy, serverTime: number) => boolean

// session-coordination/tab-coordination.ts (slice A)
export interface TabViewState {
  // existing members unchanged
  /** Present while the warning is open in this tab. `failed`: the last Continue did not renew and did not end. */
  readonly warning?: { readonly continuation: "failed" | "idle" | "sending" } | undefined
}

export class TabCoordination {
  // existing members unchanged
  /** Sends Continue at once, outside the activity window. Never throws. */
  continueSession(): Promise<void>
}

// session-coordination/session-endpoints.ts (slice A)
export const sendActivity: (
  activity: SessionActivityRequestBody["activity"],
  coordinationTag: string,
  timeout?: number
) => Promise<SessionOutcome>

// session-coordination/warning-modal.tsx (slice A; blocking behavior completed in slice B)
export function WarningModal(props: {
  readonly continuation: "failed" | "idle" | "sending"
  readonly onContinue: () => void
}): ReactNode

// session-coordination/blocking.ts (slice B)
/** Makes every child of `document.body` except `surface`'s own body-level ancestor inert. Answers the undo. */
export const blockBackground: (surface: Element) => () => void

/** Focuses `previous` if it is connected and takes focus, otherwise `fallback`. */
export const restoreFocus: (previous: Element | null, fallback: HTMLElement | null) => void
```

**Inputs and validation ownership**: The server snapshot is trusted as decoded by `session-endpoints.ts`. Cross-tab
messages stay validated by `tab-channel.ts`. The warning adds no storage and no message.

**Success semantics and invariants**:

- **Opening.** With a positive held lead, the tab confirms with the server when it reaches its local threshold, and
  on resume past it. It opens the warning only on a `Usable` answer to its own request whose server time is in the
  warning period of the snapshot it holds after adoption. A later deadline learned from that answer prevents the
  warning. A lead of 0 never opens one. A cross-tab message never opens one.
- **Earlier activity.** Coalesced activity that this tab still holds at the threshold is sent before the tab
  confirms. No in-page activity is classified while the warning is open.
- **Closing.** The warning closes only when the tab adopts a snapshot with a higher revision that takes the session
  out of its warning period, or when the session ends. Escape, the library close control, a pointer press outside,
  Tab, and a failed Continue close nothing and renew nothing.
- **Continue.** One activation sends one `continue-session` request in the same task. Activations while a request is
  in flight send nothing. `Usable` adopts and broadcasts the snapshot. `Ended` follows the existing ended path, so the
  expired outcome of #157 replaces the warning in every sharing tab. Any other answer leaves the warning open with
  `continuation: "failed"`.
- **Expiration is unchanged.** The deadline timer conceals and confirms whether or not a warning is open or enabled.
- **Dialog (slice A).** The warning is a modal dialog with an accessible name and description, focus moves to
  Continue when it opens, and Continue is a button operable by Enter and Space with the library's visible focus.
- **Blocking (slice B).** While the dialog is open, Continue is its only control, every child of `document.body`
  other than the dialog's portal root is inert, focus cannot rest outside the dialog, and when the warning closes
  while the tab stays active, focus returns to the previously focused element if it is still connected and
  focusable, and otherwise to the page's main content.
- **Isolation.** Opening, closing, and Continue use only this tab's coordination tag. A message or record for
  another tag changes nothing, as today.
- The header keeps `data-session-deadline` and `data-session-warning-lead` as non-protected evidence.

**Expected errors**: None. Controller methods never throw; an unexpected failure conceals the tab, as today.

**Defects and interruption**: A torn-down controller ignores late answers, as today.

**Effect environment requirements**: None. This workspace is not an Effect workspace. Timers, the DOM, and `fetch`
are used directly because the browser owns them.

**Compatibility and relationships**: No public signature changes. The client state added is the warning flag and
the Continue state, both in the coordinator that is already a client component (Principle IV: the interaction needs
timers, focus, and cross-tab messages). The dialog depends on `@pathableai/react` `Modal` and `Button` only through
the package's public entry. The workarounds in `warning-modal.tsx` and `blocking.ts` are removed when #400 closes
(research D8).

### Frontend: `shared/browser-tracing.ts`

**Responsibility**: Closed-set harness facts recorded while browser tracing runs.

**Actual consumers**: The session coordinator (all additions below).

**Proposed signatures** (additions, all slice A):

```ts
export type FocusTarget = /* existing */ "warning_continue"

export type TransitionCause =
  | /* existing */ "action_denied" |
  "deadline" |
  "peer" |
  "resume"
  | "continue" // this tab's Continue renewed
  | "renewal" // another answer this tab received showed a renewal
  | "threshold" // the tab confirmed at its local threshold

export type UiState = /* existing */ "warning_shown"

export interface TransitionTiming {
  readonly deadlineMs: number
  readonly serverTimeMs: number
  /** The held warning lead. Set on threshold facts and on transitions into and out of `warning_shown`. */
  readonly warningLeadMinutes?: number | undefined
}

/** T-001. The tab reached its local warning threshold, or resumed past it, and now confirms. */
export const recordWarningThreshold: (cause: "resume" | "threshold", timing: TransitionTiming) => TraceScope

/** T-003. Recorded synchronously when the user activates Continue; the request is sent inside its scope. */
export const recordContinueActivation: () => TraceScope
```

`recordUiTransition` keeps its signature; its `detail.timing` carries the new optional member. Every new span name
and attribute key is added to `export-filter.ts` in slice A.

**Success semantics and invariants**: No recorder accepts free text. With browser tracing off, each recorder returns
a plain scope and records nothing, as today.

**Expected errors**: None. Telemetry never changes the page.

**Compatibility and relationships**: Additive. Existing callers are unchanged.

### Contract evidence

| Claim                                                                                                               | Meaningful violation                                                        | Durable evidence                                                                                                                                        | Manual/transient evidence | Limitations and non-duplication                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| The endpoint accepts `continue-session` and renews with the current policy; other checks are unchanged (A)          | Continue answered 400; renewal with a stale policy; a foreign tag renews    | `frontend-services/tests/unit/coordination.test.ts`: the existing origin, content-type, and tag table extended to `continue-session`; a renewal example | —                         | The browser journey is feature BDD (quickstart §A).                                              |
| A `continue-session` request at or after the deadline never renews (C)                                              | A renewal at the deadline instant, or after it                              | `tests/lib/session.test.ts`: a Fast-Check property over received times around the deadline (`TestClock`); handler examples at and after the deadline    | —                         | The race with eviction is existing real-Redis evidence in `session-redis.test.ts`. Not repeated. |
| Threshold and warning period: none at lead 0; open from the threshold up to, not including, the deadline (A)        | A warning at lead 0; a period that includes the deadline or starts early    | `frontend/tests/unit/session-coordination.test.ts`: a Fast-Check property over deadline, lead, and server time, plus boundary examples                  | —                         | Timing in a real tab is feature evidence.                                                        |
| The tab confirms before opening, and a later deadline in the answer prevents the warning (A)                        | A warning opened from the timer alone, or over a renewed session            | `session-coordination.test.ts` controller examples with fake timers and stubbed status answers                                                          | —                         | V-007's composed case is feature BDD.                                                            |
| Pending activity at the threshold is sent first; no activity is classified while the warning is open (A)            | Activity dropped behind a warning; a key press in the warning renews        | `session-coordination.test.ts` controller examples                                                                                                      | —                         | —                                                                                                |
| Only an adopted renewal or the session's end clears the warning; a failed Continue leaves it open with `failed` (A) | Cleared by an equal revision, by a failure, or by a message for another tag | `session-coordination.test.ts` controller examples over the three Continue answers and the three adoption sources                                       | —                         | Cross-tab timing is feature evidence.                                                            |
| One activation sends one request, at once, outside the activity window (A)                                          | A coalesced or duplicated Continue                                          | `session-coordination.test.ts` controller example with an open activity window and a double activation                                                  | —                         | Latency is observed through telemetry (T-003), not asserted.                                     |
| `blockBackground` makes every other body child inert and restores each earlier value (B)                            | A body child left operable; `inert` left behind or cleared where it was set | `session-coordination.test.ts` jsdom examples, including a child that was already inert                                                                 | —                         | What a pointer, keyboard, or screen reader reaches is feature evidence (§B).                     |
| `restoreFocus` returns to the earlier element, and to the fallback when it is gone or no longer takes focus (B)     | Focus left on `body`; focus on a detached element                           | `session-coordination.test.ts` jsdom examples: connected, removed, disabled, and none                                                                   | —                         | Visible focus is feature evidence.                                                               |
| The dialog exposes one control, Continue, and Escape and the close control do nothing (B)                           | A second operable control; a closed dialog                                  | Feature BDD (§B): accessibility tree and keyboard                                                                                                       | —                         | A jsdom test of the library's markup would test the library. The composed page is the boundary.  |

Durable tests never assert spans, facts, or attributes.

## Cross-module dependency direction

`app/(app)/layout.tsx` → `features/session-coordination.ts` → its private children. Among the children:
`coordinator.tsx` → `warning-modal.tsx` → `blocking.ts`, and `tab-coordination.ts` → `warning-period.ts` and
`session-endpoints.ts`. `features/session-coordination` → `shared/browser-tracing.ts` and
`providers/session-confirmation.tsx`, as today. Client modules import only types from frontend-services, and
frontend-services never imports the frontend. `frontend/tests/unit/session-coordination.test.ts` already imports this
feature's children directly as its owning test; no other test or sibling does.

## Rejected abstractions and alternatives

- A separate warning feature module or shared modal component: the warning has one consumer and reads coordinator
  state, so splitting it out would expose that state.
- A new route or Server Action for Continue: the activity endpoint already owns the tag binding (research D1).
- A new exported activity type: the request body type already names what a tab may send.
- A cross-tab "warning opened" message: every tab must confirm for itself anyway (research D12).
- A local dialog on the native `dialog` element, and leaving the library's close control visible: research D8.
- A product-level test clock, and a harness clock that shifts the server process: research D13.
- A remaining-time display: optional in FR-007 and not needed by any claim (research D9).

## Open decisions

### Blocking contract decisions

- None. The plan pull request names four choices for the reviewer (research D8, D12, D13, and the nightly BDD
  duration). None changes an acceptance criterion, an observation, or an evidence channel.

### Implementation choices left to tasks

- How `warning-modal.tsx` finds and neutralizes library-rendered controls after each open, and how it keeps focus
  from resting outside the dialog.
- Whether `TabCoordination` keeps the warning state inline or in a small private collaborator, as `pnpm check:health`
  guides.
- The exact wait before the threshold is checked again after pending activity is sent (at most one second).
- Exact BDD step wording and helper placement within the scenarios planned in quickstart.
