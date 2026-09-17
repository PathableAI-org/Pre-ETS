# Quickstart: Tenant OIDC Login Validation

## Implementation progress (2026-09-17)

- Unit suite green (`123` tests): shared `TenantConfig`+`oidc`, secrets, tx types, initiate/proxy
  contracts, config-failure taxonomy.
- Runtime: Proxy initiates on document `/` after session setup; `/auth/callback` pass-through;
  extended 403 HTML; `/login-unavailable`; `openid-client@6.8.8`; Compose Redis+Keycloak.
- Still open for acceptance green: replace pending OIDC Cucumber stubs (T017/T026/T030), finish
  001 landing Gherkin retarget (T023), and run `pnpm test:bdd:oidc` / `pnpm test:bdd:session`
  evidence (T024/T029/T034/T036–T038).

## Status and prerequisites

Validation guide for the OIDC login-initiation delivery. Prefer `pnpm test:bdd:oidc` once steps are
implemented; `pnpm test:bdd:dry` only checks discovery. Session regressions remain
`pnpm test:bdd:session`.

Use Node >=24, root-pinned pnpm, Docker Compose, and Playwright browsers from the root README. Run
from the repository root. Use only synthetic tenants and local loopback services. Keep secrets in
`packages/frontend/.env.local` (untracked).

**Rollback reminder (P6)**: if initiation errors block all first visits, revert the Proxy login-entry /
OIDC branch first; Redis/Keycloak Compose may remain. Prefer outcome-class diagnostics—never secrets,
verifiers, or tokens.

**CI vs local (E8)**: CI runs `@contract` / `@http` without live Keycloak browser provider-arrival.
Usable IdP `@browser` checks are local / `pnpm test:bdd:oidc` with Compose Keycloak until CI gains a
Keycloak service.

## Start local external services

```sh
pnpm install --frozen-lockfile
docker compose config
docker compose up -d --wait redis keycloak
docker compose exec redis redis-cli ping
```

Expect Redis `PONG` on `127.0.0.1:6379` and Keycloak on `http://127.0.0.1:8080`. Compose imports
tracked realm [`docker/keycloak/pre-ets-realm.json`](../../docker/keycloak/pre-ets-realm.json) on
first boot (see [contracts/local-keycloak.md](./contracts/local-keycloak.md)). Confirm:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:8080/realms/pre-ets/.well-known/openid-configuration
```

Copy `packages/frontend/.env.example` → `.env.local` if needed. Prefer **static** mode from the
example (`TENANT_RESOLUTION=static` + `TENANT_LOCAL_CONFIG_JSON` for `springfield-web`). Leave
`OIDC_CLIENT_SECRETS_JSON` empty. Restart the frontend after config changes **and** after Keycloak
recreate (discovery cache is process-lifetime).

```sh
pnpm dev:frontend
```

## Validation order

1. **Unit contracts** (config parse, reuse/create branch, cookie-on-failure absence, transaction
   fields, redirect URL shape, secret absence):

   ```sh
   pnpm --filter @pathableai/pre-ets-frontend test:unit
   ```

2. **Session regression** (must stay green):

   ```sh
   pnpm test:bdd:session:contract
   pnpm test:bdd:session
   ```

3. **OIDC acceptance** (HTTP + browser partitions as tagged):

   ```sh
   pnpm test:bdd:dry
   pnpm test:bdd:oidc
   ```

   Equivalent: `CUCUMBER_OIDC=1` with `@tenant-oidc-login`. Isolate Redis keys with unique
   `SESSION_KEY_PREFIX` / `OIDC_TX_KEY_PREFIX` (or DB) in spawned frontend processes.

4. **Manual two-tenant check** (SC-004):

   - Fresh browser → `http://springfield.localhost:3000/` → Springfield connection login UI (no
     Display Name landing first)
   - Fresh browser → `http://shelbyville.localhost:3000/` → Shelbyville connection login UI
   - With a presented reusable anonymous session cookie for Springfield → `/` still initiates login
     (or fails closed); **landing without login is a failure**
   - Abandon IdP mid-flow, revisit `/` while still unauthenticated → initiates again (or fails); no
     Display Name landing
   - Static mode on `http://localhost:3000/` with valid local OIDC JSON → that tenant’s login
   - Unknown host / bare localhost in host mode → HTTP 403, no login
   - Stop Keycloak → initiation failure or unreachable provider; no access; no redirect loop; no
     session cookie on app-owned failure responses

5. **Repository gates** before commit: `pnpm typecheck`, `pnpm build`, `pnpm lint`,
   `pnpm format:check`, `pnpm check:unused`. On the OIDC delivery PR, also keep
   `pnpm test:bdd:session` green after session scenarios are retargeted under initiate-or-fail
   (plan Behavioral supersession inventory / E5).

## Expected contracts to re-read

- [tenant-oidc-config.md](./contracts/tenant-oidc-config.md)
- [oidc-login-initiation.md](./contracts/oidc-login-initiation.md)
- [local-keycloak.md](./contracts/local-keycloak.md)
- [data-model.md](./data-model.md)

## Explicit non-claims

Passing this quickstart does **not** prove callback completion, authenticated sessions, logout, or
backend authorization. Those remain later features. This slice proves provider-page arrival only.
