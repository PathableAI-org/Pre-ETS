# Data Model: Coordinate Intentional Activity and Logout Across Session-Sharing Tabs

**Plan**: [plan.md](plan.md) | **Contracts**: [contracts/modules.md](contracts/modules.md)

No stored server entity or schema changes. The session record, its version-1 schema, and the Redis key layout from S2
are unchanged. This document records the browser-side state that the `session-coordination` feature owns, because
its transitions carry the B5 rules. All of it is private to that feature except the wire types in
[contracts/modules.md](contracts/modules.md#pathableaipre-ets-frontend-services--next-host-adapters-srcnextts-re-exported-from-srcindexts).

## Server-provided snapshot

`SessionCoordinationSnapshot` — `{ coordinationTag, idleDeadlineEpochMilliseconds, observedAtEpochMilliseconds,
serverTimeEpochMilliseconds,
warningLeadMinutes }`. Delivered as `(app)/layout.tsx` props and as the 200 body of activity and status. Converted on
receipt to a **local deadline** `localNow + (idleDeadlineEpochMilliseconds - serverTimeEpochMilliseconds)`.

## Shared activity-window record

Stored in `localStorage` under `preets-session-activity:v1`; read and written only inside
`navigator.locks.request("preets-session-activity", …)`.

| Field                | Type                | Meaning                                                                              |
| -------------------- | ------------------- | ------------------------------------------------------------------------------------ |
| `coordinationTag`    | string              | Session the record belongs to. A record for another tag is treated as absent.        |
| `lastCommunicatedAt` | number \| undefined | Local time of the session's most recent in-page activity communication from any tab. |
| `pendingSince`       | number \| undefined | Local time of the earliest coalesced interaction not yet communicated.               |

Validation: a malformed or unparseable value is treated as absent. The record holds no protected content.

## Shared session records

Also in `localStorage`, read synchronously on mount and on every resume, and written before the matching broadcast.

| Key                         | Value                                         | Written when                                    | Effect on a reader                                                                |
| --------------------------- | --------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `preets-session-current:v1` | `{ coordinationTag }`                         | A protected document is parsed (inline script). | A tab with another tag ends; submissions are refused (D2).                        |
| `preets-session-ended:v1`   | `{ coordinationTags }` (last 8, newest first) | Logout 204, or 401/409 on logout or status.     | A tab with a listed tag ends; the inline script hides content before paint (D14). |

The window record's flush also checks that `now ≥ lastCommunicatedAt + 60 s` under the lock; a timer that fires early
for a moved window reschedules (D5).

## Channel messages

`BroadcastChannel("preets-session-coordination")`. Every message carries `coordinationTag`; receivers ignore other
tags and malformed messages.

| `type`            | Additional fields                                                    | Sent when                                                                                                        | Receiver effect                                                                                                                |
| ----------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `renewed`         | `localDeadline`, `observedAtEpochMilliseconds`, `warningLeadMinutes` | A tab receives a newer snapshot (activity, status, the inline mount script).                                     | Adopt if its store observation time is later than the held snapshot's, even with an earlier deadline; reschedule confirmation. |
| `pending`         | `sendAt`                                                             | A tab coalesces an interaction.                                                                                  | Schedule a window-end flush at `sendAt`.                                                                                       |
| `logged-out`      | none                                                                 | A tab's logout ends the session, or 401/409 shows it no longer in force; sent after the ended record is written. | Unmount protected content; show the signed-out notice.                                                                         |
| `logout-started`  | none                                                                 | A tab sends a logout request (before the request).                                                               | Confirm with status once per second until `logged-out` or `logout-failed`, at most 10 s (D8).                                  |
| `logout-failed`   | none                                                                 | The initiator's logout answered 403, 503, or failed.                                                             | Stop the logout watch.                                                                                                         |
| `session-current` | none                                                                 | A protected document mounts (inline script).                                                                     | A tab whose own tag differs ends at once.                                                                                      |

## Tab coordination states

```text
         snapshot (mount)
              │
              ▼
┌──────────► Active ◄───────────────────────────────┐
│             │  │                                   │
│ usable,     │  │ local deadline reached /          │ usable, same tag
│ same tag    │  │ resume (deadline not passed)      │
│             │  ▼                                   │
│             │ Confirming (content visible) ────────┤
│             │  │ 401 / other tag      │ no answer 1.5 s, 403, 503, network
│             │  ▼                      ▼
│             │ Ended ◄──────────── Concealed (hidden + inert) ──┘
│             │  ▲   401 / other tag      ▲
│             │  │                        │ resume with local deadline passed;
│             │  │ logged-out message     │ pagehide (persisted)
│             ▼  │ or logout 204/401/409  │
│      LoggingOut ──── 403 / 503 / network ──► LogoutFailed (concealed, retry offered)
│                                                 │ retry
└─────────────────────────────────────────────────┘ (via LoggingOut)
```

| State          | Protected content                    | Activity communicated | Presentation                                                     |
| -------------- | ------------------------------------ | --------------------- | ---------------------------------------------------------------- |
| `Active`       | Rendered                             | Yes                   | Header with Log out                                              |
| `Confirming`   | Rendered                             | Yes                   | None added                                                       |
| `Concealed`    | `hidden` + `inert` (state preserved) | No                    | Status "Checking your session…" (not the expired state)          |
| `LoggingOut`   | Rendered, Log out control busy       | No                    | Busy state on the control                                        |
| `LogoutFailed` | `hidden` + `inert`                   | No                    | Alert: logout could not be completed; Log out available to retry |
| `Ended`        | Unmounted                            | No                    | Signed-out notice with Log in link to `/` (FR-023)               |

`Ended` is terminal for the document. Leaving it requires a navigation (Log in), which the S1 gate decides.
#157 will distinguish expiration within `Ended` and present the expired-state modal there.
