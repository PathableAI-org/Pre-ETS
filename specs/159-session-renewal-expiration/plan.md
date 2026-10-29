# Implementation Plan: Renew and Expire Authoritative Sessions

**Branch**: `159-session-renewal-expiration-plan` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/159-session-renewal-expiration/spec.md`

## Summary

Extend the existing `packages/frontend-services` session capability so tenant-bound consumers can present a closed,
semantic activity category and atomically refresh a still-usable Redis session under the tenant's current validated
policy. The same store boundary will make expiration an atomic state transition: operations received strictly before
the stored deadline may renew, while equality, lateness, a winning expiration operation, missing state, and excluded
activity cannot revive or alter the session. The existing public outcome and error vocabulary, tenant configuration
owner, runtime composition, and version-1 stored record remain in place.

## Technical Context

**Language/Version**: TypeScript 6.0.3, strict NodeNext ESM

**Primary Dependencies**: Effect 4.0.5, `@effect/platform-node` 4.0.5, `redis` 6.3.0

**Storage**: Redis 8.10.2 through the existing private session store and owned, hashed session keys

**Testing**: Vitest 5.0.5, `@effect/vitest` 4.0.5, `@fast-check/vitest` 0.5.0, Effect `TestClock`, and the pinned real
Redis Compose service

**Target Platform**: Node.js frontend-services process used by the Next.js frontend

**Project Type**: Private ESM workspace library in the existing web application monorepo

**Performance Goals**: No new quantitative target; each read/expiration evaluation and qualifying renewal uses one
atomic Redis operation rather than an application-level read/write sequence

**Constraints**: The encoded deadline and Effect clock remain authoritative; Redis TTL is cleanup only. Equality is
expired. The atomic script completes full stored-record validation, tenant admission, and result/replacement
construction before any write, then performs at most one final `DEL` or `SET ... PX`. Tenant mismatch takes precedence
over expiration for tenant-bound refresh and fails closed without mutation. No PHI, credentials, tokens, raw
references, keys, or stored records may enter public errors, durable evidence, or telemetry. Receipt time determines
renewal eligibility, but the parent must sample Effect clock again after storage and before exposing identity.

**Scale/Scope**: One existing public session service, its private Redis child and test adapter, the real tenant-policy
consumer, deterministic unit/property evidence, and bounded two-client Redis integration evidence

## Constitution Check

_GATE: Passed before Phase 0 research and re-checked after Phase 1 design._

| Principle or constraint                       | Gate result                                                                                                                                                                                                                         |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Evidence-grounded specification            | Pass. The plan follows issue #220, the accepted current-`origin/main` requirements, [spec.md](spec.md), and [verification.md](verification.md). No source authority is edited or expanded.                                          |
| II. Explicit ownership and authoritative data | Pass. Temporary session state stays in the frontend-services-owned Redis module; no backend or durable domain state is introduced.                                                                                                  |
| III. Tenant isolation                         | Pass. Renewal is exposed only as a tenant-bound operation, validates the stored tenant before mutation, and never accepts policy from an unvalidated tenant document.                                                               |
| IV. Accessible, server-rendered UI            | Not applicable. This slice changes no UI or browser event production; warning presentation and interaction remain #155–#156.                                                                                                        |
| V. Meaningful behavioral tests                | Pass. Evidence begins at public services, adds a real two-client Redis boundary where atomicity matters, and keeps feature/manual observations distinct from module-contract evidence. No durable telemetry assertions are planned. |
| VI. Simplicity and verifiable quality         | Pass. The design extends the existing parent/private-child modules, stored schema, dependencies, runtime, and error vocabulary. It adds no package, public service, dependency, tombstone, or speculative provider.                 |
| Effect and module routing                     | Pass. The installed Effect 4.0.5 declarations and relevant local Effect v4 guidance were checked. The existing host-owned runtime is reused and only the owning parent imports session children.                                    |

The post-design re-check found no exception requiring Complexity Tracking. The public contract is narrower than an
HTTP or DOM-event contract, the private atomic operation is required by FR-002/FR-007/FR-009, and all downstream UI,
HTTP, recovery, and invalidation work remains outside this plan.

## Project Structure

### Documentation (this feature)

```text
specs/159-session-renewal-expiration/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── verification.md
└── contracts/
    └── modules.md
```

`tasks.md` is intentionally deferred to `$speckit-tasks` after the specification and plan stack is approved.

### Source Code (repository root)

```text
packages/frontend-services/
├── src/
│   ├── session.ts                  # public session contract and lifecycle orchestration
│   ├── session/
│   │   ├── codec.ts                # unchanged StoredSessionV1 encoding/decoding
│   │   └── store.ts                # private atomic Redis read/expire/refresh operations
│   ├── tenant.ts                   # unchanged public tenant configuration consumer
│   └── runtime.ts                  # unchanged host-owned runtime composition
└── tests/
    ├── helpers/
    │   └── session.ts              # faithful memory Redis script behavior/failure controls
    ├── lib/
    │   ├── session.test.ts         # public contract, time, activity, outcome, property evidence
    │   ├── session-policy-refresh.test.ts # real tenant-consumer composition evidence
    │   └── tenant-policy.test.ts   # existing invalid-policy consumption evidence
    ├── unit/
    │   ├── authentication-entry-failures.test.ts # migrate complete SessionService doubles
    │   └── reference-session-enforcement.test.ts # migrate complete SessionService doubles
    └── integration/
        └── session-redis.test.ts   # independent-client real Redis ordering evidence
```

**Structure Decision**: Preserve the recursive session module. `session.ts` remains the only public session boundary;
only it imports the private codec/store children. `TenantConfigService` continues to own policy validation and
defaulting. `session-request.ts`, `runtime.ts`, the package root export, Next.js application code, requirements BDD,
and backend/domain workspaces do not change for #220.

## Phased Engineering Design

### Phase 1 — Module architecture

Preserve `SessionService` as the frontend-services session owner and extend it with tenant-bound activity refresh.
Preserve `TenantConfigService` as the only owner of tenant-file decoding, policy validation, and defaulting. Extend the
private `SessionStore` child with atomic Redis evaluation needed by both expiration and renewal; keep
`StoredSessionV1` unchanged because deadline and warning policy already exist. Keep classification as a private helper
in `session.ts`; split another child only if implementation-time Fallow evidence identifies a concrete complexity
problem.

Current and downstream consumers use semantic activity categories rather than DOM events or HTTP objects. The
frontend request adapters under #154–#156 will map their trusted provenance to those categories and obtain the current
effective policy through `TenantConfigService`. This slice supplies the service/store capability and evidence without
premature application wiring.

### Phase 2 — Public module contracts

[contracts/modules.md](contracts/modules.md) records the exact `RefreshSessionForTenantInput` union and
`SessionService.refreshForTenant` signature. Qualifying variants require the current validated
`EffectiveSessionPolicy`; excluded variants declare `policy?: never`, so non-literal excluded inputs cannot carry
policy and therefore cannot accidentally adopt it. Every
variant carries `tenantAlias`, and stored-tenant mismatch returns the existing fieldless `SessionTenantMismatch`
without mutation. Missing/expired state remains `NoUsableSession`; store, codec, script, and unknown-result failures
remain the existing fieldless `SessionServiceUnavailable`.

The tenant module's relevant signatures are recorded as preserved, not newly exported. There is no new public
service, root-package re-export, provider contract, error type, or stored-record version. Existing callers remain
source-compatible, while every complete `SessionService["Service"]` implementation or test double must add the new
required member; the known doubles in both unit-test files named above are part of this migration.

### Phase 3 — Module contract evidence

Evidence starts from the public consumer claims in [contracts/modules.md](contracts/modules.md): deterministic
`@effect/vitest` examples and bounded properties cover all activity literals, policy adoption, before/equal/after
boundaries, missing/malformed/failure outcomes, tenant mismatch, and non-revival. Malformed-state cases prove the
stored bytes remain unchanged, and an expired record belonging to another tenant proves mismatch precedence and
non-mutation. A controlled delayed-store case advances Effect time across the returned deadline before the storage
result completes and proves the parent returns `NoUsableSession`. A controlled commit-then-fail case proves a late
failure returns `SessionServiceUnavailable`, does not retry stale policy, and leaves the eventual state observable only
through a later public read. A real tenant consumer test proves that selected configuration supplies effective policy
and rejects invalid policy before refresh. The memory Redis helper must model the installed script API and atomic state
transitions faithfully, but tests continue to import only public parent modules.

Real Redis evidence uses two independently scoped clients/runtimes with one scenario-owned prefix. Bounded dispatch
gates exercise two distinct schedules: release and observe renewal before expiration dispatch, then invert the gates
so expiration completes before renewal dispatch. Each case asserts both operation results and later reads from both
clients. A third mandatory overlapping case holds both clients at one start barrier, releases both dispatches without
awaiting either result, bounds both completions, accepts either permitted winner, asserts both operation outcomes, and
confirms later reads from both clients converge. The overlapping case cannot replace either forced ordering, and the
forced orderings cannot replace actual overlap. Bounded generated inputs and schedules support only the exercised
cases; they are not a proof of all deployment timing. A separate real-Redis case stores an otherwise valid record with
a valid tenant and future deadline but an invalid or missing identity field, invokes public refresh, and asserts
`SessionServiceUnavailable` plus byte-for-byte unchanged storage and no TTL reset or extension.

### Phase 4 — Implementation architecture

Implement public-contract types and initially failing evidence before private behavior. For every read or refresh,
sample authoritative receipt time from Effect `Clock`, validate the opaque reference, and execute one private Redis
script that reads the current payload and linearizes the applicable transition. After a usable store result returns,
sample Effect clock again and compare that fresh time with the returned deadline before annotating or exposing identity.
The script will:

1. return missing when the key does not exist;
2. decode and validate the complete exact `StoredSessionV1` shape and constraints, failing without mutation when any
   field, type, constraint, version, or excess property is invalid;
3. for tenant-bound refresh, compare the stored tenant before deadline evaluation and return mismatch without changing
   even an already-expired record;
4. prepare the complete internal result and, where applicable, the fully encoded replacement plus TTL before any
   mutation;
5. for a tenantless read or tenant-matching refresh, return expired and perform one final `DEL` when `deadline <= now`;
6. return the unchanged record for excluded activity; or
7. for qualifying activity, perform one final `SET ... PX` with the prepared complete record so deadline and warning
   policy change together.

The script performs no write during preparation and never relies on rollback: malformed input or failed preparation
returns an internal failure before a mutation is issued. Once its one final mutation is issued, a later transport or
result-decoding failure may leave committed state while the parent returns `SessionServiceUnavailable`; the service
does not retry stale input, and callers must use a later public read to determine the authoritative state. The parent
strictly decodes every returned payload/result and annotates only results that remain usable at the fresh post-storage
clock sample with the existing transient `session.id`. Redis TTL may outlive the encoded deadline by command latency
but can never authorize identity because every public read rechecks the encoded deadline after storage. No retry may
apply a stale policy after another transition wins.

Implementation order:

1. Inspect Fallow zones for the changed session source and tests.
2. Add the public activity/input contract, update complete `SessionService["Service"]` doubles in
   `tests/unit/reference-session-enforcement.test.ts` and `tests/unit/authentication-entry-failures.test.ts`, and add
   initially failing public-boundary evidence.
3. Extend the memory Redis helper with faithful script loading/evaluation and bounded failure controls.
4. Add private atomic read/expire/refresh storage behavior and exhaustive result decoding.
5. Compose it in `SessionService` using Effect clock, tenant binding, validated policy inputs, and existing errors.
6. Add deterministic example/property/concurrency tests, including malformed-record and expired-mismatch
   non-mutation, a delayed storage result that crosses the returned deadline, a commit-then-fail result with no retry,
   and tenant-consumer composition evidence.
7. Add a real-Redis malformed-record non-mutation case, plus two-client evidence that separately gates renewal-first
   and expiration-first dispatch and a mandatory start-barrier case that releases both operations without awaiting
   either; assert both operation results and confirm convergence from both clients in all three race cases.
8. Run the manual procedure, feature-specific checks, and all repository quality gates, recording only safe results.

### Phase 5 — Feature verification integration

[verification.md](verification.md) remains the approved claim map; [quickstart.md](quickstart.md) turns it into
implementation-aware commands and a manual execution record. Unit evidence establishes V-001–V-005, V-007, V-008,
and V-010 at the public capability. Real Redis evidence establishes the distributed ordering portion of V-002,
V-003, V-005, V-006, V-008, and V-010. Tenant-consumer evidence establishes V-003 and V-009. The mandatory manual
procedure observes independent clients, policy adoption, excluded activity, exact-deadline rejection, invalid policy,
and owned cleanup.

Requirements BDD is not completion evidence because the running-application boundary and browser activity producers
belong to #154–#156. Real-store outage/recovery belongs to #221. Passing static checks or merging planning artifacts
will not be reported as runtime feature evidence.
