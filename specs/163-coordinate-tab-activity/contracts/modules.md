# Module Architecture and Public Contracts: Coordinate Intentional Activity and Logout Across Session-Sharing Tabs

**Plan**: [plan.md](../plan.md)

**Feature verification**: [verification.md](../verification.md)

**Status**: Planned design — Next.js 16.4.5, React 19.3.1, Effect 4.1.2, `@pathableai/react` 0.3.0, and Playwright
1.65.0 facts checked against installed declarations (see [research.md](../research.md#installed-dependency-facts)).
Signatures are re-verified when implementation starts.

## Module architecture decisions

| Concern                                        | Current owner and consumers                                                                            | Decision                                                                                                                                                                                                                                | Public boundary                                   | Private decomposition                                                                                                                                                                                                           | Rationale and non-goals                                                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session lifecycle operations                   | `frontend-services/src/session.ts` (`SessionService`); consumers: gate, `readSessionRequest`, callback | **Extend additively**: `UsableSession` gains `observedAtEpochMilliseconds`, the Redis `TIME` returned by the existing atomic read/refresh store script (research D6, R13). No operation, record field, or key change.                   | `src/session.ts`                                  | `session/store.ts` script returns `TIME` with each transition                                                                                                                                                                   | Ordering snapshots needs an authoritative observation order; the store transition is the only place it exists.                                                                                                        |
| Default protection gate                        | `frontend-services/src/next/protection.ts`; consumer: `frontend/src/proxy.ts`                          | **Extend** the private classifier with one closed set: the three endpoint paths are protected application requests that never renew (research D1, R5). **Change** renewal responses to set no cookie (research D15, R12).               | `src/next.ts` (signature unchanged)               | `next/protection.ts` gains `NON_RENEWING_PATHS`; `admit` no longer calls `setSessionCookie`                                                                                                                                     | Without these, a crafted action header renews before the tag check, and a delayed renewal response overwrites a later session's cookie. Designation and outcome statuses are unchanged.                               |
| Session establishment cookie                   | `next/callback.ts` (`setSessionCookie` with `Max-Age`)                                                 | **Change**: issue `pathable-session` without `Max-Age` (browser-session cookie); the callback is the only writer (research D15).                                                                                                        | `src/next.ts` (signature unchanged)               | `next/cookies.ts` `setSessionCookie` loses its `maxAgeSeconds` parameter                                                                                                                                                        | No later response may write the cookie, so its lifetime cannot track renewals.                                                                                                                                        |
| HTTP adapters for activity, status, and logout | none                                                                                                   | **Extend** the Next host-adapter module with three handler factories and two private children.                                                                                                                                          | `src/next.ts`, re-exported from `src/index.ts`    | NEW `next/coordination.ts` (in-page activity schema, same-origin check, three programs); NEW leaf `next/coordination-snapshot.ts` (tag derivation and snapshot construction; imports only `session.ts` types and `node:crypto`) | One owner for Next host adapters already exists. The leaf child keeps `next/session.ts` from importing the handler module, which would close the cycle `session.ts → coordination.ts → cookies.ts → session.ts` (R1). |
| Snapshot for server-rendered protected pages   | `next/session.ts` (`readSessionRequest`); consumers: `(app)/page.tsx`, `(app)/actions.ts`              | **Extend** `ResolvedSessionRequest` with an additive `coordination` field.                                                                                                                                                              | `src/next.ts`                                     | `next/session.ts` calls the leaf `next/coordination-snapshot.ts` only                                                                                                                                                           | The layout needs the same tenant-resolved read the page performs; protected actions use the same field for their tag check (R2).                                                                                      |
| Browser coordination, logout UI, concealment   | none                                                                                                   | **Add** one feature entry.                                                                                                                                                                                                              | `frontend/src/features/session-coordination.ts`   | `activity-classification.ts`, `activity-window.ts`, `snapshot-order.ts`, `session-endpoints.ts`, `tab-channel.ts`, `coordinator.tsx`, `logout-control.tsx`, `signed-out-notice.tsx`                                             | One cohesive client concern with one composition point (`(app)/layout.tsx`). Splitting into several features would create cross-feature imports Bulletproof forbids and no independent consumers.                     |
| Cross-feature session confirmation             | none                                                                                                   | **Add** one shared provider module, because three features need it and Bulletproof forbids feature-to-feature imports.                                                                                                                  | `frontend/src/providers/session-confirmation.tsx` | none (single file)                                                                                                                                                                                                              | Shared zone (`src/providers/**`) is importable by every feature. It holds only a React context and its hook; the coordinator supplies the value.                                                                      |
| Protected multi-page fixtures                  | none (`/_test/onsite` is public)                                                                       | **Add** one feature entry and two protected pages.                                                                                                                                                                                      | `frontend/src/features/coordination-fixtures.ts`  | `roster.tsx`, `participant.tsx`, `fixture-action-form.tsx`                                                                                                                                                                      | Research D11. Retained for #157/#156; synthetic only.                                                                                                                                                                 |
| Reference Server Action consumer               | `features/session-reference`; consumer: `(app)/page.tsx`                                               | **Extend behavior**: send the observed tag (from the shared provider) in a hidden field, have `runReferenceOperation` call `authorizeSessionAction` (tag check, then renewal), and confirm after the action settles. Exports unchanged. | `features/session-reference.ts`                   | `reference-operation.tsx`; `(app)/actions.ts`                                                                                                                                                                                   | Research D2 (R2) and D6.                                                                                                                                                                                              |
| History restoration                            | `features/history-protection` (`RestoredPageGuard`); consumer: root layout                             | **Preserve.** It remains the only owner of bfcache reload. Concealment before caching is the coordinator's `pagehide` handler.                                                                                                          | `features/history-protection.ts`                  | unchanged                                                                                                                                                                                                                       | Research D9. Moving reload into the coordinator would leave public pages without the guard.                                                                                                                           |
| Protected route-group layout                   | `(app)/layout.tsx` returns children                                                                    | **Extend**: read the session snapshot and render `SessionCoordinator` around children.                                                                                                                                                  | Next convention file                              | none                                                                                                                                                                                                                            | The route group is the existing boundary of protected pages.                                                                                                                                                          |
| Route files for the endpoints                  | none                                                                                                   | **Add** `app/session/activity/route.ts`, `app/session/status/route.ts`, `app/auth/logout/route.ts`.                                                                                                                                     | Next convention files                             | none                                                                                                                                                                                                                            | Thin wiring only, as `app/auth/login/route.ts` does. No Effect in the Next app.                                                                                                                                       |
| Requirements BDD support                       | `tests/bdd/support/*`                                                                                  | **Extend** with multi-tab/context helpers, a context clock, and an authoritative-deadline reader over `GET /session/status`.                                                                                                            | `tests/bdd/support`                               | `browser.ts`, `fixtures.ts`                                                                                                                                                                                                     | Research D12. Root tooling, not an Effect workspace.                                                                                                                                                                  |

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
  /** Redis `TIME` of the atomic store transition that produced this state; diagnostic only, never ordering. */
  readonly observedAtEpochMilliseconds: number
  /** Stored record revision: incremented on every store write; tabs adopt only a higher revision (research D6). */
  readonly revision: number
  /** Application clock when the response was built; used only to convert the deadline to the tab's clock. */
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
  /** Server-clock epoch ms after which the handler refuses this attempt with 408 and no store write (research D8). */
  readonly notAfter: number
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

| Handler  | Precondition failure                                                                                                | Session outcome (after tenant resolution)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity | Not same-origin → 403; not JSON → 415; body fails decode → 400                                                      | Tag ≠ cookie's tag → 409, no store write. Usable → `refreshForTenant` with the decoded kind and effective policy → 200 `SessionCoordinationSnapshot`; no `Set-Cookie` (research D15). No usable session → 401. Mismatch → 403. Undeterminable → 503.                                                                                                                                                                                                                                                                            |
| Status   | none (gate already admitted a same-tenant session)                                                                  | `readForTenant` only, never renews. Usable → 200 snapshot (current tag). No usable session → 401. Mismatch → 403. Undeterminable → 503.                                                                                                                                                                                                                                                                                                                                                                                         |
| Logout   | Not same-origin → 403; not JSON → 415; body fails decode → 400; received after `notAfter` → 408, no store operation | No usable session → 401. Tag ≠ cookie's tag → 409, nothing invalidated. Tag matches → `invalidate({ reference, notAfterEpochMilliseconds: notAfter })` → 204 if the store deleted the record; `InvalidationExpired` (the store's Redis `TIME` passed `notAfter`) → 408 with nothing deleted. **No logout response sets or clears a cookie** (R10): a delayed response must not delete a later session's cookie, and the remaining reference names a removed record, so it grants nothing. Mismatch → 403. Undeterminable → 503. |

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
`serverTimeEpochMilliseconds`. Programs are `Effect.fn("sessionActivity")`,
`Effect.fn("sessionStatus")`, and `Effect.fn("logout")`; helpers are `Effect.fnUntraced`. Spans carry no tag,
reference, identity, or host attribute beyond what existing spans record.

**Compatibility and relationships**: additive exports; `ResolvedSessionRequest` gains one field, so existing consumers
compile unchanged. The gate's public designation and outcome matrix are untouched; its private classifier never renews
on the three endpoint paths (research D1). Protected Server Actions compare a submitted `coordinationTag` field with
`coordination.coordinationTag` and return a denial with no effect on mismatch (research D2). `#156` will add `continue-session`
handling and warning fields to the snapshot; `#157` consumes 401 from status for expiration presentation.

### Contract evidence — frontend-services adapters

| Claim                                                                                                                     | Meaningful violation                                                                                                                                            | Durable evidence                                                                                                                                                                                                                                                                                                                                                                                                                                 | Manual/transient evidence | Limitations and non-duplication                                                          |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------- |
| A tag mismatch never writes to the store, for activity and logout.                                                        | Stale tab renews or ends a later session.                                                                                                                       | **Fast-Check property** in `tests/unit/coordination.test.ts` through `src/next.ts`: for generated references, tags, kinds, and bodies, with a recording `SessionService` test Layer, the handler writes iff the body tag equals the cookie's derived tag and the request is same-origin JSON.                                                                                                                                                    | none                      | Unit Layer, not Redis; real-store behavior is the integration row.                       |
| Activity renews on receipt and returns the authoritative deadline and policy.                                             | Response deadline differs from the stored one, or activity does not renew.                                                                                      | **Integration** `tests/integration/coordination-redis.test.ts` with owned prefixes: establish, call the activity handler, compare the response snapshot with the stored record.                                                                                                                                                                                                                                                                  | none                      | Real store; no browser.                                                                  |
| Activity after expiry or after logout does not revive access.                                                             | Late activity yields 200 or a stored record.                                                                                                                    | Same integration suite: invalidate or let a 1-second test-policy session expire, then call activity → 401, record absent.                                                                                                                                                                                                                                                                                                                        | none                      | Reuses S2 no-revival evidence for the store script; this row covers the handler mapping. |
| Logout ends the session; 204 only after removal; no logout response touches the cookie.                                   | 204 while the record exists, or a logout response that could delete a later session's cookie.                                                                   | Integration: logout → 204, record absent, no `Set-Cookie`; with the store stopped (existing outage helper) → 503, no `Set-Cookie`. Feature evidence V-012 covers the ordering race (S1 logout response delayed until S2 login completes; S2 stays usable).                                                                                                                                                                                       | none                      |                                                                                          |
| A late logout attempt never invalidates, even when admitted before the cutoff; a 503 does not prove the session survives. | A logout received after `notAfter`, or admitted before it and paused past it, removes the record; or the client treats a 503 after an applied `DEL` as failure. | Unit: `notAfter` in the past → 408 with no call. Integration: store-script cutoff on real Redis (cutoff before `TIME` → `InvalidationExpired`, record kept; after → deleted); a handler paused between admission and `invalidate` past the cutoff (test hook in the integration Layer) → 408, record kept; a reply failure after `DEL` applies (existing S2 helper) → 503 with the record absent.                                                | none                      |                                                                                          |
| Status never renews.                                                                                                      | A status read moves the deadline.                                                                                                                               | Integration: status twice across a clock step; stored deadline unchanged.                                                                                                                                                                                                                                                                                                                                                                        | none                      |                                                                                          |
| Same-origin and content-type enforcement precede any session operation.                                                   | Cross-site POST renews or logs out.                                                                                                                             | Unit examples: `sec-fetch-site: cross-site`, `same-site`, absent with foreign `Origin`, absent with matching `Origin`, `text/plain` body; recording Layer shows no call.                                                                                                                                                                                                                                                                         | none                      |                                                                                          |
| The tag reveals no reference or store key and is stable per reference.                                                    | Tag equals the store key digest, or varies for one reference.                                                                                                   | Unit property: tag is deterministic per reference, differs across references, and never equals the SHA-256 store-key digest of the same reference.                                                                                                                                                                                                                                                                                               | none                      | Cryptographic one-wayness is a property of SHA-256, not tested.                          |
| `coordination` is present iff the session is usable; no reference or identity in the snapshot.                            | Snapshot for `NoUsableSession`, or snapshot containing the reference.                                                                                           | Unit examples through `readSessionRequest` with a test runtime (existing `reference-session-enforcement.test.ts` pattern).                                                                                                                                                                                                                                                                                                                       | none                      |                                                                                          |
| The gate never renews on the endpoint paths, whatever the request shape.                                                  | A `POST` with `next-action`, or a navigation `GET`, to an endpoint moves the deadline before the handler refuses it.                                            | **Fast-Check property** in the existing `tests/unit/protection.test.ts`: for generated methods, Fetch Metadata, and `next-action` presence on the three paths, the classifier yields a protected application request without renewal. **Composed integration** in `coordination-redis.test.ts`: gate then handler on real Redis, for a stale-tag activity with `next-action` and a navigation `GET` to status; the stored deadline is unchanged. | none                      |                                                                                          |
| `readSessionRequest` does not depend on the handler module.                                                               | An import cycle through `next/coordination.ts`.                                                                                                                 | `pnpm --filter @pathableai/pre-ets-frontend-services exec fallow dead-code` and the repository cycle gate in `pnpm check:changes`.                                                                                                                                                                                                                                                                                                               | none                      | Structural; no runtime test.                                                             |
| Tenant failure, mismatch, and outage map to stable statuses.                                                              | Mismatch answers 200, or outage answers 401.                                                                                                                    | Unit table over the recording Layer; integration outage row above.                                                                                                                                                                                                                                                                                                                                                                               | none                      | Gate-level mapping is S1's existing evidence; not repeated.                              |

### Changed: `@pathableai/pre-ets-frontend-services` session service (`src/session.ts`), stored record, and gate behavior

```ts
export interface UsableSession {
  readonly _tag: "UsableSession"
  readonly identity: SessionIdentity
  readonly idleDeadlineEpochMilliseconds: number
  /** NEW: Redis `TIME` (ms) read inside the atomic store transition that returned this state. Diagnostic. */
  readonly observedAtEpochMilliseconds: number
  /** NEW: stored record revision. 1 at establishment; +1 on every store write of the record. */
  readonly revision: number
  readonly tenantAlias: TenantAlias
  readonly warningLeadMinutes: number
}
```

The stored record becomes schema version 2 with an integer `revision` (user decision 2026-11-10, research D6, R16).
`establish` writes revision 1. The read/refresh Lua script increments `revision` in the same `SET` that renews the
deadline or adopts policy, validates it like the other fields, and adds `redis.call("TIME")` to its reply. A version-1
record decodes as revision 0 and is written back as version 2 on its next write; the script accepts both versions.
Reads and excluded-activity refreshes return the stored revision unchanged. Both fields are additive on
`UsableSession`; every existing consumer compiles unchanged.

The gate's `admit` sets no cookie, and `setSessionCookie(response, request, reference)` drops its `maxAgeSeconds`
parameter, with the callback as its only caller (research D15). The gate **no longer renews Server Actions**: a `POST`
with `next-action` is a protected application request that only reads (research D2, R17). Document entries still
renew as `deliberate-page-request`.

New Next host adapter for protected Server Actions (exported from `src/next.ts` and `src/index.ts`):

```ts
export interface AuthorizeSessionActionInput {
  readonly coordinationTag: string | undefined
  readonly host: string
  readonly reference?: string | undefined
}

export type AuthorizedSessionAction =
  | { readonly _tag: "Authorized"; readonly session: UsableSession; readonly tenantAlias: TenantAlias }
  | { readonly _tag: "NoUsableSession" }
  | { readonly _tag: "SessionChanged" }

/**
 * Resolves the tenant, compares the submitted tag with the cookie's tag, and only on a match renews as
 * `deliberate-form-submission` with the tenant's effective policy. Mismatch or a missing tag → `SessionChanged`, no
 * store write. Tenant failure renders the tenant page, tenant mismatch calls `forbidden()`, and an unavailable store
 * throws, as `readSessionRequest` does.
 */
export const authorizeSessionAction: (input: AuthorizeSessionActionInput) => Promise<AuthorizedSessionAction>
```

Changed: `invalidate` gains an optional cutoff, enforced atomically with the delete in a store script (research D8, R27):

```ts
readonly invalidate: (input: {
  readonly reference?: string | undefined
  /** When present, delete only if Redis `TIME` ≤ this value; otherwise delete nothing. */
  readonly notAfterEpochMilliseconds?: number | undefined
}) => Effect.Effect<NoUsableSession | InvalidationExpired, SessionServiceUnavailable>

export interface InvalidationExpired {
  readonly _tag: "InvalidationExpired"
}
```

Without a cutoff the behavior is unchanged. `InvalidationExpired` is a success variant, because a late attempt is an
expected outcome, not a failure.

Consumers: `(app)/actions.ts` (`runReferenceOperation`) and `(app)/coordination/actions.ts`. They return `Denied` with no
effect unless the result is `Authorized`.

| Claim                                                                                                      | Meaningful violation                                                                                          | Durable evidence                                                                                                                                                                                                                                                                                              | Manual/transient evidence | Limitations and non-duplication                                |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------- |
| `revision` increases by exactly one on every store write and is unchanged by reads and excluded refreshes. | Two different stored states share a revision, or a read reports a higher revision than the state it observed. | Integration in the existing `session-redis.test.ts`: interleaved reads, excluded refreshes, qualifying refreshes, and a policy-shortening refresh; a version-1 record is read as revision 0 and written back as version 2. Store-script property: revision is strictly monotonic across writes of one record. | none                      | Revision is per record; different sessions are never compared. |
| `authorizeSessionAction` never writes for a mismatched or missing tag, and renews only after a match.      | A stale document's submission renews a later session.                                                         | **Fast-Check property** with a recording `SessionService` Layer: renewal is called iff the submitted tag equals the cookie's derived tag. **Integration**: real Redis, stale tag → `SessionChanged`, revision and deadline unchanged.                                                                         | none                      |                                                                |
| The gate never renews a Server Action.                                                                     | A `POST` with `next-action` moves the deadline at the gate.                                                   | Property in `protection.test.ts`: action requests classify without renewal.                                                                                                                                                                                                                                   | none                      | Replaces S1's action-renewal examples.                         |
| No response after establishment sets `pathable-session`.                                                   | A renewal or logout response carries `Set-Cookie` for the session cookie.                                     | Property in `protection.test.ts` over generated protected requests (no `Set-Cookie` on any outcome); examples for activity and logout handlers; callback example shows no `Max-Age`.                                                                                                                          | none                      | Replaces S1's cookie re-issue examples.                        |

### `frontend/src/features/session-coordination.ts`

**Responsibility**: the tab's participation in its session: activity classification and B5-W communication,
cross-tab synchronization, local-deadline confirmation, resume handling, logout, concealment, and the signed-out
notice.

**Actual consumers**:

- `src/app/(app)/layout.tsx` — renders `SessionCoordinator` around every protected page.
- `packages/frontend/tests/unit/session-coordination.test.ts` imports the private policy modules directly (see the
  evidence note).

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
```

The entry exports only `SessionCoordinator`. The pure policy functions below are **private** to the feature (not
exported from the entry); their signatures are listed because the unit tests import them directly (evidence note).

```ts
// session-coordination/snapshot-order.ts (private)
/** Adopt when `next.revision` is higher than `held`'s, for the same tag (research D6). */
export function adoptSnapshot(
  held: SessionCoordinationSnapshot | undefined,
  next: SessionCoordinationSnapshot
): boolean

// session-coordination/activity-classification.ts (private)
/** Pure classification of one DOM event (research D4). */
export function classifySessionActivity(
  event: Event,
  context: { readonly gestureInCurrentTask: boolean }
): InPageSessionActivity | undefined

// session-coordination/activity-window.ts (private). One record per tag, at `preets-session-activity:v1:<tag>`.
export interface ActivityWindowRecord {
  readonly lastCommunicatedAt: number | undefined
  readonly pendingSince: number | undefined
}

export type ActivityWindowDecision =
  | { readonly _tag: "SendNow"; readonly record: ActivityWindowRecord }
  | { readonly _tag: "Coalesce"; readonly record: ActivityWindowRecord; readonly sendAt: number }

/** Pure B5-W decision (research D5). Times are local epoch milliseconds. */
export function decideActivityCommunication(
  record: ActivityWindowRecord | undefined,
  input: { readonly deadline: number; readonly now: number }
): ActivityWindowDecision

export type ActivityFlushDecision =
  | { readonly _tag: "Send"; readonly record: ActivityWindowRecord }
  | { readonly _tag: "Reschedule"; readonly sendAt: number }
  | { readonly _tag: "Nothing" }

/** Window-end flush under the lock on this tag's record: sends only with pending activity once the window is due. */
export function flushActivityCommunication(
  record: ActivityWindowRecord | undefined,
  input: { readonly now: number }
): ActivityFlushDecision
```

**Inputs and validation ownership**: server snapshots arrive as props (trusted server render) or as JSON from the
three endpoints; `session-endpoints.ts` narrows JSON with ordinary TypeScript checks (this workspace does not use
Effect) and treats any unexpected shape as undeterminable. Channel messages and the storage record are narrowed the
same way and ignored when malformed or for another tag.

**Success semantics and invariants**:

- Only classified trusted events on meaningful inputs inside the protected content are communicated (FR-004, FR-005).
  Gestures are observed at document capture so focus entering the content by keyboard qualifies (research D4).
- A submission proceeds in `Active` or `Confirming` when the current-session hint equals the tab's tag; otherwise it is
  held, the tab confirms, and the submission is replayed once, with a one-shot pass, if the tab's session is confirmed
  current; storage failure cannot cause a replay loop (research D2).
- A mismatching current-session hint never ends a tab on its own; only a server-confirmed 401 or different tag does.
- No response after establishment sets `pathable-session` (research D15).
- A snapshot is adopted only when its revision is higher than the held snapshot's, even if its deadline is earlier;
  equal revisions are ignored (research D6).
- A tab reads and writes only its own tag's activity-window record (research D5).
- A logout response is ended (204), no longer in force (401, 409), refused (any other 4xx), or ambiguous (every 5xx, 408,
  network failure, timeout). An ambiguous attempt keeps every tab of the tag under confirmation until it resolves;
  `logout-failed` follows a refusal or a usable status whose Redis `observedAtEpochMilliseconds` is later than
  `notAfter` (research D8, R31). Pending attempts are stored one key per attempt (R30).
- In the storage-unavailable fallback, a received communication clears own pending activity it covers (R32).
- With storage or locks unavailable, the window is kept in memory and shared over the channel (research D5).
- A tag recorded as ended is applied when the coordinator mounts, before the snapshot is trusted, and on every resume
  (research D14). Before mount, nothing conceals server-rendered content (acknowledged gap G1).
- Deadlines are held on the server clock and converted with a per-tab offset from request timing; snapshot age never
  extends the local deadline, and any response may recalibrate the offset (research D6).
- The header element carries `data-session-deadline` (held local deadline) and `data-session-warning-lead`, so
  evidence can observe the held deadline and policy (V-004); they hold no protected content.
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

**Evidence note (decided 2026-11-10)**: the user accepted an exception to the root AGENTS.md rule that external tests
use only a parent's public interface, following the existing `onsite-visit-state.test.ts` precedent. The unit tests
import the private policy modules (`activity-classification.ts`, `activity-window.ts`, `snapshot-order.ts`) directly.
The policy functions are not exported from the feature entry, which exports only `SessionCoordinator`.

### Contract evidence — session coordination

| Claim                                                                                                                         | Meaningful violation                                                                                                                                                           | Durable evidence                                                                                                                                                                                                                                                                                                                                                                                                                            | Manual/transient evidence                                                                                            | Limitations and non-duplication                                                                |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| B5-W invariants hold for every interaction sequence.                                                                          | An interaction waits > 60 s; two sends within a window without the deadline condition; a window-opening interaction is coalesced.                                              | **Fast-Check property** over generated interaction times, deadlines, and tab interleavings applied to `decideActivityCommunication` and `flushActivityCommunication`, including stale flush timers that fire after a later communication moved the window: every interaction is covered by a send within 60 s; sends are ≥ 60 s apart unless the deadline was < 60 s away; the first interaction after ≥ 60 s of silence sends immediately. | none                                                                                                                 | Pure policy; browser timers and locks are browser evidence (V-008).                            |
| Another session's window state never affects this session's communication.                                                    | A stale tab's write erases this session's pending activity or opens its window.                                                                                                | Property over mixed-session interleavings: two tags write their own keys in any order; each tag's sends equal those of the same tag run alone.                                                                                                                                                                                                                                                                                              | none                                                                                                                 |                                                                                                |
| Snapshot ordering adopts a newer shortened deadline and rejects a late stale response.                                        | A policy refresh that shortened the timeout is discarded, a read that observed the record before a concurrent renewal overwrites it, or equal timestamps drop a changed state. | Examples for the private `adoptSnapshot`: higher revision with an earlier deadline is adopted; lower revision with a later deadline, later `observedAt`, or later `serverTime` is rejected; equal `observedAt` with different revisions is ordered by revision in both arrival orders. **Integration**: overlapping status read and activity renewal on real Redis; the renewal's revision is higher whenever its write follows the read.   | none                                                                                                                 | Cross-tab delivery is V-004.                                                                   |
| Clock conversion excludes snapshot age and converges across tabs.                                                             | A snapshot rendered or delivered late yields a later local deadline, and tabs holding the same revision keep different deadlines.                                              | Examples for the private offset estimator: a response delayed by 20 s yields the same local deadline as a prompt one, within half the round trip; an equal-revision response with a smaller round trip recalibrates the offset; broadcast server-clock deadlines convert consistently in two tabs.                                                                                                                                          | none                                                                                                                 | Browser clock behavior under Playwright's clock is feature evidence (V-004).                   |
| The submit guard replays a held submission when the tab's session is confirmed current, and never ends a tab on a stale hint. | A legitimate submission is lost while confirming, or a stale document's hint ends valid tabs.                                                                                  | none durable at module level                                                                                                                                                                                                                                                                                                                                                                                                                | Feature evidence V-003 and V-012 (stale-document hint case).                                                         | Browser behavior.                                                                              |
| Classification matches research D4.                                                                                           | Pointer movement, programmatic focus, or untrusted events qualify; a listed kind does not.                                                                                     | Table-driven examples using plain event-shaped objects in the `node` environment (no DOM library): each D4 row, each exclusion, disabled/`inert`/`aria-hidden` targets.                                                                                                                                                                                                                                                                     | Transient browser probe during implementation: real `element.focus()` in a timeout vs Tab focus, logged and removed. | Real DOM event semantics (trusted flags, task boundaries) are browser evidence (V-006, V-007). |
| Concealment removes content from view, focus, and the accessibility tree; logout unmounts it.                                 | Content readable or focusable after concealment.                                                                                                                               | none durable at module level                                                                                                                                                                                                                                                                                                                                                                                                                | Covered as feature evidence V-011 and V-017 (accessibility tree, notice) rather than duplicated.                     | Feature boundary is the responsible one.                                                       |
| Cross-tab propagation, lock-based single send, resume, and bfcache behavior.                                                  | A tab misses a renewal or logout; two tabs send for one window.                                                                                                                | none durable at module level                                                                                                                                                                                                                                                                                                                                                                                                                | Feature evidence V-002–V-004, V-008, V-011, V-013, V-014.                                                            | Requires real browsers and, for most rows, a real session (#158).                              |

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
calls `confirm()` after it settles. The action lives in `src/app/(app)/coordination/actions.ts`, calls
`authorizeSessionAction` with the submitted tag, returns Denied with no effect unless it is `Authorized`, and otherwise has no effect beyond a short-lived synthetic receipt cookie like the reference operation.

**Evidence**: these are evidence fixtures; their correctness is observed through the feature scenarios that use them.

### Changed: `frontend/src/features/session-reference.ts`

`ReferenceOperation` takes `{ confirm, coordinationTag }` from `useSessionConfirmation()` in
`src/providers/session-confirmation.tsx`, submits the tag in a hidden field, and calls `confirm()` after `action(...)`
settles (success or denial). `runReferenceOperation` calls `authorizeSessionAction` with the submitted tag and returns
`Denied` with no effect unless the result is `Authorized`. Exports are unchanged. Evidence: V-004 synchronization after a form submission in the feature scenarios.

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
