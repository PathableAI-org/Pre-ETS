# Contract: Inactivity Recovery Experience

Status: proposed implementation contract for feature `004-idle-session-timeout`.

**Requirements**: FR-008, FR-009, FR-010; SC-003.

## Preconditions

Show the inactivity modal **only** when inactivity cause is established by:

1. Successful **server** confirmation that access ended for inactivity (anonymous
   `accessEndedCause: "inactivity"` and/or matching **session-end generation**), **or**
2. An established same-origin `BroadcastChannel` (or equivalent) `inactivity-confirmed`
   signal from a sibling tab that already received that server confirmation (payload
   includes the session-end generation)

Missing session, store failure, absolute expiry without idle evidence, or unknown
failures MUST use a different recovery path and MUST NOT state that inactivity caused
the interruption. Client timers alone MUST NEVER invent an inactivity claim (FR-008).

## Cause-bearing SSR recovery route (document load)

Today’s proxy initiates OIDC whenever `userId` is absent. That would skip the inactivity
Modal on a full navigation after idle clearance. This slice therefore requires an
**explicit recovery document path**:

1. When the Redis record is anonymous **and** carries consumable inactivity evidence
   (`accessEndedCause: "inactivity"` and/or an active session-end latch), the Proxy
   **MUST forward** to an SSR recovery shell (PathAble Modal + “Log in again”) instead of
   starting generic OIDC initiation.
2. Protected application content remains denied.
3. Anonymous sessions **without** inactivity evidence continue the existing OIDC
   initiation redirect.

## Running-app confirm / read interface (E2 / X2)

While authenticated UI is mounted, revalidation asks the server via a minimal
authenticated confirm/read (name indicative: `confirmSessionAccess` / session status
read). Same-tenant session cookie only (`pathable-session` host-bound).

| Response (minimal)                          | Meaning                                        |
| ------------------------------------------- | ---------------------------------------------- |
| Authenticated access still valid            | Continue; includes `idleExpiresAt` for timers  |
| Access ended; cause `inactivity`            | Confirmed inactivity; proceed to clear + Modal |
| Access ended; cause absent / not inactivity | Different recovery path; no inactivity claim   |
| Transport / 5xx / store unavailable         | See failure stance below—not proof of idle     |

**Deadline source for client timers**: Prefer `idleExpiresAt` on the forwarded
authenticated `SessionContext` (see [data-model.md](../data-model.md)). Confirm/read
MUST also return `idleExpiresAt` while authenticated so revalidation can reschedule after
renewals. Do not expose a public diagnostic dump of full session internals.

**Session-end latch / consume**: Surfacing inactivity MUST NOT permanently erase the only
cause before siblings can recover:

1. On first successful server confirmation of inactivity for a session end, assign (or
   retain) a monotonic **`sessionEndGeneration`** on the anonymous record and treat that
   generation as a **replayable latch** for a short retention window (or until login-again
   rotates the cookie).
2. Broadcast `inactivity-confirmed` **with that generation** to same-origin siblings.
3. Clearing the string field `accessEndedCause` after the first recovery UI read is
   allowed **only if** the generation latch remains queryable so a sibling (or a tab
   that missed BroadcastChannel) can still confirm inactivity via confirm/read or the
   SSR recovery route.
4. Do not expose a public diagnostic dump of full session internals, idle fields, or
   renewal state.

## Running-app revalidation (required)

While authenticated UI is mounted, the client **MUST** schedule non-authoritative
revalidation (deadline-aligned timer and/or `visibilitychange` / `focus`) using the
confirm/read interface above and `idleExpiresAt` from context/confirm. On confirmed
inactivity:

1. Remove protected content from the active experience
2. Open the PathAble Modal
3. Notify same-origin shared-session siblings (see Multi-tab)

The server remains sole authority for `idleExpiresAt`; revalidation MUST NEVER grant
access past that deadline. This path covers expiry **while the application is running**
(recovery Gherkin)—not only after a later full navigation.

### Revalidation transport / 5xx (P2 / E3)

On confirm/read transport failure or 5xx:

- Retry without claiming inactivity
- Do **not** treat failure as proof of idle
- Brief still-visible protected UI until a successful confirmation is an **accepted**
  stance for this slice (ops remain denied server-side; do not fail-toward-clear without
  cause)

## Multi-tab shared-session recovery (P1 / E1 / X1)

Each shared-session tab MUST run revalidation. Ordering for cause:

1. First tab to receive a successful **server** inactivity confirmation clears content,
   opens the Modal, and broadcasts `inactivity-confirmed` (including `sessionEndGeneration`)
   to same-origin siblings.
2. Sibling tabs clear protected content and open the inactivity Modal from that
   established sync signal (counts as established UI evidence from a prior server
   confirmation—does **not** invent inactivity).
3. If a sibling misses BroadcastChannel (suspended tab, dropped event), it MUST still
   recover by re-querying confirm/read or loading the SSR recovery route against the
   replayable session-end latch—**MUST NOT** be stranded without an inactivity path after
   the first tab’s consume of the string cause field.

Aligns with recovery Gherkin “second tab” and FR-008 / FR-010.

## Modal experience

Use `@pathableai/react` **`Modal`** beneath a justified client boundary. Server Components
continue to own session/tenant reads and cause detection on the recovery document path.

| Requirement               | Observable                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Explanation               | User-visible text that inactivity ended the session; MAY note unsaved work was lost (no extend control)          |
| Primary action            | Button accessible name **“Log in again”**                                                                        |
| Accessible name / purpose | Announced to assistive technology; meaningful modal name                                                         |
| Focus                     | Moves into modal on open; remains visibly usable; focus not returned to protected content through expired access |
| Keyboard                  | All offered actions operable by keyboard                                                                         |
| Protected content         | Removed from the active experience before further interaction is enabled                                         |

No advance-warning, countdown, or “extend session” control in this slice.

## Login again

1. Activating “Log in again” starts the **originating tenant’s** existing OIDC initiation
   journey (same host-bound broker configuration).
2. **Session-id rotation (required)**: Before (or as part of) initiation, mint a **new**
   `sessionId` and set a new host-bound `pathable-session` cookie. Do **not** pass the
   post-clearance anonymous `sid` into the OIDC transaction as the authentication target.
   The OIDC callback MUST write authenticated fields only to the **new** Redis key.
   Abandon / expire the old post-clearance record so `accessEndedCause`, drafts, and the
   session-end latch are **not** carried into the new authenticated session.
3. Success establishes a **new** authenticated session with **current** tenant idle policy.
4. Cleared temporary data MUST NOT be restored.
5. An existing identity-provider sign-in MAY complete application login without a fresh
   credentials challenge; it still MUST NOT revive the expired application session
   (no in-place upgrade of the pre-recovery `sid`).
6. Cancel or failure → expired access remains unusable; understandable retry remains available
   (`login-unavailable` and/or return to recovery UI).

## Temporary vs durable data

| Kind                               | On inactivity expiry             |
| ---------------------------------- | -------------------------------- |
| Temporary session / unsaved drafts | Cleared                          |
| Protected UI content in the app    | Removed from active experience   |
| Durable saved business records     | Intact (backend / durable store) |

## Resume after sleep / offline

When the application runs again after suspension or offline operation past the idle deadline:

1. Authoritative check denies authenticated access.
2. Protected content is removed before further interaction (via revalidation and/or navigation).
3. Recovery reflects established cause (`inactivity` vs other), including multi-tab sync and
   SSR recovery-route rules above.

## Browser acceptance notes

`@browser` scenarios must exercise real focus movement and keyboard activation—not string
inventory alone—including expiry while the application is running (modal + content clear
without requiring full navigation). Multi-tab scenarios MUST assert the inactivity
explanation on **both** shared-session tabs (not only content clear), including a case
where a sibling recovers via latch/confirm after missing BroadcastChannel. Complement with
`@contract` proof that enforcement does not depend on the modal being shown.
