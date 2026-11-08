# Quickstart: Shared Session State Verification

**Plan**: [plan.md](./plan.md)

**Proposed claim design pending human approval in PR #323**: [verification.md](./verification.md)

This guide maps the proposed verification claims to the current implementation. It plans commands and observations;
it does not record an executed result. Task generation and implementation remain gated on human approval of PR #323
and this plan.

## Safety and evidence rules

- Run against the exact implementation revision under review and record its full commit hash.
- Use only synthetic tenant/user labels and a scenario-owned Redis prefix matching
  `test:session:<uuid>:`. Never retain the prefix, opaque references, keys, cookies, raw records, credentials, tokens,
  telemetry payloads, PHI, or client-identifying data.
- Do not stop, pause, flush, or scan a shared Redis service for outage evidence. The outage suite and temporary parent
  probe must own their Redis project, loopback port, data, and teardown.
- Do not convert log/trace inspection into durable assertions. This feature has no observability claim.
- Do not report a prior child run, passing test count, BDD dry run, static check, or CI check as current runtime proof.

## Prerequisites

- Node.js 26 or later and pnpm 12.16.1 from the repository root.
- Installed dependencies from the root lockfile.
- Docker with Compose for Redis integration/outage work.
- A clean implementation worktree with no unrelated services using infrastructure the run intends to own.
- Current product pins: Effect/platform/vitest 4.1.2, Redis client 6.3.1, and Redis image 8.10.3.

Record versions before execution:

```sh
git rev-parse HEAD
node --version
pnpm --version
docker --version
docker compose version
```

## 1. Static conformance before execution

Compare the implementation revision to [contracts/modules.md](./contracts/modules.md) and record:

- whether tenant-policy, session, bounded-request, and runtime signatures match;
- whether private children remain imported only by their parents;
- whether the root package surface stays narrow;
- whether the StoredSession v1 fields, public outcome vocabulary, and runtime composition match;
- every production or evidence gap found, or an explicit statement that no source change is required;
- the downstream limitations that remain intentionally incomplete.

If a finding changes behavior, scope, acceptance, or verification obligations, stop and return it to the owning
workflow. Do not edit `spec.md`, `verification.md`, requirements, or the delivery plan from implementation.

## 2. Deterministic public-contract evidence

Run the frontend-services unit suite:

```sh
pnpm --filter @pathableai/pre-ets-frontend-services test
```

Inspect the named scenarios rather than retaining only a test count:

| Claims              | Required files/observations                                                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-004, V-012        | `tenant-policy.test.ts`: 5–30 boundaries, omission, warning default/0/valid leads, and invalid explicit rejection without fallback.                                                                 |
| V-005–V-010         | `session.test.ts`: establishment, all closed activity values, policy adoption, equal/after deadline, no revival, mismatch, failure separation, invalidation, and ambiguous-reply no-retry behavior. |
| V-004, V-006, V-012 | `session-policy-refresh.test.ts`: actual tenant consumer plus session service, invalid policy before storage, and independent adoption by two sessions.                                             |
| V-010, V-011        | `unit/reference-session-enforcement.test.ts`: bounded request outcomes and no fail-open mapping.                                                                                                    |

Then build frontend-services and exercise the bounded Next.js page/action tests:

```sh
pnpm --filter @pathableai/pre-ets-frontend-services build
pnpm --filter @pathableai/pre-ets-frontend test:unit
```

Confirm usable success, no-usable redirect/denial, mismatch denial, service/tenant failure propagation, no protected
receipt on failure, and the explicit public-route exclusions. These tests use service doubles and do not establish
real-store composition.

## 3. Real shared-state evidence

Start or select a local Redis service without disturbing another run. When using the repository Compose service,
ensure its required local environment is already configured:

```sh
docker compose up -d --wait redis
docker compose exec redis redis-cli ping
```

Run the normal real-Redis suite:

```sh
REDIS_URL=redis://127.0.0.1:6379 pnpm --filter @pathableai/pre-ets-frontend-services test:integration
```

For V-001–V-003, V-006, V-007, V-009, and V-010, inspect and record the semantic result of:

- establishment on one independently scoped NodeRedis client and strict-equal read on another and a recreated client;
- tenant match/mismatch without identity leakage;
- one session adopting changed policy while its sibling remains unchanged;
- renewal-before-expiration, expiration-before-renewal, and controlled released schedules;
- renewal-before-invalidation, invalidation-before-renewal, and controlled released schedules;
- disconnected adapter establishment/read/refresh/invalidation;
- validated owned-prefix cleanup.

The suite may also execute authentication Redis scenarios. Attribute only the session scenarios to this feature.
Separate client scopes in one process do not establish independently running authenticated applications.

## 4. Isolated outage evidence

Run the opt-in outage suite separately:

```sh
pnpm --filter @pathableai/pre-ets-frontend-services test:integration:outage
```

The suite creates a unique temporary Compose file, project, Redis 8.10.3 container, and loopback port. Confirm both:

1. pre-dispatch read/refresh/invalidation fail within the owned-store loss bound as fieldless
   `SessionServiceUnavailable`; and
2. paused in-flight operations remain pending before the owned store stops, then fail within the bound.

Record restart, public re-evaluation, owned session cleanup, container/volume removal, and temporary-directory removal.
If cleanup fails, report the residual project/path and do not call the run clean.

## 5. Manual composed parent observation

This procedure is mandatory and distinct from the automated suites. On the implementation branch, create exactly one
temporary uncommitted probe at `tests/bdd/session/shared-session-parent.manual.test.ts`. Do not add the probe to Git,
and delete it after the run. The probe is an execution-only composition of existing patterns, not a new durable test or
product interface.

### Probe composition contract

The temporary file must:

- import `./fixture-hooks.mjs` and `./fixture-register.mjs` before loading the bounded Next.js consumer;
- import `applicationBrowser`, `freePort`, `type SiteOptions`, `spawnFrontend`, `stopProcess`, and `waitUntilReady`
  from `../../support/oidc/harness.ts`, matching `tests/bdd/session/reference-session-enforcement.test.ts`;
- copy only the bounded, test-local composition patterns named `sessionLayer`, `establish`, `read`, `refreshAt`,
  `invalidate`, `withClients`, and `deleteOwnedPrefix` from
  `packages/frontend-services/tests/integration/session-redis.test.ts`; and
- adapt the owned-store lifecycle patterns named `freeLoopbackPort`, `composeDefinition`, `createOutageStore`,
  `stopStore`, `startStore`, and `destroyOutageStore` from
  `packages/frontend-services/tests/integration/session-redis-outage.test.ts`.

Those integration helpers are test-local rather than public contracts: reproduce the minimum orchestration in the
temporary file instead of exporting or importing them. Do not copy a full test implementation into a retained
artifact.

Build the bounded production frontend and invoke the probe from the repository root exactly as follows:

```sh
pnpm --filter @pathableai/pre-ets-frontend build
node --test tests/bdd/session/shared-session-parent.manual.test.ts
```

### Setup

1. Use `freeLoopbackPort`, `composeDefinition`, and `createOutageStore` patterns to create an isolated Redis 8.10.3
   Compose project on a free loopback port with a validated unique session prefix.
2. Use the `sessionLayer` and `withClients` patterns to create two independently scoped public `SessionService`
   clients A and B using the same owned Redis URL and prefix.
3. Use the repository's synthetic `springfield` tenant fixture consistently for both service clients and the bounded
   frontend, issuers under `.test`, and two synthetic subjects. `fixtures/tenant-config/springfield.json` is test data,
   not a client or production tenant. Prepare policy P1 (`30/5`) and policy P2 (`5/0`).
4. Adapt the `siteOptions` pattern in `tests/bdd/session/reference-session-enforcement.test.ts`: use
   `path.resolve("fixtures/tenant-config")`, `runtime: "production"`, the owned `redisUrl` and `sessionPrefix`, and a
   probe-owned `transactionPrefix`. Start the bounded consumer with `spawnFrontend` on a `freePort`, wait with
   `waitUntilReady`, then call `applicationBrowser` with the concrete `springfield.localhost:<port>` host. Capture its
   returned browser/proxy handle and every Playwright context created from it before observing the bounded page/action.
   Do not use real provider credentials; fixture establishment is explicitly bounded evidence, not freshness proof.
5. Record revision, runtime/dependency versions, safe client labels, policy values, commands, and start time. Keep all
   opaque values in memory only.

### Lifecycle observation

1. Establish session A through client A and session B through client B under P1. Cross-read each from the other client
   and confirm identical safe identity, tenant, deadline, and warning values (V-001–V-003).
2. Select P2 but do not refresh. Read A and B and confirm both retain their P1 deadline/warning (V-006).
3. Send an excluded activity for A and confirm neither its record nor deadline changes (V-008).
4. Before A's deadline, send qualifying activity for A under P2. Confirm both clients see A on P2 while B remains on
   P1. Then qualify B and confirm both clients see B on P2 (V-006).
5. Coordinate a renewal attempt for A from one client with invalidation from the other. After both settle, confirm
   neither client returns usable identity and another refresh cannot recreate A (V-009).
6. With a separate established session, open `/` on `springfield.localhost:<port>`, add only its opaque
   `pathable-session` cookie, activate **Record reference operation**, and confirm the success status plus exactly one
   non-session receipt cookie. Keep the session value in memory, clear all context cookies, restore only that
   `pathable-session` cookie, and confirm no non-session cookie remains.
7. Use the `stopStore` pattern to stop only the owned Redis project. Activate the same button again and confirm the
   unavailable result replaces the success result, no new non-session receipt appears, the restored session cookie is
   not replaced, no redirect occurs, and neither client returns usable identity (V-010–V-011).
8. Use the `startStore` pattern to restore the owned store only for public re-evaluation and cleanup. Treat an
   indeterminate mutation as failure; do not retry it and claim a known original result.

### Cleanup

The probe must put lifecycle cleanup in `try`/`finally`. In the `finally` block, perform this order even after an
assertion or command failure:

1. If the owned store is stopped, restart it with the `startStore` pattern so public cleanup can run.
2. Re-evaluate and invalidate every still-readable synthetic session, then use `deleteOwnedPrefix` and verify the
   validated owned prefix has no remaining keys.
3. Dispose both scoped clients/runtimes.
4. Close every acquired Playwright page/context, then await the `applicationBrowser` handle's `close` callback so its
   browser and proxy cannot keep the exact `node --test` command alive. Guard each handle because setup may fail before
   acquisition.
5. Stop the bounded frontend process with `stopProcess`.
6. Remove the owned Compose project, containers, volumes, and temporary Compose directory with the
   `destroyOutageStore` pattern.

After the process exits, remove only the known temporary probe and verify that it and generated output are absent:

```sh
rm -- tests/bdd/session/shared-session-parent.manual.test.ts
test ! -e tests/bdd/session/shared-session-parent.manual.test.ts
git status --short
```

### Expected semantic result

Retain only a claim table containing revision, environment, safe action label, semantic observation, pass/fail, cleanup,
and limitation. Explicitly retain these limits:

- fixture identity is not real OIDC/provider freshness;
- clients are independent service/store scopes, not complete authenticated application instances;
- one bounded page/action is not comprehensive application protection;
- no browser activity detection, cross-tab warning, continuation, recovery, accessibility, provider compatibility,
  distributed-clock, telemetry, or universal race claim is established.

## 6. Quality gates

Run formatting first for the plan/document-only phase. On the implementation branch, run the behavior checks above
plus the repository-required gates after any source/test change:

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
pnpm check:unused
pnpm check:health
pnpm check:changes
```

Investigate every introduced finding. Do not add suppressions, ignores, baselines, weaker thresholds, or unmatched
allowances. Report any pre-existing failure separately from an introduced failure.

## 7. Implementation results

### Static conformance result (T004–T008)

Recorded before execution against `d665266236776d9ef2a150a67e1bccebfd418a7a`, with installed Effect,
`@effect/platform-node`, and `@effect/vitest` 4.1.2 declarations (`Context.Service`, `Schema.TaggedError`, `Clock`,
`Layer.provide`/`Layer.provideMerge`, `ManagedRuntime.make`, `effect/persistence/Redis` `script`/`eval`/`send`, and
`NodeRedis.layer` match current usage; no API drift).

| Contract                               | Result     | Notes                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant policy (`TenantConfigService`)  | Conformant | Service shape and tag match; `TenantNotFound` 404 / `TenantReadError` 500; Schema decoding in private `tenant/config.ts`; optional keys stay absent; 5–30 timeout, warning default/0/strictly-below rules; no fallback tenant or policy.                                                                                                                |
| Session (`SessionService`)             | Gap closed | Signatures, closed activity sets, `RefreshSessionForTenantInput` union, Effect `Clock`, `SET NX PX`, `DEL`, one decoded Lua transition, fieldless errors, and no retry of ambiguous refresh/invalidation replies conform. Gap: the `SET NX` creation reply was type-asserted, so a malformed reply was treated as a collision and creation was retried. |
| Bounded request (`readSessionRequest`) | Conformant | Tenant configuration loads before tenant-bound admission; mismatch → `forbidden()`; `SessionServiceUnavailable` rethrown; no replacement session; runs through the installed host runtime.                                                                                                                                                              |
| Runtime composition                    | Conformant | One host-owned `ManagedRuntime` published by `startProductionRuntime`; none per request; Redis provided behind `Layer.provide`; `packages/frontend` imports no `effect`.                                                                                                                                                                                |
| StoredSession v1                       | Conformant | Exact seven fields, literal version 1, positive safe-integer deadline (equality expired), nonnegative warning, UUID telemetry id, excess/missing/unknown-version rejected.                                                                                                                                                                              |
| Root surface and module ownership      | Conformant | Root exports only the adapter, cookie name, and safe session/tenant types for this feature. Only `tenant.ts` imports `tenant/config.ts`; only `session.ts` imports `session/codec.ts` and `session/store.ts` (tests included). `fallow architecture --cycles` reports no issues for the five inspected files.                                           |

Planned source change: decode the creation reply in private `session/store.ts` (`"OK"` → created, `null` → definite
collision, anything else → `SessionServiceUnavailable` without retry), with one public `SessionService` scenario in
`tests/lib/session.test.ts` (commits `c5711d2`, `ef5a065`). It changes no signature, outcome vocabulary, or stored
format. No other source change was required. Intentionally incomplete downstream: #154 (independently running
authenticated applications and comprehensive protected HTTP), #155–#157 (browser activity, warning presentation,
cross-tab, recovery), and #158 (real provider freshness and compatibility).

### Executed evidence

- Revision: source and tests at `ef5a065612385c9c67a730d3998bf63e0d327da2` on `161-shared-session-state-impl`. The
  evidence commit that adds this record changes only this file and `tasks.md`.
- Executed: 2026-11-08 06:36–06:46 (UTC−05:00). Host: Linux 7.2.15 x86_64.
- Versions: Node.js 26.13.0 (pinned by `.node-version`, installed through nvm), pnpm 12.18.0 (the root
  `packageManager` pin; the planned 12.16.1 is out of date), Docker 29.9.3, Docker Compose 5.7.0, Effect /
  `@effect/platform-node` 4.1.2, `redis` client 6.3.1, TypeScript 6.0.3, Redis image `redis:8.10.3`.
- Browser: the pinned Playwright 1.65.0 headless shell (revision 1254) was not installed locally. Installing it needed a
  download that was not authorized for this run, so the manual run reached the already-installed Google Chrome
  157.0.8103.38 through a scratch `PLAYWRIGHT_BROWSERS_PATH` alias. The harness and probe code were not changed.

| Claim IDs                  | Executed boundary and command/action                                                                                                                                                                      | Semantic observation                                                                                                                                                                                                                                                                                                                                                                                                | Result | Cleanup and limitations                                                                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-001, V-002, V-003        | Real Redis, independently scoped NodeRedis clients (T013): `REDIS_URL=redis://127.0.0.1:6379 pnpm --filter @pathableai/pre-ets-frontend-services test:integration`                                        | Session established on A read strict-equal on B and a recreated B; matching tenant admitted, other tenant mismatched without identity; A's refresh adopted on B with sibling unchanged; invalidation on B honored on A without recreation; missing, deleted, and evicted records → `NoUsableSession`. 19/19 session scenarios passed (4 authentication scenarios not attributed).                                   | Pass   | Each scenario's owned `test:session:<uuid>:` prefix deleted; zero owned keys afterwards. Independent clients are scopes in one process, not independently running authenticated applications. T010/T011 not required.  |
| V-005, V-006, V-007, V-008 | Deterministic `SessionService` with Effect `TestClock` (T019): `pnpm --filter @pathableai/pre-ets-frontend-services test tests/lib/session.test.ts tests/lib/session-policy-refresh.test.ts`              | Deadline from clock plus effective timeout; disabled warning preserved; every excluded value leaves record and TTL unchanged; excluded-with-policy rejected at type level; qualifying refresh adopts timeout and warning together; unrefreshed sessions keep their own policy; at and after the deadline → `NoUsableSession`; no revival after a timeout increase; Fast-Check policy properties hold. 80/80 passed. | Pass   | Memory Redis double. One Effect clock does not prove distributed-clock behavior. T017/T018 not required.                                                                                                               |
| V-003, V-006, V-007        | Real-Redis renewal/expiration orderings (reused T013 run)                                                                                                                                                 | Renewal before a later expiration attempt is observed by both clients; after expiration wins, no refresh recreates; overlapping renewal and expiration accept either winner with consistent later reads.                                                                                                                                                                                                            | Pass   | Finite orderings do not prove every interleaving.                                                                                                                                                                      |
| V-004, V-012               | Real `TenantConfigService` with deterministic filesystem (T024): `pnpm --filter @pathableai/pre-ets-frontend-services test tests/lib/tenant-policy.test.ts tests/lib/session-policy-refresh.test.ts`      | Timeouts 5–30 accepted; omission → 30/5 without adding fields; omitted warning → 0 at timeout 5; explicit 0 and every lead below the timeout accepted; out-of-range, fractional, string, null, and boolean timeouts and negative, fractional, string, null, boolean, equal, and greater leads rejected as 404 with no default; invalid policy fails before any store command. 102/102 passed.                       | Pass   | Does not establish warning presentation or configuration distribution across a production fleet. T022/T023 not required.                                                                                               |
| V-009, V-010               | Deterministic failure scenarios (T031): `pnpm --filter @pathableai/pre-ets-frontend-services test tests/unit/reference-session-enforcement.test.ts tests/lib/session.test.ts`                             | Missing and invalidated give the same terminal outcome; DEL dispatch failure and DEL applied with a failed reply → fieldless `SessionServiceUnavailable` without retry; final refresh write with a failed reply not retried; corrupted and unknown-version records fail closed; exhausted collisions fail closed; new: unexpected `SET` replies fail closed with exactly one `SET`. 81/81 passed.                   | Pass   | Adapter tests use service doubles. T029/T030 required: creation-reply gap closed in `session/store.ts`.                                                                                                                |
| V-009, V-010               | Real-Redis invalidation orderings and disconnected adapter (reused T013 run)                                                                                                                              | Invalidation final when renewal completes first, when invalidation completes first, and when both are released together; disconnected establishment, tenant admission, read, refresh, and invalidation → `SessionServiceUnavailable`.                                                                                                                                                                               | Pass   | Finite schedules; local injection does not establish every managed-service failure.                                                                                                                                    |
| V-010                      | Isolated owned-store outage (T033): `pnpm --filter @pathableai/pre-ets-frontend-services test:integration:outage`                                                                                         | Read, refresh, and invalidation fail as fieldless `SessionServiceUnavailable` within the 10 s bound when the owned store stops before dispatch, and when paused in-flight operations are stopped. 2/2 passed.                                                                                                                                                                                                       | Pass   | Suite restarted, re-evaluated, and cleaned sessions, then removed its Compose project, container, volume, and temporary directory; `docker compose ls --all`, `docker volume ls`, and the temp path showed no residue. |
| V-010, V-011               | Bounded Next.js consumer (T032): `pnpm --filter @pathableai/pre-ets-frontend-services build` then `pnpm --filter @pathableai/pre-ets-frontend test:unit`                                                  | Usable success with one receipt; no-usable page redirect and action denial without login start or receipt; mismatch forbidden before a receipt; service and tenant failures propagate with no protected result or receipt; public routes and raw diagnostics excluded. 19/19 frontend unit tests passed.                                                                                                            | Pass   | Service doubles. One bounded page/action is not comprehensive application protection.                                                                                                                                  |
| Full deterministic suite   | T043: `pnpm --filter @pathableai/pre-ets-frontend-services test` on `ef5a065`                                                                                                                             | 14 files, 344 tests passed.                                                                                                                                                                                                                                                                                                                                                                                         | Pass   | None beyond the rows above.                                                                                                                                                                                            |
| V-001–V-003, V-005         | Manual composed probe (T039), step 1: `pnpm --filter @pathableai/pre-ets-frontend build`, then `node --test tests/bdd/session/shared-session-parent.manual.test.ts`; action "P1 establish and cross-read" | Sessions A (client A) and B (client B) under P1 30/5 cross-read with identical issuer, subject, tenant `springfield`, deadline about 30 min ahead, and warning 5.                                                                                                                                                                                                                                                   | Pass   | Manual, real infrastructure. Fixture identity is not real OIDC or provider freshness.                                                                                                                                  |
| V-006                      | Manual probe, steps 2 and 4: "P2 selected without refresh", "qualify A", "qualify B"                                                                                                                      | Before refresh both stayed on P1; after A's qualifying refresh under P2 5/0 both clients saw A with a 5-minute deadline and warning 0 while B stayed on P1; after B's own refresh both saw B on P2.                                                                                                                                                                                                                 | Pass   | P2 is supplied directly to the service; tenant-file derivation is covered by the V-004/V-012 row.                                                                                                                      |
| V-008                      | Manual probe, step 3: "excluded activity for A" (`automatic-polling`)                                                                                                                                     | Returned and cross-read state equal to the established state; deadline unchanged.                                                                                                                                                                                                                                                                                                                                   | Pass   | —                                                                                                                                                                                                                      |
| V-009                      | Manual probe, step 5: "renewal from A vs invalidation from B, released together"                                                                                                                          | Renewal returned usable before invalidation committed; invalidation returned `NoUsableSession`; afterwards neither client read usable identity and a later refresh did not recreate A.                                                                                                                                                                                                                              | Pass   | One released schedule, not every interleaving.                                                                                                                                                                         |
| V-011                      | Manual probe, step 6: bounded page `/` and **Record reference operation** on `springfield.localhost:<port>` with a separate session C                                                                     | Success status shown; exactly one non-session receipt cookie; after clearing and restoring only `pathable-session`, zero non-session cookies.                                                                                                                                                                                                                                                                       | Pass   | One bounded page/action is not comprehensive protection.                                                                                                                                                               |
| V-010, V-011               | Manual probe, step 7: owned store stopped, same action activated                                                                                                                                          | Server Action POST returned 500 and the success text was not shown; no new receipt; session cookie unchanged; no redirect (URL unchanged); both clients' reads failed as fieldless `SessionServiceUnavailable`.                                                                                                                                                                                                     | Pass   | The unavailable result is the framework error response, not final recovery UI (#155–#157).                                                                                                                             |
| Manual cleanup             | Manual probe `finally` block, then T040                                                                                                                                                                   | Owned store restarted; readable sessions re-evaluated and invalidated; owned prefix deleted with zero keys remaining; clients disposed; browser contexts and handle closed; frontend stopped; owned Compose project, containers, volumes, and temporary directory removed. Probe file deleted and absent; `git status` clean; no probe project, container, or volume remained.                                      | Pass   | A first probe attempt failed at browser launch because the pinned headless shell was missing. Its cleanup also completed with zero owned keys and the store destroyed; it recorded no claim.                           |

Manual-run limits that remain: fixture identity is not real OIDC or provider freshness; clients are independent
service/store scopes, not complete authenticated application instances; one bounded page/action is not comprehensive
protection; no browser activity detection, cross-tab warning, continuation, recovery, accessibility, provider
compatibility, distributed-clock, telemetry, or universal race claim is established.

Repository gates on `ef5a065` (T044–T046): `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`,
`pnpm check:unused`, `pnpm check:health`, and `pnpm check:changes` all exited 0. The only Fallow finding is the
inherited warn-level clone between the `createEntry` helpers in `tests/helpers/authentication.ts` and
`tests/helpers/session.ts`; it predates this branch. Requirements BDD (`pnpm test:bdd`) was not run; it is not part of
this feature's evidence.

## 8. Evidence record checklist

- [x] Exact commit, branch, date/time, host environment, and dependency/service versions recorded.
- [x] Static conformance result names every contract and any source change.
- [x] V-001–V-012 each map to a named executed boundary and semantic result.
- [x] Automated, real-infrastructure, and manual results remain distinct.
- [x] Outage infrastructure and synthetic state cleanup are confirmed.
- [x] No secret, reference, key, cookie, raw record, token, PHI, telemetry payload, or identifying client data retained.
- [x] Downstream and environmental limitations are explicit.
- [x] Passing checks are not described as human approval or full requirement verification.

These ticks record only that the evidence above was executed and retained as planned. Passing checks are not human
approval or full requirement verification. PREETS-SESSION-006 AC2–3 at the independently running authenticated
application boundary, PREETS-SESSION-008 protected HTTP and browser enforcement, and PREETS-SESSION-011 warning
presentation remain with #154–#158.
