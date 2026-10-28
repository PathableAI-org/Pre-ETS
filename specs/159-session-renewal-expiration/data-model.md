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
carry the current `EffectiveSessionPolicy`; excluded variants declare `policy?: never`, so even a previously assigned
non-literal object cannot carry policy through the excluded branch. Inputs contain no identity, provider token,
credential, HTTP object, DOM event, or raw Redis address.

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

| Current state and input                                      | Atomic transition                           | Public result                      |
| ------------------------------------------------------------ | ------------------------------------------- | ---------------------------------- |
| Missing/invalid reference                                    | None                                        | `NoUsableSession`                  |
| Malformed or non-V1 state                                    | None; validation finishes before mutation   | `SessionServiceUnavailable`        |
| Tenant-bound refresh with stored tenant mismatch             | None, regardless of the stored deadline     | `SessionTenantMismatch`            |
| Tenantless read or tenant-matching refresh at/after deadline | Delete owned key as the one final mutation  | `NoUsableSession`                  |
| Usable, excluded activity                                    | None                                        | Existing `UsableSession` unchanged |
| Usable, qualifying activity                                  | Replace deadline, warning, and TTL together | Renewed `UsableSession`            |
| Validation/preparation failure                               | None; failure occurs before mutation        | `SessionServiceUnavailable`        |
| Transport/result failure after the final mutation is issued  | Commit state may be unknown to the caller   | `SessionServiceUnavailable`        |

The new deadline is `receivedAt + idleTimeoutMinutes * 60_000`. No timeout increase is applied until a qualifying
operation succeeds; therefore an expired session cannot be revived by a later policy change. A public failure after
the final write does not promise unchanged storage: the write may have committed, the service does not retry stale
input, and a later public read determines the authoritative state.

## Concurrency invariants

- The Redis script is the linearization point for each read/expiration or refresh evaluation.
- The script validates every V1 field, constraint, version, and excess-property condition; checks tenant admission for
  tenant-bound refresh; and constructs the complete result/replacement before issuing any mutation.
- Each operation issues no mutation or exactly one final `DEL` or `SET ... PX`; it never depends on script rollback.
- A transport or result-decoding failure after that final mutation may make the committed state unknown to the caller;
  it still maps to `SessionServiceUnavailable` and never triggers an automatic stale retry.
- Every successful result represents one complete stored record; policy fields from competing candidates are never
  combined.
- After storage returns a usable record, the session parent samples Effect clock again and exposes identity only when
  the returned authoritative deadline is still in the future. The earlier receipt time remains the renewal-eligibility
  input.
- A tenant mismatch precedes expiration for tenant-bound refresh and leaves the stored value and TTL unchanged.
- When qualifying pre-deadline renewal linearizes first, later consumers may observe its new deadline.
- When expiration, missing-state removal, or another winning transition linearizes first, a stale operation does not
  recreate the key or retry its old policy.
- Independent sessions have independent keys and adopt policy only on their own successful qualifying refresh.
