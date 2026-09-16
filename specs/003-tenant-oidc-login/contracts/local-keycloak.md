# Contract: Local Keycloak Provider

Status: proposed local-development contract for FR-010–FR-012 and SC-004.

## Compose service

| Property        | Value                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------- |
| Service name    | `keycloak`                                                                                        |
| Image           | `quay.io/keycloak/keycloak:26.7.4`                                                                |
| Command         | `start-dev`                                                                                       |
| Publish         | `127.0.0.1:8080:8080`                                                                             |
| Admin bootstrap | `KC_BOOTSTRAP_ADMIN_USERNAME` / `KC_BOOTSTRAP_ADMIN_PASSWORD` via local env—not committed secrets |
| Coexistence     | Existing `redis:8.2.9` on `127.0.0.1:6379` preserved                                              |
| App processes   | Frontend/backend remain on the host—not Compose services                                          |

`docker compose up -d --wait redis keycloak` must become the documented happy path. Healthcheck must
support `--wait`.

## Issuer identity

Document a single issuer URL used by **both** the browser and the host-run Next.js process, e.g.
`http://127.0.0.1:8080/realms/pre-ets`. Prefer `127.0.0.1` consistently in fixtures to avoid
`localhost` resolution mismatches.

## Manual provisioning (minimum)

From a clean local provider state, operators create:

1. Realm `pre-ets` (name may match docs; keep synthetic).
2. Two public OpenID Connect clients with PKCE (e.g. `springfield-web`, `shelbyville-web`); tenant
   fixtures set `oidc.clientAuth` to `"public"`.
3. Valid redirect URIs for local tenant hosts, e.g.
   `http://springfield.localhost:3000/auth/callback`,
   `http://shelbyville.localhost:3000/auth/callback`, and static-mode callback on
   `http://localhost:3000/auth/callback` when exercised.
4. Distinguishable identity-provider connections / IdP entries whose aliases match tenant
   `oidc.connection` values (`springfield-idp`, `shelbyville-idp`) so Keycloak `kc_idp_hint` selects
   different login experiences (Keycloak-local mapping; other brokers may differ later).
5. At least one test user per connection as needed to recognize the login UI—**no** production
   accounts or real client records.

Automated realm import is optional; documented click-ops or CLI steps are sufficient for SC-004.

## Application fixtures

Synthetic `TENANT_CONFIG_RECORDS_JSON` / static JSON must point `issuer`, `clientId`,
`clientAuth` (`"public"` for these clients), and `connection` at the local realm.
`OIDC_CLIENT_SECRETS_JSON` stays empty for public clients. Frontend restart after fixture edits
**and** after Keycloak recreate/reprovision (in-process discovery cache is process-
lifetime; stale metadata until restart).

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
- Committing bootstrap passwords or client secrets
