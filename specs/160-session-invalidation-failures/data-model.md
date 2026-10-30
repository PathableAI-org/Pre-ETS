# Data Model: Complete Session Invalidation and Failure Behavior

**Plan**: [plan.md](plan.md)

**Status**: Planned design — no migration or execution evidence

## Scope

This feature adds one lifecycle transition over the existing temporary session record. It introduces no new durable
entity, stored field, record version, public identity model, cause-retention record, tombstone, or cross-session
index.

## Existing public values

### SessionReference

An opaque, validated reference held by the browser and accepted by the session parent. The reference is never a Redis
key: the private store hashes it with SHA-256 and combines the digest with the configured owned prefix.

Validation ownership remains `packages/frontend-services/src/session/codec.ts`. Missing or malformed optional input
does not reach storage.

### NoUsableSession

```ts
export interface NoUsableSession {
  readonly _tag: "NoUsableSession"
}
```

The same fieldless value represents the successful result of explicit invalidation whether the addressed key was
removed, missing, expired and already cleaned up, previously invalidated, or contained malformed non-usable bytes.
It includes no cause, identity, tenant, policy, deadline, reference, or store result.

### SessionServiceUnavailable

The existing fieldless expected error for storage, transport, codec, and unknown-result failures. For invalidation it
means the service cannot report a completed terminal operation. It does not reveal whether Redis applied a delete
before the failure became observable.

### UsableSession

Unchanged. Only successful read or renewal may return this complete tenant-bound value. Invalidation never returns it.

## Existing stored state

### StoredSessionV1

| Field                           | Invalidation behavior                                       |
| ------------------------------- | ----------------------------------------------------------- |
| `version: 1`                    | Not decoded; addressed record is deleted as a whole         |
| `issuer`, `subject`             | Never read or returned                                      |
| `tenantAlias`                   | Never read or returned; tenant-bound admission is unchanged |
| `telemetryId`                   | Never read or annotated                                     |
| `idleDeadlineEpochMilliseconds` | Never read; existing expiration behavior remains separate   |
| `warningLeadMinutes`            | Never read or returned                                      |

No stored migration is needed. Redis TTL remains cleanup only and is removed with the key.

### Session store address

```ts
interface SessionStoreAddress {
  readonly reference: string
}
```

The private store accepts only a reference already validated by the session parent. It computes:

```text
<SESSION_KEY_PREFIX>:<base64url(sha256(reference))>
```

Neither the raw reference nor the resulting key crosses the private boundary.

### Private invalidation outcome

The private store distinguishes only what is needed to validate Redis's single-key reply:

| Redis reply | Private meaning | Public result                                   |
| ----------- | --------------- | ----------------------------------------------- |
| `0`         | Key missing     | `NoUsableSession`                               |
| `1`         | Key removed     | `NoUsableSession`                               |
| Other       | Unknown reply   | Store unavailable → `SessionServiceUnavailable` |

The private distinction is not a retained cause and is never exported.

## Public lifecycle states

The public model deliberately collapses terminal causes:

| Conceptual state       | Read/refresh result today                           | Invalidate result                         |
| ---------------------- | --------------------------------------------------- | ----------------------------------------- |
| Usable record          | `UsableSession` when admitted and before deadline   | Delete key → `NoUsableSession`            |
| Expired record         | Delete/absent → `NoUsableSession`                   | Delete if present → `NoUsableSession`     |
| Missing record         | `NoUsableSession`                                   | `NoUsableSession`                         |
| Previously invalidated | `NoUsableSession`                                   | `NoUsableSession`                         |
| Malformed stored bytes | `SessionServiceUnavailable` on operations that read | Delete without decode → `NoUsableSession` |
| Store unavailable      | `SessionServiceUnavailable`                         | `SessionServiceUnavailable`               |

Deleting malformed bytes does not reinterpret them as a valid session. It completes only the narrower terminal
operation for an already validated reference.

## State transitions

```text
valid reference + usable/current/expired/malformed key
    -- atomic DEL returns 1 --> absent --> NoUsableSession

valid reference + absent key
    -- atomic DEL returns 0 --> absent --> NoUsableSession

missing/malformed reference
    -- no store call -------> public NoUsableSession

valid reference + command/reply failure
    -- state unknown -------> SessionServiceUnavailable
```

There is no transition from invalidation to a new session. `establish` is the only creator and generates a fresh
opaque reference.

## Concurrency invariants

### Invalidation versus renewal

Both operations are atomic on the same Redis key.

- Renewal linearizes first: it may return a renewed `UsableSession`; invalidation then deletes that complete record.
- Invalidation linearizes first: renewal reads missing and returns `NoUsableSession` without creating state.
- After both complete, every later read and refresh of the old reference returns `NoUsableSession`.

A stale local `UsableSession` value held by a consumer is not authoritative state and cannot be submitted to recreate
the key.

### Invalidation versus expiration/read

- Expiration wins first: it deletes or observes missing; later invalidation succeeds terminally.
- Invalidation wins first: the read/expiration transition observes missing.
- No ordering can produce a replacement record.

### Failure after mutation

If Redis applies `DEL` but the reply is lost or rejected, the public call returns `SessionServiceUnavailable`. The key
may be absent or may remain. The failure result promises neither. A later public read/invalidate is the only supported
way to re-evaluate authoritative state.

## Validation rules

1. The parent validates optional input with the existing `SessionReference` decoder.
2. Invalid input returns `NoUsableSession` without hashing or Redis access.
3. The private store hashes the validated reference and sends exactly one key to `DEL`.
4. Only numeric reply `0` or `1` is accepted.
5. Any command failure or other reply becomes the private fieldless unavailable error.
6. The parent redacts private failure to `SessionServiceUnavailable`.
7. Neither success nor failure adds a `session.id` annotation or other protected data.

## Retention and cleanup

Successful invalidation removes the addressed session key and its TTL. It creates no replacement, tombstone,
history, audit record, cause marker, or secondary index. Integration and manual evidence use scenario-owned prefixes
and remove only owned keys. A dedicated outage store is restored before cleanup; failed invalidations are
re-evaluated rather than assumed complete.
