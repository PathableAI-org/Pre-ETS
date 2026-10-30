# Implementation Plan: Complete Session Invalidation and Failure Behavior

**Branch**: `160-session-invalidation-failures-plan` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/160-session-invalidation-failures/spec.md`

## Summary

Extend the existing `packages/frontend-services` session capability with explicit invalidation of one opaque session
reference. The public operation will validate only the reference shape, ask the existing private Redis store to
atomically delete the corresponding hashed key, and return the existing fieldless `NoUsableSession` for every
successful terminal outcome. Missing, malformed, expired, previously invalidated, and successfully removed state need
no retained cause distinction. Store transport or reply failure remains the distinct fieldless
`SessionServiceUnavailable`; the service does not retry or claim whether an indeterminate delete committed.

Redis command serialization on the one addressed key is the invalidation/renewal linearization boundary. If renewal
wins first, invalidation deletes its replacement; if invalidation wins first, renewal sees missing state and cannot
recreate it. Existing atomic expiration/renewal behavior remains authoritative. Independent-client, controlled
failure, and real-Redis race evidence establish the service/store slice. A manual bounded reference-consumer journey
adds a distinct composed observation without adding logout UI, application-wide enforcement, fresh-provider recovery,
or a general revocation system.

## Technical Context

**Language/Version**: TypeScript 6.0.3, strict NodeNext ESM

**Primary Dependencies**: Effect 4.0.5, `@effect/platform-node` 4.0.5, `redis` 6.3.0

**Storage**: Redis 8.10.3 through the existing private session store and owned, SHA-256-addressed session keys

**Testing**: Vitest 5.0.5, `@effect/vitest` 4.0.5, deterministic memory Redis scenarios, the pinned real Redis
service, and a temporary uncommitted manual probe around the existing bounded reference consumer

**Target Platform**: Node.js frontend-services process used by the Next.js frontend

**Project Type**: Private ESM workspace library in the existing web application monorepo

**Performance Goals**: No new quantitative target; one invalidation issues one single-key atomic Redis `DEL` and no
application-level read/delete sequence

**Constraints**: The opaque reference is validated before store access and is never exposed through errors or
telemetry. A valid reference addresses exactly one hashed key. `DEL` count `0` and `1` are successful terminal states;
any other reply is unavailable. No record decode, tombstone, cause-retention record, automatic retry, replacement
session, policy/deadline response, or new telemetry attribute is permitted. A transport failure after Redis accepts a
delete may leave the committed state unknown to the caller; a later public read determines authoritative state.

**Scale/Scope**: One existing public session service, its private Redis child and memory adapter, known complete
service doubles, deterministic public-contract evidence, bounded two-client Redis integration, and one manual #219
reference-consumer observation

## Constitution Check

_GATE: Passed before Phase 0 research and re-checked after Phase 1 design._

| Principle or constraint                       | Gate result                                                                                                                                                                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Evidence-grounded specification            | Pass. The plan follows issue #221, accepted requirements at current `origin/main` `c62c521152c7c8e3869a1575c4c1b3b07c481e8b`, [spec.md](spec.md), and [verification.md](verification.md). No authority or sibling Spec Kit record is edited.                |
| II. Explicit ownership and authoritative data | Pass. Temporary session state remains owned by frontend-services and its private Redis store; no backend or durable domain state is introduced.                                                                                                             |
| III. Tenant isolation                         | Pass. Invalidation accepts only an opaque reference, exposes no identity, tenant, policy, or existence distinction, and cannot create or admit a session. Tenant-bound reads and renewal keep their existing mismatch checks.                               |
| IV. Accessible, server-rendered UI            | Not applicable. This slice changes no UI or browser interaction. Logout coordination and recovery presentation remain #155–#157.                                                                                                                            |
| V. Meaningful behavioral tests                | Pass. Automated evidence starts at the public service and adds real Redis only for adapter/ordering claims. The existing bounded application consumer is reserved for a distinct manual composed observation. Durable telemetry assertions are excluded.    |
| VI. Simplicity and verifiable quality         | Pass. The design extends the existing parent/private-child modules and outcome vocabulary. It adds no package, public service, dependency, stored schema, tombstone, retry policy, or speculative provider.                                                 |
| Effect and module routing                     | Pass. Installed Effect 4.0.5 declarations and the local Effect v4 guidance were checked. The existing host-owned runtime and `Redis.Redis` service are reused; only `session.ts` imports private session children. Fallow reports no configured zones here. |

The post-design re-check found no exception requiring Complexity Tracking. A single-key `DEL` is sufficient because
Redis serializes it with the existing one-key renewal script; decoding a record or adding a new lifecycle script would
increase failure surface without changing the public guarantee. Application/browser/provider work remains outside
this plan.

## Project Structure

### Documentation (this feature)

```text
specs/160-session-invalidation-failures/
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
│   ├── session.ts                  # extend public session contract/orchestration with invalidate
│   ├── session/
│   │   ├── codec.ts                # unchanged reference and StoredSessionV1 codecs
│   │   └── store.ts                # add private single-key delete operation and strict reply decode
│   ├── session-request.ts          # unchanged bounded request reader
│   └── runtime.ts                  # unchanged host-owned runtime composition
└── tests/
    ├── helpers/
    │   └── session.ts              # add faithful DEL and post-mutation failure controls
    ├── lib/
    │   └── session.test.ts         # public invalidation, outcome, failure, and non-retry evidence
    ├── unit/
    │   ├── authentication-entry-failures.test.ts # migrate complete SessionService doubles
    │   └── reference-session-enforcement.test.ts # migrate complete SessionService doubles
    └── integration/
        └── session-redis.test.ts   # independent-client, race, and real outage evidence
```

**Structure Decision**: Preserve the recursive session module. `session.ts` remains the public owner and the only
module that imports private `session/*` children. `session/store.ts` owns Redis key construction and deletion.
`session/codec.ts`, `session-request.ts`, runtime composition, root package exports, Next.js production code,
requirements Gherkin, and backend/domain workspaces do not change. The existing bounded reference consumer may call
the public service only through temporary uncommitted manual probe support; it must not import the private store or
codec.

## Complexity Tracking

No constitution violation or approved exception is required.

## Phased Engineering Design

### Phase 1 — Module architecture

Preserve `SessionService` as the frontend-services owner of temporary session identity and lifecycle outcomes. Extend
it with one explicit invalidation operation for an opaque reference. Preserve the existing `NoUsableSession` and
`SessionServiceUnavailable` vocabulary so downstream consumers can distinguish successful termination from service
failure without learning whether a reference existed, was malformed, expired, or had already been removed.

Extend the private `SessionStore` child with a single-key delete capability. The store already owns key hashing,
prefix configuration, Redis access, and private failure translation; moving invalidation elsewhere would duplicate
addressing and breach recursive ownership. Preserve `StoredSessionV1` and its codec because invalidation neither reads
nor rewrites a record. Preserve the existing renewal script: Redis serializes its one-key transition with `DEL`, which
provides the required linearization without a second script or tombstone.

The existing #219 reference consumer supplies the distinct manual composed observation. Temporary uncommitted probe
support may invalidate through the public service while the consumer is running; no durable fixture extension is
planned. Production application adapters, cookie clearing, logout controls, recovery pages, and provider freshness
remain downstream.

### Phase 2 — Public module contracts

[contracts/modules.md](contracts/modules.md) records the exact `SessionService.invalidate` signature. The input is
structurally identical to `read`: `{ readonly reference?: string }`. A missing or malformed reference returns
`NoUsableSession` without store access. A valid reference whose key is removed or absent also returns the same
fieldless outcome. Store transport failure, an unexpected delete count, or an unknown reply remains the existing
fieldless `SessionServiceUnavailable`.

The operation never returns `UsableSession`, policy, deadline, tenant, identity, cause, deletion count, or proof that
an indeterminate delete committed. No new public input type, error class, service, root-package re-export, environment
requirement, or stored-record version is needed. Existing callers remain source-compatible, while every complete
`SessionService["Service"]` implementation or test double must add the required `invalidate` member.

### Phase 3 — Module contract evidence

Public-service `@effect/vitest` scenarios exercise absent, malformed, unknown, current, expired, and malformed stored
state through `invalidate`; only valid opaque references reach Redis. Successful current or malformed stored state is
removed and maps to fieldless `NoUsableSession`. Missing/already removed state maps to the same result. A controlled
command failure maps to fieldless `SessionServiceUnavailable`. A commit-then-fail control proves the service does not
retry or report success; a later public read—not the failed call—determines whether the delete committed. Existing
read/refresh outcome tests remain the evidence that only `UsableSession` carries identity, policy, and deadline.

Real Redis evidence uses independently scoped clients with one scenario-owned prefix. Client A establishes, client B
reads and invalidates, and both later read/refresh attempts return `NoUsableSession`. Three race schedules are
distinct: renewal completes before invalidation dispatch; invalidation completes before renewal dispatch; and both
operations cross a start barrier before either is awaited. Renewal may return usable only when it linearizes before
invalidation, but every completed schedule must end with both clients observing no usable state. Existing #220
expiration/renewal tests remain authoritative and are retained rather than duplicated.

A disconnected real adapter exercises read, refresh, and invalidate failure through the public service. Healthy
re-evaluation after the controlled outage is required because a failure does not claim mutation status. The manual
procedure reuses the bounded reference consumer with temporary uncommitted public-service invalidation support,
showing success before invalidation, denial afterward, and explicit failure during a dedicated-store outage. Those
composed observations are not duplicated in automated evidence.

### Phase 4 — Implementation architecture

Implement the public member and initially failing public evidence before private behavior. `SessionService.invalidate`
will decode the optional reference with the existing reference codec. An invalid result immediately returns the
shared `NoUsableSession`. A valid result calls `SessionStore.invalidate({ reference })`, translates private failure
through the existing redacting `serviceUnavailable`, and returns `NoUsableSession` for either private success outcome.
It adds no `session.id` annotation because invalidation exposes no usable identity.

`SessionStore.invalidate` computes the existing prefixed SHA-256 key and issues one `redis.send("DEL", key)` command.
It accepts only numeric reply `0` (`missing`) or `1` (`removed`); any other reply becomes `SessionStoreUnavailable`.
Redis command atomicity and per-key serialization with the existing script ensure:

1. renewal before invalidation may return its renewed session, after which invalidation deletes that state;
2. invalidation before renewal leaves no key, so renewal returns missing and cannot create one;
3. expiration before invalidation is already terminal, and invalidation observes missing;
4. invalidation before an expiration/read transition leaves no key, so that operation also observes missing; and
5. after invalidation completes successfully, no later operation on the old reference can recreate authenticated
   state because only `establish` creates records and it generates a fresh reference.

The service does not retry a failed delete. A failure after Redis applies `DEL` remains unavailable and indeterminate
to the caller. Controlled tests may inspect later public state, but public errors and retained evidence never expose a
raw reference, key, record, identity, or Redis diagnostic.

Implementation order:

1. Re-run Fallow guard for the exact changed source/tests and confirm recursive ownership.
2. Add `SessionService.invalidate`, update all complete service doubles, and add initially failing public-contract
   scenarios.
3. Extend the memory Redis helper with strict `DEL` replies, operation recording, and bounded before/after-mutation
   failure controls.
4. Add private `SessionStore.invalidate` using the existing key owner and compose it through the parent.
5. Add success, no-op, malformed-reference, malformed-stored-state deletion, service-failure, post-delete failure,
   no-retry, and no-protected-fields evidence.
6. Add real-Redis independent-client evidence, both forced invalidation/renewal orderings, actual overlap, and
   disconnected-adapter failure with healthy re-evaluation.
7. Prepare temporary uncommitted public-service invalidation support for the manual #219 consumer procedure without
   changing the retained fixture or its application-coverage claim.
8. Run the manual procedure, remove its temporary support, and run feature-specific checks and all repository quality
   gates, recording only safe results.

### Phase 5 — Feature verification integration

[verification.md](verification.md) remains the approved claim map; [quickstart.md](quickstart.md) turns it into
implementation-aware commands and a safe execution record. Public-service evidence establishes V-001, V-002, V-005,
V-007, and V-008. Real Redis evidence establishes V-001–V-004 and V-006–V-008 at the shared adapter boundary. The
mandatory manual bounded-reference procedure establishes the limited composed observation requested by the issue
without replacing #154's application-wide ownership or duplicating an automated fixture scenario.

Requirements-backed Gherkin is not completion evidence for this service/store slice. Browser logout coordination,
cookie clearing, recovery presentation, provider freshness, and comprehensive protected-request mapping remain
#154–#158. No durable log/span/attribute assertion is added. Passing static checks or merging the plan is not runtime
feature evidence.
