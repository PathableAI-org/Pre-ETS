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

**Transport / CSRF (required)**: Prefer a Server Action (framework CSRF). If a Route
Handler is used, it MUST be **POST-only** and MUST validate same-origin `Origin` (or
equivalent CSRF) before any Redis mutation (clearance, latch assign/consume). Cookie
`SameSite=Lax` alone is **not** sufficient—reject GET and cross-site requests for the
mutating confirm path. Any GET status probe MUST be **read-only** (no clearance, no latch
consume). Mirror [idle-expiration.md](./idle-expiration.md) activity-renewal transport
rules.

| Response (minimal)                          | Meaning                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Authenticated access still valid            | Continue; includes `idleExpiresAt` for timers                                                    |
| Access ended; cause `inactivity`            | Confirmed inactivity; includes opaque `sessionEndGeneration`; proceed to clear + Modal           |
| Access ended; cause absent / not inactivity | Different recovery path; no inactivity claim                                                     |
| Transport / 5xx / store unavailable         | See failure stance below—not proof of idle                                                       |

When access has ended for inactivity, the minimal confirm/read response (and the SSR
recovery shell props) MUST include **`sessionEndGeneration`** (opaque handle). Sibling tabs
and missed-BroadcastChannel recovery validate against this generation when re-querying—do
**not** infer it from authenticated `SessionContext` (which omits the latch).

**Deadline source for client timers**: Prefer forwarded authenticated `SessionContext`
fields `idleExpiresAt` **and** `expiresAt` (see [data-model.md](../data-model.md)).
Schedule non-authoritative revalidation/lock at
`min(idleExpiresAt, expiresAt)`. Confirm/read MUST return both deadlines while
authenticated so timers can reschedule after renewals. When absolute expiry binds first
(or alone), use the **non-inactivity** recovery path. Do not expose a public diagnostic
dump of full session internals.

**Session-end latch / consume**: Surfacing inactivity MUST NOT permanently erase the only
cause before siblings can recover:

1. On first successful server confirmation of inactivity for a session end, assign (or
   retain) a monotonic **`sessionEndGeneration`** on the anonymous record and treat that
   generation as a **replayable latch** retained until the ended session’s absolute
   **`expiresAt`** (same Redis `EXAT` / record lifetime)—not an unspecified “short”
   window.
2. Broadcast `inactivity-confirmed` with **`sessionId` and that generation** to
   same-origin siblings.
3. Clearing the string field `accessEndedCause` after the first recovery UI read is
   allowed **only if** the generation latch remains queryable so a sibling (or a tab
   that missed BroadcastChannel) can still confirm inactivity via confirm/read or the
   SSR recovery route **while the ended session key still exists**.
4. Do not expose a public diagnostic dump of full session internals, idle fields, or
   renewal state.

## Running-app revalidation (required)

While authenticated UI is mounted, the client **MUST** schedule a **deadline-aligned
timer** at `min(idleExpiresAt, expiresAt)` from context/confirm and invoke confirm/read
when it fires. `visibilitychange` / `focus` MAY trigger **supplemental** immediate
confirm/read—they MUST NOT be the sole revalidation mechanism (a continuously visible,
focused tab past the deadline must still confirm via the timer). On confirmed inactivity:

1. Remove protected content from the active experience
2. Open the PathAble Modal
3. Notify same-origin shared-session siblings (see Multi-tab)

The server remains sole authority for deadlines; revalidation MUST NEVER grant access past
them. Absolute-first expiry uses the non-inactivity recovery path. This path covers expiry
**while the application is running** (recovery Gherkin)—not only after a later full
navigation.

### Revalidation transport / 5xx

On confirm/read transport failure or 5xx:

- Retry without claiming inactivity
- Do **not** treat failure as proof of idle
- **Fail closed for visible protected content**: immediately lock/clear protected UI in the
  client shell and show a generic authorization-unavailable state (no inactivity claim,
  no “session ended due to inactivity” copy) until a successful confirm/read or safe
  navigation. Server-side denial alone is insufficient when protected content may remain
  visible in the already-rendered UI.

## Multi-tab shared-session recovery (P1 / E1 / X1)

Each shared-session tab MUST run revalidation. Ordering for cause:

1. First tab to receive a successful **server** inactivity confirmation clears content,
   opens the Modal, and broadcasts `inactivity-confirmed` including **`sessionId`** (the
   Redis/cookie sid that ended) **and** `sessionEndGeneration` to same-origin siblings.
2. Sibling tabs clear protected content and open the inactivity Modal from that
   established sync signal **only when** the message `sessionId` matches their current
   (or still-mounted) session id. `BroadcastChannel` is origin-wide—receivers MUST ignore
   foreign session ids (independent sessions and post-login-again cookies). Matching
   generation alone is insufficient binding. The signal counts as established UI evidence
   from a prior server confirmation—does **not** invent inactivity.
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
| Explanation               | User-visible text that inactivity ended the session; MAY note possible unsaved work was lost (copy only—no draft keys in this slice; no extend control) |
| Primary action            | Button accessible name **“Log in again”**                                                                        |
| Accessible name / purpose | Announced to assistive technology; meaningful modal name                                                         |
| Focus                     | Moves into modal on open; remains visibly usable; focus not returned to protected content through expired access |
| Keyboard                  | All offered actions operable by keyboard                                                                         |
| Protected content         | Removed from the active experience before further interaction is enabled                                         |

No advance-warning, countdown, or “extend session” control in this slice.

## Login again

1. Activating “Log in again” MUST invoke a **dedicated same-origin** Server Action
   (preferred) or **POST** route (indicative: `/auth/login-again`)—**not** a bare document
   navigation to `/`. Revisiting `/` while the cookie still points at an inactivity latch
   would re-enter the SSR recovery shell instead of starting OIDC.
2. **Transport / CSRF (required)** before minting a new `sessionId` or setting a new
   cookie: prefer Server Action (framework CSRF). If a Route Handler is used, it MUST be
   POST-only with same-origin `Origin` (or equivalent CSRF). Reject GET and cross-site
   requests—same bar as confirm and activity renewal.
3. That action **rotates session id first**: mint a **new** `sessionId`, set a new
   host-bound `pathable-session` cookie, then start the originating tenant’s existing OIDC
   initiation (same host-bound broker configuration) with the **new** `sid` as the
   transaction target. Do **not** pass the post-clearance anonymous `sid` into the OIDC
   transaction. The callback MUST write authenticated fields only to the **new** Redis key
   so cause/latch state is **not** carried into the new authenticated session.
4. **Old-session handling after rotation (multi-tab)**: Because `pathable-session` is a
   shared HttpOnly cookie, rotating it in one tab updates the cookie for all siblings—the
   pre-rotation Redis key is **no longer addressable** via cookie-bound confirm/read.
   Therefore every mounted authenticated document **MUST** run a **session-mismatch
   handshake**: compare the rendered/mounted `sessionId` (and any held
   `sessionEndGeneration`) against the current cookie + confirm/read result; on mismatch
   or ended inactivity for the mounted sid, clear protected UI and show recovery (or
   generic unavailable) before accepting a new authenticated context. An optional
   tombstone on the old Redis key MAY remain for audit until `expiresAt`, but it is **not**
   a sufficient sibling-recovery path by itself. A sibling that missed BroadcastChannel
   MUST NOT resume with the new cookie while still showing old protected content without
   recovery.
5. Success establishes a **new** authenticated session with **current** tenant idle policy.
6. There are **no** draft keys in this slice to restore; login-again MUST NOT revive
   cleared protected UI state from the expired experience.
7. An existing identity-provider sign-in MAY complete application login without a fresh
   credentials challenge; it still MUST NOT revive the expired application session
   (no in-place upgrade of the pre-recovery `sid`).
8. Cancel or failure → expired access remains unusable; understandable retry remains available
   (`login-unavailable` and/or return to recovery UI).

## Temporary vs durable data

| Kind                               | On inactivity expiry                                      |
| ---------------------------------- | --------------------------------------------------------- |
| Session draft / unsaved-work keys  | **None in this slice**—no cleanup op to implement/test   |
| Protected UI content in the app    | Removed from active experience; not restored on login-again |
| Durable saved business records     | Intact (backend / durable store)                          |

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
