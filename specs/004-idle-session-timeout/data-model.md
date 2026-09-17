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
- **Whole-source fail-fast** (matches current `createStaticTenantSource`): any invalid
  record in the tenant JSON array makes the **entire** tenant source unusable
  (`CONFIG_UNAVAILABLE`) until fixed and the process restarts. There is no per-record
  last-known-good retention across a failed parse.

Effective-change rule: reading current tenant config affects only sessions authenticated
**after** the change is loaded (process restart for env JSON). Existing sessions keep the
duration fixed on their Redis record.

### Approval metadata (non-runtime)

FR-011 / SC-001 require documented provider approval and rationale for default and every
supported minute. That evidence is operational documentation, not a Redis/Postgres entity in
this slice.

## Authenticated access context (session)

### Anonymous `SessionRecord` (base + optional cause / latch)

| Field                   | Type                      | Rule                                                                                                                                                                      |
| ----------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenantId`              | string                    | Canonical slug                                                                                                                                                            |
| `expiresAt`             | number                    | Absolute Unix seconds; Redis `EXAT` align                                                                                                                                 |
| `accessEndedCause`      | `"inactivity"` \| omitted | Set only after confirmed idle clearance; may be cleared after first recovery UI read                                                                                      |
| `sessionEndGeneration`  | number \| omitted         | Monotonic latch for this session end; retained for a short window (or until cookie rotation) so siblings / missed BroadcastChannel can still confirm inactivity           |

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

### Forwarded authenticated `SessionContext` (required)

Proxy / SSR forward a separate strict-shape context today (`parseSessionContextJson`,
`serializeSessionContext`, `sessionContextFromRecord`). Idle-aware authenticated SSR
MUST extend that shape—not only Redis `SessionRecord`—or authenticated pages fail closed.

| Field          | Type           | Rule                                                                                          |
| -------------- | -------------- | --------------------------------------------------------------------------------------------- |
| `sessionId`    | string         | Existing                                                                                      |
| `tenantId`     | string         | Existing                                                                                      |
| `userId`       | string \| omit | Existing authenticated presence                                                               |
| `userName`     | string \| omit | Existing                                                                                      |
| `idleExpiresAt`| number         | **Required when authenticated** — client deadline-aligned revalidation source                 |

Optionally forward `idleDurationMinutes` if useful for UI; do **not** forward
`accessEndedCause`, `sessionEndGeneration`, or `lastActivityAt` on authenticated context.
Anonymous recovery forwarding (if any) is a separate recovery-shell contract—not the
authenticated context allowlist.

Implementation MUST update:

- `parseSessionContextJson` / key-count allowlist
- `serializeSessionContext`
- `sessionContextFromRecord`
- Unit cases: reject-unknown; accept authenticated + `idleExpiresAt`; reject authenticated
  without idle deadline when idle-aware shape is required

### Parser allowlists (E3)

Existing `SessionRecord` parsers use strict key-count allowlists. Implementation MUST:

- Expand the **authenticated** allowlist/key-count to accept the idle fields above
- Accept anonymous records with optional `accessEndedCause` / `sessionEndGeneration`
  (and without idle auth fields)
- Reject unknown keys / wrong shapes as today
- Cover with unit cases: reject-unknown; accept-new idle fields; anonymous unchanged (no idle fields); anonymous + cause/latch

### Rollout / legacy authenticated records

Pre-deployment Redis authenticated records use the legacy **four-key** shape and may remain
for up to the absolute TTL. Requiring the expanded authenticated allowlist without a policy
would parse them as missing and force anonymous replacement / OIDC.

**Pinned policy for this slice**: on first idle-aware read of a legacy authenticated record
(exactly the pre-idle four-key shape), **force reauthentication**—treat as unusable for
protected access (clear toward anonymous without inventing an inactivity claim, or replace
with a fresh anonymous tenant session). Do **not** silently invent idle fields from wall
clock without an explicit product decision to soft-upgrade. Cover with a unit/contract case
so rollout does not strand users in a parse-fail loop without a defined path.

Invariants:

- `idleExpiresAt <= expiresAt` is not required if absolute TTL is long; both deadlines bind
  independently—whichever is earlier ends access for its cause.
- Activity updates may move `lastActivityAt` / `idleExpiresAt` only while
  `now < idleExpiresAt` and `now < expiresAt` and `userId` present, using the **server clock**
  and an **atomic** conditional store transition (see idle-expiration contract).
- Cross-tenant activity or policy MUST NOT mutate this record.

### Access-ended cause

| Value         | When set                                                       | UI claim                     |
| ------------- | -------------------------------------------------------------- | ---------------------------- |
| `inactivity`  | Server confirmed idle deadline elapsed                         | Inactivity ended the session |
| omitted/other | Missing store, absolute expiry without idle evidence, failures | MUST NOT claim inactivity    |

**Pinned storage**: `accessEndedCause` on the post-clearance **anonymous** session record,
paired with `sessionEndGeneration` as the replayable latch. Clearing the string cause after
the first recovery UI read is allowed only while the generation latch still enables sibling
and missed-BroadcastChannel recovery (see [inactivity-recovery.md](./contracts/inactivity-recovery.md)).

**Multi-tab-safe consume (P1 / E1 / X1)**: The first tab with a successful **server**
confirmation of inactivity notifies same-origin shared-session siblings via
`BroadcastChannel` (or equivalent) with `inactivity-confirmed` **including
`sessionEndGeneration`**. Sibling tabs may clear protected content and open the inactivity
Modal from that signal (established UI evidence from a prior server confirmation—FR-008;
not client-timer authority). Latch + SSR recovery route MUST NOT require every tab to
re-read a still-present string cause after the first tab consumed it.

## Temporary session data

Any frontend-owned draft / unsaved work fields on the session (present or future) are cleared
when authenticated access ends for inactivity. Durable backend/business records are not session
fields and remain intact. This slice does not introduce a general autosave schema.

## State transitions

```text
anonymous session
  --OIDC callback success (new sid only)--> authenticated + idle fields initialized
  --absolute expiry / missing--> empty / new anonymous (no inactivity claim)

authenticated
  --qualifying activity (server now < idleExpiresAt; CAS ok)--> authenticated (idle restarted)
  --now >= idleExpiresAt (CAS)--> anonymous (+ cause inactivity + sessionEndGeneration)
  --now >= expiresAt--> session unusable / new anonymous (absolute cause; not inactivity unless also evidenced)
  --login again--> mint new sid + cookie; OIDC writes new authenticated record; old latch abandoned
```

Ordering: concurrent activity report and idle deadline → **deadline wins** via atomic
conditional transition (lost heartbeat MUST NOT overwrite anonymous clearance). Absolute
expiry remains independently binding.

## Relationships

```text
TenantConfig.idleTimeoutMinutes  --(copied at auth)-->  SessionRecord.idleDurationMinutes
Session cookie sid               --(Redis key)------>  SessionRecord
Tabs sharing cookie              --(same record)---->  shared idleExpiresAt
Authenticated SessionContext     --(forwards)------->  idleExpiresAt for client timers
```
