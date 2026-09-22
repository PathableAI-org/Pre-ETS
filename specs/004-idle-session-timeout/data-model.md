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

| Field                  | Type                      | Rule                                                                                                                                                                                                |
| ---------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenantId`             | string                    | Canonical slug                                                                                                                                                                                      |
| `expiresAt`            | number                    | Absolute Unix seconds; Redis `EXAT` align                                                                                                                                                           |
| `accessEndedCause`     | `"inactivity"` \| omitted | Set only after confirmed idle clearance; may be cleared after first recovery UI read                                                                                                                |
| `sessionEndGeneration` | number \| omitted         | Monotonic latch for this session end; retained until the ended session’s absolute `expiresAt` (same Redis key lifetime) so missed BroadcastChannel tabs can confirm inactivity while the key exists |

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

| Field           | Type           | Rule                                                                                                 |
| --------------- | -------------- | ---------------------------------------------------------------------------------------------------- |
| `sessionId`     | string         | Existing                                                                                             |
| `tenantId`      | string         | Existing                                                                                             |
| `expiresAt`     | number         | **Existing—keep**. Absolute Unix seconds; required for `min(idleExpiresAt, expiresAt)` client timers |
| `userId`        | string \| omit | Existing authenticated presence                                                                      |
| `userName`      | string \| omit | Existing                                                                                             |
| `idleExpiresAt` | number         | **Required when authenticated** — idle half of deadline-aligned revalidation                         |

Optionally forward `idleDurationMinutes` if useful for UI; do **not** forward
`accessEndedCause`, `sessionEndGeneration`, or `lastActivityAt` on authenticated context.
Anonymous recovery forwarding (if any) is a separate recovery-shell contract—not the
authenticated context allowlist.

Implementation MUST update:

- `parseSessionContextJson` / key-count allowlist (retain `expiresAt`; add `idleExpiresAt`
  when authenticated)
- `serializeSessionContext`
- `sessionContextFromRecord`
- Unit cases: reject-unknown; accept authenticated + `expiresAt` + `idleExpiresAt`; reject
  authenticated without idle deadline when idle-aware shape is required

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

**Pinned rollout / rollback** (two-phase; dual-read alone is not a rollback target of the
pre-idle binary):

1. **Phase A — dual-read deploy**: Ship parsers/`SessionStore.read` that accept **both**
   legacy four-key and idle-shaped authenticated JSON and expose a discriminant such as
   `legacyAuthenticated: true` for the four-key shape. `setupSession.canReuse` (and any path
   that would continue authenticated access) MUST **reject** `legacyAuthenticated`—force
   reauthentication / fresh anonymous→OIDC. Do **not** yet write idle-shaped records in
   this phase (or gate writes behind a flag default-off until Phase A is proven).
2. **Phase B — idle writes**: Enable idle-shaped authenticated writes and idle enforcement.
3. **Drain window**: Keep dual-read until at least one full configured absolute TTL has
   elapsed after Phase B starts. Base the window on the **configured** session TTL
   (`SESSION_TTL_SECONDS` / `SessionConfig.ttlSeconds`), not the
   `DEFAULT_SESSION_TTL_SECONDS` constant alone—if ops lengthens TTL, extend the drain.
4. **Rollback**: During the drain window, roll back only to a **Phase A dual-read** build
   (may disable the client island / idle write flag). Rolling back to a four-key-only
   parser while idle-shaped keys remain is **explicitly one-way-unsafe** and will treat
   those records as missing (forced reauth)—document that as unsupported until drain
   completes. After drain, idle-only authenticated allowlist is allowed.
5. Cover with unit/contract cases: dual-read parses both shapes; `canReuse` false for
   legacy; idle-shaped authenticated may reuse when deadlines allow; commit-after-deadline
   renewal fails closed.

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
`BroadcastChannel` (or equivalent) with `inactivity-confirmed` **including `sessionId`
and `sessionEndGeneration`**. Receivers ignore foreign session ids. Sibling tabs may clear
protected content and open the inactivity Modal from that signal (established UI evidence
from a prior server confirmation—FR-008; not client-timer authority). Latch retained until
absolute `expiresAt`. After cookie rotation, session-mismatch handshake is required
(tombstone alone is insufficient). Latch + SSR recovery MUST NOT require every tab to
re-read a still-present string cause after the first tab consumed it.

## Temporary session data

**This slice**: the current authenticated `SessionRecord` has **no** draft / unsaved-work
keys (`types.ts` today is identity + absolute expiry only, plus the idle fields above).
Acceptance for FR-007 / recovery Gherkin that mentions “Unsent practice note” is scoped
to a **client-only protected UI fixture** in BDD steps:

1. Seed/expose the note in the authenticated UI (DOM / client state)—**not** as a Redis
   session field.
2. On confirmed inactivity, remove it from the active experience with other protected
   content.
3. Login-again MUST NOT restore it.

When real draft keys are later added to the session record, list them here and clear them
atomically in the idle-clearance CAS transition. Do not invent a Redis draft schema for
004. Durable backend/business records (e.g. Gherkin “Saved practice note”) are not session
fields and remain intact.

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
