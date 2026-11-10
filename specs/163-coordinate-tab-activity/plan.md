# Implementation Plan: Coordinate Intentional Activity and Logout Across Session-Sharing Tabs

**Branch**: `163-coordinate-tab-activity-plan` | **Date**: 2026-11-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature contract in `specs/163-coordinate-tab-activity/spec.md` and
`specs/163-coordinate-tab-activity/verification.md`; delivery issue
[#155](https://github.com/PathableAI-org/Pre-ETS/issues/155), delivery-plan slice S3, with the 2026-11-09 B5 and B6
decisions in [docs/delivery/session-management.md](../../docs/delivery/session-management.md)

## Summary

Add three frontend-services Next host adapters — `POST /session/activity`, `GET /session/status`, and
`POST /auth/logout` — and one client feature, `session-coordination`, rendered by the protected `(app)` layout. The
S2 `SessionService` is reused with one additive field, the store observation time that orders snapshots. The S1 gate gains one closed set: the three endpoint paths are protected
application requests that never renew, whatever the request shape. Activity renews through `refreshForTenant` after a
tag check, status only reads, and logout calls `invalidate` and leaves the cookie alone, so a delayed logout response
cannot delete a later session's cookie. A derived, one-way **coordination tag** binds every activity and logout request and every cross-tab message to
the session the tab observed, so a stale tab can never renew or end a later session. Protected Server Action forms
carry the same tag, and a client submit guard holds a submission from a tab whose session may no longer be current until the server
confirms it, then replays or ends.

In the browser, a pure classifier admits only trusted control activation, text entry, keyboard and touch interaction,
and user-driven focus on meaningful inputs. A pure B5 window policy, shared across tabs through one `localStorage`
record under a Web Lock, sends the first interaction after 60 seconds of silence immediately, coalesces the rest into
one send at the window end, and sends at once when the deadline is under 60 seconds away. Tabs broadcast renewed
deadlines and logout on a `BroadcastChannel`, confirm with the server before acting on a local deadline, and on
resume conceal first when their deadline has passed. Logout is immediate. After logout every sharing tab unmounts
protected content and shows an accessible signed-out notice with an explicit **Log in** link to `/` (FR-023,
maintainer decision A of 2026-11-09). Retained protected multi-page fixtures support the evidence and later #157/#156 work.

Increments 1–4 are implementable and module-evidenced now. Live multi-tab evidence is gated on #158 (increment 5),
following S1's precedent. Logout ends the application session only; identity-provider logout is flagged, not
designed. No new package, service, Layer, dependency, stored field, or configuration is added.

## Technical Context

**Language/Version**: TypeScript 6.0.3 on Node.js 26+; browser code targets current evergreen browsers

**Primary Dependencies**: Next.js 16.4.5 App Router (Node.js proxy, Route Handlers), React 19.3.1, Effect 4.1.2 and
`@effect/platform-node` 4.1.2 (named `effect` catalog), `@pathableai/react` 0.3.0, `redis` 6.3.1 (unchanged);
browser `BroadcastChannel`, `navigator.locks`, `localStorage`, Page Visibility and Page Lifecycle events

**Storage**: Existing frontend-services Redis session records only (unchanged schema and key layout); the existing
host-only `pathable-session` cookie, now written only at establishment and without `Max-Age` (no renewal or logout
response sets it, research D15); per-origin `localStorage`
records holding only tags and timestamps (per-tag activity windows, a current-session hint, ended tags). The stored
Redis session record gains a `revision` counter (schema version 2, research D6)

**Testing**: Vitest 5.1.0 with `@effect/vitest` 4.1.2 and `@fast-check/vitest` 0.5.0 (frontend-services unit and
real-Redis integration), frontend Vitest (`node` environment) for pure browser policy, Cucumber 13.3.0 requirements
BDD with Playwright 1.65.0 Chromium (`BrowserContext.clock`, multiple pages and contexts), manual agent-executable
procedure

**Target Platform**: Self-hosted `next start` on Node.js; local Redis and the tracked Keycloak realm for composed
evidence; current Chromium, Firefox, and Safari for the browser mechanisms (evidence runs Chromium only)

**Project Type**: Existing pnpm monorepo web application; Effect host adapters in `packages/frontend-services`,
presentation and client coordination in `packages/frontend`, BDD support at the root

**Performance Goals**: B5 bounds only: other tabs reflect a renewal within 2 seconds of its response and conceal within
2 seconds of logout; in-page activity waits at most 60 seconds. At most one in-page communication per session per
window plus near-deadline sends; each costs two Redis operations (gate read, handler refresh).

**Constraints**: Server authority (tabs never decide validity); fail closed when undeterminable; no revival; tenant,
browser-context, and session isolation; no protected content, identity, reference, token, or store key on the channel,
in storage, or in endpoint bodies; same-origin `POST` only; Next app imports no Effect; feature zones import no other
feature; no telemetry assertions; no change to S2's service contracts or to S1's public designation and outcome matrix

**Scale/Scope**: frontend-services: one new private child, three handler factories, one additive field, one cookie
helper. Next app: three route files, the `(app)` layout, two fixture pages and their action, two new feature entries,
one shared provider module, and a behavior change in `session-reference`. Inventory after change: protected pages `/`,
`/coordination/roster`, `/coordination/participant`; protected Server Actions `runReferenceOperation` and the fixture
action; protected Route Handlers `POST /session/activity`, `GET /session/status`, `POST /auth/logout`; public
designation unchanged.

## Constitution Check

_GATE: Passed before Phase 0 research and re-checked after Phase 1 design. No violation requires Complexity Tracking._

| Principle                                     | Pre-design gate                                                                                                                   | Post-design result                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Evidence-grounded specification            | `spec.md`, `verification.md`, issue #155, S3, B5, B6, and PREETS-SESSION-009/010 on `origin/main` `00116612` read as authorities. | Pass. No acceptance criterion or verification obligation changes. The spec's three authority findings are carried as research F-1 (S1 precedent), F-2 (application-session logout, flagged), and F-3 (resolved in the specification as FR-023, SC-011, and V-017). No product decision is hidden as an assumption.           |
| II. Explicit ownership and authoritative data | Session workflows belong to frontend-services; the Next app owns presentation; no backend or domain data.                         | Pass. All Effect composition is in frontend-services host adapters. The Next app holds route wiring, presentation, and browser coordination. Redis stays the only session authority; browser state is advisory and always confirmed with the server.                                                                         |
| III. Tenant isolation                         | Tenant resolved per request; cross-tenant and cross-context effects forbidden.                                                    | Pass. Handlers resolve the tenant first and use `*ForTenant` operations. Browser channels and storage are origin- and context-scoped; the coordination tag separates successive sessions (research D2, D13). Same-origin enforcement blocks forced cross-site logout or keep-alive (D10).                                    |
| IV. Accessible, server-rendered UI            | UI uses installed `@pathableai/react`; client components justified.                                                               | Pass. Pages stay server-rendered. The coordinator is a client component because B5 behavior is browser behavior. Log out is a `Button` with an accessible name and visible focus; the signed-out notice is an `Alert` with a heading, a live region, and a `Link`. Concealment removes content from the accessibility tree.  |
| V. Meaningful behavioral tests                | Evidence names claims and separates module, feature, and manual observations.                                                     | Pass. Module claims in [contracts/modules.md](contracts/modules.md) use properties and real-Redis integration at the responsible boundary; [quickstart.md](quickstart.md) maps every V-claim once; renewal is always shown by the authoritative deadline, never by an event or request alone; no telemetry tests.            |
| VI. Simplicity and verifiable quality         | Every new abstraction needs a current consumer and owner.                                                                         | Pass. Three handler factories (one route file each), one private child, one feature with one composition point, one fixture feature with two pages, one shared provider with three consumers; no service, Layer, package, dependency, or speculative re-export. Private policy modules are tested directly by user decision. |

Architecture constraints: frontend/backend separation unchanged; the shared `ManagedRuntime` runs the handlers through
the existing `toNext`; `packages/frontend` imports no Effect; Fallow zones unchanged. `fallow guard` was run on the
existing files this design touches (`(app)/layout.tsx`, `history-protection`, `access-responses`, `next.ts`,
`next/{cookies,request,session}.ts`, `index.ts`); all stay inside their zones. Feature zones may import only
themselves, `server`, and `shared`, which is why confirmation uses `src/providers/` (shared).

## Project Structure

### Documentation (this feature)

```text
specs/163-coordinate-tab-activity/
├── spec.md              # approved feature contract (unchanged)
├── verification.md      # approved verification plan (unchanged)
├── checklists/          # specification checklist (unchanged)
├── plan.md              # this file
├── research.md          # facts, B5/B6 rules, decisions D1–D13, findings F-1–F-5
├── data-model.md        # browser-side record, channel messages, tab states
├── contracts/
│   └── modules.md       # module decisions, public contracts, contract evidence
└── quickstart.md        # implementation-aware execution of verification.md
```

### Source Code (repository root)

```text
packages/frontend-services/
├── src/
│   ├── index.ts                     # + three handler factories, wire types
│   ├── session.ts                   # UsableSession.observedAtEpochMilliseconds
│   ├── session/{store,codec}.ts     # record v2 revision; script returns Redis TIME
│   ├── next.ts                      # + re-exports from next/coordination.ts
│   └── next/
│       ├── coordination.ts          # NEW private child: schema, origin check, three programs
│       ├── coordination-snapshot.ts # NEW leaf child: tag derivation, snapshot construction
│       ├── protection.ts            # + NON_RENEWING_PATHS; renewals set no cookie
│       ├── callback.ts              # session cookie without Max-Age (only writer)
│       ├── cookies.ts               # setSessionCookie drops maxAgeSeconds
│       └── session.ts               # ResolvedSessionRequest.coordination (via the leaf child)
└── tests/
    ├── unit/coordination.test.ts             # NEW: examples + Fast-Check properties via src/next.ts
    └── integration/coordination-redis.test.ts # NEW: real SessionService on owned-prefix Redis

packages/frontend/
├── src/
│   ├── app/
│   │   ├── (app)/layout.tsx                    # reads snapshot, renders SessionCoordinator
│   │   ├── (app)/page.tsx                      # unchanged except receiving confirmation via provider
│   │   ├── (app)/coordination/roster/page.tsx       # NEW fixture page
│   │   ├── (app)/coordination/participant/page.tsx  # NEW fixture page
│   │   ├── (app)/coordination/actions.ts            # NEW fixture Server Action
│   │   ├── session/activity/route.ts           # NEW: POST = createSessionActivityHandler()
│   │   ├── session/status/route.ts             # NEW: GET = createSessionStatusHandler()
│   │   └── auth/logout/route.ts                # NEW: POST = createLogoutHandler()
│   ├── providers/
│   │   └── session-confirmation.tsx            # NEW shared context + hook
│   └── features/
│       ├── session-coordination.ts             # NEW entry
│       ├── session-coordination/{activity-classification,activity-window,snapshot-order,session-endpoints,tab-channel}.ts
│       ├── session-coordination/{coordinator,logout-control,signed-out-notice}.tsx
│       ├── coordination-fixtures.ts            # NEW entry
│       ├── coordination-fixtures/{roster,participant,fixture-action-form}.tsx
│       └── session-reference/reference-operation.tsx  # confirms after the action settles
└── tests/unit/session-coordination.test.ts     # NEW: classifier table, B5-W property

tests/bdd/
├── requirements/session-tab-coordination.feature   # NEW, @partial
├── steps/                                           # session coordination steps
└── support/{browser,fixtures}.ts                    # multi-page/context, context clock, status reader
docs/session-state.md, docs/authentication.md        # current-behavior updates in implementation
```

**Structure Decision**: Extend the existing frontend-services Next host-adapter module with one private child and
three public factories; keep the Next app's route files thin; put all browser coordination in one feature rendered by
the existing protected route-group layout; use the Bulletproof `shared` zone for the single cross-feature hook. Gate,
session service, store, and history guard are preserved.

## Phased Engineering Design

### Phase 1 — Module architecture

Decisions per responsibility are tabulated in
[contracts/modules.md](contracts/modules.md#module-architecture-decisions). In short: **preserve** `RestoredPageGuard` and every `SessionService` operation;
**extend** `UsableSession` additively with the store observation time (research D6); **change** the session cookie
so only establishment writes it, without `Max-Age` (research D15); **extend** the S1 gate's private classifier with the non-renewing endpoint paths;
**extend** `frontend-services/src/next.ts` with activity, status, and logout handler factories in private
`next/coordination.ts`, with tag and snapshot construction in the leaf child `next/coordination-snapshot.ts` so the
page read does not import the handler module (avoiding a cycle through `next/cookies.ts`); **extend** `ResolvedSessionRequest` with the initial coordination snapshot; **add** the `session-coordination` feature
(one composition point, `(app)/layout.tsx`), the `coordination-fixtures` feature, and the shared
`providers/session-confirmation.tsx`; **extend behavior** of `session-reference` to submit the observed tag, refuse a mismatched tag in its action, and
confirm after the action settles.

Why handlers, with only a non-renewing classification in the gate: the gate's read-or-renew decision comes from
request shape and must not trust a body claim, and it must not renew on the endpoints before the handler's tag check
(research D1). Why a derived tag: the cookie is browser-wide, so only a session-bound value stops a stale
tab from renewing or ending a later session, and it can be derived without a record change (D2). Why browser storage
and a lock: B5 windows are per session across tabs and need one atomic decision (D3). Why no service or Layer: each
handler is a per-request composition of existing services with one consumer.

### Phase 2 — Public module contracts

[contracts/modules.md](contracts/modules.md#public-contracts) records exact signatures and the HTTP outcome table.
Compatibility-sensitive points:

- `createSessionActivityHandler`, `createSessionStatusHandler`, and `createLogoutHandler` are additive and take no
  arguments; their bodies are empty except 200 snapshots. 409 means "a different session is in force; nothing was
  done." 204 from logout means the server removed the record; no logout response sets or clears a cookie.
- `SessionCoordinationSnapshot` is the only session data a tab receives: tag, deadline, server time, warning lead.
  #156 will extend it with warning state; no identity or reference is ever added.
- `InPageSessionActivity` is the subset of `QualifyingSessionActivity` a tab may claim; deliberate requests keep
  renewing at the gate, and `continue-session` stays #156's.
- `ResolvedSessionRequest.coordination` is additive; existing consumers compile unchanged.
- The S1 outcome matrix, public designation, and `ProtectionResponses` are unchanged. The private classifier never
  renews on `/session/activity`, `/session/status`, or `/auth/logout`.
- The gate no longer renews Server Actions. Protected Server Actions receive the observed tag in a hidden
  `coordinationTag` field and call the new `authorizeSessionAction`, which renews only after the tag matches.
- `UsableSession` and the snapshot gain `revision` (ordering) and `observedAtEpochMilliseconds` (diagnostic).
- Frontend entries: `session-coordination` (`SessionCoordinator` only; the pure policy modules are private and unit
  tests import them directly, an exception the user accepted on 2026-11-10 following `onsite-visit-state.test.ts`), `coordination-fixtures` (`RosterFixture`, `ParticipantFixture`), shared
  `session-confirmation` (`SessionConfirmationProvider`, `useSessionConfirmation`).

### Phase 3 — Module contract evidence

Claim-based evidence is tabulated per module in [contracts/modules.md](contracts/modules.md):

- **Durable, public-interface (frontend-services Vitest through `src/next.ts`)**: a Fast-Check property that activity
  and logout write to the store iff the body tag equals the cookie's derived tag and the request is same-origin JSON;
  a property that the tag is deterministic per reference, distinct across references, and never the store-key digest;
  examples for origin, content type, decode failures, tenant failure, mismatch, and outage mappings; snapshot presence
  through `readSessionRequest`.
- **Durable, real integration**: `coordination-redis.test.ts` with owned prefixes shows activity returns the stored
  renewed deadline, late activity after invalidation or expiry answers 401 without revival, logout removes the record
  and sends no `Set-Cookie`, status never moves the deadline, and an outage answers 503 without a false logout.
- **Durable, pure browser policy (frontend Vitest, `node` environment)**: a Fast-Check property for the B5-W window
  invariants over generated interaction times, deadlines, and tab interleavings, including foreign-tag records; a
  table for the D4 classifier.
- **Existing evidence reused**: S2 session service and store suites (renewal, no revival, invalidation, outage); S1
  gate unit, property, and integration suites; tenant service suites.
- **Transient/manual module evidence**: a browser probe during implementation comparing a real programmatic
  `element.focus()` with Tab focus through the classifier, logged and removed (quickstart §1 note). No telemetry is
  asserted anywhere.

### Phase 4 — Implementation architecture

**Handler programs** (`next/coordination.ts`): each factory returns `toNext((request) => program(request))`.

- `sessionActivity` (`Effect.fn("sessionActivity")`): require same-origin (`sec-fetch-site`, else `origin` against
  `request.nextUrl.origin`) → 403; require `application/json` → 415; decode `await request.text()` with a module-level
  `Schema.decodeUnknownEffect(Schema.fromJsonString(SessionActivityBody))` → 400 on failure; `resolveRequestTenant`
  (shared with the gate); `decodeSessionReference` on the cookie; derive the tag and compare in constant time → 409;
  `refreshForTenant({ activity, policy: effectiveSessionPolicy(config), reference, tenantAlias })`; on
  `UsableSession`, `NextResponse.json(snapshot)` with `PRIVATE_NO_STORE` and no `Set-Cookie`;
  on `NoUsableSession` 401. Failures are matched on `_tag` as `next/protection.ts` does: `SessionTenantMismatch` 403,
  `SessionServiceUnavailable` 503, `TenantFailure` → `tenantFailureStatus`.
- `sessionStatus`: tenant, `readForTenant`, snapshot or 401/403/503. No origin check (a `GET` without effect, already
  gated).
- `logout`: origin, content type, decode; tenant; `readForTenant` → 401 when not usable; tag compare → 409; then
  `invalidate({ reference })` → 204 without `Set-Cookie`. `SessionServiceUnavailable` at either step → 503.
- `next/coordination-snapshot.ts` (leaf: imports `node:crypto` and `session.ts` types only) builds the tag and the
  snapshot for both the handlers and `next/session.ts`. The tag is `createHash("sha256").update("preets:session-coordination:v1\0").update(reference).digest("base64url")`
  from `node:crypto`; comparison uses `timingSafeEqual` on equal-length buffers. The handlers run in the Node runtime.

**Snapshot for pages** (`next/session.ts`): when the read returns `UsableSession`, attach
`{ coordinationTag, idleDeadlineEpochMilliseconds, observedAtEpochMilliseconds, serverTimeEpochMilliseconds: Clock.currentTimeMillis,
warningLeadMinutes }` built by `next/coordination-snapshot.ts`.

**Gate classification** (`next/protection.ts`): `classify` returns `{ entry: "application", renewal: undefined }` for
any request whose pathname is in `NON_RENEWING_PATHS`, and for every Server Action (`next-action`), so only document
entries renew at the gate. The public designation is checked first and does not include these paths. `admit` no longer re-issues the session cookie; the callback's
establishment response is its only writer, without `Max-Age` (research D15).

**Store revision and observation time** (`session/store.ts`, `session/codec.ts`, `session.ts`): the stored record
becomes version 2 with `revision`; the read/refresh script increments it in the same `SET` that renews or adopts
policy, accepts version-1 records as revision 0, and appends `redis.call("TIME")` to its reply. `UsableSession` carries
`revision` and `observedAtEpochMilliseconds` (research D6, R13, R16).

**Action authorization** (`next/coordination.ts`, exported as `authorizeSessionAction`): tenant, tag comparison against
the cookie's tag, then `refreshForTenant({ activity: "deliberate-form-submission", ... })`; failures map as
`readSessionRequest` does. `runReferenceOperation` and the fixture action call it before any effect (research D2,
R17).

**Next host composition**: `app/session/activity/route.ts` exports `POST = createSessionActivityHandler()` with
`dynamic = "force-dynamic"`; `app/session/status/route.ts` exports `GET`; `app/auth/logout/route.ts` exports `POST`.
`(app)/layout.tsx` reads host and cookie as `(app)/page.tsx` does, calls `readSessionRequest`, redirects to
`/auth/login` when there is no usable session (the gate normally answers first), and renders
`<SessionCoordinator snapshot={resolved.coordination}>{children}</SessionCoordinator>`. Fixture pages live under
`(app)/coordination/`; their action mirrors `runReferenceOperation`.

**Browser coordinator** (`session-coordination/coordinator.tsx`, client): a reducer over the states in
[data-model.md](data-model.md#tab-coordination-states). On mount (after hydration) it subscribes to the channel and
`storage` events, replays the ended record, then adopts the snapshot, writes the current-session hint, and broadcasts
the page-load renewal (research D14). There is no inline pre-hydration script; the resulting gaps G1 (logout while a tab is
loading) and G2 (renewal by page load) are acknowledged below. Document-level capture listeners observe
`keydown` and `pointerdown` for the "gesture in the current task" flag (cleared by `setTimeout(0)`), and capture
listeners for `click`, `beforeinput`, `keydown`, `pointerdown`, and `focusin` classify only targets inside the
protected content wrapper. A document-level capture `submit` listener applies the submit guard (research D2).
Classified activity enters `decideActivityCommunication` on the tab's own tag record
(`preets-session-activity:v1:<tag>`) inside `navigator.locks.request`; `SendNow` posts to
`/session/activity`, `Coalesce` broadcasts `pending` and schedules the flush, which runs
`flushActivityCommunication` under the lock and reschedules a stale timer. Every snapshot (activity 200, status 200,
broadcast) passes `adoptSnapshot` (higher revision wins, even with an earlier deadline; equal revisions ignored), is broadcast as
`renewed` when newly adopted, and reschedules the single confirmation timer at the local deadline. Listeners for `visibilitychange`, `resume`, and `pagehide` implement research D9; confirmation uses
`AbortSignal.timeout(1500)`. Logout bypasses the window. `logout-control.tsx` renders the header `Button`;
`signed-out-notice.tsx` renders `Alert` + `Heading` + `Text` + `Link href="/"`; the coordinator renders the provider
from `providers/session-confirmation.tsx` with `confirm` bound to the status read and the current `coordinationTag`.
Logout writes the ended record before broadcasting; a network failure or timeout keeps the initiator and the other
tabs confirming until the attempt's `notAfter` plus 2 seconds; the handler refuses an attempt received after `notAfter`
with 408; a 503 is ambiguous; only a definitive 403 or a confirmed-usable status after `notAfter` broadcasts
`logout-failed` (research D8, R18, R21, R22). A held submission is
replayed once with an in-memory pass, so unavailable storage cannot loop it (R19). `tab-channel.ts` wraps
`BroadcastChannel`, `localStorage` (try/catch), and `navigator.locks`; where storage or locks are unavailable, the
window for the tab's tag is kept in memory and communication times are shared on the channel (research D5, R24). `session-endpoints.ts` narrows JSON and maps statuses to coordinator events.

**Runtime and resources**: handlers run in-process on the runtime published by `startProductionRuntime`; before
startup completes they answer 503 through `toNext`. No new resources.

**Configuration and infrastructure**: none new. Existing `SESSION_KEY_PREFIX`, `OIDC_*`, `REDIS_URL`, and tenant files
apply. The 5-minute tenant used by deadline-crossing evidence is a scratch copy, not committed.

**Telemetry**: the three programs are traced `Effect.fn` spans with no tag, reference, identity, or host attribute
beyond what existing spans record. Observability is checked manually only if a probe is used; nothing durable.

**Documentation**: implementation updates `docs/session-state.md` (endpoints, outcome table, tag, browser
coordination, logout, inventory) and `docs/authentication.md` (logout ends the application session only; no provider
logout). `specs/` outside this directory are not touched. The delivery plan is not edited.

**Implementation increments** (each a reviewable implementation branch or commit series; gates in bold):

| # | Increment                       | Content                                                                                                                                                                                                                                                                                                                                                                                              | Evidence completed                                                                          | Gate                                           |
| - | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1 | Coordination server contract    | `next/coordination.ts`, `next/coordination-snapshot.ts`, gate `NON_RENEWING_PATHS` and no renewal cookie writes, callback cookie without `Max-Age`, record `revision` (v2) and store `TIME` on `UsableSession`, gate stops renewing actions, `authorizeSessionAction`, `ResolvedSessionRequest.coordination`, exports; unit, property, composed gate-plus-handler, and real-Redis integration suites | Module evidence for the adapters                                                            | None                                           |
| 2 | Browser coordination policy     | `activity-classification.ts`, `activity-window.ts`, `tab-channel.ts`, `session-endpoints.ts`, coordinator, logout control, signed-out notice, shared provider; frontend unit suite                                                                                                                                                                                                                   | Module evidence for classifier and window                                                   | None                                           |
| 3 | Application composition         | Route files, `(app)/layout.tsx`, fixture feature, pages, and action, `session-reference` tag and confirmation, docs, BDD feature (`@partial`) with **only the executable no-session denial scenarios**, and support helpers                                                                                                                                                                          | V-009 (no-session denial); V-005 HTTP part is quickstart §3, not BDD                        | None                                           |
| 4 | Ungated running-app evidence    | Quickstart §3 with prepared records; V-015 store-outage rows that need no login (status and logout handler mapping through the running app with a prepared record)                                                                                                                                                                                                                                   | V-005 HTTP, V-009 HTTP, V-015 server part                                                   | None                                           |
| 5 | Live multi-tab feature evidence | Real-login BDD scenarios (added to the feature file only now), browser lifecycle and timing evidence, manual steps 3–10                                                                                                                                                                                                                                                                              | V-001–V-004, V-006–V-008, V-009 browser part, V-010–V-014, V-015 browser part, V-016, V-017 | **#158 B6 freshness confirmation functioning** |

Gated real-login journeys stay planned prose in [quickstart.md](quickstart.md) until increment 5. Committing them
earlier would fail the nightly requirements BDD run, which discovers every requirements feature; `@partial` does not
skip scenarios or permit pending steps. Increments 1–4 may merge with `@partial` BDD and an evidence record that reports increment-5 claims as incomplete, as
S1 did. When #158 lands, increment 5 runs on one revision: rebase onto `main`, execute quickstart §4 and §5 in full,
replace each incomplete disposition with the executed result, and keep feature-level `@partial` because SESSION-010
AC4 and the AC6 warning, continuation, and expiration conditions remain with #156/#157.

### Phase 5 — Feature verification integration

[quickstart.md](quickstart.md) operationalizes [verification.md](verification.md) without replacing it: exact
prerequisites, commands, the ungated HTTP procedure with prepared records limited to classification and denial, the
requirements-backed BDD scenarios and non-BDD browser evidence for timing and lifecycle, the manual procedure mapped to
the fixture pages and endpoints, expected observations, cleanup, retained records, and limitations. Module evidence
(Phase 3) is cited, not re-run as feature evidence; each V-claim is observed once at its responsible boundary. Renewal
is always established by the authoritative deadline read through `GET /session/status`, never by an observed event or
request alone. Gated claims are reported incomplete until #158 functions, never satisfied with prepared records.

## Authority findings and open decisions

| Spec finding                               | Plan disposition                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Real-session execution gate             | Planned with proposal A, S1's precedent: increments 1–4 now, increment 5 after #158 ([research F-1](research.md#f-1-real-session-execution-gate-spec-authority-finding-1-planned-resolution-a-as-s1)). Needs maintainer acceptance at the plan gate.                                                                                |
| 2. Identity-provider session on logout     | **Flagged.** Planned as application-session logout only; provider logout would enter through the requirements workflow ([research F-2](research.md#f-2-identity-provider-session-on-logout-spec-authority-finding-2-flagged-application-session-only)).                                                                             |
| 3. Presentation in tabs after logout       | **Resolved in the specification** (US3 scenario 6, FR-023, SC-011, V-017; maintainer decision A of 2026-11-09). Designed in research D8: every tab unmounts protected content and shows an accessible signed-out notice with a Log in link to `/`, which enters S1's fresh-entry flow; nothing starts authentication automatically. |
| 5. Acknowledged gaps in the 2-second bound | **Resolved in the specification** (spec Acknowledged limitations G1 and G2; maintainer decision of 2026-11-10). No pre-hydration inline script is built (research D6, D14).                                                                                                                                                         |

**Acknowledged gaps** ([spec Acknowledged limitations](spec.md#acknowledged-limitations), Authority finding 5;
maintainer decision of 2026-11-10): no pre-hydration inline script is built.

- **G1 — logout while a tab is loading**: a tab still loading when another tab logs out may briefly show protected
  content until its coordinator mounts and replays the ended record; the server denies every protected request from
  it throughout ([research D14](research.md#d14-mounting-a-protected-document-subscribe-replay-then-trust)).
- **G2 — renewal by page load**: a document-entry renewal reaches other sharing tabs only after the new page's
  coordinator mounts, so the 2-second bound can be missed; renewals from in-page activity and form submissions still
  meet it (research D6).

Non-blocking findings F-4 (logout when a later session is in force) and F-5 (JavaScript required for coordination and
logout) are recorded in [research.md](research.md#findings). The user decided on 2026-11-10 that unit tests may import the
private policy modules, following the `onsite-visit-state.test.ts` precedent; the policy functions are not exported
([contracts/modules.md](contracts/modules.md#frontendsrcfeaturessession-coordinationts)).

## Complexity Tracking

No Constitution Check violation requires justification.
