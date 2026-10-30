# Research: Complete Session Invalidation and Failure Behavior

**Plan**: [plan.md](plan.md)

**Status**: Design research complete; no implementation or runtime evidence is claimed

## Authorities and current baseline

- Delivery issue: [#221](https://github.com/PathableAI-org/Pre-ETS/issues/221)
- Accepted requirements: PREETS-SESSION-006 AC1–3, PREETS-SESSION-008 AC4, and PREETS-SESSION-013 AC2 at current
  `origin/main` revision `c62c521152c7c8e3869a1575c4c1b3b07c481e8b`
- Feature contract: [spec.md](spec.md)
- Verification contract: [verification.md](verification.md)
- Implemented predecessor: issue #220 renewal/expiration commit
  `db4b5615c10aa3948ea91919a524a3ed6b743cb2`, an ancestor of current `origin/main`
- Architecture strategies: `docs/session-state.md`, `docs/authentication.md`, and the repository constitution

The sources agree on explicit shared invalidation, non-revival, distinct absence/failure outcomes, and real-store
failure evidence. They do not authorize application-wide logout, cause retention, tenant-wide revocation, a new
session format, or fresh-provider recovery in this slice.

## Decision 1: Extend the existing session owner

**Decision**: Add invalidation to `SessionService` in `packages/frontend-services/src/session.ts` and to its private
`SessionStore` child.

**Rationale**: `SessionService` already owns the opaque-reference codec, consumer-visible lifecycle vocabulary,
identity privacy, store-failure translation, and temporary-session behavior. `SessionStore` already owns key hashing,
prefix configuration, Redis access, and private reply validation. These are the exact responsibilities invalidation
needs. Extending them preserves the recursive parent/private-child rule and avoids a parallel lifecycle owner.

**Alternatives rejected**:

- A new public invalidation service: no independent consumer, lifecycle, configuration, or package boundary exists.
- A Next.js logout adapter in this slice: #155 owns browser logout interaction/coordination and #154 owns broad
  application enforcement.
- Direct Redis access from the bounded reference fixture: it would bypass the public capability whose behavior the
  issue requires and duplicate private addressing.

## Decision 2: Use one public terminal success outcome

**Decision**: `invalidate({ reference })` returns `Effect.Effect<NoUsableSession, SessionServiceUnavailable>`.

**Rationale**: A consumer ending a session needs to know whether the service completed a terminal operation or could
not establish that result. It does not need to learn whether state was missing, malformed, expired, already
invalidated, or removed now. Returning the existing fieldless `NoUsableSession` preserves the approved no-cause
contract and guarantees no identity, tenant, deadline, warning policy, raw reference, or deletion count escapes.

**Alternatives rejected**:

- `void` or `boolean`: these lose the shared public outcome vocabulary or expose existence.
- `"removed" | "missing"`: this creates an unauthorized cause/existence distinction.
- Returning `UsableSession` before deletion: it exposes data the caller does not need and weakens the terminal
  contract.
- Adding `SessionTenantMismatch`: explicit invalidation supplies only an opaque reference, grants no access, exposes
  no state, and has no tenant input to compare. Tenant-bound read and refresh retain their existing mismatch checks.

## Decision 3: Validate the reference, not the stored record

**Decision**: Reuse `decodeSessionReference` before store access. For a valid reference, delete its addressed key
without decoding the stored payload.

**Rationale**: Reference validation prevents arbitrary key construction and preserves the existing opaque format.
Stored identity and policy are irrelevant to termination. Deleting malformed bytes is safer and simpler than making
corrupt non-usable state undeletable. The public result remains terminal and does not classify the prior state.

**Alternatives rejected**:

- Decode the record before deletion: adds a read/decode/delete sequence or expands the renewal script, creates a
  corruption-dependent inability to invalidate, and offers no authorized consumer value.
- Treat malformed stored bytes as `SessionServiceUnavailable` during invalidation: read still reports corruption as
  unavailable, but invalidation can complete its narrower task without trusting or exposing that payload.
- Hash an unvalidated string: diverges from the existing reference contract and permits meaningless store work.

## Decision 4: Use atomic single-key `DEL`

**Decision**: The private store issues one `Redis.Redis.send<number>("DEL", key)` and accepts only reply `0` or `1`.

**Rationale**: Redis `DEL` is atomic. The existing renewal/expiration script also operates on one key, so Redis
serializes the two transitions. If renewal linearizes first, invalidation deletes the renewed value. If invalidation
linearizes first, renewal reads missing and cannot recreate the key. No compare-and-set, tombstone, or Lua mode is
needed. Strict reply decoding preserves the store's existing fail-closed posture.

**Alternatives rejected**:

- Add an invalidation mode to the lifecycle Lua script: it would parse data invalidation does not need and enlarge the
  script's validation surface.
- `GETDEL`: the returned payload is unused and would increase protected-data handling.
- Tombstones or cause-retention keys: issue #221 explicitly excludes a required absent/expired/invalidated cause
  distinction and uniform fresh authentication removes the freshness-selection need.
- Read then delete: introduces a race window and two round trips without improving the guarantee.

## Decision 5: Failure is explicit and mutation status may be unknown

**Decision**: Redis transport/command failure and any reply other than numeric `0` or `1` map through the private
error to fieldless `SessionServiceUnavailable`. The operation is not retried.

**Rationale**: A client may lose the reply after Redis applies `DEL`. Claiming successful invalidation would be false;
claiming the record remains would also be false. Returning explicit failure preserves fail-closed consumer behavior.
Automatic retry is unnecessary for the eventual terminal state and would hide the important indeterminate boundary.
A later public read or a new explicit invalidation can re-evaluate authoritative state under the caller's policy.

**Alternatives rejected**:

- Map delete failure to `NoUsableSession`: conflates outage with ordinary absence and could authorize an incorrect
  recovery path.
- Retry automatically: obscures which attempt committed and adds policy not authorized by the issue.
- Expose Redis diagnostics or raw mutation state: violates public-error privacy and couples consumers to storage.

## Decision 6: Preserve the stored schema, runtime, and telemetry

**Decision**: Keep `StoredSessionV1`, `SessionReference`, `SessionServiceUnavailable`, `NoUsableSession`,
`ApplicationServices`, `SessionService.layer`, Redis configuration, and root exports unchanged except for the new
service member.

**Rationale**: Invalidation deletes state and does not need a migration. The current runtime already supplies Redis to
the session layer. Existing telemetry annotates `session.id` only when usable identity is exposed; invalidation has no
usable result and needs no new operational claim.

**Alternatives rejected**:

- Record an `invalidatedAt` field: requires retained state and a migration for no approved consumer.
- Add a new config value, provider interface, Layer, or package export: no current consumer requires it.
- Durable telemetry-output tests: repository policy requires observability checks to be manual/transient, and this
  slice introduces no new observability contract.

## Decision 7: Separate evidence by consumer claim

**Decision**: Use public-service scenarios for contract semantics, real Redis for cross-client atomic ordering and
adapter outages, and reserve the existing #219 reference consumer for one manual composed denial observation.

**Rationale**: The public service is the smallest meaningful boundary for outcome and privacy claims. A memory
adapter cannot establish real Redis serialization or real client failure, so those claims need integration evidence.
The #219 harness already composes a real Next process, public session service, browser action, and Redis. The manual
procedure may surround it with temporary uncommitted public-service invalidation support to observe denial of the old
reference. No durable automated fixture extension is planned, so the composed journey remains distinct from automated
service/store evidence. It still does not prove comprehensive application enforcement.

**Alternatives rejected**:

- Test the private store directly: duplicates the parent contract and violates the repository test boundary.
- Add requirements-backed Gherkin: comprehensive request/browser behavior belongs to downstream issues and no new
  application requirement is implemented here.
- Assert logs, spans, or exporter payloads: not an application outcome and prohibited as durable evidence.

## Installed API verification

- `effect` 4.0.5 provides `Context.Service`, `Effect.fn`, `Effect.fnUntraced`, `Layer.effect`, and typed expected-error
  channels used by the current session module.
- Installed `effect/persistence/Redis` exposes `Redis.Redis["Service"].send` for typed command replies and the existing
  `script(...).withReturnType<unknown>()` API used by renewal.
- The local Effect v4 checkout at revision `41cf29b5d85af7fc25bcc7713f2e05142edaa66a` confirms service/Layer and test
  composition patterns; installed declarations remain authoritative where versions differ.
- `@effect/vitest` 4.0.5 supports `it.effect`; the runner owns Effect execution and scope.

No external documentation or new dependency is needed.

## Resolved questions

| Question                                            | Resolution                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Must invalidation reveal whether a record existed?  | No. Every completed terminal case is `NoUsableSession`.                                                |
| Must corrupt stored state block invalidation?       | No. A valid reference may delete its key without decoding protected payload.                           |
| Is a tombstone required for renewal races?          | No. Single-key command serialization and refresh's no-create behavior make deletion final.             |
| Can a failed delete be reported as absence?         | No. It is `SessionServiceUnavailable`, including indeterminate post-commit reply loss.                 |
| Must invalidation carry tenant or policy?           | No. It grants no access, returns no protected state, and addresses one opaque reference.               |
| Is application/browser logout included?             | No. The bounded reference consumer is observed manually; comprehensive integration remains downstream. |
| Are new telemetry or retained cause records needed? | No. Neither is an authorized requirement or current consumer need.                                     |

## Remaining implementation choices

- Exact names for the private store's two success literals may be chosen during implementation if both remain
  private and map identically to `NoUsableSession`.
- Test-helper control names may follow existing conventions as long as they model before-mutation and
  after-mutation failure distinctly and do not leak into production contracts.
- The manual procedure may use a temporary uncommitted invalidation mode or companion probe. It must call only the
  public `SessionService`, preserve unconditional owned cleanup, and be removed before completion.
