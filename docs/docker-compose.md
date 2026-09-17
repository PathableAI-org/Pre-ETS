# Docker Compose for local development

This note records how local development runs **external** services. The Next.js
app and the Effect API stay on the host (`pnpm` in each workspace). Compose
does not run those processes.

The current Compose file starts **Redis** (session store) and **Keycloak**
(local OIDC broker). Postgres remains a planned local service for persistence
work; it is not started by `compose.yaml` in this slice.

Tenant resolution uses process environment settings (host association or
static Display Name + OIDC). Session state uses Redis; see
[session-state.md](./session-state.md). OIDC behavior is described in
[authentication.md](./authentication.md). Domain persistence is described in
[domain-persistence.md](./domain-persistence.md).

## What Compose provides

The root `compose.yaml` starts Redis and Keycloak on loopback only. The
host-run frontend talks to both over the network:

- **Redis** — frontend session store and short-lived OIDC transaction keys
  (official `redis:8.2.9`)
- **Keycloak** — local OIDC broker (pinned `quay.io/keycloak/keycloak:26.7.4`,
  `start-dev`)

Pin image tags. Do not use `latest`. Local ports and credentials are for a
machine-local developer environment only; they are not production values.

Apps on the host reach Redis and Keycloak at `127.0.0.1` (or `localhost`). Do
not put the Next.js or Effect processes in the same Compose file.

## Redis

Use the official `redis` image with a pinned patch tag (`redis:8.2.9`). Publish
it on loopback only (`127.0.0.1:6379:6379`). Local development does not need a
password.

This container is the session key store described in
[session-state.md](./session-state.md) and the OIDC transaction store (separate
key prefix). The Next.js app is the only client. The Effect API does not
connect to it. Do not persist domain records or tenant configuration here.

### Start, verify, and stop

```sh
docker compose up -d --wait redis keycloak
docker compose exec redis redis-cli ping
# Expect: PONG

docker compose down
```

Never run `FLUSHALL` against a shared Redis. Tests and local cleanup must
delete only keys under the process `SESSION_KEY_PREFIX` / `OIDC_TX_KEY_PREFIX`
(or an isolated Redis DB).

Frontend session and OIDC settings live in `packages/frontend/.env.local` (see
`.env.example`). Example loopback URL: `redis://127.0.0.1:6379`. Non-local
Redis URLs require TLS (`rediss://` or equivalent) **and** authenticated ACL
credentials or mTLS.

## Keycloak

Use the official image `quay.io/keycloak/keycloak:26.7.4` with `start-dev`.
That mode is one container, no TLS, and an embedded database. It is for local
manual testing only.

Publish the HTTP port on loopback only (`127.0.0.1:8080:8080`). Set bootstrap
admin credentials through environment variables
(`KC_BOOTSTRAP_ADMIN_USERNAME`, `KC_BOOTSTRAP_ADMIN_PASSWORD`)—do not commit
passwords. Compose requires those variables to be set in the shell or a local
`.env` (gitignored) before `docker compose up`.

Documented issuer identity for both the browser and the host-run Next.js
process:

`http://127.0.0.1:8080/realms/pre-ets`

Prefer `127.0.0.1` consistently in fixtures to avoid `localhost` resolution
mismatches. After the container is up, create realm `pre-ets`, two public
OpenID Connect clients with PKCE (for example `springfield-web` and
`shelbyville-web`), distinguishable IdP aliases matching tenant
`oidc.connection` values, and valid redirect URIs for local tenant hosts from
[multi-tenancy.md](./multi-tenancy.md), for example
`http://springfield.localhost:3000/auth/callback`. Restart the frontend after
Keycloak recreate or reprovision (discovery metadata is cached for the process
lifetime).

This local broker stands in for Authentik or Keycloak in other environments.
Do not add a second local identity stack (Better Auth, Auth.js, a mock that
skips the browser login) for manual testing.

## Planned: Postgres

Use the official `postgres` image with a pinned major when persistence work
adds it. Publish it on loopback and set a local user, password, and default
database through environment variables.

One Postgres **container** is enough. Keep ownership clear with separate
databases (or schemas) in that instance:

- future frontend-owned tenant configuration (branding, copy, broker connection)
- backend-owned domain records

The Next.js app will be the only writer of durable tenant configuration. This
increment does not persist tenant Display Name in Postgres. The Effect API is
the only writer of domain data. They do not share tables. Neither uses
Postgres as a session store. Postgres is **not** started by the current
Compose file.

## Running the apps against Compose

1. Export Keycloak bootstrap admin credentials (or put them in a local Compose
   `.env`), then start services with
   `docker compose up -d --wait redis keycloak` and confirm Redis `PONG`.
2. Copy `packages/frontend/.env.example` to `.env.local` if needed; set
   `REDIS_URL`, generate `SESSION_SIGNING_SECRET`, and supply synthetic tenant
   OIDC fixtures pointing at `http://127.0.0.1:8080/realms/pre-ets`.
3. Provision the Keycloak realm/clients/IdP aliases as documented above.
4. Run the frontend (and later the backend) on the host with the workspace
   start scripts. Restart the frontend after tenant JSON, secrets, or Keycloak
   reprovision changes.

An unknown tenant host still fails closed. Compose does not create tenants; it
only provides the session store and local broker those modules use.
