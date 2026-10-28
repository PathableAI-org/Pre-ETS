# Research: Renew and Expire Authoritative Sessions

## Evidence consulted

- Issue #220 and its accepted requirement/delivery authorities at `origin/main` revision
  `c1d87a22a55cd5190bc702a6a3c33cfed2ca23ef`.
- The existing `SessionService`, private codec/store, `TenantConfigService`, host runtime, deterministic session tests,
  memory Redis helper, and real Redis integration tests.
- Repository Effect and testing guidance, the full local Effect v4 `LLMS.md` at checkout
  `41cf29b5d7b5f52d269827ac2337a0ccf1b94426`, and installed Effect 4.0.5 declarations.
- Installed APIs for `Clock.currentTimeMillis`, `TestClock`, `Redis.script`/`Redis.eval`, `Effect.all`, child fibers,
  `Deferred`, `Latch`, and `@effect/vitest` properties.

## Decisions

### R-001 — Extend the existing session parent

**Decision**: Add tenant-bound activity refresh to `SessionService` and atomic state evaluation to its private
`SessionStore` child.

**Rationale**: The current parent already owns initialization, reads, tenant-bound reads, Effect clock use, codec
privacy, error redaction, and Redis composition. A new public service/package would split one lifecycle and create a
future-shaped boundary without a distinct consumer.

**Rejected**: A `SessionRenewalService`, package-root export, shared package, or provider interface.

### R-002 — Use a closed semantic activity union

**Decision**: Model the authorized positive and excluded categories as string-literal unions. Use a discriminated
input so only qualifying activity can carry the current effective policy.

**Rationale**: The service owns the closed classification required by FR-005/FR-006, while downstream adapters remain
free to map trusted page/form/browser provenance without exposing DOM events or HTTP request objects in the service.
The union prevents excluded traffic from accidentally adopting a policy.

**Rejected**: Caller-supplied booleans, arbitrary strings, DOM event names, and HTTP-method/path inference.

### R-003 — Require tenant binding at renewal

**Decision**: `refreshForTenant` requires `tenantAlias` and rejects mismatch with the existing
`SessionTenantMismatch` before mutation.

**Rationale**: Renewal necessarily combines stored identity with tenant-selected policy. Requiring the selected alias
at the public boundary prevents a valid reference from receiving another tenant's policy and follows the existing
tenant-bound read contract.

**Rejected**: A generic refresh that assumes an earlier tenant check or trusts only the session reference.

### R-004 — Linearize expiration and renewal in Redis

**Decision**: Use one-key Lua evaluation through the installed Effect Redis script API. Both public reads and refresh
operations pass the Effect-clock receipt time so the store can atomically observe the record and return missing,
expired, mismatch, unchanged, or renewed state. Expiration deletes the key; qualifying renewal replaces the complete
record and TTL in the same atomic operation.

**Rationale**: Application-level `GET` followed by `SET`, even with compare-and-replace, can expose expired state and
then allow a stale write. One atomic transition establishes an unambiguous winner across independent clients. Effect
clock remains the behavioral authority; TTL remains cleanup.

**Rejected**: Unconditional `GET`/`SET`, optimistic retry of stale policy, process locks, Redis `TIME` as policy
authority, retained tombstones, or grace windows.

### R-005 — Preserve StoredSessionV1

**Decision**: Reuse the existing fields and version. Renewal changes only `idleDeadlineEpochMilliseconds` and
`warningLeadMinutes`; identity, tenant, telemetry ID, and version stay together.

**Rationale**: All required state already exists. A refresh timestamp, previous policy, maximum lifetime, or
expiration marker has no authorized consumer.

**Rejected**: Schema version 2, token/provider fields, tombstones, and an absolute lifetime field.

### R-006 — Preserve public outcome and error semantics

**Decision**: Missing or expired state returns `NoUsableSession`; usable unchanged/renewed state returns
`UsableSession`; tenant mismatch and dependency/codec/script failure use the existing fieldless errors.

**Rationale**: The vocabulary already distinguishes no session, tenancy failure, and store failure without exposing
sensitive state. Unknown script results and malformed records fail closed as service unavailability.

**Rejected**: New expiration, conflict, retry, malformed-record, or Redis-specific public errors.

### R-007 — Keep policy ownership in TenantConfigService

**Decision**: Callers load the selected tenant configuration and pass `effectiveSessionPolicy(config)` only for a
qualifying refresh. The session service neither reads tenant files nor supplies defaults.

**Rationale**: Tenant configuration already validates the accepted domains and owns defaulting. This preserves module
direction and proves invalid policy is rejected before it reaches renewal.

**Rejected**: Duplicate policy schema/defaults in the session module or a session-to-tenant dependency.

### R-008 — Use layered evidence, not application claims

**Decision**: Combine deterministic public-service examples/properties, a faithful memory Redis test adapter, actual
tenant-consumer composition, bounded two-client real Redis races, and the mandatory manual procedure.

**Rationale**: Each layer proves a different meaningful risk. Real Redis is necessary for command/script ordering;
Effect `TestClock` is necessary for exact boundary behavior; the tenant consumer is necessary for invalid-policy
rejection. None establishes comprehensive HTTP or browser behavior.

**Rejected**: Private-store-only tests, telemetry assertions, BDD before the running-application boundary exists, or
claiming all concurrency schedules from a finite race matrix.

## Resolved questions

- **Clock authority**: Effect clock at the service boundary, not browser timers or Redis server time.
- **Equality**: `deadline <= receivedAt` is expired.
- **Policy adoption**: only a successful qualifying refresh adopts the current validated policy.
- **Concurrency**: the atomic Redis operation is the linearization point; no stale retry overwrites its winner.
- **Data retention**: missing and expired may share the same result; no tombstone is required.
- **Operational telemetry**: no new monitoring claim; existing safe transient session annotation is preserved.

No product clarification remains. Private script return encoding, bounded property sample counts, and synchronization
mechanics are implementation choices that must remain exhaustive, deterministic, and fail closed.
