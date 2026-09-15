# Data Model: Set Up a Session

## Session record (frontend-owned)

Production Redis key: `pre-ets:session:<sid>`. Tests and spawned frontend processes use a unique isolated
prefix via `SESSION_KEY_PREFIX` (or a dedicated Redis logical database); never `FLUSHALL`.

| Field       | Type    | Rule                                                                                                                                                      |
| ----------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenantId`  | string  | Existing canonical tenant slug; immutable; must match validated current tenant and cookie.                                                                |
| `expiresAt` | integer | Unix seconds from the application clock; strictly later than current time; equals cookie `exp`; passed as Redis `EXAT`. Redis clock skew is cleanup-only. |

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

Request-scoped value `{ sessionId, tenantId, expiresAt }` crosses Proxy → SSR in
`x-pathable-session-context` after stripping any caller value (and stripping/overwriting every
`x-preets-tenant-*` name still in use). Do **not** place `tenantConfig` / Display Name in headers.

The server-only reader validates the bounded fields and loads `tenantConfig` through the existing
tenant source using `tenantId`, exposing one immutable snapshot (including config) to repeated
consumers for the request. Missing/malformed context is a failure, never a trigger for another setup
or host interpretation. `AppLayout` consumes this accessor as the session-aware application gate.

## Configuration

| Setting                    | Default / validation                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REDIS_URL`                | Required server-only URL. Plain `redis://` only for loopback/local Compose (example `redis://127.0.0.1:6379`). Non-local targets require TLS (`rediss://` or equivalent). |
| `SESSION_SIGNING_SECRET`   | Required base64url encoding of at least 32 random bytes; no committed default. Parsed lazily at request/use time, not at module import.                                   |
| `SESSION_TTL_SECONDS`      | `86400`; finite positive safe integer, representable resulting date, and strictly greater than `SESSION_STORE_TIMEOUT_MS` (with margin to finish setup before `exp`).     |
| `SESSION_STORE_TIMEOUT_MS` | `2000`; finite positive integer within the Node timer-safe range; applies to connect and commands. Reject values that would clamp or overflow.                            |
| `SESSION_KEY_PREFIX`       | Optional; production default `pre-ets:session:`. Tests/CI set a unique prefix (or use an isolated Redis DB) for process fixtures; cleanup deletes only that namespace.    |

Invalid application configuration fails closed with generic HTTP 500 and a safe diagnostic at request
time. Clean-checkout `pnpm build` / `pnpm typecheck` must succeed without these secrets present.
Never log URLs containing credentials, signing secrets, raw cookies, ids, or record bodies. Unit tests
may also inject prefixes through the store constructor; HTTP/BDD fixtures must use the env/DB mechanism
above. No general tenant/domain storage abstraction is needed.

## Lifecycle

```text
incoming reference → invalid/absent → validate tenant (mode-aware) → create + expire atomically → issue cookie
                   → candidate read → validate tenant → matching live record → reuse unchanged
                                                       → unusable/mismatch → fresh create
any store operation error → controlled 503, no normal content or new cookie
invalid/unknown tenant → 403, no accepted state or new record/cookie
expiresAt not safely after setup → fail creation, no cookie
```

An existing foreign record is never changed, deleted, or reassigned. At expiry the reference is unusable;
Redis independently expires the key (subject to server-clock skew). Earlier eviction produces a fresh
session. Frontend restarts reuse records when the signing secret and Redis remain available. Simultaneous
independent requests may create independent sessions; repeated accesses inside one request may not.
