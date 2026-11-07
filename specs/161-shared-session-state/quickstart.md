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
6. With a separate established session, exercise the bounded page/action successfully, then use the `stopStore`
   pattern to stop only the owned Redis project. Re-exercise the bounded operation and confirm a distinct failure with
   no protected receipt, redirect-based replacement session, or usable identity (V-010–V-011).
7. Use the `startStore` pattern to restore the owned store only for public re-evaluation and cleanup. Treat an
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

Populate this section only on the implementation branch after executing the evidence against the exact revision.
Retain no raw output and do not commit the temporary probe. Add one row per executed boundary using safe semantic
observations only:

| Claim IDs | Executed boundary and command/action | Semantic observation | Result  | Cleanup and limitations |
| --------- | ------------------------------------ | -------------------- | ------- | ----------------------- |
| Pending   | Pending implementation execution     | Pending              | Pending | Pending                 |

Record the exact revision, environment, and execution time immediately above the table when replacing the pending
row. This section is the retained implementation evidence location; do not create a separate evidence-record file.

## 8. Evidence record checklist

- [ ] Exact commit, branch, date/time, host environment, and dependency/service versions recorded.
- [ ] Static conformance result names every contract and any source change.
- [ ] V-001–V-012 each map to a named executed boundary and semantic result.
- [ ] Automated, real-infrastructure, and manual results remain distinct.
- [ ] Outage infrastructure and synthetic state cleanup are confirmed.
- [ ] No secret, reference, key, cookie, raw record, token, PHI, telemetry payload, or identifying client data retained.
- [ ] Downstream and environmental limitations are explicit.
- [ ] Passing checks are not described as human approval or full requirement verification.
