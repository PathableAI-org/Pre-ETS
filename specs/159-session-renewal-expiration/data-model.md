# Data Model: Renew and Expire Authoritative Sessions

## Public transient values

### QualifyingSessionActivity

A closed semantic category presented by a trusted downstream adapter:

- `deliberate-page-request`
- `deliberate-form-submission`
- `intentional-control-activation`
- `keyboard-interaction`
- `text-entry`
- `touch-interaction`
- `user-driven-meaningful-input-focus`
- `continue-session`

Every category may renew only when its server receipt time is strictly before the stored deadline.

### ExcludedSessionActivity

- `automatic-polling`
- `unrelated-background-traffic`
- `raw-pointer-movement`
- `programmatic-focus`

These categories may observe the current public outcome but never write, extend a deadline, or adopt policy.

### RefreshSessionForTenantInput

All variants carry an optional opaque session reference and the selected `TenantAlias`. Qualifying variants also
carry the current `EffectiveSessionPolicy`; excluded variants structurally cannot carry policy. Inputs contain no
identity, provider token, credential, HTTP object, DOM event, or raw Redis address.

## Existing validated values

### EffectiveSessionPolicy

| Field                | Meaning                                                | Validation owner                                  |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| `idleTimeoutMinutes` | Duration used to compute a successful refresh deadline | `TenantConfigService` private configuration child |
| `warningLeadMinutes` | Warning policy stored with the refreshed session       | `TenantConfigService` private configuration child |

The tenant schema accepts integral timeout values from 5 through 30 minutes and an integral warning value at least
zero and strictly less than the effective timeout. Existing defaults remain 30/5, except a five-minute timeout defaults
to a zero-minute warning. The session service consumes only the validated effective value.

### StoredSessionV1

| Field                           | Renewal behavior                                                     |
| ------------------------------- | -------------------------------------------------------------------- |
| `version: 1`                    | Unchanged                                                            |
| `issuer`, `subject`             | Unchanged identity                                                   |
| `tenantAlias`                   | Compared with input before mutation; unchanged                       |
| `telemetryId`                   | Unchanged and never returned in the public model                     |
| `idleDeadlineEpochMilliseconds` | Replaced atomically after qualifying pre-deadline activity           |
| `warningLeadMinutes`            | Replaced atomically with the deadline from the same effective policy |

No migration is needed. Redis TTL is an eventual cleanup bound and is not part of the public model.

## Public outcomes

| Outcome                     | Meaning                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `UsableSession`             | Complete tenant-bound identity, deadline, and warning policy from one authoritative stored version |
| `NoUsableSession`           | Reference absent/invalid, state missing, or deadline reached; contains no identity or policy       |
| `SessionTenantMismatch`     | Selected tenant differs from the stored tenant; fieldless and non-mutating                         |
| `SessionServiceUnavailable` | Store, codec, script, or unknown-result failure; fieldless and fail-closed                         |

## State transitions

| Current state and input                 | Atomic transition                           | Public result                      |
| --------------------------------------- | ------------------------------------------- | ---------------------------------- |
| Missing/invalid reference               | None                                        | `NoUsableSession`                  |
| Stored deadline `<= receivedAt`         | Delete owned key if present                 | `NoUsableSession`                  |
| Usable, tenant mismatch                 | None                                        | `SessionTenantMismatch`            |
| Usable, excluded activity               | None                                        | Existing `UsableSession` unchanged |
| Usable, qualifying activity             | Replace deadline, warning, and TTL together | Renewed `UsableSession`            |
| Malformed state or store/script failure | None or Redis atomic rollback               | `SessionServiceUnavailable`        |

The new deadline is `receivedAt + idleTimeoutMinutes * 60_000`. No timeout increase is applied until a qualifying
operation succeeds; therefore an expired session cannot be revived by a later policy change.

## Concurrency invariants

- The Redis script is the linearization point for each read/expiration or refresh evaluation.
- Every successful result represents one complete stored record; policy fields from competing candidates are never
  combined.
- When qualifying pre-deadline renewal linearizes first, later consumers may observe its new deadline.
- When expiration, missing-state removal, or another winning transition linearizes first, a stale operation does not
  recreate the key or retry its old policy.
- Independent sessions have independent keys and adopt policy only on their own successful qualifying refresh.
