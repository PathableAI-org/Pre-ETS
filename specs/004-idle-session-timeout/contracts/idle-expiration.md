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

`recordQualifyingActivity({ sessionId, tenantId, at })` (name indicative):

Accepted **only** for an authenticated same-tenant session cookie (host-bound
`pathable-session` matching the session tenant). No public diagnostic route for
idle state or renewal.

1. Load session; missing → deny without inactivity claim.
2. Tenant mismatch → deny; no mutation.
3. Not authenticated → deny; no idle renewal.
4. If `at >= idleExpiresAt` or `at >= expiresAt` → deny; ensure authenticated access ended;
   do not revive.
5. Else set `lastActivityAt = at`, recompute `idleExpiresAt`; leave `expiresAt` and
   `idleDurationMinutes` unchanged.

**Coalescing / rate bound**: server MUST coalesce or rate-limit accepted renewals.
Indicative default (E4): ignore redundant Redis writes within **~1s** when the computed
`idleExpiresAt` is unchanged. Tasks MAY adjust the window with rationale. Client MAY
debounce deliveries. Neither bound creates a grace period past `idleExpiresAt`. Store
timeout / failure on renewal → fail closed (deny; no revival).

### Qualifying vs non-qualifying (client duty)

May call renewal only for deliberate keyboard, pointer, touch, or scroll. MUST NOT call for
passive reading, polling, prefetch, or automated keepalives.

## Idle expiry side effects

When idle deadline is reached or detected:

1. Authenticated access ends (clear `userId` / `userName` / idle fields, or replace with
   anonymous tenant session).
2. Set anonymous `accessEndedCause: "inactivity"` for recovery UX (FR-008/009).
   Consume-once clears that field after recovery UI read—**once per session end**.
   Multi-tab-safe: first successful server confirmation notifies same-origin siblings via
   `BroadcastChannel` `inactivity-confirmed`; siblings MUST NOT be stranded without an
   inactivity path after Redis consume (see [inactivity-recovery.md](./inactivity-recovery.md)).
3. Clear temporary session draft data.
4. Absolute Redis TTL / `expiresAt` handling remains per session-state rules; anonymous
   continuity MUST NOT restore protected access (FR-007).

## Ordering

| Event                               | Result                                                                |
| ----------------------------------- | --------------------------------------------------------------------- |
| Activity with `at < idleExpiresAt`  | Restart idle period                                                   |
| Activity with `at >= idleExpiresAt` | No revival; access remains ended                                      |
| Absolute expiry                     | Access ended; claim inactivity only if idle evidence also established |
| Store miss / 503                    | Deny access; **no** inactivity assertion                              |

## Multi-tab / multi-session

| Situation                        | Idle behavior                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Tabs sharing `pathable-session`  | Shared Redis record; one activity renews all; recovery sync per [inactivity-recovery.md](./inactivity-recovery.md) |
| Separate session cookie / device | Independent idle deadlines                                                                                         |
| Activity for tenant B            | Must not renew tenant A’s session                                                                                  |

## Session confirm / read (running-app)

Authenticated same-tenant session cookie only. Returns whether access is still
authenticated vs ended, and whether cause is `inactivity` when applicable. Consume of
`accessEndedCause` occurs on recovery UI read (once per session end)—not as a public
diagnostic dump of session internals. Full shape and failure stance:
[inactivity-recovery.md](./inactivity-recovery.md).

## HTTP / outcome classes (indicative)

| Condition                               | Authenticated access | Cause label                    |
| --------------------------------------- | -------------------- | ------------------------------ |
| `now < idleExpiresAt` and authenticated | Allowed              | n/a                            |
| `now >= idleExpiresAt`                  | Denied               | `inactivity`                   |
| Missing session                         | Denied               | not inactivity                 |
| Store timeout / 503                     | Denied               | not inactivity                 |
| Anonymous replacement after idle        | Denied for protected | `inactivity` if cause retained |

Exact status codes for document vs non-document follow existing Proxy patterns (SSR recovery
UI vs `401`/`403` as applicable); contract tests care about **authorization outcome** and
**cause accuracy**, not inventing new public diagnostic endpoints.
