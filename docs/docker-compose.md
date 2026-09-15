# Docker Compose for local development

This note records how local development runs **external** services. The Next.js
app and the Effect API stay on the host (`pnpm` in each workspace). Compose
does not run those processes.

The current Compose file starts **Redis only**. Keycloak and Postgres remain
planned local services documented below for upcoming authentication and
persistence work; they are not started by `compose.yaml` in this slice.

Tenant resolution in this increment does not use Compose services: local host
association and static Display Name configuration are process environment
settings only. Session state uses the Redis service described here; see
[session-state.md](./session-state.md). OIDC behavior is described in
[authentication.md](./authentication.md). Domain persistence is described in
[domain-persistence.md](./domain-persistence.md).

## What Compose provides

The root `compose.yaml` starts only Redis—the session store the host-run
frontend talks to over the network:

- **Redis** — frontend session store (official `redis:8.2.9`)

Pin image tags. Do not use `latest`. Local ports and credentials are for a
machine-local developer environment only; they are not production values.

Apps on the host reach Redis at `127.0.0.1` (or `localhost`). Do not put the
Next.js or Effect processes in the same Compose file.

## Redis

Use the official `redis` image with a pinned patch tag (`redis:8.2.9`). Publish
it on loopback only (`127.0.0.1:6379:6379`). Local development does not need a
password.

This container is the session key store described in
[session-state.md](./session-state.md). The Next.js app is the only client.
The Effect API does not connect to it. Do not persist domain records or
tenant configuration here.

### Start, verify, and stop

```sh
docker compose up -d --wait redis
docker compose exec redis redis-cli ping
# Expect: PONG

docker compose down
```

Never run `FLUSHALL` against a shared Redis. Tests and local cleanup must
delete only keys under the process `SESSION_KEY_PREFIX` (or an isolated Redis
DB).

Frontend session settings live in `packages/frontend/.env.local` (see
`.env.example`). Example loopback URL: `redis://127.0.0.1:6379`. Non-local
Redis URLs require TLS (`rediss://` or equivalent) **and** authenticated ACL
credentials or mTLS.

## Planned: Keycloak

Use the official image `quay.io/keycloak/keycloak` with `start-dev` when the
authentication slice adds it. That mode is one container, no TLS, and an
embedded database. It is for local manual testing only.

Publish the HTTP port on the loopback address (for example `127.0.0.1:8080`).
Set bootstrap admin credentials through environment variables
(`KC_BOOTSTRAP_ADMIN_USERNAME`, `KC_BOOTSTRAP_ADMIN_PASSWORD`).

After the container is up, create a realm, an OpenID Connect client for the
Next.js app (authorization code + PKCE), and at least one test user. Valid
redirect URIs must match the local tenant hosts from
[multi-tenancy.md](./multi-tenancy.md), for example
`http://springfield.localhost:3000/auth/callback`.

This local broker stands in for Authentik or Keycloak in other environments.
Do not add a second local identity stack (Better Auth, Auth.js, a mock that
skips the browser login) for manual testing. Keycloak is **not** started by
the current Redis-only Compose file.

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
Redis-only Compose file.

## Running the apps against Compose

1. Start Redis with `docker compose up -d --wait redis` and confirm `PONG`.
2. Copy `packages/frontend/.env.example` to `.env.local` if needed; set
   `REDIS_URL`, generate `SESSION_SIGNING_SECRET`, and keep tenant fixtures.
3. Run the frontend (and later the backend) on the host with the workspace
   start scripts.

An unknown tenant host still fails closed. Compose does not create tenants;
it only provides the session store (and, later, the broker and database)
those modules use.
