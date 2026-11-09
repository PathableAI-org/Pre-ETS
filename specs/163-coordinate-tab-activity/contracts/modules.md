# Module Architecture and Public Contracts: Coordinate Intentional Activity and Logout Across Session-Sharing Tabs

**Plan**: [plan.md](../plan.md)

**Feature verification**: [verification.md](../verification.md)

**Status**: Planned design — Next.js 16.4.5, React 19.3.1, Effect 4.1.2, `@pathableai/react` 0.3.0, and Playwright
1.65.0 facts checked against installed declarations (see [research.md](../research.md#installed-dependency-facts)).
Signatures are re-verified when implementation starts.

## Module architecture decisions

| Concern                                        | Current owner and consumers                                                                            | Decision                                                                                                                                                                                                               | Public boundary                                   | Private decomposition                                                                                                                                                                                                                                                         | Rationale and non-goals                                                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session lifecycle operations                   | `frontend-services/src/session.ts` (`SessionService`); consumers: gate, `readSessionRequest`, callback | **Preserve.** No signature, record, or store change.                                                                                                                                                                   | `src/session.ts`                                  | unchanged                                                                                                                                                                                                                                                                     | `refreshForTenant`, `readForTenant`, and `invalidate` already provide renewal, no revival, and invalidation. A new operation would duplicate them.                                                                    |
| Default protection gate                        | `frontend-services/src/next/protection.ts`; consumer: `frontend/src/proxy.ts`                          | **Extend** the private classifier with one closed set: the three endpoint paths are protected application requests that never renew, regardless of method, Fetch Metadata, or `next-action` (research D1, R5).         | `src/next.ts` (signature unchanged)               | `next/protection.ts` gains `NON_RENEWING_PATHS`                                                                                                                                                                                                                               | Without it, a crafted action header or a navigation would renew before the handler's tag check. Designation and outcome matrix are unchanged.                                                                         |
| HTTP adapters for activity, status, and logout | none                                                                                                   | **Extend** the Next host-adapter module with three handler factories and two private children.                                                                                                                         | `src/next.ts`, re-exported from `src/index.ts`    | NEW `next/coordination.ts` (in-page activity schema, same-origin check, three programs); NEW leaf `next/coordination-snapshot.ts` (tag derivation and snapshot construction; imports only `session.ts` types and `node:crypto`); `next/cookies.ts` gains `clearSessionCookie` | One owner for Next host adapters already exists. The leaf child keeps `next/session.ts` from importing the handler module, which would close the cycle `session.ts → coordination.ts → cookies.ts → session.ts` (R1). |
| Snapshot for server-rendered protected pages   | `next/session.ts` (`readSessionRequest`); consumers: `(app)/page.tsx`, `(app)/actions.ts`              | **Extend** `ResolvedSessionRequest` with an additive `coordination` field.                                                                                                                                             | `src/next.ts`                                     | `next/session.ts` calls the leaf `next/coordination-snapshot.ts` only                                                                                                                                                                                                         | The layout needs the same tenant-resolved read the page performs; protected actions use the same field for their tag check (R2).                                                                                      |
| Browser coordination, logout UI, concealment   | none                                                                                                   | **Add** one feature entry.                                                                                                                                                                                             | `frontend/src/features/session-coordination.ts`   | `activity-classification.ts`, `activity-window.ts`, `mount-script.ts`, `session-endpoints.ts`, `tab-channel.ts`, `coordinator.tsx`, `logout-control.tsx`, `signed-out-notice.tsx`                                                                                             | One cohesive client concern with one composition point (`(app)/layout.tsx`). Splitting into several features would create cross-feature imports Bulletproof forbids and no independent consumers.                     |
| Cross-feature session confirmation             | none                                                                                                   | **Add** one shared provider module, because three features need it and Bulletproof forbids feature-to-feature imports.                                                                                                 | `frontend/src/providers/session-confirmation.tsx` | none (single file)                                                                                                                                                                                                                                                            | Shared zone (`src/providers/**`) is importable by every feature. It holds only a React context and its hook; the coordinator supplies the value.                                                                      |
| Protected multi-page fixtures                  | none (`/_test/onsite` is public)                                                                       | **Add** one feature entry and two protected pages.                                                                                                                                                                     | `frontend/src/features/coordination-fixtures.ts`  | `roster.tsx`, `participant.tsx`, `fixture-action-form.tsx`                                                                                                                                                                                                                    | Research D11. Retained for #157/#156; synthetic only.                                                                                                                                                                 |
| Reference Server Action consumer               | `features/session-reference`; consumer: `(app)/page.tsx`                                               | **Extend behavior**: send the observed tag (from the shared provider) in a hidden field, have `runReferenceOperation` refuse a mismatched tag with no effect, and confirm after the action settles. Exports unchanged. | `features/session-reference.ts`                   | `reference-operation.tsx`; `(app)/actions.ts`                                                                                                                                                                                                                                 | Research D2 (R2) and D6.                                                                                                                                                                                              |
| History restoration                            | `features/history-protection` (`RestoredPageGuard`); consumer: root layout                             | **Preserve.** It remains the only owner of bfcache reload. Concealment before caching is the coordinator's `pagehide` handler.                                                                                         | `features/history-protection.ts`                  | unchanged                                                                                                                                                                                                                                                                     | Research D9. Moving reload into the coordinator would leave public pages without the guard.                                                                                                                           |
| Protected route-group layout                   | `(app)/layout.tsx` returns children                                                                    | **Extend**: read the session snapshot and render `SessionCoordinator` around children.                                                                                                                                 | Next convention file                              | none                                                                                                                                                                                                                                                                          | The route group is the existing boundary of protected pages.                                                                                                                                                          |
| Route files for the endpoints                  | none                                                                                                   | **Add** `app/session/activity/route.ts`, `app/session/status/route.ts`, `app/auth/logout/route.ts`.                                                                                                                    | Next convention files                             | none                                                                                                                                                                                                                                                                          | Thin wiring only, as `app/auth/login/route.ts` does. No Effect in the Next app.                                                                                                                                       |
| Requirements BDD support                       | `tests/bdd/support/*`                                                                                  | **Extend** with multi-tab/context helpers, a context clock, and an authoritative-deadline reader over `GET /session/status`.                                                                                           | `tests/bdd/support`                               | `browser.ts`, `fixtures.ts`                                                                                                                                                                                                                                                   | Research D12. Root tooling, not an Effect workspace.                                                                                                                                                                  |

Backend and domain are not affected. No new package, Layer, service, dependency, or configuration key is added.

## Public contracts

### `@pathableai/pre-ets-frontend-services` — Next host adapters (`src/next.ts`, re-exported from `src/index.ts`)

**Responsibility**: HTTP adapters that let a tab communicate in-page activity, confirm its session, and log out, each
bound to the session the tab observed; and the snapshot a protected page needs to start coordinating.

**Actual consumers**:

- `frontend/src/app/session/activity/route.ts` — `POST` handler.
- `frontend/src/app/session/status/route.ts` — `GET` handler.
- `frontend/src/app/auth/logout/route.ts` — `POST` handler.
- `frontend/src/app/(app)/layout.tsx` — `readSessionRequest(...).coordination` for the initial snapshot.
- `frontend/src/features/session-coordination/session-endpoints.ts` — type-only imports of the wire types.

**Proposed signatures**:

```ts
/** In-page qualifying kinds a tab may communicate. Deliberate requests renew at the gate; `continue-session` is #156's. */
export type InPageSessionActivity =
  | "intentional-control-activation"
  | "keyboard-interaction"
  | "text-entry"
  | "touch-interaction"
  | "user-driven-meaningful-input-focus"

/** What a tab may know about its usable session. Contains no reference, identity, token, or store key. */
export interface SessionCoordinationSnapshot {
  /** One-way, domain-separated digest of the session reference (research D2). Not a credential. */
  readonly coordinationTag: string
  readonly idleDeadlineEpochMilliseconds: number
  /** Server clock when the snapshot was produced; lets the tab convert the deadline to its own clock. */
  readonly serverTimeEpochMilliseconds: number
  readonly warningLeadMinutes: number
}

/** `POST /session/activity` JSON body. */
export interface SessionActivityRequestBody {
  readonly activity: InPageSessionActivity
  readonly coordinationTag: string
}

/** `POST /auth/logout` JSON body. */
export interface LogoutRequestBody {
  readonly coordinationTag: string
}

export const createSessionActivityHandler: () => (request: NextRequest) => Promise<NextResponse>
export const createSessionStatusHandler: () => (request: NextRequest) => Promise<NextResponse>
export const createLogoutHandler: () => (request: NextRequest) => Promise<NextResponse>

// Changed (additive field):
export interface ResolvedSessionRequest {
  /** Present exactly when `session` is a `UsableSession`. */
  readonly coordination: SessionCoordinationSnapshot | undefined
  readonly session: NoUsableSession | UsableSession
  readonly tenantAlias: TenantAlias
}
```

**HTTP outcomes** (every response carries `Cache-Control: private, no-store`; non-200 bodies are empty; no response
contains identity, reference, or record content):

| Handler  | Precondition failure                                           | Session outcome (after tenant resolution)                                                                                                                                                                                                                       |
| -------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity | Not same-origin → 403; not JSON → 415; body fails decode → 400 | Tag ≠ cookie's tag → 409, no store write. Usable → `refreshForTenant` with the decoded kind and effective policy → 200 `SessionCoordinationSnapshot`, cookie re-issued with remaining `Max-Age`. No usable session → 401. Mismatch → 403. Undeterminable → 503. |
| Status   | none (gate already admitted a same-tenant session)             | `readForTenant` only, never renews. Usable → 200 snapshot (current tag). No usable session → 401. Mismatch → 403. Undeterminable → 503.                                                                                                                         |
| Logout   | Not same-origin → 403; not JSON → 415; body fails decode → 400 | No usable session → 401. Tag ≠ cookie's tag → 409, nothing invalidated. Tag matches → `invalidate` → 204 with `pathable-session` expired (`Max-Age=0`). Mismatch → 403. Undeterminable → 503 and the cookie is left unchanged.                                  |

Tenant failure inside a handler answers its `tenantFailureStatus` (404 or 500) with an empty body; the gate normally
answers tenant failure before the handler runs. Runtime not started answers 503 through `toNext`.

**Inputs and validation ownership**: the JSON body is untrusted and decoded once in `next/coordination.ts` with
`Schema.fromJsonString` over a `Schema.Struct` using `Schema.Literals` for the kind, with excess properties rejected.
The cookie reference is decoded by the existing `decodeSessionReference`. The tag comparison uses a constant-time
comparison of equal-length strings. Same-origin is decided from `sec-fetch-site`, then `origin`, against
`request.nextUrl.origin`.

**Success semantics and invariants**:

- A successful activity response is produced only after the store renewed the same session whose tag the tab sent;
  the returned deadline is the authoritative renewed deadline (FR-010, FR-011).
- Status never renews and never creates a session (FR-005, FR-012).
- Logout answers 204 only after the store removed the record for the tab's session (FR-014, FR-021).
- For any request, an activity or logout whose tag differs from the cookie's tag performs no store write (FR-016).
- Activity for a missing or expired record never revives it (S2 invariant, FR-010).
- `coordination` is `undefined` whenever `session` is `NoUsableSession`.

**Expected errors**: none cross the public boundary. Each handler translates `TenantFailure`,
`SessionTenantMismatch`, `SessionServiceUnavailable`, decode failures, and tag mismatch into the statuses above, on
`_tag`, in `next/coordination.ts`. A private `CoordinationTagMismatch` tagged error and a private
`CrossOriginRequest` tagged error keep these distinct inside the program; they are not exported.

**Defects and interruption**: a defect rejects the handler promise (Next answers 500). Nothing is renewed, invalidated,
or reported as successful on a defect. `StartupNotReady` maps to 503 through the existing `toNext`.

**Effect environment requirements**: `SessionService` and `TenantConfigService` from the shared runtime; `Clock` for
`serverTimeEpochMilliseconds` and the cookie `Max-Age`. Programs are `Effect.fn("sessionActivity")`,
`Effect.fn("sessionStatus")`, and `Effect.fn("logout")`; helpers are `Effect.fnUntraced`. Spans carry no tag,
reference, identity, or host attribute beyond what existing spans record.

**Compatibility and relationships**: additive exports; `ResolvedSessionRequest` gains one field, so existing consumers
compile unchanged. The gate's public designation and outcome matrix are untouched; its private classifier never renews
on the three endpoint paths (research D1). Protected Server Actions compare a submitted `coordinationTag` field with
`coordination.coordinationTag` and return a denial with no effect on mismatch (research D2). `#156` will add `continue-session`
handling and warning fields to the snapshot; `#157` consumes 401 from status for expiration presentation.

### Contract evidence — frontend-services adapters

| Claim                                                                                          | Meaningful violation                                                                                                 | Durable evidence                                                                                                                                                                                                                                                                                                                                                                                                                                 | Manual/transient evidence | Limitations and non-duplication                                                          |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------- |
| A tag mismatch never writes to the store, for activity and logout.                             | Stale tab renews or ends a later session.                                                                            | **Fast-Check property** in `tests/unit/coordination.test.ts` through `src/next.ts`: for generated references, tags, kinds, and bodies, with a recording `SessionService` test Layer, the handler writes iff the body tag equals the cookie's derived tag and the request is same-origin JSON.                                                                                                                                                    | none                      | Unit Layer, not Redis; real-store behavior is the integration row.                       |
| Activity renews on receipt and returns the authoritative deadline and policy.                  | Response deadline differs from the stored one, or activity does not renew.                                           | **Integration** `tests/integration/coordination-redis.test.ts` with owned prefixes: establish, call the activity handler, compare the response snapshot with the stored record.                                                                                                                                                                                                                                                                  | none                      | Real store; no browser.                                                                  |
| Activity after expiry or after logout does not revive access.                                  | Late activity yields 200 or a stored record.                                                                         | Same integration suite: invalidate or let a 1-second test-policy session expire, then call activity → 401, record absent.                                                                                                                                                                                                                                                                                                                        | none                      | Reuses S2 no-revival evidence for the store script; this row covers the handler mapping. |
| Logout ends the session and expires the cookie; 204 only after removal.                        | 204 while the record exists, or cookie left set.                                                                     | Integration: logout → 204, `Set-Cookie` with `Max-Age=0`, record absent; with the store stopped (existing outage helper) → 503, cookie untouched.                                                                                                                                                                                                                                                                                                | none                      |                                                                                          |
| Status never renews.                                                                           | A status read moves the deadline.                                                                                    | Integration: status twice across a clock step; stored deadline unchanged.                                                                                                                                                                                                                                                                                                                                                                        | none                      |                                                                                          |
| Same-origin and content-type enforcement precede any session operation.                        | Cross-site POST renews or logs out.                                                                                  | Unit examples: `sec-fetch-site: cross-site`, `same-site`, absent with foreign `Origin`, absent with matching `Origin`, `text/plain` body; recording Layer shows no call.                                                                                                                                                                                                                                                                         | none                      |                                                                                          |
| The tag reveals no reference or store key and is stable per reference.                         | Tag equals the store key digest, or varies for one reference.                                                        | Unit property: tag is deterministic per reference, differs across references, and never equals the SHA-256 store-key digest of the same reference.                                                                                                                                                                                                                                                                                               | none                      | Cryptographic one-wayness is a property of SHA-256, not tested.                          |
| `coordination` is present iff the session is usable; no reference or identity in the snapshot. | Snapshot for `NoUsableSession`, or snapshot containing the reference.                                                | Unit examples through `readSessionRequest` with a test runtime (existing `reference-session-enforcement.test.ts` pattern).                                                                                                                                                                                                                                                                                                                       | none                      |                                                                                          |
| The gate never renews on the endpoint paths, whatever the request shape.                       | A `POST` with `next-action`, or a navigation `GET`, to an endpoint moves the deadline before the handler refuses it. | **Fast-Check property** in the existing `tests/unit/protection.test.ts`: for generated methods, Fetch Metadata, and `next-action` presence on the three paths, the classifier yields a protected application request without renewal. **Composed integration** in `coordination-redis.test.ts`: gate then handler on real Redis, for a stale-tag activity with `next-action` and a navigation `GET` to status; the stored deadline is unchanged. | none                      |                                                                                          |
| `readSessionRequest` does not depend on the handler module.                                    | An import cycle through `next/coordination.ts`.                                                                      | `pnpm --filter @pathableai/pre-ets-frontend-services exec fallow dead-code` and the repository cycle gate in `pnpm check:changes`.                                                                                                                                                                                                                                                                                                               | none                      | Structural; no runtime test.                                                             |
| Tenant failure, mismatch, and outage map to stable statuses.                                   | Mismatch answers 200, or outage answers 401.                                                                         | Unit table over the recording Layer; integration outage row above.                                                                                                                                                                                                                                                                                                                                                                               | none                      | Gate-level mapping is S1's existing evidence; not repeated.                              |

### `frontend/src/features/session-coordination.ts`

**Responsibility**: the tab's participation in its session: activity classification and B5-W communication,
cross-tab synchronization, local-deadline confirmation, resume handling, logout, concealment, and the signed-out
notice.

**Actual consumers**:

- `src/app/(app)/layout.tsx` — renders `SessionCoordinator` around every protected page.
- `packages/frontend/tests/unit/session-coordination.test.ts` — classifier and window policy (see the evidence note).

`SessionCoordinator` supplies the confirmation function through `src/providers/session-confirmation.tsx` (below), so
no other feature imports this entry.

**Proposed signatures**:

```ts
import type { InPageSessionActivity, SessionCoordinationSnapshot } from "@pathableai/pre-ets-frontend-services"
import type { ReactNode } from "react"

/** Client component. Renders the header with Log out, then the protected content, concealed or replaced as required. */
export function SessionCoordinator(props: {
  readonly children: ReactNode
  readonly snapshot: SessionCoordinationSnapshot
}): ReactNode

/** Pure classification of one DOM event (research D4). */
/** Pure snapshot ordering (research D6): adopt when `next.serverTimeEpochMilliseconds` is later than `held`'s. */
export function adoptSnapshot(
  held: SessionCoordinationSnapshot | undefined,
  next: SessionCoordinationSnapshot
): boolean

export function classifySessionActivity(
  event: Event,
  context: { readonly gestureInCurrentTask: boolean }
): InPageSessionActivity | undefined

export interface ActivityWindowRecord {
  readonly coordinationTag: string
  readonly lastCommunicatedAt: number | undefined
  readonly pendingSince: number | undefined
}

export type ActivityWindowDecision =
  | { readonly _tag: "SendNow"; readonly record: ActivityWindowRecord }
  | { readonly _tag: "Coalesce"; readonly record: ActivityWindowRecord; readonly sendAt: number }

/** Pure B5-W decision (research D5). Times are local epoch milliseconds. */
export function decideActivityCommunication(
  record: ActivityWindowRecord | undefined,
  input: { readonly coordinationTag: string; readonly deadline: number; readonly now: number }
): ActivityWindowDecision

export type ActivityFlushDecision =
  | { readonly _tag: "Send"; readonly record: ActivityWindowRecord }
  | { readonly _tag: "Reschedule"; readonly sendAt: number }
  | { readonly _tag: "Nothing" }

/** Window-end flush under the lock: sends only for this tag, with pending activity, once the current window is due. */
export function flushActivityCommunication(
  record: ActivityWindowRecord | undefined,
  input: { readonly coordinationTag: string; readonly now: number }
): ActivityFlushDecision
```

**Inputs and validation ownership**: server snapshots arrive as props (trusted server render) or as JSON from the
three endpoints; `session-endpoints.ts` narrows JSON with ordinary TypeScript checks (this workspace does not use
Effect) and treats any unexpected shape as undeterminable. Channel messages and the storage record are narrowed the
same way and ignored when malformed or for another tag.

**Success semantics and invariants**:

- Only classified trusted events on meaningful inputs inside the protected content are communicated (FR-004, FR-005).
  Gestures are observed at document capture so focus entering the content by keyboard qualifies (research D4).
- A submission is allowed only while the tab is `Active` and its tag equals the shared current-session tag;
  otherwise it is cancelled and the tab confirms (research D2).
- A snapshot is adopted only when its server read time is later than the held snapshot's, even if its deadline is
  earlier (research D6).
- A tag recorded as ended is applied on mount, before the snapshot is trusted, and on every resume (research D14).
- B5-W: a communication is sent immediately when no communication was recorded in the previous 60 seconds or the
  deadline is under 60 seconds away; otherwise exactly one send occurs when the window ends; no interaction waits more
  than 60 seconds (FR-006–FR-008).
- Logout is sent immediately and never enters the window (FR-009).
- The tab never conceals, expires, or denies on its own while the server confirms a usable session with its tag
  (FR-012).
- After logout or a confirmed ended session, the protected subtree is unmounted and the signed-out notice with a Log in
  link to `/` is shown in every sharing tab (FR-015, FR-023).
- Temporary concealment uses `hidden` and `inert` and is restored when the server confirms (FR-017, FR-018).
- Nothing sent on the channel or written to storage contains protected content, identity, or the reference (FR-022).

**Expected errors**: no thrown errors cross the boundary. Endpoint outcomes become coordinator states (see
[data-model.md](../data-model.md#tab-coordination-states)).

**Defects and interruption**: an unexpected exception inside the coordinator's event handling is not swallowed into a
"valid" state. It leaves the tab concealed (fail closed) and is reported to the console by React's error handling.

**Effect environment requirements**: none. This is React and browser code in a non-Effect workspace.

**Compatibility and relationships**: new. `@pathableai/react` `Alert`, `Button`, `Heading`, `Link`, and `Text` are the
presentation primitives. Implementation reads the installed pathable-react guidance first. The coordinator provides
`SessionConfirmationProvider` from the shared provider module.

### `frontend/src/providers/session-confirmation.tsx` (shared zone)

**Responsibility**: let a protected Server Action consumer ask the tab's coordinator to confirm and synchronize the
session after the action settles, without importing the coordination feature.

**Actual consumers**: `features/session-coordination/coordinator.tsx` (provides the value);
`features/session-reference/reference-operation.tsx` and `features/coordination-fixtures/fixture-action-form.tsx`
(call the hook).

**Proposed signatures**:

```ts
"use client"
export function SessionConfirmationProvider(props: {
  readonly children: ReactNode
  readonly confirm: () => Promise<void>
  readonly coordinationTag: string
}): ReactNode
/** Outside a provider (public pages), `confirm` resolves without effect and `coordinationTag` is undefined. */
export function useSessionConfirmation(): {
  readonly confirm: () => Promise<void>
  readonly coordinationTag: string | undefined
}
```

**Semantics**: the confirmation reads `GET /session/status` and broadcasts the snapshot (research D6); it never renews
and never throws to the caller. **Evidence**: V-004 after a form submission in the feature scenarios; no separate
module test, because the module is a context binding without logic.

**Evidence note (reviewer question)**: the root AGENTS.md requires external tests to use the parent's public
interface, while the existing `onsite-visit-state.test.ts` imports a private child. This plan follows AGENTS.md:
`classifySessionActivity`, `decideActivityCommunication`, `flushActivityCommunication`, and `adoptSnapshot` are exported from the entry as the feature's policy
surface, and tests import only the entry. If reviewers prefer not to export them, the alternative is to cover the same
claims only through browser evidence, at higher cost.

### Contract evidence — session coordination

| Claim                                                                                         | Meaningful violation                                                                                                              | Durable evidence                                                                                                                                                                                                                                                                                                                                                                                                                            | Manual/transient evidence                                                                                            | Limitations and non-duplication                                                                |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| B5-W invariants hold for every interaction sequence.                                          | An interaction waits > 60 s; two sends within a window without the deadline condition; a window-opening interaction is coalesced. | **Fast-Check property** over generated interaction times, deadlines, and tab interleavings applied to `decideActivityCommunication` and `flushActivityCommunication`, including stale flush timers that fire after a later communication moved the window: every interaction is covered by a send within 60 s; sends are ≥ 60 s apart unless the deadline was < 60 s away; the first interaction after ≥ 60 s of silence sends immediately. | none                                                                                                                 | Pure policy; browser timers and locks are browser evidence (V-008).                            |
| A record for another tag never delays this session's communication.                           | Stale record coalesces a new session's first interaction.                                                                         | Property: decision with a foreign-tag record equals the decision with no record.                                                                                                                                                                                                                                                                                                                                                            | none                                                                                                                 |                                                                                                |
| Snapshot ordering adopts a newer shortened deadline and rejects a late stale response.        | A policy refresh that shortened the timeout is discarded, or an older response overwrites a newer one.                            | Examples for the pure `adoptSnapshot` ordering (exported with the policy functions): newer server time with earlier deadline is adopted; older server time with later deadline is rejected.                                                                                                                                                                                                                                                 | none                                                                                                                 | Cross-tab delivery is V-004.                                                                   |
| Classification matches research D4.                                                           | Pointer movement, programmatic focus, or untrusted events qualify; a listed kind does not.                                        | Table-driven examples using plain event-shaped objects in the `node` environment (no DOM library): each D4 row, each exclusion, disabled/`inert`/`aria-hidden` targets.                                                                                                                                                                                                                                                                     | Transient browser probe during implementation: real `element.focus()` in a timeout vs Tab focus, logged and removed. | Real DOM event semantics (trusted flags, task boundaries) are browser evidence (V-006, V-007). |
| Concealment removes content from view, focus, and the accessibility tree; logout unmounts it. | Content readable or focusable after concealment.                                                                                  | none durable at module level                                                                                                                                                                                                                                                                                                                                                                                                                | Covered as feature evidence V-011 and V-017 (accessibility tree, notice) rather than duplicated.                     | Feature boundary is the responsible one.                                                       |
| Cross-tab propagation, lock-based single send, resume, and bfcache behavior.                  | A tab misses a renewal or logout; two tabs send for one window.                                                                   | none durable at module level                                                                                                                                                                                                                                                                                                                                                                                                                | Feature evidence V-002–V-004, V-008, V-011, V-013, V-014.                                                            | Requires real browsers and, for most rows, a real session (#158).                              |

### `frontend/src/features/coordination-fixtures.ts`

**Responsibility**: retained protected pages with semantic controls for S3 evidence and later #157/#156 extension.

**Actual consumers**: `src/app/(app)/coordination/roster/page.tsx` and `src/app/(app)/coordination/participant/page.tsx`.

**Proposed signatures**:

```ts
export function RosterFixture(props: {
  readonly action: (previousState: FixtureActionState, formData: FormData) => Promise<FixtureActionState>
}): ReactNode
export function ParticipantFixture(): ReactNode
export type FixtureActionState =
  | { readonly _tag: "Ready" }
  | { readonly _tag: "Recorded"; readonly message: string }
  | { readonly _tag: "Denied"; readonly message: string }
```

**Semantics**: synthetic text only; a link to the other page; button, text input, select, checkbox, textarea; a
"focus later" button that moves focus to an input after 2 seconds (programmatic focus); a Server Action form that
reports Recorded/Denied, submits the observed `coordinationTag` from `useSessionConfirmation()` in a hidden field, and
calls `confirm()` after it settles. The action lives in `src/app/(app)/coordination/actions.ts`, checks
`readSessionRequest`, returns Denied with no effect when the submitted tag differs from `coordination.coordinationTag`,
and otherwise has no effect beyond a short-lived synthetic receipt cookie like the reference operation.

**Evidence**: these are evidence fixtures; their correctness is observed through the feature scenarios that use them.

### Changed: `frontend/src/features/session-reference.ts`

`ReferenceOperation` takes `{ confirm, coordinationTag }` from `useSessionConfirmation()` in
`src/providers/session-confirmation.tsx`, submits the tag in a hidden field, and calls `confirm()` after `action(...)`
settles (success or denial). `runReferenceOperation` returns `Denied` with no effect when the submitted tag differs
from `readSessionRequest(...).coordination?.coordinationTag`. Exports are unchanged. Evidence: V-004 synchronization after a form submission in the feature scenarios.

## Cross-module dependency direction

```text
frontend app zone (route files, (app)/layout.tsx, pages)
  ├─▶ @pathableai/pre-ets-frontend-services (index.ts → next.ts → next/coordination.ts, next/session.ts, next/cookies.ts)
  ├─▶ features/session-coordination.ts ─▶ session-coordination/* (private) ─▶ providers/session-confirmation.tsx
  ├─▶ features/coordination-fixtures.ts ─▶ coordination-fixtures/* ─▶ providers/session-confirmation.tsx
  └─▶ features/session-reference.ts ─▶ session-reference/* ─▶ providers/session-confirmation.tsx
```

`fallow guard` reported that a feature zone may import only itself, `server`, and `shared`, and the `app` zone may
import features. No feature imports another feature: the one cross-feature need, confirmation after a Server Action,
goes through the shared provider module. A server page cannot pass a function to a client component, so a prop from
the `app` zone was rejected. `features/session-coordination` imports only types from frontend-services, so no
server-only code reaches the client bundle. In frontend-services, `next/coordination.ts` imports the `session.ts` and
`tenant.ts` public entries and sibling `next/*` helpers inside the module `next.ts` owns. Implementation runs
`fallow guard` on each new file before writing it.

## Rejected abstractions and alternatives

- A `SessionCoordinationService` Effect service: one consumer per handler, no lifecycle; the handlers compose existing
  services.
- A shared contracts package for the JSON shapes: the frontend already depends on frontend-services and imports types
  only; a package adds publication and boundaries for three interfaces.
- A gate change for activity renewal: research D1.
- Server-side window tracking: research D3.
- A generic event bus in the frontend: the coordinator is the only producer and consumer of its channel.
- A controllable production server clock for tests: research D12.

## Open decisions

### Blocking contract decisions

- None. Spec Authority finding 3 is resolved in the specification (FR-023); finding 1 follows S1's
  precedent (research F-1); finding 2 is planned as application-session logout and flagged (research F-2).

### Implementation choices left to tasks

- Exact header layout and copy of the Log out control and the signed-out notice, within `@pathableai/react`
  components and the accessibility obligations of FR-013 and FR-015.
- The meaningful-input selector list may gain roles that the fixtures need, without admitting pointer movement,
  programmatic focus, or untrusted events.
- Whether the activity timer and confirmation timer share one scheduler in the coordinator.
- Exported-policy versus browser-only evidence for the classifier and window policy (evidence note above).
