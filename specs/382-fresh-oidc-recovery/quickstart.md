# Quickstart: Validate Fresh Tenant OIDC Recovery

This guide operationalizes [verification.md](verification.md) for the design in [plan.md](plan.md),
[contracts/modules.md](contracts/modules.md), and [contracts/telemetry.md](contracts/telemetry.md). It records no
executed evidence yet. Run commands from the repository root. Record each slice's results under
[Execution results](#execution-results) with the revision, conditions, result per claim, cleanup, and limitations.

## Claim and boundary map

Each claim is observed once at its responsible boundary. Module evidence is cited, not repeated as feature evidence.

| Claims       | Feature evidence (this guide)                                                                                                                                              | Supporting module evidence                                 | Slice          | Gate / limitation                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| V-001        | Existing initiation BDD (`max_age=0` per tenant) re-run; §3 checks the request in each journey                                                                             | —                                                          | S1             | —                                                                                          |
| V-002        | §4 steps 2–3: provider step with SSO held, T-001 `confirmed`/`inside`                                                                                                      | Window property                                            | S2             | Local Keycloak only                                                                        |
| V-003        | §2 updated callback BDD: real return establishes a session and the next `/` is admitted; §4 step 4 tenant check                                                            | —                                                          | S1             | —                                                                                          |
| V-004        | —                                                                                                                                                                          | `authentication-freshness.test.ts` examples and property   | S1             | Module boundary only, by design                                                            |
| V-005, V-006 | §4 step 7 if the D9 stale client exists (stale only)                                                                                                                       | Missing and stale examples: consumption, replay, new login | S1             | Missing: module only. Stale at the app boundary: only if D9 succeeds (approved limitation) |
| V-007        | §3 BDD: decline at Keycloak's grant page (`consent-web` client) and a controlled provider error → no session, next `/` starts login                                        | Existing denial examples                                   | S2             | The controlled error is not cancellation evidence                                          |
| V-008        | §4 step 8 inspection that no tenant field reaches freshness                                                                                                                | Tenant-independence property                               | S1             | No real ignoring provider exercised                                                        |
| V-009        | §3 check that the authorization request names no mechanism                                                                                                                 | `amr`/`acr` property                                       | S1             | —                                                                                          |
| V-010, V-011 | §3 BDD: after logout removes the record, new tab, refresh, back, and forward (logout in another page) with SSO → provider step and a new session; §4 step 5 natural expiry | —                                                          | S2             | Natural expiry manual only (research D10)                                                  |
| V-012        | §3 BDD: replay the old reference after the new login → login redirect, no protected content; §4 step 6 T-001 absent, `SessionService.read` not `renewed`                   | Existing no-revival suites                                 | S2             | —                                                                                          |
| V-013        | §3 BDD browser, back-forward cache enabled: back/forward after removal neither serves nor restores a protected page                                                        | —                                                          | S2             | Pre-script paint (B5)                                                                      |
| V-014        | §3 BDD: keyboard Log in from the signed-out notice; §5 from #157's recovery content and modal                                                                              | —                                                          | S2, S3         | #157 entry points: S3 only                                                                 |
| V-015        | §3 BDD: second tab with a valid session issues no provider request; §4 step 4 same `session.id`                                                                            | —                                                          | S2             | —                                                                                          |
| V-016        | §2 BDD page assertion for a denied callback; §4 step 7 page                                                                                                                | Adapter mapping example                                    | S1             | —                                                                                          |
| V-017        | §4 step 8 Grafana inspection of T-001/T-002 for missing, stale, and provider-unavailable logins                                                                            | —                                                          | S1 (run in S2) | Real missing case unavailable; real stale only with D9 (approved limitation)               |

## Prerequisites

- Node.js 26+, pnpm 12.18.0, dependencies installed from the root lockfile, Docker available.
- Gitignored root `.env` with local-only Compose values; no production credentials or client data.
- Chromium for Playwright: `pnpm exec playwright install chromium`.
- Redis, the tracked Keycloak realm, and the local observability stack running:

  ```sh
  docker compose up -d --wait redis keycloak
  docker compose exec redis redis-cli ping
  curl --fail http://127.0.0.1:8080/realms/pre-ets/.well-known/openid-configuration
  ```

- For verifier runs: the harness environment from
  [Verification harness](../../docs/engineering/verification-harness.md#environment): `OTEL_SERVICE_VERSION=<sha>`,
  `OTEL_RESOURCE_ATTRIBUTES` with `service.version=<sha>,service.instance.id=<run-uuid>`, a
  `preets:verify:<run-uuid>:` Redis prefix, and owned ports.

## 1. Module evidence (S1)

```sh
pnpm --filter @pathableai/pre-ets-frontend-services test
pnpm --filter @pathableai/pre-ets-frontend-services test:integration
```

Expected: the freshness examples and properties in `tests/lib/authentication-freshness.test.ts` pass; the
`authentication.test.ts` row for a missing `auth_time` now expects `AuthenticationNotFresh`/`missing`; the callback
adapter examples map both freshness categories to the safe return with no session cookie.

## 2. Callback BDD with real establishment (S1)

```sh
pnpm test:bdd
```

Expected for `tenant-oidc-callback.feature` and `default-entry-protection.feature` after their S1 revision: a real
Keycloak return across two instances establishes a host-only `pathable-session`, answers 303 to `/`, and the next
document request to `/` is admitted for the same tenant. The wrong-state, cross-tenant, race, replay, and expired
recovery scenarios keep their denials. Initiation scenarios still assert `max_age=0`.

## 3. Fresh-recovery BDD (S2)

```sh
pnpm test:bdd
```

The S2 feature (`tests/bdd/requirements/fresh-oidc-recovery.feature`, `@partial`) runs each journey in one browser
context that first signs in at Keycloak directly, so a provider SSO session exists:

- First visit to a protected page: the Keycloak login form appears despite SSO; after sign-in the page is admitted.
- Valid session: a second page in the context loads `/` with no request to the provider.
- After Log out (record removed): a new tab, a refresh, a back entry, and a forward entry (after Log out in another
  page) each show no protected content, reach the Keycloak form, and after sign-in carry a session cookie different
  from the old one. The browser keeps Chromium's back-forward cache, which Playwright turns off by default, and a
  `pageshow` with `persisted` on a protected page counts as protected content shown.
- Old reference replayed after the new login: redirected to login, no protected content.
- Cancel at Keycloak: sign in on the `consent-web` client's tenant and decline its grant page, which returns a real
  `error=access_denied`. A controlled `error=access_denied` return covers a provider error, not cancellation. Either way: no
  session; `/` starts login again.
- Signed-out notice: Log in activated by keyboard leads to the Keycloak form and a new session.

## 4. Manual feature procedure (S2; steps 7–8 for S1 facts)

Run the [verification.md procedure](verification.md#procedure) with these implementation details:

1. Start the app at the revision with the harness settings. Record the revision and run UUID.
2. In Playwright, sign in at `http://127.0.0.1:8080/realms/pre-ets/account` as the tracked user, so an SSO session exists.
3. Open `http://springfield.localhost:3000/`. Observe the Keycloak form and complete it. Query T-001 for that trace:
   expect `confirmed`, `inside`, then `SessionService.establish` `established` with a `session.id`.
4. Load `/` again (admitted, same `session.id` on `SessionService.read`). Open Shelbyville: its own login starts.
5. Natural expiry: use a scratch Springfield tenant with `idleTimeoutMinutes: 5`, wait past the deadline, then new
   tab, refresh, and back/forward. Expect the provider form each time and a new `session.id`.
6. Replay the old reference with `curl -H 'Cookie: pathable-session=<old>'` from the owned context's cookie jar.
   Do not record the value. Expect a login redirect, `SessionService.read` `missing` or `expired`, and no `renewed`.
7. Stale denial through the D9 client and tenant, if committed: expect the safe "Authentication return" page, no
   `pathable-session`, and `/` starts a new login.
8. In Grafana: T-001 and T-002 for steps 3 and 7, plus one login with Keycloak stopped (`docker compose stop
   keycloak` after the redirect, then `start`). Expect `not_fresh_stale` with the log for step 7, and `unavailable`
   without the log. Inspect every exported attribute and log field for tokens, codes, state, nonce, PKCE, subjects,
   raw `auth_time`, and session references. Inspect `src/authentication.ts` and the tenant schema to confirm no
   tenant field reaches the freshness comparison (V-008).
9. From the signed-out notice, activate Log in by keyboard and repeat step 3's observations.
10. Cleanup: close the context, end the Keycloak session, delete `preets:verify:<run-uuid>:*` keys, stop processes,
    and delete the scratch tenant.

## 5. Explicit recovery through #157 (S3)

Once #157's recovery content and expiration modal exist at the revision: from each, activate Log in by keyboard with
SSO held and repeat §4 step 3's observations. Add the scenario to the S2 feature and drop its feature-level
`@partial` only if every claim is then covered.

## Execution results

No results recorded yet. Each slice records: revision, run UUID, environment, result per claim
(`established` / `violated` / `not established` / `blocked`), cleanup, and limitations. Superseded results stay,
marked stale.
