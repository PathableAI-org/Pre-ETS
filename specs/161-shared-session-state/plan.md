# Implementation Plan: Shared Session State

**Branch**: `161-shared-session-state-plan` | **Date**: 2026-11-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/161-shared-session-state/spec.md`

**Approval gate**: [spec.md](./spec.md) and [verification.md](./verification.md) are proposed review inputs in PR
#323. Task generation and implementation remain gated on human approval of that specification PR and this plan.

## Summary

Converge the session capabilities already delivered through issue #153's child increments against the parent
shared-session contract and produce revision-attributable closure evidence. Preserve the existing
`packages/frontend-services` tenant-policy, session, bounded-request, and host-owned runtime boundaries. The
implementation phase first audits the current code against the contracts in [contracts/modules.md](./contracts/modules.md),
changes production code only for a concrete uncovered contract gap, reruns deterministic and real-Redis evidence,
and executes one temporary composed lifecycle probe. It does not create another session service, widen the package
surface, or claim downstream application, browser, recovery, or provider behavior.

## Technical Context

**Language/Version**: TypeScript 6.0.3 on Node.js 26 or later, private ESM workspaces

**Primary Dependencies**: Effect 4.1.2, `@effect/platform-node` 4.1.2, `@effect/vitest` 4.1.2, Redis client 6.3.1,
Next.js 16.4.5 at the bounded host adapter

**Storage**: Redis 8.10.3 transient, single-key session records; no Postgres or durable domain storage

**Testing**: Vitest 5.1.0, `@effect/vitest`, Fast-Check, real-Redis integration suites, an opt-in isolated Redis
outage suite, bounded Next.js adapter tests, and one temporary uncommitted manual probe

**Target Platform**: Node.js frontend process on Linux-compatible hosts, with Redis reachable through the existing
production runtime configuration

**Project Type**: pnpm monorepo; Effect frontend-services library consumed by a separate SSR Next.js process

**Performance Goals**: No new throughput target. Preserve one addressed Redis key per session and one atomic
server-side transition for read/expiry/tenant admission/refresh so request races do not require process affinity.

**Constraints**: Fail closed; no session revival at or after the deadline; no arbitrary application values, tokens,
credentials, PHI, or durable domain records; host-only browser reference; no durable telemetry assertions; no new
provider interface, runtime, package, or public export without a current consumer.

**Scale/Scope**: One parent delivery slice covering the current `TenantConfigService`, `SessionService`, private
Redis adapter/codec, `readSessionRequest`, and their existing bounded reference consumers. Comprehensive application
protection and independently running authenticated-application evidence remain outside this plan.

## Constitution Check

_GATE: Passed before research and re-checked after design._

| Principle                                     | Result                       | Design response                                                                                                                                                                                      |
| --------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Evidence-grounded specification            | Pass                         | The plan consumes issue #153, current `origin/main` requirements, `spec.md`, and `verification.md` without changing their behavior or scope. Historical child results are inputs, not current proof. |
| II. Explicit ownership and authoritative data | Pass                         | Temporary session state stays in `packages/frontend-services` and Redis. No backend or durable-domain ownership changes are proposed.                                                                |
| III. Tenant isolation                         | Pass                         | Tenant-bound establishment, admission, refresh, and mismatch remain in the existing public session contract; no reference alone grants identity.                                                     |
| IV. Accessible, server-rendered UI            | Not applicable to new design | The feature retains only the existing bounded SSR reference consumer. No UI or `@pathableai/react` change is planned, and browser warning/accessibility behavior remains downstream.                 |
| V. Meaningful behavioral tests                | Pass                         | Each verification claim maps to a responsible public or real-infrastructure boundary. Manual composed evidence remains distinct from durable tests and includes cleanup and limitations.             |
| VI. Simplicity and verifiable quality         | Pass                         | Existing modules and dependencies are preserved. Production changes occur only if conformance identifies a concrete gap; all expected checks and evidence limits are explicit.                       |

Post-design re-check: the contracts add no new workspace, dependency, service, public package export, runtime, durable
store, or telemetry assertion. All gates remain passed.

## Project Structure

### Documentation (this feature)

```text
specs/161-shared-session-state/
├── spec.md
├── verification.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── modules.md
└── checklists/
    └── requirements.md
```

`tasks.md` is intentionally deferred to the implementation branch.

### Source Code (repository root)

```text
packages/frontend-services/
├── src/
│   ├── tenant.ts                  # public tenant module and policy consumer
│   ├── tenant/config.ts           # private tenant document/policy schema
│   ├── session.ts                 # public shared-session service
│   ├── session/codec.ts           # private reference and record codec
│   ├── session/store.ts           # private Redis adapter and atomic transition
│   ├── session-request.ts         # bounded Next.js request adapter
│   ├── runtime.ts                 # application service composition
│   └── production-runtime.ts      # host-owned runtime acquisition/disposal
└── tests/
    ├── lib/
    │   ├── tenant-policy.test.ts
    │   ├── session-policy-refresh.test.ts
    │   └── session.test.ts
    ├── integration/
    │   ├── session-redis.test.ts
    │   └── session-redis-outage.test.ts
    └── unit/reference-session-enforcement.test.ts

packages/frontend/
├── src/app/(app)/
│   ├── page.tsx
│   └── actions.ts
└── tests/unit/reference-session-enforcement.test.ts

tests/bdd/session/reference-session-enforcement.test.ts  # retained partial downstream harness
```

**Structure Decision**: Preserve the existing recursive module ownership. `tenant.ts` alone imports
`tenant/config.ts`; `session.ts` alone imports `session/codec.ts` and `session/store.ts`; external Next.js consumers
use only the root package adapter. The implementation phase may refine evidence or close a concrete gap inside these
owners, but it must not move private children across sibling boundaries or expose Redis details.

## Complexity Tracking

No constitution violations require justification.

## Phased Engineering Design

### Phase 1 — Module architecture

Preserve four current responsibilities:

1. `tenant.ts` owns tenant selection, document loading, and the effective session policy consumed by authentication
   and refresh workflows. Keep validation/default derivation in its private `tenant/config.ts` child; do not create a
   standalone policy service.
2. `session.ts` owns the public identity/lifecycle vocabulary and translates private codec/store failures into stable
   fieldless public outcomes. Keep record encoding and Redis mechanics private under `session/`.
3. `session-request.ts` remains the narrow framework adapter for the bounded reference page and action. It resolves
   the tenant before session admission and does not become comprehensive middleware or a general lifecycle API.
4. `runtime.ts` and `production-runtime.ts` continue to compose one process-owned `ManagedRuntime`. Redis remains a
   hidden infrastructure dependency; no runtime is constructed per request.

Current production behavior is the implementation baseline, not automatic evidence that the parent specification is
complete. The implementation branch performs conformance before deciding whether any source edit is warranted.

### Phase 2 — Public module contracts

[contracts/modules.md](./contracts/modules.md) freezes the current consumer-facing signatures for
`TenantConfigService`, `SessionService`, and `readSessionRequest`. It preserves the three-way distinction among usable
state, no usable state, and service failure; keeps tenant mismatch distinct; and keeps the package root surface narrow.
The installed Effect 4.1.2 declarations support the present `Context.Service`, `Schema.TaggedError`, `Clock`, Redis
script, Layer, and `ManagedRuntime` patterns. The older local Effect checkout is guidance only where it drifts from
installed declarations.

### Phase 3 — Module contract evidence

Contract evidence starts at actual consumers:

- Tenant-policy examples and properties exercise valid/default/disabled/rejected policy through
  `TenantConfigService`, not only a pure helper.
- Deterministic `SessionService` scenarios use the Effect test clock for establishment, policy adoption, excluded
  traffic, exact-deadline behavior, outcome separation, and no-retry failure semantics.
- Independently scoped NodeRedis clients exercise shared identity/state, real atomic transitions, ordered and released
  races, invalidation finality, and adapter failures against Redis.
- The dedicated outage suite owns and destroys its own Redis project; it never stops a shared development store.
- Bounded request and page/action tests establish only the retained reference consumer, not default application
  protection.

Finite schedules, one host clock, mock-backed adapters, and local outage injection retain the limitations stated in
`verification.md`. Passing test counts alone are not closure evidence.

### Phase 4 — Implementation architecture

Implement in this order:

1. Compare current `origin/main` source and tests to the frozen contracts and V-001–V-012. Record every supported
   claim, concrete gap, and intentional downstream limit.
2. If no gap exists, avoid product-code churn. If a gap exists within issue #153 authority, change only its owning
   parent/private child and add the smallest responsible evidence. A scope or acceptance conflict returns to the
   owning workflow.
3. Run tenant-policy, session-service, policy-refresh, and bounded-consumer unit evidence.
4. Run real-Redis integration with scenario-owned prefixes, then the opt-in isolated outage suite separately.
5. Execute the temporary composed parent probe described in [quickstart.md](./quickstart.md), delete it, and retain
   only safe semantic results attributed to the exact revision in the implementation-results section of that file.
6. Run package and repository quality gates. Do not change CI cadence, add BDD solely for component coverage, or add
   observability assertions.

Private implementation preserves Schema decoding at trust/storage boundaries, Effect clock access inside workflows,
one decoded Redis script reply, fieldless public errors, scoped NodeRedis acquisition, and host-owned runtime disposal.

### Phase 5 — Feature verification integration

[verification.md](./verification.md) is the proposed claim design pending human approval in PR #323.
[quickstart.md](./quickstart.md) supplies the implementation-aware commands, prerequisites, manual composed procedure,
cleanup, retained record, and claim-by-claim limitations. Task generation and implementation do not begin until a
human approves the specification PR and this plan. Automated module evidence and the manual feature observation remain
separate: the manual run composes two independent clients, two sessions adopting changed policy independently,
excluded and qualifying activity, invalidation/renewal overlap, and bounded outage denial. It does not claim real OIDC
freshness, comprehensive application enforcement, warning presentation, recovery, provider compatibility,
distributed-clock behavior, or all possible races.
