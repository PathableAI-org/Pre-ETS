# Quickstart: Validate Reference Session Enforcement

This guide operationalizes [verification.md](verification.md) for the planned implementation. It does not record
executed evidence. Run commands from the repository root and retain results separately with the exact revision and
conditions.

## Claim and boundary map

| Claims                     | Smallest meaningful evidence                                                                           | Do not infer                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| V-001, V-003, V-005, V-006 | Public `SessionService.readForTenant` examples/property                                                | Next HTTP status, browser rendering, or real Redis topology |
| V-001, V-003, V-004, V-005 | Reference page/action adapter scenarios and running application HTTP                                   | Comprehensive page/action coverage                          |
| V-002                      | Two independently running frontend processes with shared Redis and real confirmed-fresh authentication | Every deployment topology or freshness policy               |
| V-003, V-007               | Multi-tenant running HTTP matrix plus existing tenant/public-resource BDD                              | Production ingress behavior                                 |
| V-006                      | Controlled real-Redis outage after startup, followed by restoration/readiness                          | #221's complete outage/recovery guarantees                  |
| V-007                      | Requirements BDD tagged to accepted current-main requirements                                          | Issue-only service-failure or handoff claims                |
| V-008                      | Keyboard/focus interaction with the composed reference consumer                                        | Accessibility of final #154/#157 experiences                |
| V-009                      | Delivered-route/fixture inventory review                                                               | Runtime behavior of inventoried paths                       |

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

Run the focused service and framework scenarios first:

```sh
pnpm --filter @pathableai/pre-ets-frontend test:unit -- \
  tests/lib/session.test.ts \
  tests/unit/reference-session-enforcement.test.ts
```

Expected observations:

- a matching tenant returns the unchanged `UsableSession` identity, deadline, and warning policy;
- a different tenant returns only fieldless `SessionTenantMismatch`;
- absent/malformed/missing/expired state remains `NoUsableSession`;
- `SessionServiceUnavailable` remains distinguishable;
- the page resolves tenant first, redirects absence only after tenant success, maps mismatch to forbidden, and does not
  perform the action effect on any denied/failure path;
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
pnpm --filter @pathableai/pre-ets-frontend test:integration -- \
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

The workflow must reuse `tests/support/oidc/harness.ts`, start two independent production frontend processes against
the same owned Redis prefixes and tenant fixtures, drive the rendered form through Playwright, and release all owned
processes/browser contexts in test cleanup.

Expected automated observations:

- a no-session reference page resolves the tenant and delegates to same-origin `/auth/login` before protected content;
- a forged/malformed reference obtains no protected content or action result;
- a tenant-A session presented to tenant B returns actual HTTP 403 with bounded forbidden content and no receipt;
- session-store failure is distinct from redirect/403/success and emits no receipt;
- when B6 is approved and functioning, authentication through A is consumed through B with the same safe synthetic
  identity/tenant and the action emits exactly one receipt;
- when B6 is unavailable, the successful A-to-B case is explicitly skipped/incomplete while refusal and denial cases
  still execute. A skip is not passing evidence for V-002.

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

Replace the superseded scenario that claims root delegation occurs before tenant-dependent work. The new bounded
scenario must establish tenant-first behavior: a valid resolved tenant may delegate a missing session to login, while
invalid-host or invalid/unavailable tenant configuration preserves its approved 404/500 outcome.

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
   production build. Both receive the same tenant fixtures, Redis URL, session prefix, transaction prefix, and (if
   needed by the installed build) shared `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`. Give them different loopback ports.
4. Ensure the browser proxy routes initial authentication to A and subsequent reference requests/action submission to
   B while preserving the same browser cookies.

Temporary probe code, screenshots containing sensitive values, and raw browser/network dumps must not be committed.

### Procedure and expected observations

1. In a fresh browser context, request tenant A's `/` through instance A and complete the real local-provider login
   only if the approved B6 policy confirms freshness. Otherwise record the refusal/no-session outcome, mark V-002
   incomplete, and continue with denial/public cases.
2. Without signing in again, route tenant A's `/` through instance B. Before any interaction, record that the displayed
   safe synthetic user/tenant description matches A and that the authoritative deadline/warning values are present.
3. Press `Tab` until the protected-operation button receives visible focus. Record the accessible button name and
   visible focus indication. Press `Enter` or `Space`; record the announced success result. Inspect browser/network
   state only far enough to establish that exactly one reference-effect receipt was emitted, without retaining its
   name/value. This establishes the distinct composed V-008 observation.
4. Send the tenant-A session to tenant B through instance B. Record actual HTTP 403, bounded forbidden indication,
   absence of tenant-A identity/content/result, and no new receipt.
5. Remove or invalidate only the scenario-owned session record, then submit the already-rendered reference operation.
   Record the perceivable no-session denial, no automatic OIDC, no protected result, and no receipt.
6. In a fresh browser context, request tenant A's `/` through B. Record absence of protected content and automatic
   same-origin OIDC initiation. Stop before a second login.
7. Without a session, request `GET /_test/tenant-config`. Record 200, private/no-store, safe configured content, no
   application/correlation/effect cookie, and no protected identity/result. Separately request one invalid host and one
   selected malformed/unreadable tenant case; record the approved 404/500 classes with no fallback tenant.
8. Only in an isolated local Compose environment owned by this execution, exercise the real-store failure:

   ```sh
   docker compose stop redis
   ```

   Request the page and action through B. Record a server failure distinct from login/403/success and zero new
   receipts. Restore Redis and wait for readiness before any later case:

   ```sh
   docker compose start redis
   docker compose exec redis redis-cli ping
   ```

   Skip this step rather than stopping a shared or pre-existing Redis service.

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
```

Run `pnpm check:changes` through the normal pre-commit hook. Investigate findings; do not add suppressions or weaken a
check.

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
