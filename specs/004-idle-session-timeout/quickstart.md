# Quickstart: Idle Session Timeout Validation

Validation guide for feature `004-idle-session-timeout`. Prefer tagged Cucumber once steps are
wired; use unit/contract layers for authoritative deadline proof. This is not an implementation
walkthrough—see [plan.md](./plan.md), [data-model.md](./data-model.md), and [contracts/](./contracts/).

## Prerequisites

- Node >=24, root-pinned pnpm, Docker Compose Redis (+ Keycloak for login-again journeys)
- Synthetic tenants only; keep secrets out of git:
  - **Root** `.env` (or exported shell vars) for Compose Keycloak bootstrap:
    `KC_BOOTSTRAP_ADMIN_USERNAME` / `KC_BOOTSTRAP_ADMIN_PASSWORD` (see `compose.yaml` /
    `docs/docker-compose.md`)—required before `docker compose up … keycloak`
  - `packages/frontend/.env.local` for Next.js session / OIDC / tenant JSON vars (see
    package `.env.example`)
- Authenticated session path available (OIDC callback writing `userId` / `userName`)—required for
  US1 runtime verification
- Read contracts:
  - [tenant-idle-policy.md](./contracts/tenant-idle-policy.md)
  - [idle-expiration.md](./contracts/idle-expiration.md)
  - [inactivity-recovery.md](./contracts/inactivity-recovery.md)

## Release gates outside automated green

These do **not** block design; they block claiming SC-001 / SC-005 / delivery commitment:

1. **D-001 / FR-011**: Documented approver + risk/contract rationale for 5–30 and default 30;
   regulatory currency check
2. **D-005 / FR-012 / SC-005**: Agreed protected-op inventory expansion (if PHI workflows added),
   representative workflows, timing precision, interruption/data-loss thresholds, evidence owner
   (keep on release checklist before claiming SC-005)
3. **D-006**: Staffing / sequencing appetite confirmed

Recovery copy MAY acknowledge possible unsaved-work loss when inactivity ends the session
(product copy only—this slice has **no** draft keys to clear). Do not add extend-session UI.
Structured idle/recovery metrics are deferred (see plan Complexity / Deferred)—not a release
gate for 004.

## Start local services

```sh
pnpm install --frozen-lockfile
docker compose up -d --wait redis keycloak
docker compose exec redis redis-cli ping
pnpm dev:frontend
```

Configure tenant JSON with optional `idleTimeoutMinutes` per
[tenant-idle-policy.md](./contracts/tenant-idle-policy.md). Restart frontend after config changes.

## Validation order

1. **Unit** — `pnpm --filter @pathableai/pre-ets-frontend test:unit`\
   Policy parse bounds; idle deadline math; activity accept/reject; cause labeling; no absolute
   TTL extension on activity.

2. **Contract / HTTP** — prove denial at `idleExpiresAt` with injected clocks; late activity;
   tenant isolation; missing store ≠ inactivity claim; policy fixed at auth. Do not add public
   diagnostic UI.

3. **Browser recovery** — modal accessible name, focus trap/movement, “Log in again”, keyboard
   path, protected content removed; cancel/fail leaves access dead; IdP SSO may mint a **new**
   session only. Include: application running past deadline → modal + content cleared **without**
   requiring full navigation (client revalidation).

4. **Multi-tab** — shared cookie renews both tabs; first server-confirmed inactivity syncs
   siblings via BroadcastChannel `inactivity-confirmed` (**sessionId** + generation);
   receivers ignore foreign session ids; **both** matching-session tabs show inactivity
   explanation (not only content clear); independent session unaffected.

5. **Regression** — `pnpm test:bdd:session` and `pnpm test:bdd:oidc` remain green on the delivery
   PR after any Proxy/session touchpoints.

### Planned BDD partition

Gherkin already exists under `features/idle-session-*.feature` and
`features/tenant-idle-timeout-policy.feature` (`@idle-session-timeout`). Wire discovery similar to
OIDC (`CUCUMBER_IDLE=1` / `pnpm test:bdd:idle`) so default CI does not fail on pending stubs.

```sh
CUCUMBER_IDLE=1 pnpm test:bdd:dry
# or, once wired: pnpm test:bdd:idle -- --dry-run
# Bare `pnpm test:bdd:dry` only enables session+OIDC partitions today—do not treat it as
# idle discovery until cucumber.mjs / package.json include CUCUMBER_IDLE=1.
```

## Expected outcomes (smoke)

| Check                          | Expect                                                    |
| ------------------------------ | --------------------------------------------------------- |
| No activity for duration       | Authenticated access denied at deadline                   |
| Qualifying activity mid-window | Idle deadline moves; absolute unchanged                   |
| Polling only                   | Still expires at original idle deadline                   |
| App running past deadline      | Modal + protected content cleared without full navigation |
| Modal without idle cause       | Must not claim inactivity                                 |
| Login again                    | New session; current policy; UI state not restored        |

## PathAble UI note

Before implementing the modal, read installed
`@pathableai/react` `agent-guidance/pathable-react/SKILL.md` and
`references/server-and-client.md` (`Modal` needs a client boundary).
