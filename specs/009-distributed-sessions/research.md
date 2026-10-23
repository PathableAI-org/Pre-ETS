# Research: Establish Distributed Application Sessions

## Authority and current implementation

### Decision: Plan the S2-D construction increment, not downstream enforcement

**Rationale**: Issue #218, the approved S2 delivery slice, `spec.md`, and `verification.md` authorize initial
establishment/read behavior, a bounded callback consumer, and real shared-store evidence. #219/#154 own tenant-bound
protected consumption; #220 owns renewal/expiration races; #221 owns explicit invalidation/outage completion.

**Alternatives considered**:

- Read the new session from the root page and render protected content: rejected because it would claim #219/#154 scope
  and would need independent request-tenant binding.
- Add renewal, logout, tombstones, or invalidation operations now: rejected because their races and guarantees belong to
  #220/#221.

### Decision: Extend the existing frontend `SessionService`

**Rationale**: The frontend already owns temporary session state and has an actual `SessionService` consumer. Extending
that public parent preserves ownership and gives later entry-point work one stable capability. Private codec/store
children keep Redis and wire representation out of sibling consumers.

**Alternatives considered**:

- New workspace/package: rejected because no cross-process consumer exists and the backend must not read Redis sessions.
- Separate public repository/provider service: rejected because only the session module owns the persistence semantics;
  exposing arbitrary storage would weaken the bounded contract.
- Replace the service with framework-only helpers: rejected because independent clients and later consumers need an
  Effect capability outside Next response construction.

## Contract and persistence choices

### Decision: Use Effect success/no-usable values plus a typed service failure

**Rationale**: `UsableSession | NoUsableSession` in the success channel makes ordinary absence explicit without
exceptions, while `SessionServiceUnavailable` preserves the materially different case where the service cannot
determine or persist state. Only `UsableSession` carries identity and policy.

**Alternatives considered**:

- Boolean/optional presence only: rejected because it collapses store failure into absence and cannot carry the required
  identity/deadline/policy.
- Put service failure in the success union: rejected because Effect's typed error channel gives callers a harder-to-ignore
  failure path while preserving the three observable outcomes.
- Expose missing/expired/invalidated as mandatory distinct reasons: rejected because the approved contract permits a
  common no-usable-session result and forbids inventing tombstone retention solely for this slice.

### Decision: Store one strict versioned record with Redis TTL

**Rationale**: The record contains only issuer/subject identity, tenant alias, authoritative idle deadline, warning lead,
and a non-bearer telemetry correlation identifier. Redis `SET ... NX PX` provides atomic collision-safe creation and
bounded transient retention; `GET` supports independent readers. The installed Effect 4.0.5 Redis service exposes the
required typed `send` API, and `NodeRedis.layer` is already the production adapter.

**Alternatives considered**:

- Process-local map: rejected because it cannot establish PREETS-SESSION-006 shared storage.
- Redis hash/general value bag: rejected because arbitrary application values are out of scope and a single strict JSON
  record is easier to validate atomically.
- Postgres: rejected because sessions are transient frontend state, not durable domain data.
- Reuse OIDC transaction keys/codec: rejected because authentication attempts and application sessions have different
  lifetimes, consumers, and security contracts.

### Decision: Use a random opaque cookie reference and a hashed Redis address

**Rationale**: A 32-byte random unpadded base64url reference is an unguessable bearer suitable for a host-only cookie.
Hashing it with SHA-256 below an owned prefix avoids placing the raw bearer in Redis key names. The server-held record,
not the cookie, contains identity and policy.

**Alternatives considered**:

- Signed/encrypted self-contained cookie: rejected because the approved architecture requires server-held distributed
  state and invalidation/renewal must remain authoritative.
- Store the raw reference as the Redis key: workable, but rejected because hashing cheaply reduces accidental exposure
  in key listings without changing the public contract.
- Introduce `SESSION_SIGNING_SECRET`: rejected because a high-entropy lookup reference needs no client-verifiable claims
  and no current consumer justifies another secret.

### Decision: Derive the deadline from the Effect clock and tenant service's effective policy

**Rationale**: `TenantConfigService.effectiveSessionPolicy` is the existing owner of validated defaults. The session
service uses the Effect clock for deterministic tests, records epoch milliseconds as the authoritative deadline, and
sets the Redis/cookie lifetime from the same establishment calculation. Installed Effect 4.0.5 supplies Clock/DateTime
and test-clock support.

**Alternatives considered**:

- Recalculate policy defaults in the session module: rejected as duplicate authority.
- Treat Redis TTL alone as the public deadline: rejected because consumers need the explicit authoritative deadline and
  tests need to detect stale-but-present records without depending on expiry timing.

## Callback and runtime composition

### Decision: Keep orchestration in the existing callback Route Handler

**Rationale**: The handler is the one bounded reference consumer. It already maps trusted completion and safe failure
presentation; adding tenant-policy lookup and session establishment there keeps Next cookies/responses at the framework
edge and avoids a one-consumer coordinator abstraction.

**Alternatives considered**:

- Make `AuthenticationService` create sessions: rejected because OIDC validation should not own session persistence or
  tenant policy.
- Add a new public callback coordinator service: rejected because there is one current consumer and no reuse/lifecycle
  need.
- Issue the cookie before storage succeeds: rejected because an ambiguous/unavailable store must not produce an
  apparently successful session.

### Decision: Share one Redis Layer in the host-owned runtime

**Rationale**: Authentication transactions and application sessions use separate key prefixes but the same existing
Redis dependency. Constructing one `NodeRedis.layer` value and providing it to both service graphs preserves connection
resource scope and readiness in the existing `ManagedRuntime`.

**Alternatives considered**:

- New Redis client per operation or module: rejected because it duplicates resources and weakens host lifecycle
  management.
- A second Compose Redis: rejected because key ownership, not another infrastructure service, provides separation.

## Evidence and observability

### Decision: Use a focused Node test and the Playwright library for issue-level real-provider composition

**Rationale**: Current `origin/main` (`9a5da82`) removed the unused Playwright Test `e2e/` directory, `@playwright/test`,
and `pnpm test:e2e`. The `playwright` library remains, and requirements BDD (`pnpm test:bdd`) is the end-to-end boundary
for requirement-backed journeys. The planned provider/session assertion is issue-level evidence rather than requirements
BDD, so it belongs in `tests/bdd/session/session-establishment.test.ts`, run with `node --test` after Redis and Keycloak
are ready. That path is outside `tests/bdd/checks/`, because `pnpm test:bdd:checks` runs before Keycloak starts. Extracting
only runner-neutral fixture mechanics into `tests/support/oidc/` lets this test and Cucumber share the real provider setup
without duplicating a harness or placing issue-only assertions under requirement tags.

**Alternatives considered**:

- Restore `e2e/session-establishment.spec.ts` and `pnpm test:e2e`: rejected because that runner and dependency were
  removed and this feature must not bring them back.
- Add the journey to `tests/bdd/checks/`: rejected because the nightly harness-check job runs that directory before
  Keycloak is available.
- Add `tests/integration/session-callback-keycloak.test.ts` under the frontend Vitest integration config: rejected
  because that config is the Redis integration boundary and does not own the browser/process harness.
- Add cookie/store assertions to the existing Cucumber feature: rejected because issue #218 does not supply
  current-main requirements authority for those assertions.
- Build a second Playwright/Keycloak harness: rejected because it duplicates existing browser/process ownership.

### Decision: Require freshness confirmation before session issuance without choosing the comparison

**Rationale**: #217's trusted handoff validates signed `auth_time` presence and defers stale-time comparison.
PREETS-SESSION-013 AC3 requires confirmation of a fresh event before a new session exists. The callback consumer
therefore calls `SessionService.establish` and sets `pathable-session` only after freshness has been confirmed. This
plan does not select the authentication-time comparison, clock tolerance, or provider policy; those remain B6/#158.
Until that confirmation exists, the confirmed-fresh success evidence stays unexecuted. Service, store, rejection, and
unconfirmed-freshness refusal work can proceed.

**Alternatives considered**:

- Treat `AuthenticationService.complete` success as sufficient to issue a session: rejected because it would create a
  session from unconfirmed freshness.
- Choose a clock tolerance or `auth_time` comparison in this plan: rejected because that decision remains B6/#158.

### Decision: Pair real-adapter outage evidence with callback failure mapping

**Rationale**: OIDC transactions and sessions intentionally share one production Redis Layer. A whole-store outage
therefore prevents callback transaction recovery before a trusted identity exists; it cannot demonstrate the narrower
post-authentication session-write failure by itself. A real-Redis `SessionService` outage test establishes that adapter
failure becomes `SessionServiceUnavailable`, while a callback adapter scenario injects that typed failure after a
trusted authentication result and establishes the no-cookie safe response. Their claims compose without pretending one
scenario exercised a boundary it could not reach.

**Alternatives considered**:

- Stop shared Redis during the real callback: rejected because authentication transaction consumption fails first.
- Add a second production Redis client solely to make the test isolatable: rejected because it changes runtime
  architecture for evidence rather than product need.
- Add a session-prefix-specific Redis ACL/fault seam: viable only if reviewers require one fully composed failure case;
  the paired evidence is smaller and already covers the distinct uncertainties.

### Decision: Defer new successful-establishment requirements BDD until binding is observable

**Rationale**: Current-main PREETS-SESSION-003 authorizes successful establishment and rejection, but this construction
slice intentionally exposes no protected read that can show the bound user/tenant through the running application.
Feature-level `@partial` limits coverage; it cannot authorize cookie/store/failure assertions from issue #218. Public
service, real-adapter, callback integration, and manual evidence can establish this increment without adding a
diagnostic product contract.

**Alternatives considered**:

- Put V-005–V-007 in Cucumber under `@partial`: rejected because those distinctions are issue-authorized, not promises
  in the cited current-main requirements.
- Add a diagnostic endpoint solely for BDD: rejected because it expands the product surface to satisfy a test.
- Treat scenario text or dry-run discovery as verification: rejected because neither executes behavior.

### Decision: Persist a separate telemetry-safe session correlation identifier

**Rationale**: A random UUID stored with the session lets successful establishment and later usable reads annotate
their existing Effect spans with the same opt-in `session.id`. It cannot authenticate or retrieve the session and is not
returned to the browser or public service consumer. This supports the approved manual trace correlation without
exposing the cookie or derived Redis key. The temporary independent reader must compose the existing
`observabilityLayer` and its Config/Node host dependencies, then dispose its scoped runtime to flush the read span before
Tempo inspection.

**Alternatives considered**:

- Use the cookie/reference or Redis key as `session.id`: rejected because both are bearer-linked identifiers.
- Derive a trace-only value per request: rejected because it cannot correlate establishment with a later independent
  read.
- Assert span output in Vitest: rejected by repository policy; live exported traces must be inspected manually or with
  a temporary probe.

## API verification

The planning APIs were checked against the installed frontend dependency set at Effect 4.0.5 / platform-node 4.0.5:

- `Context.Service`, `Schema.TaggedError`, `Effect.fn`, `Effect.fnUntraced`, `Effect.annotateCurrentSpan`, `Layer`,
  `ManagedRuntime`, Clock/DateTime, and `@effect/vitest` Effect tests exist in the installed Effect source/declarations.
- `effect/persistence/Redis.Redis` exposes `send<A>(command, ...args): Effect<A, RedisError>`; the existing code already
  uses it for `SET ... NX PX` and `GETDEL`.
- `NodeRedis.layer` and the repository's current socket/offline-queue settings remain the concrete adapter.
- The local Effect guidance checkout revision was `41cf29b5d85af7fc25bcc7713f2e05142edaa66a`; installed declarations remain
  authoritative where it differs.

No unresolved product or technical clarification remains.
