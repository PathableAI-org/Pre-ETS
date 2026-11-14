# Module Architecture and Public Contracts: Protect Expired Content and Offer Explicit Accessible Recovery

**Plan**: [plan.md](../plan.md)

**Feature verification**: [verification.md](../verification.md)

**Status**: Planned design. Signatures were checked against the installed Next.js 16.4.5, React 19.3.1 types
(`useActionState(action, initialState, permalink?)`), `next/navigation` (`unauthorized`), and `@pathableai/react`
0.3.0 `Modal` (`open`, `onClose`, `title`, `description`, `footer`, `initialFocusRef`, `closeOnBackdropClick`).
Re-verify them before implementation.

## Module architecture decisions

| Concern                                | Current owner and consumers                                                                                 | Decision                   | Public boundary                                      | Private decomposition                                                                       | Rationale and non-goals                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-observed expiry                 | `frontend-services/src/session.ts`; consumers: gate, session reads, coordination, layout                    | Extend                     | `session.ts` (`NoUsableSession`)                     | None                                                                                        | One optional flag (research D2). No new service, error, or store change.                                                                                                     |
| Denied Server Action response          | `frontend-services/src/next/protection.ts`; consumer: `frontend/src/proxy.ts`                               | Extend                     | `next.ts` → `ProtectionResponses`, `SessionEndCause` | None                                                                                        | The host renders, and the gate owns the status, cache headers, and classification (research D1, D3). No new public path.                                                     |
| Action-level session check             | `frontend/src/app/(app)/session-request.ts`; consumers: reference and roster actions                        | Extend (app-private)       | `admitSubmission` returns the outcome                | None                                                                                        | Lets actions call `unauthorized()` on `no_session` (research D5). `authorizeSessionAction` is unchanged.                                                                     |
| Recovery and expiration copy           | None. `SignedOutNotice` is the stand-in.                                                                    | **Extract** a new feature  | `features/session-recovery.ts`                       | `session-recovery/session-end-notice.tsx`                                                   | Three consumers (gate document, in-place view, modal) need equivalent meaning (FR-020). A shared feature entry prevents copies. The signed-out notice stays in coordination. |
| Host access documents                  | `features/access-responses.ts`; consumers: `proxy.ts`, `forbidden.tsx`, callback route                      | Extend                     | `features/access-responses.ts`                       | `access-responses/presentation.tsx` (existing)                                              | Adds the recovery document and the action-denial body beside the 403 document.                                                                                               |
| Action-denial token                    | None                                                                                                        | New shared constant module | `providers/action-denial.ts`                         | None                                                                                        | Read by the server (host body) and the client (rejection parse). It must not be a client module, following the `coordination-tag-field.ts` precedent.                        |
| Protected action form consumer         | `providers/session-confirmation.tsx`; consumers: `ReferenceOperation`, coordination roster fixture          | Extend, replacing the hook | `providers/session-confirmation.tsx`                 | Private error-boundary class in the same file                                               | Progressive enhancement needs the Server Function in `useActionState` (research D4). One component replaces the hook for both consumers. The old hook is removed.            |
| Tab views, denial, expiry, propagation | `features/session-coordination` (`SessionCoordinator`; private `TabCoordination`, `tab-channel`, endpoints) | Extend privately           | `features/session-coordination.ts` (unchanged)       | `tab-coordination.ts`, `tab-channel.ts`, `session-endpoints.ts`, new `expiration-modal.tsx` | No public signature changes. `SessionCoordinator` keeps its props. The views and the modal are internal to the coordinator (research D6–D10).                                |
| Browser harness facts                  | `shared/browser-tracing.ts`; consumers: coordinator, fixtures, notice                                       | Extend                     | `shared/browser-tracing.ts`                          | `browser-tracing/export-filter.ts` allow-lists                                              | New closed-set states, cause and timing attributes, focus targets, and one fact (contracts/telemetry.md).                                                                    |

No workspace, package, Effect service, Layer, configuration, dependency, or public route is added.

## Public contracts

### `@pathableai/pre-ets-frontend-services` — session classification

**Responsibility**: Session reads and refreshes classify a reference as usable or not.

**Actual consumers**: `protectRequest` (gate) reads `expired` to choose the recovery cause. Other consumers ignore
it.

**Proposed signatures**:

```ts
/** Missing, malformed, expired, and deleted references. No identity or policy. */
export interface NoUsableSession {
  readonly _tag: "NoUsableSession"
  /** Present only when the store returned the record after its deadline had passed (before eviction). */
  readonly expired?: true | undefined
}
```

**Inputs and validation ownership**: Unchanged. The flag derives from the store outcome and the decoded deadline.

**Success semantics and invariants**:

- `expired: true` only for the `Expired` store outcome, or for a decoded record whose deadline is at or before the
  application clock. Never for `missing`, `no_reference`, a malformed reference, or an invalidated record.
- The span outcome annotations are unchanged (`expired`, `missing`, `no_reference`).

**Expected errors**: None new.

**Defects and interruption**: Unchanged.

**Effect environment requirements**: Unchanged (`SessionService`).

**Compatibility and relationships**: Optional and additive. Existing `{ _tag: "NoUsableSession" }` values and
assertions stay valid.

### `@pathableai/pre-ets-frontend-services` — protection gate responses

**Responsibility**: The gate decides protection. The Next host renders presentation.

**Actual consumers**: `packages/frontend/src/proxy.ts`.

**Proposed signatures**:

```ts
/** Why a session is not usable, as far as the server or the tab can tell. */
export type SessionEndCause = "expired" | "unknown"

export interface ProtectionResponses {
  readonly forbiddenDocument: (request: NextRequest) => Promise<NextResponse> // unchanged
  readonly tenantFailure: TenantFailureResponse // unchanged
  /**
   * A denied Server Action candidate submitted as a browser navigation without `next-action` (scripts disabled or
   * not yet running). The body is the accessible recovery document for `cause`. The gate sends it with HTTP 401 and
   * `Cache-Control: private, no-store`, whatever status or cache headers the host sets. Slice A1.
   */
  readonly recoveryDocument: (input: { readonly cause: SessionEndCause }) => Promise<NextResponse>
  /**
   * A denied fetch Server Action (`next-action` present). The body is the host's closed-set `text/plain` token for
   * `cause`. The gate sends it with HTTP 401 and `Cache-Control: private, no-store`. Slice A3.
   */
  readonly actionDenial: (input: { readonly cause: SessionEndCause }) => Promise<NextResponse>
}
```

**Inputs and validation ownership**: The gate classifies the request. `cause` is `expired` exactly when the session
read returned `expired: true`.

**Success semantics and invariants**:

- Every denied Server Action candidate is HTTP 401 with `private, no-store`. No login starts, and no application or
  correlation cookie is set.
- Transport: `next-action` present → `actionDenial`. A candidate without it that is a navigation → `recoveryDocument`.
  Any other candidate, and every non-action application request → empty 401, as today.
- Admission, document-entry redirects, 403, 503, and tenant failures are unchanged.
- `protectRequest` carries T-001 (contracts/telemetry.md).

**Expected errors**: None. A host rejection is a defect, as with `forbiddenDocument`.

**Defects and interruption**: Unchanged.

**Effect environment requirements**: Unchanged. The host callbacks are promises lifted with `Effect.promise`.

**Compatibility and relationships**: Adding required members breaks only `proxy.ts`, which each slice updates.
`recoveryDocument` lands in A1 and `actionDenial` in A3, each with its consumer.

### Frontend — `features/session-recovery.ts` (new)

**Responsibility**: The one source of the session-end explanation and the Log in action.

**Actual consumers**: `access-responses` (gate document, A1), `session-coordination` (in-place recovery, A3; modal,
B).

**Proposed signatures**:

```ts
import type { SessionEndCause } from "@pathableai/pre-ets-frontend-services"

export interface SessionEndCopy {
  readonly explanation: string
  readonly heading: string
  /** Accessible name of the Log in action; identifies signing in again (FR-007). */
  readonly logIn: string
}

export const sessionEndCopy: (cause: SessionEndCause) => SessionEndCopy

/** The fresh-entry boundary every Log in uses (research D11). */
export const LOG_IN_HREF = "/"

/** Server-renderable: heading, explanation, and the Log in link. No hooks. */
export function SessionEndNotice(props: {
  readonly cause: SessionEndCause
  readonly headingProps?: Readonly<{ "data-preets-focus"?: string; tabIndex?: number }> | undefined
  readonly headingRef?: Ref<HTMLHeadingElement> | undefined
  readonly onLogIn?: (() => void) | undefined
}): ReactElement
```

**Success semantics and invariants**:

- `expired` copy states expiration, and `unknown` copy states no cause. Both offer the same Log in action, named
  "Log in again" and linking to `LOG_IN_HREF` (FR-004, FR-020).
- No identity, tenant, session, or token value appears in any copy (FR-025).
- `onLogIn` only observes activation for telemetry (T-005). It never prevents or replaces the navigation.
- A1 lands `sessionEndCopy`, `LOG_IN_HREF`, and `SessionEndNotice({ cause })`. A3 adds `headingProps`, `headingRef`,
  and `onLogIn` with their first consumer, the in-place recovery view.

**Expected errors**: None.

**Compatibility and relationships**: New. Imported only through the entry. `SignedOutNotice` is unchanged.

### Frontend — `features/access-responses.ts`

**Proposed signatures** (additions):

```ts
/** `ProtectionResponses.recoveryDocument`: full HTML document with title, charset, viewport, and `SessionEndNotice`. A1. */
export const recoveryDocumentResponse: ProtectionResponses["recoveryDocument"]
/** `ProtectionResponses.actionDenial`: `text/plain` body `ACTION_DENIAL_BODY[cause]`. A3. */
export const actionDenialResponse: ProtectionResponses["actionDenial"]
```

**Success semantics and invariants**: The document is self-contained (no app stylesheet link, like the 403
document), has one `h1`, and its Log in link is keyboard-reachable with visible focus (library `Link`). The token
body is exactly the closed-set string, with content type `text/plain` and no charset parameter, because Next's
reducer compares the header exactly (research F5).

### Frontend — `providers/action-denial.ts` (new, not a client module)

```ts
import type { SessionEndCause } from "@pathableai/pre-ets-frontend-services"

/** Closed-set rejection bodies; never user-visible copy. */
export const ACTION_DENIAL_BODY: Readonly<Record<SessionEndCause, string>>
/** The gate's cause when `error` is a fetch-action rejection carrying a denial body; otherwise `undefined`. */
export const readActionDenial: (error: unknown) => SessionEndCause | undefined
```

**Invariant**: `readActionDenial` accepts only an `Error` whose `message` exactly equals one of the two bodies.

### Frontend — `providers/session-confirmation.tsx`

**Responsibility**: Protected Server Action forms submit the tab's coordination tag. They work without scripts, and
they hand rejections to the session coordinator.

**Actual consumers**: `ReferenceOperation`, the coordination roster fixture, and `SessionCoordinator` (provider).

**Proposed signatures**:

```ts
export type ProtectedFormAction<State> = (previousState: State, formData: FormData) => Promise<State> // unchanged

/**
 * A progressively enhanced protected action form. Renders `<Form action>` with the Server Function given to
 * `useActionState`, and `CoordinationTagField`. A rejected action is caught. Before A3 it settles as `notPerformed`.
 * From A3 it is offered to the coordinator through `deny`, and settles as `notPerformed` unless recovery took over.
 * The session is confirmed after each settled action.
 */
export function ProtectedActionForm<State>(props: {
  readonly action: ProtectedFormAction<State>
  readonly children: (state: State, pending: boolean) => ReactNode
  readonly initialState: State
  readonly notPerformed: State
}): ReactNode

export function CoordinationTagField(): ReactNode // unchanged

export function SessionConfirmationProvider(props: {
  readonly children: ReactNode
  readonly confirm: () => Promise<void>
  readonly coordinationTag: string
  /** A3. Answers whether the coordinator replaced the tab with recovery content. */
  readonly deny: (cause: SessionEndCause | undefined) => Promise<boolean>
}): ReactNode
```

`useSessionConfirmedActionState` is removed in A2. The `deny` member and prop land in A3. Outside a provider (public
pages), `deny` resolves `false`.

**Semantic invariants**:

- Without scripts, the server-rendered form submits as a form-encoded navigation `POST` that Next decodes as the
  action (research D4 feasibility gate).
- No path retries a rejected action.
- `deny` is called only for a rejection, never for a resolved `Denied` state.

### Frontend — `app/(app)/session-request.ts` (app-private)

```ts
export const admitSubmission: (formData: FormData) => Promise<AuthorizedSessionAction["_tag"]>
```

The actions perform their effect only on `Authorized`. They call `unauthorized()` on `NoUsableSession` (research D5)
and keep the `Denied` state on `SessionChanged`. The tags are the installed `AuthorizedSessionAction` tags
(`Authorized`, `NoUsableSession`, `SessionChanged`).

### Frontend — `shared/browser-tracing.ts`

```ts
export type UiState =
  | /* existing */ "content_shown" |
  "content_concealed" |
  "logging_out" |
  "logging_out_concealed" |
  "logout_failed" |
  "signed_out"
  | "recovery_expired" |
  "recovery_unavailable" // A3
  | "expired" // B

export type FocusTarget =
  /* existing */ "logout_control" |
  "participant_goal" |
  "signed_out_heading"
  | "recovery_heading" // A3
  | "expiration_log_in" // B

export type TransitionCause = "action_denied" /* A3 */ | "deadline" | "peer" | "resume" /* B */

export type LoginEntry = "action_recovery" /* A3 */ | "expiration_modal" /* B */

/** T-002/T-003. `cause` and `timing` are optional; existing callers are unchanged. */
export const recordUiTransition: (
  from: UiState | undefined,
  to: UiState,
  detail?: {
    readonly cause?: TransitionCause | undefined
    readonly timing?: { readonly deadlineMs: number; readonly serverTimeMs: number } | undefined
  } | undefined
) => TraceScope

/** T-005. Root fact recorded synchronously on Log in activation, before navigation. */
export const recordLoginActivation: (entry: LoginEntry) => void
```

Every new span name and attribute key is added to `export-filter.ts` in the slice that first emits it.

### Contract evidence

| Claim                                                                                                | Meaningful violation                                                  | Durable evidence                                                                                                                  | Manual/transient evidence                       | Limitations and non-duplication                                                       |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| `expired: true` exactly for a store `Expired` outcome or a decoded past-deadline record (A1)         | Flag on `missing`, or absent on a past-deadline decode                | `tests/lib/session.test.ts` with `TestClock`: an expired-before-eviction example, a missing example, and a no-reference example   | —                                               | The eviction race itself is real-Redis timing. Not repeated in integration tests.     |
| Every denied Server Action candidate is 401 `private, no-store` with no login, by transport (A1, A3) | 200, redirect, cacheable, cookie set, or wrong transport chosen       | `tests/unit/protection.test.ts`: candidate × header × Fetch Metadata table; host returning another status is re-wrapped to 401    | —                                               | HTTP and browser evidence is feature BDD (quickstart §A1, §A3).                       |
| `cause` is `expired` only when the read reported `expired` (A1)                                      | `expired` for a removed record                                        | `tests/unit/protection.test.ts` examples with a stubbed `SessionService`                                                          | —                                               | —                                                                                     |
| Recovery document and token bodies are exact and free of protected values (A1, A3)                   | Missing `h1` or Log in; charset on the token; identity text           | `packages/frontend/tests/unit/proxy.test.ts` renders both responses                                                               | —                                               | Visual focus is browser evidence.                                                     |
| `readActionDenial` accepts only the two exact bodies (A3)                                            | A generic error parsed as a denial                                    | Unit examples in `packages/frontend/tests/unit/session-coordination.test.ts`                                                      | —                                               | —                                                                                     |
| Actions call `unauthorized()` on `NoUsableSession` and perform no effect (A2)                        | Receipt cookie set, or 200 `Denied` on `NoUsableSession`              | `packages/frontend/tests/unit/reference-session-enforcement.test.ts`                                                              | —                                               | MPA race limitation L-3.                                                              |
| `ProtectedActionForm` renders progressive-enhancement fields and catches rejections (A2)             | `javascript:` form action; unhandled rejection; retry                 | Feature BDD with scripts disabled (§A2) and the A2 production-build feasibility check (research D4)                               | Build-output inspection in the feasibility task | A unit test under jsdom would not run Next's action encoding, so it adds no evidence. |
| Recovery view: unmounts content, writes no ended record, sends no message, uses the D7 cause (A3)    | Content still mounted; peer tab ends; wrong cause                     | `session-coordination.test.ts` controller examples with fake timers, `Date` headers, and a storage spy                            | —                                               | Visible and accessible facts are browser evidence.                                    |
| Expired view: known-expiration predicate, propagation by record cause, logout precedence (B)         | Expired while valid; signed-out instead of modal; modal over a logout | `session-coordination.test.ts` examples. A Fast-Check property over (deadline, server time, logout observed) for the D7 predicate | —                                               | Timing within 2 s is feature evidence (§B).                                           |
| Ended record compatibility: missing `cause` reads as `ended` (B)                                     | Old record read as `expired`                                          | `session-coordination.test.ts` example                                                                                            | —                                               | —                                                                                     |
| Copy equivalence and no protected values (A1, B)                                                     | Different meaning; unknown claims expiry                              | Feature comparison (§B step "compare") and V-018 in quickstart                                                                    | —                                               | Strings alone do not establish FR-020. Browser comparison does.                       |

## Cross-module dependency direction

`proxy.ts` → `features/access-responses.ts` → `features/session-recovery.ts` and `providers/action-denial.ts`.
`features/session-coordination` → `features/session-recovery.ts`, `providers/session-confirmation.tsx`, and
`shared/browser-tracing.ts`. `features/session-reference` and `features/coordination-fixtures` →
`providers/session-confirmation.tsx`. `providers/session-confirmation.tsx` → `providers/action-denial.ts` (shared →
shared). The frontend imports only _types_ from frontend-services in client modules. frontend-services never
imports the frontend. Only each parent imports its children.

## Rejected abstractions and alternatives

- A public recovery route: rejected by the maintainer in favor of in-place recovery (research D6).
- A required `cause` on `NoUsableSession`: a ripple with no consumer benefit (research D2).
- A local blocking dialog: the maintainer chose the library `Modal` with the gap tracked (research D8).
- A status-endpoint body carrying a cause: the server cannot tell after eviction. The `Date` header gives the server
  time that D7 needs without a contract change.
- A separate expiration feature module: the modal is a coordinator view, and splitting it out would expose
  coordinator state.

## Open decisions

### Blocking contract decisions

- None. The four open choices were decided by the maintainer on 2026-11-13 (research D3, D6, D8, D14).

### Implementation choices left to tasks

- Error-boundary reset strategy after a caught rejection (remount key versus state reset).
- How the coordinator reads the `Date` header (an added field on the `Ended` outcome of `readSessionStatus`).
- Exact BDD step wording and fixture helpers within the scenarios planned in quickstart.
