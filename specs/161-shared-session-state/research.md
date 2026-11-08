# Research: Shared Session State

**Feature**: [Shared Session State](./spec.md)

**Baseline inspected**: `origin/main` at `05a979783c422674f321a133d6747916c7911cc7`

## Decision 1: Treat the current implementation as a convergence baseline

**Decision**: Plan a parent conformance and evidence pass over the capabilities delivered by issue #153's child
increments. Change production code only when comparison to V-001–V-012 reveals a concrete gap.

**Rationale**: Current `origin/main` already contains tenant policy, distributed session establishment/read,
tenant-bound admission, renewal/expiry, invalidation, race handling, service-failure outcomes, and a bounded reference
consumer. Recreating those capabilities would add review risk without a new consumer. Prior child execution records
are revision-specific and fragmented, so they cannot by themselves close the new parent contract.

**Alternatives considered**:

- Rebuild a parent session subsystem: rejected because it duplicates delivered behavior and violates narrow change.
- Treat merged child PRs or passing counts as current proof: rejected because the parent claims require exact-revision,
  boundary, result, cleanup, and limitation attribution.
- Make no implementation branch: rejected because current conformance and the composed manual feature observation
  still require an implementation-phase evidence record.

## Decision 2: Preserve recursive module ownership

**Decision**: Preserve `tenant.ts` with private `tenant/config.ts`; preserve `session.ts` with private
`session/codec.ts` and `session/store.ts`; preserve `session-request.ts` as the bounded host adapter.

**Rationale**: The existing parents align with actual consumers. Tenant policy is consumed by callback establishment
and refresh. The session parent owns the stable error/outcome vocabulary while its children own untrusted record
encoding and Redis mechanics. The Next.js app needs only request admission, not the raw Effect service or store.

**Alternatives considered**:

- Extract a policy service or shared policy package: rejected because there is no second independently owned package
  consumer and the current structural handoff is sufficient.
- Promote `SessionStore` or stored record types: rejected because no consumer should depend on Redis keys, payloads,
  or transport errors.
- Widen the root package exports to include every lifecycle operation: rejected because current application consumers
  need only the bounded read adapter; later integration owns renewal/logout/recovery entry points.

## Decision 3: Keep the current session record deliberately narrow

**Decision**: Retain one versioned transient record containing issuer, subject, tenant alias, authoritative idle
deadline, effective warning lead, and a safe telemetry correlation identifier. Address it by an opaque reference whose
Redis key is a one-way digest.

**Rationale**: These fields are the minimum state authorized by the issue. They support identity, tenant isolation,
deadline authority, warning-policy handoff, and safe correlation without becoming arbitrary storage.

**Alternatives considered**:

- Store tokens, arbitrary application values, provider evidence, or domain objects: rejected as out of scope and an
  ownership/privacy violation.
- Add tombstones or legacy dual-read state: rejected because invalidation finality and freshness selection do not
  require retained causes, and no migration is authorized.
- Expose raw records or references in evidence: rejected because retained evidence needs semantic outcomes only.

## Decision 4: Preserve the atomic single-key Redis transition

**Decision**: Continue to use `SET NX PX` for creation, `DEL` for explicit invalidation, and one decoded Lua transition
for read, deadline expiry, tenant admission, excluded activity, and qualifying refresh.

**Rationale**: The transition validates current state and performs at most one final mutation, so expiry/refresh races
and tenant mismatch do not rely on process-local locks or creator affinity. Redis TTL cleans ended records; the stored
deadline and operation time remain the authority.

**Alternatives considered**:

- Client-side GET/check/SET sequences: rejected because they permit race windows and revival.
- Distributed locks or a second coordination key: rejected because one addressed record supports the required atomic
  decision without new lifecycle state.
- Trust `.withReturnType` as runtime validation: rejected; it only refines TypeScript. Replies remain decoded from
  `unknown`, and malformed replies map to service failure.

## Decision 5: Preserve stable, fieldless public failures

**Decision**: Keep `NoUsableSession`, `SessionTenantMismatch`, and `SessionServiceUnavailable` distinct. Translate
codec, Redis, malformed-reply, and exhausted-collision failures at the session parent without exposing causes, keys,
references, identity, or records.

**Rationale**: Consumers must deny access while distinguishing absence/ended state, tenant mismatch, and infrastructure
failure. Fieldless expected errors reduce accidental disclosure and prevent lower-level transport vocabulary from
becoming public compatibility.

**Alternatives considered**:

- Map outages to absence or login: rejected because it hides failure and can produce unsafe recovery behavior.
- Publish raw Redis/Schema errors: rejected because they leak private implementation and may contain sensitive state.
- Retry ambiguous invalidation/refresh writes: rejected because a lost reply does not prove whether the mutation
  applied; blind retry can misstate or change the outcome.

## Decision 6: Reuse the host-owned Effect runtime and installed APIs

**Decision**: Retain `Context.Service`, `Schema.TaggedError`, Effect clock, Layer composition, NodeRedis scoped
resources, Redis scripts, and the single host-owned `ManagedRuntime` as used by current code.

**Rationale**: Installed Effect 4.1.2 declarations support these patterns. `Layer.provide` keeps Redis private,
`Layer.provideMerge` retains selected process services, and the production host warms, publishes, and disposes one
runtime. Constructing a runtime per request would fragment resources and lifecycle.

**Alternatives considered**:

- Copy exact APIs from the local Effect documentation checkout: rejected because that checkout is version 4.0.5 and
  materially drifts from installed 4.1.2 declarations outside the clock surface.
- Use `Date.now` inside service workflows: rejected because the Effect clock is replaceable in deterministic tests.
- Add another runtime or Redis provider: rejected because the process already owns and disposes the required resources.

## Decision 7: Layer evidence by uncertainty

**Decision**: Use public tenant/session scenarios for semantics, Fast-Check for useful policy/tenant invariants,
independently scoped real Redis clients for shared-state and race uncertainty, an owned isolated Redis project for
outage behavior, bounded adapter tests for V-011, and one temporary composed parent probe for the feature lifecycle.

**Rationale**: No single test boundary can meaningfully establish all claims. The selected boundaries localize failure
and avoid duplicating the same assertion at every layer. The manual procedure adds a composed observation rather than
another test count.

**Alternatives considered**:

- Add requirements BDD for service/store claims: rejected because comprehensive protected HTTP/browser behavior is
  downstream; a dry run would establish discovery only.
- Put outage mutation in required CI or stop shared Redis: rejected because the outage suite is destructive to its
  own store and must remain isolated and opt-in.
- Assert logs, spans, or exporter payloads: rejected because no observability claim is authorized and durable telemetry
  assertions are prohibited.

## Resolved implementation facts and limitations

- Product pins are Effect, platform-node, and Effect Vitest 4.1.2; Redis client 6.3.1; TypeScript 6.0.3; Node 26+.
- Current Compose, CI, and the outage suite use Redis 8.10.3. `docs/docker-compose.md` still names 8.10.2; this is
  documentation drift, not authority to plan an older execution environment.
- Independent real-Redis clients are separate `ManagedRuntime`/NodeRedis scopes in one test process, not independently
  running authenticated applications.
- The retained two-process reference harness has a deliberately skipped confirmed-fresh success path pending B6. A
  fixture can establish bounded reference behavior but cannot prove real provider freshness.
- Finite ordered/released races do not prove every interleaving, and operation time from one Effect clock does not
  prove distributed-clock behavior.
- Prior child quickstarts may guide execution, but only results rerun or explicitly attributed to the exact parent
  implementation revision may support closure.

## Open questions

No unresolved product decision blocks this engineering plan. Any implementation discovery that changes authorized
behavior, delivery scope, or verification obligations must return to its owning workflow rather than become a plan
assumption.
