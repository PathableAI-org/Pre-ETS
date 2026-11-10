# Research: Coordinate Intentional Activity and Logout Across Session-Sharing Tabs

**Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md) | **Verification**: [verification.md](verification.md)

Facts were read on 2026-11-09 from the specification branch `163-coordinate-tab-activity` at `9ebdccc`, and re-checked against `eac5c08`, which sits on
`origin/main` `00116612`. That revision includes S1 (PR #355), S2, the B5 decision (PR #360), and the B6 decision
(PR #359). Installed versions were read from this worktree's `node_modules`.

## Authority inputs

- The approved feature contract is [spec.md](spec.md) and [verification.md](verification.md). This plan does not
  change an acceptance scenario, functional requirement, success criterion, or verification claim.
- [Delivery plan S3](../../docs/delivery/session-management.md#s3--coordinate-intentional-activity-and-logout-across-session-sharing-tabs)
  and the B5 and B6 decisions in the same document govern timing, resume, and fresh authentication. The B5 rules this
  plan encodes are:
  - **B5-W (windows):** in-page qualifying interaction opens a 60-second window measured from the session's most
    recent in-page activity communication by any tab, and is sent immediately. Interaction inside an open window is
    coalesced and sent once when the window ends. Interaction when the shared authoritative deadline is under 60
    seconds away is sent immediately. Deliberate page fetches and form submissions renew with their own request.
    Logout is immediate and never coalesced.
  - **B5-S (synchronization):** while sharing tabs run and the server is reachable, every other sharing tab reflects
    a renewed deadline within 2 seconds of the renewal response, and conceals protected content within 2 seconds of
    the server ending the session by logout.
  - **B5-E (no early expiration):** a tab reaching its locally known deadline confirms with the server before it
    expires, conceals, or denies protected use.
  - **B5-R (resume):** on becoming visible, unfrozen, or restored from the back/forward cache, a tab past its known
    deadline conceals at once and confirms; otherwise it confirms and conceals within 2 seconds if the session
    ended. Temporary resume concealment is not the expired state. Back/forward restoration without a valid session
    follows SESSION-004 fresh entry, not an expiration modal. Pre-script paint is a limitation.
  - **B6:** every login without a valid application session requires fresh authentication. This is why a remaining
    identity-provider session after application logout cannot silently restore application access (F-2).
- Accepted requirements PREETS-SESSION-009 AC1–4 and PREETS-SESSION-010 AC1–3, AC5, and AC6 (activity and logout) are
  read from `origin/main` `00116612`.

## Review corrections (2026-11-09)

The first plan review found these defects. Each is corrected in the decision named; none changes the specification.

| ID  | Defect found                                                                                                                                    | Correction                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Snapshot construction in the handler module created the cycle `next/session.ts → next/coordination.ts → next/cookies.ts → next/session.ts`.     | Tag and snapshot move to a dependency-leaf child, `next/coordination-snapshot.ts`, used by both the read and the handlers (contracts).                                                                                                |
| R2  | A stale tab's Server Action carries the later session's cookie, and the gate renews it from `next-action` alone.                                | Submit guard against the shared current-session record, plus a tag field that protected actions check before any effect (D2).                                                                                                         |
| R3  | A new tab can miss a logout broadcast sent before its coordinator subscribes and keep stale content visible.                                    | Replayable ended-session record and a subscribe-then-replay mount (D14). Exposure until the coordinator mounts is acknowledged gap G1 (user decision 2026-11-10).                                                                     |
| R4  | Committing gated real-login scenarios before #158 would fail nightly BDD; `@partial` does not skip scenarios.                                   | Increments 1–4 commit only executable ungated scenarios; gated journeys stay planned prose until increment 5 (plan, quickstart).                                                                                                      |
| R5  | The gate renews a `POST` with `next-action`, or a navigation `GET`, to the new endpoints before the handler runs.                               | The gate treats the three endpoint paths as protected, never-renewing application requests regardless of request shape, with composed evidence (D1).                                                                                  |
| R6  | Ordering snapshots by deadline magnitude drops a newer refresh that shortened the timeout (S2 policy refresh).                                  | Snapshots are ordered by server read time, not deadline (D6).                                                                                                                                                                         |
| R7  | Gesture tracking on the content wrapper misses Tab from the header or body into protected content.                                              | Gestures are observed at document capture; only targets inside protected content qualify (D4).                                                                                                                                        |
| R8  | A stale flush timer could send a newer window's pending activity early.                                                                         | The flush re-checks the session tag and the current window's due time under the lock and reschedules otherwise (D5).                                                                                                                  |
| R9  | Hydration-only propagation of a document-entry renewal can exceed the 2-second bound.                                                           | Not handled, by user decision (2026-11-10): the coordinator broadcasts the page-load renewal when it mounts. Acknowledged gap G2 (D6, D14).                                                                                           |
| R10 | A logout response delayed past a fresh login in another tab would clear the later session's cookie with `Max-Age=0`.                            | Logout responses never touch the cookie; the record removal is authoritative, and a dead reference grants nothing (D8).                                                                                                               |
| R11 | If the initiating tab closes or crashes after the server ended the session but before broadcasting, other tabs had no trigger to conceal.       | Logout announces `logout-started` first; every other tab confirms each second until it sees the outcome; the request uses `keepalive` (D8).                                                                                           |
| R12 | A delayed renewal response (activity handler or gate) for an earlier session re-issues its cookie and overwrites a later session's cookie.      | Only session establishment writes `pathable-session`, without `Max-Age`; renewals and logout never set it (D15).                                                                                                                      |
| R13 | A snapshot stamped with server time after a read can carry older state than a renewal that completed meanwhile.                                 | Snapshots carry `observedAtEpochMilliseconds`, the Redis `TIME` returned atomically by the store transition that produced them; ordering uses it, conversion uses `serverTimeEpochMilliseconds` (D6).                                 |
| R14 | A stale document can overwrite the current-session record, and a mismatch was treated as proof the tab's session ended.                         | The current-session record is a hint: a mismatch triggers confirmation, never `Ended`; only server-confirmed outcomes end a tab (D2, D9).                                                                                             |
| R15 | The submit guard dropped legitimate submissions while a tab was visibly confirming.                                                             | Submissions proceed in `Active` and `Confirming` with a matching hint; a mismatch holds the submission, confirms, and replays it with `requestSubmit` when the tab's session is confirmed current (D2).                               |
| R16 | Redis `TIME` values can tie, so strict ordering by `observedAt` can drop a changed deadline or policy.                                          | The session record gains a `revision` counter, incremented on every write; tabs adopt a snapshot only when its revision is higher. `observedAt` is kept alongside for diagnostics (D6; user decision 2026-11-10).                     |
| R17 | A stale document can rewrite the hint to its own tag and then submit; the gate would renew the later session before the action rejects the tag. | The gate no longer renews Server Actions. A protected action calls `authorizeSessionAction`, which checks the tag and then renews (D2).                                                                                               |
| R18 | A network failure on logout does not show that logout failed, but `logout-failed` stopped the other tabs' confirmation watch.                   | `logout-failed` is sent only for a definitive 403 or 503; on network failure or timeout the initiator and the watching tabs keep confirming (D8).                                                                                     |
| R19 | With storage unavailable, a held submission is confirmed and replayed, then held again in a loop.                                               | A confirmed replay carries a one-shot in-memory pass for that form and submitter; the confirmed tag is also kept in memory as the hint when storage fails (D2).                                                                       |
| R20 | A stale tab could overwrite the current session's single activity-window record.                                                                | Window records are keyed by tag (`preets-session-activity:v1:<tag>`); a tab writes only its own tag's record (D3, D5).                                                                                                                |
| R21 | A keepalive logout reaching the server after the 10-second watch could end the session unseen by stopped watchers.                              | The logout body carries `notAfter` (server clock + 10 s, from the tab's server offset); the handler refuses a later arrival with 408 and no store write. Watches run until `notAfter` + 2 s, so no invalidation can follow them (D8). |
| R22 | A 503 can follow a delete that applied (S2 covers `DEL` applying before its reply fails), so it does not prove logout failed.                   | 503 is ambiguous like a network failure; `logout-failed` is broadcast only after `notAfter` has passed and status confirms the session still usable (D8).                                                                             |
| R23 | A logout after page parse but before hydration had no listener to conceal content.                                                              | Not handled, by user decision (2026-11-10); part of acknowledged gap G1 (D14).                                                                                                                                                        |
| R24 | Without storage or locks, every interaction was sent immediately, breaking FR-007 coalescing.                                                   | Fallback keeps the window in memory per tab and shares communication times over the channel; only a near-simultaneous cross-tab race can duplicate a send, recorded as a limitation (D5).                                             |
| R25 | The ungated positive-renewal BDD scenario needs a usable session, which BDD cannot create before #158.                                          | Ungated BDD keeps only no-session denial scenarios; prepared-record renewal stays in quickstart §3 and integration tests (quickstart §4).                                                                                             |
| R26 | `logout-failed` named only the session, so one attempt's failure stopped watches for a later pending attempt.                                   | Each attempt has an `attemptId`; tabs keep watching while any attempt of their tag is unresolved and unexpired (D8).                                                                                                                  |
| R27 | Checking `notAfter` on receipt did not bound when the delete commits; an admitted request could delete after watchers stopped.                  | The cutoff is enforced inside the store's invalidation script against Redis `TIME`, atomically with the delete; watches run until `notAfter` + 3 s (D8).                                                                              |
| R28 | A tab mounting or resuming during an interrupted logout never started a watch.                                                                  | Pending attempts are kept in `preets-session-logout-pending:v1`; mount and resume replay unexpired attempts of the tab's tag and start the watch (D8, D14).                                                                           |

## Current implementation facts

- **Session service** (`packages/frontend-services/src/session.ts`): `SessionService` offers `establish`,
  `invalidate`, `read`, `readForTenant`, and `refreshForTenant`. `QualifyingSessionActivity` already names every S3
  qualifying kind (`deliberate-page-request`, `deliberate-form-submission`, `intentional-control-activation`,
  `keyboard-interaction`, `text-entry`, `touch-interaction`, `user-driven-meaningful-input-focus`) plus S4's
  `continue-session`. `refreshForTenant` renews only for a qualifying activity, applies the supplied effective
  policy, returns `NoUsableSession` for a missing or expired record (no revival, S2), and fails with
  `SessionTenantMismatch` or `SessionServiceUnavailable`. `invalidate` deletes the record and returns
  `NoUsableSession`. No store or record change is needed for S3.
- **Default protection** (`next/protection.ts`, S1): every protected request resolves the request tenant, then reads
  the session. Document entries (`GET`/`HEAD` navigations) renew as `deliberate-page-request`; `POST` with
  `next-action` renews as `deliberate-form-submission`; every other request, including `fetch`, RSC navigation,
  prefetch, refresh, and subresources, only reads. No session answers 307 (document) or 401 (application); mismatch
  403; undeterminable 503. Renewal re-issues `pathable-session` with `Max-Age` equal to the remaining idle seconds.
- **Reads for pages** (`next/session.ts`): `readSessionRequest({ host, reference })` resolves the tenant and returns
  `{ session, tenantAlias }`; it is used by `(app)/page.tsx` and `(app)/actions.ts`.
- **Cookies** (`next/cookies.ts`): `setSessionCookie(response, request, reference, maxAgeSeconds)` and
  `remainingIdleSeconds`. There is no session-cookie clearing helper; `clearCorrelation` shows the pattern.
- **Next app**: `(app)/layout.tsx` returns its children only. The root layout renders `RestoredPageGuard`, which
  reloads a page restored from the back/forward cache and refreshes the route on `popstate`. There is no logout
  action, no client session state, and no cross-tab communication anywhere in the repository.
- **Fixtures**: `/_test/onsite` is a multi-control page, but `/_test/**` is publicly designated (S1), so it cannot
  carry protected-session evidence.
- **Tenant policy** (`docs/multi-tenancy.md`): explicit idle timeout is an integer from 5 through 30 minutes.
- **Freshness**: the callback cannot establish a session until #158 supplies freshness confirmation, so a real session
  cannot be created in the running application (spec Authority finding 1).

## Installed dependency facts

| Dependency                      | Version       | Fact used by this plan                                                                                                                                                           |
| ------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next`                          | 16.4.5        | Route Handlers export `GET`/`POST` taking `NextRequest`; `NextResponse.json(body, init)` exists (`server/web/spec-extension/response.d.ts`). Proxy runs before Route Handlers.   |
| `react` / `react-dom`           | 19.3.1        | Client components with `useEffect`/`useSyncExternalStore`; `hidden` and `inert` are supported DOM attributes in React 19.                                                        |
| `effect`                        | 4.1.2         | `Effect.fn`, `Effect.fnUntraced`, `Schema.Struct`, `Schema.Literals`, `Schema.decodeUnknownEffect`, `Schema.fromJsonString`, `Clock.currentTimeMillis`, `Schema.TaggedError`.    |
| `@pathableai/react`             | 0.3.0         | Public exports include `Alert`, `Button`, `Header`, `Heading`, `Link`, `Loading`, `Stack`, `Text`, `Form`, `FormGroup`, `Input`, `Select`, `Checkbox`, `Textarea`.               |
| TypeScript DOM lib (frontend)   | 6.0.3         | `BroadcastChannel`, `LockManager` (`navigator.locks`), `PageTransitionEvent`, `Storage`. Page Lifecycle `freeze`/`resume` are not typed on `Document`; listen by event name.     |
| `playwright`                    | 1.65.0        | `BrowserContext.clock` and `Page.clock` exist (`types.d.ts`), so all tabs in a context can share controllable browser time. Multiple contexts give independent browser contexts. |
| `vitest` / `@fast-check/vitest` | 5.1.0 / 0.5.0 | Frontend unit tests run in the `node` environment; pure modules are testable there. frontend-services already uses Fast-Check through `@fast-check/vitest`.                      |

## Decisions

### D1. Server endpoints as Next Route Handlers built by frontend-services; the gate never renews on them

**Decision**: Add three Route Handlers whose behavior lives in `frontend-services` host adapters, wired by thin
files in the Next app:

- `POST /session/activity` — renews the session for one in-page qualifying activity kind.
- `GET /session/status` — reads the session without renewing it (confirmation at a local deadline, on resume, and
  after a protected Server Action).
- `POST /auth/logout` — invalidates the session. It never sets or clears a cookie (R10).

All three are protected application requests under the S1 gate. The gate gains one closed set,
`NON_RENEWING_PATHS = {"/session/activity", "/session/status", "/auth/logout"}`: a request to one of these exact
paths is classified as a protected application request with no renewal, whatever its method, Fetch Metadata, or
`next-action` header (R5). The gate therefore reads, answers 401 without a usable session, 403 on tenant mismatch,
and 503 when undeterminable, then passes to the handler. A navigation never receives the login redirect there,
because these paths are never document entries. Each handler resolves the request tenant again, re-checks the
session, and produces its own outcome. Only the activity handler renews, after its tag check.

**Rationale**: The gate's renewal classes come from request shape and must not trust a client claim; an in-page
activity kind is a request-body claim that only an activity-specific handler can decode. Without the non-renewing
set, a crafted `POST` with `next-action` or an address-bar `GET` to these paths would renew before the handler's tag
check could refuse it. The change is additive: S1's public designation and outcome matrix are unchanged, and its
designation property gains the rule that these paths never renew. Route Handlers are the Next
convention for non-page HTTP endpoints, and the existing login and callback handlers set the pattern
(`createLoginHandler`, `createCallbackHandler`).

**Alternatives considered**: (a) Teach the gate to renew for `POST /session/activity` — rejected: it would couple
the gate to a body format and blur its read-or-renew contract. (b) Server Actions for activity and logout — rejected:
Server Action requests renew at the gate as `deliberate-form-submission`, so an activity communication would be
counted twice and a logout would renew before ending the session; actions also cannot return a 401 the client
distinguishes from a defect. (c) A backend endpoint — rejected: sessions are frontend-owned temporary state.

**Cost**: Each communication costs two store operations (gate read, handler refresh). Communications are bounded by
B5-W to about one per minute per session plus near-deadline sends, so this is accepted.

### D2. A derived, one-way session coordination tag binds activity, status, and logout to one session

**Decision**: Each usable session has a **coordination tag**, computed on the server as
`base64url(SHA-256("preets:session-coordination:v1\0" + reference))`. The tag is delivered to the tab with the
session snapshot. Activity and logout requests carry the tag the tab observed. The handler derives the tag from the
request's current `pathable-session` cookie and refuses the operation when they differ: activity is not renewed
(HTTP 409), and logout invalidates nothing (HTTP 409). Status returns the current tag so a tab can tell that a
different session is now in force. Cross-tab messages carry the tag, and a tab ignores messages for another tag.

**Rationale**: The cookie is browser-wide, so a stale tab's request carries whatever session is current. Without a
binding, queued activity from a tab that saw session S1 would renew a later session S2 after logout and re-login
(spec edge case; FR-016; US5 AC4; V-012), and a stale tab's Logout would end S2. The tag is not the reference, is
not the store key (the store hashes the bare reference; the tag is domain-separated), cannot be inverted to the
reference, and grants nothing on its own: every operation still requires the HttpOnly cookie. It therefore satisfies
FR-022's prohibition on exposing references, tokens, or storage internals. The tag needs no record change (the separate revision counter of D6 does).

**Server Actions (R2, R17)**: Server Action requests are built by Next's router, so a tab cannot add the tag as a
header. The gate therefore **no longer renews Server Actions**: a `POST` with `next-action` is a protected application
request that only reads at the gate. Renewal moves into the action, after the tag check. Binding is enforced at two
points:

1. **Submit guard (prevents the renewal).** On mount, each tab writes its tag to the shared current-session record
   `preets-session-current:v1` and broadcasts `session-current`. The record is a **hint**, not proof (R14): a stale
   document parsed late can write an older tag. The coordinator handles `submit` in the document capture phase. In
   `Active` or `Confirming` with the hint equal to its tag, the submission proceeds (R15). With a different hint, the
   coordinator holds the submission (`preventDefault`), confirms with `GET /session/status`, and then either replays it
   with `form.requestSubmit(submitter)` when the response shows this tab's tag (rewriting the hint to the confirmed
   tag), or ends the tab when the response shows another tag or 401. The replay carries a one-shot in-memory pass for
   that form and submitter, so it is not held again even when the hint write fails. When `localStorage` is
   unavailable, the confirmed tag is kept in memory as this tab's hint (R19). In `Concealed`, `LogoutFailed`, and `Ended` the
   content is `inert` or unmounted, so no submission can start. A tab that sees a different hint by message or
   `storage` event confirms; it never ends on the hint alone. A suspended tab reads the hint synchronously on resume
   and confirms before handling input.
2. **Validated renewal (prevents the renewal and the effect).** Every protected Server Action form includes a hidden
   `coordinationTag` field. The action calls `authorizeSessionAction({ host, reference, coordinationTag })` from
   frontend-services before any effect. It resolves the tenant, compares the submitted tag with the cookie's tag, and
   only then renews as `deliberate-form-submission` through `refreshForTenant`. A mismatch returns `SessionChanged`
   with no store write; the action returns `Denied` with no effect. A stale document that rewrote the hint therefore
   still cannot renew or act on a later session (R17).

The earlier residual, an in-flight submission renewing a later session at the gate, no longer exists: the gate does
not renew actions, and the action's renewal follows its tag check.

**Alternatives considered**: (a) Expose the stored `telemetryId` — rejected: it would make a tracing identifier a
client-visible protocol value. (b) Add a coordination field to the stored record — rejected: a record-version change
for a value derivable from the reference. (c) Rely on time ordering alone — rejected: re-login can occur within one
activity window.

### D3. One client feature owns browser coordination; tabs share state through origin-scoped browser storage

**Decision**: A new Next app feature, `src/features/session-coordination.ts`, renders a `SessionCoordinator` client
component from `(app)/layout.tsx`, the layout of every protected page. It receives the server-read session snapshot as
props and owns the tab's coordination state, the logout control, concealment, and the signed-out notice. Tabs
communicate through:

- `BroadcastChannel("preets-session-coordination")` for renewal, communication, session-change, and logout events;
- three kinds of `localStorage` record: `preets-session-activity:v1:<tag>`, one per session tag, holding
  `{ lastCommunicatedAt, pendingSince }` for the B5-W window, so a stale tab can write only its own session's record
  and never displace the current one (R20; records for tags other than the hint's are pruned, keeping at most 4); `preets-session-current:v1` holding the tag of the most recently mounted session (R2); and
  `preets-session-ended:v1` holding the last few tags that ended by logout, so a tab that missed the broadcast can
  replay it (R3); and
- `navigator.locks.request("preets-session-activity", …)` so the read-decide-write on that record is atomic across
  tabs and exactly one tab sends a coalesced communication.

**Rationale**: B5-W windows are per session across tabs, so tabs need shared state with an atomic decision. All three
mechanisms are scoped to one origin within one browser storage partition. Host-mode tenants have distinct hosts, so
distinct origins, and a second browser context has its own storage partition; neither can see the other's messages
(FR-016, FR-022). Static mode serves one tenant per origin. The tag (D2) separates successive sessions in the same
origin. Messages carry only the tag, the deadline, the warning lead, and timestamps; never protected content.

**Alternatives considered**: (a) Server-side window tracking — rejected: it needs a new stored field and a
communication per interaction, contrary to B5-W's purpose. (b) `storage` events alone — rejected: slower and lossy
for event delivery; `localStorage` remains only as the shared record. (c) A `SharedWorker` — rejected: unnecessary
lifecycle and Safari support risk for one record and one channel.

### D4. Classifying qualifying in-page activity

**Decision**: A pure classifier maps a DOM event and its context to an `InPageSessionActivity` kind or `undefined`.
Only `event.isTrusted` events targeting a **meaningful input** inside the protected content qualify. A meaningful
input is the closest enabled, not `aria-hidden`, not `inert` element among `a[href]`, `button`, `input` (not
`hidden`), `select`, `textarea`, `summary`, `[contenteditable]`, and elements with an interactive ARIA role
(`button`, `link`, `checkbox`, `radio`, `switch`, `tab`, `menuitem`, `option`, `combobox`, `textbox`, `slider`,
`spinbutton`). Mapping:

| Event (trusted, on a meaningful input)                          | Kind                                 |
| --------------------------------------------------------------- | ------------------------------------ |
| `click` (including keyboard activation of a control)            | `intentional-control-activation`     |
| `beforeinput` on a text-entry control                           | `text-entry`                         |
| `keydown` (other than a lone modifier)                          | `keyboard-interaction`               |
| `pointerdown` with `pointerType === "touch"`                    | `touch-interaction`                  |
| `focusin` in the same task as a trusted `keydown`/`pointerdown` | `user-driven-meaningful-input-focus` |

Gesture events (`keydown`, `pointerdown`) are observed with document-level capture listeners, so Tab from the header
or page body into protected content sets the gesture flag (R7). Only events whose target is inside the protected
content wrapper can qualify; the header and the Log out control never produce activity.

Everything else is excluded: `pointermove`, `mousemove`, hover, `wheel`, `scroll`, a `focusin` without a user
gesture in the same task (programmatic focus), untrusted (script-dispatched) events, and all network traffic the
application makes on its own. The coordinator records the gesture in a flag that it clears with a zero-delay task,
which is how "same task" is decided.

**Rationale**: SESSION-009 AC1–2 and FR-004/FR-005 list the kinds. `isTrusted` excludes script-dispatched events.
Programmatic `element.focus()` produces a trusted `focusin`, so trust alone cannot separate it; correlation with a
user gesture in the same task does. When programmatic focus follows a user action in the same task, the user action
already qualifies, matching the spec edge case. Scrolling is not among the listed kinds, so it does not qualify.

**Alternatives considered**: `navigator.userActivation.isActive` — rejected: transient activation lasts seconds, so a
programmatic focus long after a click would qualify on its own.

### D5. The B5-W window decision is a pure function over the shared record

**Decision**: `decideActivityCommunication(record, input)` returns `send-now` or `coalesce-until(t)` and the next
record, where `input = { now, deadline, tag }`:

1. The record is read from the key of the tab's own tag, so another session's record is never read or written.
2. `deadline - now < 60 s` → `send-now`; `lastCommunicatedAt = now`, `pendingSince = undefined`.
3. No `lastCommunicatedAt`, or `now - lastCommunicatedAt ≥ 60 s` → `send-now`; same record update.
4. Otherwise → `coalesce-until(lastCommunicatedAt + 60 s)`; `pendingSince ??= now`.

At the window end, a tab whose timer fires acquires the lock and re-reads its own tag's record. It sends once only if the record
belongs to its session's tag, `pendingSince` is set, and `now ≥ lastCommunicatedAt + 60 s`. It then sets
`lastCommunicatedAt` to the send time and clears `pendingSince`. If the window was moved by a later communication, the
timer reschedules itself for the new due time instead of sending (R8). The flush is the pure function
`flushActivityCommunication(record, input)`, covered by the same property as the decision. Every running tab schedules
that timer when it observes a pending record, so the coalesced send survives the closing of the tab that saw the
interaction. Every tab with a known session also re-runs step 2 when its known deadline comes within 60 seconds and a
record is pending, so near-deadline coalesced activity is sent immediately.

**Rationale**: This is B5-W as written: windows are measured from the most recent communication by any tab, every
communication (including a near-deadline one) starts a new window, and no interaction waits more than 60 seconds.
A pure function lets Fast-Check state the B5-W invariants directly (D5 evidence in
[contracts/modules.md](contracts/modules.md)).

**Storage or locks unavailable (R24)**: when `localStorage` or `navigator.locks` is unavailable, each tab keeps the
window record for its own tag in memory, and every send broadcasts `communicated { at }` on the channel. Receiving tabs
update their in-memory `lastCommunicatedAt`, so the window stays shared across running tabs, and each tab flushes only
its own pending activity. Within one tab, the window is exact. Across tabs, two interactions within channel delivery
latency (milliseconds) can each send once. That duplicate is a renewal of a valid session, never a missed one, and is
recorded in [quickstart.md](quickstart.md#limitations). Without `BroadcastChannel` as well, only the per-tab window
applies.

**Limitation**: Browsers throttle timers in hidden tabs. The tab where interaction occurs is visible, so its timer is
not throttled; a pending record whose only running tabs are hidden may be sent late. This is recorded in
[quickstart.md](quickstart.md#limitations).

### D6. Deadline synchronization uses server-relative time and covers every renewal source

**Decision**: Every server snapshot carries `idleDeadlineEpochMilliseconds`, `observedAtEpochMilliseconds`,
`serverTimeEpochMilliseconds`,
`warningLeadMinutes`, and `coordinationTag`. A tab converts the deadline to local time as
`localNow + (deadline - serverTime)` when it receives a snapshot and broadcasts the converted deadline with the
policy. Renewal sources propagate as follows:

| Renewal source                                                | How other tabs learn within 2 seconds                                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| In-page activity communication (`POST /session/activity`)     | The sending tab broadcasts the response snapshot.                                                                              |
| Document entry (gate renewal)                                 | The new document's coordinator broadcasts its server-rendered snapshot when it mounts, after hydration (gap G2).               |
| Protected Server Action (renewal in `authorizeSessionAction`) | The consumer calls the coordinator's `confirm()` after the action settles; the tab reads `GET /session/status` and broadcasts. |

**Ordering (R6, R13, R16)**: the stored session record gains a `revision` counter. Establishment writes 1, and every
store write of the record increments it: a qualifying refresh and any policy adoption. Reads and excluded-activity
refreshes do not write, so they return the revision they observed. Snapshots carry that `revision`, and a tab adopts a
snapshot of its tag only when its revision is higher than the held one, whatever the deadline or timestamps. Equal
revisions describe the same stored state, so they are ignored. A status read that observed the record before a
concurrent renewal carries the lower revision however late its response arrives, and a refresh that shortened the
timeout carries the higher one. `observedAtEpochMilliseconds`, the Redis `TIME` read in the same atomic transition, is
kept alongside for diagnostics and evidence but is never the ordering key, because two transitions can share a
millisecond. `serverTimeEpochMilliseconds` is used only to convert the deadline to the tab's clock. The revision change
needs a stored-record schema version 2. Version 1 records decode as revision 0 and are rewritten as version 2 on their
next write; no real version-1 sessions exist while #158 blocks establishment. This ordering was decided by the user on
2026-11-10.

**Rationale**: B5-S measures from the renewal response, and tabs share one machine clock, so local-time broadcasts are
comparable. Server-relative conversion removes browser/server clock skew and still works when tests control browser
time. A Server Action's renewal is invisible to client code, so its consumer must ask; the only current consumer is
`ReferenceOperation`, and the fixture form follows the same rule.

**Acknowledged gap G2 — renewal by page load** (spec Acknowledged limitations, Authority finding 5; maintainer
decision 2026-11-10): a document-entry renewal reaches other tabs only after the new
document hydrates and its coordinator mounts. On a slow device or with delayed script bundles, the B5 2-second
synchronization bound for that renewal may be missed. Other tabs still confirm with the server before acting on their
own deadline (D7), so the gap cannot cause early expiration; it can leave another tab holding the older deadline and
policy for longer than 2 seconds. A pre-hydration inline script was considered and rejected as not worth its
complexity.

### D7. A tab confirms with the server before acting on its local deadline

**Decision**: Each tab keeps one timer at its known local deadline. When it fires, the tab requests
`GET /session/status`. A usable snapshot with the same tag is adopted and rebroadcast; the tab stays usable. A 401, or
a snapshot with a different tag, means this tab's session has ended: the tab conceals protected content and shows the
ended presentation (D8). A 403/503, a network failure, or no answer within 1.5 seconds is undeterminable: the tab
conceals temporarily and shows a status that the session could not be confirmed, then retries confirmation; it never
claims the session is valid (FR-021, V-015).

**Rationale**: B5-E and FR-012. A 401 cannot distinguish logout from expiration; a tab that received the logout
broadcast already knows, and otherwise expiration is the remaining cause.

### D8. Logout flow, signed-out presentation (maintainer decision A), and concealment strength

**Decision**:

- The `(app)` layout renders a **Log out** `Button` from `@pathableai/react` in a header region on every protected
  page (FR-013). Activation sends `POST /auth/logout` with `{ coordinationTag }` immediately, never through the
  activity window (FR-009).
- **Before the request (R11, R26, R28)**: the tab creates a random `attemptId`, adds
  `{ coordinationTag, attemptId, notAfter }` to `preets-session-logout-pending:v1`, broadcasts `logout-started` with
  the same fields, and then sends the request with `keepalive: true`, so it completes even if the tab closes.
  `notAfter` is the server-clock time 10 seconds ahead (computed from the tab's server offset, D6). Every other tab
  with that tag, including a tab that mounts or resumes later and replays the pending record, confirms through
  `GET /session/status` once per second while any attempt of its tag is unresolved and has not passed `notAfter` plus
  3 seconds. An attempt is resolved by `logged-out` for the tag or by `logout-failed` with its own `attemptId`. The
  outcome removes the attempt from the pending record, and expired entries are pruned.
- **Cutoff enforced at the delete (R21, R27)**: the handler passes `notAfter` to
  `SessionService.invalidate({ reference, notAfterEpochMilliseconds })`. The store's invalidation script reads Redis
  `TIME` and deletes the record only if `TIME ≤ notAfter`, in the same atomic step; otherwise it deletes nothing and
  the handler answers 408. A request admitted before the cutoff that pauses past it therefore cannot delete later.
  Watches run until `notAfter` plus 3 seconds, which covers the confirmation interval and assumes the application and
  Redis clocks agree within 1 second (recorded in [quickstart.md](quickstart.md#limitations)); after that no
  invalidation from the attempt can commit. A 401 or a different tag ends the tab. If the initiator dies after the server ended the session,
  each surviving tab therefore conceals within about one second of the server ending it, inside the 2-second bound.
  The initiator broadcasts `logout-failed` with its `attemptId` only for a definitive 403, or after `notAfter` has passed and its own status
  confirmation shows the session still usable. A network failure, timeout, or 503 is ambiguous, since the server may
  have removed the record and then lost or failed the reply (S2 covers `DEL` applying before its reply fails). In that
  case the initiator does not broadcast; it confirms with status itself, and the other tabs keep watching (R18,
  R22).
- **No cookie change (R10)**: the logout response sets no cookie. If it is delayed until another tab has completed a
  fresh login, an unconditional `Max-Age=0` would delete the later session's cookie. The removed record is the
  authority; the old reference left in the cookie names nothing and grants nothing, and the next login overwrites it.
- **204**: the server ended the session. The tab adds its tag to `preets-session-ended:v1`,
  then broadcasts `logged-out` for its tag, and shows the signed-out notice (D14). Every other running tab with that tag shows the same notice on receipt (FR-015, B5-S).
- **401** or **409**: the tab's session is no longer in force in this browser. The tab records its tag as ended,
  shows the signed-out notice, and broadcasts. It does not state that it ended a session (FR-021).
- **Network failure, timeout, 503, or 408 (R18, R22)**: outcome unknown (408 means the server refused a late attempt,
  so it is known not to have invalidated, but the tab still confirms rather than assuming). The tab conceals protected content and confirms with status
  until it gets an answer. A 401 or a different tag means the session ended: the tab records the tag as ended,
  broadcasts `logged-out`, and shows the notice. A usable same-tag answer means logout did not complete; the tab then
  behaves as below.
- **403, or confirmed still usable after `notAfter`**: logout did not complete. The tab conceals protected content, announces that logout could
  not be completed, keeps the Log out control available to retry, and does not broadcast (FR-021).
- **Signed-out notice (FR-023, SC-011, V-017; maintainer decision A, 2026-11-09)**: every tab — the initiating tab
  and each other sharing tab — shows an accessible signed-out notice (`Alert` with a heading and a polite live region)
  and an explicit **Log in** link to `/`. Following it is a deliberate navigation through S1's fresh-entry boundary;
  authentication never starts automatically. Focus moves to the notice heading in the initiating tab; other tabs do
  not steal focus but announce through the live region.
- **Concealment strength**: after logout or a confirmed ended session, the coordinator **unmounts** the protected
  content subtree, so nothing remains in the DOM, the accessibility tree, or the focus order. Temporary resume
  concealment (D9) and undeterminable confirmation (D7) instead set `hidden` and `inert` on the wrapper, which removes
  it from view, keyboard focus, and assistive technology while preserving unsaved input for restoration (FR-018).
- **Interim ended presentation**: a tab that confirms its session ended without a logout message (expiration) shows the
  same signed-out notice. #157 replaces that branch with the expired-state modal; this plan presents no expiration
  modal and no warning.

**Rationale**: FR-023 requires this outcome; the maintainer chose it (spec Authority finding 3, proposal A). Unmounting after logout is stronger
than hiding for a shared workstation, while hiding is required for temporary concealment that must restore content.

### D9. Resume handling

**Decision**: The coordinator listens to `visibilitychange` (to visible), the Page Lifecycle `resume` event, and
`pagehide`/`pageshow`:

- **Every resume, first**: read `preets-session-ended:v1`, `preets-session-logout-pending:v1`, and
  `preets-session-current:v1` synchronously; an unexpired pending attempt for this tag starts the logout watch (R28). If this tab's
  tag is in the ended record (written only after a server-confirmed logout), move to `Ended` at once. If the
  current-session hint differs, conceal temporarily and confirm before handling input; end only on a server-confirmed
  401 or different tag (R2, R3, R14).
- **Visible/resume, local deadline passed**: synchronously set `hidden`/`inert` (temporary concealment, not the
  expired state), then confirm (D7). Usable and same tag → adopt and restore. Ended → unmount and show the notice.
- **Visible/resume, local deadline not passed**: confirm while content stays visible. Ended → unmount and notice;
  undeterminable or no answer within 1.5 seconds → temporary concealment. Either way concealment happens within 2
  seconds (FR-019).
- **Back/forward cache**: on `pagehide` with `persisted === true`, set temporary concealment before the page enters
  the cache, so the restored snapshot shows no protected content. The existing `RestoredPageGuard` then reloads on
  `pageshow` with `persisted === true`; the reload is a document entry that the gate admits (content restored) or
  redirects to tenant login (fresh entry, SESSION-004), never an expiration modal (FR-020).
- Interaction after resume cannot revive an ended session: the server refuses late activity (S2) and the tag check
  refuses activity for a replaced session (D2).

**Rationale**: B5-R. Concealing at `pagehide` removes the restored-frame exposure that a `pageshow`-time concealment
would leave to timing. `RestoredPageGuard` stays the single owner of history-driven reload.

### D10. Same-origin enforcement for the new endpoints

**Decision**: The activity and logout handlers require a same-origin request: `sec-fetch-site: same-origin` when
present, otherwise an `Origin` header equal to the request origin; anything else is 403 before any session
operation. Bodies must be `application/json`; other content types are 415. Status is a `GET` with no effect and needs
no origin check beyond the gate.

**Rationale**: `SameSite=Lax` keeps the cookie off cross-site `POST` subrequests in current browsers, but a forced
cross-site logout or keep-alive is a confidentiality and idle-protection risk (Constitution III; FR-016). Fetch
Metadata is already the gate's classification input.

### D11. Retained protected multi-page semantic-control fixtures

**Decision**: Add two protected pages in the `(app)` route group, `/coordination/roster` and
`/coordination/participant`, rendered from a new feature entry `src/features/coordination-fixtures.ts`. They use only
synthetic content and `@pathableai/react` controls: a link between the pages, a button, a text input, a select, a
checkbox, a textarea, a programmatic-focus trigger (a control that moves focus after a timeout), and a protected
Server Action form that calls `confirm()` after it settles. They are ordinary protected resources under the S1 gate
and appear in the S1 inventory.

**Rationale**: The issue requires retained multi-page semantic-control fixtures that #157 and #156 extend. `/_test` is
public, so protected evidence needs protected pages. They carry no PHI and no business workflow.

### D12. Controllable time and authoritative deadline observation

**Decision**: Browser time is controlled with Playwright `BrowserContext.clock`, so every tab in a context shares one
controlled clock for windows, coalescing, and the 2-second bounds. Server time stays real; deadline-crossing journeys
use a synthetic tenant with the minimum 5-minute idle timeout. The authoritative deadline is observed through the
application's own `GET /session/status`, issued by the test from the same browser context through Playwright's
`context.request` (it shares the cookie jar, sends no page events, and status never renews, which module evidence
establishes). BDD steps therefore never open Redis, as the repository's BDD policy requires. The manual procedure may
additionally cross-check the owned record's deadline with a transient script that prints only the deadline. An event or
network call is never renewal evidence on its own.

**Rationale**: verification.md requires controllable time and authoritative-deadline observation. Introducing a
controllable server clock into the production runtime would add a test-only control surface to production code;
real time with the shortest permitted timeout is slower but changes no product contract.

### D13. Isolation analysis

| Isolation boundary           | Mechanism                                                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Another tenant, same browser | Host-mode tenants are separate origins: separate cookies, channels, storage, and locks. The gate resolves the tenant per request and refuses another tenant's session (S1). |
| Another browser context      | Separate cookie jar and storage partition; channels and locks do not cross contexts.                                                                                        |
| A later session, same origin | Coordination tag mismatch: messages ignored, activity 409 without renewal, logout 409 without invalidation (D2).                                                            |
| An ended session             | Store refuses renewal of a missing or expired record (S2); handlers answer 401.                                                                                             |

### D14. Mounting a protected document: subscribe, replay, then trust

**Decision** (R3): there is no inline mount script and no pre-paint concealment CSS. When the coordinator mounts
after hydration, it:

1. subscribes to the channel and the `storage` event;
2. replays `preets-session-logout-pending:v1`: an unexpired attempt for this snapshot's tag starts the logout watch
   (D8, R28);
3. replays `preets-session-ended:v1`: if it lists this snapshot's tag, the tab moves to `Ended` and unmounts the
   protected content;
4. otherwise adopts the server-rendered snapshot (D6), writes its tag to `preets-session-current:v1` (a hint, D2),
   and broadcasts `renewed` and `session-current`.

A logout writes the ended record before it broadcasts, so a tab that subscribes late still sees it at step 2.

**Rationale**: a server-rendered snapshot can predate a logout in another tab by the time the page loads. The ended
record makes that logout replayable once the coordinator runs.

**Acknowledged gap G1 — logout while a tab is loading** (spec Acknowledged limitations, Authority finding 5;
maintainer decision 2026-11-10): a tab that loads while another tab logs out can show protected
content from the time the browser paints the server-rendered page until its coordinator mounts and replays the ended
record. That window depends on hydration time and may exceed the 2-second concealment bound. The server still denies
every protected request from that tab, because the session record is gone (S2) and the gate refuses it (S1); no
protected operation or new content results. A pre-paint inline script that closed this window was considered and
rejected as not worth its complexity.

### D15. Only establishment writes the session cookie (R12)

**Decision**: the callback's establishment response is the only response that sets `pathable-session`. It is issued
without `Max-Age` or `Expires` (a browser-session cookie) and keeps its existing `HttpOnly`, `SameSite=Lax`, `Path=/`,
host-only, and loopback `Secure` attributes. The gate's renewal of document entries, a Server Action's renewal through `authorizeSessionAction`, the activity
handler, and logout set no cookie. The S1 gate behavior "re-issue `pathable-session` with `Max-Age` equal to the
remaining idle seconds" is withdrawn; `setSessionCookie` keeps one caller (the callback) and `remainingIdleSeconds`
keeps the callback's use only if still needed.

**Rationale**: any response that writes the cookie after establishment can be delayed until another tab has
established a later session, and the browser applies `Set-Cookie` regardless of whether script ignores the body. That
would replace or delete the later session's reference and break FR-016. The server record's TTL is the idle authority;
a cookie outliving its record holds a reference to nothing and grants nothing. No accepted requirement or approved S1
or S2 acceptance criterion fixes the cookie's lifetime (checked in the session requirements, S1 and S2 specifications,
and the delivery plan).

**Compatibility**: the gate's outcome matrix is unchanged except that renewals no longer carry `Set-Cookie`; S1's
module evidence for cookie re-issue is replaced by evidence that no renewal response sets a cookie.
`docs/session-state.md` is updated in implementation.

## Findings

### F-1. Real-session execution gate (spec Authority finding 1; planned resolution A, as S1)

- **Source**: issue #155 evidence progression; `docs/session-state.md`; #158 open.
- **Ambiguity**: none in the design; only execution of live multi-tab claims is blocked.
- **Impact**: increments 1–4 in [plan.md](plan.md#phase-4--implementation-architecture) are implementable and their
  module evidence is complete without a real session. Live browser claims V-001–V-004 and V-006–V-017 stay
  incomplete. Only the HTTP classification part of V-005 and the denial part of V-009 run with prepared records.
- **Decision required**: maintainer acceptance of proposal A from the spec, following S1's precedent (PR #355 merged
  increments 1–4 with `@partial` BDD and an evidence record reporting gated claims incomplete).
- **Plan**: proposal A. Increment 5 completes evidence after #158's freshness confirmation functions. When #158
  lands: rebase the implementation branch onto `main`, run quickstart §5 and §6 in full on one revision, replace each
  "incomplete" disposition with the executed result, and remove feature-level `@partial` only if no deferred
  SESSION-010 condition remains (it does remain, for #156/#157).

### F-2. Identity-provider session on logout (spec Authority finding 2; flagged, application session only)

- **Plan**: logout ends the application session only (`SessionService.invalidate`). No provider
  end-session request, no `id_token_hint` retention, and no RP-initiated logout are designed. B6 fresh authentication
  prevents a remaining provider session from silently restoring application access.
- **Flag**: if the maintainer later requires provider logout, it enters through the requirements workflow, and its
  design (RP-initiated logout, post-logout redirect registration per tenant, token-hint storage) is a separate plan.
  Nothing in this plan forecloses it: the logout handler is the single place a provider step would be added.

### F-3. Presentation in tabs after logout (spec Authority finding 3; resolved in the specification)

- **Decision**: the maintainer selected proposal A on 2026-11-09. The specification records it as US3 scenario 6,
  FR-023, SC-011, and V-017: after logout, every sharing tab shows an accessible signed-out notice with an explicit
  Log in action into the tenant's fresh-entry flow, and no tab starts authentication automatically. The design is
  in D8.

### F-4. Logout when a later session is in force (non-blocking)

- When a tab's tag differs from the current cookie's, logout invalidates nothing (409) and the tab shows the
  signed-out notice because its session is no longer usable from this browser. The earlier session's record, if it
  still exists, expires by idle timeout. FR-021 is respected because the tab does not report that it ended a session.
  Whether re-login should invalidate a predecessor session is outside S3.

### F-5. Coordination and logout require JavaScript (non-blocking)

- The protected pages render on the server, but coordination, concealment, and the logout control are client
  behavior. Without JavaScript, protected access remains server-enforced (gate, idle expiry) and logout is
  unavailable. This is consistent with the B5 browser mechanisms, which are inherently script-driven.
