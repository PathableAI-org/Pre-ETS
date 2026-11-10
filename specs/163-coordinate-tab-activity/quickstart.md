# Quickstart: Validate Cross-Tab Activity and Logout Coordination

**Plan**: [plan.md](plan.md) | **Verification plan**: [verification.md](verification.md) |
**Contracts**: [contracts/modules.md](contracts/modules.md)

This guide turns [verification.md](verification.md) into an implementation-aware execution procedure. It does not
add or change claims. No step here has been executed; results are recorded later under "Execution results".

## Claim and boundary map

Each V-claim is observed once, at its responsible boundary. Module evidence (§1) supports the claims but is not
reported as feature evidence.

| Claim | Feature boundary                                                                | Section      | Gated on #158 |
| ----- | ------------------------------------------------------------------------------- | ------------ | ------------- |
| V-001 | Multi-tab browser, one context, status reads from each tab                      | §4, §5 3     | Yes           |
| V-002 | Multi-tab browser: new tab joins, then activity and logout                      | §4, §5 7     | Yes           |
| V-003 | Multi-tab browser across a real 5-minute deadline                               | §4, §5 4     | Yes           |
| V-004 | Browser with context clock: renewal → other tab within 2 s                      | §4           | Yes           |
| V-005 | Running app HTTP (prepared record) **and** browser automatic traffic            | §3, §4       | HTTP part: no |
| V-006 | Browser: each qualifying kind alone on the fixtures                             | §4, §5 4     | Yes           |
| V-007 | Browser: pointer movement and programmatic focus only                           | §4, §5 5     | Yes           |
| V-008 | Browser with context clock: window opening, coalescing, near deadline, two tabs | §4, §5 4     | Yes           |
| V-009 | Running app HTTP (prepared record) **and** browser late activity                | §3, §4, §5 9 | HTTP part: no |
| V-010 | Browser keyboard logout; protected requests from every tab                      | §4, §5 7     | Yes           |
| V-011 | Browser accessibility tree and focus after logout, 2 s bound                    | §4, §5 7     | Yes           |
| V-012 | Two tenants in one context, second context, re-login                            | §4, §5 8, 9  | Yes           |
| V-013 | Browser lifecycle: hidden/visible across renewal                                | §4, §5 6     | Yes           |
| V-014 | Browser lifecycle across logout; back/forward after logout                      | §4, §5 10    | Yes           |
| V-015 | Running app with the store stopped during status, resume, logout                | §4           | Yes (browser) |
| V-016 | Inspection of tab-visible outcomes, channel messages, other contexts            | §4, §5 7–8   | Yes           |
| V-017 | Browser: signed-out notice and Log in in every tab; no automatic sign-in        | §4, §5 7     | Yes           |

## Prerequisites

- Node.js 26+, pnpm 12.18.0, dependencies installed from the root lockfile, Docker available.
- Gitignored root `.env` with local-only Compose values; no production credentials, PHI, client data, or identifying
  partner names.
- Chromium for Playwright 1.65.0: `pnpm exec playwright install chromium`.
- Redis and the tracked Keycloak realm running and ready:

  ```sh
  docker compose up -d --wait redis keycloak
  docker compose exec redis redis-cli ping
  curl --fail http://127.0.0.1:8080/realms/pre-ets/.well-known/openid-configuration
  ```

- Unique owned prefixes per execution, for example `preets:verify:session:<uuid>:` and
  `preets:verify:oidc-tx:<uuid>:`. Never flush a shared store.
- Synthetic tenants `springfield` and `shelbyville` from `fixtures/tenant-config/`; for deadline-crossing steps, a
  synthetic tenant variant with `"idleTimeoutMinutes": 5` in a scratch copy of the tenant directory (not committed).
- **Gated steps**: an approved, functioning B6 freshness confirmation from #158. Without it, record every gated row
  **incomplete**. Never override `CallbackFreshness` or substitute a prepared session for login.
- **Prepared records (ungated HTTP steps only)**: a transient, uncommitted scratchpad script that imports only the
  public `SessionService` from the built `frontend-services` sources and calls `establish` / `invalidate` under the
  owned prefix, as S1 did. It prints a safe label only; the reference is handed to the HTTP client in memory.

Record the starting point:

```sh
git rev-parse HEAD && git status --short
node --version && pnpm --version && docker compose version
```

## 1. Module-contract evidence

```sh
pnpm --filter @pathableai/pre-ets-frontend-services test -- tests/unit/coordination.test.ts
pnpm --filter @pathableai/pre-ets-frontend-services test:integration -- tests/integration/coordination-redis.test.ts
pnpm --filter @pathableai/pre-ets-frontend test:unit -- tests/unit/session-coordination.test.ts
```

Expected: the tag-mismatch property finds no store write for a mismatched tag; same-origin and content-type examples
reject before any service call; the activity handler returns the stored renewed deadline; activity after invalidation
or expiry answers 401 with no record; logout answers 204 only after removal, 503 during an outage, and never sets a cookie; status never moves the stored deadline; the B5-W window property and the D4
classification table pass. These do not establish browser timing, cross-tab delivery, or real-session behavior.

## 2. Build and running instances

```sh
pnpm --filter @pathableai/pre-ets-frontend build
```

Cucumber owns its processes. For manual steps start instance A as in S1's quickstart §2 (host mode, `*.localhost`
callback origins, owned prefixes, `OTEL_SDK_DISABLED=true`), with `TENANT_CONFIG_DIR` pointing at the scratch copy when
the 5-minute tenant is needed. Wait for `/login-unavailable` to answer 200 before proceeding.

## 3. Ungated HTTP evidence (V-005 HTTP part, V-009 denial part)

With a prepared record for `springfield` and the reference as the `pathable-session` cookie:

1. Read the deadline with `GET /session/status` (`sec-fetch-mode: cors`, `sec-fetch-site: same-origin`).
2. `GET /` with `sec-fetch-mode: navigate`, `sec-fetch-dest: document`; read status again — the deadline moved.
3. `GET /` with `sec-fetch-mode: cors`, `sec-fetch-dest: empty` (RSC/prefetch shape), and `GET /favicon.ico` with
   `sec-fetch-mode: no-cors`; read status after each — unchanged.
4. `POST /session/activity` with a valid kind and the tag from step 1 — deadline moved; repeat with a wrong tag — 409
   and unchanged.
5. Invalidate the record through the prepared-record script; `POST /session/activity` and `GET /` (navigation) — 401
   and 307 to `/auth/login`; status 401.
6. Remove the owned keys.

These rows also run as requirements-backed BDD (§4) with the same Fetch Metadata. They do not establish browser-side
classification or multi-tab behavior.

## 4. Requirements-backed BDD and browser evidence

Before authoring, follow `requirements-bdd-author` / `requirements-bdd-scaffold` and read PREETS-SESSION-009 and
PREETS-SESSION-010 on current `origin/main`. New feature file `tests/bdd/requirements/session-tab-coordination.feature`
is tagged `@partial` at feature level (SESSION-010 AC4 and the AC6 warning, continuation, and expiration conditions
remain with #156/#157). Scenarios carry `@preets-session-009` or `@preets-session-010` and assert only what those
criteria promise. Steps never open Redis; the authoritative deadline is read through `GET /session/status` from
`context.request` (research D12). Browser time uses `context.clock`; tabs are pages in one context; independent
contexts and tenants use separate `BrowserContext`s and `*.localhost` hosts.

Only the ungated no-session scenarios are committed before #158 (increments 3–4). BDD steps cannot create a usable
session before #158 and may not open session stores, so positive renewal is evidenced only by §3's prepared-record
procedure and the integration suites until then. The nightly run discovers every
requirements feature, and `@partial` neither skips scenarios nor permits pending steps, so the gated scenarios below
stay planned here and are added to the feature file in increment 5.

| Scenario (tag)                                                                                                                                                                                                        | Claims              | Gate |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---- |
| Deliberate navigation renews; prefetch-shaped and subresource requests do not (009)                                                                                                                                   | V-005               | #158 |
| Activity and logout requests without a usable session are denied with 401 and never start login (009, 010)                                                                                                            | V-009 (HTTP), V-010 | none |
| Activity after logout or expiry leaves access unavailable (009)                                                                                                                                                       | V-009               | #158 |
| Two tabs share one session and deadline; a new tab joins without login (010)                                                                                                                                          | V-001, V-002        | #158 |
| Typing in one tab keeps the other tab usable past its former deadline (010)                                                                                                                                           | V-003               | #158 |
| Each qualifying kind renews; pointer movement and programmatic focus do not (009)                                                                                                                                     | V-006, V-007        | #158 |
| First interaction sends at once; repeats coalesce into one send; near-deadline sends at once, across tabs (009)                                                                                                       | V-008               | #158 |
| Keyboard logout in one tab conceals and denies in every tab (010)                                                                                                                                                     | V-010, V-011        | #158 |
| Every tab shows the signed-out notice; sign-in starts only from Log in (010)                                                                                                                                          | V-017               | #158 |
| Activity and logout leave another tenant, another context, and a later session unchanged (010)                                                                                                                        | V-012, V-016        | #158 |
| A stale tab's queued activity and form submission after logout and re-login do not renew or affect the new session (010)                                                                                              | V-012               | #158 |
| A logout response delayed until another tab completes a new login leaves the new session usable (010)                                                                                                                 | V-012               | #158 |
| A logout whose tab closes before the response still conceals every other tab within 2 seconds (010)                                                                                                                   | V-011               | #158 |
| An activity or document-entry response for an earlier session delayed past a new login leaves the new session's cookie and access intact (010)                                                                        | V-012               | #158 |
| A stale document parsed after a new login does not end tabs of the new session (010)                                                                                                                                  | V-003, V-012        | #158 |
| A stale document parsed after a new login cannot renew or act on the new session by submitting a form (010)                                                                                                           | V-012               | #158 |
| A logout the server completed whose response was lost still conceals every sharing tab within 2 seconds (010)                                                                                                         | V-011               | #158 |
| A logout whose response fails after the delete applied (503) still conceals every sharing tab (010)                                                                                                                   | V-011               | #158 |
| A keepalive logout delayed past its `notAfter` is refused and leaves the session and tabs usable (010)                                                                                                                | V-011, V-015        | #158 |
| Two overlapping logout attempts where the first fails and the second's initiator closes still conceal every tab (010)                                                                                                 | V-011               | #158 |
| A logout admitted before its cutoff but delayed past it before deleting leaves the session and tabs usable (010)                                                                                                      | V-011, V-015        | #158 |
| Two logout attempts started concurrently in different tabs are both replayed by a tab that mounts afterwards (010)                                                                                                    | V-011               | #158 |
| With the application clock ahead of Redis, a usable status read just after application-time `notAfter` does not end the watch before a pending delete can commit (010)                                                | V-011               | #158 |
| Storage unavailable: a communication received before another tab's flush covers its earlier pending activity, so no extra renewal is sent (009)                                                                       | V-008               | #158 |
| A tab that opens or resumes during an interrupted logout conceals once the session ends (010)                                                                                                                         | V-011               | #158 |
| A tab opened before logout but hydrated after it conceals content when its coordinator mounts, and its protected requests are denied throughout (010); exposure before mount is gap G1, recorded rather than asserted | V-010, V-011, V-017 | #158 |

Non-BDD Playwright browser evidence (retained under `tests/bdd/support` helpers, run by the same harness) covers the
timing bounds and lifecycle cases that Gherkin would obscure: V-004 (in a running tab, read the held deadline and
warning lead that the coordinator's header exposes as non-protected attributes, `data-session-deadline` and
`data-session-warning-lead`, and assert they match the renewal response within 2 seconds; repeated after changing the
tenant's effective policy while the session is valid, for a document-entry renewal (measured from the coordinator mount, not the response,
because of gap G2; with delayed bundles the elapsed time is recorded, not asserted), and for a refresh that shortens the timeout, where the running tab must adopt the higher revision
with the earlier deadline; and with a server-rendered snapshot whose page is delayed 20 seconds before mount, where
both tabs must hold the same local deadline within the round-trip uncertainty; resume behavior is evidenced
separately under V-013), V-013 and V-014 (a
synthetic `visibilitychange` dispatched by `page.evaluate` is **not** acceptable; change visibility by bringing another
page to the front with `page.bringToFront()`, freeze and resume with the CDP `Page.setWebLifecycleState` command, and
exercise the back/forward cache with a navigation and `page.goBack()`; confirm the exact mechanisms against Playwright
1.65.0 at implementation start), and V-015 (stop
Redis during status, resume, and logout, then restore it and confirm readiness).

Commands:

```sh
pnpm test:bdd:dry
pnpm test:bdd -- --tags "@preets-session-009 or @preets-session-010"
```

A dry run establishes discovery only.

## 5. Manual feature verification

Execute [verification.md](verification.md#procedure) steps 1–11 against instance A with these implementation details:

- Step 2 is §3 above.
- Steps 3–10 need a real login (gated). Use pages `/coordination/roster` (tab 1) and `/coordination/participant`
  (tab 2); typing uses the participant text input; programmatic focus uses the "focus later" control; the protected
  operation is the roster Server Action form.
- Read the deadline through `GET /session/status` in a separate request from the same context; optionally cross-check
  with a transient script printing only the owned record's deadline.
- Step 7: Log out is the header button; record keyboard focus visibility, the time from the logout response to the
  other tabs' signed-out notice, the accessibility tree (no protected text, a signed-out heading, a Log in link), and
  denial of the roster action from every tab.
- Step 10: navigate away, log out from another tab, use Back; record that the restored page shows no protected content
  and that the reload reaches tenant sign-in.
- Step 11: remove owned keys only; close contexts; stop processes started here.

## Evidence to retain

Revision, environment, tenant aliases, idle timeout, B5/B6 decision references, browser and Playwright versions,
measured renewal and concealment times with the clock conditions, accessibility-tree summaries, focus observations,
deadline comparisons, cleanup result, per-claim disposition (pass/fail/incomplete), and limitations. Never cookie
values, tags, references, tokens, or store contents.

## Limitations

- Every gated row is **incomplete** until #158's freshness confirmation functions.
- Coalesced sends whose only running tabs are hidden can be delayed by browser timer throttling (research D5).
- **Acknowledged gap G1 — logout while a tab is loading** (spec Acknowledged limitations; maintainer decision
  2026-11-10): a tab that loads while another tab logs out can show protected
  content until its coordinator mounts and replays the ended record; the server denies its requests throughout
  (research D14).
- **Acknowledged gap G2 — renewal by page load** (spec Acknowledged limitations; maintainer decision 2026-11-10): a document-entry renewal reaches other tabs only after the new
  document hydrates, so the 2-second synchronization bound may be missed on slow devices (research D6).
- Pre-script paint on visibility resume is outside application control; bfcache restoration is concealed at `pagehide`
  (research D9).
- With `localStorage` or Web Locks unavailable, two interactions in different tabs within channel latency can each
  send once (research D5); the window is otherwise kept.
- Snapshot ordering uses the stored record's revision; `observedAt` (Redis `TIME`) is diagnostic only (research D6).
- The session cookie no longer has `Max-Age`; it lasts for the browser session and may outlive its record, which then
  grants nothing (research D15).
- Server time is real; deadline-crossing journeys take at least 5 minutes each (research D12).
- Expired-state presentation, warnings, Continue, provider logout, and server-unreachable behavior are not evidenced
  here.
- Microsoft compatibility remains unexecuted.

## Execution results

The §3 prepared-record HTTP procedure and the V-015 server rows predate the contract changes R12–R32 (session
cookie, record revision, action renewal, logout cutoff and classification). Any result recorded for them before those
changes is stale and must be re-run on the implementation revision under assessment.

Not executed. Implementation records results here per increment, with conditions and limitations.
