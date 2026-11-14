# Research: Protect Expired Content and Offer Explicit Accessible Recovery

**Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md) | **Verification**: [verification.md](verification.md)

Current implementation facts were read at `8ab3e692ba58c07a7ef70eec078f93b83fed67e8` (spec branch base). Framework
behavior was read from the installed Next.js 16.4.5, React 19.3.1, and `@pathableai/react` 0.3.0. Decisions marked
**maintainer** were chosen by the maintainer in the planning session on 2026-11-13. The others are engineering
choices that the specification, constitution, and existing code leave to planning.

## Current facts

- **F1 — Gate denial.** `createProtectionProxy` (`packages/frontend-services/src/next/protection.ts`) classifies any
  form-encoded `POST` or `next-action` request as a Server Action candidate and an application entry. Without a
  usable session it returns HTTP 401 with an empty body and `Cache-Control: private, no-store`, and records
  `protectRequest` `denied_unauthenticated`. The action never runs. A public recovery path was anticipated by a
  comment on `PUBLIC_DOCUMENT_PATHS`.
- **F2 — Session classification.** `SessionService.read` annotates `expired` or `missing`, but the public
  `NoUsableSession` carries no cause. Records are stored with a Redis TTL equal to the deadline, so the server
  observes "expired" only in the brief window before eviction ([Session state](../../docs/session-state.md#not-emitted)).
  After eviction every late request is `missing`.
- **F3 — Action-level check.** The reference and roster actions call `admitSubmission`, which wraps
  `authorizeSessionAction`. It renews only on a tag match and returns `no_session` or `session_changed` otherwise.
  Both currently yield a `Denied` state with HTTP 200.
- **F4 — Client consumer.** `useSessionConfirmedActionState` (`packages/frontend/src/providers/session-confirmation.tsx`)
  wraps the Server Action in a client function, catches any rejection as `notPerformed`, then confirms the session.
  Because React receives a client function, server rendering emits no progressive-enhancement form action. A form
  submitted without scripts never reaches the server.
- **F5 — Next client handling of a non-RSC action response.** In Next 16.4.5
  `client/components/router-reducer/reducers/server-action-reducer.js`, a fetch action response that is not
  `text/x-component` throws `new Error(body)` when the status is 4xx or above and the content type is exactly
  `text/plain`, and a generic message otherwise.
- **F6 — `unauthorized()`.** `experimental.authInterrupts` is already on. In a fetch action, `unauthorized()` sets
  HTTP 401 and returns a flight response whose action result rejects
  (`server/app-render/action-handler.js`). In a non-fetch (MPA) action, Next renders the page instead.
- **F7 — Tab coordination.** `TabCoordination` confirms at the held local deadline. A `Ended` status answer
  (401 or 409) calls `#endConfirmed`, which writes the ended record (`recordEnded`) so that every sharing tab ends,
  and the coordinator then shows `SignedOutNotice`. That notice is the current stand-in for expiration. Resume
  conceals past the deadline and confirms (B5-R). `pagehide` conceals, and the root `RestoredPageGuard` reloads a
  page restored from the back/forward cache. The ended record holds only `{ endedAt }`.
- **F8 — Browser harness.** `TabCoordination.transition`, `Focus.move`, and `Interaction.submit` exist with closed
  sets. `shared/browser-tracing/export-filter.ts` exports only allow-listed span names and attribute keys, so every
  new name or key must be added there.
- **F9 — Library modal.** `@pathableai/react` 0.3.0 `Modal` always renders a close button that calls `onClose`,
  calls `onClose` on Escape, focuses that close button by default unless `initialFocusRef` is given, renders an `h2`
  title, portals to `document.body`, and does not make the rest of the page inert.
- **F10 — Log in from the signed-out notice** links to `/`. The gate redirects a document entry without a session to
  `/auth/login`, which requests `max_age=0` and confirms `auth_time` (#158). A valid session at `/` is reused.
- **F11 — Fixtures.** Tenant idle timeout is bounded to 5–30 minutes. BDD scenarios own a copy of the tenant
  directory. The tracked realm has `stale-auth-time-web` (stale evidence) and `consent-web` (provider cancel)
  clients. No BDD step connects to Redis.

## Decisions

### D1 — Denied no-script submissions receive a host-rendered 401 recovery document

**Decision:** When the gate denies a Server Action candidate that carries no `next-action` header and is a browser
navigation (Fetch Metadata), it returns the host's recovery document with HTTP 401. The host supplies the document
through a new `ProtectionResponses.recoveryDocument` member, following the existing `forbiddenDocument` pattern.
The gate re-wraps the host response so that the status is 401 and `Cache-Control` is `private, no-store` whatever the
host returns, and it starts no login. Other application requests keep the empty 401.

**Rationale:** FR-006 requires that the browser display recovery content in the denied 401 response itself. Only the
gate sees these requests, because the action never runs. The host already renders the 403 document this way
(research D4 of #154), and frontend-services may not render React.

**Alternatives:** A redirect to a public recovery page loses the 401 status. Admitting the request to the action so
that `unauthorized()` renders it would weaken S1's default protection.

### D2 — The server's observed expiry is an optional flag on `NoUsableSession`

**Decision:** `NoUsableSession` gains `readonly expired?: true | undefined`. It is set only when the store returned
the record past its deadline (the `Expired` store outcome, or a decoded record whose deadline has passed). The gate
maps it to the cause `expired`, and everything else to `unknown`.

**Rationale:** FR-004 requires "expired" when the server observed an expired record. An optional flag leaves every
existing construction and assertion of `{ _tag: "NoUsableSession" }` valid. A required cause field would ripple
through 13 test files for no consumer benefit. The flag is rarely set in practice (F2). That case is covered for
running tabs by D7's tab basis. A no-script submission after eviction says "no longer available", which the
specification expects (acceptance scenario 1.8).

### D3 — Fetch actions learn the gate's cause from a `text/plain` 401 body (maintainer)

**Decision:** For a denied candidate that carries `next-action`, the gate returns the host's
`ProtectionResponses.actionDenial` response, re-wrapped to 401 and `private, no-store`. The host body is a
closed-set `text/plain` token, one per cause, defined once in `packages/frontend/src/providers/action-denial.ts`.
Next's client throws that body as the action's rejection message (F5), and the protected-action form reads it.

**Rationale:** Without it a JavaScript tab cannot know that the server observed expiry. The maintainer accepted the
coupling to Next's client behavior. The A3 browser scenario pins it. A Next upgrade that changes the reducer turns
the token path into the generic-rejection path, which still recovers through D7, so the failure is a weaker
explanation and never admission.

**Alternatives:** Local basis only, which deviates from FR-004 in a clock-offset edge.

### D4 — Protected action forms are progressively enhanced, and rejections reach an error boundary

**Decision:** Replace `useSessionConfirmedActionState` with a `ProtectedActionForm` provider component. It calls
React's `useActionState` with the Server Action itself, so React renders the no-script form action and Next decodes
the submission as an MPA action. It also renders the coordination tag field. A client error boundary around it
catches the rejection that React rethrows from a failed action. In A2 the boundary shows the consumer's
`notPerformed` state and confirms the session, preserving S3 behavior. In A3 it hands the rejection to the
coordinator (D6). Confirmation after a settled action moves to an effect on the action state.

**Rationale:** FR-006 needs a real no-script submission. React gives progressive enhancement only when
`useActionState` receives a Server Function. The wrapper that F4 describes prevents it.

**Feasibility gate:** The first A2 task confirms in a production build that (a) server-rendered HTML contains
React's action form fields, (b) a no-script submission reaches the gate as a form-encoded navigation `POST`, and
(c) a rejected fetch action reaches the boundary without an unhandled error. If (a) or (b) fails, stop and correct
the plan through the [corrections path](../../docs/engineering/git-workflow.md#corrections). Do not hand-build
action IDs.

### D5 — An action-level `no_session` is a real 401

**Decision:** `admitSubmission` returns the `authorizeSessionAction` outcome. On `no_session`, the reference and
roster actions call `unauthorized()` from `next/navigation`. `session_changed` keeps the existing `Denied` state,
because a session still exists there (S3).

**Rationale:** FR-001 requires HTTP 401 for any protected action that meets an expired or missing session. Between
the gate's read and the action's renewal is a sub-millisecond window. In a fetch action `unauthorized()` yields 401
and a rejection (F6), which D4 and D6 handle.

**Limitation (plan L-3):** In an MPA (no-script) submission that loses this race, Next renders the page. The
`(app)` layout then redirects to login before an unauthorized boundary can render, so the browser receives the
fresh-entry redirect instead of the 401 document. No operation runs. The window cannot be reproduced reliably in
BDD, so a module test covers the action's behavior.

### D6 — In-place recovery is a coordinator view (maintainer)

**Decision:** `TabCoordination` gains a `recovery` view with a cause. Entering it unmounts the protected content and
the header, exactly as `ended` does, and renders the shared recovery notice (D13). Focus moves to the notice's
heading. The view does not write the ended record or post a cross-tab message (FR-008). Only an action denial enters
it. The protected-action boundary calls a new confirmation-context member, `deny(cause)`. With the gate's token
`unknown` or no token, `deny` first reads the session status. An `Ended` answer enters `recovery`. A `Usable` answer
leaves the page and shows `notPerformed`. An `Undetermined` answer keeps S3's conceal-and-retry.

**Rationale:** It matches the signed-out notice and the modal, keeps browser tracing running for the Log in fact
(T-005), and needs no public route or cause in a URL.

### D7 — Known expiration is judged on the server clock

**Decision:** A tab has known expiration when it observed no logout of the session and the session's held deadline
(server clock) is at or before the best server-time estimate. That estimate is the later of (a) the tab's
calibrated estimate, `Date.now()` plus the offset, and (b) the `Date` header of the `Ended` status response, which
`readSessionStatus` adds to its `Ended` outcome. "Observed a logout" means that the tab received a logout message or
record for the tag, or that its own logout attempt for the tag is unresolved. The denial (A3) and the expired state
(B) use the same predicate. The gate's `expired` token overrides it to "expired".

**Rationale:** The approved basis is the tab's locally known deadline. Judging it on server time keeps FR-017 (a
resumed tab whose local clock lags) and emulated clock suspension correct, because the `Date` header is
server-authored. Its whole-second resolution can only delay "expired" by under a second near the deadline.

### D8 — The expiration modal uses the library `Modal` with its gap tracked (maintainer)

**Decision:** The expired view renders `@pathableai/react` `Modal` with `open`, a no-op `onClose`, `initialFocusRef`
on the Log in link, the shared copy as title and description, and the Log in link in `footer`. `closeOnBackdropClick`
stays `false`. The coordinator has already unmounted protected content and the header, so the background holds
nothing protected or navigable whatever the modal does.

**Gap:** The close button stays visible and does nothing. Library issue:
[PathableAI-org/styles#264](https://github.com/PathableAI-org/styles/issues/264). Adoption tracking:
[#400](https://github.com/PathableAI-org/Pre-ETS/issues/400). Remove the workaround and re-run V-011, V-013, and
V-014 when the library ships a non-dismissible mode. This is plan limitation L-1. The removal condition is recorded
here under Principle IV.

### D9 — Expiration propagates through the ended record with a cause

**Decision:** The ended record in `localStorage` gains `cause: "expired" | "ended"`. It is written only after a
server `Ended` answer. A tab that ends by confirmed expiry records `expired`. Logout paths record `ended`. A peer
that receives the record enters `expired` or `ended` to match, unless it already observed a logout, in which case it
stays signed out (FR-019). Every running tab also confirms independently at its own deadline. A record missing a
cause, written by a tab from the previous revision, reads as `ended`.

**Rationale:** FR-011 requires that the expired state reach every sharing tab. S3 already propagates ending. Without
a cause, peers would show the signed-out notice instead of the modal. The record follows a server answer, so no tab
expires while the session is valid (FR-010).

### D10 — Deadline concealment; resume, refresh, and back/forward reuse S3, #154, and #158

**Decision:** At its local deadline a running tab now conceals temporarily ("Checking your session…") while it
confirms. This keeps protected information hidden within the 2-second bound even when the status read is slow, and
it is not the expired state (FR-010, FR-016). A `Usable` answer reveals it, and an `Ended` answer with known
expiration enters `expired`. B5-R resume concealment is unchanged. A confirmed `Ended` with known expiration (D7) enters `expired`.
Without it, the tab enters `ended`. Refresh and history reach the gate and follow fresh entry. On `pagehide` the
expired view also hides the modal, so a page restored from the back/forward cache shows no modal before
`RestoredPageGuard` reloads it (FR-018).

### D11 — Log in goes to `/`

**Decision:** Log in in the recovery notice, the gate document, and the modal is a link to `/`. That is the same
fresh-entry boundary the signed-out notice uses (F10). It reuses a valid session that another tab established, and
it otherwise starts a fresh login (FR-021, edge case "two tabs each activate Log in").

### D12 — Shared copy lives in one feature module

**Decision:** A new `features/session-recovery` public entry owns the copy and a server-renderable
`SessionEndNotice`. The gate document, the in-place recovery view, and the modal all consume it, so FR-020
equivalence holds by construction. Copy:

| Cause     | Heading                             | Explanation                                                         | Log in accessible name |
| --------- | ----------------------------------- | ------------------------------------------------------------------- | ---------------------- |
| `expired` | Your session expired                | For your security, your session ended after a period of inactivity. | Log in again           |
| `unknown` | Your session is no longer available | To continue, log in again.                                          | Log in again           |

The `unknown` copy gives no cause (FR-004). No copy includes identity, tenant data, or session values (FR-025).

### D13 — BDD control of time and session removal

**Decision:** Natural expiry uses a scenario-owned tenant copy with `idleTimeoutMinutes: 5` and real elapsed time.
Suspended timers use Playwright's clock: `install`, then `pauseAt`, so timers stop, then `setSystemTime` to wall time
before the action, so the tab's clock is current while no timer has fired. A removed record that the tab did not
observe is produced by logging out from a second browser context that holds a copy of the session cookie. The tab
receives no cross-tab message across contexts. Stale evidence uses `stale-auth-time-web`, and provider cancel uses
`consent-web`. No step connects to Redis. A scenario that waits for natural expiry takes over 5 minutes, so the
5-minute journeys are combined into as few scenarios as the claims allow.

### D14 — #157's Log in evidence serves #158 S3 (maintainer)

**Decision:** Slice C's `@preets-session-013` scenarios from both entry points are the evidence that
[#158's plan](../382-fresh-oidc-recovery/plan.md) assigns to its S3. #158's S3 pull request cites them instead of
duplicating them. This plan does not edit `specs/382-fresh-oidc-recovery/`.

### D15 — Telemetry extends existing spans and facts

**Decision:** Annotate `protectRequest`, and extend `TabCoordination.transition` with new closed-set states, a
cause, and server-clock timing. Add one fact, `Interaction.login`. Everything else reuses the session-state signals.
See [contracts/telemetry.md](contracts/telemetry.md).

## Plan limitations (beyond `verification.md`)

- **L-1:** The expiration modal shows an inert close button until the library ships a non-dismissible mode (D8,
  #400).
- **L-2:** The server rarely observes expiry (F2). Server-basis "expired" explanations occur only before eviction.
  The tab basis covers running tabs.
- **L-3:** An MPA submission that loses the gate-to-action race receives the fresh-entry redirect instead of the 401
  document (D5). No operation runs.
- **L-4:** The fetch-action cause depends on Next 16.4.5's reducer (D3). If it changes, the denial falls back to the
  tab basis.
