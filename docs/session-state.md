# Session state

The frontend owns temporary session state; the backend owns durable domain records.
See [domain persistence](./domain-persistence.md) for that boundary and
[authentication](./authentication.md) for the current initiation flow.

`packages/frontend-services/src/session.ts` exposes the public `SessionService` with these
operations:

- `establish(input)` creates one tenant-bound session record and returns its opaque
  reference plus the same consumer-visible state: issuer/subject identity, the exact
  tenant alias, the authoritative initial idle deadline, and the effective warning policy.
- `read({ reference })` recovers that state for a usable, strictly-unexpired record and
  returns fieldless `NoUsableSession` otherwise. A storage/transport/encode/decode failure,
  a malformed store reply, and exhausted random-reference collisions return the typed
  `SessionServiceUnavailable`. Only a definite `SET NX` "already exists" reply retries
  establishment with a new reference; any other unexpected creation reply fails without retry.
- `readForTenant({ reference, tenantAlias })` delegates classification to `read`. It
  returns that same usable session only when the stored tenant equals the supplied
  branded alias. A different alias fails with fieldless `SessionTenantMismatch`.
  `hasSession()` is removed.

The record lives in Redis under `SESSION_KEY_PREFIX` (default `preets:session:v1`), addressed
by SHA-256 of the opaque reference, written with `SET ... NX PX` so the TTL is the remaining
idle budget. The browser holds only the reference in a host-only `pathable-session` cookie
(`HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`, the existing loopback `Secure` rule) and
never receives identity, policy, tokens, or the record itself.

Session establishment runs after the callback has validated a trusted identity **and** that
authentication event has been confirmed fresh. The freshness comparison and clock tolerance
are not chosen here ([#158](https://github.com/PathableAI-org/Pre-ETS/issues/158)), so the
current callback treats a trusted but unconfirmed identity as the safe return and creates no
session or cookie. Confirmed-fresh establishment, the shared-reader capability, and the
fail-closed outcome vocabulary are implemented but live establishment is blocked on that
unresolved policy.

`/` resolves the tenant under the configured mode and then reads the session. A resolved
tenant with no usable session redirects to `/auth/login`. A host-mode invalid host or
other tenant failure on `/` remains that tenant 404 or 500. Static mode stays independent
of Host. A usable session is admitted only when its tenant equals that resolved tenant.
Later lifecycle slices retain their published ownership: renewal and
current-policy adoption ([#220](https://github.com/PathableAI-org/Pre-ETS/issues/220)),
explicit invalidation and recovery ([#221](https://github.com/PathableAI-org/Pre-ETS/issues/221)),
and warning/presentation UI ([#155](https://github.com/PathableAI-org/Pre-ETS/issues/155)–#158).

## Default entry-point protection

`createProtectionProxy` in `frontend-services` is the Next proxy for every path except
`/_next/static/**`, `/_next/webpack-hmr`, and `/__nextjs*`
([#154](https://github.com/PathableAI-org/Pre-ETS/issues/154)). Every page, Route Handler,
and Server Action, including resources added later and absent paths, is protected unless it
is in the closed public designation: `/_test` or a path under `/_test/` without an encoded
`/`, `\`, or `.`, for every method; or `GET`/`HEAD` of exactly `/auth/callback`,
`/auth/login`, or `/login-unavailable`. A Server Action candidate is never public: a request
with a `next-action` header (any method), or a `POST` whose `content-type` is
`multipart/form-data` or `application/x-www-form-urlencoded` (Next's own possible-action
test). Every other method on the three exact paths is protected. Public requests read no
session state and each resolves its own tenant.

A protected request is a **document entry** when it is a `GET`/`HEAD` without `next-action`
whose Fetch Metadata is a navigation (`sec-fetch-mode: navigate`, or without a mode,
`sec-fetch-dest: document`). Every other protected request, including RSC fetches,
prefetches, `router.refresh()`, subresources such as `/favicon.ico` and `/_next/image`,
Server Action calls, and requests without Fetch Metadata, is an **application request**.
Next strips Flight headers before the proxy, so they are not used.

The gate resolves the request tenant first, then reads the session for that tenant. Every
response it returns carries `Cache-Control: private, no-store`; its denials have empty
bodies and set no cookie.

| Outcome (in order)                | Document entry                           | Application request |
| --------------------------------- | ---------------------------------------- | ------------------- |
| Runtime not started               | 503                                      | 503                 |
| Tenant failure                    | Tenant 404 page or 500                   | Same                |
| Session state undeterminable      | 503                                      | 503                 |
| No usable session                 | 307 to same-origin `/auth/login`         | 401                 |
| Session for another tenant        | 403 forbidden page rendered by the proxy | 403                 |
| Usable session for request tenant | Passes through                           | Passes through      |

The forbidden page is the proxy response itself, not a rewrite: the Next app renders the
same `ForbiddenNotice` that `forbidden()` shows, with status 403 and
`content-type: text/html; charset=utf-8`. Next normalizes loopback hosts to `localhost`, so a
rewrite would become an external proxy when Next binds `127.0.0.1`
([#356](https://github.com/PathableAI-org/Pre-ETS/issues/356)).

A defect rejects the proxy promise (Next answers 500); nothing passes through on failure.
A document entry renews a usable session as `deliberate-page-request` through `refreshForTenant`
with the tenant's effective policy. Every other request only reads at the gate, including every
Server Action and every request to the three coordination endpoints below, whatever its shape. A
protected Server Action renews inside `authorizeSessionAction`, after its tag check, as
`deliberate-form-submission`. The gate never creates a session and sets no
cookie: only establishment writes `pathable-session`, as a browser-session cookie without
`Max-Age` ([#155](https://github.com/PathableAI-org/Pre-ETS/issues/155)). A response written later
could arrive after another tab's login and overwrite that session's cookie. The record's TTL is the
idle authority, and a cookie outliving its record names nothing.

`/` and the protected `(app)` layout keep their own `readSessionRequest` check; `runReferenceOperation` and
`recordFixtureOperation` call `authorizeSessionAction`. The reference
consumer shows a rejected action invocation as "The operation was not performed." without
retrying. The root layout renders a history guard that reloads a page restored from the
back-forward cache and refreshes the route on `popstate`, so history traversal reaches the
gate.

Inventory: protected pages `/`, `/coordination/roster`, and `/coordination/participant`; protected
Server Actions `runReferenceOperation` and `recordFixtureOperation`; protected Route Handlers
`POST /session/activity`, `GET /session/status`, and `POST /auth/logout`; public resources as
designated above.

Known gaps: `/_next/static/**` is publicly served and `/favicon.ico`, metadata routes, and
`/_next/image` answer 401 without a session until the public-asset decision is made.
Expired- or missing-session recovery content and Server Action 401 recovery belong to
[#157](https://github.com/PathableAI-org/Pre-ETS/issues/157). The callback cannot establish a
session until freshness confirmation exists
([#158](https://github.com/PathableAI-org/Pre-ETS/issues/158)), so admission of a real session
is not yet observable in the running application.

## Cross-tab activity and logout coordination

Tabs of one tenant in one browser context share one session
([#155](https://github.com/PathableAI-org/Pre-ETS/issues/155)). Three protected Route Handlers
built by `frontend-services` let a tab take part in it. The gate runs first and never renews on
these paths, so each handler resolves the tenant and re-checks the session itself. No handler sets
or clears a cookie:

| Handler                  | Rejected before any session operation                             | Outcome                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /session/activity` | Not same-origin 403; not `application/json` 415; invalid body 400 | Tag of another session 409, nothing renewed. Otherwise `refreshForTenant` with the in-page kind and effective policy: 200 snapshot, or 401 without a session |
| `GET /session/status`    | none                                                              | Reads only, never renews: 200 snapshot or 401                                                                                                                |
| `POST /auth/logout`      | Not same-origin 403; not `application/json` 415; invalid body 400 | 401 without a session; tag of another session 409, nothing invalidated; otherwise `invalidate` and 204                                                       |

Tenant mismatch answers 403, undeterminable session state 503, and tenant failure 404 or 500. Every response is `private, no-store`; non-200
bodies are empty. Same-origin means `sec-fetch-site: same-origin`, or without it an `Origin`
equal to the request origin. The in-page kinds are `intentional-control-activation`,
`keyboard-interaction`, `text-entry`, `touch-interaction`, and
`user-driven-meaningful-input-focus`; deliberate requests renew at the gate.

The **snapshot** is `{ coordinationTag, idleDeadlineEpochMilliseconds, observedAtEpochMilliseconds,
revision, serverTimeEpochMilliseconds, warningLeadMinutes }`, also returned by `readSessionRequest` as
`coordination` for a usable session. `revision` is the stored record's revision: the record is
schema version 2, establishment writes revision 1, and every store write (a qualifying refresh or a
policy adoption) increments it in the same atomic transition. Reads and excluded refreshes return it
unchanged. A version-1 record reads as revision 0 and is rewritten as version 2 on its next write.
Tabs order snapshots by `revision` alone. `observedAtEpochMilliseconds`, the Redis `TIME` read in
that transition, is diagnostic only. `UsableSession` carries both. Tabs hold
the deadline on the server clock and convert it with a per-tab clock offset estimated from request
timing: the server time is placed at the local midpoint of the request's round trip (Navigation
Timing for the server-rendered snapshot). The estimate from the response with the smallest round
trip is kept, and a response whose interval no longer overlaps it replaces it, as after a local
clock step. Snapshot age and hydration time never extend the deadline. Broadcast deadlines stay on
the server clock. The **coordination tag** is `base64url(SHA-256("preets:session-coordination:v1\0" +
reference))`: one-way, distinct from the store-key digest, and not a credential. Activity and
logout carry the tag the tab observed, so a stale tab cannot renew or end a later session.
Protected Server Action forms submit it in a hidden `coordinationTag` field. `runReferenceOperation`
and `recordFixtureOperation` call `authorizeSessionAction({ coordinationTag, host, reference })`,
which compares the tag with the cookie's tag and only then renews. A missing or different tag
answers `SessionChanged` with no store write, and the action is refused with no effect.

The protected `(app)` layout renders the `session-coordination` client feature around every
protected page. It counts only trusted activity on meaningful inputs: control activation, text
entry, non-modifier keys, touch, and focus in the same task as a key or pointer press. It
ignores pointer movement, scrolling, and programmatic focus. In-page activity follows the 60-second
B5 windows across tabs through one `localStorage` record per session tag
(`preets-session-activity:v1:<tag>`) under a Web Lock, so a stale tab writes only its own session's
record. Records for tags other than the tab's and the current hint's are pruned to the four most
recently touched. Without `localStorage` or Web Locks, each tab keeps its window in memory and
announces each send on the channel (`communicated`). A receiving tab clears its pending activity if
the send is at or after its latest pending interaction, and otherwise keeps the later activity with
its 60-second bound. A tab that joins in this mode broadcasts `window-query`, and the others answer
with their last communication time. A window-end flush sends only when that window is
due, so a stale timer reschedules. Tabs share renewed deadlines, coalesced activity, and logout on
`BroadcastChannel("preets-session-coordination")`, ignoring other tags, and adopt a snapshot only
when its revision is higher than the one they hold; equal revisions are ignored. Two more records support replay:
`preets-session-current:v1`, the tag of the most recently mounted protected document, and
one `preets-session-ended:v1:<tag>` → `{ endedAt }` key per tag the server confirmed ended, pruned
after 24 hours. Messages and records hold
only tags, times, the warning lead, and an activity kind.

When the coordinator mounts after hydration, it subscribes first and replays the ended record; if
its tag ended, it unmounts the protected content. Otherwise it adopts the server-rendered snapshot,
writes the current-session hint, and broadcasts the page-load renewal and `session-current`. When
`localStorage` is unavailable, the replay proves nothing, so the coordinator hides content and
confirms with the server before trusting the snapshot. A `session-current` from another tag is the
one message not filtered out by tag; it only makes the tab confirm. There
is no pre-hydration script, so two gaps are accepted
([#155](https://github.com/PathableAI-org/Pre-ETS/issues/155)): a tab that loads while another tab
logs out can show protected content until its coordinator mounts (the server still denies its
requests), and a page-load renewal reaches other tabs only after hydration, which may exceed the
2-second bound on a slow device. A hint naming another session never ends a tab. It makes the tab
confirm, and on resume it also hides content until confirmed. A Server Action submitted while the hint names another
session is held, confirmed, and replayed once, with an in-memory pass for that form and submitter,
only if this tab's session is still current. When storage cannot hold the hint, the confirmed tag
is kept in memory as this tab's hint. The coordinator's header carries `data-session-deadline` (the
held local deadline) and `data-session-warning-lead` for evidence; they hold no protected content.

A tab confirms with `GET /session/status` before acting on its local deadline and on resume. Past
its deadline on resume it first hides content, setting `hidden` and `inert` on the DOM at once
rather than waiting for React to render. Concealment also applies while a logout is in progress,
which keeps its busy state. A usable answer reveals content when its read started after
concealment began, even if a newer renewal from another tab was adopted meanwhile. An unanswered or failed
confirmation (1.5 seconds) hides content and retries. A page entering the back-forward cache is
hidden first, and the history guard reloads it on restore. Server Action forms confirm after
they settle, so other tabs learn of the gate's renewal.

Every protected page has a Log out button. Each attempt gets an `attemptId` and is written to its
own `localStorage` key (`preets-session-logout-pending:v1:<tag>:<attemptId>` → `{ notAfter }`), then
announced as `logout-started` and sent at once with `keepalive`. `notAfter` is the Redis-clock time
10 seconds ahead, from a second per-tab offset calibrated against snapshots'
`observedAtEpochMilliseconds`. The handler compares no clocks: the store deletes the record only while
Redis `TIME` is at or before `notAfter`, and otherwise the handler answers 408. Other tabs, and tabs that mount or resume
while the key exists, start a confirmation each second, without waiting for earlier reads, until
the attempt resolves: `logged-out`, its own `logout-failed`, a 401 or different tag, or a usable
status whose Redis `observedAtEpochMilliseconds` is later than `notAfter`, after which the attempt
can no longer delete. A stored attempt never ends a tab by itself. Each watch read gives up after one second, so a
tab conceals within two seconds even if the initiating tab closes. On 204, 401, or 409 the tab
records its tag as ended, broadcasts, and every sharing tab unmounts protected content and shows a
signed-out notice with a Log in link to `/`. A network failure, timeout, 408, or 5xx is ambiguous,
because the server may have ended the session and lost or failed the reply (a 503 can follow an
applied delete): the initiating tab hides content and confirms, the other tabs keep watching, and
the status answer decides. A 401 or a different tag ends every tab as above; a usable status
observed after `notAfter` means logout did not complete.
Authentication never starts on its own. The same notice stands in for expiration until
[#157](https://github.com/PathableAI-org/Pre-ETS/issues/157). If logout fails (a definitive 403 or
other refusal, or a usable status observed after `notAfter`), the tab broadcasts `logout-failed` with
its `attemptId`, which resolves that attempt in the other tabs, hides content, and offers Log out again. Logout ends the application session only; see
[authentication](./authentication.md#application-logout). Coordination and logout need JavaScript;
without it the gate and idle expiry still enforce access. Live multi-tab behavior is not yet
observable in the running application until [#158](https://github.com/PathableAI-org/Pre-ETS/issues/158).

Independent session clients read identical state from the same record without creator
affinity. This is not independently running protected HTTP recognition, and it does not
replace the backend's durable domain records. Effective timeout/warning derivation remains
owned by the tenant service; see [tenant policy](./multi-tenancy.md#idle-timeout-and-warning-policy).

## Verification signals

These spans and logs let a [verification agent](engineering/verification-harness.md) observe session, coordination,
and protection outcomes from exported telemetry. They follow the
[verification telemetry conventions](observability.md#verification-telemetry-conventions). Feature telemetry
contracts reference these rows rather than redefining them. Every row is on an existing `Effect.fn` span. Each span
sets `preets.outcome` from the closed set listed. Durable tests do not assert any of them.

Correlate through W3C trace context, `service.version`, `service.instance.id`, `preets.tenant.alias`, and
`session.id`. `session.id` is the record's opaque telemetry UUID, present wherever a stored record was decoded or
created. No signal carries the session reference, cookie, coordination tag, issuer, subject, or any token.

### Session service spans

| Span                              | `preets.outcome`                                                                               | Other attributes                                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `SessionService.establish`        | `established`, `unavailable`                                                                   | `preets.session.deadline_ms`, `preets.session.idle_timeout_minutes`, `preets.session.warning_lead_minutes`, `session.id`                  |
| `SessionService.read`             | `current`, `expired`, `missing`, `no_reference`, `unavailable`                                 | `preets.session.deadline_ms`, `preets.session.revision`, `preets.session.warning_lead_minutes`, `session.id` when a record was decoded    |
| `SessionService.readForTenant`    | `current`, `no_session`, `tenant_mismatch`, `unavailable`                                      | `preets.tenant.alias`. The child `SessionService.read` span carries the record facts                                                      |
| `SessionService.refreshForTenant` | `renewed`, `unchanged`, `expired`, `missing`, `no_reference`, `tenant_mismatch`, `unavailable` | `preets.session.activity`, `preets.session.activity_class`, `preets.tenant.alias`, policy minutes, and the record facts listed for `read` |
| `SessionService.invalidate`       | `removed`, `missing`, `rejected_late`, `no_reference`, `unavailable`                           | `preets.session.logout_cutoff_ms` when the caller supplied a cutoff                                                                       |

- `renewed` means a qualifying activity wrote a new deadline. `unchanged` means an excluded activity found a current
  record and left it as stored. `no_reference` means the request carried no well-formed reference, so no store call
  was made.
- `preets.session.activity` is the activity literal, for example `deliberate-page-request` or `keyboard-interaction`.
  `preets.session.activity_class` is `qualifying` or `excluded`.
- On a qualifying refresh, `preets.session.idle_timeout_minutes` and `preets.session.warning_lead_minutes` are the
  effective tenant policy the renewal adopts. On a renewed record, `preets.session.deadline_ms` is the new
  authoritative deadline and `preets.session.revision` is the stored revision after the write.
- `rejected_late` on `invalidate` is a cutoff logout that reached the store after `notAfter` and deleted nothing.

### Host adapter spans

| Span                                         | `preets.outcome`                                                                                                                                                         | Other attributes                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `protectRequest`                             | `admitted`, `redirected_login`, `denied_unauthenticated`, `denied_forbidden`, `unavailable`, `tenant_failure`                                                            | `preets.protection.entry` (`document`, `application`), `preets.protection.renewal` (`deliberate-page-request`, `none`), `preets.tenant.alias` |
| `sessionActivity`, `sessionStatus`, `logout` | `ok`, `unauthenticated`, `tag_mismatch`, `cross_origin`, `unsupported_content_type`, `invalid_body`, `rejected_late`, `tenant_mismatch`, `unavailable`, `tenant_failure` | `preets.tenant.alias` once the tenant resolved                                                                                                |
| `authorizeSessionAction`                     | `authorized`, `session_changed`, `no_session`, `tenant_mismatch`, `unavailable`, `tenant_failure`                                                                        | `preets.tenant.alias`                                                                                                                         |

The session-service span under each adapter span carries the session facts for that request. `rejected_late`
appears only on `logout`.

### Tenant configuration log

A rejected tenant configuration keeps the fixed message `Tenant configuration request failed`, with its existing
`_tag` and `reason`. When the alias was resolved, the log is annotated with `preets.tenant.alias`. A JSON or schema
rejection also carries `preets.tenant.config.rejected_field`: `idleTimeoutMinutes`, `warningLeadMinutes`, or
`other`. It names the field, never the value or file content. A warning lead that is not below the effective
timeout reports `warningLeadMinutes`.

### Example verifier queries

Filter every query by the run's `service.version` and `service.instance.id`:

```text
{ resource.service.instance.id = "<run-uuid>" && name = "SessionService.refreshForTenant" && span.preets.outcome = "renewed" }
{ resource.service.instance.id = "<run-uuid>" && name = "protectRequest" } | select(span.preets.outcome, span.preets.protection.entry)
{ resource.service.instance.id = "<run-uuid>" && name = "SessionService.invalidate" && span.preets.outcome = "rejected_late" }
```

```text
{service_name="pre-ets-frontend"} |= "Tenant configuration request failed"
```

### Not emitted

| Fact                                             | Why                                                      | Verified instead                                                                                                                                                            |
| ------------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renewal and rejection rates (metrics)            | No current claim needs a rate                            | Per-request span outcomes. Add counters when a telemetry contract needs one                                                                                                 |
| Public-path pass-through at the gate             | The gate returns before any traced operation             | Module tests and browser interaction                                                                                                                                        |
| Late activity after Redis has evicted the record | The key's TTL equals the deadline, so the record is gone | The step's trace (the verifier's own `traceparent`) shows `missing` or `expired`. Compare with `preets.session.deadline_ms` from an earlier span with the same `session.id` |
| Session reference, coordination tag, identity    | Forbidden data classes                                   | Module tests                                                                                                                                                                |

`expired` appears only when the application clock has passed the deadline before Redis evicted the key. Most late
activity therefore shows as `missing`, and it carries no `session.id`, because nothing was decoded.
