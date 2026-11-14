# Research: Warn Before Expiration and Continue Accessibly Across Tabs

**Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md) | **Verification**: [verification.md](verification.md)

Current implementation facts were read at `65d9527cbd8bcd641b02458b9e1414516c4dab38` (the specification branch, which
includes `main` at `d03389a`). Framework and library behavior was read from the installed Next.js 16.4.5, React
19.3.1, Effect 4.1.4, and `@pathableai/react` 0.3.0, which is also the latest published version. Every decision here
is an engineering choice that the specification, the constitution, and the existing code leave to planning. No
maintainer decision was taken in the planning session, so the choices a person has to accept are listed first in the
plan pull request's "Decisions for the reviewer".

## Current facts

- **F1: Tenant warning policy.** `packages/frontend-services/src/tenant/config.ts` decodes an optional
  `warningLeadMinutes` (integer, at least 0) and an optional `idleTimeoutMinutes` (5–30). `effectiveSessionPolicy`
  derives the lead: the explicit value, otherwise 5, or 0 when the effective timeout is 5. A lead that is not below
  the effective timeout fails the schema. A schema failure is `TenantNotFound`, which every consumer maps to HTTP
  404, and it logs `Tenant configuration request failed` with `preets.tenant.config.rejected_field` (the field name,
  never its value). FR-001 and FR-002 are already implemented by #153.
- **F2: Renewal adopts the policy.** `SessionService.refreshForTenant` with a qualifying activity writes a new
  deadline, the tenant's current `warningLeadMinutes`, and `revision + 1` in one Lua transition. A request received
  at or after the stored deadline deletes the record and answers `expired`; it never renews. `continue-session` is
  already one of the service's qualifying activity literals, and the service is exercised with it in
  `tests/lib/session.test.ts` and `tests/integration/session-redis.test.ts`.
- **F3: No HTTP path accepts Continue.** `POST /session/activity`
  (`packages/frontend-services/src/next/coordination.ts`) decodes `activity` against the five in-page kinds only. A
  code comment reserves `continue-session` for #156. The handler requires a same-origin JSON request and the tab's
  coordination tag, renews with the tenant's effective policy, and answers the snapshot, or 401 without a session, or
  409 for another session's tag. The gate never renews on this path and denies it with 401 when no usable session
  exists.
- **F4: The lead already reaches every tab.** The coordination snapshot carries `warningLeadMinutes`, the
  authoritative deadline, the record revision, and the server time. Tabs adopt a snapshot only when its revision is
  higher, relay it on `BroadcastChannel` as `renewed` (with the lead), and expose the held local deadline and lead on
  the coordinator's header as `data-session-deadline` and `data-session-warning-lead`. Nothing reads the lead yet.
- **F5: Tab clocks follow the server.** `TabCoordination` holds the deadline on the server clock and converts it with
  an offset calibrated from each response (`clock-offset.ts`). A response whose interval does not overlap the held
  estimate replaces it, as after a local clock step. Advancing only a page's clock therefore moves its local deadline
  with it once any response arrives.
- **F6: Confirmation and concealment.** At its local deadline a tab conceals ("Checking your session…") and reads
  `GET /session/status`, which never renews. `Usable` reveals, `Ended` with known expiration shows the expiration
  modal in every sharing tab (#157), and `Undetermined` conceals and retries. On resume (`visibilitychange` to
  visible, or `resume`) the tab replays stored records, conceals when past its local deadline, and always confirms.
- **F7: In-page activity.** Activity is classified only from trusted events inside the protected content element and
  is coalesced in 60-second windows shared across tabs. Activity while the deadline is under 60 seconds away is sent
  at once. Inert or hidden elements are not classified. Pending coalesced activity can exist for at most 60 seconds
  after the last communication.
- **F8: Browser harness facts.** `shared/browser-tracing.ts` records closed-set facts (`TabCoordination.transition`,
  `TabChannel.*`, `Focus.move`, `Interaction.submit`, `Interaction.login`). A request sent inside a fact's scope is
  its child, as logout is the child of its transition. `export-filter.ts` drops every span name and attribute key that
  is not allow-listed.
- **F9: Library modal.** `@pathableai/react` 0.3.0 `Modal` renders a `div` with `role="dialog"`, `aria-modal="true"`,
  `aria-labelledby` on its `h2` title, and `aria-describedby` on its description. It portals to `document.body`. It
  always renders a close button that calls `onClose`, and Escape calls `onClose`. Its Tab handler cycles focus only
  while focus is inside the dialog. It focuses `initialFocusRef`, and when `open` turns false it focuses the element
  that was active when it opened. It does not make the rest of the page inert, and it does not close on a backdrop
  click unless asked. Library `Button` forwards button attributes but takes no ref.
- **F10: No focus restoration exists in the application.** `moveFocus(element, target)` is the only programmatic
  focus move. It marks the move as the application's for the `Focus.move` fact.
- **F11: BDD time.** Requirements BDD runs a real server and never connects to Redis. Natural expiry uses a
  scenario-owned tenant copy with a 5-minute timeout and real elapsed time. Playwright's clock is used only to suspend
  or skew one tab. Each scenario owns its server process and tenant directory, and the tenant file is read on each
  request. No step sets `warningLeadMinutes`, and no scenario is tagged `@preets-session-011`. The nightly BDD job has
  a 45-minute timeout.
- **F12: Late renewal evidence.** `tests/lib/session.test.ts` has examples that an expired record is not revived, and
  `tests/integration/session-redis.test.ts` covers a renewal racing expiry in real Redis. No property states that a
  renewal succeeds exactly when it is received before the deadline, and no example exercises the activity handler at
  the deadline.

## Decisions

### D1: Continue is `continue-session` on the existing activity endpoint

**Decision:** The warning's Continue sends `POST /session/activity` with `activity: "continue-session"` and the tab's
coordination tag. The handler's body schema accepts that literal beside the five in-page kinds. Every existing check
applies unchanged: same origin, JSON, the tag of the session in force, and the tenant's effective policy on renewal.

**Rationale:** The service already treats `continue-session` as qualifying activity (F2), and the endpoint already
carries the tag binding that stops a stale tab renewing a later session. A separate route would duplicate those
checks. The distinct literal makes a Continue renewal visible on the existing `SessionService.refreshForTenant` span
(`preets.session.activity`), which V-008 needs.

**Alternatives considered:** Sending `intentional-control-activation` (the server could not tell Continue from
coalesced activity); a Server Action (it would renew at the gate as a form submission and add a second transport for
one button).

### D2: The warning period is judged on the server clock

**Decision:** A pure child module decides two things from a snapshot. The threshold is the authoritative deadline
minus the lead in minutes, on the server clock, and there is none when the lead is 0. A session is in its warning
period at a server time when the lead is positive and that time is at or after the threshold and before the
deadline.

**Rationale:** The lead and deadline a tab warns against are those of the session's most recent authoritative
renewal (FR-004). Judging on server time keeps a tab with a skewed or stepped clock correct (F5).

### D3: A tab opens the warning only on its own server answer

**Decision:** A tab schedules a timer at its local threshold. When it fires, the tab reads the session status
without concealing. It opens the warning only when a `Usable` answer to one of its own requests describes the
snapshot it holds after adoption and that answer's server time is in the warning period (D2). The same check runs
after every `Usable` answer the tab receives, whatever caused the request, so resume needs no second rule: the
existing resume confirmation opens the warning when the server says the session is in its warning period. A
`renewed` message from another tab never opens a warning. When the answer says the threshold has not arrived, the
tab checks again when the server's own threshold arrives, at least 250 ms later.

**Rationale:** FR-006 and FR-013 require confirmation first, so a renewal made elsewhere prevents the warning. A
status read never renews (F6).

**Alternatives considered:** Opening on the local timer and correcting afterwards (shows a stale warning, which V-007
forbids); a "warning opened" cross-tab message (see D12).

### D4: Only an adopted renewal or the session's end closes the warning

**Decision:** The warning is a flag beside the tab's view, like concealment. It is cleared when the tab adopts a
snapshot with a higher revision and the session is no longer in its warning period on the tab's server-time
estimate, or when the tab leaves the `active` view (ended, expired, recovery, or a logout). Adoption has three
sources: this tab's Continue answer, another tab's `renewed` message, and any other answer this tab received. Nothing
else clears it. A renewal always places the threshold in the future because a lead is below the timeout, and a
renewal that adopts a lead of 0 has no threshold.

**Rationale:** FR-009 to FR-011. Cross-tab dismissal needs no new message: the existing `renewed` broadcast already
reaches every sharing tab after any renewal (F4), including one caused by a page load (gap G2 of #155 applies).

### D5: Activity that happened before the warning is never left behind it

**Decision:** When the threshold timer fires while the tab still holds coalesced activity that was not yet
communicated, the tab sends that activity at once under the existing window lock and checks the threshold again
within one second. If the renewal arrives, the timer has already moved and no warning opens. If it does not, the tab
confirms and warns as in D3. While the warning is open the tab classifies no in-page activity.

**Rationale:** Real interaction shortly before the threshold is qualifying activity (SESSION-009), so it must renew
rather than be hidden behind a warning. Pending activity normally flushes before any threshold (F7), so this covers
a timer race and the shortest policies, such as a lead of timeout minus 1. Escape, Tab, and clicks while the warning
is open must not renew (FR-009, V-010): the content is inert and the dialog is outside the element activity is
classified from, and the explicit guard keeps that true if the layout changes.

### D6: Continue is sent at once, and its three answers are distinct

**Decision:** Activating Continue records the activation fact and sends the request in the same task, outside the
activity window. A second activation while one is in flight in the same tab does nothing. The request gives up after
10 seconds.

- `Usable`: the tab adopts the snapshot and broadcasts it, which closes the warning here and in every sharing tab
  (D4).
- `Ended` (401, or 409 for another session): the session ended first. The tab follows the existing ended path of an
  activity report: known expiration shows the expiration modal in every sharing tab, and otherwise the signed-out
  notice (#157). No tab treats it as a renewal.
- Anything else (a server error, a refusal, no answer): the warning stays open in every tab, shows "We could not
  continue your session. Try again." as an alert inside the dialog, and Continue stays available. The deadline timer
  still protects the content.

**Rationale:** FR-008, FR-011, FR-012, and US7. Behavior when the server stays unreachable belongs to the pending
connection-loss requirement; this decision only guarantees that a failure closes nothing.

### D7: The deadline still conceals behind an open warning

**Decision:** Concealment and the warning are independent. At the local deadline the tab hides its content and
confirms, as today, while the warning dialog stays in place. An `Ended` answer replaces both with the expired
outcome. A `Usable` answer reveals the content, and the warning stays or closes by D4. The recorded UI state is
`content_concealed` while concealed, and `warning_shown` while the warning is open over revealed content.

**Rationale:** Disabled or open warnings must not change expiration, concealment, or recovery (FR-003, US7).
Keeping the dialog avoids closing and reopening it when a tab's estimate runs a moment early.

### D8: The warning uses the library `Modal`, with documented workarounds for its gaps

**Decision:** The warning is `@pathableai/react` `Modal` with `open`, a no-op `onClose`, the copy of D9 as `title`
and `description`, library `Button` "Continue" in `footer`, and `initialFocusRef` on that button. The feature adds
what the library lacks, in the warning's own private module:

1. **Nothing dismisses it.** `onClose` does nothing, so Escape and the close control close nothing (FR-009).
2. **Continue is its only control.** While the dialog is open, every control the library renders inside it that is
   not the feature's own is disabled and removed from rendering and from the accessibility tree. In 0.3.0 that is the
   close button. The component does this to the rendered dialog after each open, by structure rather than by a
   library class name.
3. **The background is inert.** While the dialog is open, every child of `document.body` except the dialog's own
   portal root has `inert` set, and each is returned to its earlier value when the dialog closes (FR-016). That
   covers the header, the protected content, the announcement region, and anything a page portalled to the body.
4. **Focus cannot rest outside it.** A pointer press outside the dialog does not move focus, and if focus is found
   outside the dialog while it is open, it is returned to Continue (FR-015).
5. **Focus returns as specified.** Before the background becomes inert the tab records the focused element. When the
   warning closes while the tab stays active, focus goes to that element if it is still connected and focusable, and
   otherwise to the page's main content: the first `main` inside the protected content, or the content container
   (FR-017). When the session ended instead, the expired or signed-out view places focus as it does today.

**Gap and removal condition (Principle IV):** The library has no non-dismissible modal and no inert background.
Library issue: [PathableAI-org/styles#264](https://github.com/PathableAI-org/styles/issues/264). Adoption tracking:
[#400](https://github.com/PathableAI-org/Pre-ETS/issues/400), which the implementation extends to name the warning.
Remove workarounds 1 to 4 and re-run V-010, V-014, and V-015 when the library ships that mode. Workaround 5 stays
only if the library's own restoration lacks the main-content fallback.

**Rationale:** FR-009 and FR-016 are not relaxed, so the application supplies both. The specification settles that
the warning offers Continue only, so the close control is removed rather than left visible and inert as the
expiration modal does (#157 limitation L-1). A user reaches for that control to dismiss a warning, which is exactly
the action the warning must not offer.

**Alternatives considered:** Leaving the close control visible and inert, as #157 accepted for the expiration modal
(a dead control in the dialog users see most often); a local dialog on the native `dialog` element (a local
replacement for a library component, which the maintainer rejected for #157, and whose Escape handling cannot be
fully suppressed in every supported browser); waiting for the library (no version beyond 0.3.0 exists).

### D9: Copy, and no remaining-time display

**Decision:** Title "Your session is about to expire". Description "For your security, your session will end soon
because of inactivity. Select Continue to keep working." Action "Continue". The dialog shows no remaining time. The
copy lives in the warning's private module because it has one consumer.

**Rationale:** FR-007 requires the explanation and the action, and makes the remaining time optional. A countdown
adds a timer and an announcement risk for no requirement.

### D10: The warning never offers Log out, and the header is inert behind it

**Decision:** The dialog has no Log out. The header's Log out control is part of the inert background while the
warning is open. A logout from another tab ends this tab through the existing messages, and the warning gives way to
the signed-out notice.

**Rationale:** The specification puts a Log out action in the warning out of scope and requires an inert background.

### D11: Telemetry adds two facts and extends two

**Decision:** See [contracts/telemetry.md](contracts/telemetry.md). A new `TabCoordination.threshold` fact is the
parent of the confirmation a tab starts at its threshold or on resume past it, so "confirmed first" is a positive
observation. `TabCoordination.transition` gains the `warning_shown` state, causes for opening and closing, and the
held lead. A new `Interaction.continue` fact is the parent of the Continue request, so the server's renewal or
refusal is in its trace. `Focus.move` gains the `warning_continue` target. The existing server spans are reused;
`preets.session.activity` gains the reachable value `continue-session`.

**Rationale:** Each telemetry-channel claim needs a positive fact, because browser telemetry cannot record its own
absence. This matches trigger 4, which the plan records.

### D12: No cross-tab "warning opened" message

**Decision:** Each running tab reaches the warning from its own held snapshot, by its timer or on resume. Tabs do
not announce that a warning opened.

**Rationale:** FR-006 makes every tab confirm for itself, so a message could only prompt the same confirmation. A
hidden tab whose timers the browser throttles opens its warning when its timer runs or when it becomes visible
(US6), which is limitation L-1.

**Alternatives considered:** A `warning` message that prompts peers to confirm at once. It would tighten the bound
for throttled hidden tabs, at the cost of a new message kind in the channel, its parser, and its telemetry set. The
reviewer may ask for it; it changes no public contract.

### D13: Timing evidence uses real elapsed time and the shortest policies

**Decision:** BDD and the manual procedure observe thresholds in real elapsed time against the real server. Each
slice uses policies whose threshold arrives within one to six minutes: a 5-minute timeout with a lead of 4 (threshold
after one minute), a 6-minute timeout with the warning omitted (default lead of 5, threshold after one minute), a
5-minute timeout with a lead of 1, and the 5-minute and explicit-`0` cases that never warn. The default 30-minute
policy (warning at 25 minutes) and an explicit `0` at the 30-minute maximum are observed in one scenario that holds
both sessions idle at once, tagged `@long-idle`, which takes about 31 minutes. Slice D raises the nightly BDD job's
timeout to fit the added scenarios. Playwright's clock is still used to suspend or skew a single tab, as #157 does.

**Rationale:** `verification.md` plans controllable browser time. That cannot open a warning: a tab's clock follows
the server's (F5), and FR-006 makes each tab confirm with the server before it warns, so advancing only a page's
clock leaves the server saying the threshold has not arrived. Real elapsed time makes the same observations through
the same channels, and exercises the real waiting that `verification.md` listed as not exercised. This is an
evidence substitution, named in the plan pull request for the reviewer.

**Alternatives considered:** A harness-only preload that shifts the BDD-owned server process's clock together with
each page's clock. It would make every policy observable in seconds and keep the nightly run short. It patches the
server process's `Date`, breaks any login after a shift, and is unproven against the production Next server, so it
is not adopted without a feasibility check and a person's decision. A product-level test clock was rejected: it
would add a time-shifting capability to product code for tests only.

### D14: Fixtures for failed and late Continue stay in the browser harness

**Decision:** A failed Continue is produced by answering that one request with a 503 from Playwright's request
routing. A late Continue is produced by holding the request in the routing layer until the real deadline has passed
and then letting it reach the server, so the refusal is the server's own. Both are recorded as conditions of the
observation, as `verification.md` requires. No product code changes for either.

### D15: Module evidence for the deadline boundary is added where it is missing

**Decision:** Slice C adds a Fast-Check property to `tests/lib/session.test.ts`: over received times around the
deadline, a `continue-session` refresh renews exactly when it is received before the deadline, and never at or after
it. It also adds activity-handler examples in `tests/unit/coordination.test.ts` for a `continue-session` body exactly
at and after the deadline. The existing real-Redis race tests are cited, not repeated.

**Rationale:** V-011 names this module evidence, and F12 shows the property and the handler examples do not exist.

## Plan limitations (beyond `verification.md`)

- **L-1:** A hidden tab whose timers the browser throttles opens its warning when its timer runs or when it becomes
  visible again, which can be later than 2 seconds after the threshold. Evidence for the 2-second bound uses tabs
  whose timers run (D12).
- **L-2:** Suspension is emulated with Playwright's clock and a visibility change, as #157's evidence does, so a
  frozen tab's first paint before its scripts run is not observed.
- **L-3:** The screen-reader parts of V-014 and V-015 need a person. The verification session establishes the
  accessibility-tree, keyboard, and pointer parts and records the screen-reader part as not established.
- **L-4:** The background workaround makes every child of `document.body` inert. An element a page places in the
  browser's top layer, such as a native modal dialog or a popover, is not covered. No protected page opens one today.
