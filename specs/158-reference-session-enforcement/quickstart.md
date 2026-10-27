# Quickstart: Validate Reference Session Enforcement

This guide operationalizes [verification.md](verification.md) for the planned implementation. It does not record
executed evidence. Run commands from the repository root and retain results separately with the exact revision and
conditions.

## Claim and boundary map

| Claims                            | Smallest meaningful evidence                                                                           | Do not infer                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| V-001, V-003, V-005, V-006, V-010 | Public `SessionService.readForTenant` examples/property                                                | Next HTTP status, browser rendering, or real Redis topology |
| V-001, V-003, V-004, V-005, V-010 | Frontend-services request-adapter scenarios plus running page/Server Action HTTP                       | Comprehensive page/action coverage                          |
| V-002                             | Two independently running frontend processes with shared Redis and real confirmed-fresh authentication | Every deployment topology or freshness policy               |
| V-003, V-007                      | Mode-aware multi-tenant running HTTP matrix plus existing tenant/public-resource BDD                   | Production ingress behavior                                 |
| V-006                             | Controlled real-Redis outage after startup with a valid reference, followed by restoration/readiness   | #221's complete outage/recovery guarantees                  |
| V-007                             | Requirements BDD tagged to accepted current-main requirements                                          | Issue-only service-failure or handoff claims                |
| V-008                             | Keyboard/focus interaction with the composed reference consumer                                        | Accessibility of final #154/#157 experiences                |
| V-009                             | Delivered-route/fixture inventory review                                                               | Runtime behavior of inventoried paths                       |

Module evidence follows [contracts/modules.md](contracts/modules.md). Page/action semantics follow
[contracts/reference-application.md](contracts/reference-application.md). Feature claims remain owned by
[verification.md](verification.md).

## Prerequisites

- Node.js 26 or later and pnpm 12.15.0.
- Dependencies installed from the root lockfile.
- Docker Desktop/Engine available.
- A populated, gitignored root `.env` with distinct local-only `KC_BOOTSTRAP_ADMIN_PASSWORD` and
  `POSTGRES_PASSWORD`; Compose resolves both even when only Redis/Keycloak are selected.
- Chromium installed for the repository's Playwright 1.64.1 package.
- No production credentials, client data, PHI, or identifying partner names.
- Unique owned prefixes for every execution, for example
  `test:session:reference:<uuid>:` and `test:oidc:reference:<uuid>:`.
- Two distinguishable repository-owned synthetic tenants and the local synthetic provider user.
- For successful V-002 only: an approved, implemented B6 authentication-time comparison, clock tolerance, and
  provider-support policy. If unavailable, record V-002 incomplete and do not fabricate a session or treat signed
  `auth_time` presence as confirmation.
- For non-authentication session-dependent checks: an isolated issue-level fixture may establish a real stored session
  through public `SessionService.establish` under the execution-owned prefix. Its reference is confined to the owned
  browser/HTTP setup and it cannot count as Cucumber, provider-freshness, PREETS-SESSION-003, or V-002 evidence. If the
  fixture is unavailable, mark its dependent checks incomplete.

Record the starting revision:

```sh
git rev-parse HEAD
git status --short
node --version
pnpm --version
docker compose version
```

The checkout must be clean except for the implementation under assessment. Do not include raw environment values in
the retained record.

## 1. Static and module-contract checks

Run the focused service/request-adapter scenarios and the frontend presentation/wiring scenario:

```sh
pnpm --filter @pathableai/pre-ets-frontend-services test -- \
  tests/lib/session.test.ts \
  tests/unit/reference-session-enforcement.test.ts
pnpm --filter @pathableai/pre-ets-frontend test:unit -- \
  tests/unit/reference-session-enforcement.test.ts
```

Expected observations:

- a matching tenant returns the unchanged `UsableSession` identity, deadline, and warning policy;
- a different tenant returns only fieldless `SessionTenantMismatch`;
- absent/malformed/missing/expired state remains `NoUsableSession`;
- `SessionServiceUnavailable` remains distinguishable;
- the frontend-services request adapter resolves tenant first, preserves exact deadline/warning values, maps mismatch
  to forbidden, and exposes no protected outcome on any denied/failure path;
- raw Host is offered to mode-aware selection first, so static mode selects its configured alias even for an
  unresolvable Host; after a raw host-mode failure, `alias.localhost:3000` normalizes and retries `getAlias` with
  `alias.localhost`; invalid normalization or a failed retry remains host-mode 404;
- the frontend page redirects absence only after tenant success and passes the Server Action into the feature client;
- each Server Action invocation re-enforces rather than trusting rendered state.

These checks do not prove actual Next HTTP status, real Redis, provider behavior, or keyboard/focus behavior.

## 2. Real Redis adapter evidence

Start only the required external services and verify Redis readiness:

```sh
docker compose up -d --wait redis keycloak
docker compose exec redis redis-cli ping
```

Expected Redis output: `PONG`.

Run the existing real-adapter suite, including the planned tenant-bound independent-client case:

```sh
pnpm --filter @pathableai/pre-ets-frontend-services test:integration -- \
  tests/integration/session-redis.test.ts
```

Expected observations:

- independently scoped clients read identical session state;
- tenant-bound matching admission preserves that state;
- missing/expired state exposes no identity;
- a disconnected client yields `SessionServiceUnavailable`, not absence or admission;
- test cleanup deletes only validated owned prefixes.

This establishes adapter/session behavior, not independently running application instances.

## 3. Build and running application checks

Build once before any production-process evidence:

```sh
pnpm --filter @pathableai/pre-ets-frontend build
```

Run the issue-level workflow that owns bounded HTTP/action and two-process composition:

```sh
node --test tests/bdd/session/reference-session-enforcement.test.ts
```

The workflow must reuse `tests/support/oidc/harness.ts`, pass an explicit shared `sessionPrefix` and transaction prefix
to two independent production frontend processes, drive the rendered Server Action form through Playwright, and
release all owned processes/browser contexts in test cleanup. The issue-level fixture may call public
`SessionService.establish`; it must not write Redis directly.

Expected automated observations:

- a no-session reference page resolves the tenant and delegates to same-origin `/auth/login` before protected content;
- a forged/malformed reference obtains no protected content or action result;
- static mode with an unresolvable Host still selects the configured alias, while host-mode invalid/unknown hosts keep
  their approved 404 and selected-configuration failures keep their approved mode-specific 404/500;
- V-003 is a direct HTTP request whose `Host` is tenant B (a portful value such as `shelbyville.localhost:<port>` is
  valid because failed raw host-mode selection triggers a normalized-hostname retry) and whose `Cookie` header carries
  tenant A's `pathable-session` value. That request returns actual HTTP 403 with bounded forbidden content and no
  receipt. A browser navigation will not send that host-only cookie across the two hosts, so this observation is not a
  cross-host page navigation;
- a fixture-backed valid reference makes session-store failure distinct from redirect/403/success and emits no receipt;
- when B6 is approved and functioning, authentication through A is consumed through B with the same safe synthetic
  identity/tenant and the action emits exactly one receipt;
- when B6 is unavailable, the successful A-to-B case is explicitly skipped/incomplete. Fixture-backed denial and
  browser/action cases may still execute, but the fixture is never evidence for freshness, PREETS-SESSION-003, or
  V-002. A skip is not passing evidence for V-002.

Because Server Action identifiers are build-generated and `forbidden()` is experimental, evidence must invoke the
rendered form through the running application rather than calling an invented stable POST URL.

## 4. Requirements-backed BDD

Before authoring or changing scenarios, use the repository `requirements-bdd-author`/`requirements-bdd-scaffold`
workflow and current `origin/main` requirement text. The feature stays `@partial`; valid relevant tags are:

- `@preets-session-001`
- `@preets-session-003`
- `@preets-session-004`
- `@preets-session-005`
- `@preets-session-006`
- applicable current-main tenant tags for preserved tenant behavior.

Revise scenarios in the implementation pass. Do not edit them during planning, do not open Redis, and do not add a
pending authenticated scenario. Do not revise `tests/bdd/requirements/tenant-context.feature` or
`tests/bdd/requirements/onsite-prototype.feature`; their scenarios stay on `/auth/login` and `/_test/onsite`.

In `tests/bdd/requirements/tenant-oidc-initiation.feature`, replace only
`Scenario Outline: Root delegates before tenant-dependent work without protected content`. The current outline applies
invalid Springfield JSON to every example and expects login delegation. The replacement splits those outcomes:

- A valid Springfield tenant, including the fabricated-cookie document request at `springfield.example.test`, still
  redirects to same-origin `/auth/login`, contains no protected application content, is not cacheable, and issues no
  application or correlation cookie.
- Invalid JSON for the selected Springfield file returns 404, with no login redirect, no protected content, and no
  fallback tenant.
- The bare base host `example.test` returns 404, with no login redirect, no protected content, and no fallback tenant.

Keep these portful scenarios as login delegation for the document request at `springfield.localhost:3000`. Their
`/auth/login` steps stay as written. Host normalization is what makes that host resolvable; they must not become
tenant 404s:

- `Scenario: First-time browser entry delegates automatically to the selected real provider`
- `Scenario Outline: Unavailable preparation leaves access denied with public failure content`

In `tests/bdd/requirements/tenant-failures.feature`, replace the feature sentence "Root is a separate session-missing
redirect; complete session lookup, authenticated access and other tenant-dependent consumers remain incomplete." The
replacement says `/` resolves the tenant before session admission, and a document request that is itself a tenant
failure returns that failure's 404 or 500. Complete session lookup and other tenant-dependent consumers may remain
incomplete.

Change only the document request that is itself the tenant failure. Its new status is the status that row already
expects from `/auth/login`, with no login redirect and no fallback tenant:

| Scenario                                                                    | Document request to change                          | Document outcome                     |
| --------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------ |
| A host-mode alias with no tenant file is not found                          | `capital-city.example.test`                         | 404                                  |
| A static alias with no tenant file is a server failure                      | `springfield.example.test`                          | 500                                  |
| A host outside the tenant pattern is not found                              | `example.test`, `unknown.example.test`, `127.0.0.1` | 404                                  |
| Directory failures produce server failures in both interfaces               | `springfield.example.test`                          | 500                                  |
| Unusable selected files are ordinary missing tenants in both interfaces     | `springfield.example.test`                          | 404                                  |
| Missing selected files retain the mode-specific response in both interfaces | `springfield.example.test`                          | 404 in host mode, 500 in static mode |

Leave these as they are:

- the valid Springfield document request that delegates to login in "An absent path on a reachable tenant is not
  found", "A host-mode alias with no tenant file is not found", and "A host outside the tenant pattern is not found";
- the absent-path 404 for `/this-page-is-absent`;
- every `/auth/login` assertion;
- every `/_test/tenant-config` assertion.

Run discovery, lint/format, and execution:

```sh
pnpm test:bdd:dry
pnpm lint:gherkin
pnpm format:gherkin:check
pnpm test:bdd
pnpm test:bdd:checks
```

`test:bdd:dry` proves only discovery. Requirements BDD must not open Redis, fabricate session records, add pending
positive-authentication scenarios, or assert issue-only service-failure/handoff vocabulary. Until real confirmed-fresh
authentication exists, matching-session and A-to-B requirement claims remain outside passing Cucumber evidence.

## 5. Agent-executable manual feature verification

Perform this after the automated checks using the built revision and the same runner-neutral harness primitives. This
is a composed observation, not a duplicate service test.

### Setup

1. Confirm Redis and Keycloak are ready:

   ```sh
   docker compose exec redis redis-cli ping
   curl -sS -o /dev/null -w '%{http_code}\n' \
     http://127.0.0.1:8080/realms/pre-ets/.well-known/openid-configuration
   ```

   Expect `PONG` and `200`.
2. Generate unique owned session and transaction prefixes. Record the aliases, process ports, build revision, service
   image versions, and approved B6 policy reference without recording credentials or prefix values that expose data.
3. Use a temporary, uncommitted agent probe based on `freePort`, `spawnFrontend`, `applicationBrowser`,
   `waitUntilReady`, and `stopProcess` from `tests/support/oidc/harness.ts` to start instance A and B from the same
   production build. Both receive the same tenant fixtures, Redis URL, explicit `sessionPrefix`, transaction prefix,
   and (if needed by the installed build) shared `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`. Give them different loopback
   ports.
4. Ensure the browser proxy routes initial authentication to A and subsequent reference requests/action submission to
   B while preserving the same browser cookies.
5. When B6 does not permit real login, establish a tenant-A session through the isolated public-service fixture under
   the owned prefix and place its opaque reference only into an owned tenant-A browser/HTTP context. Record the safe
   synthetic identity plus exact deadline/warning values expected from `establish`, but never retain the reference.
   This setup does not satisfy V-002 or any authentication/freshness requirement.

Temporary probe code, screenshots containing sensitive values, and raw browser/network dumps must not be committed.

### Procedure and expected observations

1. In a fresh browser context, request tenant A's `/` through instance A and complete the real local-provider login
   only if the approved B6 policy confirms freshness. When it does, route the same browser session to tenant A's `/`
   through B and record V-002. Otherwise record the refusal/no-session outcome and mark V-002 incomplete; do not use the
   issue-level fixture to replace this step.
2. For V-001/V-008/V-010 and later denial/outage steps, use either that confirmed-fresh session or the explicitly
   labeled fixture-backed tenant-A context. Load tenant A's `/` through B and record that the safe synthetic user/tenant
   description plus the authoritative deadline and warning values exactly match the admitted session outcome.
3. On that already-rendered form, press `Tab` until the protected-operation button receives visible focus. Record the
   accessible button name and visible focus indication. Press `Enter` or `Space`; record the announced success result.
   Inspect browser/network state only far enough to establish that exactly one reference-effect receipt was emitted,
   without retaining its name/value. This establishes the distinct composed V-008 observation.
4. Observe V-003 with a direct HTTP request to instance B. Set `Host` to tenant B's host and `Cookie` to tenant A's
   `pathable-session` value from the same valid context. A portful Host such as
   `shelbyville.localhost:<B port>` is expected: raw host-mode selection fails, then the adapter normalizes and retries
   with the lowercase hostname. A browser navigation will not send that host-only cookie across the two hosts, so do
   not use cross-host navigation for this observation. Record actual HTTP 403, bounded forbidden indication, absence
   of tenant-A identity/content/result, and no new receipt. A tenant 404 is not the mismatch result.
5. Remove or invalidate only the scenario-owned session record, then submit the already-rendered reference operation.
   Record the perceivable no-session denial, no automatic OIDC, no protected result, and no receipt.
6. In a fresh browser context, request tenant A's `/` through B. Record absence of protected content and automatic
   same-origin OIDC initiation. Stop before a second login.
7. Without a session, request `GET /_test/tenant-config`. Record 200, private/no-store, safe configured content, no
   application/correlation/effect cookie, and no protected identity/result. Separately record host-mode invalid/unknown
   Host as 404, static mode with an unresolvable Host still selecting its configured alias, and selected
   malformed/unreadable configuration returning its approved mode-specific 404/500, all without fallback.
8. Only in an isolated local Compose environment owned by this execution, create or refresh a fixture-backed tenant-A
   session, preserve its valid reference cookie, and load the protected form through B before exercising the real-store
   failure:

   ```sh
   docker compose stop redis
   ```

   With that same valid reference cookie, request the page through B and submit the already-rendered form. Record a
   server failure distinct from login/403/success and zero new receipts. A cookie-free or malformed-reference request
   is not outage evidence because it returns `NoUsableSession` before Redis access. Restore Redis and wait for readiness
   before any later case:

   ```sh
   docker compose start redis
   docker compose exec redis redis-cli ping
   ```

   Skip this step rather than stopping a shared or pre-existing Redis service. If a valid fixture/confirmed-fresh
   session and retained form are unavailable, mark the page/action outage checks incomplete.

### Cleanup

- Close all browser contexts and the owned proxy.
- Stop both frontend process groups through `stopProcess`; do not leave listeners behind.
- Delete only keys under the validated execution-owned session/transaction prefixes. Never run `FLUSHALL` or flush a
  shared database.
- Remove the temporary agent probe and any raw output.
- If this procedure started Redis/Keycloak and no other work was using them, stop them with:

  ```sh
  docker compose stop keycloak redis
  ```

- Record cleanup completion and any skipped/incomplete cases.

## 6. Handoff inventory review

Compare the implementation diff with [reference-application.md](contracts/reference-application.md) and record a
disposition for every category:

| Category                      | Required disposition                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Delivered protected consumers | Root page and its one Server Action, paths and outcome mappings                                              |
| Delivered public consumers    | Callback, login/failure/recovery sample, and exercised `/_test` resources                                    |
| Reusable fixtures             | Real provider/browser harness, distributed Redis setup, two-process routing, action receipt observation      |
| Unexercised pages             | Explicitly listed for #154                                                                                   |
| Unexercised Route Handlers    | Explicitly listed for #154, excluding the public examples already exercised                                  |
| Unexercised Server Actions    | Explicitly listed for #154                                                                                   |
| Direct/new-resource paths     | Explicitly listed for #154/default-protection work                                                           |
| Deferred behavior             | Final forbidden/recovery, 401 action recovery, history/freshness, renewal/invalidation/races/outage recovery |

The inventory supports V-009 but is not evidence that listed resources work.

## 7. Repository quality gates

After behavior checks and before commit:

```sh
pnpm typecheck
pnpm build
pnpm lint
pnpm format:check
pnpm check:unused
pnpm check:health
pnpm check:changes
```

The pre-commit hook repeats `pnpm check:changes`; run it explicitly first so introduced findings are investigated before
commit. Do not add suppressions or weaken a check.

## Evidence record

Retain a separate bounded summary with:

- exact revision and date/time;
- Node/pnpm/application/service versions;
- safe synthetic tenant/user labels and process endpoints;
- approved freshness-policy reference or explicit B6 incompleteness;
- each claim ID, action, observed status/redirect/rendered outcome/effect count, and pass/fail/incomplete result;
- keyboard/focus observation;
- Redis outage/restoration readiness result when executed;
- cleanup result and limitations.

Never retain credentials, tokens, callback parameters, cookie values, session references, Redis keys/records, PHI,
protected content, raw logs, or identifying partner data. Passing static checks, dry-run discovery, skipped tests, PR
merge, or issue closure are not runtime verification.
