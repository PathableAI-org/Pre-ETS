# Quickstart: Renew and Expire Authoritative Sessions

**Status**: Planned procedure — commands and outcomes below are not execution evidence

## Evidence map

| Claims                                   | Planned boundary                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| V-001–V-005, V-007, V-008, V-010         | Public `SessionService` tests with deterministic Effect time and the memory Redis adapter |
| V-002, V-003, V-005, V-006, V-008, V-010 | Two independently scoped clients against real Redis                                       |
| V-003, V-009                             | Actual `TenantConfigService` consumption and composition                                  |
| V-001–V-006, V-009, V-010                | Mandatory manual two-client procedure                                                     |

## Prerequisites

1. Use a clean checkout of the implementation revision and record it. The refreshed planning baseline is `origin/main`
   `3f54c577a076c8139c5be6986e0b7c3e81106af7` plus the approved specification/plan stack.
2. Install the repository's pinned Node.js and pnpm dependencies from the root.
3. Have Docker Compose available for the repository's pinned Redis 8.10.2 service.
4. Use only synthetic tenant/identity data and a scenario-owned Redis key prefix. Never use production credentials,
   tokens, cookie/session references, raw records, PHI, or identifying partner data.

## Automated evidence

Run deterministic public-service and tenant-consumer evidence:

```sh
pnpm --filter @pathableai/pre-ets-frontend-services test
```

Start and check the real store, then run bounded integration evidence:

```sh
docker compose up -d --wait redis
docker compose exec redis redis-cli ping
REDIS_URL=redis://127.0.0.1:6379 pnpm --filter @pathableai/pre-ets-frontend-services test:integration
```

Expected observations include all activity categories, strict before/equal/after behavior, policy-change separation,
and missing/expired/failure outcomes. A controlled storage response that completes after its returned deadline must
return `NoUsableSession` despite its pre-I/O receipt time. A controlled post-commit result failure must return
`SessionServiceUnavailable` without a stale retry; a later public read, not the failed call, determines whether the
write committed. A real-Redis record with a valid tenant and future deadline but an invalid or missing identity field
must return `SessionServiceUnavailable` from public refresh with identical stored bytes and no TTL reset or extension.
A tenant-bound
refresh of an expired record for another tenant must return
`SessionTenantMismatch` without changing its bytes or TTL. Real-Redis evidence must separately gate renewal-first and
expiration-first dispatch, assert both operation results, and confirm later reads from both clients converge; a single
ordering case is not sufficient. It must also hold both clients at one start barrier, release both operations without
awaiting either result, bound completion, accept either permitted winner, assert both public operation outcomes, and
confirm both clients converge afterward. This overlapping case cannot substitute for the two forced orderings. The
integration suite must remove only its owned keys and close both clients/runtimes. Stop Compose only if this procedure
started it.

Requirements-backed BDD is intentionally absent: #154–#156 own the running request/browser producers. An optional
#219 fixture may add bounded composition evidence but is not required and cannot establish comprehensive protection.

## Manual feature verification

Create a temporary, uncommitted probe that imports only the public session and tenant surfaces. Instantiate two
independently scoped clients/runtimes, A and B, against the same scenario-owned prefix. Do not import private store or
codec children.

1. Record revision, date/time, Node/pnpm/Redis versions, synthetic tenant aliases, initial and changed policies, the
   owned prefix label (not raw keys), client topology, and clock-control method.
2. Through A, establish two independent synthetic sessions under policy A. Through B, read both for the same tenant and
   record only the public usable outcomes, synthetic identity labels, deadlines, and warning leads.
3. Change the selected synthetic tenant to policy B. Read both sessions through both clients without activity and
   confirm their established deadlines/warnings remain from A.
4. Move controlled application time strictly before the deadline. Through B, present `continue-session` with policy B.
   Confirm A and B then observe the same renewed deadline and warning policy B.
5. Compare the already-established second session with the refreshed first session. Confirm the second stays on A
   while the first remains on B until the second receives its own qualifying refresh.
6. Present `unrelated-background-traffic` to the first session and confirm its deadline is unchanged.
7. Advance to exactly that deadline and present qualifying activity. Then increase timeout and try again after the
   deadline. Confirm both clients return `NoUsableSession` and later reads cannot revive it.
8. Consume a synthetic tenant file with an invalid timeout/warning combination. Confirm tenant consumption rejects it
   before an effective policy or refresh input exists.
9. Remove the temporary probe and only scenario-owned fixtures, dispose clients/runtimes, and stop services started by
   the procedure. Never flush a shared Redis instance.

Retain a safe claim-level result summary, not raw transcripts or stored data. Record limitations: application time
control is not Redis time, only finite schedules/topologies were exercised, and browser/HTTP/accessibility/telemetry/
outage recovery were not verified.

## Repository quality gates

Run from the repository root after feature-specific evidence:

```sh
pnpm typecheck
pnpm build
pnpm lint
pnpm format:check
pnpm check:unused
pnpm check:health
pnpm check:changes
```

Investigate every finding. Do not add suppressions, weaker thresholds, baselines, or generated output. Passing these
checks is quality evidence, not proof of the feature's runtime outcomes.

## Execution record template

```text
Revision:
Date/time and environment:
Dependency/store versions:
Safe synthetic inputs and topology:
Claim IDs exercised:
Observed public outcomes:
Automated results:
Manual results:
Cleanup completed:
Limitations or skipped cases:
```
