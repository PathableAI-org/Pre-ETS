# Data Model: Protect Expired Content and Offer Explicit Accessible Recovery

**Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

This feature adds no stored server data. It extends one server value, the tab coordinator's view states, and one
browser-local record. The states below extend the tab coordination states that #155 delivered
([163 data model](../163-coordinate-tab-activity/data-model.md)). That historic document is not edited.

## Session end cause

`SessionEndCause = "expired" | "unknown"` is the closed set the gate and the recovery copy share.

| Source                           | `expired` when                                                                      | Otherwise |
| -------------------------------- | ----------------------------------------------------------------------------------- | --------- |
| Gate (`protectRequest`)          | `NoUsableSession.expired === true`: the store returned the record past its deadline | `unknown` |
| Tab (A3 denial, B expired state) | Gate token `expired`, or known expiration (research D7)                             | `unknown` |

Known expiration: the tab observed no logout of the session, and its held deadline (server clock) is at or before
the later of its calibrated server-time estimate and the `Date` header of the server's `Ended` answer.

## Tab views

| View            | Content                 | Header (Log out) | Presentation                                     | Entered from                                                                                                 | Writes ended record     | Focus                           |
| --------------- | ----------------------- | ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------- |
| `active`        | Mounted (may be hidden) | Shown            | Content, or "Checking your session…" when hidden | Mount; renewal adopted                                                                                       | No                      | Unchanged                       |
| `logging-out`   | Mounted (may be hidden) | Busy             | Content or concealed                             | Own Log out                                                                                                  | No                      | Unchanged                       |
| `logout-failed` | Hidden                  | Shown            | Failure alert                                    | Logout refused                                                                                               | No                      | Unchanged                       |
| `ended`         | Unmounted               | Unmounted        | Signed-out notice (#155)                         | Logout observed; `Ended` without known expiration; peer record `ended`                                       | Yes, `cause: "ended"`   | Notice heading (initiating tab) |
| `recovery` (A3) | Unmounted               | Unmounted        | Recovery notice with cause                       | Protected action denied and the server confirms the session ended (research D6)                              | **No** (FR-008)         | Recovery heading                |
| `expired` (B)   | Unmounted               | Unmounted        | Expiration modal                                 | `Ended` with known expiration at the deadline or on resume; peer record `expired` without an observed logout | Yes, `cause: "expired"` | Modal's Log in link             |

`ended`, `recovery`, and `expired` are terminal for the coordinator instance. A new session remounts the coordinator,
because the `(app)` layout keys it by coordination tag. A terminal view therefore never restores concealed content
(FR-024). Temporary concealment (`concealed: true` in `active`) is never presented as `expired` (FR-016).

### Transitions added by this feature

- `active` → `active` concealed (B): the local deadline is reached. The tab conceals while it confirms (research
  D10). `Usable` reveals it.
- `active` → `recovery`: a protected action is denied and the status read answers `Ended`. The cause comes from the
  token or D7.
- `active` (concealed or not) → `expired`: a status answer of `Ended` at the deadline, on resume, or after a denial
  that B routes to the same predicate when the tab has known expiration.
- `active` → `expired`: a peer's ended record with `cause: "expired"`.
- `ended`, `recovery`, or `expired` with a later peer record: no change. `ended` after an observed logout stays
  `ended` (FR-019).
- `expired` → hidden modal on `pagehide`. The restored page reloads through `RestoredPageGuard` (FR-018).

## Ended record (browser `localStorage`, per coordination tag)

| Field     | Type                     | Change                                                                         |
| --------- | ------------------------ | ------------------------------------------------------------------------------ |
| `endedAt` | epoch milliseconds       | Unchanged                                                                      |
| `cause`   | `"ended"` \| `"expired"` | New in B. A missing field reads as `ended`, for compatibility with older tabs. |

The record is written only after a server `Ended` answer or a completed logout, never on a local deadline alone.
