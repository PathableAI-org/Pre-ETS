# Data Model: Establish Distributed Application Sessions

## Boundary

This model is frontend-owned transient session state. It is not a durable user, tenant, authorization, or business
record. The browser holds only an opaque bearer reference; Redis holds the strict versioned record. Provider tokens,
credentials, callback parameters, and arbitrary application values are excluded. The issuer, subject, and tenant
association are sensitive transient identity metadata even when all fixtures are synthetic; their inclusion in the
server-held record does not authorize copying the encoded payload into logs, traces, errors, screenshots, or retained
verification output.

## Trusted establishment input

| Field                       | Type                                | Source                                       | Validation/meaning                                                                                        |
| --------------------------- | ----------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `identity.issuer`           | non-empty string                    | `AuthenticationService.complete`             | Already validated provider issuer; paired with subject to identify the authenticated user.                |
| `identity.subject`          | non-empty string                    | `AuthenticationService.complete`             | Already validated nonempty OIDC subject.                                                                  |
| `tenantAlias`               | non-empty tenant alias              | `AuthenticationService.complete`             | The authentication tenant already bound during callback validation.                                       |
| `policy.idleTimeoutMinutes` | integer 5–30                        | `TenantConfigService.effectiveSessionPolicy` | Already validated effective timeout, including the omitted-value default.                                 |
| `policy.warningLeadMinutes` | integer 0 through timeout minus one | `TenantConfigService.effectiveSessionPolicy` | Zero means warnings are disabled; this slice stores the effective warning policy but does not present it. |

The session service accepts these values from trusted sibling modules and does not repeat OIDC or tenant-file
validation. It validates the encoded record before persistence to prevent an invalid wire representation.

## Browser session reference

| Property            | Contract                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Representation      | 32 random bytes encoded as unpadded base64url (43 characters).                                                                             |
| Authority           | Bearer reference to server-held state; possession alone does not satisfy future request-tenant matching.                                   |
| Cookie              | `pathable-session`; `HttpOnly`; `SameSite=Lax`; `Path=/`; no `Domain`; `Secure` except the repository's explicit local-loopback allowance. |
| Prohibited contents | Identity, tenant, deadline, warning policy, provider token, credential, or telemetry identifier.                                           |
| Storage address     | `SESSION_KEY_PREFIX` plus SHA-256 digest of the reference; the raw reference is not a Redis key or telemetry value.                        |
| Invalid input       | Absent or malformed values produce the common no-usable-session result without a Redis lookup.                                             |

## Stored session record (version 1)

```ts
interface StoredSessionV1 {
  readonly idleDeadlineEpochMilliseconds: number
  readonly issuer: string
  readonly subject: string
  readonly telemetryId: string
  readonly tenantAlias: string
  readonly version: 1
  readonly warningLeadMinutes: number
}
```

### Field rules

| Field                           | Validation                                                                           | Consumer exposure                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `version`                       | Literal `1`; unknown/malformed versions are service failures, not anonymous success. | Not exposed.                                                                                                         |
| `issuer`                        | Non-empty string.                                                                    | Exposed only inside `UsableSession.identity`.                                                                        |
| `subject`                       | Non-empty string.                                                                    | Exposed only inside `UsableSession.identity`.                                                                        |
| `tenantAlias`                   | Non-empty valid alias.                                                               | Exposed only by `UsableSession`.                                                                                     |
| `idleDeadlineEpochMilliseconds` | Positive integer; must be later than the establishment clock when created.           | Exposed only by `UsableSession`; read returns no usable session at or after it.                                      |
| `warningLeadMinutes`            | Integer at least zero and strictly less than the establishment timeout.              | Exposed only by `UsableSession`; zero remains the disabled policy.                                                   |
| `telemetryId`                   | Random UUID generated independently from the browser reference.                      | Never returned by the public session result or cookie; used only as `session.id` on successful usable-session spans. |

The record has no refresh timestamp, absolute maximum lifetime, invalidation tombstone, provider token, credential,
callback evidence, authorization roles, arbitrary value map, or durable domain data.

Application code and verification tooling must treat the encoded record as opaque outside the owning session module.
Operational inspection is limited to safe metadata such as owned-key counts and TTLs, or public-result comparisons
using synthetic identities. Production Redis transport, access control, encryption, backup, and retention settings
remain deployment-owned controls; this feature neither weakens nor substitutes for them.

## Public read model

```ts
interface SessionIdentity {
  readonly issuer: string
  readonly subject: string
}

interface UsableSession {
  readonly _tag: "UsableSession"
  readonly identity: SessionIdentity
  readonly idleDeadlineEpochMilliseconds: number
  readonly tenantAlias: string
  readonly warningLeadMinutes: number
}

interface NoUsableSession {
  readonly _tag: "NoUsableSession"
}
```

`NoUsableSession` intentionally contains no identity or policy and does not promise a retained cause. Storage/decode
failures are not values of this union; they use the typed `SessionServiceUnavailable` error channel.

## State transitions

```text
trusted callback + effective policy
             |
             | SET NX PX succeeds
             v
        usable record ---------------> no usable session
             |                         (Redis TTL/missing/deleted)
             |
             +---- read before deadline ----> UsableSession
             |
             +---- read at/after deadline --> NoUsableSession

Any Redis/codec inability to determine or persist state --> SessionServiceUnavailable
```

- Creation collision retries with a newly generated reference up to the bounded implementation limit.
- A failed or ambiguous create emits no cookie. An unreachable orphan from an ambiguous write remains unusable to the
  browser and expires by TTL.
- Expiry is checked from the stored authoritative deadline even if Redis has not yet evicted the key.
- Explicit renewal and invalidation transitions are not implemented in this feature. Deletion performed by later
  invalidation work is observed here as the common no-usable-session result.

## Retention and cleanup

- Redis `PX` is derived from the validated idle interval used to create the authoritative deadline.
- Test/manual runs use unique `SESSION_KEY_PREFIX` values and remove only their owned keys.
- `FLUSHALL` is forbidden on shared Redis.
- Raw encoded records and their identity fields are not retained in test output, screenshots, logs, or trace evidence.
- The telemetry identifier expires with the record and is not retained separately by application storage. Exported
  trace retention is controlled by the configured observability system, not this session model.
