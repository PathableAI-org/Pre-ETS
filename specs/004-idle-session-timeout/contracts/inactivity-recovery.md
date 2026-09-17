# Contract: Inactivity Recovery Experience

Status: proposed implementation contract for feature `004-idle-session-timeout`.

**Requirements**: FR-008, FR-009, FR-010; SC-003.

## Preconditions

Show the inactivity modal **only** when inactivity cause is established by:

1. Successful **server** confirmation that access ended for inactivity (anonymous
   `accessEndedCause: "inactivity"`), **or**
2. An established same-origin `BroadcastChannel` (or equivalent) `inactivity-confirmed`
   signal from a sibling tab that already received that server confirmation

Missing session, store failure, absolute expiry without idle evidence, or unknown
failures MUST use a different recovery path and MUST NOT state that inactivity caused
the interruption. Client timers alone MUST NEVER invent an inactivity claim (FR-008).

## Running-app confirm / read interface (E2 / X2)

While authenticated UI is mounted, revalidation asks the server via a minimal
authenticated confirm/read (name indicative: `confirmSessionAccess` / session status
read). Same-tenant session cookie only (`pathable-session` host-bound).

| Response (minimal)                          | Meaning                                        |
| ------------------------------------------- | ---------------------------------------------- |
| Authenticated access still valid            | Continue; no recovery                          |
| Access ended; cause `inactivity`            | Confirmed inactivity; proceed to clear + Modal |
| Access ended; cause absent / not inactivity | Different recovery path; no inactivity claim   |
| Transport / 5xx / store unavailable         | See failure stance below—not proof of idle     |

**Consume timing**: When the response surfaces `accessEndedCause: "inactivity"`, consume
occurs **once per session end** on that recovery UI read (clear the Redis field). Do not
expose a public diagnostic dump of full session internals, idle fields, or renewal state.

## Running-app revalidation (required)

While authenticated UI is mounted, the client **MUST** schedule non-authoritative
revalidation (deadline-aligned timer and/or `visibilitychange` / `focus`) using the
confirm/read interface above. On confirmed inactivity:

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
   opens the Modal, and broadcasts `inactivity-confirmed` to same-origin siblings.
2. Sibling tabs clear protected content and open the inactivity Modal from that
   established sync signal (counts as established UI evidence from a prior server
   confirmation—does **not** invent inactivity).
3. Redis `accessEndedCause` consume-once MUST NOT strand siblings: consume once per
   session end; siblings MUST NOT be required to re-read a still-present Redis cause
   after the first tab consumed it.

Aligns with recovery Gherkin “second tab” and FR-008 / FR-010.

## Modal experience

Use `@pathableai/react` **`Modal`** beneath a justified client boundary. Server Components
continue to own session/tenant reads and cause detection on document load.

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
2. Success establishes a **new** authenticated session with **current** tenant idle policy.
3. Cleared temporary data MUST NOT be restored.
4. An existing identity-provider sign-in MAY complete application login without a fresh
   credentials challenge; it still MUST NOT revive the expired application session.
5. Cancel or failure → expired access remains unusable; understandable retry remains available
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
3. Recovery reflects established cause (`inactivity` vs other), including multi-tab sync rules above.

## Browser acceptance notes

`@browser` scenarios must exercise real focus movement and keyboard activation—not string
inventory alone—including expiry while the application is running (modal + content clear
without requiring full navigation). Multi-tab scenarios MUST assert the inactivity
explanation on **both** shared-session tabs (not only content clear). Complement with
`@contract` proof that enforcement does not depend on the modal being shown.
