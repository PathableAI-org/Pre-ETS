# Implementation Plan: Tenant-Configurable Idle Session Timeout

**Branch**: `004-idle-session-timeout` | **Date**: 2026-09-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-idle-session-timeout/spec.md`
(working branch checkout: `004-idle-session-timeout-plan`).

## Summary

Add tenant-configurable authenticated **idle** expiration (whole minutes 5–30, default 30)
on the existing frontend Redis session, enforced authoritatively on the server independently of
browser timers. Qualifying deliberate interaction renews the idle deadline without extending
absolute lifetime; confirmed inactivity clears authenticated access and temporary drafts, then
presents an accessible PathAble **Modal** with **“Log in again”** into the existing tenant OIDC
journey. Tenant policy extends env-based `TenantConfig`; no new admin app or backend session
store.

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
`@browser` for modal a11y and recovery. Retain `pnpm test:bdd:session` / `pnpm test:bdd:oidc`
regression on delivery PR.

**Target Platform**: Host-run Next.js Node server; production HTTPS tenant hosts; local HTTP host
association / static mode. Redis on loopback via Compose.

**Project Type**: SSR-first web frontend with Redis sessions; backend untouched.

**Performance Goals**: Activity renewal shares existing session store timeout (default 2s) and
fails closed. Client debounce limits write rate; no new formal latency SLO. Idle enforcement adds
one deadline comparison on authenticated participating requests.

**Constraints**: Server authority for idle/absolute deadlines; no browser grace past
`idleExpiresAt`; activity must not extend `expiresAt`; missing store ≠ inactivity claim; tenant
isolation on policy and activity; PathAble Modal behind justified client island only; while
authenticated UI is mounted, client MUST run non-authoritative revalidation (deadline-aligned
and/or `visibilitychange`/`focus`); first successful **server** inactivity confirmation notifies
same-origin shared-session siblings via `BroadcastChannel` (or equivalent)
`inactivity-confirmed` so siblings clear content / open Modal without needing a still-present
Redis `accessEndedCause` after consume-once; no advance warning/extend; no new admin UI;
secrets/credentials never in fixtures; update `docs/session-state.md` / `docs/multi-tenancy.md`
when behavior ships.

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
| II. Explicit ownership             | PASS: Frontend owns session, tenant config, auth orchestration, modal                    | PASS: All design under `packages/frontend` + Redis; backend untouched; no shared writable domain tables; drafts cleared in Redis only                                                                                  |
| III. Tenant isolation              | PASS: Host-bound sessions; cross-tenant activity forbidden                               | PASS: Contracts require tenant bind on activity/policy; cookie host-only unchanged; independent sessions stay independent                                                                                              |
| IV. Accessible SSR UI              | PASS: Modal a11y in FR-009; PathAble required                                            | PASS: PathAble `Modal` with documented client boundary; required non-authoritative revalidation drives clear + Modal while app is running; server owns cause/`idleExpiresAt`; keyboard/focus/name in recovery contract |
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
├── src/lib/session/types.ts             # authenticated idle fields + parsers (expand key allowlists)
├── src/lib/session/store.ts             # update/clear helpers as needed
├── src/lib/session/setup.ts             # enforce idle on reuse/authenticated paths
├── src/lib/session/idle.ts              # deadline helpers / end-for-inactivity (indicative)
├── src/lib/oidc/callback.ts             # stamp idle fields at authentication
├── src/proxy.ts                         # authenticated path respects idle expiry + cause
├── src/app/(app)/…                      # recovery presentation wiring
├── src/components/…                     # client island: activity + revalidation + Modal (+ tab sync)
└── tests/unit/                          # policy, idle math, activity, cause, parser allowlists
docs/session-state.md
docs/multi-tenancy.md
cucumber.mjs / package.json              # idle BDD partition when steps wired
features/*.feature                       # already drafted; wire steps in tasks
tests/bdd/steps/                         # idle step defs (tasks phase)
```

**Structure Decision**: Keep idle timeout inside the frontend session and tenant owners beside
OIDC. Client island owns activity capture, **required** non-authoritative deadline
revalidation (while authenticated UI is mounted), multi-tab UI sync, and PathAble Modal;
Proxy/setup remain the authoritative gate and sole source of `idleExpiresAt`. Authenticated
`SessionRecord` parsers MUST expand key-count allowlists for idle fields with unit coverage
(reject-unknown / accept-new idle fields / anonymous unchanged)—see [data-model.md](./data-model.md).
Backend package unchanged.

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
