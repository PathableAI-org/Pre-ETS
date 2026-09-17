# Implementation Plan: Tenant-Configurable Idle Session Timeout

**Branch**: `004-idle-session-timeout` | **Date**: 2026-09-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-idle-session-timeout/spec.md`
(working branch checkout: `004-idle-session-timeout-plan`).

## Summary

Add tenant-configurable authenticated **idle** expiration (whole minutes 5–30, default 30)
on the existing frontend Redis session, enforced authoritatively on the server independently of
browser timers. Qualifying deliberate interaction renews the idle deadline without extending
absolute lifetime; confirmed inactivity ends authenticated access, removes protected UI from the
active experience (this slice has **no** session draft keys), then presents an accessible
PathAble **Modal** with **“Log in again”** into the existing tenant OIDC journey. Tenant policy
extends env-based `TenantConfig`; no new admin app or backend session store.

Research decisions: [research.md](./research.md). Validation: [quickstart.md](./quickstart.md).
Contracts: [contracts/](./contracts/). Data shapes: [data-model.md](./data-model.md).
Do **not** treat this plan as implementation complete—`tasks.md` is produced by `/speckit-tasks`.

## Technical Context

**Language/Version**: Strict TypeScript 6.0.x, ESM, Node >=24; pnpm 12.4.1 (repository root).

**Primary Dependencies**: Existing Next.js 16.3.5 / React 19.3.0 / `jose` / `redis` /
`openid-client` / `@pathableai/react` (`Modal` for recovery). No new auth framework, shared
session package, or backend dependency for this slice.

**Storage**: Frontend Redis session records (extended authenticated fields). Tenant
`idleTimeoutMinutes` in existing process-environment tenant JSON. No Postgres / backend tables.
Compose Redis (+ Keycloak for login-again) unchanged in role.

**Testing**: Vitest frontend unit suite; Cucumber/Playwright BDD with new `@idle-session-timeout`
partition (features already drafted). Contract/HTTP layers for authoritative clock denial;
`@browser` for modal a11y and recovery. Gherkin “Unsent practice note” is a **client-only
protected UI fixture** in step implementations (DOM clear + non-restoration)—**not** a Redis
draft key (none exist in this slice). Retain `pnpm test:bdd:session` / `pnpm test:bdd:oidc`
regression on delivery PR.

**Target Platform**: Host-run Next.js Node server; production HTTPS tenant hosts; local HTTP host
association / static mode. Redis on loopback via Compose.

**Project Type**: SSR-first web frontend with Redis sessions; backend untouched.

**Performance Goals**: Activity renewal shares existing session store timeout (default 2s) and
fails closed. Client debounce limits write rate; no new formal latency SLO. Idle enforcement
adds deadline comparisons on Proxy/setup **and** a guarded Redis re-read on protected SSR /
Server Action / Route Handler paths that treat `userId` as authenticated (same store timeout
class—not merely an in-memory comparison of forwarded context).

**Constraints**: Server authority for idle/absolute deadlines; no browser grace past
`idleExpiresAt`; activity stamped from **application clock** sampled before Redis I/O
(no client `at`); store timeout / WATCH abort cancels writes (fail closed); activity must
not extend `expiresAt`; renewal/clearance via atomic Redis CAS (deadline wins); missing
store ≠ inactivity claim; tenant isolation on policy and activity; PathAble Modal behind
justified client island only; while authenticated UI is mounted, client **MUST** schedule a
deadline-aligned timer at `min(idleExpiresAt, expiresAt)` (visibility/focus are
**supplemental** only); Proxy MUST offer a cause-bearing SSR recovery route before generic
OIDC redirect; session-end latch retained until the ended session’s absolute `expiresAt`;
BroadcastChannel `inactivity-confirmed` includes `sessionId` + generation; login-again MUST
use a dedicated CSRF-protected action that rotates `sessionId`/cookie; mounted tabs MUST
run session-mismatch handshake after rotation; POST-only + CSRF for mutating confirm and
heartbeats; confirm/5xx MUST fail closed for visible protected UI; protected accessors MUST
use guard Redis re-read; legacy four-key reads MUST surface a marker so `canReuse` rejects
them; no advance warning/extend; no new admin UI; secrets never in fixtures; update
`docs/session-state.md`, `docs/multi-tenancy.md`, and `docs/authentication.md` when behavior
ships.

**Scale/Scope**: Authenticated session idle lifecycle for participating app routes; optional
tenant policy field; recovery modal + login-again. Out of scope: HIPAA certification, general
auth redesign, backend token revocation, Postgres tenant admin, autosave product, org-wide
sign-out, per-user policies; structured idle/recovery metrics and alerting (deferred—see
Complexity Tracking).

## Constitution Check

_GATE: Evaluated before Phase 0 and re-evaluated after Phase 1 design._

| Principle                          | Pre-research assessment                                                                  | Post-design assessment and evidence                                                                                                                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Evidence-grounded specification | PASS: Clarified FR/SC; assessment decision; open D-001/D-005 called out as release gates | PASS: [research.md](./research.md) resolves enforcement, activity, policy, cause, prerequisite inventory; D-001/D-005/D-006 remain explicit non-code release gates in quickstart—not silent product invention          |
| II. Explicit ownership             | PASS: Frontend owns session, tenant config, auth orchestration, modal                    | PASS: All design under `packages/frontend` + Redis; backend untouched; no shared writable domain tables; **no** session draft keys in this slice—protected UI non-restoration only |
| III. Tenant isolation              | PASS: Host-bound sessions; cross-tenant activity forbidden                               | PASS: Contracts require tenant bind on activity/policy; cookie host-only unchanged; independent sessions stay independent                                                                                              |
| IV. Accessible SSR UI              | PASS: Modal a11y in FR-009; PathAble required                                            | PASS: PathAble `Modal` with client boundary; **required** deadline-aligned timer while mounted (+ supplemental visibility/focus); cause-bearing SSR recovery; latch; keyboard/focus/name |
| V. Meaningful behavioral tests     | PASS: Gherkin inventory exists for 004                                                   | PASS: Unit + contract clocks + `@browser` modal/recovery; no string-inventory-only a11y; timing precision documented; public test endpoints forbidden                                                                  |
| VI. Simplicity and quality         | PASS: Extends existing session/tenant modules                                            | PASS: No new framework; optional config field + session fields + activity handler + modal island; existing quality gates retained                                                                                      |

Post-design review: **gates PASS** with no constitutional exceptions. Complexity table below
records release dependencies, not principle violations.

## Project Structure

### Documentation (this feature)

```text
specs/004-idle-session-timeout/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1 validation guide
├── checklists/
│   └── requirements.md
├── contracts/
│   ├── tenant-idle-policy.md
│   ├── idle-expiration.md
│   └── inactivity-recovery.md
└── tasks.md             # Phase 2 via /speckit-tasks (NOT created here)
```

Related (already present, not rewritten by plan):

```text
features/idle-session-expiration.feature
features/idle-session-recovery.feature
features/tenant-idle-timeout-policy.feature
.specify/assessments/hipaa-idle-session-timeout/
docs/session-state.md                    # update on implement
docs/multi-tenancy.md                    # update on implement
```

### Source Code (planned changes)

```text
packages/frontend/
├── src/lib/tenant/types.ts              # optional idleTimeoutMinutes + validation
├── src/lib/session/types.ts             # SessionRecord + SessionContext idle fields; legacy shape marker
├── src/lib/session/store.ts             # atomic conditional update/clear (CAS) helpers
├── src/lib/session/setup.ts             # enforce idle; reject canReuse when legacyAuthenticated
├── src/lib/session/idle.ts              # deadline helpers / end-for-inactivity (indicative)
├── src/lib/session/guard.ts             # centralized protected-op check (Redis + idle/absolute)
├── src/lib/session/index.ts             # getRequestSession → guard-backed for protected SSR/handlers
├── src/lib/oidc/initiate.ts             # login-again action: mint new sessionId + cookie before OIDC
├── src/lib/oidc/callback.ts             # stamp idle fields on **new** sid only
├── src/proxy.ts                         # idle gate; cause-bearing recovery forward vs OIDC
├── src/app/(app)/…                      # recovery presentation wiring
├── src/app/… or route/action            # dedicated CSRF-protected login-again (not bare `/`)
├── src/components/…                     # client island: **deadline timer** + activity + Modal (+ tab sync)
└── tests/unit/                          # policy, idle math, activity CAS, context parsers, cause/latch
docs/session-state.md
docs/multi-tenancy.md
docs/authentication.md                   # initiation/callback target new sid after rotation
cucumber.mjs / package.json              # CUCUMBER_IDLE=1 + test:bdd:idle (parallel to oidc)
features/*.feature                       # already drafted; wire steps in tasks
tests/bdd/steps/                         # idle step defs (tasks phase)
```

**Structure Decision**: Keep idle timeout inside the frontend session and tenant owners beside
OIDC. Client island owns activity capture, a **required** deadline-aligned timer while
authenticated UI is mounted (visibility/focus supplemental), multi-tab UI sync, and PathAble
Modal. Proxy/setup are the **primary** request gate, but any server path that treats `userId`
as authenticated (SSR via `getRequestSession`, Server Actions, Route Handlers outside the
Proxy matcher) MUST call a centralized protected-op **guard** that re-reads Redis and
enforces `now < idleExpiresAt` and `now < expiresAt` with tenant bind—fail closed; do not
trust forwarded context alone after idle expiry. Authenticated `SessionRecord` **and**
`SessionContext` parsers MUST expand key-count allowlists for idle fields (`expiresAt`
retained; `idleExpiresAt` required when authenticated) with unit coverage; dual-read MUST
surface `legacyAuthenticated` so `canReuse` rejects legacy four-key records; store updates
MUST be atomic vs clearance using application `nowSeconds` sampled before I/O (abort on
store timeout—not Redis `TIME`); login-again MUST rotate session id via a dedicated
CSRF-protected action with session-mismatch handshake for siblings. See
[data-model.md](./data-model.md). Backend package unchanged.

## Complexity Tracking

> Release / sequencing dependencies—not constitution violations.

| Item                                  | Why needed                                                                                                          | Simpler alternative rejected because                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| D-001 policy approval memo            | FR-011 / SC-001 require documented rationale before release claims                                                  | Coding defaults alone cannot satisfy approval evidence                                        |
| D-005 validation thresholds           | SC-005 / FR-012 need agreed workflows and interruption thresholds                                                   | Gherkin coverage alone does not set acceptable data-loss thresholds                           |
| D-006 delivery appetite               | Feasibility unknown at assessment                                                                                   | Plan must not imply a committed schedule                                                      |
| Client activity + revalidation island | Deliberate DOM events and running-app recovery (FR-009) need client duties; timers never grant past `idleExpiresAt` | Server-only denial without revalidation fails “while application is running” recovery Gherkin |
| Env JSON policy (not Postgres)        | Existing trusted config process (D-002); Postgres tenant store not started                                          | Building admin+Postgres now expands scope beyond Option B session feature                     |

### Deferred (later slice)

**Observability (P8 / E11)**: Structured metrics and alerting for idle expiry, recovery-modal
completion, and login-again success are **out of scope for 004** and deferred to a later slice.
Do not treat an observability sketch as in-scope implementation work for this feature.

## Dependency register (from spec)

| ID    | Planning disposition                                                                                |
| ----- | --------------------------------------------------------------------------------------------------- |
| D-002 | **Resolved**: continue env tenant JSON + restart; no new admin surface                              |
| D-003 | **Resolved for slice**: protected ops = authenticated session-gated frontend paths; see research §5 |
| D-004 | **Resolved**: Redis + Proxy/setup enforcement; app clock; see research §1                           |
| D-001 | Release gate—document before policy release approval                                                |
| D-005 | Release/validation gate—agree before claiming SC-005                                                |
| D-006 | Delivery commitment gate—outside this plan                                                          |
