# Session claims deferred until #158

Features 162 and 163 deferred some verification claims "until #158", because the running application could not yet
establish a real session. [#158](https://github.com/PathableAI-org/Pre-ETS/issues/158) is closed, and the maintainer
decided on 2026-11-16 that these deferrals are work, not waivers
([#444, decision 5](https://github.com/PathableAI-org/Pre-ETS/issues/444#issuecomment-6924345571)). This page records
executed evidence for each deferred claim, and for the public-asset assessment that the same decision unblocked
([#499](https://github.com/PathableAI-org/Pre-ETS/issues/499)).

The historic records stay as they are:
[162 `verification.md`](../specs/162-protect-entry-points/verification.md) and
[163 `verification.md`](../specs/163-coordinate-tab-activity/verification.md) define each claim, its meaningful
violation, and its procedure. This page does not restate or change them. Current behavior is described in
[Session state](session-state.md).

## Revision and conditions

- **Application revision:** `main` at `9322cfe` (`9322cfe5a2ee94ac57a93386c3d2c1d90f179b84`). The pull request that adds
  this page changes nothing else, so its verified revision runs the same application, tests, and fixtures.
- **Environment:** production `next start` build, local Redis 8.10.3 and Keycloak 26.8.2 from Compose (realm
  `pre-ets`), Playwright's Chromium. Synthetic tenants `springfield` and `shelbyville` from
  [`fixtures/tenant-config/`](../fixtures/tenant-config/) and the realm's synthetic user. Every session comes from real
  sign-in through the application and the provider; no prepared session record stands in for a login.
- **Not established here:** provider logout, Microsoft compatibility (an accepted limitation since #444), what a screen
  reader announces, and the acknowledged gaps G1 and G2 of feature 163 (a tab still loading during logout, and a
  page-load renewal reaching other tabs after hydration), which no claim below covers.

## Claims

IDs V-001 to V-022 are this record's, and the verification report uses them. The second column names the historic claim
by feature and ID. "Prior evidence" is a verifier report recorded before this page, at the revision it names. The
procedures are under [Procedures](#procedures).

| ID    | Historic claim                                | Observation that establishes it here                                                                                                                                                                                                                                                                                                                                                                                                                            | Prior evidence                                                                                                                                                                                                                          | Procedures     |
| ----- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| V-001 | 162 V-004 (public assets)                     | Every file the build publishes under `/_next/static/**` loads without a session and holds no protected information: no tenant configuration, identity, credential, session data, or server configuration. `/favicon.ico`, metadata routes, and `/_next/image` stay protected                                                                                                                                                                                    | None; open until F-1 was decided                                                                                                                                                                                                        | A1             |
| V-002 | 162 V-006 (confirmed versus unconfirmed)      | A real provider return confirmed fresh establishes a session; a return whose provider reports a stale authentication time, also with the provider's single sign-on session held, establishes none and shows no protected content                                                                                                                                                                                                                                | #502 run `08fe1e9a` at `438e620` (`@preets-session-013`)                                                                                                                                                                                | B1             |
| V-003 | 162 V-007 (login binds user and tenant)       | After real sign-in, the next protected request is admitted and shows the provider user's subject, the tenant's issuer, and the tenant alias                                                                                                                                                                                                                                                                                                                     | #502 run `08fe1e9a` at `438e620`; #439 run `d0355f02` at `97f13a3` (in its pull request body; its note predates comment sync)                                                                                                           | B1, B2         |
| V-004 | 162 V-008 (two instances)                     | A session established through instance A is admitted through B with the same identity, and the reverse; a renewal through one is reported by the other past the original deadline; after the renewed deadline the other denies, then the one that renewed denies, and activity revives it on neither                                                                                                                                                            | #439 run `d0355f02` at `97f13a3`                                                                                                                                                                                                        | B2             |
| V-005 | 162 V-014, valid-session joining              | A tab opened while the session exists is served the protected page with no request to the login route or the provider and presents the same session                                                                                                                                                                                                                                                                                                             | #442 run `9e5adba5` at `4eb5327`; #502 run `08fe1e9a` at `438e620` (later pages reuse the session)                                                                                                                                      | B3, B4         |
| V-006 | 162 V-015, step 7b (history after real login) | After real sign-in and viewing a protected page, once the session expired or logout removed it, refresh, document back and forward, a page restored from the back/forward cache, and in-app back and forward each reach the provider with no protected document served or restored and no protected content exposed                                                                                                                                             | #502 run `08fe1e9a` at `438e620`; #509 run `c0b05fda` at `fbda151` (expiration modal scenario)                                                                                                                                          | B3, B6         |
| V-007 | 163 V-001 (one session per browser)           | Every tab of one tenant in one browser presents the same session and holds the deadline the session's own status read reports                                                                                                                                                                                                                                                                                                                                   | #442 run `9e5adba5` at `4eb5327`                                                                                                                                                                                                        | B4             |
| V-008 | 163 V-002 (new tab joins and takes part)      | A new tab joins without a login and holds the session's current deadline and warning lead; activity in the newest tab reaches an earlier tab, activity in an earlier tab reaches later ones, and logout in a joined tab signs out the others                                                                                                                                                                                                                    | #442 run `9e5adba5` at `4eb5327` (join, deadline, activity from the first tab, logout from a joined tab)                                                                                                                                | B4, M1         |
| V-009 | 163 V-003 (inactive tab outlives deadline)    | After activity in another tab of the same browser, a tab left untouched past the deadline it held before that activity still shows its content, and a protected operation submitted from it succeeds                                                                                                                                                                                                                                                            | Partial: #509 run `c0b05fda` at `fbda151` passed "Tabs stay unexpired while the session is renewed", where another browser renews and no protected operation is submitted                                                               | B6, M3         |
| V-010 | 163 V-004 (2-second synchronization)          | Every running sharing tab holds a renewed deadline within 2 seconds of the renewal response; after a tenant policy change and a qualifying renewal, another running tab holds the changed warning lead within 2 seconds of that response                                                                                                                                                                                                                        | Deadline: #442 run `9e5adba5` at `4eb5327`. Policy: #497 run `af113191` at `0a899af` shows tabs adopting a changed lead, within 5 seconds                                                                                               | B4, M1, M2     |
| V-011 | 163 V-006 (each qualifying kind renews)       | Control activation, text entry, a key press, touch, and focus moved by Tab each renew the session at once when nothing was communicated in the previous minute                                                                                                                                                                                                                                                                                                  | #441 run `422f73ab` at `86ecf51`                                                                                                                                                                                                        | B5             |
| V-012 | 163 V-007 (pointer and script focus)          | Pointer movement and focus moved by script renew nothing inside or after a window; with only those events the session reaches its deadline and access ends                                                                                                                                                                                                                                                                                                      | #441 run `422f73ab` at `86ecf51` (deadline unchanged 5 seconds after the window; access ending not observed)                                                                                                                            | B5, M4         |
| V-013 | 163 V-008 (B5 windows)                        | After a minute without communication, interaction in any sharing tab renews at once; interaction inside an open window waits for its end and renews once, no later than 60 seconds after it; interaction less than 60 seconds before the deadline is sent at once whatever window is open                                                                                                                                                                       | #441 run `422f73ab` at `86ecf51` (the near-deadline rule by module tests, as #441 decided)                                                                                                                                              | B5, T1         |
| V-014 | 163 V-009 (no revival)                        | Activity communicated after logout or after expiry is refused and leaves protected requests denied, through either instance and in the browser                                                                                                                                                                                                                                                                                                                  | #442 run `9e5adba5` at `4eb5327` (logout); #439 run `d0355f02` at `97f13a3` (expiry)                                                                                                                                                    | B2, B4, B5     |
| V-015 | 163 V-010 (accessible logout)                 | Log out is reached by keyboard with visible focus; the logout request starts at once; it ends the shared session, and the logged-out session is refused protected operations, activity, status reads, and protected documents                                                                                                                                                                                                                                   | #442 run `9e5adba5` at `4eb5327` (all but keyboard and focus)                                                                                                                                                                           | B4, M5         |
| V-016 | 163 V-011 (logout concealment)                | Within 2 seconds of the logout request, every other running sharing tab shows no readable protected content and exposes none in its accessibility tree or to keyboard focus                                                                                                                                                                                                                                                                                     | #442 run `9e5adba5` at `4eb5327`; #509 run `c0b05fda` at `fbda151` (no protected text in the document)                                                                                                                                  | B4, M5         |
| V-017 | 163 V-012 (isolation)                         | Activity and logout leave another tenant's session in the same browser and another browser's session unrenewed and usable; queued activity from a tab of an earlier session, and a logout sent by such a tab after a new sign-in, leave the new session usable with its deadline unchanged                                                                                                                                                                      | #442 run `9e5adba5` at `4eb5327` (other tenant, other browser)                                                                                                                                                                          | B4, M6, T2     |
| V-018 | 163 V-013 (resume after renewal)              | A tab suspended past its known deadline while the session was renewed elsewhere hides its content at once on resuming, confirms, and shows its content again with the current deadline and no expired state                                                                                                                                                                                                                                                     | #509 run `c0b05fda` at `fbda151` (suspension emulated with Playwright's clock and a dispatched visibility event)                                                                                                                        | B6, M7         |
| V-019 | 163 V-014 (resume across logout, history)     | A tab suspended across a logout conceals within 2 seconds of resuming before its deadline, and at once past it, with no protected use; back or forward to a page without a session, including one restored from the back/forward cache, leads to tenant sign-in rather than the expiration modal                                                                                                                                                                | #442 run `9e5adba5` at `4eb5327` (resume before the deadline); #502 run `08fe1e9a` at `438e620` (history after logout)                                                                                                                  | B3, B4, M8     |
| V-020 | 163 V-015 (undeterminable state)              | While the session store cannot answer, a tab confirming at its deadline, a resumed tab, and a tab logging out keep protected content hidden and never present a usable session or a completed logout                                                                                                                                                                                                                                                            | Server part only, for the implementation before later contract changes (163 quickstart, "V-015 server part")                                                                                                                            | M9, T2         |
| V-021 | 163 V-016 (no data in coordination)           | Coordination messages and stored records hold only tags, times, the warning lead, an activity kind, and an end cause; no outcome a tab shows, and no refusal body, carries a session reference, token, or protected content; another browser receives nothing                                                                                                                                                                                                   | None executed                                                                                                                                                                                                                           | M5             |
| V-022 | 163 V-017 (signed-out notice)                 | After logout every running sharing tab shows the signed-out notice, exposed in the accessibility tree with its heading, explanation, and a Log in link; no tab starts authentication on its own, through the session's former deadline; Log in, activated by keyboard with visible focus, reaches tenant sign-in with a fresh-authentication request; later navigation, refresh, and history follow fresh entry. A screen reader's announcement is not observed | #442 run `9e5adba5` at `4eb5327` (notice in every tab); #502 run `08fe1e9a` at `438e620` (keyboard Log in from the notice, history); #509 run `c0b05fda` at `fbda151` (a tab that logged out keeps its notice past its former deadline) | B3, B4, B6, M5 |

## Procedures

Each procedure runs at the verified revision with the services above, `OTEL_SDK_DISABLED=true` unless the verifier
chooses to export telemetry, and only synthetic data. Record cookie values, session references, coordination tags,
and tokens nowhere; compare them in memory only.

### Requirements BDD

Select by tag or name as [BDD commands](../features/README.md#run-the-scenarios-a-change-touches) describes, after
building the frontend. `BDD_PARALLEL` may be set; the selections are independent.

| ID | Selection                                                                                                                                                                                                                                                                                                                                                 | Scenarios                                                                                                                                                                                                      |
| -- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 | `pnpm test:bdd:tags "@preets-session-003 and @preets-session-013"`                                                                                                                                                                                                                                                                                        | 4: the fresh return across instances, the stale return, the stale return with single sign-on held, and cancellation at the provider (`tenant-oidc-callback.feature`)                                           |
| B2 | `pnpm test:bdd:tags "@preets-session-006"`                                                                                                                                                                                                                                                                                                                | 3 (`shared-session-instances.feature`; two wait about 5½ minutes)                                                                                                                                              |
| B3 | `pnpm test:bdd:tags "@preets-session-004 and @preets-session-013"`                                                                                                                                                                                                                                                                                        | 9: `fresh-entry-after-expiry.feature` (2), the `@preets-session-004` scenarios of `fresh-oidc-recovery.feature` (5), and one each from `default-entry-protection.feature` and `tenant-oidc-initiation.feature` |
| B4 | `pnpm test:bdd:tags "@preets-session-010"`                                                                                                                                                                                                                                                                                                                | 4 (`tab-sharing.feature`)                                                                                                                                                                                      |
| B5 | `pnpm test:bdd:tags "@preets-session-009"`                                                                                                                                                                                                                                                                                                                | 13: `qualifying-activity.feature` (8), `session-tab-coordination.feature` (4), and the `idle-timeout.feature` scenario in which nothing revives an ended session                                               |
| B6 | `pnpm exec cucumber-js --config cucumber.mjs --name "Expiry conceals every sharing tab behind the blocking expiration modal within two seconds" --name "Tabs stay unexpired while the session is renewed, and a resumed tab confirms before showing content" --name "Log in from the signed-out notice asks the provider again and yields a new session"` | 3 (`expiration-protection.feature` 2, `fresh-oidc-recovery.feature` 1)                                                                                                                                         |

### Module tests

| ID | Command                                                                | What it adds                                                                                                                                                                                                                                                                                    |
| -- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1 | `pnpm --filter @pathableai/pre-ets-frontend test:unit`                 | "TabCoordination near-deadline activity (research D5, B5-W)": a press less than 60 seconds before the deadline is sent at once inside an open window. A renewal opens a window that ends 4 minutes before its deadline, so a running application cannot reach this state with answered renewals |
| T2 | `pnpm --filter @pathableai/pre-ets-frontend-services test:integration` | On real Redis: activity and logout carrying another session's tag change nothing, activity revives no session after logout or expiry, a protected action is authorized only for its own tag, and an owned store that stops answers fails reads, renewals, and invalidation                      |

### Manual procedures

Start one production instance as A, as [162 quickstart §2](../specs/162-protect-entry-points/quickstart.md#2-build-and-running-instances)
shows, with owned session and transaction key prefixes and `TENANT_CONFIG_DIR` pointing at an owned copy of
`fixtures/tenant-config/`. In that copy, give both tenants `"idleTimeoutMinutes": 5` and no warning lead, which
disables the warning under a five-minute timeout. Sign in through the application and the provider in Chromium with
the realm's synthetic user. Pages: `/coordination/roster` (the protected "Record attendance note" form, which answers
"The attendance note was accepted."), `/coordination/participant` (the goal field, the acknowledgement checkbox, and
Focus later), and `/`. Read the authoritative deadline with `GET /session/status` from the same browser context
(`sec-fetch-mode: cors`, `sec-fetch-site: same-origin`); it never renews. A tab's held deadline and warning lead are
the `data-session-deadline` and `data-session-warning-lead` attributes of its `header`. Time a renewal from the
`responseEnd` of its `POST /session/activity` in the tab that sent it (Resource Timing), and a logout from the
`startTime` of its `POST /auth/logout`, as `tab-sharing.feature` does. Each step uses its own browser context, so its
session is its own. Suspend a tab with the CDP command `Page.setWebLifecycleState` (`frozen`, then `active`) and
bring it to the front; do not dispatch a synthetic `visibilitychange`
([163 quickstart §4](../specs/163-coordinate-tab-activity/quickstart.md#4-requirements-backed-bdd-and-browser-evidence)).
To see whether a resumed tab hides its content at once, install a `MutationObserver` before suspending it that records
when its protected content gains or loses `hidden` or `inert`.

- **M1, joining and participation (V-008, V-010).** Springfield. Sign in, open tab 1 on the roster, then tab 2 on the
  participant page. Record that tab 2 made no request to `/auth/login` or the provider, and that both tabs hold the
  status read's deadline (within 250 ms) and warning lead. Wait 61 seconds without interacting, then type one
  character in tab 2's goal field. Record the delay from that activity response to tab 1 holding the renewed deadline
  (at most 2 seconds).
- **M2, policy change (V-010).** Shelbyville, so no other step's policy changes. Sign in and open tabs 1 and 2 on the
  participant page; both hold a warning lead of 0. Change Shelbyville's file to `"warningLeadMinutes": 1`. Wait 61
  seconds after the last page load, type in tab 2, and record the delay from that activity response to tab 1 holding a
  warning lead of 1 and the renewed deadline (at most 2 seconds each).
- **M3, inactive tab (V-009).** Continue M1's context. Before M1's typing, tab 1 held a deadline D. Leave tab 1
  untouched until 5 seconds past D. Record that it still shows its protected content with no concealment, expiration
  modal, or signed-out notice; submit "Record attendance note" from it and record "The attendance note was accepted."
  and a usable status read afterwards.
- **M4, pointer and script focus only (V-012).** Springfield. Sign in, open the participant page, and read the
  deadline D. Until 2 seconds past D, every 5 seconds move the pointer across the page's controls without pressing,
  and focus the goal field from script (`element.focus()` in `page.evaluate`). Read the status every minute and record
  that the deadline stays D. After D, record status 401, the expiration modal and no protected content in the tab, and
  a raw document request presenting the session answered 307 to `/auth/login`.
- **M5, keyboard logout and the signed-out notice (V-015, V-016, V-021, V-022).** Springfield, with a second context
  that signs in to Springfield as another browser. Sign in and open tab 1 on the roster, tab 2 on the participant page,
  and tab 3 on `/`. Before the logout, record in every tab, of both contexts, each `BroadcastChannel` message on
  `preets-session-coordination` and each `localStorage` key and value. In tab 3 press Tab until Log out has focus;
  record `:focus-visible` and a visible focus indicator, then press Enter. Record:
  - the delay from the key press to the logout request starting (at once, not held for an activity window), and its
    204 answer
  - in tabs 1 to 3, within 2 seconds of the request starting, the visible "You are signed out" heading with no
    protected text, header, or form in the document, and an accessibility tree that holds the notice's heading,
    explanation, and Log in link and nothing protected; that Tab reaches no protected control
  - every message and stored value: only tags, times, the warning lead, an activity kind, and an end cause; none equal
    to or containing the session cookie's value; nothing received by the other context, whose session stays usable
  - until 5 seconds past the session's former deadline, no request from any tab to `/auth/login` or the provider, each
    tab's address unchanged, and the notice still shown
  - then, in tab 1, Log in reached by Tab with visible focus and activated with Enter, leading through `/` and
    `/auth/login` to the provider's authorization endpoint with `max_age=0`; stop at the provider
- **M6, a later session (V-017).** Springfield, in one context.
  1. Sign in and open tabs 1 and 2 on the participant page. Press an arrow key in tab 1's goal field (sent at once),
     and 5 seconds later type in it again (held until the window ends). Log out in tab 2 within that window. Open tab
     3 on `/`, sign in again, and read the new deadline D2. Five seconds after the window ends, record whether tab 1
     sent its held activity and the answer, that the status read still reports D2, and that tab 3 still shows its
     content.
  2. Sign in and open tab A on the participant page and tab B on `/`. Suspend tab A. Log out in tab B. Open tab C on
     `/`, sign in again, and read the new deadline D4. Resume tab A and activate its Log out at once. Record the
     logout request's answer, a status read still reporting D4, and tab C's content. If tab A hides Log out before it
     can be activated, record that, then send `POST /auth/logout` from this context with tab A's earlier tag and the
     body tab A would send ([Session state](session-state.md#cross-tab-activity-and-logout-coordination)), and record
     the same.
- **M7, resume after renewal (V-018).** Springfield. Sign in and open tabs 1 and 2 on the participant page. Record tab
  2's held deadline D, then suspend tab 2. Keep the session valid by typing in tab 1 after each 61 seconds of silence
  until 10 seconds past D, then resume tab 2. Record that its protected content became hidden or inert in the task
  that resumed it, then that it shows its content again with the status read's deadline and no expiration modal or
  signed-out notice. If tab 2 adopted a renewal while suspended, record the step as not established.
- **M8, resume across logout and history (V-019, V-022).** Springfield.
  1. Sign in and open tabs 1, 2, and 3 on the participant page. Suspend tab 1, log out in tab 2, and resume tab 1
     before its deadline: record the delay to concealment (at most 2 seconds) and what it shows.
  2. Repeat in a new context, resuming tab 1 5 seconds past the deadline it held: record whether its content was hidden
     in the resuming task and what it shows. Record whether that is the signed-out notice or the expiration modal.
  3. In a new context, sign in, open tabs 1 and 2 on `/`, and navigate tab 1 to `/login-unavailable`. Log out in tab
     2, then go back in tab 1. Record whether the page came from the back/forward cache (`pageshow` `persisted`), that
     no protected content was shown, and that the tab reaches the provider rather than the expiration modal.
- **M9, the store cannot answer (V-020).** Stop A and start a dedicated instance in its place, on the same port and
  callback origins, with `REDIS_URL` pointing at a Redis container this run owns on a free port, as the 162
  quickstart's store outage does. Sign in through it in one context with tabs 1 and 2 on the participant page, then
  `docker pause` that Redis.
  - Confirmation: in a tab whose page clock was installed before load, run the clock past its held deadline. Record
    that its content stays hidden while its status reads fail or go unanswered, with no expiration modal, signed-out
    notice, or restored content.
  - Resume: suspend and resume tab 2. Record that a failed or unanswered confirmation leaves its content hidden.
  - Logout: activate Log out in tab 1. Record the request's answer, and that the tab shows neither protected content
    nor the signed-out notice while the store cannot answer.
  - Unpause, and restart the instance if it does not reconnect (the 162 quickstart's Finding 2). Record whether the
    session still exists, and what tab 1 then shows. Remove the container.

Remove only owned keys afterwards, close every browser context, stop the instances, and remove any owned container.

### A1, public build assets

The assessment covers what F-1 proposal A designates public: the framework's content-hashed build output,
`/_next/static/**`. Protected information can reach that output only through values inlined at build time, files read
at build time, or output captured by prerendering. Text compiled from the repository's own source, such as the labels
of client components on protected pages, is public with the source and is not protected information.

1. Build the frontend at the revision. List every file under `packages/frontend/.next/static/`.
2. Search every file, as bytes, for:
   - each value in `fixtures/tenant-config/*.json` (display names, client IDs, issuer), the tenant aliases
     (case-insensitive), and the Keycloak host and realm path
   - the synthetic user's ID, email address, full name, and password from
     [`docker/keycloak/pre-ets-realm.json`](../docker/keycloak/pre-ets-realm.json)
   - the names of the server's environment settings (`REDIS_URL`, `OIDC_CLIENT_SECRETS_JSON`,
     `OIDC_CALLBACK_ORIGINS_JSON`, `TENANT_CONFIG_DIR`, `SESSION_KEY_PREFIX`, and the others the server reads),
     `process.env.`, and `NEXT_PUBLIC_`
   - server internals: `redis://`, `rediss://`, the session and transaction key prefixes, `client_secret`,
     `code_verifier`, `id_token`, `refresh_token`
   - the label "Reference session", which only the server-rendered entry page shows, and the checkout path
   - source maps and `sourceMappingURL` references
3. Against a running instance, request every listed file without a cookie, and request `/favicon.ico` and
   `/_next/image` as the browser does (`sec-fetch-dest: image`) and `/robots.txt`, `/manifest.webmanifest`, `/icon`,
   and `/sitemap.xml` as application requests.

## Implementation runs

Run by the implementation session at `9322cfe` on 2026-11-17, before the verification run. They are test runs, not a
verifier report.

### A1 at `9322cfe`

- 65 files under `/_next/static/`: 18 JavaScript chunks, 4 stylesheets, 31 SVG images, 11 fonts, and 1 JPEG image.
  No source map and no `sourceMappingURL` reference.
- No match for any tenant configuration value or alias, the synthetic user's ID, email address, or name, any
  environment setting name, `process.env.`, `NEXT_PUBLIC_`, any server internal, "Reference session", or the checkout
  path. `next.config.ts` sets no `env`, and no source file reads a `NEXT_PUBLIC_` setting, so the build inlines no
  environment value whatever the environment it runs in. The only page prerendered at build, `/_not-found`, is written
  under `.next/server/`, not `/_next/static/`.
- The synthetic user's password is a common four-letter word. It matches only a design-system class name and the
  public `/_test/onsite` prototype's labels, never as a credential.
- The client chunks hold the labels of protected pages' client components, such as the roster fixture's placeholder
  names "Participant A" to "Participant C" and "Record attendance note". They are compiled from the public source and
  are not records, identity, or tenant data.
- With no cookie, all 65 files answered 200 with `Cache-Control: public, max-age=31536000, immutable`. As image
  requests, `/favicon.ico` and `/_next/image` answered 401 with no redirect, and `/robots.txt`,
  `/manifest.webmanifest`, `/icon`, and `/sitemap.xml` answered 401 as application requests. A top-level navigation to
  `/favicon.ico` is a protected page navigation and answered 307 to `/auth/login`, as fresh entry does for every
  protected page.

**Result:** no protected information in the public build output at `9322cfe`.

### Requirements BDD at `9322cfe`

Production build of `9322cfe`, `OTEL_SDK_DISABLED=true`, Playwright 1.65.1 Chromium (headless).

- B1 to B5 in one run with `BDD_PARALLEL=4`: 33 scenarios and 602 steps passed.
- B6 with `BDD_PARALLEL=3`: 3 scenarios and 75 steps passed.

### Module tests at `9322cfe`

- T1: 7 test files, 156 tests passed.
- T2: 4 test files, 42 tests passed.

## Verification run

The verification session records its report on this page's pull request, under the IDs above, at that pull request's
verified revision. Its results are added here when it completes.

## Follow-up work

None is drafted yet. Each claim the verification run finds violated or not established gets a drafted follow-up issue
here, for a person to file.
