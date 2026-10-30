# Module Architecture and Public Contracts: Complete Session Invalidation and Failure Behavior

**Plan**: [plan.md](../plan.md)

**Feature verification**: [verification.md](../verification.md)

**Status**: Planned design — signatures verified against installed Effect 4.0.5 declarations before implementation

## Module architecture decisions

| Concern                     | Current owner and consumers                                                | Decision                                 | Public boundary                                 | Private decomposition       | Rationale and non-goals                                                                             |
| --------------------------- | -------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------- |
| Session lifecycle outcomes  | `src/session.ts`; request/session consumers and bounded #219 fixture       | Extend existing owner with `invalidate`  | `SessionService`                                | Existing `session/*`        | Keeps lifecycle vocabulary, privacy, and failure mapping together; no new service or logout adapter |
| Redis addressing/deletion   | `src/session/store.ts`; consumed only by `session.ts`                      | Extend private child with single-key DEL | None; parent owns the public contract           | Existing private store      | Reuses hashing/prefix ownership and Redis dependency; no direct consumer access                     |
| Reference and record codecs | `src/session/codec.ts`; consumed only by `session.ts`                      | Preserve                                 | Existing exported `SessionReference` via parent | Existing private codec      | Validate the reference; do not decode or migrate stored state for deletion                          |
| Renewal/expiration ordering | Private one-key script in `src/session/store.ts`; `refreshForTenant` users | Preserve and compose through Redis order | Existing `refreshForTenant`                     | Existing transition script  | Atomic DEL and the existing one-key script serialize without a new script mode or tombstone         |
| Request/application mapping | `session-request.ts` and Next.js #219 reference consumers                  | Preserve production code; extend fixture | Existing `readSessionRequest`                   | Existing test fixture       | Adds bounded denial evidence only; #154–#158 retain application/logout/recovery/provider work       |
| Runtime/configuration       | `runtime.ts`, `SessionService.layer`, `SessionKeyPrefix`                   | Preserve                                 | Existing `ApplicationServices`/session Layer    | Existing config/store child | No new dependency, Layer, environment value, runtime, or package export                             |
| Telemetry                   | `session.ts` usable-session annotation                                     | Preserve                                 | Existing safe usable-session behavior           | None                        | Invalidation returns no usable identity and adds no annotation or durable telemetry test            |

Every affected concern has an explicit decision. The feature novelty does not justify another public module,
provider interface, package, root re-export, stored schema, or future-shaped logout contract.

## Public contracts

### `packages/frontend-services/src/session.ts`

**Responsibility**: Own temporary session establishment, authoritative read/tenant admission, renewal/expiration,
explicit invalidation, public outcome vocabulary, and redaction of private storage/codec failures.

**Actual consumers**:

- `session-request.ts` and downstream Next.js consumers need existing tenant-bound read outcomes; their signatures do
  not change.
- Issue #221 lifecycle consumers need to terminate one opaque reference without learning whether state existed or
  receiving protected session fields.
- The existing #219 bounded reference fixture needs public invalidation to observe composed denial after the shared
  state is terminated.
- Future #155 logout coordination may call this capability, but it does not shape this slice's browser/cookie API.

**Proposed signature addition in context**:

```ts
export class SessionService extends Context.Service<SessionService, {
  readonly establish: (
    input: EstablishSessionInput
  ) => Effect.Effect<EstablishedSession, SessionServiceUnavailable>
  readonly invalidate: (
    input: { readonly reference?: string }
  ) => Effect.Effect<NoUsableSession, SessionServiceUnavailable>
  readonly read: (
    input: { readonly reference?: string }
  ) => Effect.Effect<NoUsableSession | UsableSession, SessionServiceUnavailable>
  readonly readForTenant: (
    input: ReadSessionForTenantInput
  ) => Effect.Effect<NoUsableSession | UsableSession, SessionServiceUnavailable | SessionTenantMismatch>
  readonly refreshForTenant: (
    input: RefreshSessionForTenantInput
  ) => Effect.Effect<NoUsableSession | UsableSession, SessionServiceUnavailable | SessionTenantMismatch>
}>()("@pathableai/pre-ets-frontend/SessionService")
```

No new public input type is exported because the structural input is identical to the current `read` input and no
independent consumer needs to name it.

**Inputs and validation ownership**: `reference` is optional untrusted text. `session.ts` uses the existing private
codec to validate its exact opaque format before any store call. The private store accepts only a validated reference
and owns hashing/prefix construction. The input contains no tenant, identity, policy, token, cookie, HTTP request, or
Redis key.

**Success semantics and invariants**:

- Missing or malformed input returns fieldless `NoUsableSession` without store access.
- A valid reference returns fieldless `NoUsableSession` when the addressed key was removed or already absent.
- Stored bytes are not decoded; valid, expired, and malformed addressed values are all removable.
- A successful return guarantees that the invalidation command completed with a recognized terminal reply, not that
  the service retained a cause or proved prior existence.
- After successful invalidation, later read or refresh of the old reference cannot recreate authenticated state.
- Invalidation never returns or annotates identity, tenant, policy, deadline, telemetry ID, raw reference, key,
  payload, deletion count, or terminal cause.
- `establish` remains the only record creator and always generates a fresh reference.

**Expected errors**:

| Public error                    | Meaning for consumers                                     | Owned internal failures translated here                       | Consumer response                                                              |
| ------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `SessionServiceUnavailable`     | Terminal completion could not be established              | Redis command/transport failure, unexpected DEL reply         | Fail closed; do not claim logout/absence or authorization success; re-evaluate |
| `SessionTenantMismatch`         | Existing read/refresh tenant admission failed             | Existing stored/input tenant comparison                       | Unchanged; `invalidate` does not produce this error                            |
| None for missing/existing cause | Invalidation completed with a recognized terminal outcome | Private delete count `0` or `1`; malformed optional reference | Treat as `NoUsableSession`; do not infer whether state previously existed      |

**Defects and interruption**: Unexpected programming defects, violated internal invariants outside the expected
Redis reply channel, and Effect interruption remain defects/interruption. They are not converted to
`SessionServiceUnavailable`. The existing redaction helper maps only the private expected error channel.

**Effect environment requirements**: Consumers require `SessionService`. `SessionService.layer` continues to require
the installed `Redis` service and existing `SessionKeyPrefix` configuration internally. No new environment service,
Layer, Scope, runtime, clock, or provider is added for invalidation.

**Compatibility and relationships**: Existing service calls and public types are unchanged. Complete structural
implementations of `SessionService["Service"]` must add `invalidate`; known test doubles in
`tests/unit/reference-session-enforcement.test.ts` and `tests/unit/authentication-entry-failures.test.ts` are migrated.
The package root continues its current exports; no new root re-export is added solely for future logout code.
`readSessionRequest`, HTTP mapping, cookies, and UI remain unchanged.

### Contract evidence

| Claim                                    | Meaningful violation                                               | Durable evidence                                                                                                                    | Manual/transient evidence                                        | Limitations and non-duplication                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Terminal success is cause-blind          | Success exposes existence/cause or protected fields                | Public scenarios for missing, current, expired, malformed, and already removed state all return exact `{ _tag: "NoUsableSession" }` | Inspect bounded consumer outcome without retaining reference     | Does not establish browser cookie clearing or user-facing logout                                            |
| Invalid input avoids storage             | Malformed input hashes or issues a command                         | Public scenario records no Redis command for absent/malformed references                                                            | None                                                             | Memory command recording does not establish real Redis behavior                                             |
| Valid addressed state is removed         | Another client reads usable identity after successful invalidation | Public scenario plus two-client real Redis integration                                                                              | Bounded #219 consumer succeeds before and denies afterward       | Bounded consumer is not comprehensive application enforcement                                               |
| Renewal cannot revive invalidated state  | A race leaves a usable record after invalidation completes         | Real Redis forced renewal-first, invalidation-first, and overlapping schedules; both clients re-read and refresh                    | Manual repeat with safe ordering record                          | Finite schedules/topology are not a proof of every deployment timing                                        |
| Failure remains distinct                 | Outage returns ordinary absence/success or protected data          | Controlled public error scenarios and disconnected real-adapter read/refresh/invalidate evidence                                    | Dedicated-store bounded consumer outage                          | Local disconnection/outage does not establish every partition, managed-service failure, or recovery pattern |
| Post-mutation failure is not misreported | Reply loss reports success or triggers an automatic retry          | Memory adapter applies one DEL then fails; public result unavailable; command count one; later public read determines state         | None                                                             | Controlled adapter establishes service policy, not the probability or exact network behavior of Redis       |
| Existing expiration remains final        | Expiration/renewal can recreate old identity                       | Retain #220 deterministic and real-Redis expiration/renewal evidence                                                                | Manual invalidation procedure includes later old-reference reads | No duplicate full expiration matrix is added                                                                |

## Cross-module dependency direction

```text
Next.js / bounded fixture
        │
        ▼
frontend-services public entries
  session-request.ts ─────► session.ts (SessionService)
                                  │
                                  ├────► session/codec.ts (private child)
                                  └────► session/store.ts (private child) ─────► Redis
```

Only `session.ts` imports `session/codec.ts` and `session/store.ts`. Tests and the bounded fixture import the public
session parent or package entry, never a private child. `session/store.ts` does not import the parent. Frontend code
continues to call frontend-services and does not import Effect.

## Rejected abstractions and alternatives

- New `SessionInvalidationService`: no separate owner, dependency graph, lifecycle, or current consumer requires it.
- Public `InvalidateSessionInput`: identical structure to the existing inline read input and no naming need.
- Public removed/missing/expired/invalidated union: exposes a cause distinction explicitly excluded by issue #221.
- Tenant-bound invalidation/mismatch error: invalidation grants no access and returns no protected state; a tenant
  parameter would add a contract not required by the delivery issue.
- Tombstone/history/revocation index: no current consumer or retention policy, and it would outlive the temporary
  session record.
- New Lua invalidation mode or `GETDEL`: invalidation needs neither record validation nor returned payload.
- Automatic delete retry: conceals indeterminate commit status and adds unauthorized policy.
- New root export, Layer, config, dependency, package, or telemetry interface: no current consumer requires one.
- Production logout action or cookie-clearing helper: owned by downstream browser/application slices.

## Open decisions

### Blocking contract decisions

- None.

### Implementation choices left to tasks

- Choose private success literal names for Redis reply `0` and `1`; both must remain private and map identically.
- Name test-helper failure controls consistently with the existing memory Redis helper.
- Extend or replace the bounded fixture's current raw delete step with a public-service invalidation mode while
  preserving owned-prefix validation and cleanup.
