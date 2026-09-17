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

## Activity renewal interface

`recordQualifyingActivity({ sessionId, tenantId })` (name indicative):

Accepted **only** for an authenticated same-tenant session cookie (host-bound
`pathable-session` matching the session tenant). No public diagnostic route for
idle state or renewal.

**Clock**: The external request MUST **omit** any client-supplied activity timestamp.
The handler stamps `at` from the **authoritative application clock** (`nowSeconds`).
Inject the clock only in tests. Invariant: `lastActivityAt` MUST NOT exceed authoritative
server time—future or delayed client reports MUST NOT extend access.

**Transport / CSRF**: Prefer a Server Action (framework CSRF). If a Route Handler is used,
it MUST be **POST-only** and MUST validate same-origin `Origin` (or equivalent CSRF)
before accepting a heartbeat. Cookie `SameSite=Lax` alone is **not** sufficient—reject
GET and cross-site requests.

1. Load session; missing → deny without inactivity claim.
2. Tenant mismatch → deny; no mutation.
3. Not authenticated → deny; no idle renewal.
4. If `now >= idleExpiresAt` or `now >= expiresAt` → deny; ensure authenticated access
   ended; do not revive.
5. Else set `lastActivityAt = now`, recompute `idleExpiresAt`; leave `expiresAt` and
   `idleDurationMinutes` unchanged.

**Atomic store transition**: Load-check-write MUST NOT use a blind `SET XX` after a
separate read. Renewal and idle-clearance MUST compete via an **atomic conditional**
Redis transition (WATCH/MULTI, Lua, or compare-and-set on expected authenticated shape +
`idleExpiresAt` / generation).

**Clock authority (pinned)**: The **application clock** remains authoritative. Sample
`nowSeconds` **immediately before** starting the Redis conditional write and pass that
value into the CAS (Lua ARGV or application-side compare before EXEC). Do **not** claim
Redis `TIME` as the product clock, and do **not** claim an impossible “re-sample
application now inside MULTI.” Cancellation-safe protocol: if the store times out, WATCH
detects a conflict, or EXEC is aborted before apply, the write MUST NOT land (fail closed;
deny renewal / no revival). Cover with a contract/unit case for a delayed heartbeat that
exceeds `storeTimeoutMs` without extending the deadline. When the race is lost:

| Lost-race outcome                         | Result                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| Clearance already wrote anonymous + cause | Deny renewal; **no** overwrite of post-clearance anonymous record      |
| Newer accepted heartbeat already applied  | Deny or no-op; do not regress `lastActivityAt` / `idleExpiresAt`       |
| Expected shape / generation mismatch      | Deny; fail closed; no revival                                          |
| Store timeout / aborted EXEC              | Deny; fail closed; no revival                                          |

**Coalescing / rate bound**: server MUST coalesce or rate-limit accepted renewals.
Indicative default (E4): ignore redundant Redis writes within **~1s** when the computed
`idleExpiresAt` is unchanged. Tasks MAY adjust the window with rationale. Client MAY
debounce deliveries. Neither bound creates a grace period past `idleExpiresAt`. Store
timeout / failure on renewal → fail closed (deny; no revival).

### Qualifying vs non-qualifying (client duty)

May call renewal only for deliberate **user-originated** `keydown`, pointer
(`pointerdown`), `touchstart`, or scrolling driven by trusted `wheel` / touch /
pointer / keyboard input. MUST NOT renew on bare `scroll` alone (programmatic
`scrollTo`, layout, or infinite-scroll callbacks are not qualifying). MUST NOT call for
passive reading, polling, prefetch, or automated keepalives.

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

| Event                              | Result                                                                |
| ---------------------------------- | --------------------------------------------------------------------- |
| Activity with `now < idleExpiresAt`  | Restart idle period                                                   |
| Activity with `now >= idleExpiresAt` | No revival; access remains ended                                      |
| Absolute expiry                    | Access ended; claim inactivity only if idle evidence also established |
| Store miss / 503                   | Deny access; **no** inactivity assertion                              |
| Lost CAS vs clearance              | Deny; anonymous clearance retained                                    |

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

| Condition                                                          | Authenticated access | Cause label                                                      |
| ------------------------------------------------------------------ | -------------------- | ---------------------------------------------------------------- |
| Authenticated; `now < idleExpiresAt` and `now < expiresAt`         | Allowed              | n/a                                                              |
| `now >= idleExpiresAt` and `now < expiresAt`                       | Denied               | `inactivity`                                                     |
| `now >= expiresAt` (absolute binds first or alone)                 | Denied               | **not** inactivity unless idle evidence also established         |
| Missing session                                                    | Denied               | not inactivity                                                   |
| Store timeout / 503                                                | Denied               | not inactivity                                                   |
| Anonymous replacement after idle                                   | Denied for protected | `inactivity` if cause/latch retained                             |

Exact status codes for document vs non-document follow existing Proxy patterns (SSR recovery
UI vs `401`/`403` as applicable); contract tests care about **authorization outcome** and
**cause accuracy**, not inventing new public diagnostic endpoints.
