# Research: Tenant-Configurable Idle Session Timeout

Date: 2026-09-17. All planning unknowns from Technical Context and specification
dependencies D-002–D-004 are resolved below from repository evidence and the
clarified spec. Policy approval (D-001), workflow-impact thresholds (D-005), and
delivery appetite (D-006) remain **release/ops gates**, not unresolved design
choices—tracked in [plan.md](./plan.md) Complexity / dependency register.

This document records decisions for implementation; it does not claim runtime
idle behavior is already delivered.

## 1. Authoritative enforcement location

**Decision**: Enforce inactivity expiration on the **frontend-owned Redis session
record**, evaluated on every participating request that would grant or continue
authenticated access (Proxy session setup / authenticated short-circuit and any
authenticated server handlers). The server remains the **sole authority** for
`idleExpiresAt`; client timers MUST NEVER grant access past that deadline.

While authenticated UI is mounted, the client **MUST** run a **non-authoritative
revalidation** path (deadline-aligned timer and/or `visibilitychange` / `focus`
checks) that confirms inactivity with the server. Deadline alignment uses
`idleExpiresAt` from the forwarded authenticated **`SessionContext`** (and/or
confirm/read while still authenticated)—not a client-invented clock. On confirmed
inactivity: remove protected content from the active experience and open the
PathAble Modal—aligned with recovery Gherkin when access expires **while the
application is running**. Revalidation discovers and presents recovery; it does
not invent cause or extend deadlines.

On idle deadline, authenticated fields (`userId` / `userName` and idle fields)
MUST be cleared (or the record replaced with an anonymous tenant session) **before**
any protected outcome succeeds. Absolute `expiresAt` remains independently binding
(existing 86,400s default TTL / Redis `EXAT`). Idle renewal MUST NOT extend
`expiresAt`.

**Rationale**: Matches OWASP server-side idle enforcement, constitution ownership
(frontend sessions in Redis), FR-004/FR-006 (browser suspension, clocks, and late
activity cannot revive access), and FR-009 / recovery Gherkin for running-app
modal + content clear. Backend is untouched; no shared writable store.

**Alternatives considered**: Browser-only timers as sole authority (rejected—FR-004,
MDN throttling); server-only denial without client revalidation (rejected—fails
“while the application is running” recovery UX); backend token revocation (no
backend auth surface yet; out of scope); shortening Redis `EXAT` to idle duration
alone (conflates absolute lifetime with idle; breaks existing absolute-lifetime
semantics).

**Evidence**: `docs/session-state.md`; `packages/frontend/src/lib/session/*`;
assessment research S2/S5; FR-004, FR-006; constitution II.

## 2. Session record shape for idle policy

**Decision**: Extend authenticated `SessionRecord` **and** forwarded
`SessionContext` with idle-specific fields fixed at authentication time:

| Field                  | Where                         | Meaning                                                                                 |
| ---------------------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| `idleDurationMinutes`  | Redis authenticated record    | Whole minutes 5–30 copied from tenant policy at auth                                    |
| `lastActivityAt`       | Redis authenticated record    | Unix seconds of last **accepted** qualifying activity (or auth time); **server clock**  |
| `idleExpiresAt`        | Redis **and** SessionContext  | Deadline = `lastActivityAt + idleDurationMinutes * 60`; required on authenticated context |
| `accessEndedCause`     | Anonymous Redis only          | `"inactivity"` after clearance; may clear after first recovery read (see §6)            |
| `sessionEndGeneration` | Anonymous Redis only          | Replayable latch so siblings / missed BroadcastChannel are not stranded                 |

Anonymous records are `{ tenantId, expiresAt }` plus optional cause/latch after
inactivity clearance. Missing session / store miss / absolute expiry WITHOUT a
prior recorded inactivity cause MUST NOT be labeled inactivity (FR-008).

When idle expiry is detected server-side, clear authenticated + idle fields via an
**atomic** conditional Redis transition (deadline wins over concurrent heartbeats),
set cause + `sessionEndGeneration` on the anonymous record, and reject protected
operations.

**Rollout**: Legacy four-key authenticated Redis records MUST force reauthentication
on first idle-aware read (no silent soft-upgrade inventing idle fields)—see
[data-model.md](./data-model.md).

**Rationale**: Policy fixed at session creation (FR-003); shared tabs share one
Redis record so activity naturally propagates (FR-005); cause evidence is explicit
rather than inferred from key absence; forwarding `idleExpiresAt` is required for
deadline-aligned client revalidation without a public diagnostic dump.

**Alternatives considered**: Store only `lastActivityAt` and recompute deadline
each read (equivalent if duration is fixed—kept explicit `idleExpiresAt` for
clear deadline comparisons in tests); put cause only in a cookie without Redis
evidence (weaker for multi-tab consistency); delete key entirely on idle expiry
without cause (violates FR-008 labeling rules); leave SessionContext unchanged and
schedule timers only from confirm/read (rejected as sole path—SSR mount still needs
an initial deadline; confirm/read remains a refresh source after renewals).

**Evidence**: Spec entities; FR-003, FR-005, FR-008; existing `SessionRecord` /
`SessionContext` parsers in `types.ts`.

## 3. Qualifying activity and cross-tab sharing

**Decision**:

- **Qualifying**: deliberate `keydown` / pointer (`pointerdown`) / `touchstart` /
  scroll (`scroll` on document or scrollable roots) from the authenticated UI.
- **Non-qualifying**: passive reading, visibility-only events, RSC/prefetch,
  polling, automated keepalives, and protected API calls **by themselves**.
- **Reporting**: a narrow authenticated Server Action (preferred) or **POST-only**
  Route Handler with same-origin `Origin`/CSRF validation accepts activity heartbeats
  only for an **authenticated same-tenant session cookie** when server `now <
  idleExpiresAt`. Stamp activity from the **server clock** (omit client `at`). Update
  via **atomic** conditional Redis transition; updates `lastActivityAt` /
  `idleExpiresAt` without changing `expiresAt` or `idleDurationMinutes`. Reject late
  reports and lost races vs clearance (no revival / no overwrite of anonymous
  clearance). No public diagnostic route. `SameSite=Lax` alone is insufficient.
- **Debounce / coalescing**: client coalesces bursts; server MUST also coalesce or
  rate-bound renewals (indicative: ignore redundant writes within **~1s** when
  `idleExpiresAt` is unchanged—see `idle-expiration.md`). Neither client nor server
  debounce MAY create a grace period past `idleExpiresAt`. Store timeout on renewal
  fails closed (deny / no revival).
- **Tabs**: same `pathable-session` cookie → same Redis id → shared idle deadline.
  Each shared-session tab MUST run revalidation; after the first successful **server**
  confirmation of inactivity, that tab notifies same-origin siblings via
  `BroadcastChannel` (or equivalent) with an established `inactivity-confirmed`
  signal so every tab clears protected content / shows the modal promptly (see §6).
  **Server acceptance** remains authoritative. Independent cookies/devices do not
  share activity.
- **Tenant isolation**: activity handler binds to session tenant; cross-tenant
  payloads cannot renew another tenant’s session.

**Rationale**: Matches clarified FR-005 and Gherkin in
`features/idle-session-expiration.feature`.

**Alternatives considered**: Treat any authenticated request as activity
(rejected—would count polling/prefetch); client-only BroadcastChannel without
server write (fails multi-device independence and FR-004); sliding absolute TTL
on activity (rejected—FR-006).

**Evidence**: Spec FR-005/006; `features/idle-session-expiration.feature`.

## 4. Tenant inactivity policy configuration

**Decision**: Extend frontend `TenantConfig` with optional
`idleTimeoutMinutes` (integer 5–30 inclusive).

| Stored value                                                               | Behavior                                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Key omitted                                                                | Default **30** minutes for new authenticated sessions                                      |
| Integer 5–30                                                               | That duration for new authenticated sessions                                               |
| Present but invalid (fraction, `<5`, `>30`, non-integer, disable sentinel) | **Whole-source fail-fast** (`CONFIG_UNAVAILABLE`)—do not substitute default; no per-record last-known-good across a failed array parse |
| Attempt to disable                                                         | Rejected; source remains unusable until config fixed + restart                                                                         |

Persistence for this slice continues the **existing trusted process**: process
environment tenant JSON (`TENANT_CONFIG_RECORDS_JSON` /
`TENANT_LOCAL_CONFIG_JSON`), reload via restart—same model as Display Name /
OIDC. No new admin UI, roles, or Postgres writer in this feature (D-002 verified:
suitable process exists; durable Postgres tenant config remains a future
strategy increment per `docs/docker-compose.md`).

Policy changes apply only to **newly authenticated** sessions; existing sessions
retain `idleDurationMinutes` from creation.

**Rationale**: Spec FR-001–003; constitution II (frontend owns tenant config);
avoids inventing an admin app.

**Alternatives considered**: Require Postgres now (out of scope; Compose Postgres
not started); silent default on invalid explicit config (rejected—FR-003);
per-user/role overrides (out of scope).

**Evidence**: `packages/frontend/src/lib/tenant/types.ts`; `docs/multi-tenancy.md`;
`features/tenant-idle-timeout-policy.feature`.

## 5. Protected-access prerequisite (D-003)

**Decision**: For this slice, **authenticated application access** means a Redis
session with present `userId` (and `userName`) established by the existing OIDC
callback path. Protected operations under test are:

1. Proxy authenticated short-circuit / SSR of authenticated `(app)` content that
   requires `userId`.
2. Idle activity-renewal handler (must reject when expired).
3. Any subsequent frontend server path that gates on `userId` without
   re-checking idle expiry (implementation MUST centralize the check so none
   bypass it).

No independently usable access/refresh tokens are stored in Redis today
(`docs/session-state.md`); broker IdP sessions may remain and MAY satisfy
login-again without a fresh credentials challenge (FR-010)—that MUST create a
**new** application session with current policy, not revive the expired one.
**Session-id rotation**: mint a new `pathable-session` cookie / Redis key before
OIDC callback authentication; do **not** upgrade the post-clearance anonymous
record in place (today’s callback binds to `tx.sessionId`).

Backend domain authorization is out of scope; when domain PHI APIs appear, they
MUST verify broker tokens independently and MUST NOT trust Redis. This feature
does not claim backend revocation.

**Rationale**: Spec D-003 asks to enumerate protected ops; current codebase has
callback + authenticated landing, not a large PHI surface. Planning binds the
inventory to what exists so acceptance can run without absorbing a general
auth redesign.

**Alternatives considered**: Block planning until a full PHI inventory exists
(would stall a bounded frontend session feature); invent backend session
introspection (violates ownership).

**Evidence**: `docs/authentication.md`; `docs/session-state.md`;
`packages/frontend/src/lib/oidc/callback.ts`; `packages/frontend/src/proxy.ts`.

## 6. Access-ended cause and recovery modal

**Decision**:

- On **confirmed** idle expiry, set `accessEndedCause: "inactivity"` **and** a
  monotonic **`sessionEndGeneration`** on the **post-clearance anonymous** session
  record. The string cause MAY clear after the first recovery UI read; the generation
  latch remains queryable for a short retention window (or until cookie rotation) so
  siblings and tabs that missed BroadcastChannel are not stranded.
- **Cause-bearing SSR recovery route**: When the anonymous record has inactivity
  evidence, the Proxy MUST forward to an SSR recovery shell (Modal + “Log in again”)
  instead of starting generic OIDC initiation. Protected content stays denied.
  Anonymous without inactivity evidence keeps today’s OIDC redirect.
- **Multi-tab-safe cause (P1 / E1 / X1)**: The first tab that receives a successful
  **server** confirmation of inactivity MUST notify same-origin shared-session sibling
  tabs via `BroadcastChannel` (or equivalent) with `inactivity-confirmed` including
  `sessionEndGeneration`. Sibling tabs clear protected content and open the PathAble
  Modal from that sync signal (FR-008—does **not** invent inactivity from a client
  timer). Missed BroadcastChannel → re-query confirm/read or SSR recovery against the
  latch.
- Missing/evicted/unavailable store, absolute expiry without idle evidence, or
  config/process failures → recovery MUST NOT claim inactivity.
- While authenticated UI is mounted, non-authoritative client revalidation
  (deadline-aligned via forwarded `idleExpiresAt` and/or `visibilitychange` /
  `focus`; see §1) confirms inactivity with the server; on confirmation, remove
  protected content and open PathAble **`Modal`** without requiring a full
  navigation. `Modal` requires a client boundary
  (`agent-guidance/.../references/server-and-client.md`); keep page data loading
  on the server.
- Modal: accessible name/explanation that inactivity ended the session and a
  button **“Log in again”**. Copy MAY acknowledge that unsaved work was lost
  (no advance-warning / extend UI).
- “Log in again” invokes a **dedicated same-origin** action that **rotates** to a new
  `sessionId` + cookie, then starts the existing tenant OIDC initiation journey; callback
  MUST NOT authenticate into the pre-recovery `sid`. Retain a short-lived old-sid
  tombstone (or require session-mismatch handshake) so a suspended sibling is not stranded.
  Cancel/fail leaves access unusable with retry path (`/login-unavailable` or re-shown
  modal as appropriate).
- Before enabling further interaction after resume from sleep/offline, remove
  protected content from the active experience and clear temporary session
  draft fields from Redis; durable backend records untouched.

**Rationale**: FR-008–010; Principle IV; PathAble Modal guidance; recovery
Gherkin for running-app expiry and “second tab” multi-tab recovery; current proxy
cannot render Modal on anonymous document load without an explicit recovery fork.

**Alternatives considered**: Dual-path cause without a generation latch (rejected—
BroadcastChannel is non-replayable); infer inactivity from any anonymous
replacement (rejected—FR-008); optional-only client timers without mandatory
revalidation (rejected); retain string cause forever until login-again (weaker UX
for later anonymous navigations); in-place OIDC upgrade of expired `sid` (rejected—
revives expired application session); custom modal markup bypassing PathAble
(rejected—Principle IV); advance warning / extend button (out of scope).

**Evidence**: Spec US2; FR-008/010; PathAble skill Modal listing; Gherkin
`features/idle-session-recovery.feature`; `packages/frontend/src/proxy.ts`
authenticated short-circuit / OIDC initiation ordering.

## 7. Testing and time authority

**Decision**:

- **Unit**: parsers, deadline math, activity acceptance/rejection, cause labeling,
  policy bounds, session field migration.
- **Contract / HTTP**: authoritative clock injection in test doubles; prove
  denial at `idleExpiresAt`, late activity rejection, tenant isolation, policy
  fix-at-auth—without relying on real wall-clock waits where avoidable.
- **Browser (Playwright/Cucumber)**: modal name/focus/keyboard, login-again,
  multi-tab activity sharing, content removal—tag `@idle-session-timeout`.
- Wire `cucumber.mjs` / `pnpm test:bdd:idle` (or equivalent) when steps exist;
  keep default CI partitions from failing on pending stubs (same pattern as OIDC).
- Document timing precision: second-level ordering in Gherkin; no grace period
  past the deadline (FR-012 / SC-002).

**Rationale**: Constitution V; existing idle Gherkin inventory (93 expanded
cases) already drafted under `features/`.

**Alternatives considered**: Only E2E wall-clock sleeps (flaky; poor deadline
proof); public diagnostic endpoints for tests (rejected—features README).

**Evidence**: `features/README.md` idle section; constitution V.

## 8. Documentation and strategy alignment

**Decision**: Implementation updates `docs/session-state.md` (idle fields,
activity rules, cause labeling) and notes tenant optional
`idleTimeoutMinutes` in `docs/multi-tenancy.md`. Policy approval memo (FR-011)
is an operational artifact outside Spec Kit, linked from quickstart as a release
checklist item—not code.

**Rationale**: Constitution requires plans to consult strategies and resolve
conflicts; idle timeout was named a follow-up in session-state docs.

**Alternatives considered**: Leave strategies stale until after ship (rejected).
