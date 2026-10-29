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

## Execution record

The procedure above is unchanged. This record is the execution evidence for implementation
`77e41f88cafbb5585834398d6bccebafb666166c`.

```text
Revision:
Implementation 77e41f88cafbb5585834398d6bccebafb666166c on 159-session-renewal-expiration-impl.
Planning baseline origin/main 3f54c577a076c8139c5be6986e0b7c3e81106af7.
Issue #220 was open. Its in-scope session criteria matched the accepted requirement files at
c1d87a22a55cd5190bc702a6a3c33cfed2ca23ef, e206d165f0f30999220922f57a3f92549c15f4cc, and origin/main.
No material drift.

Date/time and environment:
2026-10-29T09:08:18Z through the quality-gate run on the same date.
Node.js v26.2.0, pnpm 12.15.0, Darwin.

Dependency/store versions:
effect 4.0.5, @effect/platform-node 4.0.5, @effect/vitest 4.0.5, @fast-check/vitest 0.5.0.
Redis server v=8.10.2 in the already-running local container. redis-cli ping returned PONG.
compose.yaml pins redis:8.10.3. This run did not start or stop Compose and did not recreate that container.
The installed Redis script API expressed one key and one final DEL or SET PX. Effect clock remained the
deadline authority.

Safe synthetic inputs and topology:
Tenant alias alpha on host alpha.example.test. Policies 30/5, then 12/0, then a later 30/5 timeout.
Invalid tenant classes: fractional 5.5, numeric string, below 4, above 31, warning equal to timeout, and
warning greater than timeout. Subjects subject-one and subject-two.
Manual topology: two ManagedRuntime clients, one scenario-owned test:session prefix, and one mutable
Effect clock. Automated races used the same two-client shape with per-call clocks. No raw keys, records,
credentials, or partner identifiers were retained.

Claim IDs exercised:
V-001, V-002, V-003, V-004, V-005, V-006, V-007, V-008, V-009, V-010.

Observed public outcomes:
V-001: usable reads expose deadline, warning, synthetic identity, and tenant. NoUsableSession,
SessionTenantMismatch, and SessionServiceUnavailable expose no protected identity. The existing #219
reference fixture already observes that and was not given a new case or a refreshForTenant call.
V-002: every qualifying literal, including continue-session, renews a still-usable session to
receivedAt plus the selected idle timeout.
V-003: a policy change applies only to the session that is refreshed. An unrefreshed sibling keeps its
establishment deadline and warning. The real tenant consumer supplies that policy.
V-004: every excluded literal, including unrelated-background-traffic, returns the current session and
does not write.
V-005: a qualifying refresh at or after the deadline returns NoUsableSession. Raising the timeout later
does not revive it.
V-006: two real clients agree after renewal-first, expiration-first, and one overlapping start barrier.
Either barrier winner is accepted, and later reads converge. Finite schedules are not every topology.
V-007: missing and expired outcomes stay NoUsableSession. Malformed, unrecognized, and transport failures
stay fieldless SessionServiceUnavailable and do not mutate. A result failure after the one final write
is unavailable without a stale retry; a later read shows the committed renewal.
V-008: expiry and a missing record use one final DEL or no key. No tombstone is written.
V-009: each invalid policy class fails tenant consumption with status 404 before establish or
refreshForTenant. Redis receives no SET or EVALSHA. This is not a PREETS-TENANT-004 HTTP mapping.
V-010: deadline equality is decided by the Effect clock and a second sample after storage. No browser
timer is involved.

Automated results:
pnpm --filter @pathableai/pre-ets-frontend-services test: 14 files, 326 passed.
REDIS_URL=redis://127.0.0.1:6379 pnpm --filter @pathableai/pre-ets-frontend-services test:integration:
2 files, 18 passed, against Redis 8.10.2. Redis was not skipped.
pnpm typecheck, pnpm build, pnpm lint, and pnpm format:check passed.
pnpm check:unused, pnpm check:health, and pnpm check:changes passed.
fallow health --complexity on src/session.ts and src/session/store.ts found no function over the
configured ceilings.
check:changes reported one advisory 5-line SET-shape clone between tests/helpers/authentication.ts and
tests/helpers/session.ts. That SET shape already existed before this slice. The new-only gate reported
it as a warning and exited successfully. It was not extracted and no threshold was weakened.

Manual results:
An uncommitted probe imported only the public session and tenant parents. Client A established two
sessions under 30/5. Client B read both with the same usable labels, deadlines, and warnings. Changing
the selected tenant file to 12/0 did not change unread-refreshed deadlines. continue-session through B
renewed the first session to the 12-minute warning-0 policy, and A observed that same public result.
The second session stayed on 30/5 until its own qualifying refresh. unrelated-background-traffic left
the renewed deadline unchanged. At that exact deadline, qualifying activity returned NoUsableSession
for both clients, and a later timeout increase did not revive it. A fractional timeout file was
rejected by TenantConfigService with status 404 before an effective policy existed. The probe passed
once and was deleted with its temporary runner config.

Cleanup completed:
The probe disposed both runtimes and removed its two sessions through public expiration. Integration
tests removed only their owned keys and closed both clients. Shared Redis was not flushed. Compose was
not started or stopped. git status after probe deletion showed no probe, transcript, credential, or
generated report.

Limitations or skipped cases:
Requirements BDD was not added. No browser or rendered session page was exercised; this slice has no
session-store UI. Application routes, warning accessibility, cross-tab behavior, logout, and HTTP
enforcement remain #154–#158. The #219 fixture was reused and does not establish that coverage.
No durable log, span, attribute, telemetry-payload, or exporter test was added. session.id remains
annotated only when a session is usable. Effect time is not Redis time. Outage recovery remains #221.
The Compose image pin is 8.10.3 while the evidence store was the already-running 8.10.2. Source union
order is sorted for repository lint; the accepted activity sets and policy?: never are unchanged.
Issue #220 server-side renewal and expiration evidence for this slice is satisfied. The issue was not
closed, and running-application evidence remains outside this implementation.
```
