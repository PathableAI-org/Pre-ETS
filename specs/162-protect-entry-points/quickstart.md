# Quickstart: Validate Protected Entry Points and Tenant Authentication

This guide operationalizes [verification.md](verification.md) for the design in [plan.md](plan.md) and
[contracts/modules.md](contracts/modules.md). It records no executed evidence. Run commands from the repository root
and record results separately (the feature's later evidence record) with the exact revision, conditions, per-claim
result (pass / fail / incomplete), cleanup, and limitations.

## Claim and boundary map

Each claim is observed once at its responsible boundary. Module evidence (contracts) is cited, not repeated as
feature evidence.

| Claims                    | Feature evidence (this guide)                                                                                                                                                              | Supporting module evidence                             | Gate / limitation                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| V-001, V-012 (fabricated) | Cucumber HTTP: inventoried and undesignated entries with absent, malformed, and well-formed-unknown references                                                                             | Gate property and outcome matrix                       | Expired/invalidated real records and outage: manual (F-2)                        |
| V-002                     | §3 temporary undesignated page, handler, and action probe (never committed) + route-policy inspection                                                                                      | Matcher test; designation property                     | One revision only                                                                |
| V-003, V-017              | Cucumber: public reachability, diagnostic issues no cookie, no-store, lookup keys only                                                                                                     | Public requests read no session (gate examples)        | Production ingress and diagnostic safety need their own evidence                 |
| V-004                     | Manual §6 step 4 asset assessment                                                                                                                                                          | —                                                      | **Open until F-1 decides the asset classes**                                     |
| V-005                     | Existing initiation BDD (root → login → selected provider, `max_age=0`) plus the new feature's `/` entry rows                                                                              | —                                                      | Local Keycloak only                                                              |
| V-006 (non-success)       | Existing callback BDD (crafted, replayed, cross-tenant, expired, denied returns) re-run under the gate                                                                                     | Callback adapter scenarios                             | Confirmed-vs-unconfirmed distinction gated on #158                               |
| V-007, V-008              | Increment-5 Cucumber + manual steps 9–10                                                                                                                                                   | Callback 303 scenarios; renewal examples               | **Gated on #158**                                                                |
| V-009, V-010              | Cucumber: application-request 403 needs a usable session → increment 5; manual step 6 with a prepared session now                                                                          | Gate mismatch examples; `protection-redis` integration | Running-app automated mismatch gated on #158 (F-2)                               |
| V-011                     | Cucumber: protected document and application requests on invalid hosts/configurations keep 404/500; `/login-unavailable` and a non-navigation `GET /auth/login` on an invalid host are 404 | Gate tenant-first examples                             | —                                                                                |
| V-013, V-016              | Cucumber: direct action POST with the browser's own action encoding and no usable session → 401, no reference-operation receipt, no login started; manual step 8 through the consumer      | Outcome matrix (application request never 307)         | Consumer path needs a session at page load (manual now, Cucumber in increment 5) |
| V-014, V-015              | Cucumber browser: fabricated reference refresh/new tab → provider; manual step 7; §5 guard probe                                                                                           | —                                                      | Joining and step 7b gated on #158                                                |
| V-018                     | Manual steps 5, 6, 8 (keyboard, visible focus, perceivable outcome)                                                                                                                        | —                                                      | Chromium only                                                                    |

## Prerequisites

- Node.js 26+, pnpm 12.18.0, dependencies installed from the root lockfile, Docker available.
- Gitignored root `.env` with local-only Compose values; no production credentials, PHI, client data, or identifying
  partner names.
- Chromium for Playwright 1.65.0: `pnpm exec playwright install chromium`.
- Redis and the tracked Keycloak realm running and ready:

  ```sh
  docker compose up -d --wait redis keycloak
  docker compose exec redis redis-cli ping            # PONG
  curl --fail http://127.0.0.1:8080/realms/pre-ets/.well-known/openid-configuration
  ```

- Unique owned prefixes per execution, for example `preets:verify:session:<uuid>:` and
  `preets:verify:oidc-tx:<uuid>:`. Never flush a shared store.
- Synthetic tenants `springfield` and `shelbyville` from `fixtures/tenant-config/` and the realm's synthetic user.
- **Prepared sessions (manual only, F-2)**: a transient, uncommitted script in the scratchpad that imports only the
  public `SessionService` from the built `frontend-services` sources and calls `establish` / `invalidate` under the
  owned `SESSION_KEY_PREFIX`. It prints nothing but a safe label; the reference is handed to the browser or HTTP client
  in memory and never retained. Prepared sessions are used only for denial and isolation steps.
- **Gated steps** (7b, 9, 10, and every increment-5 scenario): an approved, functioning B6 freshness confirmation from
  #158. Without it, record those steps **incomplete**. Never override `CallbackFreshness` or use a prepared session as a
  substitute.

Record the starting point:

```sh
git rev-parse HEAD && git status --short
node --version && pnpm --version && docker compose version
```

## 1. Module-contract evidence

```sh
pnpm --filter @pathableai/pre-ets-frontend-services test -- \
  tests/unit/protection.test.ts \
  tests/unit/authentication-entry.test.ts \
  tests/unit/authentication-entry-failures.test.ts \
  tests/unit/reference-session-enforcement.test.ts
pnpm --filter @pathableai/pre-ets-frontend-services test:integration -- tests/integration/protection-redis.test.ts
pnpm --filter @pathableai/pre-ets-frontend test:unit
```

Expected: the designation property finds no counterexample; outcome-matrix, tenant-first, renewal, and no-session-read
examples pass; the confirmed callback branch returns 303 `Location: /` with a session cookie while the default branch
issues none; real-Redis expired, invalidated, mismatched, and disconnected outcomes map to 307/401, 403, and 503;
non-navigation login requests on invalid tenants keep 404/500; the forbidden document is a host-rendered, titled 403 page
with a viewport meta, and matcher wiring passes. These do not establish Next routing, browser behavior, or provider login.

## 2. Build and running instances

```sh
pnpm --filter @pathableai/pre-ets-frontend build
```

Cucumber owns its processes (`tests/bdd/support/harness.ts`). For manual steps, start two production instances A and
B from the same build with identical synthetic settings and the owned prefixes, for example:

```sh
cd packages/frontend
env TENANT_CONFIG_DIR="$PWD/../../fixtures/tenant-config" TENANT_RESOLUTION=host BASE_HOSTNAME=localhost \
  OIDC_ALLOW_INSECURE_LOOPBACK=true \
  OIDC_CALLBACK_ORIGINS_JSON='{"springfield":"http://springfield.localhost:3000","shelbyville":"http://shelbyville.localhost:3000"}' \
  SESSION_KEY_PREFIX="$SESSION_PREFIX" OIDC_TX_KEY_PREFIX="$TX_PREFIX" OTEL_SDK_DISABLED=true \
  pnpm exec next start -p 3000      # instance A; repeat with -p 3001 for instance B
```

Wait for each process to answer a public request (`curl -H 'Host: springfield.localhost:3000'
http://127.0.0.1:3000/login-unavailable` → 200) before proceeding. Before startup completes protected requests answer
503 (expected, fail closed).

## 3. Temporary undesignated-resource probe (V-002, D7)

In a scratch worktree at the revision under assessment (never committed, removed afterwards):

1. Add `src/app/probe-page/page.tsx` (static marker text, no dynamic API), `src/app/probe-handler/route.ts` (static
   `GET` and a `POST` that sets a marker cookie), and a Server Action used by the probe page that sets a marker cookie.
   Add no designation and no session call.
2. Build and start one instance. Inspect the route inventory (`find src/app -name page.tsx -o -name route.ts`,
   `grep -rl '"use server"' src`) and the designation constant in `frontend-services/src/next/protection.ts`; record
   that no probe path is designated.
3. Without a session: `GET /probe-page` and `GET /probe-handler` with navigation metadata → 307 to `/auth/login` and
   no marker text; the same `GET`s with `cors`/`empty` metadata → 401;
   `POST /probe-handler` and the probe action `POST` → 401, no marker cookie.
4. With a prepared session for the request tenant: both `GET` responses pass and carry `Cache-Control: private,
   no-store` and no `s-maxage`/`public` directive. **If Next replaces the proxy header on static output, stop and return
   the contract to the plan (research D7).**
5. Delete the scratch worktree; confirm `git status` in the assessed checkout is unchanged.

## 4. Requirements-backed BDD

Before authoring, follow `requirements-bdd-author` / `requirements-bdd-scaffold` and read the cited requirements on
current `origin/main`. Steps never open Redis or session stores; fabricated references are cookie strings only.
Features stay `@partial`. Raw-HTTP requests state their Fetch Metadata explicitly, as a browser would: document
requests send `sec-fetch-mode: navigate` and `sec-fetch-dest: document` (the existing helper sends the latter);
application requests send the browser's non-navigation metadata (`sec-fetch-mode: cors`, `sec-fetch-dest: empty` for
RSC/prefetch/action fetches; `sec-fetch-mode: no-cors`, `sec-fetch-dest: image` for `/favicon.ico` and `/_next/image`);
metadata-less rows omit both. Flight headers are irrelevant because Next strips them before the proxy. Browser
scenarios that need automatic login use `*.localhost` hosts, which browsers treat as trustworthy and therefore send
Fetch Metadata to.

**Revisions** (implementation increment 2):

- `tenant-failures.feature`, "An absent path on a reachable tenant is not found", and the
  `invalid tenant navigation presents the ordinary missing page` step: move the ordinary-missing-page baseline from
  `/this-page-is-absent` to `/_test/this-page-is-absent` (public prefix, research D11). Invalid-tenant `/` must still
  render text equal to that baseline; if the gate's `tenantFailureResponse` body differs from Next's not-found text,
  fix the host presentation, not the comparison.
- `authentication-public-resources.feature`: update the description (comprehensive protection is now in scope; asset
  assessment remains incomplete pending F-1, recovery content pending #157); add `/_test/this-page-is-absent` → 404,
  no redirect, no cookie.
- `tenant-oidc-callback.feature`: no assertion changes; re-run under the gate.

**New feature** `tests/bdd/requirements/default-entry-protection.feature` (`@partial`, `@preets-session-001`; add
`@preets-session-004` only to automatic-login rows, `@preets-session-013` only to the fresh-entry row,
`@preets-session-007` only to the action row, and `@preets-tenant-004`/`@preets-tenant-005` only to tenant-failure
rows). Each assertion stays within the tagged promise. Private mechanics (the exact 307 versus 401 split, `no-store`,
and absence of cookies on general denials) are module evidence in
[contracts/modules.md](contracts/modules.md#contract-evidence--protection-gate), not product promises:

| Scenario                                                  | Requests (host-mode Springfield unless noted)                                                                                                                                                                                                                                                                                                                 | Assertions                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protected page entry delegates to the tenant provider     | `GET /` with navigation metadata; examples with no cookie, a malformed cookie, and a well-formed unknown 43-character reference                                                                                                                                                                                                                               | The response is a redirect; following its chain (`/auth/login` with navigation metadata) reaches the authorization endpoint of the provider configured for Springfield, with Springfield's client; no protected content (SESSION-001 AC1, SESSION-004 AC1)                                   |
| Non-navigation requests obtain no protected content       | `GET /` with RSC-fetch metadata (`cors`/`empty`); `GET /` with no Fetch Metadata; `GET /favicon.ico` and `GET /_next/image?url=%2Fx&w=16&q=75` with image metadata; `POST /` and `POST /an-undesignated-path`                                                                                                                                                 | No protected content (SESSION-001 AC1). No claim about login delegation: no requirement promises it for these requests                                                                                                                                                                       |
| A direct protected action request performs no effect      | `POST /` sending the browser's own action request (research D14): `next-action` = the real `runReferenceOperation` ID from the production build's server-reference manifest, `Origin` = request origin, action-fetch metadata, multipart field `0` = `[{"_tag":"Ready"},"$K1"]`; examples with no cookie and a well-formed unknown reference (missing record) | Status 401; no reference-operation receipt (`preets-ref-effect` absent); does not start login (no redirect, no correlation cookie); the response issues no `pathable-session` or `oidc-correlation` cookie (a step that checks only the cookies it names) (SESSION-001 AC1, SESSION-007 AC1) |
| Tenant failure wins over protection                       | `GET /` and `POST /` at `capital-city.example.test`; static mode with a missing selected file; `GET /login-unavailable` at an invalid host; non-navigation (`cors`/`empty`) `GET /auth/login` at an invalid host                                                                                                                                              | 404 (host) / 500 (static); no redirect (SESSION-001 AC2, TENANT-004, TENANT-005)                                                                                                                                                                                                             |
| A `/_test` route is available for a non-`GET` method      | `POST /_test/tenant-config` with no cookie and no form body                                                                                                                                                                                                                                                                                                   | Not denied by protection: status is not 401 and the response is not a redirect to login. The `GET`-only handler's 405 is acceptable evidence (SESSION-001 AC2)                                                                                                                               |
| Fresh entry without a valid session starts tenant sign-in | Chromium at `springfield.localhost:3000` with a fabricated well-formed reference cookie: open `/`, reload, open a new page in the same context                                                                                                                                                                                                                | Each arrives at the Springfield provider with no protected content first (SESSION-004 AC1); the authorization request carries `max_age=0` — bounded request-level evidence for SESSION-013's selected request only, not `auth_time` validation (#158)                                        |

Undesignated and near-miss paths (`/an-undesignated-path`, `/_testing`, `/auth/login/extra`) are not BDD rows: their
navigation outcome follows from plan decision D11 rather than a page promise, and the designation property and examples
cover them. The new-resource default is the §3 probe (V-002).

The "login is never started by a non-navigation" claim is module evidence (gate and login handler examples) and a
manual browser confirmation. No requirement promises it for RSC or subresource requests, so it is not a BDD assertion.
SESSION-007 AC1 does promise it for Server Actions, so the action row keeps it. The browser-level confirmation belongs to
the manual procedure: on `/login-unavailable` (whose `/` link is prefetched) and on `/` without a session, Chromium's
network log must show no `/auth/login` request other than one following a navigation, and the `oidc-correlation`
cookie must not change.

**Increment 5 (gated on #158; listed now, authored then)**: login through A recognized only through B; new page in the
same context joins without login; renewal through A observed on B and expiry enforced on B observed on A; captured
real tenant-A cookie presented to Shelbyville on `/` and the action → 403, forbidden page for the
document, no receipt; back/forward and reload after expiry restore nothing usable; confirmed versus unconfirmed
callback returns.

```sh
pnpm lint:gherkin && pnpm format:gherkin:check
pnpm test:bdd:dry          # discovery only, not evidence
pnpm test:bdd              # builds the frontend, then runs all requirements scenarios
```

Record the command, scenario counts, failures, and the browser cache condition. A dry run or a skipped scenario is
not evidence.

## 5. Transient history-guard probe (D8)

During increment 3, with a scratch build that adds a temporary protected page linking to `/` (never committed) and a
prepared session: soft-navigate between the two pages, invalidate the session, press Back → expect provider arrival
(record whether `router.refresh()` hard-navigated; if not, switch to `location.reload()` and repeat). Then navigate
cross-document to the public `/login-unavailable`, press Back → expect a `pageshow` reload and provider arrival.
Delete the scratch build afterwards.

## 6. Manual feature verification

Follow verification.md §Procedure; implementation-specific details:

1. Record revision, date/time, service versions, tenant aliases, instance ports, owned prefixes, and "B6 freshness
   policy: absent" (or its reference). Prepare the inventory: protected page `/`; protected action
   `runReferenceOperation`; protected route handlers: none; public resources per the designation constant (`/_test/**`
   for every method except Server Action candidates; `GET`/`HEAD` callback, login, sign-in error page); unmatched
   `/_next/static/**`.
2. Raw HTTP to A with `Host: springfield.localhost:3000`, no cookie, and navigation metadata for the `GET` (action
   fetch metadata, matching `Origin`, and the browser's multipart action encoding for the `POST`, research D14):
   `GET /`, `POST /` with the real action ID. Expect 307 / 401, no protected content, no receipt.
3. Fresh Chromium context: open `/` on Springfield. Expect the Springfield Keycloak page, no
   protected content first, no local credential form. Stop at the provider. Then open `/login-unavailable` in a fresh
   context and record from the network log that the prefetch of `/` and the `/favicon.ico` request received 401 and
   that no `/auth/login` request occurred.
4. No cookie: `GET /auth/callback`, `/login-unavailable`, `/auth/login`, `/_test/tenant-config`,
   `/_test/this-page-is-absent`, and `POST /_test/tenant-config` without a form body (expect not 401 and no login
   redirect; 405 from the `GET`-only handler is acceptable). With `Host: capital-city.localhost:3000`, a non-navigation
   (`sec-fetch-mode: cors`) `GET /auth/login` → 404, no cookie. Record reachability, that the diagnostic sets no cookie and no owned session key
   appears (inspect only the owned prefix count), no-store, lookup keys without secrets. Capture every asset URL
   Chromium loads for the public pages (build chunks, `/favicon.ico`, any metadata route or `/_next/image` URL); review each built asset under `packages/frontend/.next/static/` for tenant
   names, issuers, client IDs, subjects, secret values, or other protected information. **Record V-004 incomplete
   until F-1 fixes the asset classes to assess (build output, `/favicon.ico` and metadata routes, `/_next/image`).**
5. Submit a crafted callback without a matching attempt and a cancelled provider return. With keyboard only, reach the
   "Return to the application entry" link; record visible focus, the explanation, and no provider or storage details.
6. Prepare a Springfield session. Present its cookie with `Host: shelbyville.localhost:3000`: `GET /` → 403 with the
   rendered forbidden page titled `Access denied – Pre-ETS` (in Chromium: the keyboard reaches its link and the link
   shows a visible focus indicator; the document is unstyled by accepted limitation, research D4). Observe the document once against an
   instance started with `next start -H 127.0.0.1` and once without `-H`; both must give 403 with the forbidden page
   (#356); `POST /` with the action ID → 403, receipt
   count unchanged; route handler: none inventoried (the §3 probe handler, if run, → 403). Confirm the request tenant
   stayed Shelbyville (no Springfield content). Repeat once in static mode with an alias different from the session's.
7. Prepare a Springfield session, set its cookie in a browser context without viewing protected content, invalidate it
   through the preparer. Reload `/` and open `/` in a new page. Expect direct Springfield sign-in, never a
   session-expired page. 7b (**gated**): after real login, view `/`, expire or invalidate, use Back/Forward and reload;
   record that nothing usable is restored.
8. Prepare a Springfield session, load `/`, invalidate the session, activate "Record reference operation" by keyboard.
   Expect the denial announced in the status region, no provider redirect, receipt count unchanged.
9. (**Gated**) Log in through A with the realm user; send the browser only to B; record displayed subject and tenant.
   Open a new page; record joining without login.
10. (**Gated**) Navigate on A (renewal) and observe continued access on B; let the idle deadline pass and observe B
    deny, then A deny.
11. Cleanup: delete only owned session and transaction keys, close browser contexts, stop the instances and any owned
    container, delete scratch probes and the preparer, and record the cleanup result.

**Store outage (V-012; verification.md automated row, run manually per F-2)**, before step 11: only against a Redis
this execution owns (for example a second `redis:8.10.3` container on a free port used by a dedicated instance). With a
prepared session, `docker pause` it, request `/` and the action → 503, no login redirect, no new cookie;
`docker unpause` and confirm readiness. If no owned Redis is available, record the outage observation incomplete.

## Evidence to retain

Revision; environment and service versions; tenant aliases and the synthetic user label; instance ports; owned prefix
labels (not keys); B6 policy reference or absence; for each step the request summary, status, redirect destination,
rendered outcome, keyboard/focus observation, receipt count, and per-claim result; asset assessment summary; probe
outcomes and their removal; cleanup; limitations. Never retain cookie values, references, tokens, callback parameters,
credentials, or store contents.

## Limitations

- V-007, V-008, joining in V-014, step 7b of V-015, the V-006 confirmed/unconfirmed distinction, and real-login
  SESSION-005 AC1 remain incomplete until #158's freshness confirmation functions.
- V-004 and the final public-asset designation remain open until F-1 is decided.
- Running-application observations that need a usable or real expired session are manual before #158 (F-2).
- Recovery content, Server Action HTTP 401 recovery, and the running-tab modal are #157's; SESSION-004 AC2 composition
  stays incomplete.
- Renewal is exercised only for deliberate navigation and protected action submission; complete qualifying-activity
  coverage is #155's.
- Local Keycloak and Chromium only; Microsoft and broker-chain compatibility, production ingress blocking of `/_test`,
  and diagnostic configuration safety are not established.
- No step in this guide was executed during planning.
