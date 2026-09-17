# Data Model: Tenant-Configurable Idle Session Timeout

Frontend-owned. No backend domain tables. Redis holds session state; tenant
policy lives in process-environment tenant JSON until durable frontend tenant
storage exists.

## Tenant inactivity policy

Stored on `TenantConfig` (per-tenant). Not per-user, role, or device.

### `TenantConfig` extension

| Field                | Type              | Rule                                                                                        |
| -------------------- | ----------------- | ------------------------------------------------------------------------------------------- |
| `displayName`        | string            | Existing                                                                                    |
| `oidc`               | object            | Existing required OIDC block                                                                |
| `idleTimeoutMinutes` | number \| omitted | When present: safe integer, whole minutes, **5–30 inclusive**. When omitted: default **30** |

Parser rules:

- Unknown keys still rejected at `TenantConfig` / record level.
- Omitted `idleTimeoutMinutes` → effective policy **30** for **new** authenticated sessions.
- Explicit invalid values (fractional, `<5`, `>30`, non-integer, boolean/string disable, `null`) →
  configuration unusable at the trusted boundary (fail closed)—**do not** substitute 30.
- Disablement is not a representable stored value.

Effective-change rule: reading current tenant config affects only sessions authenticated
**after** the change is loaded (process restart for env JSON). Existing sessions keep the
duration fixed on their Redis record.

### Approval metadata (non-runtime)

FR-011 / SC-001 require documented provider approval and rationale for default and every
supported minute. That evidence is operational documentation, not a Redis/Postgres entity in
this slice.

## Authenticated access context (session)

### Anonymous `SessionRecord` (base + optional cause)

| Field              | Type                      | Rule                                                                                                                                                             |
| ------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenantId`         | string                    | Canonical slug                                                                                                                                                   |
| `expiresAt`        | number                    | Absolute Unix seconds; Redis `EXAT` align                                                                                                                        |
| `accessEndedCause` | `"inactivity"` \| omitted | Set only after confirmed idle clearance; **consume-once per session end** (cleared after recovery UI read)—MUST NOT strand sibling tabs (see Access-ended cause) |

### Authenticated `SessionRecord` (extended)

| Field                 | Type   | Rule                                                                |
| --------------------- | ------ | ------------------------------------------------------------------- |
| `tenantId`            | string | Canonical slug; must match cookie/host                              |
| `expiresAt`           | number | Absolute lifetime; **not** extended by activity                     |
| `userId`              | string | Nonempty; from ID token `sub`                                       |
| `userName`            | string | Nonempty display name fields per session-state docs                 |
| `idleDurationMinutes` | number | Integer 5–30 fixed at authentication from tenant effective policy   |
| `lastActivityAt`      | number | Unix seconds; auth time initially; updated on accepted activity     |
| `idleExpiresAt`       | number | `lastActivityAt + idleDurationMinutes * 60`; authoritative idle end |

### Parser allowlists (E3)

Existing `SessionRecord` parsers use strict key-count allowlists. Implementation MUST:

- Expand the **authenticated** allowlist/key-count to accept the idle fields above
- Accept anonymous records with optional `accessEndedCause` (and without idle auth fields)
- Reject unknown keys / wrong shapes as today
- Cover with unit cases: reject-unknown; accept-new idle fields; anonymous unchanged (no idle fields); anonymous + consume-once cause

Invariants:

- `idleExpiresAt <= expiresAt` is not required if absolute TTL is long; both deadlines bind
  independently—whichever is earlier ends access for its cause.
- Activity updates may move `lastActivityAt` / `idleExpiresAt` only while
  `now < idleExpiresAt` and `now < expiresAt` and `userId` present.
- Cross-tenant activity or policy MUST NOT mutate this record.

### Access-ended cause

| Value         | When set                                                       | UI claim                     |
| ------------- | -------------------------------------------------------------- | ---------------------------- |
| `inactivity`  | Server confirmed idle deadline elapsed                         | Inactivity ended the session |
| omitted/other | Missing store, absolute expiry without idle evidence, failures | MUST NOT claim inactivity    |

**Pinned storage**: `accessEndedCause` on the post-clearance **anonymous** session record only.
Consume-once clears the field after recovery UI read—**once per session end**, not once per
tab. No dual-path short-lived marker for this slice.

**Multi-tab-safe consume (P1 / E1 / X1)**: The first tab with a successful **server**
confirmation of inactivity notifies same-origin shared-session siblings via
`BroadcastChannel` (or equivalent) with an established `inactivity-confirmed` signal.
Sibling tabs may clear protected content and open the inactivity Modal from that signal
(established UI evidence from a prior server confirmation—FR-008; not client-timer
authority). Consume-once MUST NOT require every tab to re-read a still-present Redis cause
after the first tab consumed it.

## Temporary session data

Any frontend-owned draft / unsaved work fields on the session (present or future) are cleared
when authenticated access ends for inactivity. Durable backend/business records are not session
fields and remain intact. This slice does not introduce a general autosave schema.

## State transitions

```text
anonymous session
  --OIDC callback success--> authenticated + idle fields initialized
  --absolute expiry / missing--> empty / new anonymous (no inactivity claim)

authenticated
  --qualifying activity (before idleExpiresAt)--> authenticated (idle deadline restarted)
  --now >= idleExpiresAt--> anonymous (+ cause inactivity); protected ops denied
  --now >= expiresAt--> session unusable / new anonymous (absolute cause; not inactivity unless also evidenced)
  --login again success--> new authenticated session with **current** tenant policy
```

Ordering: if activity report and idle deadline are concurrent, deadline wins when
`activityAt >= idleExpiresAt`. Absolute expiry remains independently binding.

## Relationships

```text
TenantConfig.idleTimeoutMinutes  --(copied at auth)-->  SessionRecord.idleDurationMinutes
Session cookie sid               --(Redis key)------>  SessionRecord
Tabs sharing cookie              --(same record)---->  shared idleExpiresAt
```
