# Data Model: Set Up a Session

## Session record (frontend-owned)

Redis key: `pre-ets:session:<sid>`; tests use a unique isolated prefix.

| Field       | Type    | Rule                                                                                                    |
| ----------- | ------- | ------------------------------------------------------------------------------------------------------- |
| `tenantId`  | string  | Existing canonical tenant slug; immutable; must match validated current tenant and cookie.              |
| `expiresAt` | integer | Unix seconds, strictly later than current time; exactly matches cookie `exp` and Redis absolute expiry. |

The id is the key's suffix, not duplicated in the JSON record: 32 cryptographically random bytes encoded
as unpadded base64url (43 characters). No identity, tokens, Display Name, drafts, or business records.
Validate JSON as an exact supported record shape; malformed or incomplete data is unusable. Redis key
absence is a missing session; transport errors are service failures. No migration is needed for this
new ephemeral store; unsupported records are replaced by fresh sessions without copying state.

## Signed browser reference

Cookie `pathable-session`: compact HS256 token signed with the server secret.

| Claim    | Type    | Rule                                                                                           |
| -------- | ------- | ---------------------------------------------------------------------------------------------- |
| `sid`    | string  | Canonical generated id shape; never adopted when creating a replacement.                       |
| `tenant` | string  | Canonical slug, matching record and current trusted tenant.                                    |
| `exp`    | integer | Required future Unix timestamp; expiration at equality; no clock tolerance extending lifetime. |

Only these application claims are emitted; protected token header declares `alg: HS256` and `typ: JWT`.
Reject duplicate cookie names, invalid signatures/algorithms, wrong claim types/shapes, unexpected
application claims, and expired tokens as unusable. No Redis lookup for an invalid reference.

Cookie attributes: `Path=/`, `HttpOnly`, `SameSite=Lax`, no `Domain`, `Secure` outside development.
Use absolute `Expires` matching `exp`; do not renew on reads. Development HTTP omits Secure explicitly,
without relaxing host-only or HttpOnly. The cookie never authenticates the visitor.

## Request setup context

`{ sessionId, tenantId, expiresAt, tenantConfig }` exists only for the current request. `tenantConfig`
is the existing validated `TenantConfig` (currently Display Name), not stored in Redis or the cookie.
It is forwarded in `x-pathable-session-context` upstream to SSR after overwriting caller values.
The server-only reader validates it and exposes the same immutable snapshot to repeated consumers.
Missing/malformed context is a failure, never a trigger for another setup or host interpretation.

## Configuration

| Setting                    | Default / validation                                                               |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `REDIS_URL`                | Required server-only Redis connection URL; local example `redis://127.0.0.1:6379`. |
| `SESSION_SIGNING_SECRET`   | Required base64url encoding of at least 32 random bytes; no committed default.     |
| `SESSION_TTL_SECONDS`      | `86400`; finite positive safe integer, with representable resulting date.          |
| `SESSION_STORE_TIMEOUT_MS` | `2000`; finite positive safe integer; applies to connect and commands.             |

Invalid application configuration fails closed with generic HTTP 500 and a safe diagnostic. Never log
URLs containing credentials, signing secrets, raw cookies, ids, or record bodies. Tests inject isolated
prefixes through the store constructor; no general tenant/domain storage abstraction is needed.

## Lifecycle

```text
incoming reference → invalid/absent → validate tenant → create + expire atomically → issue cookie
                   → candidate read → validate tenant → matching live record → reuse unchanged
                                                       → unusable/mismatch → fresh create
any store operation error → controlled 503, no normal content or new cookie
invalid/unknown tenant → 403, no accepted state or new record/cookie
```

An existing foreign record is never changed, deleted, or reassigned. At expiry the reference is unusable;
Redis independently expires the key. Earlier eviction produces a fresh session. Frontend restarts reuse
records when the signing secret and Redis remain available. Simultaneous independent requests may
create independent sessions; repeated accesses inside one request may not.
