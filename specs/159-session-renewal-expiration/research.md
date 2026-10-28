# Research: Renew and Expire Authoritative Sessions

## Evidence consulted

- Issue #220 and its accepted requirement/delivery authorities, refreshed at `origin/main` revision
  `3f54c577a076c8139c5be6986e0b7c3e81106af7`.
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
input so only qualifying activity can carry the current effective policy; the excluded variant declares
`policy?: never` so the restriction also applies to non-literal assigned objects.

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
expired, mismatch, unchanged, or renewed state. The script fully validates the exact V1 record, performs tenant
admission for tenant-bound refresh, and constructs its complete result/replacement before any mutation. It then issues
no mutation or one final `DEL`/`SET ... PX`; it never relies on script rollback. Tenant mismatch precedes expiration
for tenant-bound refresh. After storage returns a usable record, the parent samples Effect clock again and refuses to
expose identity when the returned deadline has been reached. A transport or result-decoding failure after the final
write may leave committed state while returning `SessionServiceUnavailable`; no stale automatic retry is permitted.

**Rationale**: Application-level `GET` followed by `SET`, even with compare-and-replace, can expose expired state and
then allow a stale write. One prepare-then-commit transition establishes an unambiguous winner across independent
clients without risking a partial mutation on malformed input. Mismatch-first admission preserves the public
non-mutation contract. Effect clock remains the behavioral authority: receipt time governs renewal eligibility, the
post-storage sample governs identity exposure, and TTL remains cleanup.

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
`UsableSession`; tenant mismatch and dependency/codec/script failure use the existing fieldless errors. A failure
after a final script write does not promise unchanged state and cannot trigger a stale retry.

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
tenant-consumer composition, separately gated two-client real Redis renewal-first and expiration-first cases, and the
mandatory manual procedure. Add a third mandatory case that releases both independently scoped clients from one start
barrier without awaiting either operation, bounds completion, accepts either permitted atomic winner, and asserts both
operation outcomes plus later reads from both clients. The overlap case and forced-order cases establish distinct
uncertainties and cannot substitute for one another.

**Rationale**: Each layer proves a different meaningful risk. Real Redis is necessary for command/script ordering;
Effect `TestClock` is necessary for exact boundary behavior; the tenant consumer is necessary for invalid-policy
rejection. None establishes comprehensive HTTP or browser behavior.

**Rejected**: Private-store-only tests, telemetry assertions, BDD before the running-application boundary exists, or
claiming all concurrency schedules from a finite race matrix.

## Resolved questions

- **Clock authority**: Effect clock at the service boundary, not browser timers or Redis server time; sample once for
  receipt/renewal eligibility and again after storage before exposing returned identity.
- **Equality**: `deadline <= receivedAt` is expired.
- **Policy adoption**: only a successful qualifying refresh adopts the current validated policy.
- **Concurrency**: the atomic Redis operation is the linearization point; no stale retry overwrites its winner.
- **Mutation safety**: all validation and fallible construction precede no more than one final mutation; Redis script
  rollback is not assumed. Failure after that final mutation may leave committed state and still maps to
  `SessionServiceUnavailable`; it is never retried with stale input.
- **Mismatch precedence**: tenant-bound refresh returns mismatch without mutation before considering expiration.
- **Race evidence**: renewal-first and expiration-first are separately gated and asserted, not inferred from an
  either-outcome race; a third mandatory barrier-released case establishes actual overlapping dispatch.
- **Data retention**: missing and expired may share the same result; no tombstone is required.
- **Operational telemetry**: no new monitoring claim; existing safe transient session annotation is preserved.

No product clarification remains. Private script return encoding, bounded property sample counts, and synchronization
mechanics are implementation choices that must remain exhaustive, deterministic, and fail closed.
