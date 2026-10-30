# Quickstart: Complete Session Invalidation and Failure Behavior

**Status**: Planned procedure — commands and outcomes below are not execution evidence

## Evidence map

| Claims                            | Planned boundary                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| V-001, V-002, V-005, V-007, V-008 | Public `SessionService` tests with the controlled memory Redis adapter                         |
| V-001–V-004, V-006–V-008          | Independently scoped clients against real Redis, including race and outage cases               |
| V-001, V-002, V-005               | Existing #219 bounded reference fixture extended to invalidate through the public service      |
| V-001–V-007                       | Mandatory manual dedicated-store procedure with two clients and the bounded reference consumer |

## Prerequisites

1. Use a clean checkout of the implementation revision and record it. The planning baseline is `origin/main`
   `db4b5615c10aa3948ea91919a524a3ed6b743cb2` plus the approved specification/plan stack.
2. Install the repository's pinned Node.js and pnpm dependencies from the root.
3. Have Docker available with the repository-pinned Redis 8.10.3 image. Automated integration may use the normal
   Compose Redis service. The manual outage observation requires a dedicated instance with no other users.
4. Use only synthetic tenant/identity data and a scenario-owned key prefix. Never record production credentials,
   provider tokens, raw cookies/references/keys/records, PHI, protected content, or identifying partner data.
5. Stop or isolate only a Redis instance that this procedure started and owns. If exclusive control cannot be
   established, record the manual outage observation as skipped rather than disturbing a shared service.

## Automated evidence

Run deterministic public-service evidence:

```sh
pnpm --filter @pathableai/pre-ets-frontend-services test
```

Expected session results include:

- absent and malformed references return exact fieldless `NoUsableSession` without a Redis command;
- current, expired, malformed, already removed, and unknown addressed state all terminate as fieldless
  `NoUsableSession` when `DEL` returns `0` or `1`;
- store/transport and unexpected-reply failures return fieldless `SessionServiceUnavailable`;
- a controlled delete-then-fail result executes one delete, returns unavailable, performs no retry, and leaves later
  public read/invalidate responsible for authoritative re-evaluation; and
- no invalidation result or error contains identity, tenant, policy, deadline, raw reference/key/payload, or Redis
  diagnostics.

Start and check the normal real store, then run bounded integration evidence:

```sh
docker compose up -d --wait redis
docker compose exec redis redis-cli ping
REDIS_URL=redis://127.0.0.1:6379 pnpm --filter @pathableai/pre-ets-frontend-services test:integration
```

Real Redis evidence must establish that client B can invalidate a session established by client A and that both
clients subsequently return `NoUsableSession` for read and renewal. It must exercise three separate schedules:

1. renewal completes before invalidation is dispatched;
2. invalidation completes before renewal is dispatched; and
3. both clients cross a start barrier, both operations are released without awaiting either result, and both
   completions are bounded.

In schedule 1, the renewal call may return a usable renewed value before invalidation deletes it. In schedules 2 and
3, renewal may return no usable state depending on order. Every schedule must end with later reads and renewals from
both clients returning `NoUsableSession`; no replacement key/session may appear. Existing #220 expiration/renewal
tests remain in the suite and must continue to pass.

The real-adapter failure scenario uses a deliberately disconnected client Layer, not a stopped shared store. Read,
refresh, and invalidate through that client must each return `SessionServiceUnavailable`. A healthy client must then
re-evaluate the owned reference; the failed call itself does not claim whether mutation occurred. Integration cleanup
removes only owned keys and closes all clients/runtimes. Stop Compose only if this procedure started it.

Run the bounded reference fixture separately:

```sh
pnpm build
REDIS_URL=redis://127.0.0.1:6379 node --test tests/bdd/session/reference-session-enforcement.test.ts
```

The retained case must establish a usable reference and successful reference operation, invalidate the reference
through the public `SessionService`, then observe denial and no protected receipt from the already-rendered action.
It remains bounded #219 evidence and does not establish application-wide protection. The fixture validates and cleans
only its owned prefix.

Requirements-backed Gherkin is intentionally absent. #154–#158 own comprehensive application, browser logout,
recovery, and provider-freshness behavior.

## Manual feature verification

This procedure extends the existing #219 reference harness and uses the delivered public service only. Temporary
probe/override files and raw transcripts must remain uncommitted and be removed during cleanup.

### Prepare an exclusively owned store

1. Record the revision, date/time, Node/pnpm/Redis versions, safe container label, selected loopback port, owned key
   prefix label, and bounded fixture entry point.
2. Confirm loopback port `6380` is unused, or substitute another recorded unused port. Create
   `/private/tmp/preets-session-invalidation-redis.yml` with this temporary Compose definition:

   ```yaml
   services:
     redis:
       image: redis:8.10.3
       ports:
         - "127.0.0.1:${MANUAL_REDIS_PORT}:6379"
       healthcheck:
         test: ["CMD", "redis-cli", "ping"]
         interval: 2s
         timeout: 3s
         retries: 10
         start_period: 2s
   ```

3. Start and validate only that uniquely named project:

   ```sh
   export MANUAL_REDIS_PORT=6380
   export MANUAL_REDIS_PROJECT=preets-session-invalidation-221
   export MANUAL_REDIS_FILE=/private/tmp/preets-session-invalidation-redis.yml
   docker compose --project-name "$MANUAL_REDIS_PROJECT" --file "$MANUAL_REDIS_FILE" up -d --wait
   docker compose --project-name "$MANUAL_REDIS_PROJECT" --file "$MANUAL_REDIS_FILE" exec redis redis-cli ping
   export REDIS_URL="redis://127.0.0.1:${MANUAL_REDIS_PORT}"
   ```

4. Point the bounded reference harness at that `REDIS_URL`. Keep its existing random owned
   `SESSION_KEY_PREFIX` validation. Do not reuse or stop a store with other users.

### Observe success, race finality, and consumer denial

1. Through independently scoped public-session clients A and B, establish one synthetic tenant-bound session with A
   and read it with B. Record only public outcome categories and safe presence checks for identity, tenant, deadline,
   and warning policy.
2. Start a qualifying renewal through B and invalidation through A using the delivered bounded synchronization
   control. Release both without awaiting either first; bound both completions.
3. Through both clients, read and try to renew the old reference. Confirm every later outcome is exact
   `NoUsableSession`, regardless of whether the racing renewal itself returned usable before invalidation.
4. Use the #219 reference fixture with a separate synthetic session. Confirm the page/action succeeds before
   invalidation, invoke public `SessionService.invalidate` from the fixture process, then invoke the already-rendered
   reference action again. Confirm denial, no protected receipt, and no successful protected result.

### Observe explicit outage failure

1. Establish a separate owned synthetic session and confirm the bounded reference operation succeeds.
2. Stop only the dedicated Redis service. Without rebuilding or replacing application state, attempt public read,
   refresh, and invalidate through the two-client probe and invoke the bounded reference operation.

   ```sh
   docker compose --project-name "$MANUAL_REDIS_PROJECT" --file "$MANUAL_REDIS_FILE" stop redis
   ```

3. Confirm each service operation returns `SessionServiceUnavailable`; the bounded consumer must fail without a
   protected result or receipt. Ordinary `NoUsableSession`, usable identity, successful authorization, and silent
   replacement are not acceptable outage results.
4. Do not infer whether the failed invalidation committed. Restart the same dedicated store, wait for health, and
   re-evaluate the reference through the public service.

   ```sh
   docker compose --project-name "$MANUAL_REDIS_PROJECT" --file "$MANUAL_REDIS_FILE" start --wait redis
   ```

### Cleanup

1. Explicitly invalidate any re-evaluated usable owned sessions through the public service.
2. Run the fixture's owned-prefix cleanup, then confirm no owned keys remain without flushing Redis.
3. Dispose both clients/runtimes, stop the application/fixture processes, remove temporary probe/override files, and
   stop/remove only the uniquely named dedicated Compose project.

   ```sh
   docker compose --project-name "$MANUAL_REDIS_PROJECT" --file "$MANUAL_REDIS_FILE" down
   ```

4. Confirm `git status` contains no probe, override, raw transcript, reference, credential, or generated report.

### Expected observations

- Before invalidation, both clients and the bounded consumer observe the same usable session details.
- After the race and completed invalidation, both clients return `NoUsableSession` for read/renewal and the bounded
  consumer produces no protected success.
- During outage, read, renewal, invalidation, and the bounded consumer remain explicit failures rather than absence or
  success.
- After restart, authoritative state is re-evaluated; cleanup removes only owned fixtures.

Retain only revision/environment, safe labels, operation ordering, public outcome categories, claim-level pass/fail,
cleanup result, and limitations. Do not retain raw references, cookie values, keys, records, identities beyond
synthetic labels, protected content, PHI, credentials, or partner names.

## Repository quality gates

Run from the repository root after feature-specific evidence:

```sh
pnpm typecheck
pnpm build
pnpm lint
pnpm format:check
pnpm check:unused
pnpm check:health
FALLOW_AUDIT_BASE=origin/main pnpm check:changes
```

During implementation, run targeted Fallow architecture, dead-code, complexity, or duplication checks as soon as a
change can introduce the corresponding risk. Investigate every finding. Do not add suppressions, ignore entries,
baselines, weaker thresholds, or generated output. Passing these checks is quality evidence, not proof of runtime
behavior.

## Execution record template

```text
Revision:
Date/time and environment:
Dependency/store versions:
Safe synthetic labels and topology:
Race ordering/control:
Claim IDs exercised:
Observed public outcomes:
Bounded reference consumer result:
Automated results:
Manual results:
Cleanup completed:
Limitations or skipped cases:
```

No execution record is present yet. Planning and pull-request creation do not establish feature verification.
