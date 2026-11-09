# Research: Coordinate Intentional Activity and Logout Across Session-Sharing Tabs

**Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md) | **Verification**: [verification.md](verification.md)

Facts were read on 2026-11-09 from the specification branch `163-coordinate-tab-activity` at `9ebdccc`, which sits on
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

| ID  | Defect found                                                                                                                                | Correction                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Snapshot construction in the handler module created the cycle `next/session.ts → next/coordination.ts → next/cookies.ts → next/session.ts`. | Tag and snapshot move to a dependency-leaf child, `next/coordination-snapshot.ts`, used by both the read and the handlers (contracts).               |
| R2  | A stale tab's Server Action carries the later session's cookie, and the gate renews it from `next-action` alone.                            | Submit guard against the shared current-session record, plus a tag field that protected actions check before any effect (D2).                        |
| R3  | A new tab can miss a logout broadcast sent before its coordinator subscribes and keep stale content visible.                                | Replayable ended-session record, subscribe-then-replay mount, and pre-hydration concealment (D14).                                                   |
| R4  | Committing gated real-login scenarios before #158 would fail nightly BDD; `@partial` does not skip scenarios.                               | Increments 1–4 commit only executable ungated scenarios; gated journeys stay planned prose until increment 5 (plan, quickstart).                     |
| R5  | The gate renews a `POST` with `next-action`, or a navigation `GET`, to the new endpoints before the handler runs.                           | The gate treats the three endpoint paths as protected, never-renewing application requests regardless of request shape, with composed evidence (D1). |
| R6  | Ordering snapshots by deadline magnitude drops a newer refresh that shortened the timeout (S2 policy refresh).                              | Snapshots are ordered by server read time, not deadline (D6).                                                                                        |
| R7  | Gesture tracking on the content wrapper misses Tab from the header or body into protected content.                                          | Gestures are observed at document capture; only targets inside protected content qualify (D4).                                                       |
| R8  | A stale flush timer could send a newer window's pending activity early.                                                                     | The flush re-checks the session tag and the current window's due time under the lock and reschedules otherwise (D5).                                 |
| R9  | Hydration-only propagation of a document-entry renewal can exceed the 2-second bound.                                                       | A small inline script broadcasts the server snapshot when the document is parsed, before hydration (D6, D14).                                        |
| R10 | A logout response delayed past a fresh login in another tab would clear the later session's cookie with `Max-Age=0`.                        | Logout responses never touch the cookie; the record removal is authoritative, and a dead reference grants nothing (D8).                              |
| R11 | If the initiating tab closes or crashes after the server ended the session but before broadcasting, other tabs had no trigger to conceal.   | Logout announces `logout-started` first; every other tab confirms each second until it sees the outcome; the request uses `keepalive` (D8).          |

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
FR-022's prohibition on exposing references, tokens, or storage internals. It needs no record change, so S2's
stored-record version stays 1.

**Server Actions (R2)**: Server Action requests are built by Next's router, so a tab cannot add the tag as a header,
and the gate renews them from request shape. Binding is therefore enforced at two points:

1. **Submit guard (prevents the renewal).** On mount, each tab writes its tag to the shared current-session record
   `preets-session-current:v1` and broadcasts `session-current`. The coordinator handles `submit` in the document
   capture phase. It cancels the submission and confirms with the server unless the tab is `Active` and its tag
   equals the shared current tag. A tab that sees a different current tag, by message or by the `storage` event, ends
   at once (D8). A suspended tab reads the record synchronously on resume, before input reaches the page.
2. **Effect check (prevents the effect).** Every protected Server Action form includes a hidden `coordinationTag`
   field. The action compares it with the request cookie's tag through `readSessionRequest(...).coordination` and
   returns `Denied` with no effect when they differ.

Residual: a submission already in flight when another tab re-logs in can still renew the later session at the gate.
It has no protected effect, and the stale tab ends when it observes the new tag. This is recorded in
[quickstart.md](quickstart.md#limitations).

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
- three `localStorage` records: `preets-session-activity:v1` holding `{ tag, lastCommunicatedAt, pendingSince }` for
  the B5-W window; `preets-session-current:v1` holding the tag of the most recently mounted session (R2); and
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

1. A record for another tag is treated as empty.
2. `deadline - now < 60 s` → `send-now`; `lastCommunicatedAt = now`, `pendingSince = undefined`.
3. No `lastCommunicatedAt`, or `now - lastCommunicatedAt ≥ 60 s` → `send-now`; same record update.
4. Otherwise → `coalesce-until(lastCommunicatedAt + 60 s)`; `pendingSince ??= now`.

At the window end, a tab whose timer fires acquires the lock and re-reads the record. It sends once only if the record
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

**Limitation**: Browsers throttle timers in hidden tabs. The tab where interaction occurs is visible, so its timer is
not throttled; a pending record whose only running tabs are hidden may be sent late. This is recorded in
[quickstart.md](quickstart.md#limitations).

### D6. Deadline synchronization uses server-relative time and covers every renewal source

**Decision**: Every server snapshot carries `idleDeadlineEpochMilliseconds`, `serverTimeEpochMilliseconds`,
`warningLeadMinutes`, and `coordinationTag`. A tab converts the deadline to local time as
`localNow + (deadline - serverTime)` when it receives a snapshot and broadcasts the converted deadline with the
policy. Renewal sources propagate as follows:

| Renewal source                                            | How other tabs learn within 2 seconds                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| In-page activity communication (`POST /session/activity`) | The sending tab broadcasts the response snapshot.                                                                              |
| Document entry (gate renewal)                             | An inline script in the new document broadcasts the server-rendered snapshot when it is parsed, before hydration (R9).         |
| Protected Server Action (gate renewal)                    | The consumer calls the coordinator's `confirm()` after the action settles; the tab reads `GET /session/status` and broadcasts. |

**Ordering (R6)**: a tab adopts a snapshot when its `serverTimeEpochMilliseconds` is later than that of the snapshot it
holds, whatever the deadline. A newer refresh that shortened the timeout (S2 adopts the current tenant policy on
renewal) is therefore adopted, and a stale response that arrives late is not. Broadcasts carry the server time with the
converted deadline. Server clocks of independently running instances may differ slightly; a skew below the 2-second
bound cannot reorder snapshots taken more than that far apart.

**Rationale**: B5-S measures from the renewal response, and tabs share one machine clock, so local-time broadcasts are
comparable. Server-relative conversion removes browser/server clock skew and still works when tests control browser
time. A Server Action's renewal is invisible to client code, so its consumer must ask; the only current consumer is
`ReferenceOperation`, and the fixture form follows the same rule.

**Limitation**: the inline broadcast runs when the browser parses the protected layout, which follows the response
without waiting for hydration or script bundles. Its timing still depends on the browser receiving and parsing the
document. If the application later adopts a Content Security Policy, the inline script needs the policy's nonce.

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
- **Before the request (R11)**: the tab broadcasts `logout-started` for its tag and sends the request with
  `keepalive: true`, so it completes even if the tab closes. Every other tab with that tag then confirms through
  `GET /session/status` once per second until it receives `logged-out` or `logout-failed`, or until 10 seconds pass with
  the session still usable. A 401 or a different tag ends the tab. If the initiator dies after the server ended the
  session, each surviving tab therefore conceals within about one second of the server ending it, inside the 2-second
  bound. The initiator broadcasts `logout-failed` on 403, 503, or network failure.
- **No cookie change (R10)**: the logout response sets no cookie. If it is delayed until another tab has completed a
  fresh login, an unconditional `Max-Age=0` would delete the later session's cookie. The removed record is the
  authority; the old reference left in the cookie names nothing and grants nothing, and the next login overwrites it.
- **204**: the server ended the session. The tab adds its tag to `preets-session-ended:v1`,
  then broadcasts `logged-out` for its tag, and shows the signed-out notice (D14). Every other running tab with that tag shows the same notice on receipt (FR-015, B5-S).
- **401** or **409**: the tab's session is no longer in force in this browser. The tab records its tag as ended,
  shows the signed-out notice, and broadcasts. It does not state that it ended a session (FR-021).
- **403/503/network failure**: logout did not complete. The tab conceals protected content, announces that logout could
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

- **Every resume, first**: read `preets-session-ended:v1` and `preets-session-current:v1` synchronously. If this tab's
  tag ended or is no longer current, move to `Ended` at once, before any input is handled (R2, R3).
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

### D14. Mounting a protected document: replay before trust, conceal before hydration

**Decision** (R3, R9): the protected layout renders, before the protected content, a small inline script (no
bundle; JSON of the snapshot without identity or reference) that runs when parsed:

1. Read `preets-session-ended:v1`. If it contains this snapshot's tag, set `data-session-ended` on `<html>`. A CSS rule
   then hides the protected content wrapper (`html[data-session-ended] [data-protected-content] { display: none }`)
   before it is painted.
2. Otherwise broadcast `renewed` with the snapshot (D6) and write the tag to `preets-session-current:v1`.

When the coordinator hydrates, it subscribes to the channel and `storage` events first. It then replays the ended and
current records, so a logout that happened between the server render and subscription is applied. If the tag ended,
it moves to `Ended` and unmounts the content. Only then does it adopt the snapshot. A logout writes the ended record
before it broadcasts, so a tab that subscribes late still sees it.

**Rationale**: a server-rendered snapshot can predate a logout in another tab by the time the page is parsed. The
ended record makes that logout replayable, and the inline script applies it before the content is painted.

**Limitation**: a logout that completes after the inline script ran and before the coordinator subscribed is applied
at subscription, so its exposure is bounded by hydration time. Once subscribed, B5-S applies.

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
