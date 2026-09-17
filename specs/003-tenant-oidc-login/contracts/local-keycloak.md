# Contract: Local Keycloak Provider

Status: local-development contract for FR-010–FR-012 and SC-004.

## Compose service

| Property        | Value                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------- |
| Service name    | `keycloak`                                                                                        |
| Image           | `quay.io/keycloak/keycloak:26.7.4`                                                                |
| Command         | `start-dev --import-realm`                                                                        |
| Publish         | `127.0.0.1:8080:8080`                                                                             |
| Realm import    | Tracked `docker/keycloak/pre-ets-realm.json` mounted at `/opt/keycloak/data/import/`              |
| Admin bootstrap | Defaults `admin` / `admin`; override via `KC_BOOTSTRAP_ADMIN_*` (shell or gitignored root `.env`) |
| Coexistence     | Existing `redis:8.2.9` on `127.0.0.1:6379` preserved                                              |
| App processes   | Frontend/backend remain on the host—not Compose services                                          |

`docker compose up -d --wait redis keycloak` is the documented happy path. Healthcheck must support
`--wait`. Import applies when realm `pre-ets` is absent; recreate the Keycloak container after editing
the JSON.

## Issuer identity

Document a single issuer URL used by **both** the browser and the host-run Next.js process:

`http://127.0.0.1:8080/realms/pre-ets`

Prefer `127.0.0.1` consistently in fixtures to avoid `localhost` resolution mismatches.

## Imported provisioning (minimum)

The tracked realm JSON must provide:

1. Realm `pre-ets` with `sslRequired: none` for loopback HTTP.
2. Two public OpenID Connect clients with PKCE S256 (`springfield-web`, `shelbyville-web`); tenant
   fixtures set `oidc.clientAuth` to `"public"`.
3. Valid redirect URIs for static mode (`http://localhost:3000/auth/callback`) and host mode
   (`http://springfield.localhost:3000/auth/callback`, `http://shelbyville.localhost:3000/auth/callback`).
4. At least one local test user (`demo` / `demo`) so the built-in login UI is recognizable—**no**
   production accounts or real client records.

Optional Identity Provider aliases (`springfield-idp`, `shelbyville-idp`) for `kc_idp_hint` are **not**
required for the default static path. Omit tenant `oidc.connection` unless those IdPs are added.

## Application fixtures

Simplest local path: `TENANT_RESOLUTION=static` with `TENANT_LOCAL_CONFIG_JSON` pointing
`issuer` / `clientId` / `clientAuth: "public"` at the imported realm (see
`packages/frontend/.env.example`). Host-mode `TENANT_CONFIG_RECORDS_JSON` remains available for
two-tenant checks. `OIDC_CLIENT_SECRETS_JSON` stays empty for public clients. Frontend restart after
fixture edits **and** after Keycloak recreate (in-process discovery cache is process-lifetime).

## CI vs local (E8)

CI runs `@contract` / `@http` without live Keycloak browser provider-arrival. Usable IdP arrival
(`@browser`) is local / `pnpm test:bdd:oidc` with Compose Keycloak until CI gains a Keycloak service.

## Failure demonstration

Stopping Keycloak after configuration is loaded must produce either:

- App-detectable discovery/initiation failure → `login-unavailable` (no `pathable-session` Set-Cookie),
  or
- Browser unreachable provider after redirect

Neither grants application access nor causes an automatic redirect loop. Abandoning the IdP and
revisiting `/` while still unauthenticated must initiate again (or fail)—not serve Display Name
landing.

## Out of scope

- Production broker deployment
- Second local IdP stack (Auth.js, Better Auth, mock skip-browser login)
- Committing production secrets (local-only admin/demo credentials in Compose defaults / realm JSON
  are intentional development fixtures)
