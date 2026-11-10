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
A document entry renews a usable session as `deliberate-page-request`, and a `POST` with
`next-action` as `deliberate-form-submission`, through `refreshForTenant` with the tenant's
effective policy. Every other request only reads, and so does every request to the three
coordination endpoints below, whatever its shape. The gate never creates a session and sets no
cookie: only establishment writes `pathable-session`, as a browser-session cookie without
`Max-Age` ([#155](https://github.com/PathableAI-org/Pre-ETS/issues/155)). A response written later
could arrive after another tab's login and overwrite that session's cookie. The record's TTL is the
idle authority, and a cookie outliving its record names nothing.

`/`, the protected `(app)` layout, and `runReferenceOperation` keep their own `readSessionRequest` check. The reference
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
serverTimeEpochMilliseconds, warningLeadMinutes }`, also returned by `readSessionRequest` as
`coordination` for a usable session. `observedAtEpochMilliseconds` is the Redis `TIME` (milliseconds
with a microsecond fraction) read inside the atomic store transition that produced the state, so it
orders observations of one record; `UsableSession` carries it too. `serverTimeEpochMilliseconds`
only converts the deadline to the tab's clock. The **coordination tag** is `base64url(SHA-256("preets:session-coordination:v1\0" +
reference))`: one-way, distinct from the store-key digest, and not a credential. Activity and
logout carry the tag the tab observed, so a stale tab cannot renew or end a later session.
Protected Server Action forms submit it in a hidden `coordinationTag` field, and
`runReferenceOperation` and `recordFixtureOperation` refuse a missing or different tag with no
effect.

The protected `(app)` layout renders the `session-coordination` client feature around every
protected page. It counts only trusted activity on meaningful inputs: control activation, text
entry, non-modifier keys, touch, and focus in the same task as a key or pointer press. It
ignores pointer movement, scrolling, and programmatic focus. In-page activity follows the 60-second
B5 windows across tabs through one `localStorage` record (`preets-session-activity:v1`) under a
Web Lock; without Web Locks a tab sends at once. A window-end flush sends only when that window is
due, so a stale timer reschedules. Tabs share renewed deadlines, coalesced activity, and logout on
`BroadcastChannel("preets-session-coordination")`, ignoring other tags, and adopt a snapshot only
when its store observation is later than the one they hold. Two more records support replay:
`preets-session-current:v1`, the tag of the most recently mounted protected document, and
`preets-session-ended:v1`, the last eight tags the server confirmed ended. Messages and records hold
only tags, times, the warning lead, and an activity kind.

The layout renders an inline script before the protected content. When the document is parsed,
before hydration, it hides the content if its tag is in the ended record. Otherwise it writes the
current-session hint and broadcasts the server snapshot, so a document-entry renewal reaches other
tabs. On hydration the coordinator subscribes first, replays both records, and only then adopts the
snapshot. A hint naming another session never ends a tab. It makes the tab confirm, and on resume
it also hides content until confirmed. A Server Action submitted while the hint names another
session is held, confirmed, and replayed only if this tab's session is still current.

A tab confirms with `GET /session/status` before acting on its local deadline and on resume. Past
its deadline on resume it first hides content (`hidden` and `inert`). An unanswered or failed
confirmation (1.5 seconds) hides content and retries. A page entering the back-forward cache is
hidden first, and the history guard reloads it on restore. Server Action forms confirm after
they settle, so other tabs learn of the gate's renewal.

Every protected page has a Log out button. Logout announces `logout-started`, then is sent at once
with `keepalive`. Other tabs confirm each second until they see the outcome (at most 10 seconds),
so they conceal even if the initiating tab closes. On 204, 401, or 409 the tab records its tag as
ended, broadcasts, and every sharing tab unmounts protected content and shows a signed-out notice
with a Log in link to `/`.
Authentication never starts on its own. The same notice stands in for expiration until
[#157](https://github.com/PathableAI-org/Pre-ETS/issues/157). If logout fails (403, 503, network),
the tab hides content and offers Log out again. Logout ends the application session only; see
[authentication](./authentication.md#application-logout). Coordination and logout need JavaScript;
without it the gate and idle expiry still enforce access. Live multi-tab behavior is not yet
observable in the running application until [#158](https://github.com/PathableAI-org/Pre-ETS/issues/158).

Independent session clients read identical state from the same record without creator
affinity. This is not independently running protected HTTP recognition, and it does not
replace the backend's durable domain records. Effective timeout/warning derivation remains
owned by the tenant service; see [tenant policy](./multi-tenancy.md#idle-timeout-and-warning-policy).
