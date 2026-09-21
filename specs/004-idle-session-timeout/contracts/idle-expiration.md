# Contract: Authoritative Idle Expiration

Status: proposed implementation contract for feature `004-idle-session-timeout`.

**Requirements**: FR-004, FR-005, FR-006, FR-007, FR-008; SC-002, SC-004.

## Authority

Redis session state evaluated with the **application clock** is authoritative for idle and
absolute deadlines. Browser timers, local clocks, and UI visibility MUST NOT grant access past
`idleExpiresAt`.

## Protected operations (this slice)

A protected operation is any server path that would treat the session as authenticated
(`userId` present) to continue application access, including:

- Proxy authenticated document short-circuit / forwarding of authenticated session context
- Authenticated SSR that depends on `userId`
- Idle activity-renewal handler

All such paths MUST re-check `now < idleExpiresAt` and `now < expiresAt` (and tenant bind)
before success. Centralize the check so new handlers cannot skip it.

**Clock sampling (required)**: Do **not** reuse a `nowSeconds` sampled only before Redis
I/O or tenant resolution. After the session record is loaded, sample a **fresh**
application-clock value **immediately before** any success outcome (forwarding
authenticated context, returning authenticated confirm, accepting renewal). If that
fresh check fails the deadlines, run clearance/denial (and persist cause/latch when idle
binds—see outcome table) instead of succeeding. Cover slow-read crossing `idleExpiresAt`
in contract tests.

## Activity renewal interface

`recordQualifyingActivity()` (name indicative)—**no client-supplied session target**:

The handler MUST derive `sessionId` and `tenantId` **only** from the verified host-bound
`pathable-session` cookie (and host→tenant bind). Do **not** accept caller-supplied
`sessionId` / `tenantId` as renewal targets. If internal helpers take those values, they
MUST be compared equal to the cookie-bound pair before any CAS; mismatch → deny, no
mutation. No public diagnostic route for idle state or renewal.

**Clock**: The external request MUST **omit** any client-supplied activity timestamp.
The handler stamps activity from the **authoritative application clock** (`nowSeconds`)
per the CAS protocol below. Inject the clock only in tests. Invariant: accepted
`lastActivityAt` MUST NOT leave access extended past a deadline that has already elapsed
on the application clock.

**Transport / CSRF**: Prefer a Server Action (framework CSRF). If a Route Handler is used,
it MUST be **POST-only** and MUST validate same-origin `Origin` (or equivalent CSRF)
before accepting a heartbeat. Cookie `SameSite=Lax` alone is **not** sufficient—reject
GET and cross-site requests.

1. Resolve cookie-bound `sessionId` / tenant; missing cookie → deny without inactivity claim.
2. Load session for that id; missing → deny without inactivity claim.
3. Tenant mismatch (record vs host bind) → deny; no mutation.
4. Not authenticated → deny; no idle renewal.
5. Sample `now0`; if `now0 >= idleExpiresAt` or `now0 >= expiresAt` → deny; ensure
   authenticated access ended; do not revive.
6. Else attempt CAS: set `lastActivityAt = now0`, recompute `idleExpiresAt`; leave
   `expiresAt` and `idleDurationMinutes` unchanged.

**Atomic store transition**: Load-check-write MUST NOT use a blind `SET XX` after a
separate read. Renewal and idle-clearance MUST compete via an **atomic conditional**
Redis transition (WATCH/MULTI, Lua, or compare-and-set on expected authenticated shape +
`idleExpiresAt` / generation).

**Clock authority + serialization (pinned)**: The **application clock** remains
authoritative. A pre-I/O `now0` alone is **not** sufficient, and a lone post-apply
`now1` check is **not** sufficient either: concurrent renewals can observe an extended
deadline from a not-yet-validated write and renew again before clearance CAS runs.

Pinned fail-closed protocol:

1. Acquire a **per-session idle mutation lock** (short-lived Redis `SET NX` / equivalent
   covering renew **and** clearance for that `sessionId`). Concurrent heartbeats and
   expiry clearance **serialize** on this lock. Fail closed if the lock cannot be
   acquired within the store timeout.
2. Under the lock: load record; sample `now0`; optimistic-deny/clear if already past
   either deadline.
3. CAS using `now0` as the candidate activity stamp (pass as ARGV / local compare)—do
   **not** use Redis `TIME` as the product clock. Prefer a monotonic
   `sessionRevision` (or expected `idleExpiresAt` + shape) in the CAS predicate.
4. On store timeout, WATCH conflict, or aborted EXEC → release lock; fail closed (deny;
   no write).
5. **Post-apply re-check (still under the same lock)**: sample fresh `now1`. Let
   `preRenewalIdleExpiresAt` be the idle deadline before this renewal. If
   `now1 >= preRenewalIdleExpiresAt` or `now1 >= expiresAt`, **revert or clear** via CAS
   on the revision just written (deadline wins)—no other renewal may observe the
   extended deadline until this step completes because they wait on the same lock.
6. Release lock. Cover deterministic A/B interleaving (renew → delayed post-check vs
   concurrent renew) in contract/unit tests: the original deadline must not remain
   bypassed by a chain of renewals built on a not-yet-validated write.

When the race is lost:

| Lost-race outcome                         | Result                                                            |
| ----------------------------------------- | ----------------------------------------------------------------- |
| Clearance already wrote anonymous + cause | Deny renewal; **no** overwrite of post-clearance anonymous record |
| Newer accepted heartbeat already applied  | Deny or no-op; do not regress `lastActivityAt` / `idleExpiresAt`  |
| Expected shape / generation mismatch      | Deny; fail closed; no revival                                     |
| Store timeout / aborted EXEC / lock miss  | Deny; fail closed; no revival                                     |
| Post-apply `now1` past prior deadline     | Revert/clear under lock; deny; no extended access                 |

**Coalescing / rate bound**: server MUST coalesce or rate-limit accepted renewals.
Indicative default (E4): ignore redundant Redis writes within **~1s** when the computed
`idleExpiresAt` is unchanged. Tasks MAY adjust the window with rationale. Client MAY
debounce deliveries. Neither bound creates a grace period past `idleExpiresAt`. Store
timeout / failure on renewal → fail closed (deny; no revival).

### Qualifying vs non-qualifying (client duty)

May call renewal only for deliberate **user-originated** DOM events with
`event.isTrusted === true`: `keydown`, pointer (`pointerdown`), `touchstart`, or scrolling
driven by trusted `wheel` / touch / pointer / keyboard input. MUST NOT renew on
script-generated (untrusted) events, bare `scroll` alone (programmatic `scrollTo`, layout,
or infinite-scroll callbacks), passive reading, polling, prefetch, or automated keepalives.
Assistive-technology input that the browser marks `isTrusted === true` **does** qualify;
synthetic events from scripts do not.

## Idle expiry side effects

When idle deadline is reached or detected:

1. Authenticated access ends (clear `userId` / `userName` / idle fields, or replace with
   anonymous tenant session) via the same **atomic** conditional transition family as
   renewal—deadline wins over concurrent heartbeats.
2. Set anonymous `accessEndedCause: "inactivity"` and a replayable **session-end
   generation / latch** for recovery UX (FR-008/009). See
   [inactivity-recovery.md](./inactivity-recovery.md) and [data-model.md](../data-model.md).
3. This slice has **no** session draft / unsaved-work keys to delete (see data-model).
   Protected UI must still be removed from the active experience; login-again MUST NOT
   restore cleared UI state.
4. Absolute Redis TTL / `expiresAt` handling remains per session-state rules; anonymous
   continuity MUST NOT restore protected access (FR-007).

## Ordering

| Event                                | Result                                                                |
| ------------------------------------ | --------------------------------------------------------------------- |
| Activity with `now < idleExpiresAt`  | Restart idle period                                                   |
| Activity with `now >= idleExpiresAt` | No revival; access remains ended                                      |
| Absolute expiry                      | Access ended; claim inactivity only if idle evidence also established |
| Store miss / 503                     | Deny access; **no** inactivity assertion                              |
| Lost CAS vs clearance                | Deny; anonymous clearance retained                                    |

## Multi-tab / multi-session

| Situation                        | Idle behavior                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Tabs sharing `pathable-session`  | Shared Redis record; one activity renews all; recovery sync per [inactivity-recovery.md](./inactivity-recovery.md) |
| Separate session cookie / device | Independent idle deadlines                                                                                         |
| Activity for tenant B            | Must not renew tenant A’s session                                                                                  |

## Session confirm / read (running-app)

Authenticated same-tenant session cookie only. Returns whether access is still
authenticated vs ended, and whether cause is `inactivity` when applicable (including
opaque `sessionEndGeneration` when ended for inactivity). While still authenticated, the
response (or forwarded `SessionContext`) MUST expose `idleExpiresAt` so the client can
schedule deadline-aligned revalidation—see
[inactivity-recovery.md](./inactivity-recovery.md) and [data-model.md](../data-model.md).
Consume of `accessEndedCause` follows the session-end latch rules (not a public
diagnostic dump of session internals).

**Transport**: Mutating confirm (clearance / latch assign/consume) MUST use the same
Server Action or POST + same-origin CSRF rules as activity renewal above. GET probes MUST
be non-mutating.

## HTTP / outcome classes (indicative)

Inactivity labeling requires **persisted** cause/latch evidence (FR-008). Observing that
both deadlines have passed on a still-present authenticated record is **not** enough to
tell the client “inactivity” until this request (or a prior one) has atomically performed
idle clearance and written `accessEndedCause` / `sessionEndGeneration`. After Redis `EXAT`
removes the key, missing session → **not** inactivity unless a separate retained latch key
still exists (this slice keeps cause/latch on the anonymous record until that record’s
`expiresAt`—once gone, no inactivity claim).

| Condition                                                             | Authenticated access | Cause label                                       |
| --------------------------------------------------------------------- | -------------------- | ------------------------------------------------- |
| Authenticated; fresh `now` `< idleExpiresAt` and `< expiresAt`        | Allowed              | n/a                                               |
| First observation: fresh `now >= idleExpiresAt` and `now < expiresAt` | Denied               | Persist cause/latch atomically → `inactivity`     |
| First observation: fresh `now >= expiresAt` and `now < idleExpiresAt` | Denied               | Absolute; **not** inactivity; no idle cause write |
| Both past on still-present record (`idleExpiresAt <= expiresAt`)      | Denied               | Atomic idle clearance + latch → `inactivity`      |
| Both past on still-present record (`idleExpiresAt > expiresAt`)       | Denied               | Absolute path; **not** inactivity                 |
| Missing session / EXAT eviction without retained latch                | Denied               | **not** inactivity                                |
| Anonymous with retained cause/latch                                   | Denied for protected | `inactivity`                                      |
| Store timeout / 503                                                   | Denied               | not inactivity                                    |

**Equality pin**: when `idleExpiresAt === expiresAt` and fresh `now >=` that instant on a
still-present record, perform atomic idle clearance + latch and label **inactivity**.
Cover equality and missing-after-EXAT in contract tests.

Exact status codes for document vs non-document follow existing Proxy patterns (SSR recovery
UI vs `401`/`403` as applicable); contract tests care about **authorization outcome** and
**cause accuracy**, not inventing new public diagnostic endpoints.
